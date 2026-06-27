import type { z } from "zod";

export interface LLMPrompt {
  readonly system: string;
  readonly user: string;
  readonly version: string;
}

export interface LLMUsage {
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly totalTokens?: number;
}

export interface LLMProviderMetadata {
  readonly model: string;
  readonly provider: string;
  readonly retries: number;
}

export interface GenerateObjectInput<T = unknown> {
  readonly prompt: LLMPrompt;
  readonly schema: z.ZodType<T>;
  readonly schemaName: string;
}

export interface GenerateObjectResult<T = unknown> {
  readonly metadata: LLMProviderMetadata;
  readonly object: T;
  readonly usage: LLMUsage;
}

export interface LLMProvider {
  generateObject<T = unknown>(input: GenerateObjectInput<T>): Promise<GenerateObjectResult<T>>;
}
