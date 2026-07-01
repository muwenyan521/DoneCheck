import { nodeLibraryPreset } from "@donecheck/config/tsup/base";
import { defineConfig } from "tsup";

export default defineConfig({
  ...nodeLibraryPreset,
  entry: ["src/index.ts"],
  external: ["openai", "@donecheck/core"],
});
