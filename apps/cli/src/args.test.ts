import { describe, expect, it } from "vitest";
import { parseArgs } from "./args.js";

describe("parseArgs", () => {
  it("parses direct requirement and evidence", () => {
    expect(parseArgs(["--requirement", "Build CLI", "--evidence", "CLI built"])).toStrictEqual({
      ok: true,
      value: {
        evidence: { kind: "value", value: "CLI built" },
        json: false,
        partialOk: false,
        requirement: { kind: "value", value: "Build CLI" },
      },
    });
  });

  it("parses file inputs and output flags", () => {
    expect(
      parseArgs([
        "--requirement-file",
        "requirement.md",
        "--evidence-file",
        "evidence.md",
        "--json",
        "--partial-ok",
      ]),
    ).toStrictEqual({
      ok: true,
      value: {
        evidence: { kind: "file", path: "evidence.md" },
        json: true,
        partialOk: true,
        requirement: { kind: "file", path: "requirement.md" },
      },
    });
  });

  it("allows stdin evidence when evidence flags are absent", () => {
    expect(parseArgs(["--requirement", "Build CLI"])).toStrictEqual({
      ok: true,
      value: {
        evidence: { kind: "stdin" },
        json: false,
        partialOk: false,
        requirement: { kind: "value", value: "Build CLI" },
      },
    });
  });

  it("rejects unknown flags", () => {
    expect(parseArgs(["--requirement", "Build CLI", "--wat"])).toStrictEqual({
      error: "Unknown option: --wat",
      ok: false,
    });
  });

  it("rejects missing option values", () => {
    expect(parseArgs(["--requirement"])).toStrictEqual({
      error: "Option --requirement requires a value.",
      ok: false,
    });
  });

  it("rejects mutually exclusive requirement sources", () => {
    expect(
      parseArgs(["--requirement", "Build CLI", "--requirement-file", "requirement.md"]),
    ).toStrictEqual({
      error: "Use only one requirement source: --requirement or --requirement-file.",
      ok: false,
    });
  });

  it("rejects mutually exclusive evidence sources", () => {
    expect(
      parseArgs([
        "--requirement",
        "Build CLI",
        "--evidence",
        "done",
        "--evidence-file",
        "evidence.md",
      ]),
    ).toStrictEqual({
      error: "Use only one explicit evidence source: --evidence or --evidence-file.",
      ok: false,
    });
  });
});
