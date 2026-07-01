declare module "electron" {
  export interface App {
    whenReady(): Promise<void>;
    on(event: "activate" | "window-all-closed", listener: (...args: unknown[]) => void): App;
    quit(): void;
    getPath(name: "downloads" | "userData" | string): string;
  }

  export interface OpenDialogReturnValue {
    readonly canceled: boolean;
    readonly filePaths: string[];
  }

  export interface SaveDialogReturnValue {
    readonly canceled: boolean;
    readonly filePath?: string;
  }

  export interface Dialog {
    showOpenDialog(options: {
      readonly properties: readonly string[];
    }): Promise<OpenDialogReturnValue>;
    showSaveDialog(options: {
      readonly defaultPath?: string;
      readonly filters?: readonly {
        readonly extensions: readonly string[];
        readonly name: string;
      }[];
    }): Promise<SaveDialogReturnValue>;
  }

  export interface WebPreferences {
    contextIsolation?: boolean;
    nodeIntegration?: boolean;
    preload?: string;
    sandbox?: boolean;
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
  export const dialog: Dialog;
  export const ipcMain: IpcMain;
  export const contextBridge: ContextBridge;
  export const ipcRenderer: IpcRenderer;
}
