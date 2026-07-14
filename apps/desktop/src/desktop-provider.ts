import type { LLMProvider } from "@donecheck/core";
import { OpenAIProvider, createDeterministicMockProvider } from "@donecheck/provider-openai";
import { OpenAI } from "openai";
import { fetch as undiciFetch } from "undici";
import { decodeBundledProviderConfig } from "./bundled-provider-config.js";
import type { DesktopSettings } from "./settings-store.js";

export const desktopFetch: typeof globalThis.fetch = undiciFetch as typeof globalThis.fetch;
const desktopOpenAIRequestTimeoutMs = 120_000;

export interface DesktopOpenAIClientOptions {
  readonly apiKey: string;
  readonly baseURL?: string;
  readonly fetch: typeof globalThis.fetch;
  readonly maxRetries: 0;
  readonly timeout: number;
}

export function resolveDesktopOpenAIClientOptions(config: {
  apiKey: string;
  baseURL?: string;
}): DesktopOpenAIClientOptions {
  return {
    apiKey: config.apiKey,
    ...(config.baseURL === undefined ? {} : { baseURL: config.baseURL }),
    fetch: desktopFetch,
    maxRetries: 0,
    timeout: desktopOpenAIRequestTimeoutMs,
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

export interface OpenAICompatibleProviderConfig {
  readonly providerMode: "openai-compatible";
  readonly apiKeySource: "session" | "env";
  readonly baseURL?: string;
  readonly model: string;
}

export type DesktopProviderConfig =
  | { readonly providerMode: "bundled-free" }
  | { readonly providerMode: "mock" }
  | OpenAICompatibleProviderConfig;

export interface DesktopProviderFactory {
  createProvider(): LLMProvider;
  resolveProviderConfig(): DesktopProviderConfig;
  getCredentialStatus(): CredentialStatus;
}

export interface DesktopProviderFactoryOptions {
  readonly credentials: SessionCredentialStore;
  readonly getSettings: () => DesktopSettings;
}

const missingOpenAICompatibleKeyMessage = "Online analysis requires an access key.";

export function createSessionCredentialStore(): SessionCredentialStore {
  let sessionApiKey: string | undefined;
  return {
    clearSessionApiKey: () => {
      sessionApiKey = undefined;
      return envCredentialStatus();
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
      switch (settings.providerMode) {
        case "bundled-free":
          return createBundledProvider();
        case "mock":
          return createDeterministicMockProvider();
        case "openai-compatible":
          return createOpenAICompatibleProvider(settings, options.credentials);
      }
    },
    getCredentialStatus: () => options.credentials.getStatus(),
    resolveProviderConfig: () => {
      const settings = options.getSettings();
      switch (settings.providerMode) {
        case "bundled-free":
          return { providerMode: "bundled-free" };
        case "mock":
          return { providerMode: "mock" };
        case "openai-compatible":
          return resolveOpenAICompatibleConfig(settings, options.credentials);
      }
    },
  };
}

function createBundledProvider(): LLMProvider {
  return createOpenAIProvider(decodeBundledProviderConfig());
}

function createOpenAICompatibleProvider(
  settings: DesktopSettings,
  credentials: SessionCredentialStore,
): LLMProvider {
  const config = resolveOpenAICompatibleConfig(settings, credentials);
  const apiKey = resolveApiKey(credentials);
  if (apiKey === undefined) throw new Error(missingOpenAICompatibleKeyMessage);
  return createOpenAIProvider({ apiKey, ...config });
}

function createOpenAIProvider(config: {
  readonly apiKey: string;
  readonly baseURL?: string;
  readonly model: string;
}): LLMProvider {
  const client = new OpenAI(
    resolveDesktopOpenAIClientOptions({
      apiKey: config.apiKey,
      ...(config.baseURL === undefined ? {} : { baseURL: config.baseURL }),
    }) as never,
  );
  return new OpenAIProvider({
    apiKey: config.apiKey,
    ...(config.baseURL === undefined ? {} : { baseURL: config.baseURL }),
    client,
    model: config.model,
    requestTimeoutMs: desktopOpenAIRequestTimeoutMs,
    structuredOutputStrict: true,
  });
}

function resolveOpenAICompatibleConfig(
  settings: DesktopSettings,
  credentials: SessionCredentialStore,
): OpenAICompatibleProviderConfig {
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
