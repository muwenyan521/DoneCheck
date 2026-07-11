import { readFile, writeFile } from "node:fs/promises";
import process from "node:process";
import type { LLMProvider } from "@donecheck/core";
import { analyze, runDoneCheckPipelineNode } from "@donecheck/core";
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
    const provider =
      runtime.provider ??
      createProvider({
        ...(opts.mock ? { mock: true } : {}),
        stderr: runtime.stderr,
      });
    const decomposition = await decomposeRequirements({
      claim: input.value.evidence,
      provider,
      requirement: input.value.requirement,
    });
    if (opts.confirmRequirements) {
      const confirmed = await confirmRequirementDecomposition(runtime, decomposition);
      if (!confirmed.ok) return toolErrorExitCode;
    }
    const result = await runDoneCheckPipelineNode({
      claim: input.value.evidence,
      claims: decomposition.claims,
      provider,
      requirement: input.value.requirement,
      requirements: decomposition.requirements,
      workspacePath: opts.workspace ?? process.cwd(),
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
    return opts.rules ? 0 : exitCodeForJudgementReport(result.report, opts.partialOk);
  } catch (error) {
    if (!(error instanceof ProviderConfigError)) {
      runtime.stderr(`${error instanceof Error ? error.message : String(error)}\n`);
    }
    return toolErrorExitCode;
  }
}

interface ConfirmResult {
  readonly ok: boolean;
}

async function confirmRequirementDecomposition(
  runtime: CliRuntime,
  decomposition: Awaited<ReturnType<typeof decomposeRequirements>>,
): Promise<ConfirmResult> {
  runtime.stderr("Decomposed requirements:\n");
  for (const requirement of decomposition.requirements) {
    runtime.stderr(`  ${requirement.id}: ${requirement.text}\n`);
  }
  if (decomposition.claims.length > 0) {
    runtime.stderr("Decomposed claims:\n");
    for (const claim of decomposition.claims) {
      runtime.stderr(`  ${claim.id}: ${claim.text}\n`);
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
  runtime.stderr("Continue with these decomposed requirements? [y/N] ");
  const answer = (await runtime.readLine()).trim();
  if (answer === "y" || answer === "Y") return { ok: true };
  runtime.stderr("Requirement decomposition rejected.\n");
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
  runProcessCli().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
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
