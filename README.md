# DoneCheck

DoneCheck 是一个检测「AI 是否真正完成了需求」的开源工具。本仓库当前已完成到阶段 5：在阶段 0 的可复现环境、Monorepo 边界、CI 与合规闸门之上，逐步叠加了阶段 1 的 shared 契约层与 core 分析引擎、阶段 2 的 CLI 消费者、阶段 3 的语义与静态信号层、阶段 4 的规则引擎与权威 `JudgementReport` 契约，以及阶段 5 的模板库、`report-ui` 展示层与 zh-CN/en 双语 i18n。仓库包含阶段 0～5 的全部能力。

## 快速开始

### 使用 Nix

本仓库使用 Nix 固定系统工具链与原生编译工具。`flake.nix` 固定到 `nixos-unstable` release 分支，以提供 Node 22 与现代 pnpm。

可复现性来自 `flake.lock`，而不是分支名本身：`nixos-unstable` 是一个滚动分支，每次 `nix flake update` 都会把 `flake.lock` 指向更新的 nixpkgs 快照。因此更新 nixpkgs 必须显式执行 `nix flake update` 并提交 lock 文件变更，不能依赖分支名隐式升级。

```bash
nix develop -c pnpm install
nix develop -c pnpm typecheck
nix develop -c pnpm lint
nix develop -c pnpm test
nix develop -c pnpm build
```

如果安装了 direnv，可以执行：

```bash
direnv allow
```

之后进入仓库目录会自动加载 `use flake`。

没有安装 direnv 的人直接使用 `nix develop`。

### 工具职责边界

- Nix 管 Node 22（含 Corepack）、ripgrep、git，以及 better-sqlite3 原生模块编译需要的 python3、gcc、pkg-config、make。
- pnpm 由 Corepack 激活（版本锁定在 `package.json#packageManager`），始终运行在 Node 22 上，不会漂移到其它 Node 版本。
- pnpm 管 JavaScript/TypeScript 包依赖与 workspace 链接。
- `.nvmrc` 与 `package.json#engines` 同时锁定 Node 22，未使用 Nix 的贡献者也能得到版本提示；`engine-strict=true`（`.npmrc`）会在版本不匹配时直接报错。

## 包结构

```text
packages/
  shared/            共享类型、常量、Zod schema（含 result/template schema）与工具
  core/              分析引擎 SDK 与阶段 3 语义层，纯 Node，零原生依赖
  templates/         静态报告展示模板配置与类型（零运行时依赖，schema 校验在 shared）
  report-ui/         React 报告展示组件，消费 JudgementReport，不做分析
  provider-openai/   真实 OpenAI LLM provider 实现与 createProvider() 工厂
  config/            共享 tsconfig、Biome、tsup 预设
apps/
  cli/               终端入口，只做参数解析、I/O、展示与退出码映射
  desktop/           Electron 桌面壳，唯一允许 better-sqlite3 的位置
```

## 依赖铁律

依赖方向为：`shared ← core ← {cli, desktop}`，`provider-openai` / `report-ui` / `templates` 作为 `cli` 与 `desktop` 的运行时依赖横切进入消费者层。

- `shared` 不依赖任何 DoneCheck 运行时包。
- `core` 只依赖 `shared` 与契约校验所需的 `zod`，所有分析逻辑只能放在 `core`，且零原生依赖。
- `cli` 运行时依赖 `core`、`provider-openai`、`report-ui`、`templates`，不在生产代码中运行时 import `shared`；JSON 契约复验只在测试中使用 `shared`。
- `desktop` 运行时依赖 `core`、`shared`、`provider-openai`、`report-ui`、`templates`，也是唯一允许原生依赖 `better-sqlite3` 的位置。
- `provider-openai` 是真实 OpenAI LLM provider 实现，零 `@donecheck/*` 运行时依赖，只 `import type` 引用 `core` 的 `LLMProvider` 契约。
- `report-ui` 是纯展示层，不允许运行时 import `core` 或重算规则结果；阶段 5 只接收阶段 4 已生成的 `JudgementReport`。
- `templates` 是零运行时依赖的叶子包（不依赖任何运行时包，包括第三方运行时依赖）；模板只影响展示区块顺序、默认折叠和高亮关注点，schema 校验在 `shared`。

`nix develop -c pnpm lint` 会运行依赖边界校验与 license 闸门，CI 中同样执行。

## CLI 使用

先构建 CLI：

```bash
nix develop -c pnpm --filter @donecheck/cli build
```

直接传入需求与证据：

