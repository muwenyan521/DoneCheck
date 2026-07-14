import type {
  GenerateObjectInput,
  GenerateObjectResult,
  LLMProvider,
  LLMProviderMetadata,
  LLMUsage,
} from "@donecheck/core";
import OpenAI from "openai";
import type { z } from "zod";
import {
  type NormalizationGuide,
  buildStrictCompatResponseFormat,
  normalizeProviderOutput,
} from "./structured-output-compat.js";

export class ProviderConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderConfigError";
  }
}

class StructuredOutputCompatibilityError extends Error {
  constructor(schemaName: string) {
    super(`OpenAI response_format compatibility request failed for schema ${schemaName}`);
    this.name = "StructuredOutputCompatibilityError";
  }
}

class MissingStructuredOutputError extends Error {
  constructor(schemaName: string) {
    super(`OpenAI returned no parsed object for schema ${schemaName}`);
    this.name = "MissingStructuredOutputError";
  }
}

class EmptyCompatibilityResponseError extends Error {
  constructor(schemaName: string) {
    super(`OpenAI returned no JSON content for schema ${schemaName}`);
    this.name = "EmptyCompatibilityResponseError";
  }
}

export interface OpenAIProviderOptions {
  readonly apiKey?: string;
  readonly model?: string;
  readonly baseURL?: string;
  readonly client?: OpenAI;
  readonly requestTimeoutMs?: number;
  readonly structuredOutputStrict?: boolean;
}

export interface ResolvedOpenAIProviderConfig {
  readonly apiKey: string;
  readonly apiKeySource: "options.apiKey" | "OPENAI_API_KEY";
  readonly baseURL?: string;
  readonly model: string;
  readonly requestTimeoutMs: number;
  readonly structuredOutputStrict: boolean;
}

export interface ProviderWithMetadata extends LLMProvider {
  readonly metadata: LLMProviderMetadata;
}

export class OpenAIProvider implements ProviderWithMetadata {
  private readonly client: OpenAI;
  private readonly baseURL: string | undefined;
  private readonly compatibilitySchemas = new Set<string>();
  private readonly schemaDiscoveries = new Map<string, Promise<void>>();
  private readonly structuredSchemas = new Set<string>();
  private readonly model: string;
  private readonly structuredOutputStrict: boolean;
  readonly metadata: LLMProviderMetadata;

  constructor(options: OpenAIProviderOptions = {}) {
    const config = resolveOpenAIProviderConfig(options);
    this.client =
      options.client ??
      new OpenAI({
        apiKey: config.apiKey,
        ...(config.baseURL === undefined ? {} : { baseURL: config.baseURL }),
        maxRetries: 0,
        timeout: config.requestTimeoutMs,
      });
    this.model = config.model;
    this.baseURL = config.baseURL;
    this.structuredOutputStrict = config.structuredOutputStrict;
    this.metadata = { provider: "openai", model: this.model, retries: 0 };
  }

  async generateObject<T = unknown>(
    input: GenerateObjectInput<T>,
  ): Promise<GenerateObjectResult<T>> {
    const { guide } = buildStrictCompatResponseFormat(
      input.schema as z.ZodType<T>,
      input.schemaName,
      this.structuredOutputStrict,
    );
    const messages = [
      { role: "system" as const, content: input.prompt.system },
      { role: "user" as const, content: input.prompt.user },
    ];
    if (this.compatibilitySchemas.has(input.schemaName)) {
      return this.generateCompatibleObject(input, messages, guide);
    }
    if (this.structuredSchemas.has(input.schemaName)) {
      return this.generateStructuredObject(input, messages);
    }
    const activeDiscovery = this.schemaDiscoveries.get(input.schemaName);
    if (activeDiscovery !== undefined) {
      await activeDiscovery;
      input.signal?.throwIfAborted();
      if (this.compatibilitySchemas.has(input.schemaName)) {
        return this.generateCompatibleObject(input, messages, guide);
      }
      if (this.structuredSchemas.has(input.schemaName)) {
        return this.generateStructuredObject(input, messages);
      }
    }
    let finishDiscovery: () => void = () => undefined;
    const discovery = new Promise<void>((resolve) => {
      finishDiscovery = resolve;
    });
    this.schemaDiscoveries.set(input.schemaName, discovery);
    try {
      const result = await this.generateStructuredObject(input, messages);
      this.structuredSchemas.add(input.schemaName);
      return result;
    } catch (error) {
      if (!shouldTryCompatibilityMode(error)) throw error;
      this.compatibilitySchemas.add(input.schemaName);
      finishDiscovery();
      return this.generateCompatibleObject(input, messages, guide);
    } finally {
      finishDiscovery();
      if (this.schemaDiscoveries.get(input.schemaName) === discovery) {
        this.schemaDiscoveries.delete(input.schemaName);
      }
    }
  }

