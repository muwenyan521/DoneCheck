import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildSmokeReadyPayload, smokeSettingsRoundtrip } from "./gui-smoke-hook.js";

describe("buildSmokeReadyPayload", () => {
  it("builds ok payload when renderer loaded and storage ok", () => {
    const payload = buildSmokeReadyPayload({
      rendererLoaded: true,
      storageOk: true,
      durationMs: 50,
    });
    expect(payload).toMatchObject({ ok: true, rendererLoaded: true, nativeStorage: true });
    expect(payload.error).toBeNull();
    expect(payload.details).toEqual({ settingsRoundtrip: true, resetVerified: true });
  });

  it("builds fail payload when renderer did not load", () => {
    const payload = buildSmokeReadyPayload({
      rendererLoaded: false,
      storageOk: false,
      durationMs: 5000,
      error: "did-finish-load timeout",
    });
    expect(payload.ok).toBe(false);
    expect(payload.rendererLoaded).toBe(false);
    expect(payload.error).toBe("did-finish-load timeout");
  });

  it("builds fail payload when storage roundtrip failed", () => {
    const payload = buildSmokeReadyPayload({
      rendererLoaded: true,
      storageOk: false,
      durationMs: 12,
      error: "settings roundtrip failed",
    });
    expect(payload.ok).toBe(false);
    expect(payload.nativeStorage).toBe(false);
  });
});

describe("smokeSettingsRoundtrip", () => {
  it("does a real get/set/reset roundtrip on a temp sqlite file", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "donecheck-smoke-hook-"));
    try {
      const dbPath = path.join(dir, "smoke.sqlite");
      const result = smokeSettingsRoundtrip(dbPath);
      expect(result.ok).toBe(true);
      expect(result.resetVerified).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("fails fast for an unwritable storage path", () => {
    const result = smokeSettingsRoundtrip("/definitely-missing/donecheck-smoke.db");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/unable to open|cannot open/i);
  });
});
