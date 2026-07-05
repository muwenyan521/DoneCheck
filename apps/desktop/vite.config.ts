import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

const rootDir = import.meta.dirname;

export default defineConfig({
  base: "./",
  build: {
    emptyOutDir: true,
    outDir: resolve(rootDir, "dist/renderer"),
    rollupOptions: {
      input: resolve(rootDir, "src/renderer/index.html"),
    },
  },
  root: resolve(rootDir, "src/renderer"),
  test: {
    root: rootDir,
  },
});