  private async generateStructuredObject<T>(
    input: GenerateObjectInput<T>,
    messages: readonly { readonly role: "system" | "user"; readonly content: string }[],
  ): Promise<GenerateObjectResult<T>> {
    const { responseFormat } = buildStrictCompatResponseFormat(
      input.schema as z.ZodType<T>,
      input.schemaName,
      this.structuredOutputStrict,
    );
    const completion = await this.structuredCompletions().parse(
      { model: this.model, messages: [...messages], response_format: responseFormat },
      input.signal === undefined ? undefined : { signal: input.signal },
    );
    const parsed = completion.choices[0]?.message?.parsed;
    if (parsed === undefined || parsed === null) {
      throw new MissingStructuredOutputError(input.schemaName);
    }
    return {
      metadata: {
        provider: "openai",
        model: completion.model ?? this.model,
        retries: 0,
      },
      object: input.schema.parse(parsed),
      usage: buildUsage(completion.usage),
    };
  }

  private async generateCompatibleObject<T>(
    input: GenerateObjectInput<T>,
    messages: readonly { readonly role: "system" | "user"; readonly content: string }[],
    guide: NormalizationGuide,
  ): Promise<GenerateObjectResult<T>> {
    let fallback: Awaited<ReturnType<OpenAI["chat"]["completions"]["create"]>>;
    try {
      fallback = await this.client.chat.completions.create(
        this.buildFallbackRequest(input, messages),
        input.signal === undefined ? undefined : { signal: input.signal },
      );
    } catch (error) {
      if (isUpstreamGatewayError(error)) {
        throw new StructuredOutputCompatibilityError(input.schemaName);
      }
      throw error;
    }
    const { parsed } = await this.parseFallbackContent(
      input,
      fallback.choices[0]?.message?.content,
      messages,
      guide,
    );
    return {
      metadata: {
        provider: "openai",
        model: fallback.model ?? this.model,
        retries: 0,
      },
      object: parsed,
      usage: buildUsage(fallback.usage),
    };
  }

  private structuredCompletions(): OpenAI["chat"]["completions"] {
    const current = this.client.chat?.completions;
    if (typeof current?.parse === "function") return current;
    const compatible = this.client as unknown as {
      readonly beta?: { readonly chat?: { readonly completions?: OpenAI["chat"]["completions"] } };
    };
    const legacy = compatible.beta?.chat?.completions;
    if (typeof legacy?.parse === "function") return legacy;
    throw new Error("The configured OpenAI client does not support structured responses");
  }

  private buildFallbackRequest<T>(
    input: GenerateObjectInput<T>,
    messages: readonly { readonly role: "system" | "user"; readonly content: string }[],
    repairContent?: string,
  ): never {
    return {
      model: this.model,
      messages: [
        ...messages,
        {
          role: "user",
          content: repairContent ?? buildJsonOnlyInstruction(input),
        },
      ],
      stream: false,
      ...resolveReasoningOptions(),
    } as never;
  }

  private async parseFallbackContent<T>(
    input: GenerateObjectInput<T>,
    content: unknown,
    messages: readonly { readonly role: "system" | "user"; readonly content: string }[],
    guide: NormalizationGuide,
  ): Promise<{ parsed: T }> {
    const first = parseAndValidateFallbackContent(input, content, guide);
    if (first.ok) return { parsed: first.value };
    if (first.error instanceof EmptyCompatibilityResponseError) throw first.error;
    const repair = await this.client.chat.completions.create(
      this.buildFallbackRequest(
        input,
        messages,
        buildRepairInstruction(input.schemaName, content, first.error.message),
      ),
      input.signal === undefined ? undefined : { signal: input.signal },
    );
    const second = parseAndValidateFallbackContent(
      input,
      repair.choices[0]?.message?.content,
      guide,
    );
    if (second.ok) return { parsed: second.value };
    throw second.error;
  }
}

