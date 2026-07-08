import type { LLMProvider } from "@donecheck/core";
import { OpenAIProvider, createDeterministicMockProvider } from "@donecheck/provider-openai";
import { OpenAI } from "openai";
import { fetch as undiciFetch } from "undici";
import type { DesktopSettings } from "./settings-store.js";

export const desktopFetch: typeof globalThis.fetch = undiciFetch as typeof globalThis.fetch;

export interface DesktopOpenAIClientOptions {
  readonly apiKey: string;
  readonly baseURL?: string;
  readonly fetch: typeof globalThis.fetch;
}

export function resolveDesktopOpenAIClientOptions(config: {
  apiKey: string;
  baseURL?: string;
}): DesktopOpenAIClientOptions {
  return {
    apiKey: config.apiKey,
    ...(config.baseURL === undefined ? {} : { baseURL: config.baseURL }),
    fetch: desktopFetch,
  };
}

export type CredentialStatus = "none" | "session" | "env";

export interface SessionCredentialStore {
  setSessionApiKey(apiKey: string): CredentialStatus;
  clearSessionApiKey(): CredentialStatus;
  getSessionApiKey(): string | undefined;
  getStatus(): CredentialStatus;
  toJSON(): { readonly credentialStatus: CredentialStatus };
}

export interface DesktopProviderConfig {
  readonly providerMode: "openai-compatible";
  readonly apiKeySource: "session" | "env";
  readonly baseURL?: string;
  readonly model: string;
  readonly structuredOutputStrict: boolean;
}

export interface DesktopProviderFactory {
  createProvider(): LLMProvider;
  resolveProviderConfig(): DesktopProviderConfig;
  getCredentialStatus(): CredentialStatus;
}

export interface DesktopProviderFactoryOptions {
  readonly credentials: SessionCredentialStore;
  readonly getSettings: () => DesktopSettings;
}

const missingOpenAICompatibleKeyMessage =
  "OpenAI-compatible mode requires an API key. Enter a session key, set OPENAI_API_KEY, or switch to Deterministic mock.";

export function createSessionCredentialStore(): SessionCredentialStore {
  let sessionApiKey: string | undefined;
  return {
    clearSessionApiKey: () => {
      sessionApiKey = undefined;
      return "none";
    },
    getSessionApiKey: () => sessionApiKey,
    getStatus: () => (sessionApiKey === undefined ? envCredentialStatus() : "session"),
    setSessionApiKey: (apiKey) => {
      const normalized = apiKey.trim();
      sessionApiKey = normalized.length === 0 ? undefined : normalized;
      return sessionApiKey === undefined ? envCredentialStatus() : "session";
    },
    toJSON: () => ({
      credentialStatus: sessionApiKey === undefined ? envCredentialStatus() : "session",
    }),
  };
}

export function createDesktopProviderFactory(
  options: DesktopProviderFactoryOptions,
): DesktopProviderFactory {
  return {
    createProvider: () => {
      const settings = options.getSettings();
      if (settings.providerMode === "mock") return createDeterministicMockProvider();
      const config = resolveOpenAICompatibleConfig(settings, options.credentials);
      const apiKey = resolveApiKey(options.credentials);
      if (apiKey === undefined) throw new Error(missingOpenAICompatibleKeyMessage);
      const client = new OpenAI(
        resolveDesktopOpenAIClientOptions({
          apiKey,
          ...(config.baseURL === undefined ? {} : { baseURL: config.baseURL }),
        }) as never,
      );
      return new OpenAIProvider({
        client,
        model: config.model,
        structuredOutputStrict: config.structuredOutputStrict,
      });
    },
    getCredentialStatus: () => options.credentials.getStatus(),
    resolveProviderConfig: () =>
      resolveOpenAICompatibleConfig(options.getSettings(), options.credentials),
  };
}

function resolveOpenAICompatibleConfig(
  settings: DesktopSettings,
  credentials: SessionCredentialStore,
): DesktopProviderConfig {
  const sessionApiKey = credentials.getSessionApiKey();
  const envApiKey = process.env.OPENAI_API_KEY;
  const apiKeySource =
    sessionApiKey === undefined ? (envApiKey === undefined ? undefined : "env") : "session";
  if (apiKeySource === undefined || resolveApiKey(credentials) === undefined) {
    throw new Error(missingOpenAICompatibleKeyMessage);
  }
  const baseURL = firstNonEmpty(settings.providerBaseUrl, process.env.OPENAI_BASE_URL);
  return {
    apiKeySource,
    ...(baseURL === undefined ? {} : { baseURL }),
    model: firstNonEmpty(settings.providerModel, process.env.OPENAI_MODEL) ?? "gpt-4o-mini",
    providerMode: "openai-compatible",
    structuredOutputStrict: settings.structuredOutputStrict,
  };
}

function resolveApiKey(credentials: SessionCredentialStore): string | undefined {
  return firstNonEmpty(credentials.getSessionApiKey(), process.env.OPENAI_API_KEY);
}

function envCredentialStatus(): CredentialStatus {
  return firstNonEmpty(process.env.OPENAI_API_KEY) === undefined ? "none" : "env";
}

function firstNonEmpty(...values: readonly (string | undefined)[]): string | undefined {
  return values.find((value) => value !== undefined && value.trim().length > 0)?.trim();
}
