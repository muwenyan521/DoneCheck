# DoneCheck Desktop Packaging

DoneCheck Desktop packaging is explicit and opt-in. The default root `pnpm verify`, `pnpm build`, and package tests do not run Electron packaging, `electron-builder`, or Electron ABI rebuilds.

## Linux Packaging

Run from the repository root:

```bash
pnpm --filter @donecheck/desktop package:linux
```

Artifacts are written to:

```text
apps/desktop/release/
```

The Linux package target produces AppImage and deb artifacts when the host packaging environment supports them.

## Windows Packaging

Windows NSIS packaging is configured in the manual GitHub Actions workflow:

```text
.github/workflows/package.yml
```

Use the `Package Desktop` workflow through `workflow_dispatch`. Windows artifact validation requires running GitHub Actions or a real Windows environment; a Linux local run does not verify the Windows NSIS artifact.

## better-sqlite3 ABI

`better-sqlite3` is the desktop app's native module. Packaging temporarily rebuilds it for the Electron ABI, then restores it to the Node ABI in a `finally` path.

If Node tests fail after an interrupted package run, restore the Node ABI manually:

```bash
pnpm --filter @donecheck/desktop rebuild:node
```

## Artifact Structure Smoke

Run:

```bash
pnpm --filter @donecheck/desktop smoke:packaged
```

This is an artifact structure smoke. It checks release files, unpacked resources, renderer output, preload, main bundle, and unpacked native modules. It does not launch the packaged GUI and must not be treated as a real packaged GUI smoke.

## Manual GUI Smoke

For Linux AppImage manual smoke:

1. Launch the generated AppImage from `apps/desktop/release/`.
2. Open the GUI.
3. Select a workspace.
4. Run analysis.
5. Save history.
6. Restart the app and verify history persists.

No provider key is required for packaging. Provider-backed analysis still follows the normal provider environment configuration when used manually.

## Icons

The icon assets under `apps/desktop/assets/icons/` are original simple DoneCheck geometry generated for this project. They are not downloaded from a third-party icon set.