```bash
nix develop -c node apps/cli/dist/index.js \
  --requirement "Implement shared contracts and core analysis tests." \
  --evidence "The shared contracts, core analysis, and tests implement verified coverage."
```

从文件读取：

```bash
nix develop -c node apps/cli/dist/index.js \
  --requirement-file requirement.md \
  --evidence-file evidence.md
```

从 stdin 读取证据：

```bash
printf 'The shared contracts, core analysis, and tests implement verified coverage.\n' | \
  nix develop -c node apps/cli/dist/index.js \
    --requirement "Implement shared contracts and core analysis tests."
```

默认输出为人类可读格式：

```text
DoneCheck Result
Status: pass
Score: 100%
Checks:
- [pass] requirement-present (100%): Requirement text is present.
- [pass] evidence-present (100%): Evidence text is present.
- [pass] keyword-coverage (100%): Evidence covers 6 of 6 requirement keywords.
Summary: DoneCheck 0.0.0: 3 checks passed, 0 partial, 0 failed. Overall score 100%.
```

使用 `--json` 输出结构化 `DoneCheckResult` JSON。CLI 生产代码不重复运行 shared 契约校验；`@donecheck/core` 已在 `analyze()` 内校验输出，CLI 只负责序列化。

```bash
nix develop -c node apps/cli/dist/index.js \
  --requirement "Implement shared contracts and core analysis tests." \
  --evidence "The shared contracts, core analysis, and tests implement verified coverage." \
  --json
```

### CLI 输入与退出码语义

- 需求必须通过 `--requirement` 或 `--requirement-file` 提供，二者不能同时使用。
- 证据优先使用显式参数：`--evidence` 或 `--evidence-file`；二者不能同时使用。
- 未提供显式证据时，CLI 才从 stdin 读取证据。
- 显式证据和管道 stdin 同时存在时，显式证据优先，stdin 被忽略。
- 交互式 TTY 下未提供显式证据时，CLI 快速失败，不阻塞等待 stdin。
- 空字符串或仅空白的需求/证据属于工具自身错误，不调用 core。

| 场景 | 退出码 |
| --- | --- |
| `status=pass` | `0` |
| `status=fail` | `1` |
| `status=partial` | 默认 `1` |
| `status=partial` 且带 `--partial-ok` | `0` |
| 参数错误、文件不存在、文件读取失败、stdin 缺失、空输入 | `2` |

阶段 5 仍不处理 desktop 持久化与 SQLite。`better-sqlite3` 仍只允许出现在 `apps/desktop`，Electron ABI 重编译与持久化集成留给阶段 6。

## 阶段 1 最小分析链路

`@donecheck/shared` 只承接契约、schema 校验和纯类型工具。核心契约包括 `Requirement`、`Evidence`、`Check`、`CheckResult` 与 `DoneCheckResult`，每个契约都导出 zod schema、`z.infer` 类型，以及 `parse*` / `safeParse*` 校验函数。`shared` 不包含分析业务逻辑，也不依赖任何 `@donecheck/*` 运行时包。

`@donecheck/core` 承接全部分析逻辑，保持纯 Node、零原生依赖。阶段 1 的 `analyze` 会把输入归一化为 shared 契约，运行默认注册的三条规则：需求文本非空、证据文本非空、证据关键词覆盖需求，并汇总为经 shared schema 校验过的 `DoneCheckResult`。

```ts
import { analyze } from "@donecheck/core";

const result = analyze({
  requirement: {
    id: "req-1",
    text: "Implement shared contracts and core analysis tests.",
  },
  evidence: {
    id: "ev-1",
    source: "test-output",
    text: "The shared contracts, core analysis, and tests are implemented and verified.",
  },
});

console.log(result.status, result.score, result.summary);
```

阶段 1 不触碰 desktop 持久化与 SQLite。

## 阶段 3 LLM 语义层

阶段 3 在 `@donecheck/core` 内新增独立的 `semantic` 模块，专注候选收敛与语义草案，不修改现有 `analyze()`、`defaultChecks`、`DoneCheckResult`、CLI 退出码或 pass/fail/partial 聚合语义。阶段 4 在此基础上新增独立的 `rules` 模块，把 semantic draft、静态证据、召回来源与假实现信号合成为可复现的最终判定结果。

### 第 0 级选文件

`selectCandidateFiles()` 基于需求文本、可选 AI 承诺、压缩后的项目结构摘要和静态信号，调用 provider-neutral 的 `LLMProvider.generateObject()` 生成候选文件。模型输出必须先通过 Zod schema 校验（provider 层与业务层各做一次），随后 core 才会做路径归一化、去重、存在性校验和 `topK` 上限控制。