function isUnsupportedResponseFormatError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLocaleLowerCase();
  return (
    lower.includes("response_format") &&
    (lower.includes("invalid") ||
      lower.includes("not supported") ||
      lower.includes("unavailable") ||
      lower.includes("unsupported"))
  );
}

function shouldTryCompatibilityMode(error: unknown): boolean {
  return (
    error instanceof MissingStructuredOutputError ||
    isUnsupportedResponseFormatError(error) ||
    isJsonParseError(error) ||
    isUpstreamGatewayError(error)
  );
}

function isUpstreamGatewayError(error: unknown): boolean {
  if (typeof error === "object" && error !== null && "status" in error && error.status === 502) {
    return true;
  }
  const message = error instanceof Error ? error.message : String(error);
  return /\b502\b/u.test(message);
}

function isJsonParseError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLocaleLowerCase();
  return lower.includes("is not valid json") || lower.includes("unexpected token");
}

function resolveReasoningOptions(): Record<string, unknown> {
  const effort = process.env.OPENAI_REASONING_EFFORT;
  if (effort === undefined || effort.length === 0) return {};
  const normalized = effort.toLocaleLowerCase();
  if (!["low", "medium", "high"].includes(normalized)) return {};
  return { reasoning_effort: normalized, thinking: { type: "enabled" } };
}

function buildJsonOnlyInstruction<T>(input: GenerateObjectInput<T>): string {
  const { responseFormat } = buildStrictCompatResponseFormat(
    input.schema as z.ZodType<T>,
    input.schemaName,
    false,
  );
  return [
    `Return only one valid JSON object for schema ${input.schemaName}.`,
    "Do not use Markdown.",
    "Do not wrap the response in a code block.",
    "All required fields in the schema must be present.",
    "Field names must exactly match the schema.",
    "If a value cannot be determined, provide a valid placeholder value of the correct type.",
    "For repairSuggestion, provide a concrete string suggestion instead of omitting it.",
    "For evidenceRefs, use only exact filePath, lineStart, and lineEnd ranges present in the provided evidence snippets.",
    "JSON schema:",
    JSON.stringify(responseFormat.json_schema.schema, null, 2),
  ].join("\n");
}

function buildRepairInstruction(schemaName: string, content: unknown, error: string): string {
  return [
    `The previous response did not validate for schema ${schemaName}.`,
    "Return only the corrected complete JSON object.",
    "Do not use Markdown or code fences.",
    "Previous response:",
    typeof content === "string" ? content : String(content),
    "Validation error:",
    error,
  ].join("\n");
}

function parseAndValidateFallbackContent<T>(
  input: GenerateObjectInput<T>,
  content: unknown,
  guide: NormalizationGuide,
): { ok: true; value: T } | { ok: false; error: Error } {
  if (typeof content !== "string" || content.length === 0) {
    return {
      ok: false,
      error: new EmptyCompatibilityResponseError(input.schemaName),
    };
  }
  try {
    const raw = JSON.parse(extractJsonObject(content));
    const normalized = normalizeProviderOutput(raw, guide);
    return { ok: true, value: input.schema.parse(normalized) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error : new Error(String(error)) };
  }
}

function extractJsonObject(content: string): string {
  const withoutThink = content.replace(/<think>[\s\S]*?<\/think>/giu, "").trim();
  const fenced = withoutThink.match(/```(?:json)?\s*([\s\S]*?)\s*```/u)?.[1];
  const candidate = fenced ?? withoutThink;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return candidate;
  return candidate.slice(start, end + 1);
}

export interface CreateProviderOptions {
  readonly stderr?: (chunk: string) => void;
}

export function createProvider(options: CreateProviderOptions = {}): ProviderWithMetadata {
  const config = resolveOptionalOpenAIProviderConfig();
  if (config !== undefined) {
    return new OpenAIProvider(config);
  }
  const sink = options.stderr ?? ((s: string) => process.stderr.write(s));
  sink(
    "OPENAI_API_KEY is not set. Use --mock for local demo data, or set OPENAI_API_KEY to use an external analysis provider.\n",
  );
  throw new ProviderConfigError(
    "OPENAI_API_KEY is not set. Use --mock for local demo data, or set OPENAI_API_KEY to use an external analysis provider.",
  );
}

