import type { FrequencyEntry } from './frequencyProvider'
import * as vscode from 'vscode'
import { WordFrequencyProvider } from './frequencyProvider'
import { ChineseTokenizer, JiebaTokenizer, type TokenizerEngine } from './tokenizer'

const ANALYZE_COMMAND = 'wordFrequency.analyzeActiveEditor'
const HIGHLIGHT_COMMAND = 'wordFrequency.highlightTerm'
const HIGHLIGHT_REVERSE_COMMAND = 'wordFrequency.highlightTermReverse'
const VIEW_ID = 'wordFrequencyView'
const CONFIG_NAMESPACE = 'wordFrequency'
const IGNORE_TERMS_KEY = 'ignoreTerms'
const MAX_RESULTS_KEY = 'maxResults'
const TOKENIZER_ENGINE_KEY = 'tokenizerEngine'
const MIN_TERM_CHAR_LENGTH = 2
const MIN_TERM_COUNT = 2

type HighlightNavigationState = {
  term: string
  documentKey: string
  currentIndex: number
}

type HighlightNavigationRef = {
  value: HighlightNavigationState | undefined
}

type JumpDirection = 'forward' | 'backward'

export function activate(context: vscode.ExtensionContext): void {
  const provider = new WordFrequencyProvider()
  const segmentitTokenizer = new ChineseTokenizer()
  const jiebaTokenizer = new JiebaTokenizer()
  const highlightNavigationRef: HighlightNavigationRef = { value: undefined }
  const highlightDecorationType = vscode.window.createTextEditorDecorationType({
    backgroundColor: new vscode.ThemeColor('editor.findMatchHighlightBackground'),
    border: '1px solid',
    borderColor: new vscode.ThemeColor('editor.findMatchBorder'),
  })
  const activeHighlightDecorationType = vscode.window.createTextEditorDecorationType({
    backgroundColor: 'rgba(244, 67, 54, 0.36)',
  })

  const treeView = vscode.window.createTreeView(VIEW_ID, {
    treeDataProvider: provider,
    showCollapseAll: false,
  })

  context.subscriptions.push(treeView, highlightDecorationType, activeHighlightDecorationType)

  context.subscriptions.push(
    vscode.commands.registerCommand(ANALYZE_COMMAND, async () => {
      await analyzeActiveEditor(provider, segmentitTokenizer, jiebaTokenizer)
    }),
    vscode.commands.registerCommand(HIGHLIGHT_COMMAND, async (term: unknown) => {
      const normalizedTerm = resolveTerm(term, treeView)
      if (!normalizedTerm) {
        return
      }
      await highlightTermInEditor(
        normalizedTerm,
        'forward',
        highlightDecorationType,
        activeHighlightDecorationType,
        highlightNavigationRef,
      )
    }),
    vscode.commands.registerCommand(HIGHLIGHT_REVERSE_COMMAND, async (term: unknown) => {
      const normalizedTerm = resolveTerm(term, treeView)
      if (!normalizedTerm) {
        return
      }
      await highlightTermInEditor(
        normalizedTerm,
        'backward',
        highlightDecorationType,
        activeHighlightDecorationType,
        highlightNavigationRef,
      )
    }),
  )

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(() => {
      clearHighlightInVisibleEditors(highlightDecorationType, activeHighlightDecorationType)
      highlightNavigationRef.value = undefined
    }),
    vscode.workspace.onDidCloseTextDocument(() => {
      clearHighlightInVisibleEditors(highlightDecorationType, activeHighlightDecorationType)
      highlightNavigationRef.value = undefined
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

async function highlightTermInEditor(
  term: string,
  direction: JumpDirection,
  decorationType: vscode.TextEditorDecorationType,
  activeDecorationType: vscode.TextEditorDecorationType,
  navigationRef: HighlightNavigationRef,
): Promise<void> {
  const editor = vscode.window.activeTextEditor
  if (!editor) {
    navigationRef.value = undefined
    void vscode.window.showInformationMessage('当前没有可高亮的活动编辑器。')
    return
  }

  const ranges = findAllRanges(editor.document, term)
  if (ranges.length === 0) {
    clearHighlightInVisibleEditors(decorationType, activeDecorationType)
    navigationRef.value = undefined
    void vscode.window.showWarningMessage(`未在当前文档中找到「${term}」。`)
    return
  }

  const documentKey = editor.document.uri.toString()
  const previous = navigationRef.value
  const isSameTerm
    = previous?.term === term
      && previous?.documentKey === documentKey
  const currentIndex = resolveCurrentIndex(previous, isSameTerm, direction, ranges.length)

  const focusedEditor = await focusEditorForEditing(editor)
  if (!focusedEditor) {
    navigationRef.value = undefined
    return
  }

  clearHighlightInVisibleEditors(decorationType, activeDecorationType)
  const activeRange = ranges[currentIndex]
  const inactiveRanges = ranges.filter((_, index) => index !== currentIndex)
  focusedEditor.setDecorations(decorationType, inactiveRanges)
  focusedEditor.setDecorations(activeDecorationType, [activeRange])

  navigationRef.value = {
    term,
    documentKey,
    currentIndex,
  }

  activateRange(focusedEditor, activeRange)
}

function clearHighlightInVisibleEditors(...decorationTypes: vscode.TextEditorDecorationType[]): void {
  for (const editor of vscode.window.visibleTextEditors) {
    for (const decorationType of decorationTypes) {
      editor.setDecorations(decorationType, [])
    }
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

function activateRange(editor: vscode.TextEditor, range: vscode.Range): void {
  editor.selection = new vscode.Selection(range.start, range.end)
  editor.revealRange(range, vscode.TextEditorRevealType.InCenterIfOutsideViewport)
}

function resolveTerm(term: unknown, treeView: vscode.TreeView<vscode.TreeItem>): string | undefined {
  if (typeof term === 'string' && term.trim()) {
    return term.trim()
  }

  const selected = treeView.selection[0] as { entry?: { term?: unknown } } | undefined
  if (typeof selected?.entry?.term === 'string' && selected.entry.term.trim()) {
    return selected.entry.term.trim()
  }

  return undefined
}

function resolveCurrentIndex(
  previous: HighlightNavigationState | undefined,
  isSameTerm: boolean,
  direction: JumpDirection,
  rangeCount: number,
): number {
  if (rangeCount <= 0) {
    return 0
  }

  if (!isSameTerm) {
    return direction === 'backward' ? rangeCount - 1 : 0
  }

  const previousIndex = previous?.currentIndex ?? 0
  if (direction === 'backward') {
    return (previousIndex - 1 + rangeCount) % rangeCount
  }
  return (previousIndex + 1) % rangeCount
}

async function focusEditorForEditing(editor: vscode.TextEditor): Promise<vscode.TextEditor | undefined> {
  try {
    return await vscode.window.showTextDocument(editor.document, {
      preserveFocus: false,
      viewColumn: editor.viewColumn,
    })
  }
  catch {
    return vscode.window.activeTextEditor
  }
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
