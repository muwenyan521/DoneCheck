import { contextBridge, ipcRenderer } from "electron";

export const DESKTOP_API_KEYS = [
  "donecheck:analyze",
  "donecheck:render-html",
  "donecheck:verify-storage",
] as const;

export type DesktopApiChannel = (typeof DESKTOP_API_KEYS)[number];

contextBridge.exposeInMainWorld("donecheck", {
  analyze: (req: unknown) => ipcRenderer.invoke("donecheck:analyze", req),
  renderHtml: (req: unknown) => ipcRenderer.invoke("donecheck:render-html", req),
  verifyStorage: () => ipcRenderer.invoke("donecheck:verify-storage"),
});
