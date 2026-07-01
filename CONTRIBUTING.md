# Contributing

感谢参与 DoneCheck。当前阶段优先保证工程地基稳定，任何改动都应保持可复现、可验证、边界清晰。

## 开发环境

推荐使用 Nix：

```bash
nix develop -c pnpm install
```

如果使用 direnv：

```bash
direnv allow
```

## 提交前检查

```bash
nix develop -c pnpm verify
```

Git hooks 会在提交前运行 `lint-staged`（Biome 格式化 + lint），commit message 使用 Conventional Commits。全量 typecheck / test / build 由 `nix develop -c pnpm verify` 与 CI 负责，不在 pre-commit 中重复执行。

## Desktop smoke 验收边界

仓库默认依赖不包含 Electron 二进制，CI 默认覆盖的是 mocked unit smoke，不覆盖真实 Electron 进程。

```bash
nix develop -c pnpm --filter @donecheck/desktop test:mocked-smoke
```

这条命令使用 `vi.mock("electron")`，只验证 main/preload/renderer/smoke 骨架、最小窗口路径和 smoke IPC 注册，不得在复核记录中称为“真实 Electron smoke”。

真实 Electron smoke 是本地手动验收路径：

```bash
nix develop -c pnpm --filter @donecheck/desktop add -D electron
nix develop -c pnpm --filter @donecheck/desktop build
nix develop -c pnpm --filter @donecheck/desktop electron:smoke
```

预期输出为 `electron:smoke OK`，命令会启动真实 Electron、创建最小窗口、加载 renderer、注册一条最小 IPC 后退出。由于 Electron 未进入默认 devDependencies，这条路径不属于 CI 默认闸门。

## TTY 验收测试规范

模拟 TTY 验收测试时必须禁用 `script -qfec` 命令。

阶段 2 的 TTY 单测在初版交付时已存在，后续 P1 复核结论属于复核手法误判，不代表 TTY 行为缺少覆盖。验证交互式 stdin 行为时，优先使用依赖注入单测覆盖 `stdinIsTTY: true` 的快速失败语义；若必须做外部进程验收，应选择不会改变 stdin/TTY 语义、不会掩盖阻塞问题的可复现方式，并在复核记录中写明命令与退出码。

## 依赖规则

- `packages/shared` 只放契约、zod schema、parse/safeParse 校验函数与纯类型工具；不得加入分析业务逻辑，也不得依赖任何 `@donecheck/*` 运行时包。
- 分析逻辑只放在 `packages/core`。
- `packages/core` 不允许原生依赖（零原生依赖）。
- `apps/cli` 与后续消费者层只做参数解析、I/O、展示与退出码映射，不得包含关键词覆盖、status、score 等分析判断逻辑。
- `apps/cli` 生产代码允许运行时依赖 `packages/core`、`packages/provider-openai`、`packages/report-ui`、`packages/templates`；不得运行时 import `packages/shared`，shared 契约复验只能出现在测试中。
- `apps/desktop` 允许运行时依赖 `packages/core`、`packages/shared`、`packages/provider-openai`、`packages/report-ui`、`packages/templates`，也是唯一允许 `better-sqlite3` 的位置。
- `packages/report-ui` 只允许 `import type` 引用 `packages/shared` 的类型，不允许运行时 import。
- `packages/templates` 是零运行时依赖的叶子包（不依赖任何运行时包，包括第三方运行时依赖如 zod）；模板 schema 校验逻辑在 `packages/shared`。
- `packages/provider-openai` 是真实 OpenAI LLM provider 实现，零 `@donecheck/*` 运行时依赖；只允许 `import type` 引用 `packages/core` 的 `LLMProvider` 契约。导出 `createProvider()` 工厂（未设置 `OPENAI_API_KEY` 时回退到确定性 mock provider）与 `OpenAIProvider` 类，供 `apps/cli` 与 `apps/desktop` 运行时 import。
- 禁止引入 GPL/AGPL 等传染性许可证依赖。

## 契约与分析约定

- shared 契约变更必须同步覆盖合法输入 parse 成功、非法输入 parse 抛错或 safeParse 失败。
- core 的 `analyze` 必须用 shared 契约校验输入归一化后的数据与输出结果，返回结构化 `DoneCheckResult`。
- core check 必须是纯函数式规则，不做文件系统、SQLite、网络或 Electron I/O。
- 所有 LLM prompt 文案、prompt 输出字段说明和 prompt version 常量集中在 `packages/core/src/prompts/`；修改文案只改该目录，调用方统一从 `packages/core/src/prompts/index.ts` 引用。不得把 prompt 文案散落到语义业务逻辑、provider 实现或 schema 文件中。
- 新增 `@donecheck/*` 运行时依赖关系时，必须同步更新 `scripts/check-dependency-boundaries.mjs` 的包映射、允许列表和负向 fixture；负向 fixture 应由测试或手工验收瞬态写入并删除，不得作为常驻违规源码污染 `nix develop -c pnpm verify`。
- 新增系统级依赖时，必须修改 `flake.nix` 并显式更新、提交 `flake.lock`；不要依赖未锁定的滚动环境。
