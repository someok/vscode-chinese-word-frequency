import * as vscode from 'vscode'

export interface FrequencyEntry {
  readonly term: string
  readonly count: number
}

export class FrequencyItem extends vscode.TreeItem {
  constructor(public readonly entry: FrequencyEntry) {
    super(`${entry.term} - ${entry.count}`, vscode.TreeItemCollapsibleState.None)

    this.iconPath = new vscode.ThemeIcon('symbol-string')
    this.tooltip = new vscode.MarkdownString(`**${entry.term}**\n\n出现次数：${entry.count}`)
    this.command = {
      command: 'wordFrequency.highlightTerm',
      title: 'Highlight Term',
      arguments: [entry.term],
    }
  }
}

class EmptyStateItem extends vscode.TreeItem {
  constructor(message: string) {
    super(message, vscode.TreeItemCollapsibleState.None)
    this.command = undefined
  }
}

export class WordFrequencyProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<vscode.TreeItem | undefined | null | void>()
  public readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event

  private items: FrequencyItem[] = []
  private emptyMessage = '暂无数据，点击“分析”开始统计'

  public setEntries(entries: readonly FrequencyEntry[]): void {
    this.items = entries.map(entry => new FrequencyItem(entry))
    this.refresh()
  }

  public clear(message?: string): void {
    this.items = []
    if (message) {
      this.emptyMessage = message
    }
    this.refresh()
  }

  public refresh(element?: vscode.TreeItem): void {
    this.onDidChangeTreeDataEmitter.fire(element)
  }

  public getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element
  }

  public getChildren(element?: vscode.TreeItem): vscode.ProviderResult<vscode.TreeItem[]> {
    if (element) {
      return []
    }

    if (this.items.length === 0) {
      return [new EmptyStateItem(this.emptyMessage)]
    }

    return this.items
  }
}
