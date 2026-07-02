import type { LLMProvider, LLMProviderMetadata } from "@donecheck/core";
import { createProvider as createOpenAIProvider } from "@donecheck/provider-openai";

export type CliProvider = LLMProvider & {
  readonly metadata: LLMProviderMetadata;
};

export interface CreateProviderOptions {
  readonly stderr?: (chunk: string) => void;
}

export function createProvider(options: CreateProviderOptions = {}): CliProvider {
  return createOpenAIProvider(options);
}
