import { join } from "node:path";
import { app, dialog, ipcMain } from "electron";
import { createDesktopProviderFactory, createSessionCredentialStore } from "./desktop-provider.js";
import { createHistoryStore } from "./history-store.js";
import type {
  AnalyzeRequest,
  CredentialSetSessionApiKeyRequest,
  DecomposeRequest,
  ExportHtmlRequest,
  HistoryDeleteRequest,
  HistoryGetRequest,
  HistorySaveRequest,
  RenderHtmlRequest,
  SettingsSetRequest,
} from "./ipc-contract.js";
import { createDesktopIpcHandlers, defaultExportPath } from "./ipc-handlers.js";
import { createSettingsStore } from "./settings-store.js";

export function registerIpcHandlers(): void {
  const historyStore = createHistoryStore({
    databasePath: join(app.getPath("userData"), "history.sqlite"),
  });
  const settingsStore = createSettingsStore({
    databasePath: join(app.getPath("userData"), "settings.sqlite"),
  });
  const credentials = createSessionCredentialStore();
  const desktopProviderFactory = createDesktopProviderFactory({
    credentials,
    getSettings: () => settingsStore.get(),
  });
  const handlers = createDesktopIpcHandlers({
    credentials,
    desktopProviderFactory,
    historyStore,
    settingsStore,
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
  ipcMain.handle("donecheck:decompose", (_event: unknown, req: DecomposeRequest) =>
    handlers.decompose(req),
  );
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
  ipcMain.handle("donecheck:settings:get", () => handlers.settings.get());
  ipcMain.handle("donecheck:settings:set", (_event: unknown, req: SettingsSetRequest) =>
    handlers.settings.set(req),
  );
  ipcMain.handle("donecheck:settings:reset", () => handlers.settings.reset());
  ipcMain.handle(
    "donecheck:credentials:set-session-api-key",
    (_event: unknown, req: CredentialSetSessionApiKeyRequest) =>
      handlers.credentials.setSessionApiKey(req),
  );
  ipcMain.handle("donecheck:credentials:clear-session-api-key", () =>
    handlers.credentials.clearSessionApiKey(),
  );
  ipcMain.handle("donecheck:credentials:status", () => handlers.credentials.status());
}
