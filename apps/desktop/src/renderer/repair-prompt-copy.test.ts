import { describe, expect, it, vi } from "vitest";
import type { DesktopApi } from "../ipc-contract.js";
import { rendererFixtureReport } from "./fixtures.js";
import { copyRepairPrompt } from "./repair-prompt-copy.js";

describe("copyRepairPrompt", () => {
  it("copies the current report's selected-locale content exactly and returns localized success feedback", async () => {
    const copyRepairPromptContent = vi.fn().mockResolvedValue({ ok: true, data: undefined });
    const api = { copyRepairPrompt: copyRepairPromptContent } as unknown as DesktopApi;

    await expect(
      copyRepairPrompt({ api, locale: "en", report: rendererFixtureReport }),
    ).resolves.toEqual({
      kind: "success",
      message: "Fix instructions copied.",
    });
    expect(copyRepairPromptContent).toHaveBeenCalledWith({ text: "Repair unfulfilled items." });
  });

  it("uses a history-loaded report unchanged and returns localized failure feedback", async () => {
    const historyReport = {
      ...rendererFixtureReport,
      consolidatedRepairPrompt: {
        ...rendererFixtureReport.consolidatedRepairPrompt,
        content: { "zh-CN": "从历史复制的修复内容。", en: "History repair content." },
      },
    };
    const copyRepairPromptContent = vi.fn().mockResolvedValue({
      ok: false,
      error: { code: "unknown", message: "clipboard unavailable" },
    });
    const api = { copyRepairPrompt: copyRepairPromptContent } as unknown as DesktopApi;

    await expect(
      copyRepairPrompt({ api, locale: "zh-CN", report: historyReport }),
    ).resolves.toEqual({
      kind: "error",
      message: "无法复制修复建议，请重试。",
    });
    expect(copyRepairPromptContent).toHaveBeenCalledWith({ text: "从历史复制的修复内容。" });
  });

  it("does not call IPC for empty prompt content", async () => {
    const copyRepairPromptContent = vi.fn();
    const api = { copyRepairPrompt: copyRepairPromptContent } as unknown as DesktopApi;
    const report = {
      ...rendererFixtureReport,
      consolidatedRepairPrompt: {
        ...rendererFixtureReport.consolidatedRepairPrompt,
        content: { "zh-CN": "", en: "" },
      },
    };

    await expect(copyRepairPrompt({ api, locale: "en", report })).resolves.toEqual({
      kind: "empty",
      message: "No fix instructions are available to copy.",
    });
    expect(copyRepairPromptContent).not.toHaveBeenCalled();
  });
});
