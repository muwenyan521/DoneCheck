import { describe, expect, it } from "vitest";
import { extractEvidenceSnippets, extractSnippet } from "./snippet.js";

const CONTENT = [
  "import { z } from 'zod';",
  "",
  "function add(a, b) {",
  "  return a + b;",
  "}",
  "",
  "// TODO: refactor",
].join("\n");

describe("extractSnippet", () => {
  it("extracts a single-line snippet", () => {
    const s = extractSnippet({
      content: CONTENT,
      filePath: "a.ts",
      lineStart: 3,
      lineEnd: 3,
      id: "ev1",
    });
    expect(s).toMatchObject({
      filePath: "a.ts",
      id: "ev1",
      lineStart: 3,
      lineEnd: 3,
      text: "function add(a, b) {",
      summary: "function add(a, b) {",
    });
  });

  it("extracts a multi-line snippet", () => {
    const s = extractSnippet({
      content: CONTENT,
      filePath: "a.ts",
      lineStart: 3,
      lineEnd: 5,
      id: "ev1",
    });
    expect(s.text).toBe("function add(a, b) {\n  return a + b;\n}");
    expect(s.summary).toBe("function add(a, b) {");
  });

  it("clamps lineStart beyond file length", () => {
    const s = extractSnippet({
      content: CONTENT,
      filePath: "a.ts",
      lineStart: 100,
      lineEnd: 100,
      id: "ev1",
    });
    const totalLines = CONTENT.split("\n").length;
    expect(s.lineStart).toBe(totalLines);
    expect(s.lineEnd).toBe(totalLines);
  });

  it("clamps lineStart below 1 to 1", () => {
    const s = extractSnippet({
      content: CONTENT,
      filePath: "a.ts",
      lineStart: 0,
      lineEnd: 0,
      id: "ev1",
    });
    expect(s.lineStart).toBe(1);
    expect(s.lineEnd).toBe(1);
  });

  it("throws on lineStart > lineEnd", () => {
    expect(() =>
      extractSnippet({
        content: CONTENT,
        filePath: "a.ts",
        lineStart: 5,
        lineEnd: 3,
        id: "ev1",
      }),
    ).toThrow();
  });

  it("summary strips leading comment markers", () => {
    const s = extractSnippet({
      content: "// TODO: refactor",
      filePath: "a.ts",
      lineStart: 1,
      lineEnd: 1,
      id: "ev1",
    });
    expect(s.summary).toBe("TODO: refactor");
  });
});

describe("extractEvidenceSnippets", () => {
  it("extracts multiple refs", () => {
    const refs = [
      { filePath: "a.ts", lineStart: 1, lineEnd: 1, snippetSummary: "import" },
      { filePath: "a.ts", lineStart: 3, lineEnd: 5, snippetSummary: "add fn" },
    ];
    const snippets = extractEvidenceSnippets({ content: CONTENT, filePath: "a.ts", refs });
    expect(snippets).toHaveLength(2);
    expect(snippets[0]?.id).toBe("a.ts:1-1");
    expect(snippets[1]?.id).toBe("a.ts:3-5");
  });
});
