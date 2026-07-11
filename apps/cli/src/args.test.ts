import { describe, expect, it } from "vitest";
import { parseArgs } from "./args.js";

describe("parseArgs", () => {
  it("parses direct requirement and evidence", () => {
    expect(parseArgs(["--requirement", "Build CLI", "--evidence", "CLI built"])).toStrictEqual({
      ok: true,
      value: {
        evidence: { kind: "value", value: "CLI built" },
        html: false,
        json: false,
        legacy: false,
        mock: false,
        partialOk: false,
        confirmRequirements: false,
        requirement: { kind: "value", value: "Build CLI" },
        rules: false,
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
        "--legacy",
        "--json",
        "--partial-ok",
      ]),
    ).toStrictEqual({
      ok: true,
      value: {
        evidence: { kind: "file", path: "evidence.md" },
        html: false,
        json: true,
        legacy: true,
        mock: false,
        partialOk: true,
        confirmRequirements: false,
        requirement: { kind: "file", path: "requirement.md" },
        rules: false,
      },
    });
  });

  it("allows stdin evidence when evidence flags are absent", () => {
    expect(parseArgs(["--requirement", "Build CLI"])).toStrictEqual({
      ok: true,
      value: {
        evidence: { kind: "stdin" },
        html: false,
        json: false,
        legacy: false,
        mock: false,
        partialOk: false,
        confirmRequirements: false,
        requirement: { kind: "value", value: "Build CLI" },
        rules: false,
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

  describe("--rules / --html / --output / --workspace", () => {
    it("parses --rules", () => {
      const r = parseArgs(["--requirement", "x", "--rules"]);
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.rules).toBe(true);
    });

    it("parses --html with --output file", () => {
      const r = parseArgs(["--requirement", "x", "--html", "--output", "out.html"]);
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.value.html).toBe(true);
        expect(r.value.output).toBe("out.html");
      }
    });

    it("parses --workspace", () => {
      const r = parseArgs(["--requirement", "x", "--rules", "--workspace", "/tmp/proj"]);
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.workspace).toBe("/tmp/proj");
    });

    it("parses --confirm-requirements", () => {
      const r = parseArgs(["--requirement", "x", "--rules", "--confirm-requirements"]);
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.confirmRequirements).toBe(true);
    });

    it("rejects --json + --rules together", () => {
      const r = parseArgs(["--requirement", "x", "--json", "--rules"]);
      expect(r.ok).toBe(false);
    });

    it("rejects --json + --html together", () => {
      const r = parseArgs(["--requirement", "x", "--json", "--html"]);
      expect(r.ok).toBe(false);
    });

    it("rejects --rules + --html together", () => {
      const r = parseArgs(["--requirement", "x", "--rules", "--html"]);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toContain("mutually exclusive");
    });

    it("rejects --json without --legacy", () => {
      const r = parseArgs(["--requirement", "x", "--evidence", "y", "--json"]);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toContain("--json requires --legacy");
    });

    it("rejects --output without --html", () => {
      const r = parseArgs(["--requirement", "x", "--rules", "--output", "out.html"]);
      expect(r.ok).toBe(false);
    });
  });

  describe("--legacy / --mock", () => {
    it("parses --legacy", () => {
      const r = parseArgs(["--requirement", "x", "--evidence", "y", "--legacy"]);
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.legacy).toBe(true);
    });

    it("parses --mock", () => {
      const r = parseArgs(["--requirement", "x", "--evidence", "y", "--mock"]);
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.mock).toBe(true);
    });

    it("parses --legacy --json together", () => {
      const r = parseArgs(["--requirement", "x", "--evidence", "y", "--legacy", "--json"]);
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.value.legacy).toBe(true);
        expect(r.value.json).toBe(true);
      }
    });

    it("rejects --legacy + --rules together", () => {
      const r = parseArgs(["--requirement", "x", "--evidence", "y", "--legacy", "--rules"]);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toContain("--legacy cannot be combined with --rules");
    });

    it("rejects --legacy + --html together", () => {
      const r = parseArgs(["--requirement", "x", "--evidence", "y", "--legacy", "--html"]);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toContain("--legacy cannot be combined");
    });
  });
});
