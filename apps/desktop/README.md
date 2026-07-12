# DoneCheck Desktop Packaging

DoneCheck Desktop packaging is explicit and opt-in. The default root `pnpm verify`, `pnpm build`, and package tests do not run Electron packaging, `electron-builder`, or Electron ABI rebuilds. Electron, `@electron/rebuild`, and `electron-builder` are already declared in this workspace's devDependencies.

## Dev Electron ABI Startup

The dev scripts `electron:start` and `electron:smoke` assume `better-sqlite3` is already on the Electron ABI. To make interactive dev startup safe, use the ABI-aware wrappers instead. They build, rebuild `better-sqlite3` for the Electron ABI, launch Electron, and restore the Node ABI in a `finally` block on success or failure.

Interactive start (opens a window, close it manually to restore the Node ABI):

```bash
nix develop -c pnpm --filter @donecheck/desktop electron:start:real
```

Self-quitting real GUI smoke (no provider key required, exits 0 on success, writes a ready file with renderer-load and native-storage results):

```bash
nix develop -c pnpm --filter @donecheck/desktop electron:gui:smoke
```

Both scripts restore the Node ABI via `pnpm rebuild:node` in their `finally` block, so subsequent Node tests keep passing without manual cleanup. The GUI smoke path sets `DONECHECK_GUI_SMOKE`, `DONECHECK_GUI_SMOKE_READY_FILE`, and `DONECHECK_GUI_SMOKE_STORAGE_FILE` so the main process loads the real renderer, runs a real settings storage roundtrip, writes a JSON ready file, and auto-quits. It fails when the renderer does not load, when the storage roundtrip fails, or when the ready file is missing. This is distinct from `test:mocked-smoke`, which uses a mocked Electron module, and from `electron:smoke`, which checks only the real Electron shell.

## Linux Packaging

Run from the repository root:

```bash
nix develop -c pnpm --filter @donecheck/desktop package:linux
```

Artifacts are written to:

```text
apps/desktop/release/
```

The Linux package target produces AppImage and deb artifacts plus `linux-unpacked/`. The `desktopName` metadata (`donecheck-desktop.desktop`) and `linux.syncDesktopName` are configured so electron-builder does not emit a `desktopName` warning and the `.desktop` entry stays in sync with `productName`.

## Windows Packaging

Windows NSIS packaging is configured in the manual GitHub Actions workflow:

```text
.github/workflows/package.yml
```

Windows is not packaged on Linux hosts. To produce Windows artifacts, run the `Package Desktop` workflow through `workflow_dispatch` (see the CI section below) or run `pnpm --filter @donecheck/desktop package:win` on a real Windows host with Node 22 and pnpm 11.8.0. There is no real Windows GUI smoke configured yet; the Windows job only packages NSIS and `win-unpacked` and uploads them.

## better-sqlite3 ABI

`better-sqlite3` is the desktop app's native module. Packaging and the dev ABI startup wrappers temporarily rebuild it for the Electron ABI, then restore it to the Node ABI in a `finally` path.

If Node tests fail after an interrupted package run, restore the Node ABI manually:

```bash
nix develop -c pnpm --filter @donecheck/desktop rebuild:node
```

## Packaged GUI Smoke

Run from the repository root after `package:linux`:

```bash
nix develop -c pnpm --filter @donecheck/desktop smoke:packaged
```

`smoke:packaged` runs two phases by default and both must pass:

1. **Structure smoke** — checks release files, unpacked resources, renderer output, preload, main bundle, and unpacked native modules.
2. **Real GUI smoke** — spawns the `linux-unpacked` executable with the `DONECHECK_GUI_SMOKE` env protocol, waits for the ready file, and verifies `rendererLoaded` and `nativeStorage` are both `true`. It does not pass on file existence alone.

For structure-only checks (no GUI launch), pass `--structure-only`:

```bash
nix develop -c pnpm --filter @donecheck/desktop smoke:packaged -- --structure-only
```

For GUI-only checks, pass `--gui`:

```bash
nix develop -c pnpm --filter @donecheck/desktop smoke:packaged -- --gui
```

The real GUI smoke needs a display. On a headless Linux host (including CI), it runs under `xvfb-run`; on a local dev host with `DISPLAY` set, it runs directly.

## Manual GUI Smoke

For Linux AppImage manual smoke:

1. Launch the generated AppImage from `apps/desktop/release/`.
2. Open the GUI.
3. Select a workspace.
4. Run analysis.
5. Save history.
6. Restart the app and verify history persists.

No provider key is required for packaging or the self-quitting GUI smoke. Provider-backed analysis still follows the normal provider environment configuration when used manually.

## CI Workflow

The `Package Desktop` workflow (`.github/workflows/package.yml`) is manual-only (`workflow_dispatch`). It has two jobs:

- **Linux** — installs dependencies via Nix, runs `package:linux`, runs the real packaged GUI smoke under `xvfb-run` against the unpacked app, and uploads `apps/desktop/release/**/*`.
- **Windows** — installs dependencies via Node 22 + pnpm 11.8.0, runs `package:win`, and uploads `apps/desktop/release/**/*`. No real GUI smoke on Windows.

To trigger it from the command line (requires `gh auth` with a valid token):

```bash
gh workflow run package.yml --ref <current-branch>
gh run list --workflow=package.yml --limit 1
```

To trigger it from the GitHub UI, navigate to Actions → Package Desktop → Run workflow.

## Icons

The icon assets under `apps/desktop/assets/icons/` are original simple DoneCheck geometry generated for this project. They are not downloaded from a third-party icon set.
