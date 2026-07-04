import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { inspectPackagedArtifacts } from "./smoke-packaged.mjs";

function createReleaseFixture() {
  const root = mkdtempSync(path.join(tmpdir(), "donecheck-packaged-"));
  const release = path.join(root, "release");
  const resources = path.join(release, "linux-unpacked", "resources", "app.asar.unpacked");
  mkdirSync(path.join(release, "linux-unpacked", "resources", "app", "dist", "renderer"), {
    recursive: true,
  });
  mkdirSync(path.join(resources, "node_modules", "better-sqlite3", "build", "Release"), {
    recursive: true,
  });
  writeFileSync(path.join(release, "DoneCheck Desktop-0.0.0.AppImage"), "appimage");
  writeFileSync(path.join(release, "linux-unpacked", "DoneCheck Desktop"), "binary");
  writeFileSync(
    path.join(release, "linux-unpacked", "resources", "app", "dist", "electron.cjs"),
    "main",
  );
  writeFileSync(
    path.join(release, "linux-unpacked", "resources", "app", "dist", "preload.cjs"),
    "preload",
  );
  writeFileSync(
    path.join(release, "linux-unpacked", "resources", "app", "dist", "renderer", "index.html"),
    "renderer",
  );
  writeFileSync(
    path.join(
      resources,
      "node_modules",
      "better-sqlite3",
      "build",
      "Release",
      "better_sqlite3.node",
    ),
    "native",
  );
  return { root, release };
}

describe("smoke-packaged", () => {
  it("fails when release directory is missing", () => {
    const root = mkdtempSync(path.join(tmpdir(), "donecheck-packaged-missing-"));
    try {
      const result = inspectPackagedArtifacts(path.join(root, "release"));
      expect(result.ok).toBe(false);
      expect(result.lines.some((line) => line.includes("release directory missing"))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("passes when unpacked app, renderer, preload, main, and native module exist", () => {
    const fixture = createReleaseFixture();
    try {
      const result = inspectPackagedArtifacts(fixture.release);
      expect(result.ok).toBe(true);
      expect(result.lines).toEqual(
        expect.arrayContaining([
          "PASS release directory found",
          "PASS AppImage found",
          "PASS unpacked app found",
          "PASS main found",
          "PASS preload found",
          "PASS renderer found",
          "PASS native module found",
          "PASS better_sqlite3 native module found",
          "PASS artifact structure smoke passed",
        ]),
      );
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });
});
