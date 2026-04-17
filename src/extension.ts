import type { FrequencyEntry } from './frequencyProvider'
import * as vscode from 'vscode'
import { WordFrequencyProvider } from './frequencyProvider'
import { ChineseTokenizer, JiebaTokenizer, type TokenizerEngine } from './tokenizer'

const ANALYZE_COMMAND = 'wordFrequency.analyzeActiveEditor'
const HIGHLIGHT_COMMAND = 'wordFrequency.highlightTerm'
const VIEW_ID = 'wordFrequencyView'
const CONFIG_NAMESPACE = 'wordFrequency'
const IGNORE_TERMS_KEY = 'ignoreTerms'
const MAX_RESULTS_KEY = 'maxResults'
const TOKENIZER_ENGINE_KEY = 'tokenizerEngine'
const MIN_TERM_CHAR_LENGTH = 2
const MIN_TERM_COUNT = 2

export function activate(context: vscode.ExtensionContext): void {
  const provider = new WordFrequencyProvider()
  const segmentitTokenizer = new ChineseTokenizer()
  const jiebaTokenizer = new JiebaTokenizer()
  const highlightDecorationType = vscode.window.createTextEditorDecorationType({
    backgroundColor: new vscode.ThemeColor('editor.findMatchHighlightBackground'),
    border: '1px solid',
    borderColor: new vscode.ThemeColor('editor.findMatchBorder'),
  })

  const treeView = vscode.window.createTreeView(VIEW_ID, {
    treeDataProvider: provider,
    showCollapseAll: false,
  })

  context.subscriptions.push(treeView, highlightDecorationType)

  context.subscriptions.push(
    vscode.commands.registerCommand(ANALYZE_COMMAND, async () => {
      await analyzeActiveEditor(provider, segmentitTokenizer, jiebaTokenizer)
    }),
    vscode.commands.registerCommand(HIGHLIGHT_COMMAND, (term: unknown) => {
      if (typeof term !== 'string' || !term.trim()) {
        return
      }
      highlightTermInEditor(term, highlightDecorationType)
    }),
  )

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(() => {
      clearHighlightInVisibleEditors(highlightDecorationType)
    }),
    vscode.workspace.onDidCloseTextDocument(() => {
      clearHighlightInVisibleEditors(highlightDecorationType)
    }),
  )
}

export function deactivate(): void {
  // No-op. Disposables are managed by VS Code subscriptions.
}

async function analyzeActiveEditor(
  provider: WordFrequencyProvider,
  segmentitTokenizer: ChineseTokenizer,
  jiebaTokenizer: JiebaTokenizer,
): Promise<void> {
  const editor = vscode.window.activeTextEditor
  if (!editor) {
    provider.clear('未检测到活动编辑器')
    void vscode.window.showInformationMessage('请先打开并激活一个编辑器后再分析。')
    return
  }

  const text = editor.document.getText()
  if (!text.trim()) {
    provider.clear('文档为空，暂无可统计内容')
    void vscode.window.showInformationMessage('当前文档为空。')
    return
  }

  const ignoreTerms = readMergedIgnoreTerms(editor.document.uri)
  const maxResults = readMaxResults(editor.document.uri)
  const tokenizerEngine = readTokenizerEngine(editor.document.uri)
  const tokenizer = tokenizerEngine === 'jieba' ? jiebaTokenizer : segmentitTokenizer
  const counts = countFrequencies(tokenizer.tokenize(text), ignoreTerms)
  const sortedEntries = sortEntries(counts).slice(0, maxResults)

  if (sortedEntries.length === 0) {
    provider.clear('未找到可统计词条，请调整忽略词后重试')
    void vscode.window.showInformationMessage('分析完成，但没有可展示的词条。')
    return
  }

  provider.setEntries(sortedEntries)
}

function countFrequencies(tokens: readonly string[], ignoreTerms: ReadonlySet<string>): Map<string, number> {
  const counter = new Map<string, number>()

  for (const rawToken of tokens) {
    const token = normalizeTerm(rawToken)
    if (!token || getTermLength(token) < MIN_TERM_CHAR_LENGTH || ignoreTerms.has(token)) {
      continue
    }

    const current = counter.get(token) ?? 0
    counter.set(token, current + 1)
  }

  return counter
}

function sortEntries(counter: ReadonlyMap<string, number>): FrequencyEntry[] {
  return Array.from(counter.entries())
    .filter(([, count]) => count >= MIN_TERM_COUNT)
    .map(([term, count]) => ({ term, count }))
    .sort((a, b) => b.count - a.count || a.term.localeCompare(b.term, 'zh-Hans-CN'))
}

function normalizeTerm(term: string): string {
  return term.trim()
}

function getTermLength(term: string): number {
  return Array.from(term).length
}

function readMergedIgnoreTerms(uri: vscode.Uri): Set<string> {
  const config = vscode.workspace.getConfiguration(CONFIG_NAMESPACE, uri)
  const inspected = config.inspect<unknown>(IGNORE_TERMS_KEY)

  const merged = [
    ...toStringArray(inspected?.globalValue),
    ...toStringArray(inspected?.workspaceValue),
    ...toStringArray(inspected?.workspaceFolderValue),
  ]

  return new Set(
    merged
      .map(entry => normalizeTerm(entry))
      .filter(entry => entry.length > 0),
  )
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.filter((item): item is string => typeof item === 'string')
}

function readMaxResults(uri: vscode.Uri): number {
  const config = vscode.workspace.getConfiguration(CONFIG_NAMESPACE, uri)
  const value = config.get<number>(MAX_RESULTS_KEY, 300)
  if (!Number.isFinite(value)) {
    return 300
  }
  return Math.max(10, Math.floor(value))
}

function readTokenizerEngine(uri: vscode.Uri): TokenizerEngine {
  const config = vscode.workspace.getConfiguration(CONFIG_NAMESPACE, uri)
  const value = config.get<string>(TOKENIZER_ENGINE_KEY, 'segmentit')
  if (value === 'jieba') {
    return 'jieba'
  }
  return 'segmentit'
}

function highlightTermInEditor(term: string, decorationType: vscode.TextEditorDecorationType): void {
  const editor = vscode.window.activeTextEditor
  if (!editor) {
    void vscode.window.showInformationMessage('当前没有可高亮的活动编辑器。')
    return
  }

  clearHighlightInVisibleEditors(decorationType)

  const ranges = findAllRanges(editor.document, term)
  editor.setDecorations(decorationType, ranges)

  if (ranges.length === 0) {
    void vscode.window.showWarningMessage(`未在当前文档中找到「${term}」。`)
    return
  }

  editor.revealRange(ranges[0], vscode.TextEditorRevealType.InCenterIfOutsideViewport)
}

function clearHighlightInVisibleEditors(decorationType: vscode.TextEditorDecorationType): void {
  for (const editor of vscode.window.visibleTextEditors) {
    editor.setDecorations(decorationType, [])
  }
}

function findAllRanges(document: vscode.TextDocument, term: string): vscode.Range[] {
  const ranges: vscode.Range[] = []
  const text = document.getText()
  if (!text || !term) {
    return ranges
  }

  const pattern = new RegExp(escapeRegExp(term), 'g')
  let match = pattern.exec(text)

  while (match) {
    if (match[0].length === 0) {
      pattern.lastIndex += 1
      match = pattern.exec(text)
      continue
    }

    const start = document.positionAt(match.index)
    const end = document.positionAt(match.index + match[0].length)
    ranges.push(new vscode.Range(start, end))
    match = pattern.exec(text)
  }

  return ranges
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
