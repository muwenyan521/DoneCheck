import { buildRequirementDecompositionPrompt } from "../prompts/index.js";
import type { LLMProvider } from "./provider.js";
import {
  type RequirementDecompositionOutput,
  requirementDecompositionOutputSchema,
} from "./requirement-decomposition-schema.js";

export interface DecomposeRequirementsInput {
  readonly claim?: string;
  readonly provider: LLMProvider;
  readonly requirement: string;
}

export async function decomposeRequirements(
  input: DecomposeRequirementsInput,
): Promise<RequirementDecompositionOutput> {
  const prompt = buildRequirementDecompositionPrompt({
    requirement: input.requirement,
    ...(input.claim === undefined ? {} : { claim: input.claim }),
  });
  const response = await input.provider.generateObject({
    prompt,
    schema: requirementDecompositionOutputSchema,
    schemaName: "RequirementDecompositionOutput",
  });

  const parsed = requirementDecompositionOutputSchema.parse(response.object);
  return {
    ...parsed,
    requirements: dedupById(parsed.requirements),
    claims: dedupById(parsed.claims),
  };
}

function dedupById<T extends { readonly id: string }>(items: readonly T[]): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    result.push(item);
  }
  return result;
}
