import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

let windowCount = 0;
const handledChannels: string[] = [];
const loadedFiles: string[] = [];
let queriedWindows = false;

vi.mock("electron", () => ({
  app: {
    whenReady: () => Promise.resolve(),
    on: () => {},
    quit: () => {},
  },
  BrowserWindow: class MockBrowserWindow {
    constructor() {
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

  it("preload exposes DESKTOP_API_KEYS with donecheck:analyze", async () => {
    const mod = await import("./preload.js");
    expect(mod.DESKTOP_API_KEYS).toContain("donecheck:analyze");
  });

  it("renderer/index.html exists and references donecheck", () => {
    const html = readFileSync(resolve(import.meta.dirname, "renderer/index.html"), "utf8");
    expect(html).toContain("donecheck");
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
