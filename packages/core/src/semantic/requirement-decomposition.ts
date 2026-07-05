import { buildRequirementDecompositionPrompt } from "../prompts/index.js";
import type { LLMProvider } from "./provider.js";
import {
  type RequirementDecompositionOutput,
  requirementDecompositionOutputSchema,
} from "./requirement-decomposition-schema.js";
import type { SemanticClaim, SemanticRequirement } from "./schema.js";

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
  return stabilizeRequirementDecomposition({
    output: parsed,
    requirement: input.requirement,
    ...(input.claim === undefined ? {} : { claim: input.claim }),
  });
}

export interface StabilizeRequirementDecompositionInput {
  readonly claim?: string;
  readonly output: Partial<RequirementDecompositionOutput> &
    Pick<RequirementDecompositionOutput, "claims" | "requirements">;
  readonly requirement: string;
}

export function stabilizeRequirementDecomposition(
  input: StabilizeRequirementDecompositionInput,
): RequirementDecompositionOutput {
  const requirements = stabilizeItems({
    explicitItems: extractExplicitItems(input.requirement, "REQ"),
    items: input.output.requirements,
    label: "requirement",
  });
  const claims = stabilizeItems({
    explicitItems: extractExplicitItems(input.claim ?? "", "CLAIM"),
    items: input.output.claims,
    label: "claim",
  });
  const warnings = [...(input.output.warnings ?? []), ...requirements.warnings, ...claims.warnings];

  return {
    assumptions: input.output.assumptions ?? [],
    claims: claims.items,
    clarifyingQuestions: input.output.clarifyingQuestions ?? [],
    ...(input.output.confidence === undefined ? {} : { confidence: input.output.confidence }),
    requirements: requirements.items,
    warnings: dedupStrings(warnings),
  };
}

interface StabilizeItemsInput<T extends { readonly id: string; readonly text: string }> {
  readonly explicitItems: readonly ExplicitItem[];
  readonly items: readonly T[];
  readonly label: "claim" | "requirement";
}

function stabilizeItems<T extends SemanticClaim | SemanticRequirement>(
  input: StabilizeItemsInput<T>,
): { readonly items: T[]; readonly warnings: string[] } {
  const deduped = dedupById(input.items);
  if (input.explicitItems.length === 0) return { items: deduped, warnings: [] };

  const explicitById = new Map(input.explicitItems.map((item) => [item.id, item]));
  const explicitIds = new Set(explicitById.keys());
  const childParentIds = new Set(
    input.explicitItems
      .filter((item) => item.parentId !== undefined)
      .map((item) => item.parentId as string),
  );
  const hasExplicitChildren = input.explicitItems.some((item) => item.parentId !== undefined);
  const warnings: string[] = [];
  const result: T[] = [];
  const consumedIds = new Set<string>();

  for (const explicitItem of input.explicitItems) {
    if (childParentIds.has(explicitItem.id)) continue;
    const matchingItems = deduped.filter((item) => item.id === explicitItem.id);
    const splitItems = deduped.filter(
      (item) => parentIdFor(item.id, input.label) === explicitItem.id,
    );
    const shouldPreserveExplicitText =
      splitItems.length > 0 ||
      matchingItems.length === 0 ||
      (hasExplicitChildren &&
        explicitItem.parentId === undefined &&
        explicitItem.text.endsWith(":"));

    if (shouldPreserveExplicitText && explicitItem.text.endsWith(":") && splitItems.length > 0) {
      for (const item of splitItems) {
        result.push(item);
        consumedIds.add(item.id);
      }
      consumedIds.add(explicitItem.id);
      continue;
    }

    if (shouldPreserveExplicitText) {
      result.push({ id: explicitItem.id, text: explicitItem.text } as T);
      consumedIds.add(explicitItem.id);
      for (const item of splitItems) consumedIds.add(item.id);
      if (splitItems.length > 0) {
        warnings.push(
          `${explicitItem.id}: normalized over-split ${input.label} fragments back to the original explicit item granularity.`,
        );
      }
      continue;
    }

    result.push(matchingItems[0] as T);
    consumedIds.add(explicitItem.id);
  }

  for (const item of deduped) {
    if (consumedIds.has(item.id)) continue;
    if (explicitIds.has(item.id)) continue;
    const parentId = parentIdFor(item.id, input.label);
    if (parentId !== undefined && explicitIds.has(parentId)) {
      warnings.push(
        `${parentId}: dropped over-split ${input.label} fragment ${item.id} because the original explicit item is preserved.`,
      );
      continue;
    }
    if (explicitIds.size > 0) {
      warnings.push(
        `${item.id}: dropped ${input.label} outside the original explicit ${input.label} id set during decomposition stabilization.`,
      );
      continue;
    }
    result.push(item);
  }

  return { items: dedupById(result), warnings };
}

interface ExplicitItem {
  readonly id: string;
  readonly parentId?: string;
  readonly text: string;
}

function extractExplicitItems(text: string, prefix: "CLAIM" | "REQ"): ExplicitItem[] {
  if (text.trim().length === 0) return [];
  const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const itemPattern = new RegExp(
    String.raw`(?:^|\n)\s*(?:[-*]\s*)?(${escapedPrefix}-\d+(?:(?:[.-]\d+)|[a-z])?)\s*:\s*`,
    "giu",
  );
  const matches = [...text.matchAll(itemPattern)];
  return matches.map((match, index): ExplicitItem => {
    const id = match[1] ?? "";
    const start = (match.index ?? 0) + match[0].length;
    const next = matches[index + 1];
    const end = next?.index ?? text.length;
    const parentId = parentIdFor(id, prefix === "REQ" ? "requirement" : "claim");
    return {
      id,
      ...(parentId === undefined ? {} : { parentId }),
      text: text.slice(start, end).trim().replace(/\s+/gu, " "),
    };
  });
}

function parentIdFor(id: string, label: "claim" | "requirement"): string | undefined {
  const prefix = label === "requirement" ? "REQ" : "CLAIM";
  const match = new RegExp(`^${prefix}-(\\d+)(?:[a-z]|[-.]\\d+)$`, "iu").exec(id);
  return match?.[1] === undefined ? undefined : `${prefix}-${match[1]}`;
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

function dedupStrings(items: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of items) {
    if (seen.has(item)) continue;
    seen.add(item);
    result.push(item);
  }
  return result;
}
