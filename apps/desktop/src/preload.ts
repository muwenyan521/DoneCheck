import { contextBridge, ipcRenderer } from "electron";
import {
  type AnalyzeRequest,
  type BundledFreePreflightRequest,
  type BundledFreePreflightResponse,
  type BundledFreeStartWorkflowRequest,
  type BundledFreeStartWorkflowResponse,
  type BundledFreeStatus,
  type CopyRepairPromptRequest,
  type CredentialSetSessionApiKeyRequest,
  type CredentialStatusResponse,
  DESKTOP_API_KEYS,
  type DecomposeRequest,
  type DecomposeResponse,
  type DesktopApi,
  type DesktopIpcResult,
  type ExportHtmlRequest,
  type ExportHtmlResponse,
  type HistoryDeleteRequest,
  type HistoryEntry,
  type HistoryGetRequest,
  type HistoryRestoreRequest,
  type HistorySaveRequest,
  type HistorySummary,
  type JudgementReport,
  type RenderHtmlRequest,
  type SelectWorkspaceResponse,
  type SettingsSetRequest,
  type SettingsSetWithSessionApiKeyRequest,
  type SettingsSetWithSessionApiKeyResponse,
} from "./ipc-contract.js";
import type { DesktopSettings } from "./settings-store.js";

export type DesktopApiChannel = (typeof DESKTOP_API_KEYS)[number];

const api: DesktopApi = {
  decompose: (req: DecomposeRequest) => invoke<DecomposeResponse>("donecheck:decompose", req),
  analyze: (req: AnalyzeRequest) => invoke<JudgementReport>("donecheck:analyze", req),
  cancelAnalysis: (req) => invoke<void>("donecheck:cancel-analysis", req),
  renderHtml: (req: RenderHtmlRequest) => invoke("donecheck:render-html", req),
  selectWorkspace: () => invoke<SelectWorkspaceResponse>("donecheck:select-workspace"),
  exportHtml: (req: ExportHtmlRequest) => invoke<ExportHtmlResponse>("donecheck:export-html", req),
  copyRepairPrompt: (req: CopyRepairPromptRequest) =>
    invoke<void>("donecheck:clipboard:copy-repair-prompt", req),
  bundledFree: {
    status: () => invoke<BundledFreeStatus>("donecheck:bundled-free:status"),
    preflight: (req: BundledFreePreflightRequest) =>
      invoke<BundledFreePreflightResponse>("donecheck:bundled-free:preflight", req),
    startWorkflow: (req: BundledFreeStartWorkflowRequest) =>
      invoke<BundledFreeStartWorkflowResponse>("donecheck:bundled-free:start-workflow", req),
  },
  history: {
    list: () => invoke<readonly HistorySummary[]>("donecheck:history:list"),
    get: (req: HistoryGetRequest) => invoke<HistoryEntry | undefined>("donecheck:history:get", req),
    save: (req: HistorySaveRequest) => invoke<HistoryEntry>("donecheck:history:save", req),
    delete: (req: HistoryDeleteRequest) =>
      invoke<{ readonly deleted: boolean }>("donecheck:history:delete", req),
    restore: (req: HistoryRestoreRequest) =>
      invoke<{ readonly restored: boolean }>("donecheck:history:restore", req),
    clear: () => invoke<{ readonly cleared: number }>("donecheck:history:clear"),
  },
  settings: {
    get: () => invoke<DesktopSettings>("donecheck:settings:get"),
    set: (req: SettingsSetRequest) => invoke<DesktopSettings>("donecheck:settings:set", req),
    setWithSessionApiKey: (req: SettingsSetWithSessionApiKeyRequest) =>
      invoke<SettingsSetWithSessionApiKeyResponse>(
        "donecheck:settings:set-with-session-api-key",
        req,
      ),
    reset: () => invoke<DesktopSettings>("donecheck:settings:reset"),
  },
  credentials: {
    setSessionApiKey: (req: CredentialSetSessionApiKeyRequest) =>
      invoke<CredentialStatusResponse>("donecheck:credentials:set-session-api-key", req),
    clearSessionApiKey: () =>
      invoke<CredentialStatusResponse>("donecheck:credentials:clear-session-api-key"),
    status: () => invoke<CredentialStatusResponse>("donecheck:credentials:status"),
  },
};

contextBridge.exposeInMainWorld("donecheck", api as unknown as Record<string, unknown>);

export { DESKTOP_API_KEYS };

function invoke<T>(channel: DesktopApiChannel, request?: unknown): Promise<DesktopIpcResult<T>> {
  return (
    request === undefined ? ipcRenderer.invoke(channel) : ipcRenderer.invoke(channel, request)
  ) as Promise<DesktopIpcResult<T>>;
}
