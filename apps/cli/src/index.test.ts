import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { GenerateObjectInput, GenerateObjectResult, LLMProvider } from "@donecheck/core";
import { judgementReportSchema, parseDoneCheckResult } from "@donecheck/shared";
import { describe, expect, it } from "vitest";
import { runCli } from "./index.js";

describe("runCli", () => {
  it("runs core analysis and exits 0 for pass", async () => {
    const result = await run(["--requirement", requirement, "--evidence", coveringEvidence]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("Status: pass");
    expect(result.stdout).toContain("Score: 100%");
  });

  it("runs core analysis and exits 1 for partial by default", async () => {
    const result = await run([
      "--requirement",
      requirement,
      "--evidence",
      "The implementation includes shared contracts only.",
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("Status: partial");
  });

  it("runs core analysis and exits 0 for partial with partial-ok", async () => {
    const result = await run([
      "--requirement",
      requirement,
      "--evidence",
      "The implementation includes shared contracts only.",
      "--partial-ok",
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("Status: partial");
  });

  it("emits JSON that shared can parse in tests", async () => {
    const result = await run([
      "--requirement",
      requirement,
      "--evidence",
      coveringEvidence,
      "--json",
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(parseDoneCheckResult(JSON.parse(result.stdout)).status).toBe("pass");
  });

  it("reads evidence from stdin when no explicit evidence is provided", async () => {
    const result = await run(["--requirement", requirement], {
      stdin: coveringEvidence,
      stdinIsTTY: false,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Status: pass");
  });

  it("returns 2 for missing arguments", async () => {
    const result = await run([]);

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("Missing requirement.");
  });

  it("returns 2 for empty input", async () => {
    const result = await run(["--requirement", requirement, "--evidence", ""]);

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("Evidence input is empty.");
  });

  it("returns 2 for missing files", async () => {
    const result = await run(["--requirement", requirement, "--evidence-file", "missing.md"], {
      fileError: new Error("ENOENT"),
    });

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("Unable to read evidence file missing.md: ENOENT");
  });

  it("returns 2 instead of blocking on TTY stdin", async () => {
    const result = await run(["--requirement", requirement], { stdinIsTTY: true });

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("Missing evidence.");
  });
});

describe("runCli --rules / --html", () => {
  it("emits schema-valid JudgementReport JSON for --rules", async () => {
    const workspace = createTempWorkspace();
    try {
      const result = await run(
        [
          "--requirement",
          "Implement app module",
          "--evidence",
          "App module is implemented",
          "--rules",
          "--partial-ok",
          "--workspace",
          workspace,
        ],
        { provider: stubProvider },
      );

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe("");
      const parsed = JSON.parse(result.stdout);
      expect(judgementReportSchema.parse(parsed)).toEqual(parsed);
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  it("emits an HTML document for --html", async () => {
    const workspace = createTempWorkspace();
    try {
      const result = await run(
        [
          "--requirement",
          "Implement app module",
          "--evidence",
          "App module is implemented",
          "--html",
          "--partial-ok",
          "--workspace",
          workspace,
        ],
        { provider: stubProvider },
      );

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe("");
      expect(result.stdout.startsWith("<!doctype html>")).toBe(true);
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  it("writes HTML to --output file when provided", async () => {
    const workspace = createTempWorkspace();
    const outputFile = join(workspace, "report.html");
    let writtenContent: string | undefined;
    try {
      const result = await run(
        [
          "--requirement",
          "Implement app module",
          "--evidence",
          "App module is implemented",
          "--html",
          "--output",
          outputFile,
          "--partial-ok",
          "--workspace",
          workspace,
        ],
        {
          provider: stubProvider,
          writeFile: async (_path, content) => {
            writtenContent = content;
          },
        },
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe("");
      expect(writtenContent).toBeDefined();
      expect(writtenContent?.startsWith("<!doctype html>")).toBe(true);
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  it("rejects --json combined with --rules", async () => {
    const result = await run(["--requirement", "x", "--evidence", "y", "--json", "--rules"]);

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("--json cannot be combined with --rules");
  });
});

const requirement = "Implement shared contracts and core analysis tests.";
const coveringEvidence =
  "The shared contracts, core analysis, and tests implement verified coverage.";

interface RunConfig {
  readonly fileError?: Error;
  readonly provider?: LLMProvider;
  readonly stdin?: string;
  readonly stdinIsTTY?: boolean;
  readonly writeFile?: (path: string, content: string) => Promise<void>;
}

async function run(argv: readonly string[], config: RunConfig = {}) {
  let stdout = "";
  let stderr = "";
  const exitCode = await runCli({
    argv,
    ...(config.provider === undefined ? {} : { provider: config.provider }),
    readFile: async () => {
      if (config.fileError) throw config.fileError;
      return "";
    },
    readStdin: async () => config.stdin ?? "",
    stderr: (chunk) => {
      stderr += chunk;
    },
    stdinIsTTY: config.stdinIsTTY ?? true,
    stdout: (chunk) => {
      stdout += chunk;
    },
    ...(config.writeFile === undefined ? {} : { writeFile: config.writeFile }),
  });

  return { exitCode, stderr, stdout };
}

function createTempWorkspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "donecheck-cli-"));
  mkdirSync(join(dir, "src"), { recursive: true });
  writeFileSync(
    join(dir, "src", "app.ts"),
    "export const app = () => true;\nexport const run = () => true;\nexport const start = () => true;\n",
  );
  return dir;
}

const stubProvider: LLMProvider = {
  async generateObject<T>(input: GenerateObjectInput<T>): Promise<GenerateObjectResult<T>> {
    const object = buildStubObject(input.schemaName);
    const parsed = input.schema.parse(object);
    return {
      metadata: { model: "stub", provider: "stub", retries: 0 },
      object: parsed as T,
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    };
  },
};

function buildStubObject(schemaName: string): unknown {
  if (schemaName === "FileSelectionModelOutput") {
    return {
      candidateFiles: ["src/app.ts"],
      confidence: 0.9,
      reasoningSummary: "stub selection",
      warnings: [],
    };
  }
  if (schemaName === "SemanticJudgementDraft") {
    return {
      confidence: 0.9,
      evidenceRefs: [
        { filePath: "src/app.ts", lineStart: 1, lineEnd: 3, snippetSummary: "src/app.ts" },
      ],
      explanation: "stub judgement: app module implemented",
      judgementDraft: "fulfilled",
      matchedClaimId: "CLAIM-1",
      matchedRequirementId: "REQ-1",
      repairSuggestion: "none",
    };
  }
  throw new Error(`stubProvider: unknown schema ${schemaName}`);
}
