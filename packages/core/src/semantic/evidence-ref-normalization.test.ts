import type { SemanticEvidenceRef } from "@donecheck/shared";
import { describe, expect, it } from "vitest";
import { normalizeEvidenceRef, normalizeEvidenceRefs } from "./evidence-ref-normalization.js";
import type { EvidenceSnippet } from "./schema.js";

function snippet(
  filePath: string,
  lineStart: number,
  lineEnd: number,
  summary = `snippet ${lineStart}-${lineEnd}`,
): EvidenceSnippet {
  return {
    filePath,
    id: `${filePath}:${lineStart}-${lineEnd}`,
    lineStart,
    lineEnd,
    summary,
    text: `// code ${lineStart}-${lineEnd}`,
  };
}

function ref(
  filePath: string,
  lineStart: number,
  lineEnd: number,
  summary = `model ref ${lineStart}-${lineEnd}`,
): SemanticEvidenceRef {
  return { filePath, lineStart, lineEnd, snippetSummary: summary };
}

describe("normalizeEvidenceRef", () => {
  describe("exact match", () => {
    it("returns exact when filePath, lineStart, lineEnd all match a candidate", () => {
      const candidates = [snippet("src/login.ts", 1, 40)];
      const result = normalizeEvidenceRef(ref("src/login.ts", 1, 40), candidates);
      expect(result).toEqual({
        kind: "exact",
        ref: ref("src/login.ts", 1, 40),
      });
    });

    it("returns exact for a different candidate when start/end fully match", () => {
      const candidates = [snippet("src/auth.ts", 10, 18)];
      const result = normalizeEvidenceRef(ref("src/auth.ts", 10, 18), candidates);
      expect(result.kind).toBe("exact");
    });
  });

  describe("near miss normalize (positive)", () => {
    it("normalizes 1-41 to candidate 1-40", () => {
      const candidates = [snippet("src/login.ts", 1, 40, "login form")];
      const result = normalizeEvidenceRef(ref("src/login.ts", 1, 41), candidates);
      expect(result.kind).toBe("normalized");
      if (result.kind !== "normalized") return;
      expect(result.ref.filePath).toBe("src/login.ts");
      expect(result.ref.lineStart).toBe(1);
      expect(result.ref.lineEnd).toBe(40);
      expect(result.ref.snippetSummary).toBe("login form");
      expect(result.warning).toContain("src/login.ts");
    });

    it("normalizes 10-18 to candidate 10-17", () => {
      const candidates = [snippet("src/auth.ts", 10, 17)];
      const result = normalizeEvidenceRef(ref("src/auth.ts", 10, 18), candidates);
      expect(result.kind).toBe("normalized");
      if (result.kind !== "normalized") return;
      expect(result.ref.lineStart).toBe(10);
      expect(result.ref.lineEnd).toBe(17);
    });

    it("normalizes 5-20 to candidate 6-20 (start off by 1)", () => {
      const candidates = [snippet("src/auth.ts", 6, 20)];
      const result = normalizeEvidenceRef(ref("src/auth.ts", 5, 20), candidates);
      expect(result.kind).toBe("normalized");
      if (result.kind !== "normalized") return;
      expect(result.ref.lineStart).toBe(6);
      expect(result.ref.lineEnd).toBe(20);
    });

    it("normalizes 5-21 to candidate 6-20 (both off by 1)", () => {
      const candidates = [snippet("src/auth.ts", 6, 20)];
      const result = normalizeEvidenceRef(ref("src/auth.ts", 5, 21), candidates);
      expect(result.kind).toBe("normalized");
      if (result.kind !== "normalized") return;
      expect(result.ref.lineStart).toBe(6);
      expect(result.ref.lineEnd).toBe(20);
    });

    it("uses the candidate snippet summary, not the model's fabricated summary", () => {
      const candidates = [snippet("src/login.ts", 1, 40, "real candidate summary")];
      const result = normalizeEvidenceRef(
        ref("src/login.ts", 1, 41, "model fabricated summary"),
        candidates,
      );
      expect(result.kind).toBe("normalized");
      if (result.kind !== "normalized") return;
      expect(result.ref.snippetSummary).toBe("real candidate summary");
    });
  });

  describe("broad ref fail (negative)", () => {
    it("rejects 1-44 against 1-40 (end off by 4)", () => {
      const candidates = [snippet("src/login.ts", 1, 40)];
      const result = normalizeEvidenceRef(ref("src/login.ts", 1, 44), candidates);
      expect(result.kind).toBe("unmatched");
    });

    it("rejects 1-100 against 1-40 (end off by 60)", () => {
      const candidates = [snippet("src/login.ts", 1, 40)];
      const result = normalizeEvidenceRef(ref("src/login.ts", 1, 100), candidates);
      expect(result.kind).toBe("unmatched");
    });

    it("rejects 1-40 against 5-44 (start off by 4, end off by 4)", () => {
      const candidates = [snippet("src/login.ts", 5, 44)];
      const result = normalizeEvidenceRef(ref("src/login.ts", 1, 40), candidates);
      expect(result.kind).toBe("unmatched");
    });

    it("rejects when filePath mismatches", () => {
      const candidates = [snippet("src/login.ts", 1, 40)];
      const result = normalizeEvidenceRef(ref("src/missing.ts", 1, 40), candidates);
      expect(result.kind).toBe("unmatched");
    });

    it("rejects completely disjoint ranges", () => {
      const candidates = [snippet("src/login.ts", 1, 40)];
      const result = normalizeEvidenceRef(ref("src/login.ts", 100, 200), candidates);
      expect(result.kind).toBe("unmatched");
    });

    it("rejects ref whose span is much larger than candidate even if start matches", () => {
      const candidates = [snippet("src/login.ts", 1, 40)];
      // start diff 0, end diff 10 → fail on end diff
      const result = normalizeEvidenceRef(ref("src/login.ts", 1, 50), candidates);
      expect(result.kind).toBe("unmatched");
    });

    it("rejects when no candidates exist", () => {
      const result = normalizeEvidenceRef(ref("src/login.ts", 1, 40), []);
      expect(result.kind).toBe("unmatched");
    });
  });

  describe("ambiguous fail", () => {
    it("rejects when two candidates are equally near the model ref", () => {
      // model 1-41; candidates 1-40 and 1-42 are both off-by-1 on end
      const candidates = [
        snippet("src/login.ts", 1, 40, "left candidate"),
        snippet("src/login.ts", 1, 42, "right candidate"),
      ];
      const result = normalizeEvidenceRef(ref("src/login.ts", 1, 41), candidates);
      expect(result.kind).toBe("unmatched");
    });

    it("rejects when two candidates tie on the same near-miss score", () => {
      // model 5-20; candidates 4-20 and 6-20 both have start off by 1
      const candidates = [snippet("src/auth.ts", 4, 20), snippet("src/auth.ts", 6, 20)];
      const result = normalizeEvidenceRef(ref("src/auth.ts", 5, 20), candidates);
      expect(result.kind).toBe("unmatched");
    });
  });

  describe("tie-breaking toward exact when present", () => {
    it("returns exact when one candidate matches exactly even if others are near", () => {
      const candidates = [snippet("src/login.ts", 1, 40), snippet("src/login.ts", 1, 41)];
      const result = normalizeEvidenceRef(ref("src/login.ts", 1, 40), candidates);
      expect(result.kind).toBe("exact");
    });
  });

  describe("warning message", () => {
    it("includes original and normalized ref in the warning", () => {
      const candidates = [snippet("src/login.ts", 1, 40, "login form")];
      const result = normalizeEvidenceRef(ref("src/login.ts", 1, 41), candidates);
      expect(result.kind).toBe("normalized");
      if (result.kind !== "normalized") return;
      expect(result.warning).toContain("src/login.ts:1-41");
      expect(result.warning).toContain("src/login.ts:1-40");
    });
  });
});

