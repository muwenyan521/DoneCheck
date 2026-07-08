import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { evaluateGuiSmokeReadyFile, runStartWithElectronAbi } from "./start-with-electron-abi.mjs";

function createRecorder(failures = {}) {
  const calls = [];
  return {
    calls,
    runner(command, args) {
      const key = [command, ...args].join(" ");
      calls.push(key);
      return { status: failures[key] ?? 0 };
    },
  };
}

describe("start-with-electron-abi", () => {
  it("start mode runs build, electron:rebuild, electron, then rebuild:node in finally", () => {
    const recorder = createRecorder();
    const result = runStartWithElectronAbi(["start"], recorder.runner);
    expect(result).toBe(0);
    expect(recorder.calls).toEqual([
      "pnpm build",
      "pnpm electron:rebuild",
      "pnpm exec electron --no-sandbox dist/electron.cjs",
      "pnpm rebuild:node",
    ]);
  });

  it("smoke mode passes smoke env to electron and restores Node ABI in finally", () => {
    const captured = [];
    const runner = (command, args, opts) => {
      captured.push({ key: [command, ...args].join(" "), env: opts?.env });
      return { status: 0 };
    };
    const readyDir = mkdtempSync(path.join(tmpdir(), "donecheck-start-smoke-"));
    const readyFile = path.join(readyDir, "ready.json");
    writeFileSync(
      readyFile,
      JSON.stringify({ ok: true, rendererLoaded: true, nativeStorage: true }),
    );
    const result = runStartWithElectronAbi(["smoke"], runner, { readyFile });
    expect(result).toBe(0);
    const electronCall = captured.find((c) => c.key.startsWith("pnpm exec electron"));
    expect(electronCall.env.DONECHECK_GUI_SMOKE_READY_FILE).toBe(readyFile);
    expect(electronCall.env.DONECHECK_GUI_SMOKE).toBe("1");
    expect(captured.at(-1).key).toBe("pnpm rebuild:node");
    rmSync(readyDir, { recursive: true, force: true });
  });

  it("smoke mode fails when ready file reports renderer not loaded", () => {
    const readyDir = mkdtempSync(path.join(tmpdir(), "donecheck-start-smoke-fail-"));
    const readyFile = path.join(readyDir, "ready.json");
    writeFileSync(
      readyFile,
      JSON.stringify({
        ok: false,
        rendererLoaded: false,
        nativeStorage: false,
        error: "did-finish-load timeout",
      }),
    );
    const runner = () => ({ status: 0 });
    const result = runStartWithElectronAbi(["smoke"], runner, { readyFile });
    expect(result).not.toBe(0);
    rmSync(readyDir, { recursive: true, force: true });
  });

  it("smoke mode fails when ready file is missing", () => {
    const runner = () => ({ status: 0 });
    const result = runStartWithElectronAbi(["smoke"], runner, {
      readyFile: "/tmp/donecheck-nonexistent-ready.json",
    });
    expect(result).not.toBe(0);
  });

  it("does not run rebuild:node when build fails before electron:rebuild", () => {
    const recorder = createRecorder({ "pnpm build": 2 });
    const result = runStartWithElectronAbi(["start"], recorder.runner);
    expect(result).toBe(2);
    expect(recorder.calls).toEqual(["pnpm build"]);
  });

  it("restores Node ABI in finally when electron launch fails after electron:rebuild", () => {
    const recorder = createRecorder({ "pnpm exec electron --no-sandbox dist/electron.cjs": 7 });
    const result = runStartWithElectronAbi(["start"], recorder.runner);
    expect(result).toBe(7);
    expect(recorder.calls).toEqual([
      "pnpm build",
      "pnpm electron:rebuild",
      "pnpm exec electron --no-sandbox dist/electron.cjs",
      "pnpm rebuild:node",
    ]);
  });

  it("returns non-zero for unknown mode", () => {
    const recorder = createRecorder();
    const result = runStartWithElectronAbi(["bogus"], recorder.runner);
    expect(result).toBe(1);
    expect(recorder.calls).toEqual([]);
  });

  it("evaluateGuiSmokeReadyFile passes only on ok+rendererLoaded+nativeStorage", () => {
    expect(
      evaluateGuiSmokeReadyFile(
        JSON.stringify({ ok: true, rendererLoaded: true, nativeStorage: true }),
      ),
    ).toEqual(expect.objectContaining({ ok: true }));
    expect(
      evaluateGuiSmokeReadyFile(
        JSON.stringify({ ok: true, rendererLoaded: false, nativeStorage: true }),
      ).ok,
    ).toBe(false);
    expect(
      evaluateGuiSmokeReadyFile(
        JSON.stringify({ ok: true, rendererLoaded: true, nativeStorage: false }),
      ).ok,
    ).toBe(false);
    expect(evaluateGuiSmokeReadyFile("not json").ok).toBe(false);
    expect(evaluateGuiSmokeReadyFile(undefined).ok).toBe(false);
  });
});
