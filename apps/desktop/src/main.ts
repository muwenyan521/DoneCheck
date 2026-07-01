import { resolve } from "node:path";
import { BrowserWindow, app } from "electron";
import { registerIpcHandlers } from "./ipc.js";

export function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1024,
    height: 768,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: resolve(__dirname, "preload.cjs"),
    },
  });
  win.loadFile(resolve(__dirname, "renderer", "index.html"));
  return win;
}

export function startElectronApp(): void {
  app.whenReady().then(() => {
    registerIpcHandlers();
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
