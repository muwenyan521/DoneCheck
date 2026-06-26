import { reactLibraryPreset } from "@donecheck/config/tsup/base";
import { defineConfig } from "tsup";

export default defineConfig(
  reactLibraryPreset({
    entry: ["src/index.tsx"],
  }),
);
