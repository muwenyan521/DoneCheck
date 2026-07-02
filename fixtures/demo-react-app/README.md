# DoneCheck Demo React Fixture

This fixture is intentionally small and mixed-quality. It is not a production app. It exists so DoneCheck can analyze a realistic React workspace with fulfilled work, partial work, fake implementation signals, extra scope, and insufficient evidence.

## Files

- `package.json` and `tsconfig.json` describe a minimal React TypeScript project.
- `src/App.tsx` wires the demo UI together.
- `src/components/LoginForm.tsx` contains a real email/password login flow using `auth` and `localStorage` signals.
- `src/components/TodoList.tsx` contains a partially implemented todo flow with a placeholder persistence path.
- `src/components/ExportButton.tsx` contains an intentionally fake export handler.
- `src/components/BillingPanel.tsx` is intentionally outside the requested scope.
- `src/lib/auth.ts` provides the small authentication helper used by `LoginForm`.
- `src/styles.css` includes responsive CSS evidence via `@media`.
