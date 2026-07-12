import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { GenerateObjectInput, GenerateObjectResult, LLMProvider } from "@donecheck/core";
import { parseDoneCheckResult } from "@donecheck/shared";
import { describe, expect, it } from "vitest";
import { runCli } from "./index.js";

describe("runCli --text-only", () => {
  it("prints CLI help without requiring analysis input", async () => {
    const result = await run(["--help"]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("--workspace <path>");
    expect(result.stdout).toContain("--text-only");
    expect(result.stdout).not.toContain("--legacy");
    expect(result.stdout).not.toContain("--version");
    expect(result.stdout).not.toMatch(/\b\d+\.\d+\.\d+\b/u);
    expect(result.stdout).not.toMatch(/JudgementReport|deterministic mock|legacy result pipeline/);
  });

  it("runs legacy analysis and exits 0 for pass", async () => {
    const result = await run([
      "--requirement",
      requirement,
      "--evidence",
      coveringEvidence,
      "--legacy",
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("Status: pass");
    expect(result.stdout).toContain("Score: 100%");
  });

  it("runs legacy analysis and exits 1 for partial by default", async () => {
    const result = await run([
      "--requirement",
      requirement,
      "--evidence",
      "The implementation includes shared contracts only.",
      "--legacy",
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("Status: partial");
  });

  it("runs legacy analysis and exits 0 for partial with partial-ok", async () => {
    const result = await run([
      "--requirement",
      requirement,
      "--evidence",
      "The implementation includes shared contracts only.",
      "--legacy",
      "--partial-ok",
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("Status: partial");
  });

  it("emits legacy JSON that shared can parse in tests", async () => {
    const result = await run([
      "--requirement",
      requirement,
      "--evidence",
      coveringEvidence,
      "--legacy",
      "--json",
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(parseDoneCheckResult(JSON.parse(result.stdout)).status).toBe("pass");
    expect(result.stdout).not.toMatch(/\b\d+\.\d+\.\d+\b/u);
  });

  it("reads evidence from stdin when no explicit evidence is provided", async () => {
    const result = await run(["--requirement", requirement, "--legacy"], {
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
    const result = await run(["--requirement", requirement, "--evidence", "", "--legacy"]);

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("Evidence input is empty.");
  });

  it("returns 2 for missing files", async () => {
    const result = await run(
      ["--requirement", requirement, "--evidence-file", "missing.md", "--legacy"],
      { fileError: new Error("ENOENT") },
    );

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("Unable to read evidence file missing.md: ENOENT");
  });

  it("returns 2 instead of blocking on TTY stdin", async () => {
    const result = await run(["--requirement", requirement, "--legacy"], { stdinIsTTY: true });

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("Missing evidence.");
  });
});

describe("runCli default (real pipeline)", () => {
  it("runs real pipeline by default and emits JudgementReport JSON", async () => {
    const workspace = createTempWorkspace();
    try {
      const result = await run(
        [
          "--requirement",
          "Implement app module",
          "--evidence",
          "App module is implemented",
          "--partial-ok",
          "--workspace",
          workspace,
        ],
        { provider: stubProvider },
      );

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe("Analyzing requirements...\nReviewing workspace evidence...\n");
      const parsed = JSON.parse(result.stdout);
      expectPublicReport(parsed, result.stdout);
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  it("runs real pipeline with --mock flag when no API key is set", async () => {
    const old = process.env.OPENAI_API_KEY;
    // biome-ignore lint/performance/noDelete: env var cleanup requires delete
    delete process.env.OPENAI_API_KEY;
    const workspace = createTempWorkspace();
    try {
      const result = await run([
        "--requirement",
        "Implement app module",
        "--evidence",
        "App module is implemented",
        "--mock",
        "--partial-ok",
        "--workspace",
        workspace,
      ]);

      expect(result.stderr).toContain("mock");
      const parsed = JSON.parse(result.stdout);
      expectPublicReport(parsed, result.stdout);
    } finally {
      rmSync(workspace, { recursive: true, force: true });
      if (old !== undefined) process.env.OPENAI_API_KEY = old;
    }
  });

  it("exits with error when no API key and no --mock flag", async () => {
    const old = process.env.OPENAI_API_KEY;
    // biome-ignore lint/performance/noDelete: env var cleanup requires delete
    delete process.env.OPENAI_API_KEY;
    try {
      const result = await run([
        "--requirement",
        "Implement app module",
        "--evidence",
        "App module is implemented",
        "--partial-ok",
      ]);

      expect(result.exitCode).toBe(2);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain("OPENAI_API_KEY");
    } finally {
      if (old !== undefined) process.env.OPENAI_API_KEY = old;
    }
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
      expect(result.stderr).toBe("Analyzing requirements...\nReviewing workspace evidence...\n");
      const parsed = JSON.parse(result.stdout);
      expectPublicReport(parsed, result.stdout);
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  it("uses judgement report exit status for --rules output", async () => {
    const workspace = createTempWorkspace();
    try {
      const result = await run(
        [
          "--requirement",
          "Implement app module",
          "--evidence",
          "App module is implemented",
          "--rules",
          "--workspace",
          workspace,
        ],
        { provider: findingProvider },
      );

      expect(result.exitCode).toBe(1);
      expectPublicReport(JSON.parse(result.stdout), result.stdout);
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  it("returns 2 for an invalid workspace before invoking the provider", async () => {
    let calls = 0;
    const provider: LLMProvider = {
      generateObject: async () => {
        calls += 1;
        throw new Error("called");
      },
    };
    const result = await run(
      ["--requirement", "x", "--evidence", "y", "--workspace", "/missing/donecheck-workspace"],
      { provider },
    );
    expect(result.exitCode).toBe(2);
    expect(calls).toBe(0);
    expect(result.stderr).toContain("Workspace");
  });

  it("does not expose raw analysis service errors", async () => {
    const workspace = createTempWorkspace();
    const provider: LLMProvider = {
      generateObject: async () => {
        throw new Error("502 Cloudflare origin web server overloaded https://secret.example/v1");
      },
    };
    try {
      const result = await run(
        ["--requirement", "x", "--evidence", "y", "--workspace", workspace],
        { provider },
      );

      expect(result.exitCode).toBe(2);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain(
        "The analysis service could not complete the request. Try again later or check the service settings.",
      );
      expect(result.stderr).not.toMatch(
        /502|Cloudflare|origin web server|https:\/\/secret\.example/u,
      );
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  it("does not ask for requirement confirmation by default", async () => {
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
        { provider: stubProvider, stdinIsTTY: true },
      );

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe("Analyzing requirements...\nReviewing workspace evidence...\n");
      expectPublicReport(JSON.parse(result.stdout), result.stdout);
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  it("fails deterministically when confirmation is requested outside a TTY", async () => {
    const workspace = createTempWorkspace();
    try {
      const result = await run(
        [
          "--requirement",
          "REQ-1: Implement app module",
          "--evidence",
          "CLAIM-1: App module is implemented",
          "--rules",
          "--confirm-requirements",
          "--workspace",
          workspace,
        ],
        { provider: stubProvider, stdinIsTTY: false },
      );

      expect(result.exitCode).toBe(2);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain("Requirement confirmation requires an interactive TTY");
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  it("prints confirmation details to stderr and continues only for y", async () => {
    const workspace = createTempWorkspace();
    try {
      const result = await run(
        [
          "--requirement",
          "REQ-1: Implement app module",
          "--evidence",
          "CLAIM-1: App module is implemented",
          "--rules",
          "--confirm-requirements",
          "--partial-ok",
          "--workspace",
          workspace,
        ],
        { provider: stubProvider, confirmInput: "y", stdinIsTTY: true },
      );

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toContain("Detected requirements");
      expect(result.stderr).toContain("  - Implement app module");
      expect(result.stderr).toContain("  - App module is implemented");
      expect(result.stderr).not.toMatch(/REQ-\d|CLAIM-\d/);
      expectPublicReport(JSON.parse(result.stdout), result.stdout);
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  it("returns 2 when requirement confirmation is rejected", async () => {
    const workspace = createTempWorkspace();
    try {
      const result = await run(
        [
          "--requirement",
          "REQ-1: Implement app module",
          "--evidence",
          "CLAIM-1: App module is implemented",
          "--rules",
          "--confirm-requirements",
          "--workspace",
          workspace,
        ],
        { provider: stubProvider, confirmInput: "n", stdinIsTTY: true },
      );

      expect(result.exitCode).toBe(2);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain("Requirement review canceled");
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
      expect(result.stderr).toBe("Analyzing requirements...\nReviewing workspace evidence...\n");
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
  readonly confirmInput?: string;
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
    readLine: async () => config.confirmInput ?? "",
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

function expectPublicReport(
  parsed: {
    readonly generatedAt?: unknown;
    readonly judgements?: unknown;
    readonly outcomeSummary?: unknown;
    readonly requirementCoverage?: unknown;
  },
  raw: string,
): void {
  expect(parsed.generatedAt).toEqual(expect.any(String));
  expect(parsed.judgements).toEqual(expect.any(Array));
  expect(parsed.requirementCoverage).toEqual(expect.any(Object));
  expect(parsed.outcomeSummary).toEqual(expect.any(Array));
  for (const internalField of [
    '"version"',
    '"id"',
    '"sourceId"',
    '"reasonCode"',
    '"semanticDraft"',
    '"signals"',
    '"includedJudgementIds"',
    '"finalStatus"',
    '"summaryStats"',
    "insufficient-evidence",
    "suspicious-fake-implementation",
    "extra-scope",
  ]) {
    expect(raw).not.toContain(internalField);
  }
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

const findingProvider: LLMProvider = {
  async generateObject<T>(input: GenerateObjectInput<T>): Promise<GenerateObjectResult<T>> {
    if (input.schemaName === "RequirementDecompositionOutput") {
      return {
        metadata: { model: "stub", provider: "stub", retries: 0 },
        object: input.schema.parse({
          claims: [{ id: "CLAIM-1", text: "App module is implemented" }],
          requirements: [{ id: "REQ-1", text: "Implement app module" }],
        }) as T,
        usage: {},
      };
    }
    if (input.schemaName === "FileSelectionModelOutput") {
      return {
        metadata: { model: "stub", provider: "stub", retries: 0 },
        object: input.schema.parse({ candidateFiles: ["src/app.ts"], warnings: [] }) as T,
        usage: {},
      };
    }
    return {
      metadata: { model: "stub", provider: "stub", retries: 0 },
      object: input.schema.parse({
        confidence: 0.9,
        evidenceRefs: [
          { filePath: "src/app.ts", lineStart: 1, lineEnd: 3, snippetSummary: "src/app.ts" },
        ],
        explanation: "stub suspicious finding",
        judgementDraft: "suspicious",
        matchedClaimId: "CLAIM-1",
        matchedRequirementId: "REQ-1",
        repairSuggestion: "replace fake implementation",
      }) as T,
      usage: {},
    };
  },
};

function buildStubObject(schemaName: string): unknown {
  if (schemaName === "RequirementDecompositionOutput") {
    return {
      claims: [{ id: "CLAIM-1", text: "App module is implemented" }],
      confidence: 0.9,
      requirements: [{ id: "REQ-1", text: "Implement app module" }],
    };
  }
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
