# DoneCheck

DoneCheck 是一个检测「AI 是否真正完成了需求」的开源工具。本仓库处于阶段 0：工程地基与脚手架，目标是先把可复现环境、Monorepo 边界、CI 与合规闸门固定下来。

## 快速开始

### 使用 Nix

本仓库使用 Nix 固定系统工具链与原生编译工具。`flake.nix` 固定到 `nixos-unstable` release 分支，以提供 Node 22 与现代 pnpm。

可复现性来自 `flake.lock`，而不是分支名本身：`nixos-unstable` 是一个滚动分支，每次 `nix flake update` 都会把 `flake.lock` 指向更新的 nixpkgs 快照。因此更新 nixpkgs 必须显式执行 `nix flake update` 并提交 lock 文件变更，不能依赖分支名隐式升级。

```bash
nix develop
pnpm install
pnpm typecheck
pnpm lint
pnpm test
pnpm build
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
  desktop/     Electron 桌面壳，唯一允许 better-sqlite3 的位置
```

## 依赖铁律

依赖方向为：`shared ← core ← {cli, vscode, desktop}`。

- `shared` 不依赖任何 DoneCheck 运行时包。
- `core` 只依赖 `shared`，所有分析逻辑只能放在 `core`，且零原生依赖。
- `desktop` 可以依赖 `core` 与 `shared`，也是唯一允许原生依赖 `better-sqlite3` 的位置。
- `report-ui` 只能使用 `shared` 的**类型**（`import type`），不允许运行时 import `core` 等分析逻辑。
- `templates` 是零运行时依赖的叶子包（不依赖任何运行时包，包括第三方运行时依赖）；模板 schema 校验在 `shared`。

`pnpm lint` 会运行依赖边界校验与 license 闸门，CI 中同样执行。

## 常用命令

一键全仓验证（typecheck → lint → test → build）：

```bash
pnpm install
pnpm verify
```

也可以分步执行：

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

在本项目中优先通过 Nix 执行命令：

```bash
nix develop -c pnpm verify
```

## License

本项目使用 MPL-2.0 许可证。核心包禁止引入 GPL/AGPL 等传染性依赖，CI 会在发现相关许可证时失败。
