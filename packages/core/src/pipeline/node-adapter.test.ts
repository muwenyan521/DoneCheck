import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type {
  GenerateObjectInput,
  GenerateObjectResult,
  LLMProvider,
} from "../semantic/provider.js";
import {
  WorkspaceValidationError,
  inspectWorkspaceVolume,
  runDoneCheckPipelineNode,
  validateWorkspace,
} from "./node-adapter.js";

const stubProvider: LLMProvider = {
  async generateObject<T>(input: GenerateObjectInput<T>): Promise<GenerateObjectResult<T>> {
    if (input.schemaName === "FileSelectionModelOutput") {
      return {
        object: {
          candidateFiles: ["real.ts"],
          confidence: 0.9,
          reasoningSummary: "stub",
          warnings: [],
        } as unknown as T,
        metadata: { provider: "stub", model: "stub", retries: 0 },
        usage: {},
      };
    }
    if (input.schemaName === "SemanticJudgementDraft") {
      return {
        object: input.schema.parse({
          confidence: 0.9,
          evidenceRefs: [
            { filePath: "real.ts", lineEnd: 1, lineStart: 1, snippetSummary: "localStorage" },
          ],
          explanation: "implemented",
          judgementDraft: "fulfilled",
          matchedClaimId: "CLAIM-1",
          matchedRequirementId: "REQ-1",
          repairSuggestion: "none",
        }) as T,
        metadata: { provider: "stub", model: "stub", retries: 0 },
        usage: {},
      };
    }
    throw new Error(`unexpected schema ${input.schemaName}`);
  },
};

function volumeFor(...contents: readonly string[]) {
  const sizes = contents.map((content) => Buffer.byteLength(content));
  return {
    analyzableFileCount: sizes.length,
    largestAnalyzableFileBytes: Math.max(...sizes),
    totalAnalyzableBytes: sizes.reduce((total, size) => total + size, 0),
  };
}

