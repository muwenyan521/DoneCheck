# Contributing

感谢参与 DoneCheck。当前阶段优先保证工程地基稳定，任何改动都应保持可复现、可验证、边界清晰。

## 开发环境

推荐使用 Nix：

```bash
nix develop
pnpm install
```

如果使用 direnv：

```bash
direnv allow
```

## 提交前检查

```bash
pnpm verify
```

Git hooks 会在提交前运行 `lint-staged`（Biome 格式化 + lint），commit message 使用 Conventional Commits。全量 typecheck / test / build 由 `pnpm verify` 与 CI 负责，不在 pre-commit 中重复执行。

## 依赖规则

- `packages/shared` 只放契约、zod schema、parse/safeParse 校验函数与纯类型工具；不得加入分析业务逻辑，也不得依赖任何 `@donecheck/*` 运行时包。
- 分析逻辑只放在 `packages/core`。
- `packages/core` 不允许原生依赖（零原生依赖）。
- `apps/desktop` 是唯一允许 `better-sqlite3` 的位置。
- `packages/report-ui` 只允许 `import type` 引用 `packages/shared` 的类型，不允许运行时 import。
- `packages/templates` 是零运行时依赖的叶子包（不依赖任何运行时包，包括第三方运行时依赖如 zod）；模板 schema 校验逻辑在 `packages/shared`。
- 禁止引入 GPL/AGPL 等传染性许可证依赖。

## 契约与分析约定

- shared 契约变更必须同步覆盖合法输入 parse 成功、非法输入 parse 抛错或 safeParse 失败。
- core 的 `analyze` 必须用 shared 契约校验输入归一化后的数据与输出结果，返回结构化 `DoneCheckResult`。
- core check 必须是纯函数式规则，不做文件系统、SQLite、网络或 Electron I/O。
- 新增 `@donecheck/*` 运行时依赖关系时，必须同步更新 `scripts/check-dependency-boundaries.mjs` 的包映射、允许列表和负向 fixture。
- 新增系统级依赖时，必须修改 `flake.nix` 并显式更新、提交 `flake.lock`；不要依赖未锁定的滚动环境。
