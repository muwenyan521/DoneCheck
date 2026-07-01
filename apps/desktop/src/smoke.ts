import { app } from "electron";
import { verifyNativeStorageAvailable } from "./index.js";

app.whenReady().then(() => {
  try {
    const ok = verifyNativeStorageAvailable();
    if (!ok) {
      throw new Error("better-sqlite3 smoke failed");
    }
    console.log("electron:smoke OK");
  } catch (error) {
    console.error("electron:smoke FAIL", error);
    process.exitCode = 1;
  }
  app.quit();
});
