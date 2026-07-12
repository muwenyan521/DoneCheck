# 严格 Todo 假完成 Fixture

该 fixture 通过正式文件扫描、候选文件选择、证据提取、语义草案和规则 pipeline 验证真实代码证据；它不包含手写最终报告，也不依赖 fixture 路径分支。

## 输入

- `inputs/requirements.md`：五项中文 Todo 需求：新增、删除、标记完成、刷新保留和移动端显示。
- `inputs/claims.md`：AI 声称已完成新增、删除、标记完成、localStorage 保存、响应式布局，并额外实现登录和导出。

## Workspace 真实状态

- `src/components/TodoApp.tsx`：新增和删除真实更新列表；完成按钮连接到空 handler，因此不会更新完成状态。
- `src/components/LoginPage.tsx`：真实存在邮箱/密码校验与登录状态，是需求外加戏。
- `src/components/ExportButton.tsx`：只调用 `alert`，没有下载或导出实现，是疑似假实现。
- `src/styles.css`：只有普通样式；workspace 不含 persistence API 或有效响应式 media query。

输入文件位于 `workspace/` 外，确保扫描只读取实现代码。
