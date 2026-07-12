# 六状态辅助 Fixture

这是 F-15 的辅助 fixture。它与严格 Todo fixture 分离，用固定的 provider-neutral 测试 provider 经由正式 `runDoneCheckPipelineNode()` 生成真实 `JudgementReport`；provider 仅提供正常的需求语义草案和候选文件，绝不构造最终状态或最终报告。

`scripts/generate-six-status-evidence.mjs` 使用这个 fixture 生成报告。规则引擎基于真实扫描到的 `localStorage` 和 `alert` 信号，以及 provider 的正常语义草案，在正式 pipeline 中产生六个最终状态。`REQ-INSUFFICIENT` 提供低置信度的有效语义草案，因此由规则得到 `weak-or-unstable-evidence`；provider 请求失败会中止分析，绝不会被转换为“证据不足”。
