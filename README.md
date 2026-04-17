# Chinese Word Frequency (VS Code Extension)

在 Explorer 下新增“词频分析”面板，点击面板标题按钮即可分析当前活动编辑器内容的词频，结果格式为：

```text
字词 - 123
```

点击任一词条会在当前编辑器中高亮该词的所有匹配。

## 功能

- Explorer 下新增面板：`词频分析`
- 标题按钮触发分析：`Analyze Active Editor`
- 中文分词：基于 `segmentit`
- 词频结果按出现次数降序排列
- 点击词条高亮全文匹配
- 支持忽略词配置（User + Workspace + Workspace Folder 自动合并去重）

## 配置

### `wordFrequency.ignoreTerms`

- 类型：`string[]`
- 说明：忽略词列表，一项就是一个词（可理解为一行一个）
- 合并规则：`User + Workspace + Workspace Folder` 三者并集，自动 `trim` 和去重

示例：

```json
{
  "wordFrequency.ignoreTerms": [
    "的",
    "了",
    "以及"
  ]
}
```

### `wordFrequency.maxResults`

- 类型：`number`
- 默认：`300`
- 说明：面板最多展示多少条词频结果

## 本地开发

```bash
npm install
npm run compile
```

然后在 VS Code 中按 `F5` 启动 `Extension Development Host` 验证：

1. 打开一篇中文文档并聚焦编辑器
2. 在 Explorer 的“词频分析”点击分析按钮
3. 检查结果是否按降序显示为 `字词 - 次数`
4. 点击词条确认编辑器高亮

