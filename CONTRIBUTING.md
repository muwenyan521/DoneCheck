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

- 分析逻辑只放在 `packages/core`。
- `packages/core` 不允许原生依赖（零原生依赖）。
- `apps/desktop` 是唯一允许 `better-sqlite3` 的位置。
- `packages/report-ui` 只允许 `import type` 引用 `packages/shared` 的类型，不允许运行时 import。
- `packages/templates` 是零运行时依赖的叶子包（不依赖任何运行时包，包括第三方运行时依赖如 zod）；模板 schema 校验逻辑在 `packages/shared`。
- 禁止引入 GPL/AGPL 等传染性许可证依赖。
