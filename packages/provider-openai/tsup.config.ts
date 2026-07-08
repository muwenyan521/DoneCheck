import { nodeLibraryPreset } from "@donecheck/config/tsup/base";
import { defineConfig } from "tsup";

export default defineConfig({
  ...nodeLibraryPreset,
  dts: {
    compilerOptions: {
      composite: false,
    },
  },
  entry: ["src/index.ts"],
  external: ["openai", "@donecheck/core"],
});
