import { EventEmitter } from "node:events";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createPackage } from "@electron/asar";
import { describe, expect, it } from "vitest";
import {
  evaluateGuiSmokeResult,
  findUnpackedExecutable,
  inspectPackagedArtifacts,
  runPackagedGuiSmoke,
} from "./smoke-packaged.mjs";

function createReleaseFixture(
  indexHtml = '<script type="module" src="./assets/app.js"></script><link rel="stylesheet" href="./assets/app.css">',
) {
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
  writeFileSync(path.join(release, "linux-unpacked", "donecheck-desktop"), "binary");
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
    indexHtml,
  );
  mkdirSync(
    path.join(release, "linux-unpacked", "resources", "app", "dist", "renderer", "assets"),
    { recursive: true },
  );
  writeFileSync(
    path.join(
      release,
      "linux-unpacked",
      "resources",
      "app",
      "dist",
      "renderer",
      "assets",
      "app.js",
    ),
    "app",
  );
  writeFileSync(
    path.join(
      release,
      "linux-unpacked",
      "resources",
      "app",
      "dist",
      "renderer",
      "assets",
      "app.css",
    ),
    "style",
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

async function createAsarFixture({
  includeRenderer = false,
  includeAppImage = true,
  indexHtml = '<script type="module" src="./assets/app.js"></script><link rel="stylesheet" href="./assets/app.css">',
} = {}) {
  const root = mkdtempSync(path.join(tmpdir(), "donecheck-asar-"));
  const release = path.join(root, "release");
  const unpacked = path.join(release, "linux-unpacked");
  const resources = path.join(unpacked, "resources");
  const appDir = path.join(root, "app");

  mkdirSync(path.join(appDir, "dist"), { recursive: true });
  writeFileSync(
    path.join(appDir, "dist", "electron.cjs"),
    'const path=require("path");win.loadFile(path.resolve(__dirname,"renderer","index.html"));',
  );
  writeFileSync(path.join(appDir, "dist", "preload.cjs"), "preload");
  if (includeRenderer) {
    mkdirSync(path.join(appDir, "dist", "renderer", "assets"), { recursive: true });
    writeFileSync(path.join(appDir, "dist", "renderer", "index.html"), indexHtml);
    writeFileSync(path.join(appDir, "dist", "renderer", "assets", "app.js"), "app");
    writeFileSync(path.join(appDir, "dist", "renderer", "assets", "app.css"), "style");
  }
  writeFileSync(path.join(appDir, "package.json"), '{"name":"donecheck-desktop"}');

  mkdirSync(resources, { recursive: true });
  await createPackage(appDir, path.join(resources, "app.asar"));

  mkdirSync(
    path.join(resources, "app.asar.unpacked", "node_modules", "better-sqlite3", "build", "Release"),
    { recursive: true },
  );
  writeFileSync(
    path.join(
      resources,
      "app.asar.unpacked",
      "node_modules",
      "better-sqlite3",
      "build",
      "Release",
      "better_sqlite3.node",
    ),
    "native",
  );

  if (includeAppImage) {
    writeFileSync(path.join(release, "DoneCheck Desktop-0.0.0.AppImage"), "appimage");
  }
  writeFileSync(path.join(unpacked, "DoneCheck Desktop"), "binary");

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

  it("fails when asar has no renderer entry even though electron.cjs mentions index.html", async () => {
    const fixture = await createAsarFixture({ includeRenderer: false });
    try {
      const result = inspectPackagedArtifacts(fixture.release);
      expect(result.ok).toBe(false);
      expect(result.lines.some((line) => line.startsWith("FAIL renderer found"))).toBe(true);
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  it("passes when asar contains renderer entry", async () => {
    const fixture = await createAsarFixture({ includeRenderer: true });
    try {
      const result = inspectPackagedArtifacts(fixture.release);
      expect(result.ok).toBe(true);
      expect(result.lines.some((line) => line.startsWith("PASS renderer found"))).toBe(true);
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  it("passes dir-only package without AppImage when asar structure is correct", async () => {
    const fixture = await createAsarFixture({ includeRenderer: true, includeAppImage: false });
    try {
      const result = inspectPackagedArtifacts(fixture.release);
      expect(result.ok).toBe(true);
      expect(result.lines.some((line) => line.startsWith("PASS renderer found"))).toBe(true);
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  it("fails when renderer asset paths are absolute", async () => {
    const fixture = await createAsarFixture({
      includeRenderer: true,
      indexHtml:
        '<script type="module" src="/assets/app.js"></script><link rel="stylesheet" href="/assets/app.css">',
    });
    try {
      const result = inspectPackagedArtifacts(fixture.release);
      expect(result.ok).toBe(false);
      expect(
        result.lines.some((line) => line.includes("FAIL renderer asset path is absolute")),
      ).toBe(true);
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  it("passes when renderer asset paths are relative", async () => {
    const fixture = await createAsarFixture({
      includeRenderer: true,
      indexHtml:
        '<script type="module" src="./assets/app.js"></script><link rel="stylesheet" href="./assets/app.css">',
    });
    try {
      const result = inspectPackagedArtifacts(fixture.release);
      expect(result.ok).toBe(true);
      expect(result.lines).toEqual(
        expect.arrayContaining([
          "PASS renderer asset paths are relative",
          "PASS artifact structure smoke passed",
        ]),
      );
      expect(result.lines.some((line) => line.includes("FAIL renderer asset path"))).toBe(false);
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  it("fails when renderer entries exist but index html points at absolute assets", async () => {
    const fixture = await createAsarFixture({
      includeRenderer: true,
      indexHtml: '<script type="module" src="/assets/app.js"></script>',
    });
    try {
      const result = inspectPackagedArtifacts(fixture.release);
      expect(result.ok).toBe(false);
      expect(result.lines.some((line) => line.startsWith("PASS renderer found"))).toBe(true);
      expect(
        result.lines.some((line) => line.includes("FAIL renderer asset path is absolute")),
      ).toBe(true);
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });
});

describe("evaluateGuiSmokeResult", () => {
  it("passes only when ok, rendererLoaded, and nativeStorage are all true", () => {
    expect(evaluateGuiSmokeResult({ ok: true, rendererLoaded: true, nativeStorage: true }).ok).toBe(
      true,
    );
    expect(
      evaluateGuiSmokeResult({ ok: true, rendererLoaded: false, nativeStorage: true }).ok,
    ).toBe(false);
    expect(
      evaluateGuiSmokeResult({ ok: true, rendererLoaded: true, nativeStorage: false }).ok,
    ).toBe(false);
    expect(
      evaluateGuiSmokeResult({ ok: false, rendererLoaded: true, nativeStorage: true }).ok,
    ).toBe(false);
  });

  it("fails when payload is missing or unparseable", () => {
    expect(evaluateGuiSmokeResult(undefined).ok).toBe(false);
    expect(evaluateGuiSmokeResult(null).ok).toBe(false);
    expect(evaluateGuiSmokeResult("not-json").ok).toBe(false);
  });

  it("does not pass on file existence alone — requires positive nativeStorage flag", () => {
    expect(evaluateGuiSmokeResult({ ok: true, rendererLoaded: true }).ok).toBe(false);
  });
});

describe("findUnpackedExecutable", () => {
  it("locates the linux-unpacked executable", () => {
    const fixture = createReleaseFixture();
    try {
      const exe = findUnpackedExecutable(fixture.release, "linux");
      expect(exe).toBeTruthy();
      expect(exe.endsWith("donecheck-desktop")).toBe(true);
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  it("returns undefined when no unpacked dir exists", () => {
    const root = mkdtempSync(path.join(tmpdir(), "donecheck-no-unpacked-"));
    try {
      expect(findUnpackedExecutable(root, "linux")).toBeUndefined();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

function createMockSpawn({ exitCode = 0, stderrData = "", stdoutData = "", delay = 0 } = {}) {
  const captured = { exe: null, args: null, env: null };
  const spawn = (exe, args, options) => {
    captured.exe = exe;
    captured.args = args;
    captured.env = options?.env;
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    setTimeout(() => {
      if (stdoutData) child.stdout.emit("data", stdoutData);
      if (stderrData) child.stderr.emit("data", stderrData);
      child.emit("exit", exitCode);
    }, delay);
    return child;
  };
  return { spawn, captured };
}

describe("runPackagedGuiSmoke", () => {
  it("passes --no-sandbox to the packaged executable", async () => {
    const fixture = createReleaseFixture();
    try {
      const { spawn, captured } = createMockSpawn({ exitCode: 1 });
      await runPackagedGuiSmoke({
        releaseDir: fixture.release,
        platform: "linux",
        spawn,
      });
      expect(captured.args).toContain("--no-sandbox");
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  it("prints child exitCode, stderr, and stdout when ready file is missing", async () => {
    const fixture = createReleaseFixture();
    try {
      const { spawn } = createMockSpawn({
        exitCode: 1,
        stderrData: "Failed to move to new namespace: Operation not permitted",
        stdoutData: "some diagnostic output",
      });
      const result = await runPackagedGuiSmoke({
        releaseDir: fixture.release,
        platform: "linux",
        spawn,
      });
      expect(result.ok).toBe(false);
      expect(result.lines.some((line) => line.includes("child exitCode=1"))).toBe(true);
      expect(result.lines.some((line) => line.includes("Failed to move to new namespace"))).toBe(
        true,
      );
      expect(result.lines.some((line) => line.includes("some diagnostic output"))).toBe(true);
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  it("does not print diagnostics when ready file contains a passing payload", async () => {
    const fixture = createReleaseFixture();
    try {
      const readyFile = path.join(fixture.release, `gui-smoke-ready-${process.pid}.json`);
      writeFileSync(
        readyFile,
        '{"ok":true,"rendererLoaded":true,"nativeStorage":true,"details":{"settingsRoundtrip":true,"resetVerified":true},"error":null,"durationMs":100}\n',
      );
      const { spawn } = createMockSpawn({ exitCode: 0 });
      const result = await runPackagedGuiSmoke({
        releaseDir: fixture.release,
        platform: "linux",
        spawn,
      });
      expect(result.ok).toBe(true);
      expect(result.lines.some((line) => line.includes("child exitCode"))).toBe(false);
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });
});
