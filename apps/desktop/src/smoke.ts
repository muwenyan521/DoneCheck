import { BrowserWindow, app, ipcMain } from "electron";
import { createMainWindow } from "./main.js";

export function runElectronSmoke(): void {
  try {
    ipcMain.handle("donecheck:verify-smoke", () => "ipc-ok");
    createMainWindow();
    if (BrowserWindow.getAllWindows().length < 1) throw new Error("window smoke failed");
    console.log("electron:smoke OK");
  } catch (error) {
    console.error("electron:smoke FAIL", error);
    process.exitCode = 1;
  }
  app.quit();
}

if (!process.env.VITEST) {
  app.whenReady().then(runElectronSmoke);
}
