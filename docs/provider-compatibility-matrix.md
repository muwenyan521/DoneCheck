# Provider Compatibility Matrix

> 本文档沉淀 DoneCheck 当前对不同 provider / 运行路径 / structured output 模式的真实适配经验。
> 它是事实陈述与可复现性说明，不是产品化集成承诺。Provider 品牌仅作为“已验证对象”出现在兼容说明中，不构成 DoneCheck 内建功能。
> 维护规则：品牌名只能出现在本矩阵的事实/备注列，不得进入 GUI 默认文案、CLI 文案、代码路径或产品功能命名。

## 1. 当前推荐矩阵结论

### 当前推荐 Demo 主链路

- **Provider 类型**：Generic OpenAI-compatible provider（品牌无关，通过 `OPENAI_API_KEY` / `OPENAI_BASE_URL` / `OPENAI_MODEL` 配置）
- **运行路径**：CLI、desktop GUI、packaged GUI（Linux）
- **Structured output strict**：`OPENAI_STRUCTURED_OUTPUT_STRICT=false`（GUI 设置页关闭“Structured output strict”）
- **依据**：strict=false 在当前本地 OpenAI-compatible provider 上 CLI 路径已实跑通过（exit 0、uniqueIds === judgementCount、badRefs = 0、REQ/CLAIM 齐全、real LLM 给出合理的 fulfilled/unfulfilled/suspicious 分布），且 strict=false 规避了 strict 模式下部分端点的 502/504/`.optional()` 兼容风险。

### 当前 mock 主链路

- **Provider 类型**：Deterministic mock（CLI 无 `OPENAI_API_KEY` 时自动回退；GUI 显式选择“Deterministic mock”）
- **用途**：仅用于结构验证（需求拆解、文件选择、rules JSON 输出、HTML 渲染、退出码），不代表真实 LLM 判断质量。
- **依据**：mock CLI 实跑 exit 0、uniqueIds(12) === judgementCount(12)、badRefs = 0、REQ-1..5 + CLAIM-1..6 + extra-scope 齐全。

### 当前不建议作为主 Demo 的 provider 情况

- **strict=true 且端点不完全支持 strict JSON schema** 的 OpenAI-compatible provider：可能触发 502 / 504 / `.optional()` warning / `response_format unavailable`。
- **需要 fallback 且 evidence 精度不稳定** 的 provider：fallback 路径依赖 LLM 自行返回纯 JSON，evidenceRef span 可能超出 snippet window，导致证据精度下降。
- **运行时未注入 `undici.fetch` 的 Electron main 进程**：早期 GUI 与 CLI 之间存在 provider 运行时差异，已通过 `desktop-provider` 注入 `undici.fetch` 修复；任何绕过该装配的路径不在推荐范围内。

## 2. 详细兼容矩阵

状态枚举：

- ✅ Recommended — 推荐主链路，已验证
- ⚠️ Supported with caveats — 可用但带保留
- 🧪 Experimental — 已跑通但未充分验证
- ❌ Not recommended / known incompatible — 已知不可用或不建议
- ⏸️ Not validated — 未验证（不声称支持）

| Path | Provider/mode | strict | Status | Validated by | Known caveats | Recommended use |
| --- | --- | --- | --- | --- | --- | --- |
| CLI | Deterministic mock | n/a | ✅ Recommended | Stage 8.9 mock CLI 实跑 | 只证明结构路径，不代表真实判断质量 | 离线结构验证、CI、退出码验收 |
| CLI | OpenAI-compatible | false | ✅ Recommended | Stage 8.9 real CLI 实跑（本地 OpenAI-compatible 端点，`OPENAI_STRUCTURED_OUTPUT_STRICT=false`） | 端点需兼容 `chat.completions.parse`；若端点返回 `response_format unavailable` 会触发 fallback | 真实 Demo 主链路、可复现 LLM 判断 |
| CLI | OpenAI-compatible | true | ⚠️ Supported with caveats | Stage 8.9 real CLI 实跑（本次通过） | 部分端点会触发 502/504/`.optional()` warning/`response_format unavailable`；structured-output-compat 层与 fallback repair 是缓解措施，不是保证 | 仅在确认端点完整支持 strict JSON schema 时使用 |
| desktop GUI | Deterministic mock | n/a | ✅ Recommended | `desktop-provider.test.ts`、GUI 设置页 | mock 只在显式选择 `providerMode: "mock"` 时使用，不再 silent fallback | 离线 GUI 结构验证、设置页演示 |
| desktop GUI | OpenAI-compatible | false | ✅ Recommended | Stage 8.5 desktop provider 装配 + `desktop-provider.test.ts` | 必须通过 `desktop-provider` 注入 `undici.fetch` 以保证 GUI/CLI parity；session key 优先于 env key | 本地 GUI Demo 主链路 |
| desktop GUI | OpenAI-compatible | true | ⚠️ Supported with caveats | `desktop-provider.test.ts` 装配验证（strict 透传到 `OpenAIProvider`） | 与 CLI strict=true 同样的端点兼容风险；GUI 设置页默认 `structuredOutputStrict=true`，需手动关闭 | 确认端点支持 strict 时可用 |
| packaged GUI (Linux) | n/a（smoke 不触达 LLM） | n/a | ✅ Recommended | Stage 8.7 + CI run `29025568215`（`rendererLoaded=true`、`nativeStorage=true`、structure+gui smoke PASS） | packaged smoke 不调用真实 LLM，只验证 renderer 加载与 better-sqlite3 原生存储；真实分析仍走运行时 provider 配置 | Linux 打包制品可演示 |
| packaged GUI (Windows) | n/a | n/a | ⏸️ Not validated | CI run `29025568215` 产出 NSIS `DoneCheck Desktop-0.0.0-win-x64.exe` + `win-unpacked`，但**未配置 Windows GUI smoke** | 仅验证打包链路与制品产出，未验证 Windows 上 renderer 加载 / 原生存储 / 真实分析 | 不声称 Windows 已支持；需在 Windows runner 实跑 GUI smoke 后再升级状态 |

