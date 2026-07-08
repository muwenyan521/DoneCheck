import { fetch as undiciFetch } from "undici";
import { afterEach, describe, expect, it } from "vitest";
import {
  createDesktopProviderFactory,
  createSessionCredentialStore,
  desktopFetch,
  resolveDesktopOpenAIClientOptions,
} from "./desktop-provider.js";
import { defaultDesktopSettings } from "./settings-store.js";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("desktop provider assembly", () => {
  it("uses deterministic mock only when provider mode is explicit mock", () => {
    process.env.OPENAI_API_KEY = "env-key";
    const credentials = createSessionCredentialStore();
    credentials.setSessionApiKey("session-key");
    const factory = createDesktopProviderFactory({
      credentials,
      getSettings: () => ({ ...defaultDesktopSettings, providerMode: "mock" }),
    });

    const provider = factory.createProvider();
    expect(typeof provider.generateObject).toBe("function");
    expect(factory.getCredentialStatus()).toBe("session");
  });

  it("uses session key before environment key for OpenAI-compatible mode", () => {
    process.env.OPENAI_API_KEY = "env-key";
    const credentials = createSessionCredentialStore();
    credentials.setSessionApiKey("session-key");
    const factory = createDesktopProviderFactory({
      credentials,
      getSettings: () => ({
        ...defaultDesktopSettings,
        providerBaseUrl: "https://compatible.example/v1",
        providerMode: "openai-compatible",
        providerModel: "compatible-model",
        structuredOutputStrict: false,
      }),
    });

    const config = factory.resolveProviderConfig();

    expect(config).toEqual({
      apiKeySource: "session",
      baseURL: "https://compatible.example/v1",
      model: "compatible-model",
      providerMode: "openai-compatible",
      structuredOutputStrict: false,
    });
    const provider = factory.createProvider();
    expect(typeof provider.generateObject).toBe("function");
  });

  it("falls back to OPENAI_API_KEY when no session key exists", () => {
    process.env.OPENAI_API_KEY = "env-key";
    process.env.OPENAI_BASE_URL = "https://env-compatible.example/v1";
    process.env.OPENAI_MODEL = "env-model";
    const factory = createDesktopProviderFactory({
      credentials: createSessionCredentialStore(),
      getSettings: () => ({ ...defaultDesktopSettings, providerMode: "openai-compatible" }),
    });

    expect(factory.getCredentialStatus()).toBe("env");
    expect(factory.resolveProviderConfig()).toEqual({
      apiKeySource: "env",
      baseURL: "https://env-compatible.example/v1",
      model: "env-model",
      providerMode: "openai-compatible",
      structuredOutputStrict: true,
    });
  });

  it("returns a clear GUI error instead of silently falling back to mock without a key", () => {
    process.env.OPENAI_API_KEY = undefined;
    const factory = createDesktopProviderFactory({
      credentials: createSessionCredentialStore(),
      getSettings: () => ({ ...defaultDesktopSettings, providerMode: "openai-compatible" }),
    });

    expect(() => factory.createProvider()).toThrow(
      "OpenAI-compatible mode requires an API key. Enter a session key, set OPENAI_API_KEY, or switch to Deterministic mock.",
    );
    expect(factory.getCredentialStatus()).toBe("none");
  });

  it("keeps session credentials in memory only and exposes status without the key", () => {
    const credentials = createSessionCredentialStore();

    expect(credentials.getStatus()).toBe("none");
    credentials.setSessionApiKey("sk-session-only-test-value");
    expect(credentials.getStatus()).toBe("session");
    expect(credentials.getSessionApiKey()).toBe("sk-session-only-test-value");
    expect(credentials.toJSON()).toEqual({ credentialStatus: "session" });
    credentials.clearSessionApiKey();
    expect(credentials.getStatus()).toBe("none");
  });
});

describe("desktopFetch", () => {
  it("is the undici fetch implementation to avoid Electron main runtime fetch instability", () => {
    expect(desktopFetch).toBe(undiciFetch);
    expect(typeof desktopFetch).toBe("function");
  });
});

describe("resolveDesktopOpenAIClientOptions", () => {
  it("injects undici fetch into the OpenAI client config", () => {
    const options = resolveDesktopOpenAIClientOptions({
      apiKey: "sk-test",
      baseURL: "https://compatible.example/v1",
    });

    expect(options.apiKey).toBe("sk-test");
    expect(options.baseURL).toBe("https://compatible.example/v1");
    expect(options.fetch).toBe(undiciFetch);
    expect(options.fetch).toBe(desktopFetch);
  });

  it("omits baseURL when not provided but still injects fetch", () => {
    const options = resolveDesktopOpenAIClientOptions({ apiKey: "sk-test" });

    expect(options.apiKey).toBe("sk-test");
    expect(options.baseURL).toBeUndefined();
    expect(options.fetch).toBe(undiciFetch);
  });
});
