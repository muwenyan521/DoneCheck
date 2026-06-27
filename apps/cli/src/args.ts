export interface ValueSource {
  readonly kind: "value";
  readonly value: string;
}

export interface FileSource {
  readonly kind: "file";
  readonly path: string;
}

export interface StdinSource {
  readonly kind: "stdin";
}

export type TextSource = ValueSource | FileSource;
export type EvidenceSource = TextSource | StdinSource;

export interface CliOptions {
  readonly evidence: EvidenceSource;
  readonly json: boolean;
  readonly partialOk: boolean;
  readonly requirement: TextSource;
}

export interface ParseSuccess {
  readonly ok: true;
  readonly value: CliOptions;
}

export interface ParseFailure {
  readonly error: string;
  readonly ok: false;
}

export type ParseResult = ParseSuccess | ParseFailure;

interface OptionValueSuccess {
  readonly ok: true;
  readonly value: string;
}

type OptionValueResult = OptionValueSuccess | ParseFailure;

export function parseArgs(argv: readonly string[]): ParseResult {
  let requirement: TextSource | undefined;
  let evidence: EvidenceSource | undefined;
  let json = false;
  let partialOk = false;

  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index];
    if (!option) continue;

    switch (option) {
      case "--requirement": {
        if (requirement) {
          return requirementSourceError();
        }
        const value = readOptionValue(argv, index, option);
        if (!value.ok) return value;
        requirement = { kind: "value", value: value.value };
        index += 1;
        break;
      }
      case "--requirement-file": {
        if (requirement) {
          return requirementSourceError();
        }
        const value = readOptionValue(argv, index, option);
        if (!value.ok) return value;
        requirement = { kind: "file", path: value.value };
        index += 1;
        break;
      }
      case "--evidence": {
        if (evidence && evidence.kind !== "stdin") {
          return evidenceSourceError();
        }
        const value = readOptionValue(argv, index, option);
        if (!value.ok) return value;
        evidence = { kind: "value", value: value.value };
        index += 1;
        break;
      }
      case "--evidence-file": {
        if (evidence && evidence.kind !== "stdin") {
          return evidenceSourceError();
        }
        const value = readOptionValue(argv, index, option);
        if (!value.ok) return value;
        evidence = { kind: "file", path: value.value };
        index += 1;
        break;
      }
      case "--json": {
        json = true;
        break;
      }
      case "--partial-ok": {
        partialOk = true;
        break;
      }
      default: {
        return { error: `Unknown option: ${option}`, ok: false };
      }
    }
  }

  if (!requirement) {
    return { error: "Missing requirement. Use --requirement or --requirement-file.", ok: false };
  }

  return {
    ok: true,
    value: {
      evidence: evidence ?? { kind: "stdin" },
      json,
      partialOk,
      requirement,
    },
  };
}

function readOptionValue(
  argv: readonly string[],
  optionIndex: number,
  optionName: string,
): OptionValueResult {
  const value = argv[optionIndex + 1];
  if (value === undefined || value.startsWith("--")) {
    return { error: `Option ${optionName} requires a value.`, ok: false };
  }

  return { ok: true, value };
}

function requirementSourceError(): ParseFailure {
  return {
    error: "Use only one requirement source: --requirement or --requirement-file.",
    ok: false,
  };
}

function evidenceSourceError(): ParseFailure {
  return {
    error: "Use only one explicit evidence source: --evidence or --evidence-file.",
    ok: false,
  };
}
