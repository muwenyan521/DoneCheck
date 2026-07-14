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
      "f1d735d730be4bb737048c3763bc53469663f5cc0006c715e0271dc2968fddf1",
    );
    expect(digest(config.model)).toBe(
      "deda3dc02a1d1575f15d5c9f9b3e31cf0c768a55508c31e7ff0f4fc8f33fc669",
    );
    expect(config.apiKey.length).toBe(51);
    expect(digest(config.apiKey)).toBe(
      "9cdede8ca9729860a8ffe3c595b3ec048e668318bdb6646964437054a93b20d3",
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
