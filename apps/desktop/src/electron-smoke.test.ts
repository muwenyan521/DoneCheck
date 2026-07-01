import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  app: {
    whenReady: () => Promise.resolve(),
    on: () => {},
    quit: () => {},
  },
  BrowserWindow: class MockBrowserWindow {
    static getAllWindows(): MockBrowserWindow[] {
      return [];
    }
    loadFile(): void {}
  },
  ipcMain: { handle: () => {} },
  contextBridge: { exposeInMainWorld: () => {} },
  ipcRenderer: { invoke: () => Promise.resolve() },
}));

describe("electron skeleton", () => {
  it("main.ts exports createMainWindow", async () => {
    const mod = await import("./main.js");
    expect(typeof mod.createMainWindow).toBe("function");
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
});