### 备注：已验证过的具体 provider（仅作兼容事实记录，非产品内建）

下列 provider 品牌在历史开发过程中被用作“验证对象”，用于暴露兼容问题。它们不是 DoneCheck 的产品功能名，也不在 GUI/CLI 默认配置中固化：

- 一类本地 OpenAI-compatible provider（当前 Demo 主链路验证对象，`OPENAI_STRUCTURED_OUTPUT_STRICT=false` 下可用）。
- DeepSeek 路径曾暴露 `response_format unavailable` 与推理 think 标签混入 JSON，触发了 fallback / repair 适配（见 `extractJsonObject` 的 think 标签剥离与 fallback repair instruction）。
- MiniMax 路径曾暴露 `response_format unavailable`，fallback 后 evidenceRef 精度问题（如整文件 span 超出 snippet window）。

以上事实已体现在 `structured-output-compat.ts`（optional/default 转 nullable、`$schema`/`default` 剥离）、`index.ts` 的 fallback repair 路径，以及 `provider-error-ux.ts` 的错误分类中。

## 3. 如何选择 provider 模式

| 目标 | 推荐 provider/mode | 推荐 strict | 推荐 path |
| --- | --- | --- | --- |
| 只验证结构、退出码、HTML 渲染 | Deterministic mock | n/a | CLI（无 `OPENAI_API_KEY`）或 GUI（显式 mock） |
| 真正展示产品 LLM 判断价值 | OpenAI-compatible | `false` | CLI 或 GUI |
| 本地 GUI 演示 | OpenAI-compatible | `false` | desktop GUI，设置页配置 Base URL / Model / session key |
| 打包制品演示 | OpenAI-compatible | `false` | packaged GUI（Linux 已验证；Windows 仅制品未验证 GUI） |
| 端点确认支持 strict JSON schema 时 | OpenAI-compatible | `true` | CLI 或 GUI，仅在确认后开启 |

选择原则：

1. **默认用 mock 验结构**：无网络、无 key、CI 场景下用 deterministic mock 跑完整管线。
2. **真实判断用 strict=false**：strict=false 是当前最稳的真实 LLM 路径，规避 strict 模式端点兼容风险。
3. **GUI 走设置页**：通过 Settings > Provider 配置 providerMode / Base URL / Model / session key / strict，设置在下次 Analyze 时生效。
4. **打包演示用已验证配置**：packaged GUI smoke 只验证壳与原生存储，真实分析仍依赖运行时 provider 配置；Windows 打包制品未经 GUI smoke 验证，不声称支持。

## 4. 已知错误对照表

