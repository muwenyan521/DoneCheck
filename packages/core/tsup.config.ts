import { nodeLibraryPreset } from "@donecheck/config/tsup/base";
import { defineConfig } from "tsup";

export default defineConfig({
  ...nodeLibraryPreset,
  dts: {
    compilerOptions: {
      composite: false,
    },
  },
  entry: ["src/index.ts", "src/semantic/index.ts", "src/rules/index.ts"],
  format: ["esm", "cjs"],
});
