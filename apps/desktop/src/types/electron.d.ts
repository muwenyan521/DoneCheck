declare module "electron" {
  export interface App {
    whenReady(): Promise<void>;
    on(event: "activate" | "window-all-closed", listener: (...args: unknown[]) => void): App;
    quit(): void;
    getPath(name: string): string;
  }

  export interface WebPreferences {
    contextIsolation?: boolean;
    nodeIntegration?: boolean;
    preload?: string;
  }

  export class BrowserWindow {
    constructor(options?: {
      width?: number;
      height?: number;
      webPreferences?: WebPreferences;
    });
    loadFile(path: string): Promise<void>;
    on(event: "closed", listener: () => void): BrowserWindow;
    static getAllWindows(): BrowserWindow[];
  }

  export interface IpcMain {
    handle(channel: string, listener: (event: unknown, ...args: never[]) => unknown): void;
  }

  export interface ContextBridge {
    exposeInMainWorld(name: string, api: Record<string, unknown>): void;
  }

  export interface IpcRenderer {
    invoke(channel: string, ...args: unknown[]): Promise<unknown>;
  }

  export const app: App;
  export const ipcMain: IpcMain;
  export const contextBridge: ContextBridge;
  export const ipcRenderer: IpcRenderer;
}
