import { constants } from "node:fs";
import { access, lstat, readFile, readdir } from "node:fs/promises";
import { relative } from "node:path";
import type { LLMProvider } from "../semantic/provider.js";
import type { SemanticClaim, SemanticRequirement } from "../semantic/schema.js";
import { orchestrateAnalysis } from "./orchestrator.js";

const DEFAULT_IGNORE = new Set(["node_modules", "dist", ".git", ".cache", "build", "coverage"]);
const ANALYZABLE_FILE = /\.(ts|tsx|js|jsx|mjs|cjs|json|md|txt)$/u;

export type WorkspaceValidationErrorCode =
  | "workspace-empty-path"
  | "workspace-missing"
  | "workspace-not-directory"
  | "workspace-unreadable"
  | "workspace-empty"
  | "workspace-no-analyzable-files";

export class WorkspaceValidationError extends Error {
  readonly code: WorkspaceValidationErrorCode;

  constructor(code: WorkspaceValidationErrorCode, message: string) {
    super(message);
    this.name = "WorkspaceValidationError";
    this.code = code;
  }
}

export async function validateWorkspace(
  workspacePath: string,
  ignore: readonly string[] = [],
): Promise<void> {
  if (workspacePath.trim().length === 0) {
    throw new WorkspaceValidationError("workspace-empty-path", "Workspace path is required.");
  }
  let stats: Awaited<ReturnType<typeof lstat>>;
  try {
    stats = await lstat(workspacePath);
  } catch {
    throw new WorkspaceValidationError(
      "workspace-missing",
      `Workspace does not exist: ${workspacePath}`,
    );
  }
  if (!stats.isDirectory()) {
    throw new WorkspaceValidationError(
      "workspace-not-directory",
      `Workspace is not a directory: ${workspacePath}`,
    );
  }
  if ((stats.mode & 0o444) === 0) {
    throw new WorkspaceValidationError(
      "workspace-unreadable",
      `Workspace is unreadable: ${workspacePath}`,
    );
  }
  try {
    await access(workspacePath, constants.R_OK);
  } catch {
    throw new WorkspaceValidationError(
      "workspace-unreadable",
      `Workspace is unreadable: ${workspacePath}`,
    );
  }
  const entries = await readdir(workspacePath);
  if (entries.length === 0) {
    throw new WorkspaceValidationError("workspace-empty", `Workspace is empty: ${workspacePath}`);
  }
  if (!(await containsAnalyzableFile(workspacePath, new Set([...DEFAULT_IGNORE, ...ignore])))) {
    throw new WorkspaceValidationError(
      "workspace-no-analyzable-files",
      `Workspace has no analyzable files: ${workspacePath}`,
    );
  }
}

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
  readonly signal?: AbortSignal;
}

export async function runDoneCheckPipelineNode(input: RunDoneCheckPipelineNodeInput) {
  input.signal?.throwIfAborted();
  await validateWorkspace(input.workspacePath, input.ignore);
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
    ...(input.signal === undefined ? {} : { signal: input.signal }),
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
    } else if (ANALYZABLE_FILE.test(entry)) {
      const content = await readFile(full, "utf8");
      out.push({ relativePath: relative(root, full).replaceAll("\\", "/"), content });
    }
  }
}

async function containsAnalyzableFile(dir: string, ignore: Set<string>): Promise<boolean> {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return false;
  }
  for (const entry of entries) {
    if (ignore.has(entry)) continue;
    const full = `${dir}/${entry}`;
    let stats: Awaited<ReturnType<typeof lstat>>;
    try {
      stats = await lstat(full);
    } catch {
      continue;
    }
    if (stats.isSymbolicLink()) continue;
    if (stats.isDirectory()) {
      if (await containsAnalyzableFile(full, ignore)) return true;
    } else if (ANALYZABLE_FILE.test(entry)) {
      return true;
    }
  }
  return false;
}
