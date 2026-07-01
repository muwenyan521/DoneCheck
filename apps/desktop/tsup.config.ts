import { nodeLibraryPreset } from "@donecheck/config/tsup/base";
import { defineConfig } from "tsup";

export default defineConfig([
  {
    ...nodeLibraryPreset,
    entry: { index: "src/index.ts" },
    external: ["electron", "better-sqlite3"],
  },
  {
    ...nodeLibraryPreset,
    entry: {
      main: "src/main.ts",
      preload: "src/preload.ts",
      ipc: "src/ipc.ts",
      smoke: "src/smoke.ts",
      electron: "src/electron.ts",
    },
    external: ["electron", "better-sqlite3"],
    dts: false,
    clean: false,
  },
]);
