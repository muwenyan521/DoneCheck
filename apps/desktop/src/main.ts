import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { BrowserWindow, app } from "electron";
import { buildSmokeReadyPayload, smokeSettingsRoundtrip } from "./gui-smoke-hook.js";
import { registerIpcHandlers } from "./ipc.js";
import { isAllowedRendererNavigation } from "./navigation-policy.js";

const SMOKE_TIMEOUT_MS = Number(process.env.DONECHECK_GUI_SMOKE_TIMEOUT_MS ?? 30000);

export function createMainWindow(): BrowserWindow {
  const rendererEntryPath = getRendererEntryPath();
  const rendererEntryUrl = pathToFileURL(rendererEntryPath).href;
  const win = new BrowserWindow({
    width: smokeDimension("DONECHECK_GUI_SMOKE_WIDTH", 1024),
    height: smokeDimension("DONECHECK_GUI_SMOKE_HEIGHT", 768),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: resolve(__dirname, "preload.cjs"),
      sandbox: true,
    },
  });
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (event, url) => {
    if (!isAllowedRendererNavigation(url, rendererEntryUrl)) event.preventDefault();
  });
  win.loadFile(rendererEntryPath);
  return win;
}

export function startElectronApp(): void {
  if (process.env.DONECHECK_GUI_SMOKE_READY_FILE) {
    startGuiSmoke();
    return;
  }
  app.whenReady().then(() => {
    registerIpcHandlers(pathToFileURL(getRendererEntryPath()).href);
    createMainWindow();
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow();
      }
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit();
    }
  });
}

function startGuiSmoke(): void {
  const readyFile = process.env.DONECHECK_GUI_SMOKE_READY_FILE as string;
  const storageFile = process.env.DONECHECK_GUI_SMOKE_STORAGE_FILE;
  const startedAt = Date.now();
  let finished = false;

  const finish = (payload: {
    readonly rendererLoaded: boolean;
    readonly storageOk: boolean;
    readonly error?: string | null;
  }): void => {
    if (finished) return;
    finished = true;
    const full = buildSmokeReadyPayload({ ...payload, durationMs: Date.now() - startedAt });
    try {
      writeFileSync(readyFile, `${JSON.stringify(full)}\n`);
    } catch (error) {
      console.error("gui-smoke: failed to write ready file", error);
    }
    app.quit();
  };

  const timeout = setTimeout(() => {
    finish({
      rendererLoaded: false,
      storageOk: false,
      error: `did-finish-load timeout after ${SMOKE_TIMEOUT_MS}ms`,
    });
  }, SMOKE_TIMEOUT_MS);

  app.whenReady().then(() => {
    try {
      registerIpcHandlers(pathToFileURL(getRendererEntryPath()).href);
    } catch (error) {
      clearTimeout(timeout);
      finish({
        rendererLoaded: false,
        storageOk: false,
        error: `ipc init failed: ${error instanceof Error ? error.message : String(error)}`,
      });
      return;
    }
    const win = createMainWindow();
    win.webContents.on("did-finish-load", () => {
      void captureSmokeWindow(win).then(
        () => {
          clearTimeout(timeout);
          const storagePath = storageFile ?? ":memory:";
          const result = smokeSettingsRoundtrip(storagePath);
          finish({
            rendererLoaded: true,
            storageOk: result.ok,
            error: result.ok ? null : `storage roundtrip failed: ${result.error}`,
          });
        },
        (error: unknown) => {
          clearTimeout(timeout);
          finish({
            rendererLoaded: false,
            storageOk: false,
            error: `screenshot failed: ${error instanceof Error ? error.message : String(error)}`,
          });
        },
      );
    });
    win.webContents.on("did-fail-load", (_event, errorCode, errorDescription) => {
      clearTimeout(timeout);
      finish({
        rendererLoaded: false,
        storageOk: false,
        error: `did-fail-load ${errorCode} ${errorDescription}`,
      });
    });
    win.on("closed", () => {
      clearTimeout(timeout);
      finish({
        rendererLoaded: false,
        storageOk: false,
        error: "window closed before did-finish-load",
      });
    });
  });

  app.on("window-all-closed", () => {
    if (!finished) {
      clearTimeout(timeout);
      finish({
        rendererLoaded: false,
        storageOk: false,
        error: "window-all-closed before smoke finished",
      });
    }
    app.quit();
  });
}

async function captureSmokeWindow(win: BrowserWindow): Promise<void> {
  const screenshotPath = process.env.DONECHECK_GUI_SMOKE_SCREENSHOT;
  if (screenshotPath === undefined) return;
  const image = await win.webContents.capturePage();
  writeFileSync(screenshotPath, image.toPNG());
}

function smokeDimension(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value >= 320 && value <= 4096 ? value : fallback;
}

function getRendererEntryPath(): string {
  return resolve(__dirname, "renderer", "index.html");
}