describe("normalizeEvidenceRefs", () => {
  it("normalizes a list of refs, preserving exact and normalized, surfacing unmatched", () => {
    const candidates = [
      snippet("src/login.ts", 1, 40, "login form"),
      snippet("src/auth.ts", 10, 17, "auth token"),
    ];
    const result = normalizeEvidenceRefs(
      [
        ref("src/login.ts", 1, 40), // exact
        ref("src/auth.ts", 10, 18), // near miss
        ref("src/missing.ts", 1, 5), // unmatched
      ],
      candidates,
    );
    expect(result.refs).toHaveLength(3);
    expect(result.refs[0]?.kind).toBe("exact");
    expect(result.refs[1]?.kind).toBe("normalized");
    expect(result.refs[2]?.kind).toBe("unmatched");
    expect(result.warnings).toHaveLength(1);
  });

  it("normalized ref in the returned list points to the canonical candidate", () => {
    const candidates = [snippet("src/login.ts", 1, 40, "login form")];
    const result = normalizeEvidenceRefs([ref("src/login.ts", 1, 41)], candidates);
    expect(result.refs[0]?.kind).toBe("normalized");
    if (result.refs[0]?.kind !== "normalized") return;
    expect(result.refs[0]?.ref.lineStart).toBe(1);
    expect(result.refs[0]?.ref.lineEnd).toBe(40);
    expect(result.refs[0]?.ref.snippetSummary).toBe("login form");
  });
});
