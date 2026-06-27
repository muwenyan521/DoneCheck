import { readFile } from "node:fs/promises";
import process from "node:process";
import { analyze } from "@donecheck/core";
import { parseArgs } from "./args.js";
import { exitCodeForResult, toolErrorExitCode } from "./exit-code.js";
import { readInput } from "./input.js";
import { formatHumanResult, formatJsonResult } from "./output.js";

export interface CliRuntime {
  readonly argv: readonly string[];
  readFile(path: string): Promise<string>;
  readStdin(): Promise<string>;
  readonly stdinIsTTY: boolean;
  stderr(chunk: string): void;
  stdout(chunk: string): void;
}

export async function runCli(runtime: CliRuntime): Promise<number> {
  const options = parseArgs(runtime.argv);
  if (!options.ok) {
    runtime.stderr(`${options.error}\n`);
    return toolErrorExitCode;
  }

  const input = await readInput(options.value, {
    readFile: runtime.readFile,
    readStdin: runtime.readStdin,
    stdinIsTTY: runtime.stdinIsTTY,
  });
  if (!input.ok) {
    runtime.stderr(`${input.error}\n`);
    return toolErrorExitCode;
  }

  const result = analyze(input.value);
  runtime.stdout(options.value.json ? formatJsonResult(result) : formatHumanResult(result));
  return exitCodeForResult(result.status, options.value.partialOk);
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
  });
}
