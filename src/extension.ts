import type { FrequencyEntry } from './frequencyProvider'
import * as vscode from 'vscode'
import { WordFrequencyProvider } from './frequencyProvider'
import { ChineseTokenizer, JiebaTokenizer, type TokenizerEngine } from './tokenizer'

const ANALYZE_COMMAND = 'wordFrequency.analyzeActiveEditor'
const CLEAR_RESULTS_COMMAND = 'wordFrequency.clearResults'
const HIGHLIGHT_COMMAND = 'wordFrequency.highlightTerm'
const HIGHLIGHT_REVERSE_COMMAND = 'wordFrequency.highlightTermReverse'
const CLEAR_HIGHLIGHTS_COMMAND = 'wordFrequency.clearHighlights'
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
  lastStartOffset: number
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
    backgroundColor: 'rgba(76, 175, 80, 0.36)',
  })

  const treeView = vscode.window.createTreeView(VIEW_ID, {
    treeDataProvider: provider,
    showCollapseAll: false,
  })

  setHasResultsContext(false)
  setHasHighlightsContext(false)
  context.subscriptions.push(treeView, highlightDecorationType, activeHighlightDecorationType)

  context.subscriptions.push(
    vscode.commands.registerCommand(ANALYZE_COMMAND, async () => {
      const hasResults = await analyzeActiveEditor(provider, segmentitTokenizer, jiebaTokenizer)
      setHasResultsContext(hasResults)
    }),
    vscode.commands.registerCommand(CLEAR_RESULTS_COMMAND, () => {
      provider.clear()
      setHasResultsContext(false)
      clearAllHighlights(highlightNavigationRef, highlightDecorationType, activeHighlightDecorationType)
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
    vscode.commands.registerCommand(CLEAR_HIGHLIGHTS_COMMAND, () => {
      clearAllHighlights(highlightNavigationRef, highlightDecorationType, activeHighlightDecorationType)
    }),
  )

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(() => {
      clearAllHighlights(highlightNavigationRef, highlightDecorationType, activeHighlightDecorationType)
    }),
    vscode.workspace.onDidCloseTextDocument(() => {
      clearAllHighlights(highlightNavigationRef, highlightDecorationType, activeHighlightDecorationType)
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
): Promise<boolean> {
  const editor = vscode.window.activeTextEditor
  if (!editor) {
    provider.clear(vscode.l10n.t('No active editor detected.'))
    void vscode.window.showInformationMessage(vscode.l10n.t('Open and focus an editor before analyzing.'))
    return false
  }

  const text = editor.document.getText()
  if (!text.trim()) {
    provider.clear(vscode.l10n.t('Document is empty. Nothing to analyze.'))
    void vscode.window.showInformationMessage(vscode.l10n.t('Current document is empty.'))
    return false
  }

  const ignoreTerms = readMergedIgnoreTerms(editor.document.uri)
  const maxResults = readMaxResults(editor.document.uri)
  const tokenizerEngine = readTokenizerEngine(editor.document.uri)
  const tokenizer = tokenizerEngine === 'jieba' ? jiebaTokenizer : segmentitTokenizer
  const counts = countFrequencies(tokenizer.tokenize(text), ignoreTerms)
  const sortedEntries = sortEntries(counts).slice(0, maxResults)

  if (sortedEntries.length === 0) {
    provider.clear(vscode.l10n.t('No terms were found. Adjust ignore terms and try again.'))
    void vscode.window.showInformationMessage(vscode.l10n.t('Analysis is complete, but there are no terms to display.'))
    return false
  }

  provider.setEntries(sortedEntries)
  return true
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
    clearAllHighlights(navigationRef, decorationType, activeDecorationType)
    void vscode.window.showInformationMessage(vscode.l10n.t('There is no active editor to highlight in.'))
    return
  }

  const ranges = findAllRanges(editor.document, term)
  if (ranges.length === 0) {
    clearAllHighlights(navigationRef, decorationType, activeDecorationType)
    void vscode.window.showWarningMessage(vscode.l10n.t('Could not find "{0}" in the current document.', term))
    return
  }

  const documentKey = editor.document.uri.toString()
  const previous = navigationRef.value
  const isSameTerm
    = previous?.term === term
      && previous?.documentKey === documentKey

  const focusedEditor = await focusEditorForEditing(editor)
  if (!focusedEditor) {
    clearAllHighlights(navigationRef, decorationType, activeDecorationType)
    return
  }

  const currentIndex = resolveCurrentIndex(previous, isSameTerm, direction, ranges, focusedEditor, term)

  clearHighlightInVisibleEditors(decorationType, activeDecorationType)
  const activeRange = ranges[currentIndex]
  const inactiveRanges = ranges.filter((_, index) => index !== currentIndex)
  focusedEditor.setDecorations(decorationType, inactiveRanges)
  focusedEditor.setDecorations(activeDecorationType, [activeRange])

  navigationRef.value = {
    term,
    documentKey,
    lastStartOffset: focusedEditor.document.offsetAt(activeRange.start),
  }
  setHasHighlightsContext(true)

  activateRange(focusedEditor, activeRange)
}

function clearAllHighlights(
  navigationRef: HighlightNavigationRef,
  ...decorationTypes: vscode.TextEditorDecorationType[]
): void {
  clearHighlightInVisibleEditors(...decorationTypes)
  navigationRef.value = undefined
  setHasHighlightsContext(false)
}

function clearHighlightInVisibleEditors(...decorationTypes: vscode.TextEditorDecorationType[]): void {
  for (const editor of vscode.window.visibleTextEditors) {
    for (const decorationType of decorationTypes) {
      editor.setDecorations(decorationType, [])
    }
  }
}

function setHasHighlightsContext(value: boolean): void {
  void vscode.commands.executeCommand('setContext', 'wordFrequency.hasHighlights', value)
}

function setHasResultsContext(value: boolean): void {
  void vscode.commands.executeCommand('setContext', 'wordFrequency.hasResults', value)
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
  ranges: readonly vscode.Range[],
  editor: vscode.TextEditor,
  term: string,
): number {
  const rangeCount = ranges.length
  if (rangeCount <= 0) {
    return 0
  }

  if (!isSameTerm) {
    return direction === 'backward' ? rangeCount - 1 : 0
  }

  const selectedOffset = getSelectedTermStartOffset(editor, term)
  const anchorOffset = selectedOffset ?? previous?.lastStartOffset
  if (anchorOffset === undefined) {
    return direction === 'backward' ? rangeCount - 1 : 0
  }

  const offsets = ranges.map(range => editor.document.offsetAt(range.start))

  if (direction === 'backward') {
    for (let index = rangeCount - 1; index >= 0; index -= 1) {
      if (offsets[index] < anchorOffset) {
        return index
      }
    }
    return rangeCount - 1
  }

  const nextIndex = offsets.findIndex(offset => offset > anchorOffset)
  return nextIndex === -1 ? 0 : nextIndex
}

function getSelectedTermStartOffset(editor: vscode.TextEditor, term: string): number | undefined {
  const selection = editor.selection
  if (selection.isEmpty) {
    return undefined
  }

  const selectedText = editor.document.getText(selection)
  if (selectedText !== term) {
    return undefined
  }

  return editor.document.offsetAt(selection.start)
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
