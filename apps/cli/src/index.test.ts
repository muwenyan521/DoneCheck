import { parseDoneCheckResult } from "@donecheck/shared";
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

const requirement = "Implement shared contracts and core analysis tests.";
const coveringEvidence =
  "The shared contracts, core analysis, and tests implement verified coverage.";

interface RunConfig {
  readonly fileError?: Error;
  readonly stdin?: string;
  readonly stdinIsTTY?: boolean;
}

async function run(argv: readonly string[], config: RunConfig = {}) {
  let stdout = "";
  let stderr = "";
  const exitCode = await runCli({
    argv,
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
  });

  return { exitCode, stderr, stdout };
}
