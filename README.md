# DoneCheck

DoneCheck 用需求、AI 的完成声明和工作区代码交叉核验任务是否真正完成。它提供 Electron 桌面应用、命令行工具、结构化 JSON 和可分享的自包含 HTML 报告，并支持中文与英文报告。

## 快速开始

所有开发和运行命令都建议通过 Nix 执行：

```bash
nix develop -c pnpm install
nix develop -c pnpm build
```

查看 CLI 帮助或直接运行 Nix 应用：

```bash
nix run path:.#donecheck -- --help
```

使用 `path:.` 可以让 Nix 在本地工作树有尚未提交文件时仍构建当前内容。

## 桌面应用

开发环境中启动桌面应用：

```bash
nix develop -c pnpm --filter @donecheck/desktop electron:start:real
```

典型流程：

1. 选择要核验的工作区。
2. 输入原始需求，以及可选的完成声明。
3. 检查自动拆分的需求；可编辑、添加或删除条目。
4. 在设置中选择 OpenAI-compatible Provider 或本地演示模式。
5. 开始分析；长任务可以取消，失败后可以重试或修改设置。
6. 查看优先处理项和每条需求的证据详情。
7. 保存历史记录，或导出自包含 HTML 报告。

Provider 的 API key 只保存在当前应用会话的内存中。应用设置不会将 key 写入磁盘。历史记录支持恢复、软删除和撤销删除。

## CLI

真实 Provider 分析需要工作区、需求文件和完成声明文件：

```bash
OPENAI_API_KEY="$OPENAI_API_KEY" \
OPENAI_BASE_URL="https://example.com/v1" \
OPENAI_MODEL="your-model" \
nix develop -c node apps/cli/dist/index.js \
  --rules \
  --workspace ./workspace \
  --requirement-file ./requirements.md \
  --evidence-file ./claim.md
```

生成 HTML：

```bash
OPENAI_API_KEY="$OPENAI_API_KEY" \
nix develop -c node apps/cli/dist/index.js \
  --html \
  --workspace ./workspace \
  --requirement-file ./requirements.md \
  --evidence-file ./claim.md \
  --output ./donecheck-report.html
```

`--rules` 输出详细 JSON；`--html` 写入自包含 HTML。两种形式来自同一份分析结果。

### 本地演示模式

没有 Provider 时，可以显式传 `--mock` 检查输入、文件扫描、报告结构、导出和退出码：

```bash
nix develop -c node apps/cli/dist/index.js \
  --rules --mock --partial-ok \
  --workspace fixtures/demo-react-app/workspace \
  --requirement-file fixtures/demo-react-app/inputs/requirements.md \
  --evidence-file fixtures/demo-react-app/inputs/claim.md
```

本地演示模式生成样例分析数据，不会联系外部分析服务，也不能用于评价模型判断质量。未配置 `OPENAI_API_KEY` 且没有显式传 `--mock` 时，CLI 会报配置错误，不会静默切换模式。

### 基础文本检查

如只需要不访问工作区和分析服务的基础文本核验，可使用 `--text-only`：

```bash
nix develop -c node apps/cli/dist/index.js \
  --text-only \
  --requirement "Implement tests and documentation." \
  --evidence "Tests and documentation were implemented."
```

`--json` 可与 `--text-only` 一起输出基础检查的 JSON。

### 退出码

| 退出码 | 含义 |
| --- | --- |
| `0` | 分析完成，且没有需要阻止成功的结论；`--partial-ok` 可接受部分完成或证据不足。 |
| `1` | 分析完成，但报告包含未完成、可疑实现、范围外实现，或默认不接受的部分完成/证据不足。 |
| `2` | 参数、输入、文件、配置、Provider 或运行时错误。 |

输出文件存在只表示报告成功生成，不表示需求已经完成；最终应阅读报告总览和每项证据。

## Provider 配置

| 变量 | 必需 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `OPENAI_API_KEY` | 真实 Provider 必需 | 无 | API key。 |
| `OPENAI_BASE_URL` | 否 | OpenAI 默认端点 | OpenAI-compatible API 地址。 |
| `OPENAI_MODEL` | 否 | `gpt-4o-mini` | 模型名称。 |
| `OPENAI_STRUCTURED_OUTPUT_STRICT` | 否 | `true` | 端点不支持严格结构化输出时可设为 `false`。 |

详细兼容边界见 [Provider 兼容性说明](docs/provider-compatibility-matrix.md)。不要将 key 写入命令历史、日志、截图、报告或仓库文件。

## 报告内容

报告提供：

- 总体完成情况、状态统计和覆盖率；
- 需要优先处理的问题；
- 每条需求的结论、置信度、说明、证据位置与修复建议；
- 范围外实现提示；
- 中文或英文的自包含 HTML，可离线打开。

内部规则版本、内部原因代码和分析中间结构不会显示在面向用户的报告中。

## 开发与验证

```bash
nix develop -c pnpm typecheck
nix develop -c pnpm lint
nix develop -c pnpm test
nix develop -c pnpm build
```

也可以一次运行全部检查：

```bash
nix develop -c pnpm verify
```

桌面端真实 GUI smoke：

```bash
nix develop -c pnpm --filter @donecheck/desktop electron:gui:smoke
```

Linux 打包与打包后 GUI smoke：

```bash
nix develop -c pnpm --filter @donecheck/desktop package:linux
nix develop -c pnpm --filter @donecheck/desktop smoke:packaged
```

详细的 Electron ABI、Linux/Windows 打包说明见 [桌面应用开发文档](apps/desktop/README.md)。

## 架构

```text
packages/
  shared/            共享类型、契约与校验
  core/              分析管线、语义处理与规则引擎
  templates/         报告模板配置
  report-ui/         React 报告组件与 HTML 渲染
  provider-openai/   OpenAI-compatible Provider
apps/
  cli/               命令行入口
  desktop/           Electron 桌面应用与本地历史
```

分析逻辑位于 `core`；CLI 和桌面应用负责输入、I/O、状态管理与展示。`better-sqlite3` 只用于桌面端历史存储。

## 许可证

[Mozilla Public License 2.0](LICENSE)