export function createDeterministicMockProvider(): ProviderWithMetadata {
  const metadata: LLMProviderMetadata = {
    provider: "deterministic-mock",
    model: "mock",
    retries: 0,
  };
  return {
    metadata,
    async generateObject<T>(input: GenerateObjectInput<T>): Promise<GenerateObjectResult<T>> {
      if (input.schemaName === "RequirementDecompositionOutput") {
        const payload = parsePromptPayload(input.prompt.user);
        return {
          object: input.schema.parse({
            assumptions: [],
            clarifyingQuestions: [],
            claims: parseMarkedItems(payload.claim, "CLAIM"),
            confidence: 0.5,
            requirements: parseMarkedItems(payload.requirement, "REQ"),
            warnings: [],
          }),
          metadata,
          usage: {},
        };
      }
      if (input.schemaName === "FileSelectionModelOutput") {
        const payload = parsePromptPayload(input.prompt.user);
        return {
          object: input.schema.parse({
            candidateFiles: selectDeterministicCandidateFiles(payload),
            confidence: 0.5,
            reasoningSummary:
              "Sample data selected candidate files from the available project information.",
            warnings: ["deterministic-mock"],
          }),
          metadata,
          usage: {},
        };
      }
      const payload = parsePromptPayload(input.prompt.user);
      const evidenceRefs = extractEvidenceRefs(payload);
      return {
        object: input.schema.parse({
          confidence: 0.5,
          evidenceRefs,
          explanation:
            "This result was generated locally and was not reviewed by an external analysis service.",
          judgementDraft: "partial",
          ...matchedIds(payload),
          repairSuggestion:
            "Run this check with the connected analysis service for a complete assessment.",
        }),
        metadata,
        usage: {},
      };
    },
  };
}

function parseMarkedItems(value: unknown, prefix: "CLAIM" | "REQ") {
  if (typeof value !== "string" || value.trim().length === 0) return [];
  const marker = new RegExp(`^\\s*(${prefix}-\\d+)\\s*[:：-]\\s*(.+)$`, "u");
  const items: { id: string; text: string }[] = [];
  for (const rawLine of value.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (line.length === 0) continue;
    const match = line.match(marker);
    if (match !== null) {
      const id = match[1];
      const text = match[2];
      if (id !== undefined && text !== undefined) {
        items.push({ id, text: text.trim() });
      }
    } else if (items.length > 0) {
      const last = items[items.length - 1];
      if (last !== undefined) {
        items[items.length - 1] = { ...last, text: `${last.text} ${line}`.trim() };
      }
    }
  }
  if (items.length > 0) return items;
  return [{ id: `${prefix}-1`, text: value.trim() }];
}

export function resolveOpenAIProviderConfig(
  options: OpenAIProviderOptions = {},
): ResolvedOpenAIProviderConfig {
  const config = resolveOptionalOpenAIProviderConfig(options);
  if (config === undefined) {
    throw new ProviderConfigError(
      "OPENAI_API_KEY is not set. Provide a key via env or OpenAIProviderOptions.apiKey.",
    );
  }
  return config;
}

function resolveOptionalOpenAIProviderConfig(
  options: OpenAIProviderOptions = {},
): ResolvedOpenAIProviderConfig | undefined {
  const apiKey = firstNonEmpty(options.apiKey, process.env.OPENAI_API_KEY);
  if (apiKey === undefined) return undefined;
  const baseURL = firstNonEmpty(options.baseURL, process.env.OPENAI_BASE_URL);
  return {
    apiKey,
    apiKeySource:
      options.apiKey !== undefined && options.apiKey.length > 0
        ? "options.apiKey"
        : "OPENAI_API_KEY",
    ...(baseURL === undefined ? {} : { baseURL }),
    model: firstNonEmpty(options.model, process.env.OPENAI_MODEL) ?? "gpt-4o-mini",
    requestTimeoutMs: resolveRequestTimeoutMs(options.requestTimeoutMs),
    structuredOutputStrict: resolveStructuredOutputStrict(options.structuredOutputStrict),
  };
}

function resolveRequestTimeoutMs(value: number | undefined): number {
  if (value === undefined) return 120_000;
  if (!Number.isFinite(value) || value <= 0) {
    throw new ProviderConfigError("requestTimeoutMs must be a positive finite number.");
  }
  return value;
}

