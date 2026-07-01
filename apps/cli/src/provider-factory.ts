import type {
  GenerateObjectInput,
  GenerateObjectResult,
  LLMProvider,
  LLMProviderMetadata,
} from "@donecheck/core";
import { OpenAIProvider } from "@donecheck/provider-openai";

export type CliProvider = LLMProvider & {
  readonly metadata: LLMProviderMetadata;
};

export interface CreateProviderOptions {
  readonly stderr?: (chunk: string) => void;
}

const MOCK_METADATA: LLMProviderMetadata = {
  model: "mock",
  provider: "deterministic-mock",
  retries: 0,
};

export function createProvider(options: CreateProviderOptions = {}): CliProvider {
  const apiKey = process.env.OPENAI_API_KEY;
  if (apiKey && apiKey.length > 0) {
    return new OpenAIProvider({ apiKey });
  }
  const warn = options.stderr ?? ((s: string) => process.stderr.write(s));
  warn(
    "Warning: OPENAI_API_KEY not set; using deterministic mock provider. Set OPENAI_API_KEY to use real OpenAI.\n",
  );
  return new DeterministicMockProvider();
}

class DeterministicMockProvider implements CliProvider {
  readonly metadata: LLMProviderMetadata = MOCK_METADATA;

  async generateObject<T>(input: GenerateObjectInput<T>): Promise<GenerateObjectResult<T>> {
    if (input.schemaName === "FileSelectionModelOutput") {
      return {
        metadata: MOCK_METADATA,
        object: input.schema.parse({
          candidateFiles: [],
          warnings: ["deterministic-mock"],
        }),
        usage: {},
      };
    }
    return {
      metadata: MOCK_METADATA,
      object: input.schema.parse({
        confidence: 0.5,
        evidenceRefs: [
          {
            filePath: "deterministic-mock",
            lineEnd: 1,
            lineStart: 1,
            snippetSummary: "deterministic mock — no real evidence",
          },
        ],
        explanation: "deterministic mock — set OPENAI_API_KEY for real analysis",
        judgementDraft: "partial",
        repairSuggestion: "Set OPENAI_API_KEY to use real OpenAI.",
      }),
      usage: {},
    };
  }
}
