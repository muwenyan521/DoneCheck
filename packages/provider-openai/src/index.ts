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

export interface ProviderWithMetadata extends LLMProvider {
  readonly metadata: LLMProviderMetadata;
}

export class OpenAIProvider implements ProviderWithMetadata {
  private readonly client: OpenAI;
  private readonly model: string;
  readonly metadata: LLMProviderMetadata;

  constructor(options: OpenAIProviderOptions = {}) {
    const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new ProviderConfigError(
        "OPENAI_API_KEY is not set. Provide it via env or OpenAIProviderOptions.apiKey.",
      );
    }
    const baseURL =
      options.baseURL ?? (process.env.OPENAI_BASE_URL ? process.env.OPENAI_BASE_URL : undefined);
    this.client =
      options.client ??
      new OpenAI({
        apiKey,
        ...(baseURL === undefined ? {} : { baseURL }),
      });
    this.model = options.model ?? process.env.OPENAI_MODEL ?? "gpt-4o-mini";
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
  const apiKey = process.env.OPENAI_API_KEY;
  if (apiKey && apiKey.length > 0) {
    return new OpenAIProvider({ apiKey });
  }
  const sink = options.stderr ?? ((s: string) => process.stderr.write(s));
  sink(
    "Warning: OPENAI_API_KEY not set; using deterministic mock provider. Set OPENAI_API_KEY to use real OpenAI.\n",
  );
  return createDeterministicMockProvider();
}

function createDeterministicMockProvider(): ProviderWithMetadata {
  const metadata: LLMProviderMetadata = {
    provider: "deterministic-mock",
    model: "mock",
    retries: 0,
  };
  return {
    metadata,
    async generateObject<T>(input: GenerateObjectInput<T>): Promise<GenerateObjectResult<T>> {
      if (input.schemaName === "FileSelectionModelOutput") {
        return {
          object: {
            candidateFiles: [],
            confidence: 0.5,
            reasoningSummary: "mock",
            warnings: ["deterministic-mock"],
          } as unknown as T,
          metadata,
          usage: {},
        };
      }
      return {
        object: {
          confidence: 0.5,
          evidenceRefs: [],
          explanation: "deterministic mock",
          judgementDraft: "partial",
          matchedRequirementId: "REQ-1",
          repairSuggestion: "set OPENAI_API_KEY",
        } as unknown as T,
        metadata,
        usage: {},
      };
    },
  };
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