function resolveStructuredOutputStrict(value: boolean | undefined): boolean {
  if (value !== undefined) return value;
  const env = process.env.OPENAI_STRUCTURED_OUTPUT_STRICT;
  if (env === undefined || env.length === 0) return true;
  const normalized = env.toLocaleLowerCase();
  if (["true", "1", "yes"].includes(normalized)) return true;
  if (["false", "0", "no"].includes(normalized)) return false;
  throw new ProviderConfigError(
    "OPENAI_STRUCTURED_OUTPUT_STRICT must be one of true, false, 1, 0, yes, or no.",
  );
}

function firstNonEmpty(...values: readonly (string | undefined)[]): string | undefined {
  return values.find((value) => value !== undefined && value.length > 0);
}

function parsePromptPayload(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function selectDeterministicCandidateFiles(payload: Record<string, unknown>): string[] {
  const structureFiles = parseStructureSummary(payload.structureSummary);
  const staticFiles = Array.isArray(payload.staticSignals)
    ? payload.staticSignals.flatMap((signal) => {
        if (signal === null || typeof signal !== "object") return [];
        const filePath = (signal as { filePath?: unknown }).filePath;
        return typeof filePath === "string" ? [filePath] : [];
      })
    : [];
  const selected = [...staticFiles, ...structureFiles].filter((filePath) =>
    /\.(ts|tsx|js|jsx|mjs|cjs|json|md|txt)$/u.test(filePath),
  );
  return [...new Set(selected)].slice(0, 20);
}

function parseStructureSummary(value: unknown): string[] {
  if (typeof value !== "string") return [];
  return value
    .split("\n")
    .map((line) => line.match(/^(.+?)\s+\(\d+ lines\)$/u)?.[1])
    .filter((filePath): filePath is string => filePath !== undefined);
}

function extractEvidenceRefs(payload: Record<string, unknown>) {
  if (!Array.isArray(payload.evidenceSnippets) || payload.evidenceSnippets.length === 0) {
    return [
      {
        filePath: "deterministic-mock-no-snippet",
        lineEnd: 1,
        lineStart: 1,
        snippetSummary: "No candidate evidence snippets were available in local demo mode.",
      },
    ];
  }
  return payload.evidenceSnippets.slice(0, 2).flatMap((snippet) => {
    if (snippet === null || typeof snippet !== "object") return [];
    const ref = snippet as {
      filePath?: unknown;
      lineEnd?: unknown;
      lineStart?: unknown;
      summary?: unknown;
    };
    return typeof ref.filePath === "string" &&
      typeof ref.lineStart === "number" &&
      typeof ref.lineEnd === "number"
      ? [
          {
            filePath: ref.filePath,
            lineEnd: ref.lineEnd,
            lineStart: ref.lineStart,
            snippetSummary: typeof ref.summary === "string" ? ref.summary : ref.filePath,
          },
        ]
      : [];
  });
}

function matchedIds(payload: Record<string, unknown>): {
  readonly matchedClaimId?: string;
  readonly matchedRequirementId?: string;
} {
  const result: { matchedClaimId?: string; matchedRequirementId?: string } = {};
  const requirement = payload.requirement;
  if (requirement !== null && typeof requirement === "object") {
    const id = (requirement as { id?: unknown }).id;
    if (typeof id === "string") result.matchedRequirementId = id;
  }
  const claim = payload.claim;
  if (claim !== null && typeof claim === "object") {
    const id = (claim as { id?: unknown }).id;
    if (typeof id === "string") result.matchedClaimId = id;
  }
  return result;
}

function buildUsage(
  raw:
    | {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
      }
    | undefined,
): LLMUsage {
  const usage: { inputTokens?: number; outputTokens?: number; totalTokens?: number } = {};
  if (raw?.prompt_tokens !== undefined) usage.inputTokens = raw.prompt_tokens;
  if (raw?.completion_tokens !== undefined) usage.outputTokens = raw.completion_tokens;
  if (raw?.total_tokens !== undefined) usage.totalTokens = raw.total_tokens;
  return usage;
}

export type {
  GenerateObjectInput,
  GenerateObjectResult,
  LLMProvider,
  LLMProviderMetadata,
  LLMUsage,
} from "@donecheck/core";
