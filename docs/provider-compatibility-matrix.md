# Provider 兼容性与核验边界

本文档说明当前代码路径与验证边界，不把未附真实运行记录的 provider 结果写成已验证事实。真实 provider 记录必须由负责人实际执行后写入 [demo-assets/real-provider-verification.md](demo-assets/real-provider-verification.md)。

## 当前 provider 状态

- 产品实现 OpenAI-compatible provider 路径。生产配置使用 `OPENAI_API_KEY`，并可选设置 `OPENAI_BASE_URL` 和 `OPENAI_MODEL`。
- CLI 无 `OPENAI_API_KEY` 且未传 `--mock` 时会报配置错误并返回退出码 `2`，不会静默回退到 mock。
- `--mock` 是 CLI 的显式离线结构验证模式，不代表真实 LLM 判断、端点兼容性或网络调用结果。
- 演示资产只有在真实执行并归档后才会标记为已验证。

## 运行路径

| 路径 | 模式 | 当前状态 | 边界 | 后续动作 |
| --- | --- | --- | --- | --- |
| CLI | 本地演示模式 | 可用于流程检查 | `--mock` 生成样例数据。无 key 且未传 `--mock` 时为配置错误，退出码 `2`。 | 可作为离线流程演示。 |
| CLI | OpenAI-compatible | 待负责人核验 | 真实端点和模型结果不能由 mock 推导。 | 按核验模板实际执行并记录。 |
| desktop GUI | 本地演示模式 | 可用于流程检查 | 不代表真实 LLM 判断。 | 可作为离线 GUI 演示。 |
| desktop GUI | OpenAI-compatible | 待负责人核验 | 缺少 API key 时不得静默回退到 mock。 | 实际配置、运行并保存材料。 |
| packaged GUI | 不触达 LLM 的 smoke | 待负责人核验 | 壳 smoke 或 GUI smoke 不证明真实 provider 分析已经运行。 | 实际打包及 GUI smoke 后记录。 |

## 如何选择模式

| 目标 | 模式 | 执行方式 |
| --- | --- | --- |
| 离线验证需求拆解、文件选择、JSON 或 HTML 输出 | 本地演示模式 | CLI 明确传 `--mock`。 |
| 展示真实 LLM 判断 | OpenAI-compatible | 先完成真实 provider 核验，再引用实际生成材料。 |
| 展示真实 GUI | OpenAI-compatible 或 mock | 单独记录 GUI 操作，不能用 CLI 或 shell smoke 替代。 |
| 展示打包制品 | packaged GUI | 单独完成打包和 GUI smoke，不能据此宣称真实 provider 已运行。 |

## 已知配置与退出语义

| 情况 | 当前行为 | 核验结论 |
| --- | --- | --- |
| `OPENAI_API_KEY` 缺失且未传 `--mock` | CLI 配置错误，退出码 `2` | 传 `--mock` 做离线结构验证，或在生产配置设置 key。 |
| `--rules` 或 `--html` 报告含 `unfulfilled`、`suspicious-fake-implementation`、`extra-scope` | 退出码 `1` | 输出文件存在不等于报告结论为成功。 |
| `--rules` 或 `--html` 报告含 `partial` 或 `insufficient-evidence` | 默认退出码 `1`，加 `--partial-ok` 后为 `0` | 退出码语义与报告结论绑定。 |
| 真实端点的 strict 或 `response_format` 行为 | 取决于实际端点 | 记录真实配置和结果，不预设兼容结论。 |

## 产品边界

1. DoneCheck 目前提供 OpenAI-compatible provider 接口路径。具体 provider 品牌不是产品内建功能，也不应写入 GUI 或 CLI 默认文案。
2. mock 只保证确定性结构路径，不保证真实判断质量。
3. 真实 provider、Electron shell smoke、完整 GUI smoke 和人工 GUI 演示是不同证据，不能互相替代。
4. 真实核验完成前，不能在提交材料中写入预设退出码、session 标识、provider 返回内容、截图路径或报告结论。

可复现命令与真实 provider 待填写字段位于 [demo-assets/real-provider-verification.md](demo-assets/real-provider-verification.md)。实际运行后再把真实结果、退出码和已存在的资产路径写入该记录。
