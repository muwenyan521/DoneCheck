import type { LLMProvider, LLMProviderMetadata } from "@donecheck/core";
import {
  createDeterministicMockProvider,
  createProvider as createOpenAIProvider,
} from "@donecheck/provider-openai";

export type CliProvider = LLMProvider & {
  readonly metadata: LLMProviderMetadata;
};

export interface CreateProviderOptions {
  readonly mock?: boolean;
  readonly stderr?: (chunk: string) => void;
}

export function createProvider(options: CreateProviderOptions = {}): CliProvider {
  if (options.mock === true) {
    const sink = options.stderr ?? ((s: string) => process.stderr.write(s));
    sink("Using deterministic mock provider (--mock). Results are not real analysis.\n");
    return createDeterministicMockProvider();
  }
  return createOpenAIProvider(options.stderr === undefined ? {} : { stderr: options.stderr });
}
