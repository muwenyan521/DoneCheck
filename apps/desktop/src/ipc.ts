import { join } from "node:path";
import { app, dialog, ipcMain } from "electron";
import { createHistoryStore } from "./history-store.js";
import type {
  AnalyzeRequest,
  ExportHtmlRequest,
  HistoryDeleteRequest,
  HistoryGetRequest,
  HistorySaveRequest,
  RenderHtmlRequest,
} from "./ipc-contract.js";
import { createDesktopIpcHandlers, defaultExportPath } from "./ipc-handlers.js";

export function registerIpcHandlers(): void {
  const historyStore = createHistoryStore({
    databasePath: join(app.getPath("userData"), "history.sqlite"),
  });
  const handlers = createDesktopIpcHandlers({
    historyStore,
    saveDialog: async (defaultFileName) => {
      const result = await dialog.showSaveDialog({
        defaultPath: defaultExportPath(app.getPath("downloads"), defaultFileName),
        filters: [{ extensions: ["html"], name: "HTML" }],
      });
      return result.canceled ? undefined : result.filePath;
    },
    selectDirectory: async () => {
      const result = await dialog.showOpenDialog({ properties: ["openDirectory"] });
      return result.canceled ? undefined : result.filePaths[0];
    },
  });
  ipcMain.handle("donecheck:analyze", (_event: unknown, req: AnalyzeRequest) =>
    handlers.analyze(req),
  );
  ipcMain.handle("donecheck:render-html", (_event: unknown, req: RenderHtmlRequest) =>
    handlers.renderHtml(req),
  );
  ipcMain.handle("donecheck:select-workspace", () => handlers.selectWorkspace());
  ipcMain.handle("donecheck:export-html", (_event: unknown, req: ExportHtmlRequest) =>
    handlers.exportHtml(req),
  );
  ipcMain.handle("donecheck:history:list", () => handlers.history.list());
  ipcMain.handle("donecheck:history:get", (_event: unknown, req: HistoryGetRequest) =>
    handlers.history.get(req),
  );
  ipcMain.handle("donecheck:history:save", (_event: unknown, req: HistorySaveRequest) =>
    handlers.history.save(req),
  );
  ipcMain.handle("donecheck:history:delete", (_event: unknown, req: HistoryDeleteRequest) =>
    handlers.history.delete(req),
  );
}
