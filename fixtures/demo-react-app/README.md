# DoneCheck Demo React Fixture

This fixture is intentionally small and mixed-quality. It is not a production app. It exists so DoneCheck can analyze a realistic React workspace with fulfilled work, partial work, fake implementation signals, extra scope, and insufficient evidence.

## Files

- `workspace/package.json` and `workspace/tsconfig.json` describe a minimal React TypeScript project.
- `workspace/src/App.tsx` wires the demo UI together.
- `workspace/src/components/LoginForm.tsx` contains a real email/password login flow using `auth` and `localStorage` signals.
- `workspace/src/components/TodoList.tsx` contains a partially implemented todo flow with a placeholder persistence path.
- `workspace/src/components/ExportButton.tsx` contains an intentionally fake export handler.
- `workspace/src/components/BillingPanel.tsx` is intentionally outside the requested scope.
- `workspace/src/lib/auth.ts` provides the small authentication helper used by `LoginForm`.
- `workspace/src/styles.css` includes responsive CSS evidence via `@media`.
- `inputs/requirements.md` and `inputs/claim.md` are standard Demo inputs and intentionally live outside `workspace/` so they are not scanned as implementation evidence.
