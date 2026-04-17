# VS Code 中文词频扩展实现清单

## 目标
- 在 Explorer（文件浏览）下新增一个面板（View）。
- 面板提供“分析”按钮，统计当前活动编辑器文章中的字词频率。
- 结果按频次降序展示，格式为：`字词 - 123`。
- 点击词条后，在编辑器中高亮该词条的全部匹配。

## 任务清单（按顺序执行）
- [x] 1. 明确 MVP 边界：仅分析当前活动编辑器文本，先支持中文场景，提供可点击高亮。
- [x] 2. 初始化 VS Code 扩展项目（TypeScript）并生成基础结构（`package.json`、`src/extension.ts`）。
- [x] 3. 在 `contributes.views` 注册 Explorer 下的新面板（例如“词频分析”）。
- [x] 4. 注册命令 `wordFrequency.analyzeActiveEditor`，并在 View 标题栏提供按钮触发分析。
- [x] 5. 实现活动编辑器文本读取：`window.activeTextEditor?.document.getText()`，并处理无编辑器场景提示。
- [x] 6. 集成中文分词组件并实现统计管线：清洗文本（空白/标点）-> 分词 -> 计数。
- [x] 7. 增加配置项 `wordFrequency.ignoreTerms`（`string[]`）：一项即一个忽略词（可在 User/Workspace 配置）。
- [x] 8. 读取并合并忽略词配置：`inspect('ignoreTerms')`，合并 `globalValue + workspaceValue + workspaceFolderValue`。
- [x] 9. 对忽略词集合做标准化与去重：`trim`、去空、`Set` 去重（必要时按配置决定是否大小写归一）。
- [x] 10. 在统计流程中应用忽略词过滤，并验证 User 与 Workspace 同词只过滤一次。
- [x] 11. 对统计结果按次数降序排序，映射为展示模型：`term`、`count`、`label(term - count)`。
- [x] 12. 使用 `TreeDataProvider` 渲染词频列表，支持刷新更新。
- [x] 13. 实现点击词条高亮：查找当前文档全部匹配并用 `TextEditorDecorationType` 高亮。
- [x] 14. 实现高亮生命周期管理：切换词条替换高亮，编辑器切换/关闭时清理装饰器。
- [x] 15. 增加边界处理：空文档、超大文档、无有效词条、分词异常时降级与提示。
- [ ] 16. 本地联调验证：`F5` 启动 Extension Development Host，逐项验证按钮、排序、格式、点击高亮、忽略词配置。（`npm run compile` 已通过，`launch/tasks` 调试配置已补齐）
- [ ] 17. 补充 README（安装、配置、用法、截图）并打包产物（`vsce package`）。（README 已完成，打包待执行）

## 配置示例
```json
{
  "wordFrequency.ignoreTerms": [
    "的",
    "了",
    "以及"
  ]
}
```
