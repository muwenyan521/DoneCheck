import type {
  GenerateObjectInput,
  GenerateObjectResult,
  LLMProvider,
  LLMProviderMetadata,
  LLMUsage,
} from "@donecheck/core";
import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import type { z } from "zod";

export class ProviderConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderConfigError";
  }
}

export interface OpenAIProviderOptions {
  readonly apiKey?: string;
  readonly model?: string;
  readonly baseURL?: string;
  readonly client?: OpenAI;
}

export interface ResolvedOpenAIProviderConfig {
  readonly apiKey: string;
  readonly apiKeySource: "options.apiKey" | "OPENAI_API_KEY";
  readonly baseURL?: string;
  readonly model: string;
}

export interface ProviderWithMetadata extends LLMProvider {
  readonly metadata: LLMProviderMetadata;
}

export class OpenAIProvider implements ProviderWithMetadata {
  private readonly client: OpenAI;
  private readonly model: string;
  readonly metadata: LLMProviderMetadata;

  constructor(options: OpenAIProviderOptions = {}) {
    const config = resolveOpenAIProviderConfig(options);
    this.client =
      options.client ??
      new OpenAI({
        apiKey: config.apiKey,
        ...(config.baseURL === undefined ? {} : { baseURL: config.baseURL }),
      });
    this.model = config.model;
    this.metadata = { provider: "openai", model: this.model, retries: 0 };
  }

  async generateObject<T = unknown>(
    input: GenerateObjectInput<T>,
  ): Promise<GenerateObjectResult<T>> {
    const responseFormat = zodResponseFormat(input.schema as z.ZodType<T>, input.schemaName);
    const completion = await this.client.beta.chat.completions.parse({
      model: this.model,
      messages: [
        { role: "system", content: input.prompt.system },
        { role: "user", content: input.prompt.user },
      ],
      response_format: responseFormat,
    });
    const choice = completion.choices[0];
    const parsed = choice?.message?.parsed;
    if (parsed === undefined || parsed === null) {
      throw new Error(`OpenAI returned no parsed object for schema ${input.schemaName}`);
    }
    const usage = buildUsage(completion.usage);
    const metadata: LLMProviderMetadata = {
      provider: "openai",
      model: completion.model ?? this.model,
      retries: 0,
    };
    return { metadata, object: parsed as T, usage };
  }
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
    "Warning: OPENAI_API_KEY not set; using deterministic mock provider. Set OPENAI_API_KEY to use a real provider.\n",
  );
  return createDeterministicMockProvider();
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
      if (input.schemaName === "FileSelectionModelOutput") {
        const payload = parsePromptPayload(input.prompt.user);
        return {
          object: input.schema.parse({
            candidateFiles: selectDeterministicCandidateFiles(payload),
            confidence: 0.5,
            reasoningSummary:
              "deterministic mock selected files from prompt structure and static signals",
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
          explanation: "deterministic mock — set OPENAI_API_KEY for real analysis",
          judgementDraft: "partial",
          ...matchedIds(payload),
          repairSuggestion: "Set OPENAI_API_KEY to use a real provider.",
        }),
        metadata,
        usage: {},
      };
    },
  };
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
  };
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
        snippetSummary: "deterministic mock could not find candidate evidence snippets",
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