选文件以召回优先。`topK` 仅约束 `llmSelected` 的数量；`strength === "strong"` 的静态信号文件作为兜底补入，不受 `topK` 截断——即使 `llmSelected` 已达到 `topK` 上限，静态强信号文件仍会被追加到最终候选列表中（最终候选数可能超过 `topK`，此时会产出 warning）。输出中显式区分：

- `llmSelected`：由 LLM 选中、经 topK 截断后的存在文件。
- `staticallyRecalled`：由静态强信号兜底补入、不受 topK 约束的存在文件。

### 第 2 级精判草案

`draftSemanticJudgement()` 基于单条 requirement、可选 claim、候选 evidence snippets 和候选文件 metadata，输出 `SemanticJudgementDraft`。草案状态只允许：

- `fulfilled`
- `partial`
- `unsupported`
- `suspicious`

`judgementDraft` 是 LLM 语义层草案，不是最终六状态，也不会映射到 core 现有 `pass/fail/partial` 聚合规则。最终六状态、兑现率和跨项聚合属于阶段 4 规则引擎。

### Prompt 与 Provider

所有 LLM prompt 文案与版本号集中放在 `packages/core/src/prompts/`。改 prompt 文案、版本号或 prompt 输出字段说明时，只改这个目录；调用方统一从 `packages/core/src/prompts/index.ts` 引用，不在语义调用逻辑、provider 或 schema 文件中内联 prompt 文案。每个 prompt 的 `*PromptContract` 必须与对应 Zod schema 字段保持对齐。

阶段 3 prompt 模板每个都有版本常量，并与 Zod schema 字段对齐。业务逻辑只依赖统一 `LLMProvider` 抽象，不读取厂商专有响应字段。测试优先使用 mock provider，因此不要求真实联网模型即可验证结构化输出、重试、静态召回和集成薄切片。

### 后续阶段边界

- 阶段 4：把语义草案、静态证据和规则上下文映射为最终六状态与兑现率。
- 阶段 5：在报告组件展示层处理 zh-CN / en 双语展示。
- 更正式的整体 fail 规格若要进入真实 E2E，应作为后续 core 规格变更单独设计，不属于阶段 3/4。

## 阶段 4 规则引擎

阶段 4 在 `@donecheck/core/rules` 下提供纯函数规则引擎入口：`buildJudgementReport()`，并保留同义导出 `evaluateJudgements()`。该模块只消费已有 requirement、claim、`SemanticJudgementDraft`、静态信号、假实现信号和需求外候选项，不调用 LLM、不读取文件系统、不修改旧 `analyze()` 主链路。`generatedAt` 由调用方显式提供（必填），规则引擎核心不调用 `new Date()`，保证同输入同输出。对外稳定契约仅 `buildJudgementReport()` / `evaluateJudgements()` / `evaluateFinalJudgement()` 与对应 schema，coverage 计算是内部实现细节，不作为公共 API 暴露。

### judgementDraft 与最终六状态

`judgementDraft` 仍然只是阶段 3 语义层草案，取值为 `fulfilled | partial | unsupported | suspicious`。阶段 4 的最终状态是规则引擎输出的六状态：

- `fulfilled`：强证据支持，语义草案倾向 fulfilled，且没有确认的假实现信号。
- `partial`：存在中等或部分证据，语义草案为 partial，或 fulfilled 但静态证据覆盖不足。
- `insufficient-evidence`：有线索但不足以稳定判断，默认从兑现率分母中剔除并单独计数。
- `unfulfilled`：semantic unsupported，或 suspicious 但没有确认的假实现信号且静态证据不能补强。
- `suspicious-fake-implementation`：命中 mock、alert-only、empty-handler、not-implemented、todo、ui-only 等中强假实现信号。
- `extra-scope`：候选项不属于 requirement/claim，但被识别为明显需求外功能扩张。

因此二者不是一对一映射：例如 semantic fulfilled 遇到强假实现信号会变成 `suspicious-fake-implementation`；semantic fulfilled 但证据覆盖不足会变成 `partial`；semantic partial 且低置信弱证据会变成 `insufficient-evidence`。

### 双兑现率策略

规则引擎分别计算 `requirementCoverage` 与 `claimCoverage`。需求兑现率的分母来自 requirement 判定项，AI 承诺兑现率的分母来自 claim 判定项，`extra-scope` 不进入任一兑现率分母。

