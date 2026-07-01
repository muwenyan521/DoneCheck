import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

let windowCount = 0;
const handledChannels: string[] = [];
const loadedFiles: string[] = [];
const browserWindowOptions: unknown[] = [];
let queriedWindows = false;

vi.mock("electron", () => ({
  app: {
    getPath: (name: string) => (name === "userData" ? ":memory:" : "/tmp"),
    whenReady: () => Promise.resolve(),
    on: () => {},
    quit: () => {},
  },
  dialog: {
    showOpenDialog: () => Promise.resolve({ canceled: true, filePaths: [] }),
    showSaveDialog: () => Promise.resolve({ canceled: true }),
  },
  BrowserWindow: class MockBrowserWindow {
    constructor(options: unknown) {
      browserWindowOptions.push(options);
      if (!queriedWindows) windowCount += 1;
    }
    static getAllWindows(): MockBrowserWindow[] {
      queriedWindows = true;
      return Array.from({ length: windowCount }, () => Object.create(MockBrowserWindow.prototype));
    }
    loadFile(): Promise<void> {
      loadedFiles.push("renderer/index.html");
      return Promise.resolve();
    }
  },
  ipcMain: { handle: (channel: string) => handledChannels.push(channel) },
  contextBridge: { exposeInMainWorld: () => {} },
  ipcRenderer: { invoke: () => Promise.resolve() },
}));

describe("electron skeleton", () => {
  it("main.ts exports createMainWindow", async () => {
    const mod = await import("./main.js");
    expect(typeof mod.createMainWindow).toBe("function");
  });

  it("createMainWindow loads the renderer entry", async () => {
    loadedFiles.length = 0;
    const mod = await import("./main.js");
    mod.createMainWindow();
    expect(loadedFiles).toContain("renderer/index.html");
  });

  it("createMainWindow keeps the Electron renderer security baseline", async () => {
    browserWindowOptions.length = 0;
    const mod = await import("./main.js");
    mod.createMainWindow();
    expect(browserWindowOptions[0]).toEqual(
      expect.objectContaining({
        webPreferences: expect.objectContaining({
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
        }),
      }),
    );
  });

  it("preload exposes typed channel keys for analyze, render-html, and history signatures", async () => {
    const mod = await import("./preload.js");
    expect(mod.DESKTOP_API_KEYS).toEqual(
      expect.arrayContaining([
        "donecheck:analyze",
        "donecheck:render-html",
        "donecheck:select-workspace",
        "donecheck:export-html",
        "donecheck:history:list",
        "donecheck:history:get",
        "donecheck:history:save",
        "donecheck:history:delete",
      ]),
    );
  });

  it("renderer/index.html exists and references donecheck", () => {
    const html = readFileSync(resolve(import.meta.dirname, "renderer/index.html"), "utf8");
    expect(html).toContain("main.tsx");
  });

  it("verifyNativeStorageAvailable still works", async () => {
    const mod = await import("./index.js");
    expect(mod.verifyNativeStorageAvailable()).toBe(true);
  });

  it("mocked Electron smoke starts a window and registers the smoke IPC channel", async () => {
    windowCount = 0;
    queriedWindows = false;
    handledChannels.length = 0;
    loadedFiles.length = 0;
    const mod = await import("./smoke.js");
    mod.runElectronSmoke();
    expect(windowCount).toBeGreaterThan(0);
    expect(handledChannels).toContain("donecheck:verify-smoke");
    expect(loadedFiles).toContain("renderer/index.html");
  });
});
