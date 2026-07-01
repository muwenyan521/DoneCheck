import { nodeLibraryPreset } from "@donecheck/config/tsup/base";
import { defineConfig } from "tsup";

export default defineConfig({
  ...nodeLibraryPreset,
  banner: {
    js: "#!/usr/bin/env node",
  },
  dts: false,
  format: ["esm"],
  noExternal: ["react", "react-dom"],
});
