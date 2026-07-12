import { readFile, writeFile } from "node:fs/promises";
import process from "node:process";
import type { LLMProvider } from "@donecheck/core";
import {
  WorkspaceValidationError,
  analyze,
  runDoneCheckPipelineNode,
  validateWorkspace,
} from "@donecheck/core";
import { decomposeRequirements } from "@donecheck/core/semantic";
import { ProviderConfigError } from "@donecheck/provider-openai";
import { parseArgs } from "./args.js";
import { exitCodeForJudgementReport, exitCodeForResult, toolErrorExitCode } from "./exit-code.js";
import { readInput } from "./input.js";
import { formatHumanResult, formatJsonResult } from "./output.js";
import { createProvider } from "./provider-factory.js";
import { formatHtml, formatRulesJson } from "./rules-output.js";

export interface CliRuntime {
  readonly argv: readonly string[];
  readonly provider?: LLMProvider;
  readFile(path: string): Promise<string>;
  readLine?(): Promise<string>;
  readStdin(): Promise<string>;
  readonly stdinIsTTY: boolean;
  stderr(chunk: string): void;
  stdout(chunk: string): void;
  writeFile?(path: string, content: string): Promise<void>;
}

export async function runCli(runtime: CliRuntime): Promise<number> {
  if (runtime.argv.includes("--help")) {
    runtime.stdout(helpText);
    return 0;
  }
  const options = parseArgs(runtime.argv);
  if (!options.ok) {
    runtime.stderr(`${options.error}\n`);
    return toolErrorExitCode;
  }

  const opts = options.value;
  const input = await readInput(opts, {
    readFile: runtime.readFile,
    readStdin: runtime.readStdin,
    stdinIsTTY: runtime.stdinIsTTY,
  });
  if (!input.ok) {
    runtime.stderr(`${input.error}\n`);
    return toolErrorExitCode;
  }

  if (opts.legacy) {
    const result = analyze(input.value);
    runtime.stdout(opts.json ? formatJsonResult(result) : formatHumanResult(result));
    return exitCodeForResult(result.status, opts.partialOk);
  }

  try {
    const workspacePath = opts.workspace ?? process.cwd();
    await validateWorkspace(workspacePath);
    const provider =
      runtime.provider ??
      createProvider({
        ...(opts.mock ? { mock: true } : {}),
        stderr: runtime.stderr,
      });
    runtime.stderr("Analyzing requirements...\n");
    const decomposition = await decomposeRequirements({
      claim: input.value.evidence,
      provider,
      requirement: input.value.requirement,
    });
    if (opts.confirmRequirements) {
      const confirmed = await confirmRequirementDecomposition(runtime, decomposition);
      if (!confirmed.ok) return toolErrorExitCode;
    }
    runtime.stderr("Reviewing workspace evidence...\n");
    const result = await runDoneCheckPipelineNode({
      claim: input.value.evidence,
      claims: decomposition.claims,
      provider,
      requirement: input.value.requirement,
      requirements: decomposition.requirements,
      workspacePath,
    });
    if (opts.html) {
      const html = formatHtml(result.report);
      if (opts.output) {
        await runtime.writeFile?.(opts.output, html);
      } else {
        runtime.stdout(html);
      }
    } else {
      runtime.stdout(formatRulesJson(result.report));
    }
    return exitCodeForJudgementReport(result.report, opts.partialOk);
  } catch (error) {
    if (error instanceof WorkspaceValidationError) {
      runtime.stderr(`${error.message}\n`);
    } else if (!(error instanceof ProviderConfigError)) {
      runtime.stderr(publicServiceErrorMessage);
    }
    return toolErrorExitCode;
  }
}

const helpText =
  "DoneCheck\n\nUsage:\n  donecheck --requirement <text>|--requirement-file <path> [--evidence <text>|--evidence-file <path>] [options]\n\nOptions:\n  --workspace <path>       Analyze a local source directory.\n  --rules                  Print a detailed JSON report.\n  --html                   Render a self-contained HTML report.\n  --output <path>          Write HTML output (requires --html).\n  --mock                   Use local demo data without contacting an analysis service.\n  --partial-ok             Return 0 for reports containing only partial or insufficient evidence.\n  --confirm-requirements   Review the detected requirements in an interactive terminal.\n  --text-only              Check requirement and evidence text without reading a workspace.\n  --json                   Print text-only checker output as JSON (requires --text-only).\n  --help                   Show this help.\n";

const publicServiceErrorMessage =
  "The analysis service could not complete the request. Try again later or check the service settings.\n";

interface ConfirmResult {
  readonly ok: boolean;
}

async function confirmRequirementDecomposition(
  runtime: CliRuntime,
  decomposition: Awaited<ReturnType<typeof decomposeRequirements>>,
): Promise<ConfirmResult> {
  runtime.stderr("Detected requirements:\n");
  for (const requirement of decomposition.requirements) {
    runtime.stderr(`  - ${requirement.text}\n`);
  }
  if (decomposition.claims.length > 0) {
    runtime.stderr("Detected completion claims:\n");
    for (const claim of decomposition.claims) {
      runtime.stderr(`  - ${claim.text}\n`);
    }
  }
  if (decomposition.assumptions.length > 0) {
    runtime.stderr(
      `Assumptions:\n${decomposition.assumptions.map((item) => `  - ${item}`).join("\n")}\n`,
    );
  }
  if (decomposition.clarifyingQuestions.length > 0) {
    runtime.stderr(
      `Clarifying questions:\n${decomposition.clarifyingQuestions.map((item) => `  - ${item}`).join("\n")}\n`,
    );
  }
  if (!runtime.stdinIsTTY || runtime.readLine === undefined) {
    runtime.stderr("Requirement confirmation requires an interactive TTY.\n");
    return { ok: false };
  }
  runtime.stderr("Continue with these items? [y/N] ");
  const answer = (await runtime.readLine()).trim();
  if (answer === "y" || answer === "Y") return { ok: true };
  runtime.stderr("Requirement review canceled.\n");
  return { ok: false };
}

async function readProcessStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

if (isMainModule()) {
  runProcessCli().catch(() => {
    process.stderr.write(publicServiceErrorMessage);
    process.exitCode = toolErrorExitCode;
  });
}

function isMainModule(): boolean {
  return process.argv[1] === new URL(import.meta.url).pathname;
}

async function runProcessCli(): Promise<void> {
  process.exitCode = await runCli({
    argv: process.argv.slice(2),
    readFile: (path) => readFile(path, "utf8"),
    readStdin: readProcessStdin,
    stderr: (chunk) => process.stderr.write(chunk),
    stdinIsTTY: process.stdin.isTTY ?? false,
    stdout: (chunk) => process.stdout.write(chunk),
    writeFile: (path, content) => writeFile(path, content, "utf8"),
  });
}
