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
  core/        分析引擎 SDK，纯 Node，零原生依赖
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
- `core` 只依赖 `shared`，所有分析逻辑只能放在 `core`，且零原生依赖。
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
