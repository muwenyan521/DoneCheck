import { buildFileSelectionPrompt } from "../prompts/index.js";
import type { ModelOutputLanguage } from "../prompts/output-language.js";
import type { LLMProvider } from "./provider.js";
import type { RetryOptions } from "./retry.js";
import { withRetry } from "./retry.js";
import {
  type FileSelectionResult,
  type StaticSignal,
  fileSelectionModelOutputSchema,
  fileSelectionResultSchema,
} from "./schema.js";

export interface SelectCandidateFilesInput {
  readonly claim?: string;
  readonly outputLanguage?: ModelOutputLanguage;
  readonly projectFiles: readonly string[];
  readonly provider: LLMProvider;
  readonly requirement: string;
  readonly retry?: RetryOptions;
  readonly signal?: AbortSignal;
  readonly staticSignals?: readonly StaticSignal[];
  readonly structureSummary: string;
  readonly topK?: number;
}

export async function selectCandidateFiles(
  input: SelectCandidateFilesInput,
): Promise<FileSelectionResult> {
  const topK = input.topK ?? 20;
  const projectFileSet = new Set(input.projectFiles.map(normalizePath));
  const prompt = buildFileSelectionPrompt({
    ...(input.outputLanguage === undefined ? {} : { outputLanguage: input.outputLanguage }),
    requirement: input.requirement,
    structureSummary: input.structureSummary,
    topK,
    ...(input.claim === undefined ? {} : { claim: input.claim }),
    ...(input.staticSignals === undefined ? {} : { staticSignals: input.staticSignals }),
  });
  const response = await withRetry(
    () =>
      input.provider.generateObject({
        prompt,
        schema: fileSelectionModelOutputSchema,
        schemaName: "FileSelectionModelOutput",
        ...(input.signal === undefined ? {} : { signal: input.signal }),
      }),
    { ...input.retry, ...(input.signal === undefined ? {} : { signal: input.signal }) },
  );

  const modelOutput = fileSelectionModelOutputSchema.parse(response.object);

  const warnings = [...(modelOutput.warnings ?? [])];
  const llmSelected = normalizeExistingPaths(modelOutput.candidateFiles, projectFileSet, warnings);
  const truncatedLlmSelected = llmSelected.slice(0, topK);
  if (llmSelected.length > topK) {
    warnings.push(`LLM candidate list truncated to topK=${topK}.`);
  }

  const staticallyRecalled = recallStaticSignalFiles(
    input.staticSignals ?? [],
    projectFileSet,
    new Set(truncatedLlmSelected),
  );

  const remainingSlots = Math.max(0, topK - truncatedLlmSelected.length);
  const selectedStaticFiles = staticallyRecalled.slice(0, remainingSlots);
  if (staticallyRecalled.length > selectedStaticFiles.length) {
    warnings.push(`Static recall truncated to preserve topK=${topK}.`);
  }
  const candidateFiles = [...truncatedLlmSelected, ...selectedStaticFiles];

  return fileSelectionResultSchema.parse({
    candidateFiles,
    confidence: modelOutput.confidence,
    llmSelected: truncatedLlmSelected,
    providerMetadata: response.metadata,
    reasoningSummary: modelOutput.reasoningSummary,
    staticallyRecalled: selectedStaticFiles,
    usage: response.usage,
    warnings,
  });
}

function normalizeExistingPaths(
  paths: readonly string[],
  projectFileSet: ReadonlySet<string>,
  warnings: string[],
): string[] {
  const result: string[] = [];
  const seen = new Set<string>();

  for (const path of paths) {
    const normalized = normalizePath(path);
    if (seen.has(normalized)) continue;
    seen.add(normalized);

    if (!projectFileSet.has(normalized)) {
      warnings.push(`Filtered non-existing LLM candidate: ${normalized}`);
      continue;
    }

    result.push(normalized);
  }

  return result;
}

function recallStaticSignalFiles(
  staticSignals: readonly StaticSignal[],
  projectFileSet: ReadonlySet<string>,
  llmSelected: ReadonlySet<string>,
): string[] {
  const result: string[] = [];
  const seen = new Set<string>();

  for (const signal of staticSignals) {
    if (signal.strength !== "strong") continue;
    const normalized = normalizePath(signal.filePath);
    if (seen.has(normalized) || llmSelected.has(normalized) || !projectFileSet.has(normalized))
      continue;
    seen.add(normalized);
    result.push(normalized);
  }

  return result;
}

function normalizePath(path: string): string {
  return path.replaceAll("\\", "/").replace(/^\.\//u, "").replace(/^\/+/, "");
}
