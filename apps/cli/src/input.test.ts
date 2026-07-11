import { describe, expect, it } from "vitest";
import type { CliOptions } from "./args.js";
import { readInput } from "./input.js";

describe("readInput", () => {
  it("normalizes direct requirement and evidence values", async () => {
    const result = await readInput(options({ evidence: { kind: "value", value: "done" } }), io());

    expect(result).toStrictEqual({
      ok: true,
      value: { evidence: "done", requirement: "Build CLI" },
    });
  });

  it("reads requirement and evidence from files", async () => {
    const result = await readInput(
      options({
        evidence: { kind: "file", path: "evidence.md" },
        requirement: { kind: "file", path: "requirement.md" },
      }),
      io({
        files: new Map([
          ["requirement.md", "Requirement from file"],
          ["evidence.md", "Evidence from file"],
        ]),
      }),
    );

    expect(result).toStrictEqual({
      ok: true,
      value: { evidence: "Evidence from file", requirement: "Requirement from file" },
    });
  });

  it("reads evidence from piped stdin when explicit evidence is absent", async () => {
    const result = await readInput(
      options({ evidence: { kind: "stdin" } }),
      io({ stdin: "Evidence from stdin", stdinIsTTY: false }),
    );

    expect(result).toStrictEqual({
      ok: true,
      value: { evidence: "Evidence from stdin", requirement: "Build CLI" },
    });
  });

  it("uses explicit evidence instead of piped stdin", async () => {
    const result = await readInput(
      options({ evidence: { kind: "value", value: "Explicit evidence" } }),
      io({ stdin: "Ignored stdin", stdinIsTTY: false }),
    );

    expect(result).toStrictEqual({
      ok: true,
      value: { evidence: "Explicit evidence", requirement: "Build CLI" },
    });
  });

  it("fails fast when evidence would come from interactive stdin", async () => {
    const result = await readInput(
      options({ evidence: { kind: "stdin" } }),
      io({ stdinIsTTY: true }),
    );

    expect(result).toStrictEqual({
      error: "Missing evidence. Use --evidence, --evidence-file, or pipe evidence through stdin.",
      ok: false,
    });
  });

  it("rejects whitespace-only requirement", async () => {
    const result = await readInput(
      options({
        evidence: { kind: "value", value: "done" },
        requirement: { kind: "value", value: "   " },
      }),
      io(),
    );

    expect(result).toStrictEqual({ error: "Requirement input is empty.", ok: false });
  });

  it("rejects whitespace-only evidence", async () => {
    const result = await readInput(options({ evidence: { kind: "value", value: "\n\t" } }), io());

    expect(result).toStrictEqual({ error: "Evidence input is empty.", ok: false });
  });

  it("reports file read errors", async () => {
    const result = await readInput(
      options({ evidence: { kind: "file", path: "missing.md" } }),
      io({ fileError: new Error("ENOENT") }),
    );

    expect(result).toStrictEqual({
      error: "Unable to read evidence file missing.md: ENOENT",
      ok: false,
    });
  });
});

function options(overrides: Partial<CliOptions> = {}): CliOptions {
  return {
    evidence: { kind: "value", value: "done" },
    confirmRequirements: false,
    html: false,
    json: false,
    legacy: false,
    mock: false,
    partialOk: false,
    requirement: { kind: "value", value: "Build CLI" },
    rules: false,
    ...overrides,
  };
}

function io(
  config: {
    readonly fileError?: Error;
    readonly files?: ReadonlyMap<string, string>;
    readonly stdin?: string;
    readonly stdinIsTTY?: boolean;
  } = {},
) {
  return {
    readFile: async (path: string) => {
      if (config.fileError) throw config.fileError;
      return config.files?.get(path) ?? "";
    },
    readStdin: async () => config.stdin ?? "",
    stdinIsTTY: config.stdinIsTTY ?? true,
  };
}
