import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BundledFreeQuotaExhaustedError,
  BundledFreeWorkflowError,
  createBundledFreeQuotaStore,
  createBundledFreeWorkflowManager,
} from "./bundled-free-quota.js";

function fixedClock(iso: string) {
  return { now: () => new Date(iso) };
}

describe("bundled free quota", () => {
  it("reserves exactly three workflows and persists the fourth rejection", () => {
    const databasePath = join(tmpdir(), `donecheck-quota-${crypto.randomUUID()}.sqlite`);
    const first = createBundledFreeQuotaStore({
      clock: fixedClock("2026-07-13T08:00:00+08:00"),
      databasePath,
    });
    expect(first.reserve()).toMatchObject({ ok: true, status: { remaining: 2, used: 1 } });
    expect(first.reserve()).toMatchObject({ ok: true, status: { remaining: 1, used: 2 } });
    first.close();

    const reopened = createBundledFreeQuotaStore({
      clock: fixedClock("2026-07-13T10:00:00+08:00"),
      databasePath,
    });
    expect(reopened.reserve()).toMatchObject({ ok: true, status: { remaining: 0, used: 3 } });
    expect(reopened.reserve()).toMatchObject({ ok: false, status: { remaining: 0, used: 3 } });
    reopened.close();
  });

  it("uses one atomic limit across two independent database connections", () => {
    const databasePath = join(tmpdir(), `donecheck-quota-${crypto.randomUUID()}.sqlite`);
    const options = { clock: fixedClock("2026-07-13T08:00:00+08:00"), databasePath };
    const first = createBundledFreeQuotaStore(options);
    const second = createBundledFreeQuotaStore(options);

    const results = [first.reserve(), second.reserve(), first.reserve(), second.reserve()];

    expect(results.filter((result) => result.ok)).toHaveLength(3);
    expect(first.status()).toMatchObject({ remaining: 0, used: 3 });
    expect(second.status()).toMatchObject({ remaining: 0, used: 3 });
    first.close();
    second.close();
  });

  it("resets on the next host-local calendar date", () => {
    let now = new Date(2026, 6, 13, 23, 59, 0);
    const store = createBundledFreeQuotaStore({ clock: { now: () => now } });
    store.reserve();
    store.reserve();
    store.reserve();
    expect(store.status().remaining).toBe(0);

    now = new Date(2026, 6, 14, 0, 0, 0);
    expect(store.status()).toMatchObject({ remaining: 3, used: 0 });
    expect(store.reserve()).toMatchObject({ ok: true, status: { remaining: 2 } });
    store.close();
  });
});

describe("bundled free workflow manager", () => {
  const binding = {
    ignore: ["dist"],
    providerMode: "bundled-free" as const,
    requestId: "request-1",
    workspaceDir: "/workspace/demo",
  };

  it("permits one ordered decompose and analyze transition", () => {
    const store = createBundledFreeQuotaStore({});
    const manager = createBundledFreeWorkflowManager(store);
    const reservation = manager.reserve(binding);

    expect(manager.consumeDecompose(reservation.token, binding).stage).toBe("decomposed");
    expect(manager.consumeAnalyze(reservation.token, binding).stage).toBe("terminal");
    expect(() => manager.consumeAnalyze(reservation.token, binding)).toThrow(
      BundledFreeWorkflowError,
    );
    expect(store.status().used).toBe(1);
    store.close();
  });

  it("rejects out-of-order use, mismatched requests, cancellation, and exhausted quota", () => {
    const store = createBundledFreeQuotaStore({});
    const manager = createBundledFreeWorkflowManager(store);
    const first = manager.reserve(binding);
    expect(() => manager.consumeAnalyze(first.token, binding)).toThrow(BundledFreeWorkflowError);

    const second = manager.reserve({ ...binding, requestId: "request-2" });
    expect(() =>
      manager.consumeDecompose(second.token, { ...binding, requestId: "wrong" }),
    ).toThrow(BundledFreeWorkflowError);

    const thirdBinding = { ...binding, requestId: "request-3" };
    const third = manager.reserve(thirdBinding);
    manager.cancelByRequestId(thirdBinding.requestId);
    expect(() => manager.consumeDecompose(third.token, thirdBinding)).toThrow(
      BundledFreeWorkflowError,
    );
    expect(() => manager.reserve({ ...binding, requestId: "request-4" })).toThrow(
      BundledFreeQuotaExhaustedError,
    );
    store.close();
  });
});
