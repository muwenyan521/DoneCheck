# DoneCheck

DoneCheck 是一个检测「AI 是否真正完成了需求」的开源工具。本仓库处于阶段 2：在阶段 0 的可复现环境、Monorepo 边界、CI 与合规闸门，以及阶段 1 的 shared 契约层与 core 分析引擎之上，新增第一个真实消费者 CLI，跑通「终端输入需求与证据 → core 分析 → 结构化 DoneCheckResult → 人类可读或 JSON 输出」链路。

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
  shared/      共享类型、常量、Zod schema（含 result/template schema）与工具
  core/        分析引擎 SDK 与阶段 3 语义层，纯 Node，零原生依赖
  templates/   静态核查模板数据与类型（零运行时依赖，schema 校验在 shared）
  report-ui/   React 报告组件，只依赖 shared 类型
  config/      共享 tsconfig、Biome、tsup 预设
apps/
  cli/         终端入口，只做参数解析、I/O、展示与退出码映射
  desktop/     Electron 桌面壳，唯一允许 better-sqlite3 的位置
```

## 依赖铁律

依赖方向为：`shared ← core ← {cli, vscode, desktop}`。

- `shared` 不依赖任何 DoneCheck 运行时包。
- `core` 只依赖 `shared` 与契约校验所需的 `zod`，所有分析逻辑只能放在 `core`，且零原生依赖。
- `cli` 只运行时依赖 `core`，不在生产代码中运行时 import `shared`；JSON 契约复验只在测试中使用 `shared`。
- `desktop` 可以依赖 `core` 与 `shared`，也是唯一允许原生依赖 `better-sqlite3` 的位置。
- `report-ui` 只能使用 `shared` 的**类型**（`import type`），不允许运行时 import `core` 等分析逻辑。
- `templates` 是零运行时依赖的叶子包（不依赖任何运行时包，包括第三方运行时依赖）；模板 schema 校验在 `shared`。

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

阶段 2 仍不处理 desktop 持久化与 SQLite。`better-sqlite3` 仍只允许出现在 `apps/desktop`，Electron ABI 重编译与持久化集成留给后续阶段。

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

阶段 3 prompt 模板放在 `packages/core/src/prompts/*`，每个 prompt 都有版本常量，并与 Zod schema 字段对齐。业务逻辑只依赖统一 `LLMProvider` 抽象，不读取厂商专有响应字段。测试优先使用 mock provider，因此不要求真实联网模型即可验证结构化输出、重试、静态召回和集成薄切片。

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

- 阶段 5 才会在 report-ui / GUI / CLI 展示层处理 zh-CN / en 双语文案映射，阶段 4 只输出稳定 reasonCode 和中性内部 explanation。
- “整体 fail 真实 E2E 可达性”属于更后续的 core 规格问题，需要独立设计，不在阶段 4 顺手修改。

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
