import { constants, type Stats } from "node:fs";
import { access, lstat, open, readdir } from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
import { relative } from "node:path";
import type { LLMProvider } from "../semantic/provider.js";
import type { SemanticClaim, SemanticRequirement } from "../semantic/schema.js";
import { orchestrateAnalysis } from "./orchestrator.js";

const DEFAULT_IGNORE = new Set([
  "node_modules",
  "dist",
  ".git",
  ".cache",
  ".direnv",
  ".omo",
  ".trae",
  ".turbo",
  ".worktrees",
  "build",
  "coverage",
  "tmp",
]);
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

export interface InspectWorkspaceVolumeInput {
  readonly workspacePath: string;
  readonly ignore?: readonly string[];
  readonly signal?: AbortSignal;
}

export interface WorkspaceVolume {
  readonly analyzableFileCount: number;
  readonly totalAnalyzableBytes: number;
  readonly largestAnalyzableFileBytes: number;
}

export async function validateWorkspace(
  workspacePath: string,
  ignore: readonly string[] = [],
  signal?: AbortSignal,
): Promise<void> {
  await inspectWorkspaceVolume({
    workspacePath,
    ignore,
    ...(signal === undefined ? {} : { signal }),
  });
}

export async function inspectWorkspaceVolume(
  input: InspectWorkspaceVolumeInput,
): Promise<WorkspaceVolume> {
  input.signal?.throwIfAborted();
  await validateWorkspaceRoot(input.workspacePath);
  const volume = {
    analyzableFileCount: 0,
    totalAnalyzableBytes: 0,
    largestAnalyzableFileBytes: 0,
  };
  await walk({
    root: input.workspacePath,
    dir: input.workspacePath,
    ignore: buildIgnoreMatcher(input.ignore ?? []),
    ...(input.signal === undefined ? {} : { signal: input.signal }),
    onFile: async (path, _relativePath, expected) => {
      const size = await measureUnchangedRegularFile(path, expected);
      if (size === undefined) return;
      volume.analyzableFileCount += 1;
      volume.totalAnalyzableBytes += size;
      volume.largestAnalyzableFileBytes = Math.max(volume.largestAnalyzableFileBytes, size);
    },
  });
  if (volume.analyzableFileCount === 0) {
    throw new WorkspaceValidationError(
      "workspace-no-analyzable-files",
      `Workspace has no analyzable files: ${input.workspacePath}`,
    );
  }
  return volume;
}

async function validateWorkspaceRoot(workspacePath: string): Promise<void> {
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
  await validateWorkspace(input.workspacePath, input.ignore, input.signal);
  input.signal?.throwIfAborted();
  const ignore = buildIgnoreMatcher(input.ignore ?? []);
  const files: { relativePath: string; content: string }[] = [];
  await walk({
    root: input.workspacePath,
    dir: input.workspacePath,
    ignore,
    ...(input.signal === undefined ? {} : { signal: input.signal }),
    onFile: async (path, relativePath, expected) => {
      const content = await readUnchangedRegularFile(path, expected);
      if (content !== undefined) files.push({ relativePath, content });
    },
  });
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

interface WalkInput {
  readonly root: string;
  readonly dir: string;
  readonly ignore: IgnoreMatcher;
  readonly signal?: AbortSignal;
  readonly onFile: (path: string, relativePath: string, expected: Stats) => Promise<void>;
}

async function walk(input: WalkInput): Promise<void> {
  input.signal?.throwIfAborted();
  let entries: string[];
  try {
    entries = await readdir(input.dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    input.signal?.throwIfAborted();
    const full = `${input.dir}/${entry}`;
    const relativePath = relative(input.root, full).replaceAll("\\", "/");
    if (input.ignore.matches(entry, relativePath)) continue;
    let s: Awaited<ReturnType<typeof lstat>>;
    try {
      s = await lstat(full);
    } catch {
      continue;
    }
    if (s.isSymbolicLink()) continue;
    if (s.isDirectory()) {
      await walk({ ...input, dir: full });
    } else if (ANALYZABLE_FILE.test(entry)) {
      await input.onFile(full, relativePath, s);
    }
  }
}

interface IgnoreMatcher {
  matches(entry: string, relativePath: string): boolean;
}

function buildIgnoreMatcher(extra: readonly string[]): IgnoreMatcher {
  const names = new Set(DEFAULT_IGNORE);
  const paths: string[] = [];
  for (const value of extra) {
    const normalized = value.replaceAll("\\", "/").replace(/^\.\//u, "").replace(/\/$/u, "");
    if (normalized.includes("/") && !paths.includes(normalized)) paths.push(normalized);
    else names.add(normalized);
  }
  return {
    matches: (entry, relativePath) =>
      names.has(entry) ||
      paths.some((path) => relativePath === path || relativePath.startsWith(`${path}/`)),
  };
}

async function readUnchangedRegularFile(
  path: string,
  expected: Stats,
): Promise<string | undefined> {
  return withUnchangedRegularFile(path, expected, (handle) => handle.readFile("utf8"));
}

async function measureUnchangedRegularFile(
  path: string,
  expected: Stats,
): Promise<number | undefined> {
  return withUnchangedRegularFile(path, expected, async (_handle, opened) => opened.size);
}

async function withUnchangedRegularFile<T>(
  path: string,
  expected: Stats,
  consume: (handle: FileHandle, opened: Stats) => Promise<T>,
): Promise<T | undefined> {
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const opened = await handle.stat();
    if (!opened.isFile() || opened.dev !== expected.dev || opened.ino !== expected.ino) {
      return undefined;
    }
    return await consume(handle, opened);
  } catch {
    return undefined;
  } finally {
    await handle?.close();
  }
}