阶段 4 的 v1 权重固定为：

- `fulfilled = 1`
- `partial = 0.5`
- `unfulfilled = 0`
- `suspicious-fake-implementation = 0`
- `extra-scope = 0`，但不进入 requirement/claim 覆盖率分母
- `insufficient-evidence` 单列计数，并从 coverage 分母中剔除

剔除 `insufficient-evidence` 的原因是它表示“当前证据不足以稳定判断”，不是明确兑现或明确未兑现。报告结构会返回 `excludedInsufficientEvidence`，展示层可以在阶段 5 单独说明不确定项数量。

### 范围偏离度

`scopeDrift` 用来衡量需求外加戏比例。v1 规则为：

```text
scopeDrift.score = extraScopeCount / totalJudgements
```

当总判定项为 0 时分数为 0。等级规则固定为：`score < 0.2` 为 `low`，`0.2 <= score < 0.5` 为 `medium`，`score >= 0.5` 为 `high`。该指标只描述范围偏离，不替代 requirement 或 claim 的兑现率。

### 为什么不改旧 analyze 聚合语义

`analyze()` 是阶段 1/2 已被 CLI 消费的稳定最小规则链路，输出 shared 的 `DoneCheckResult`，其 `pass/fail/partial` 聚合和 CLI 退出码已经形成兼容边界。阶段 4 的目标是新增独立最终判定能力，而不是改变旧主入口行为；因此规则引擎放在 `@donecheck/core/rules`，以新的 `JudgementReport` schema 输出六状态、reasonCode、coverage 与 scopeDrift。

### 后续安排

- 阶段 5 在 report-ui 展示层处理 zh-CN / en 双语文案映射，阶段 4 只输出稳定 reasonCode 和中性内部 explanation。
- “整体 fail 真实 E2E 可达性”属于更后续的 core 规格问题，需要独立设计，不在阶段 4 顺手修改。

## 阶段 5 模板库与报告展示层

阶段 5 新增可复用的报告展示层，目标是让 CLI、desktop 和后续单文件 HTML 导出复用同一份 `JudgementReport + template + locale` 渲染入口。本阶段只处理展示、模板和导出基础，不修改 `@donecheck/core/rules` 的规则语义，也不接入 Electron GUI 主流程。

### 模板库职责

`@donecheck/templates` 从极简默认模板升级为静态展示模板配置库，内置：

- `generic`：通用报告，按总览、风险/亮点、判定列表、调试信息展示。
- `todo`：偏行动清单，优先展示判定列表，再展示风险/亮点。
- `frontend`：偏前端核查，提前展开调试信息并突出假实现、需求外范围等 UI 风险。

模板字段只包含 id、词条 key、适用场景、区块顺序、默认折叠区块和高亮关注点。模板不依赖 `report-ui`，不依赖 `core`，不包含 coverage、scopeDrift 或 finalStatus 判断逻辑，也不会改变传入的 report 数据。

### report-ui 职责

`@donecheck/report-ui` 新增 `JudgementReportPage` 与 `createHtmlReportDocument()`：

- `JudgementReportPage` 接收 `JudgementReport`、模板配置和 locale，渲染顶部总览、六状态统计、需求/承诺覆盖率、范围偏离、风险/亮点、判定列表、证据、语义草案和 signals 调试信息。
- `createHtmlReportDocument()` 生成自包含 HTML 字符串，供阶段 6 的 desktop 内嵌、真实写文件导出和快照测试复用。
- 组件不调用 LLM、不读写文件、不依赖 Electron API、不重算 coverage / scopeDrift / summaryStats，只按传入报告如实展示。

### 双语边界

阶段 5 仅支持 `zh-CN` 与 `en`。词条在 report-ui 展示层按 `common`、`status`、`report`、`reasonCode`、`template` 分组维护，`reasonCode` 继续保持机器可读、语言无关，由 UI 映射为中文或英文展示文案。未知 reasonCode 会安全降级为“未知原因 / Unknown reason”，缺失词条回退到 key 本身。

双语不进入 `core`、`semantic` 或 `rules`，也不要求规则引擎输出中文 explanation；explanation 保持原始中性文本，UI 优先展示结构化 reasonCode 文案。

### 阶段 6 边界

阶段 6 才会把报告页接入 Electron GUI 主流程，包括桌面端数据流、真实文件导出、内嵌预览、用户选择模板/语言、导出路径选择与 Electron 写文件能力。“整体 fail 真实 E2E 可达性”仍是后续独立 core 规格问题，不属于阶段 5。

