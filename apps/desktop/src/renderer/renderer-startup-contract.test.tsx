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
    expect(html).toContain(">DoneCheck<");
    expect(html).toContain("设置");
    expect(html).toContain("选择项目目录并填写需求后开始分析。");
    expect(html).not.toContain("DoneCheck Desktop");
    expect(html).not.toMatch(/Stage\s*8\.5|阶段\s*8\.5/i);
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
    expect(DESKTOP_API_KEYS).toContain("donecheck:cancel-analysis");
  });

  it("exposes bundled free status and workflow channels without credentials", () => {
    expect(DESKTOP_API_KEYS).toContain("donecheck:bundled-free:status");
    expect(DESKTOP_API_KEYS).toContain("donecheck:bundled-free:preflight");
    expect(DESKTOP_API_KEYS).toContain("donecheck:bundled-free:start-workflow");
  });

  it("exposes history restore so deleted records can be undone", () => {
    expect(DESKTOP_API_KEYS).toContain("donecheck:history:restore");
  });
});
