import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  build: {
    emptyOutDir: true,
    outDir: "dist/renderer",
    rollupOptions: {
      input: resolve(import.meta.dirname, "src/renderer/index.html"),
    },
  },
  root: "src/renderer",
  test: {
    root: import.meta.dirname,
  },
});
