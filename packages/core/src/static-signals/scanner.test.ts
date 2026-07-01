import { describe, expect, it } from "vitest";
import { scanFakeImplementationSignals, scanStaticSignals } from "./scanner.js";

describe("scanFakeImplementationSignals", () => {
  it("detects alert() as alert-only", () => {
    const signals = scanFakeImplementationSignals({
      filePath: "src/x.ts",
      content: "function save() { alert('saved'); }",
    });
    expect(signals).toHaveLength(1);
    expect(signals[0]).toMatchObject({
      filePath: "src/x.ts",
      pattern: "alert-only",
      lineStart: 1,
      lineEnd: 1,
      strength: "strong",
    });
  });

  it("detects 'not implemented' comment + throw placeholder as not-implemented", () => {
    const content = [
      "// not implemented yet",
      "function f() {",
      '  throw new Error("not implemented");',
      "}",
    ].join("\n");
    const signals = scanFakeImplementationSignals({ filePath: "a.ts", content });
    const notImpl = signals.filter((s) => s.pattern === "not-implemented");
    expect(notImpl.length).toBeGreaterThanOrEqual(2);
  });

  it("detects TODO/FIXME as todo", () => {
    const signals = scanFakeImplementationSignals({
      filePath: "a.ts",
      content: "// TODO: implement\n// FIXME later",
    });
    expect(signals.filter((s) => s.pattern === "todo")).toHaveLength(2);
  });

  it("detects empty arrow handler", () => {
    const signals = scanFakeImplementationSignals({
      filePath: "a.ts",
      content: "const onClick = () => {};",
    });
    expect(signals.filter((s) => s.pattern === "empty-handler")).toHaveLength(1);
  });

  it("detects mock-only marker", () => {
    const signals = scanFakeImplementationSignals({
      filePath: "a.ts",
      content: "// mock-only\nclass Auth { /* mock */ }",
    });
    expect(signals.filter((s) => s.pattern === "mock")).toHaveLength(2);
  });

  it("returns empty array for clean code", () => {
    const signals = scanFakeImplementationSignals({
      filePath: "a.ts",
      content: "function add(a: number, b: number) { return a + b; }",
    });
    expect(signals).toEqual([]);
  });

  it("assigns correct line numbers", () => {
    const content = "\n\nalert('x');\n";
    const signals = scanFakeImplementationSignals({ filePath: "a.ts", content });
    expect(signals[0]?.lineStart).toBe(3);
  });
});

describe("scanStaticSignals", () => {
  it("detects localStorage/auth/xlsx/@media as strong signals", () => {
    const content =
      "localStorage.setItem('x', '1');\nconst auth = {};\nloadXlsx();\n@media print {}";
    const signals = scanStaticSignals({ filePath: "a.ts", content });
    const keywords = signals.map((s) => s.keyword).sort();
    expect(keywords).toEqual(["@media", "auth", "localStorage", "xlsx"]);
    expect(signals.every((s) => s.strength === "strong")).toBe(true);
  });

  it("returns empty for content without strong keywords", () => {
    expect(scanStaticSignals({ filePath: "a.ts", content: "const x = 1;" })).toEqual([]);
  });
});
