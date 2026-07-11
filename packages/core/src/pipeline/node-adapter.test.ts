import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type {
  GenerateObjectInput,
  GenerateObjectResult,
  LLMProvider,
} from "../semantic/provider.js";
import { runDoneCheckPipelineNode } from "./node-adapter.js";

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

describe("runDoneCheckPipelineNode workspace scan", () => {
  let workspace: string;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "donecheck-ws-"));
  });

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
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
});
