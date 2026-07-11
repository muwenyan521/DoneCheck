import { lstat, readFile, readdir } from "node:fs/promises";
import { relative } from "node:path";
import type { LLMProvider } from "../semantic/provider.js";
import type { SemanticClaim, SemanticRequirement } from "../semantic/schema.js";
import { orchestrateAnalysis } from "./orchestrator.js";

const DEFAULT_IGNORE = new Set(["node_modules", "dist", ".git", ".cache", "build", "coverage"]);

export interface RunDoneCheckPipelineNodeInput {
  readonly workspacePath: string;
  readonly requirement: string;
  readonly claim?: string;
  readonly provider: LLMProvider;
  readonly generatedAt?: string;
  readonly claims?: readonly SemanticClaim[];
  readonly requirements?: readonly SemanticRequirement[];
  readonly topK?: number;
  readonly ignore?: readonly string[];
}

export async function runDoneCheckPipelineNode(input: RunDoneCheckPipelineNodeInput) {
  const ignore = new Set([...DEFAULT_IGNORE, ...(input.ignore ?? [])]);
  const files: { relativePath: string; content: string }[] = [];
  await walk(input.workspacePath, input.workspacePath, ignore, files);
  return orchestrateAnalysis({
    requirement: input.requirement,
    ...(input.claim === undefined ? {} : { claim: input.claim }),
    ...(input.claims === undefined ? {} : { claims: input.claims }),
    ...(input.requirements === undefined ? {} : { requirements: input.requirements }),
    files,
    provider: input.provider,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    ...(input.topK === undefined ? {} : { topK: input.topK }),
  });
}

async function walk(
  root: string,
  dir: string,
  ignore: Set<string>,
  out: { relativePath: string; content: string }[],
): Promise<void> {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (ignore.has(entry)) continue;
    const full = `${dir}/${entry}`;
    let s: Awaited<ReturnType<typeof lstat>>;
    try {
      s = await lstat(full);
    } catch {
      continue;
    }
    if (s.isSymbolicLink()) continue;
    if (s.isDirectory()) {
      await walk(root, full, ignore, out);
    } else if (/\.(ts|tsx|js|jsx|mjs|cjs|json|md|txt)$/u.test(entry)) {
      const content = await readFile(full, "utf8");
      out.push({ relativePath: relative(root, full).replaceAll("\\", "/"), content });
    }
  }
}
