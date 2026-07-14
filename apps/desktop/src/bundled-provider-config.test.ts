import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { decodeBundledProviderConfig } from "./bundled-provider-config.js";

const sourceDirectory = dirname(fileURLToPath(import.meta.url));

describe("bundled provider config", () => {
  it("decodes the expected main-process configuration", () => {
    const config = decodeBundledProviderConfig();
    const digest = (value: string) => createHash("sha256").update(value).digest("hex");

    expect(digest(config.baseURL)).toBe(
      "12b8deaccc34b32757dbb1497e029da0c2e7b26ffa86b9c926c08cb4692f4508",
    );
    expect(digest(config.model)).toBe(
      "f61ff5cf8e1cc88da6944d6bcd3e2e7da5ff27dd3288a8781908018cb8240cd6",
    );
    expect(config.apiKey.length).toBe(35);
    expect(digest(config.apiKey)).toBe(
      "27b37854b737024607a093a44506d24df2f567393dde1b0bfbedb778498a5039",
    );
  });

  it("does not store decoded values as source literals", async () => {
    const moduleSource = await readFile(
      resolve(sourceDirectory, "bundled-provider-config.ts"),
      "utf8",
    );
    const config = decodeBundledProviderConfig();

    expect(moduleSource.includes(config.baseURL)).toBe(false);
    expect(moduleSource.includes(config.model)).toBe(false);
    expect(moduleSource.includes(config.apiKey)).toBe(false);
  });

  it("keeps the bundled config out of renderer-facing import chains", async () => {
    const rendererFacingFiles = [
      "ipc-boundary.ts",
      "ipc-contract.ts",
      "ipc.ts",
      "preload.ts",
      "settings-model.ts",
      "settings-store.ts",
      "renderer/App.tsx",
      "renderer/SettingsPanel.tsx",
    ] as const;

    const sources = await Promise.all(
      rendererFacingFiles.map((path) => readFile(resolve(sourceDirectory, path), "utf8")),
    );

    expect(sources.some((source) => source.includes("bundled-provider-config"))).toBe(false);
    expect(sources.some((source) => source.includes("decodeBundledProviderConfig"))).toBe(false);
  });

  it("does not emit decoded bundled values into built main or renderer artifacts", async () => {
    const distDirectory = resolve(sourceDirectory, "../dist");
    if (!existsSync(distDirectory)) return;
    const files = await collectFiles(distDirectory);
    const values = Object.values(decodeBundledProviderConfig());
    const contents = await Promise.all(files.map((path) => readFile(path)));

    for (const value of values) {
      const needle = Buffer.from(value, "utf8");
      expect(contents.some((content) => content.includes(needle))).toBe(false);
    }
  });
});

async function collectFiles(directory: string): Promise<readonly string[]> {
  const { readdir } = await import("node:fs/promises");
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const path = resolve(directory, entry.name);
      return entry.isDirectory() ? collectFiles(path) : [path];
    }),
  );
  return nested.flat();
}