describe("runDoneCheckPipelineNode workspace scan", () => {
  let workspace: string;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "donecheck-ws-"));
  });

  afterEach(() => {
    try {
      chmodSync(workspace, 0o700);
    } catch {}
    rmSync(workspace, { recursive: true, force: true });
  });

  it("rejects empty, missing, file, unreadable, empty, and non-analyzable workspaces", async () => {
    await expect(validateWorkspace("   ")).rejects.toBeInstanceOf(WorkspaceValidationError);
    await expect(validateWorkspace(join(workspace, "missing"))).rejects.toMatchObject({
      code: "workspace-missing",
    });
    writeFileSync(join(workspace, "file.ts"), "export {};");
    await expect(validateWorkspace(join(workspace, "file.ts"))).rejects.toMatchObject({
      code: "workspace-not-directory",
    });
    const empty = join(workspace, "empty");
    mkdirSync(empty);
    await expect(validateWorkspace(empty)).rejects.toMatchObject({ code: "workspace-empty" });
    const nonAnalyzable = join(workspace, "non-analyzable");
    mkdirSync(nonAnalyzable);
    writeFileSync(join(nonAnalyzable, "image.png"), "not analyzable");
    await expect(validateWorkspace(nonAnalyzable)).rejects.toMatchObject({
      code: "workspace-no-analyzable-files",
    });
    mkdirSync(join(workspace, "blocked"));
    chmodSync(join(workspace, "blocked"), 0o000);
    await expect(validateWorkspace(join(workspace, "blocked"))).rejects.toMatchObject({
      code: "workspace-unreadable",
    });
    chmodSync(join(workspace, "blocked"), 0o700);
  });

  it("validates before invoking the provider", async () => {
    let calls = 0;
    const provider: LLMProvider = {
      generateObject: async () => {
        calls += 1;
        throw new Error("called");
      },
    };
    await expect(
      runDoneCheckPipelineNode({ workspacePath: workspace, requirement: "x", provider }),
    ).rejects.toBeInstanceOf(WorkspaceValidationError);
    expect(calls).toBe(0);
  });

  it("honors cancellation before workspace traversal invokes the provider", async () => {
    writeFileSync(join(workspace, "real.ts"), 'export const localStorage = "real";\n');
    const controller = new AbortController();
    controller.abort(new Error("analysis canceled"));

    await expect(
      runDoneCheckPipelineNode({
        workspacePath: workspace,
        requirement: "x",
        provider: stubProvider,
        signal: controller.signal,
      }),
    ).rejects.toThrow("analysis canceled");
  });

  it("does not infinite-loop on symlink cycles", async () => {
    writeFileSync(join(workspace, "real.ts"), 'export const localStorage = "real";\n');
    symlinkSync(workspace, join(workspace, "self-loop"));

    const result = await runDoneCheckPipelineNode({
      workspacePath: workspace,
      requirement: "use localStorage for auth session",
      claim: "localStorage auth is implemented",
      provider: stubProvider,
      requirements: [{ id: "REQ-1", text: "use localStorage for auth session" }],
      claims: [{ id: "CLAIM-1", text: "localStorage auth is implemented" }],
    });

    expect(result).toBeDefined();
    expect(result.evidenceSnippets.every((s) => !s.filePath.includes("self-loop"))).toBe(true);
  });

  it("does not read files through symlinks pointing outside workspace", async () => {
    const outsideDir = mkdtempSync(join(tmpdir(), "donecheck-out-"));
    try {
      writeFileSync(
        join(outsideDir, "secret.ts"),
        'export const localStorage = "should-not-leak";\nexport const auth = "leaked";\n',
      );
      writeFileSync(join(workspace, "real.ts"), 'export const localStorage = "real";\n');

      symlinkSync(outsideDir, join(workspace, "linked-dir"));

      const result = await runDoneCheckPipelineNode({
        workspacePath: workspace,
        requirement: "use localStorage for auth session",
        claim: "localStorage auth is implemented",
        provider: stubProvider,
        requirements: [{ id: "REQ-1", text: "use localStorage for auth session" }],
        claims: [{ id: "CLAIM-1", text: "localStorage auth is implemented" }],
      });

      for (const signal of result.staticSignals) {
        expect(signal.filePath).not.toContain("linked-dir");
        expect(signal.filePath).not.toContain("secret");
      }
    } finally {
      rmSync(outsideDir, { recursive: true, force: true });
    }
  });

  it("skips generated and local-tool directories by default", async () => {
    writeFileSync(join(workspace, "real.ts"), 'export const localStorage = "real";\n');
    for (const ignoredDir of [".direnv", ".omo", ".trae", ".turbo", ".worktrees", "tmp"]) {
      mkdirSync(join(workspace, ignoredDir), { recursive: true });
      writeFileSync(join(workspace, ignoredDir, "generated.ts"), 'export const auth = "noise";\n');
    }

    const result = await runDoneCheckPipelineNode({
      workspacePath: workspace,
      requirement: "use localStorage for auth session",
      claim: "localStorage auth is implemented",
      provider: stubProvider,
      requirements: [{ id: "REQ-1", text: "use localStorage for auth session" }],
      claims: [{ id: "CLAIM-1", text: "localStorage auth is implemented" }],
    });

    expect(result.staticSignals).toEqual([
      { filePath: "real.ts", keyword: "localStorage", strength: "strong" },
    ]);
  });

  it("honors workspace-relative file and directory exclusions", async () => {
    writeFileSync(join(workspace, "real.ts"), 'export const localStorage = "real";\n');
    mkdirSync(join(workspace, "private"), { recursive: true });
    mkdirSync(join(workspace, "src", "generated"), { recursive: true });
    writeFileSync(join(workspace, "private", "config.json"), '{"auth":"secret"}\n');
    writeFileSync(
      join(workspace, "src", "generated", "client.ts"),
      'export const auth = "noise";\n',
    );

    const result = await runDoneCheckPipelineNode({
      workspacePath: workspace,
      requirement: "use localStorage",
      provider: stubProvider,
      requirements: [{ id: "REQ-1", text: "use localStorage" }],
      ignore: ["./private/config.json", "src\\generated\\"],
    });

    expect(result.staticSignals).toEqual([
      { filePath: "real.ts", keyword: "localStorage", strength: "strong" },
    ]);
  });

  it("counts analyzable files and their exact byte sizes", async () => {
    const first = "export const answer = 42;\n";
    const second = "# 需求\n完成检查\n";
    writeFileSync(join(workspace, "first.ts"), first);
    mkdirSync(join(workspace, "docs"));
    writeFileSync(join(workspace, "docs", "README.md"), second);
    writeFileSync(join(workspace, "image.png"), "not analyzable");

    const volume = await inspectWorkspaceVolume({ workspacePath: workspace });

    expect(volume).toEqual(volumeFor(first, second));
  });

  it("excludes default and user-supplied relative paths from workspace volume", async () => {
    const included = "export const included = true;\n";
    writeFileSync(join(workspace, "real.ts"), included);
    for (const ignoredDir of ["node_modules", "dist", ".git", ".cache", ".omo", "coverage"]) {
      mkdirSync(join(workspace, ignoredDir), { recursive: true });
      writeFileSync(join(workspace, ignoredDir, "ignored.ts"), "ignored content");
    }
    mkdirSync(join(workspace, "private"));
    mkdirSync(join(workspace, "src", "generated"), { recursive: true });
    writeFileSync(join(workspace, "private", "config.json"), '{"secret":true}\n');
    writeFileSync(join(workspace, "src", "generated", "client.ts"), "generated client");

    const volume = await inspectWorkspaceVolume({
      workspacePath: workspace,
      ignore: ["./private/config.json", "src\\generated\\"],
    });

    expect(volume).toEqual(volumeFor(included));
    await expect(
      validateWorkspace(workspace, ["real.ts", "private", "src/generated"]),
    ).rejects.toMatchObject({ code: "workspace-no-analyzable-files" });
  });

  it("excludes file and directory symlinks from workspace volume", async () => {
    const outsideDir = mkdtempSync(join(tmpdir(), "donecheck-volume-out-"));
    try {
      const included = "export const included = true;\n";
      writeFileSync(join(workspace, "real.ts"), included);
      writeFileSync(join(outsideDir, "outside.ts"), "outside source");
      symlinkSync(join(outsideDir, "outside.ts"), join(workspace, "linked-file.ts"));
      symlinkSync(outsideDir, join(workspace, "linked-directory"));

      const volume = await inspectWorkspaceVolume({ workspacePath: workspace });

      expect(volume).toEqual(volumeFor(included));
    } finally {
      rmSync(outsideDir, { recursive: true, force: true });
    }
  });

  it("honors cancellation before workspace volume traversal", async () => {
    writeFileSync(join(workspace, "real.ts"), "export {};\n");
    const controller = new AbortController();
    controller.abort(new Error("inspection canceled"));

    await expect(
      inspectWorkspaceVolume({ workspacePath: workspace, signal: controller.signal }),
    ).rejects.toThrow("inspection canceled");
  });
});
