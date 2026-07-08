import { createSettingsStore } from "./settings-store.js";

export interface SmokeReadyPayload {
  readonly ok: boolean;
  readonly rendererLoaded: boolean;
  readonly nativeStorage: boolean;
  readonly details: { readonly settingsRoundtrip: boolean; readonly resetVerified: boolean };
  readonly error: string | null;
  readonly durationMs: number;
}

export interface SmokeRoundtripResult {
  readonly ok: boolean;
  readonly resetVerified: boolean;
  readonly error?: string;
}

export function buildSmokeReadyPayload(input: {
  readonly rendererLoaded: boolean;
  readonly storageOk: boolean;
  readonly durationMs: number;
  readonly error?: string | null;
}): SmokeReadyPayload {
  const ok = input.rendererLoaded && input.storageOk;
  return {
    ok,
    rendererLoaded: input.rendererLoaded,
    nativeStorage: input.storageOk,
    details: { settingsRoundtrip: input.storageOk, resetVerified: input.storageOk },
    error: input.error ?? null,
    durationMs: input.durationMs,
  };
}

export function smokeSettingsRoundtrip(databasePath: string): SmokeRoundtripResult {
  try {
    const store = createSettingsStore({ databasePath });
    try {
      const before = store.get();
      const defaultTopK = before.topK;
      const patched = store.set({ topK: defaultTopK + 1 });
      if (patched.topK !== defaultTopK + 1) {
        return { ok: false, resetVerified: false, error: "set did not persist topK" };
      }
      const afterReset = store.reset();
      const resetVerified = afterReset.topK === defaultTopK;
      return { ok: resetVerified, resetVerified };
    } finally {
      store.close();
    }
  } catch (error) {
    return {
      ok: false,
      resetVerified: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
