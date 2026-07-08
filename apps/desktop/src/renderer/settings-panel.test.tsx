import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { CredentialStatus } from "../desktop-provider.js";
import { type DesktopSettings, defaultDesktopSettings } from "../settings-store.js";
import { ProviderErrorNotice, SettingsPanel } from "./SettingsPanel.js";

describe("SettingsPanel", () => {
  const settings: DesktopSettings = {
    ...defaultDesktopSettings,
    ignore: ["dist", "node_modules"],
    providerMode: "openai-compatible",
    showDebugSections: true,
    structuredOutputStrict: false,
  };

  it("renders provider-agnostic settings and session-only credential copy", () => {
    const html = renderToStaticMarkup(
      <SettingsPanel
        credentialStatus={"session" as CredentialStatus}
        isOpen={true}
        onClearSessionApiKey={() => undefined}
        onClose={() => undefined}
        onSaveSessionApiKey={() => undefined}
        onSettingsChange={() => undefined}
        onSettingsReset={() => undefined}
        settings={settings}
      />,
    );

    expect(html).toContain("Provider mode");
    expect(html).toContain("Deterministic mock");
    expect(html).toContain("OpenAI-compatible");
    expect(html).toContain("Session-only API key");
    expect(html).toContain("This key is kept in memory for this app session only");
    expect(html).toContain("Applies to the next Analyze");
    expect(html).toContain("dist\nnode_modules");
    expect(html).toContain("Base URL");
    expect(html).toContain("Model");
  });

  it("does not render the session key value", () => {
    const html = renderToStaticMarkup(
      <SettingsPanel
        credentialStatus="none"
        isOpen={true}
        onClearSessionApiKey={() => undefined}
        onClose={() => undefined}
        onSaveSessionApiKey={() => undefined}
        onSettingsChange={() => undefined}
        onSettingsReset={() => undefined}
        settings={settings}
      />,
    );

    expect(html).not.toContain("sk-session-only-test-value");
  });
});

describe("ProviderErrorNotice", () => {
  it("renders structured copy and technical details", () => {
    const html = renderToStaticMarkup(
      <ProviderErrorNotice
        error={{
          kind: "upstream-502",
          suggestions: ["Retry later.", "Check Settings > Provider."],
          summary: "The OpenAI-compatible provider request did not complete successfully.",
          technicalDetail: "502 Upstream request failed",
          title: "Provider upstream returned 502",
        }}
        onOpenSettings={() => undefined}
      />,
    );

    expect(html).toContain("Provider upstream returned 502");
    expect(html).toContain("Retry later.");
    expect(html).toContain("Technical details");
    expect(html).toContain("502 Upstream request failed");
  });
});
