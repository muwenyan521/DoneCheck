import { join } from "node:path";
import { app, clipboard, dialog, ipcMain } from "electron";
import { createDesktopProviderFactory, createSessionCredentialStore } from "./desktop-provider.js";
import { createHistoryStore } from "./history-store.js";
import { assertAllowedIpcSender, assertValidIpcArguments } from "./ipc-boundary.js";
import type {
  AnalyzeRequest,
  CopyRepairPromptRequest,
  CredentialSetSessionApiKeyRequest,
  DecomposeRequest,
  DesktopApiChannel,
  ExportHtmlRequest,
  HistoryDeleteRequest,
  HistoryGetRequest,
  HistoryRestoreRequest,
  HistorySaveRequest,
  RenderHtmlRequest,
  SettingsSetRequest,
} from "./ipc-contract.js";
import { createDesktopIpcHandlers, defaultExportPath } from "./ipc-handlers.js";
import { createSettingsStore } from "./settings-store.js";

export function registerIpcHandlers(rendererEntryUrl: string): void {
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
    writeClipboardText: (text) => clipboard.writeText(text),
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
  register("donecheck:decompose", rendererEntryUrl, (req) =>
    handlers.decompose(req as DecomposeRequest),
  );
  register("donecheck:analyze", rendererEntryUrl, (req) => handlers.analyze(req as AnalyzeRequest));
  register("donecheck:cancel-analysis", rendererEntryUrl, (req) =>
    handlers.cancelAnalysis(req as { readonly requestId: string }),
  );
  register("donecheck:render-html", rendererEntryUrl, (req) =>
    handlers.renderHtml(req as RenderHtmlRequest),
  );
  register("donecheck:select-workspace", rendererEntryUrl, () => handlers.selectWorkspace());
  register("donecheck:export-html", rendererEntryUrl, (req) =>
    handlers.exportHtml(req as ExportHtmlRequest),
  );
  register("donecheck:clipboard:copy-repair-prompt", rendererEntryUrl, (req) =>
    handlers.copyRepairPrompt(req as CopyRepairPromptRequest),
  );
  register("donecheck:history:list", rendererEntryUrl, () => handlers.history.list());
  register("donecheck:history:get", rendererEntryUrl, (req) =>
    handlers.history.get(req as HistoryGetRequest),
  );
  register("donecheck:history:save", rendererEntryUrl, (req) =>
    handlers.history.save(req as HistorySaveRequest),
  );
  register("donecheck:history:delete", rendererEntryUrl, (req) =>
    handlers.history.delete(req as HistoryDeleteRequest),
  );
  register("donecheck:history:restore", rendererEntryUrl, (req) =>
    handlers.history.restore(req as HistoryRestoreRequest),
  );
  register("donecheck:history:clear", rendererEntryUrl, () => handlers.history.clear());
  register("donecheck:settings:get", rendererEntryUrl, () => handlers.settings.get());
  register("donecheck:settings:set", rendererEntryUrl, (req) =>
    handlers.settings.set(req as SettingsSetRequest),
  );
  register("donecheck:settings:reset", rendererEntryUrl, () => handlers.settings.reset());
  register("donecheck:credentials:set-session-api-key", rendererEntryUrl, (req) =>
    handlers.credentials.setSessionApiKey(req as CredentialSetSessionApiKeyRequest),
  );
  register("donecheck:credentials:clear-session-api-key", rendererEntryUrl, () =>
    handlers.credentials.clearSessionApiKey(),
  );
  register("donecheck:credentials:status", rendererEntryUrl, () => handlers.credentials.status());
}

function register(
  channel: DesktopApiChannel,
  rendererEntryUrl: string,
  handler: (...args: readonly unknown[]) => Promise<unknown>,
): void {
  ipcMain.handle(channel, async (event, ...args: unknown[]) => {
    try {
      assertAllowedIpcSender(event, rendererEntryUrl);
      assertValidIpcArguments(channel, args);
      return await handler(...args);
    } catch {
      return {
        ok: false,
        error: {
          code: "invalid-input" as const,
          message: "The request is invalid.",
        },
      };
    }
  });
}
