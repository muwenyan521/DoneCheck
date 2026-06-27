import type { CliOptions, EvidenceSource, TextSource } from "./args.js";

export interface NormalizedInput {
  readonly evidence: string;
  readonly requirement: string;
}

export interface InputReadSuccess {
  readonly ok: true;
  readonly value: NormalizedInput;
}

export interface InputReadFailure {
  readonly error: string;
  readonly ok: false;
}

export type InputReadResult = InputReadSuccess | InputReadFailure;

export interface InputReaderIo {
  readFile(path: string): Promise<string>;
  readStdin(): Promise<string>;
  readonly stdinIsTTY: boolean;
}

export async function readInput(options: CliOptions, io: InputReaderIo): Promise<InputReadResult> {
  const requirement = await readTextSource(options.requirement, "requirement", io);
  if (!requirement.ok) return requirement;

  const evidence = await readEvidenceSource(options.evidence, io);
  if (!evidence.ok) return evidence;

  const normalizedRequirement = requireNonEmpty(requirement.value, "Requirement");
  if (!normalizedRequirement.ok) return normalizedRequirement;

  const normalizedEvidence = requireNonEmpty(evidence.value, "Evidence");
  if (!normalizedEvidence.ok) return normalizedEvidence;

  return {
    ok: true,
    value: {
      evidence: normalizedEvidence.value,
      requirement: normalizedRequirement.value,
    },
  };
}

async function readEvidenceSource(
  source: EvidenceSource,
  io: InputReaderIo,
): Promise<TextReadResult> {
  if (source.kind === "stdin") {
    if (io.stdinIsTTY) {
      return {
        error: "Missing evidence. Use --evidence, --evidence-file, or pipe evidence through stdin.",
        ok: false,
      };
    }
    return { ok: true, value: await io.readStdin() };
  }

  return readTextSource(source, "evidence", io);
}

async function readTextSource(
  source: TextSource,
  label: "evidence" | "requirement",
  io: InputReaderIo,
): Promise<TextReadResult> {
  if (source.kind === "value") {
    return { ok: true, value: source.value };
  }

  try {
    return { ok: true, value: await io.readFile(source.path) };
  } catch (error) {
    return {
      error: `Unable to read ${label} file ${source.path}: ${errorMessage(error)}`,
      ok: false,
    };
  }
}

interface TextReadSuccess {
  readonly ok: true;
  readonly value: string;
}

type TextReadResult = TextReadSuccess | InputReadFailure;

function requireNonEmpty(value: string, label: "Evidence" | "Requirement"): TextReadResult {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return { error: `${label} input is empty.`, ok: false };
  }

  return { ok: true, value };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