| 错误信号 | 出现路径 / provider | 当前处理方式 | 是否阻塞 Demo |
| --- | --- | --- | --- |
| `.optional()` / `.default()` compatibility warning | strict=true 下部分 OpenAI-compatible 端点 | `structured-output-compat.ts` 把 optional/default 字段在 JSON schema 中改为 nullable，并保留全部字段于 `required`；`silentZodResponseFormat` 抑制 SDK 的 `console.warn` | 否（已缓解） |
| 502 Upstream request failed | strict=true 下部分端点；fallback 触发 | provider 主路径失败后 fallback 到 `chat.completions.create`；`provider-error-ux` 分类为 `upstream-502`，建议关闭 strict | 否（fallback 兜底），但建议直接用 strict=false |
| 504 Gateway Time-out | strict=true 下部分端点 | `provider-error-ux` 分类为 `gateway-timeout`，建议 retry 或切 mock | 否，但建议关闭 strict 或换端点 |
| `response_format unavailable` | DeepSeek / MiniMax 等不支持 `response_format` 的端点 | `isUnsupportedResponseFormatError` 捕获后走 fallback 纯文本 JSON 路径；`provider-error-ux` 分类为 `response-format` | 否（fallback 兜底） |
| 推理 think 标签混入 JSON | DeepSeek 等返回带推理标签的端点 | `extractJsonObject` 用正则剥离 think 标签后再提取 JSON | 否（已修复） |
| `Premature close` | 连接被端点提前关闭 | `provider-error-ux` 分类为 `connection-closed`，建议 retry | 偶发，retry 通常可恢复 |
| EvidenceRef span 精度问题（整文件 span 超出 snippet window） | MiniMax 等 fallback 路径 | fallback instruction 明确要求“use only exact filePath, lineStart, and lineEnd ranges present in the provided evidence snippets”；Stage 8.8 已实现 `evidence-ref-normalization`：近邻匹配（lineTolerance=1、overlapRatio≥0.8）的模型引用被规范化为真实候选 snippet，超出容差或歧义匹配的引用仍被拒绝 | 不阻塞 Demo 结构；近邻行号漂移已由 8.8 规范化兜底，整文件 span 仍依赖 fallback instruction |
| `OPENAI_STRUCTURED_OUTPUT_STRICT must be one of ...` | env 值非法 | `resolveStructuredOutputStrict` 抛 `ProviderConfigError`；`provider-error-ux` 分类为 `strict-output` | 是配置错误，修正 env 即可 |
| `OpenAI-compatible mode requires an API key` | GUI openai-compatible 模式缺 key | `createDesktopProviderFactory` 显式抛错，**不** silent fallback 到 mock；`provider-error-ux` 分类为 `missing-key` | 是配置错误，输入 session key 或切 mock |
| packaged GUI smoke `ready file missing` | Linux packaged smoke（历史 CI run 曾出现） | 已通过 `--no-sandbox`（commit `a463827`）修复，最新 CI run `29025568215` PASS | 否（已修复） |
| Windows packaged GUI 未验证 | Windows | CI 仅打包并断言制品存在，未跑 GUI smoke | 不阻塞 Linux Demo；Windows 支持状态保持 ⏸️ |

## 5. 本项目对 provider 的承诺边界

1. **DoneCheck 当前只正式实现了一套 OpenAI-compatible provider 接口路径**，位于 `packages/provider-openai`，通过 `createProvider()` 工厂暴露。CLI 与 desktop IPC 都通过它获取 LLM provider。
2. **具体 provider 品牌不是产品内建功能**，而是运行时接入示例。任何 OpenAI-compatible provider 均可通过 `OPENAI_API_KEY` / `OPENAI_BASE_URL` / `OPENAI_MODEL` 切换，不建议依赖单一 provider 品牌。
3. **Provider 品牌不固化进 GUI / CLI 产品命名**：GUI 设置页文案、CLI 文案、代码路径均使用 provider-agnostic 表述（“OpenAI-compatible”、“Deterministic mock”）。
4. **mock 只保证结构路径，不保证真实判断质量**：deterministic mock 的 `judgementDraft` 固定为 `partial`，`evidenceRefs` 来自 prompt payload 的静态抽取，不代表真实 LLM 语义判断。
5. **strict 模式不是保证**：`structured-output-compat` 层与 fallback repair 路径是兼容缓解措施，不意味着所有 OpenAI-compatible 端点都能在 strict=true 下稳定工作。推荐 Demo 用 strict=false。
6. **Windows 打包未经验证不声称支持**：CI 产出 Windows NSIS 与 `win-unpacked` 制品，但未配置 Windows GUI smoke；在 Windows runner 实跑 GUI smoke 之前，Windows 状态保持 ⏸️ Not validated。
7. **Evidence ref 规范化（Stage 8.8 已实现）**：`evidence-ref-normalization` 对模型返回的 evidenceRef 做近邻匹配（lineTolerance=1、overlapRatio≥0.8），命中的近邻引用被规范化为真实候选 snippet，未命中或歧义匹配的引用仍被拒绝（保持 unmatched 断言语义）。这兜底了模型行号轻微漂移，但不放宽对整文件 span 超出 snippet window 的约束。

## 6. 验证可复现性

本文档的事实基于以下可复现命令（详见 Stage 8.9 验收记录）：

- mock CLI：`env -u OPENAI_API_KEY -u OPENAI_BASE_URL -u OPENAI_MODEL node apps/cli/dist/index.js --rules ...`（exit 0、uniqueIds === judgementCount、badRefs = 0）
- real CLI strict=false：`OPENAI_STRUCTURED_OUTPUT_STRICT=false node apps/cli/dist/index.js --rules ...`（exit 0、real LLM 合理分布）
- real CLI strict=true：同上但 `OPENAI_STRUCTURED_OUTPUT_STRICT=true`（本次通过，但历史上有端点兼容风险）
- GUI parity：`nix develop -c pnpm --filter @donecheck/desktop test`（`desktop-provider.test.ts` 验证 undici fetch 注入、session key 优先、无 silent mock fallback）
- packaged GUI smoke (Linux)：CI run `29025568215` 的 `Real packaged GUI smoke (xvfb)` 步骤输出 `PASS packaged gui smoke` / `rendererLoaded=true` / `nativeStorage=true`

> 注：真实 provider 验证使用本地开发者环境的 OpenAI-compatible 端点。该端点的具体品牌不在产品配置中固化，仅作为兼容验证对象。
