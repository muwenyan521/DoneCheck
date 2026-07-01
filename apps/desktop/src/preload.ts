import { contextBridge, ipcRenderer } from "electron";
import {
  type AnalyzeRequest,
  DESKTOP_API_KEYS,
  type DesktopApi,
  type DesktopIpcResult,
  type ExportHtmlRequest,
  type ExportHtmlResponse,
  type HistoryDeleteRequest,
  type HistoryEntry,
  type HistoryGetRequest,
  type HistorySaveRequest,
  type HistorySummary,
  type JudgementReport,
  type RenderHtmlRequest,
  type SelectWorkspaceResponse,
} from "./ipc-contract.js";

export type DesktopApiChannel = (typeof DESKTOP_API_KEYS)[number];

const api: DesktopApi = {
  analyze: (req: AnalyzeRequest) => invoke<JudgementReport>("donecheck:analyze", req),
  renderHtml: (req: RenderHtmlRequest) => invoke("donecheck:render-html", req),
  selectWorkspace: () => invoke<SelectWorkspaceResponse>("donecheck:select-workspace"),
  exportHtml: (req: ExportHtmlRequest) => invoke<ExportHtmlResponse>("donecheck:export-html", req),
  history: {
    list: () => invoke<readonly HistorySummary[]>("donecheck:history:list"),
    get: (req: HistoryGetRequest) => invoke<HistoryEntry | undefined>("donecheck:history:get", req),
    save: (req: HistorySaveRequest) => invoke<HistoryEntry>("donecheck:history:save", req),
    delete: (req: HistoryDeleteRequest) =>
      invoke<{ readonly deleted: boolean }>("donecheck:history:delete", req),
  },
};

contextBridge.exposeInMainWorld("donecheck", api as unknown as Record<string, unknown>);

export { DESKTOP_API_KEYS };

function invoke<T>(channel: DesktopApiChannel, request?: unknown): Promise<DesktopIpcResult<T>> {
  return ipcRenderer.invoke(channel, request) as Promise<DesktopIpcResult<T>>;
}
