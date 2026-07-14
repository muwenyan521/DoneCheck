import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  type DesktopSettings,
  type DesktopSettingsPatch,
  defaultDesktopSettings,
} from "../settings-model.js";
import {
  ProviderErrorNotice,
  SettingsPanel,
  canDismissSettingsPanel,
  createSettingsDraft,
  performSettingsOperation,
  saveSettingsWithSessionApiKey,
  toSettingsPatch,
} from "./SettingsPanel.js";

describe("SettingsPanel", () => {
  const settings: DesktopSettings = {
    ...defaultDesktopSettings,
    ignore: ["dist", "node_modules"],
    providerMode: "openai-compatible",
  };

  it("renders an accessible Chinese dialog without development labels", () => {
    const html = renderToStaticMarkup(
      <SettingsPanel
        credentialStatus="session"
        isOpen={true}
        locale="zh-CN"
        onClearSessionApiKey={async () => ({ ok: true })}
        onClose={() => undefined}
        onSaveSettingsWithSessionApiKey={async () => ({ ok: true })}
        onSettingsReset={async () => ({ ok: true })}
        settings={settings}
      />,
    );

    expect(html).toContain("<dialog");
    expect(html).toContain(' open=""');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain("设置");
    expect(html).toContain("离线检查");
    expect(html).toContain("在线分析");
    expect(html).toContain("仅保留在内存中");
    expect(html).toContain("点击“保存设置”即可启用");
    expect(html).toContain("dist\nnode_modules");
    expect(html).not.toMatch(/Stage|阶段|Deterministic mock|GUI settings center/u);
  });

  it("renders localized English settings", () => {
    const html = renderToStaticMarkup(
      <SettingsPanel
        credentialStatus="none"
        isOpen={true}
        locale="en"
        onClearSessionApiKey={async () => ({ ok: true })}
        onClose={() => undefined}
        onSaveSettingsWithSessionApiKey={async () => ({ ok: true })}
        onSettingsReset={async () => ({ ok: true })}
        settings={{ ...settings, locale: "en" }}
      />,
    );

    expect(html).toContain("Settings");
    expect(html).toContain("Offline analysis");
    expect(html).toContain("Save settings");
    expect(html).not.toContain("保存设置");
    expect(html).not.toMatch(/schema|json|strict|structured|validated/iu);
  });

  it("makes built-in free analysis the visible default without custom credential controls", () => {
    const html = renderToStaticMarkup(
      <SettingsPanel
        credentialStatus="none"
        isOpen={true}
        locale="zh-CN"
        onClearSessionApiKey={async () => ({ ok: true })}
        onClose={() => undefined}
        onSaveSettingsWithSessionApiKey={async () => ({ ok: true })}
        onSettingsReset={async () => ({ ok: true })}
        settings={defaultDesktopSettings}
      />,
    );

    expect(html).toContain("内置免费分析");
    expect(html).toContain("每天可完成 3 次内置免费分析");
    expect(html).not.toContain("在线分析地址");
    expect(html).not.toContain("访问密钥");
  });

  it("builds an isolated draft and commits it as one patch", () => {
    const draft = createSettingsDraft(settings);
    const edited = { ...draft, providerModel: "gpt-test", topK: 8 };

    expect(settings.providerModel).toBe("");
    expect(settings.topK).toBe(5);
    expect(toSettingsPatch(edited)).toMatchObject({ providerModel: "gpt-test", topK: 8 });
  });

  it("keeps the panel open and exposes a local error when an operation fails", async () => {
    const setError = vi.fn();
    const onSuccess = vi.fn();

    await performSettingsOperation({
      failureMessage: "Could not save settings.",
      onSuccess,
      operation: async () => ({ ok: false }),
      setError,
    });

    expect(setError).toHaveBeenCalledWith("Could not save settings.");
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("clears a previous error and closes only after a successful operation", async () => {
    const setError = vi.fn();
    const onSuccess = vi.fn();

    await performSettingsOperation({
      failureMessage: "Could not save settings.",
      onSuccess,
      operation: async () => ({ ok: true }),
      setError,
    });

    expect(setError).toHaveBeenCalledWith(undefined);
    expect(onSuccess).toHaveBeenCalledOnce();
  });

  it("saves provider settings and a session key through one atomic operation", async () => {
    const save = vi.fn(async (patch: DesktopSettingsPatch, apiKey?: string) => {
      expect(patch.providerModel).toBe("compatible-model");
      expect(apiKey).toBe("session-key");
      return { ok: true } as const;
    });

    await expect(
      saveSettingsWithSessionApiKey({
        apiKey: "  session-key  ",
        onSaveSettingsWithSessionApiKey: save,
        patch: { providerModel: "compatible-model" },
      }),
    ).resolves.toEqual({ ok: true });

    expect(save).toHaveBeenCalledOnce();
  });

  it("returns an atomic save failure without inventing a partial result", async () => {
    const save = vi.fn(async () => ({ ok: false }) as const);

    await expect(
      saveSettingsWithSessionApiKey({
        apiKey: "session-key",
        onSaveSettingsWithSessionApiKey: save,
        patch: { providerMode: "openai-compatible" },
      }),
    ).resolves.toEqual({ ok: false });

    expect(save).toHaveBeenCalledOnce();
  });

  it("preserves the current credential when no replacement key is entered", async () => {
    const save = vi.fn(async () => ({ ok: true }) as const);

    await expect(
      saveSettingsWithSessionApiKey({
        apiKey: "   ",
        onSaveSettingsWithSessionApiKey: save,
        patch: { topK: 8 },
      }),
    ).resolves.toEqual({ ok: true });

    expect(save).toHaveBeenCalledWith({ topK: 8 }, undefined);
  });

  it("rejects an oversized session key before changing provider settings", async () => {
    const save = vi.fn(async () => ({ ok: true }) as const);

    await expect(
      saveSettingsWithSessionApiKey({
        apiKey: "x".repeat(16_385),
        onSaveSettingsWithSessionApiKey: save,
        patch: { providerBaseUrl: "https://new-provider.example/v1" },
      }),
    ).resolves.toEqual({ ok: false });

    expect(save).not.toHaveBeenCalled();
  });

  it("does not allow the settings dialog to close while a save is in progress", () => {
    expect(canDismissSettingsPanel(false)).toBe(true);
    expect(canDismissSettingsPanel(true)).toBe(false);
  });
});

describe("ProviderErrorNotice", () => {
  const error = {
    kind: "service-unavailable" as const,
    suggestions: ["Retry later.", "Check Settings > Provider."],
    summary: "Online analysis cannot be completed right now.",
    title: "Online analysis is temporarily unavailable",
  };

  it("localizes recovery guidance without exposing internal error details", () => {
    const html = renderToStaticMarkup(<ProviderErrorNotice error={error} locale="zh-CN" />);

    expect(html).toContain("在线分析暂时不可用");
    expect(html).toContain("稍后重试");
    expect(html).not.toContain("Retry later.");
    expect(html).not.toMatch(/更多信息|502|upstream|data-kind|https?:\/\//iu);
  });
});
