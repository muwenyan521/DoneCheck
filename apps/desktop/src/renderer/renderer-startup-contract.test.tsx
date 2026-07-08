import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DESKTOP_API_KEYS } from "../ipc-contract.js";

describe("App startup smoke", () => {
  const originalWindow = (globalThis as { window?: unknown }).window;

  beforeEach(() => {
    (globalThis as { window: unknown }).window = globalThis;
  });

  afterEach(() => {
    if (originalWindow === undefined) {
      (globalThis as { window?: unknown }).window = undefined;
    } else {
      (globalThis as { window: unknown }).window = originalWindow;
    }
  });

  it("mounts without pulling better-sqlite3 into the renderer import chain", async () => {
    const { App } = await import("./App.js");
    const html = renderToStaticMarkup(<App />);
    expect(html).toContain("DoneCheck Desktop");
    expect(html).toContain("Settings");
  });
});

describe("preload/renderer contract", () => {
  it("exposes settings and credentials IPC channels used by the renderer", () => {
    const requiredChannels = [
      "donecheck:settings:get",
      "donecheck:settings:set",
      "donecheck:settings:reset",
      "donecheck:credentials:set-session-api-key",
      "donecheck:credentials:clear-session-api-key",
      "donecheck:credentials:status",
    ];
    for (const channel of requiredChannels) {
      expect(DESKTOP_API_KEYS).toContain(channel);
    }
  });

  it("exposes decompose and analyze IPC channels so the renderer can run the two-step flow", () => {
    expect(DESKTOP_API_KEYS).toContain("donecheck:decompose");
    expect(DESKTOP_API_KEYS).toContain("donecheck:analyze");
  });
});
