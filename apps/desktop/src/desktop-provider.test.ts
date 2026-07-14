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
  it("creates the bundled provider without session or environment credentials", () => {
    Reflect.deleteProperty(process.env, "OPENAI_API_KEY");
    Reflect.deleteProperty(process.env, "OPENAI_BASE_URL");
    Reflect.deleteProperty(process.env, "OPENAI_MODEL");
    const factory = createDesktopProviderFactory({
      credentials: createSessionCredentialStore(),
      getSettings: () => ({ ...defaultDesktopSettings, providerMode: "bundled-free" }),
    });

    expect(() => factory.createProvider()).not.toThrow();
    expect(factory.resolveProviderConfig()).toEqual({ providerMode: "bundled-free" });
  });

  it("does not expose bundled credentials through serialized public factory config", () => {
    const factory = createDesktopProviderFactory({
      credentials: createSessionCredentialStore(),
      getSettings: () => ({ ...defaultDesktopSettings, providerMode: "bundled-free" }),
    });

    expect(Object.keys(factory.resolveProviderConfig())).toEqual(["providerMode"]);
  });

  it("ignores OpenAI environment overrides for the bundled provider", () => {
    process.env.OPENAI_API_KEY = "override-key";
    process.env.OPENAI_BASE_URL = "https://override.invalid/v1";
    process.env.OPENAI_MODEL = "override-model";
    const factory = createDesktopProviderFactory({
      credentials: createSessionCredentialStore(),
      getSettings: () => ({ ...defaultDesktopSettings, providerMode: "bundled-free" }),
    });

    expect(() => factory.createProvider()).not.toThrow();
    expect(factory.resolveProviderConfig()).toEqual({ providerMode: "bundled-free" });
  });

  it("uses local demo data only when provider mode is explicit mock", () => {
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
      }),
    });

    const config = factory.resolveProviderConfig();

    expect(config).toEqual({
      apiKeySource: "session",
      baseURL: "https://compatible.example/v1",
      model: "compatible-model",
      providerMode: "openai-compatible",
    });
    const provider = factory.createProvider();
    expect(typeof provider.generateObject).toBe("function");
  });

  it("creates an OpenAI-compatible provider from a GUI session key without an environment key", () => {
    Reflect.deleteProperty(process.env, "OPENAI_API_KEY");
    const credentials = createSessionCredentialStore();
    credentials.setSessionApiKey("session-key");
    const factory = createDesktopProviderFactory({
      credentials,
      getSettings: () => ({
        ...defaultDesktopSettings,
        providerMode: "openai-compatible",
      }),
    });

    expect(() => factory.createProvider()).not.toThrow();
    expect(factory.getCredentialStatus()).toBe("session");
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
    });
  });

  it("returns a clear GUI error instead of silently falling back to mock without a key", () => {
    Reflect.deleteProperty(process.env, "OPENAI_API_KEY");
    const factory = createDesktopProviderFactory({
      credentials: createSessionCredentialStore(),
      getSettings: () => ({ ...defaultDesktopSettings, providerMode: "openai-compatible" }),
    });

    expect(() => factory.createProvider()).toThrow("Online analysis requires an access key.");
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

  it("falls back to environment credential status after clearing a session key", () => {
    process.env.OPENAI_API_KEY = "env-key";
    const credentials = createSessionCredentialStore();
    credentials.setSessionApiKey("session-key");

    expect(credentials.clearSessionApiKey()).toBe("env");
    expect(credentials.getStatus()).toBe("env");
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
    expect(options.maxRetries).toBe(0);
    expect(options.timeout).toBe(120_000);
  });

  it("omits baseURL when not provided but still injects fetch", () => {
    const options = resolveDesktopOpenAIClientOptions({ apiKey: "sk-test" });

    expect(options.apiKey).toBe("sk-test");
    expect(options.baseURL).toBeUndefined();
    expect(options.fetch).toBe(undiciFetch);
    expect(options.maxRetries).toBe(0);
    expect(options.timeout).toBe(120_000);
  });
});
