import { nodeLibraryPreset } from "@donecheck/config/tsup/base";
import { defineConfig } from "tsup";

export default defineConfig({
  ...nodeLibraryPreset,
  // better-sqlite3 is a native module; it must not be bundled into dist.
  external: ["better-sqlite3"],
});