## 真实 LLM Provider

阶段 5 引入的 `@donecheck/provider-openai` 提供 `createProvider()` 工厂，CLI（`--rules` / `--html`）与 desktop IPC 都通过它获取 LLM provider。未配置时自动回退到确定性 mock provider，保证 `nix develop -c pnpm verify` 与 CI 不依赖网络。

### 环境变量

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `OPENAI_API_KEY` | 启用真实 provider 时必填 | 未设置或为空时回退到确定性 mock provider 并在 stderr 输出警告 |
| `OPENAI_BASE_URL` | 可选 | 自定义 OpenAI 兼容端点（如代理或自托管网关） |
| `OPENAI_MODEL` | 可选 | 默认 `gpt-4o-mini` |

### 启用真实 provider

```bash
OPENAI_API_KEY=sk-... nix develop -c pnpm --filter @donecheck/cli build
OPENAI_API_KEY=sk-... nix develop -c node apps/cli/dist/index.js \
  --requirement "Implement shared contracts and core analysis tests." \
  --evidence "The shared contracts, core analysis, and tests implement verified coverage." \
  --rules
```

未设置 `OPENAI_API_KEY` 时同样的命令会回退到确定性 mock provider 并完成完整管线，适合离线结构与退出码验收。

### Provider 工厂契约

`createProvider({ stderr })` 的行为：

- `OPENAI_API_KEY` 非空 → 返回真实 `OpenAIProvider`。
- `OPENAI_API_KEY` 未设置或为空 → 向 `stderr` 写入警告，返回 `createDeterministicMockProvider()`。

`OpenAIProvider` 构造时若缺少 API key 会抛 `ProviderConfigError`；`createProvider()` 不会抛错，只回退到 mock。

## Electron Shell

阶段 6 预备工作在 `apps/desktop` 内新增最小 Electron 骨架：`main.ts`（窗口创建）、`preload.ts`（contextBridge 暴露 `window.donecheck`）、`ipc.ts`（三个 IPC 通道委派到 core / report-ui）、`smoke.ts`（真实 Electron smoke 入口）。`contextIsolation: true`、`nodeIntegration: false`，preload 与 main 均为 CJS。

当前仓库选择 **方案 B：默认依赖不纳入 Electron 二进制**。为避免在 `pnpm install` 阶段下载 Electron 二进制（影响 CI 与离线开发），`electron` 与 `@electron/rebuild` **未**加入 devDependencies。Electron 类型由本地 `apps/desktop/src/types/electron.d.ts` 声明。

desktop 验收分两层，不能混用口径：

- mocked unit smoke：`nix develop -c pnpm --filter @donecheck/desktop test:mocked-smoke`，使用 `vi.mock("electron")` 验证 main/preload/renderer/smoke 骨架、最小窗口路径和 smoke IPC 注册；这是 CI 默认可跑的单测，不是真实 Electron 进程。
- real manual smoke：`nix develop -c pnpm --filter @donecheck/desktop electron:smoke`，必须先手动安装 Electron，启动真实 Electron、创建最小窗口、加载 renderer，并注册一条最小 IPC 后退出；这不是 CI 默认路径。

要本地运行真实 Electron smoke，需手动安装 Electron：

```bash
nix develop -c pnpm --filter @donecheck/desktop add -D electron
nix develop -c pnpm --filter @donecheck/desktop build
nix develop -c pnpm --filter @donecheck/desktop electron:smoke
# 期望输出：electron:smoke OK
```

`electron:smoke` 指向 `dist/smoke.cjs`，只做真实 Electron 壳验收：启动 Electron、创建窗口、加载 `renderer/index.html`、注册 `donecheck:verify-smoke` IPC 后立即退出，不进入 GUI 主开发。better-sqlite3 的 Electron ABI 重编译与持久化集成留给阶段 6。

## 常用命令

一键全仓验证（typecheck → lint → test → build）：

```bash
nix develop -c pnpm install
nix develop -c pnpm verify
```

也可以分步执行：

```bash
nix develop -c pnpm typecheck
nix develop -c pnpm lint
nix develop -c pnpm test
nix develop -c pnpm build
```

已通过 `nix develop` 或 direnv 进入开发环境后，也可以直接运行 `pnpm ...`；在 CI、复核和自动化验证中必须显式使用 Nix 包裹命令：

```bash
nix develop -c pnpm verify
```

## License

本项目使用 MPL-2.0 许可证。核心包禁止引入 GPL/AGPL 等传染性依赖，CI 会在发现相关许可证时失败。
