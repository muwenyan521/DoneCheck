import { readFile, writeFile } from "node:fs/promises";
import process from "node:process";
import { analyze, runDoneCheckPipelineNode } from "@donecheck/core";
import type { LLMProvider } from "@donecheck/core";
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

  if (opts.rules || opts.html) {
    const provider = runtime.provider ?? createProvider({ stderr: runtime.stderr });
    try {
      const result = await runDoneCheckPipelineNode({
        claim: input.value.evidence,
        provider,
        requirement: input.value.requirement,
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
      return exitCodeForJudgementReport(result.report, opts.partialOk);
    } catch (error) {
      runtime.stderr(`${error instanceof Error ? error.message : String(error)}\n`);
      return toolErrorExitCode;
    }
  }

  const result = analyze(input.value);
  runtime.stdout(opts.json ? formatJsonResult(result) : formatHumanResult(result));
  return exitCodeForResult(result.status, opts.partialOk);
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
