import { describe, expect, it } from "vitest";
import type { FakeImplementationSignal, TargetedStaticSignal } from "../rules/schema.js";
import type { EvidenceSnippet, SemanticClaim, SemanticRequirement } from "../semantic/schema.js";
import {
  defaultEvidenceSelectionBudget,
  selectEvidenceForRequirement,
} from "./evidence-selection.js";

function snippet(filePath: string, lineStart: number, text: string): EvidenceSnippet {
  return {
    filePath,
    id: `${filePath}:${lineStart}-${lineStart}`,
    lineEnd: lineStart,
    lineStart,
    summary: text.slice(0, 80),
    text,
  };
}

function paths(items: readonly EvidenceSnippet[]): string[] {
  return items.map((item) => item.filePath);
}

function countByPath(items: readonly EvidenceSnippet[], filePath: string): number {
  return paths(items).filter((path) => path === filePath).length;
}

const loginRequirement: SemanticRequirement = {
  id: "REQ-login",
  text: "Users can sign in with email and password through an authenticated session.",
};

const exportRequirement: SemanticRequirement = {
  id: "REQ-export",
  text: "Users can export completed records to a CSV file.",
};

const testRequirement: SemanticRequirement = {
  id: "REQ-tests",
  text: "The feature includes automated tests proving the user flow.",
};

const loginClaim: SemanticClaim = {
  id: "CLAIM-login",
  text: "The email password login flow uses authentication helpers and creates a session.",
};

const exportClaim: SemanticClaim = {
  id: "CLAIM-export",
  text: "The export button downloads CSV records.",
};

const baseSnippets: EvidenceSnippet[] = [
  snippet("src/components/LoginForm.tsx", 10, "email password sign in form submits credentials"),
  snippet("src/components/LoginForm.tsx", 20, "session error handling for authentication form"),
  snippet("src/lib/auth.ts", 5, "authenticate email password and create user session token"),
  snippet("src/lib/auth.ts", 15, "validate session and return current user"),
  snippet("src/components/ExportButton.tsx", 8, "export completed records to csv download"),
  snippet("src/components/ExportButton.tsx", 18, "alert not implemented csv export placeholder"),
  snippet("src/components/TodoList.tsx", 7, "todo item checkbox toggles completed state"),
  snippet("package.json", 1, "scripts include test build lint commands"),
];

describe("selectEvidenceForRequirement", () => {
  it("prefers authentication evidence for login requirements without being dominated by export fake signals", () => {
    const fakeSignals: FakeImplementationSignal[] = [
      {
        filePath: "src/components/ExportButton.tsx",
        pattern: "alert-only",
        strength: "strong",
        targetId: "REQ-export",
        targetKind: "requirement",
      },
    ];

    const selected = selectEvidenceForRequirement({
      candidateFiles: [
        "src/components/LoginForm.tsx",
        "src/lib/auth.ts",
        "src/components/ExportButton.tsx",
        "src/components/TodoList.tsx",
        "package.json",
      ],
      claim: loginClaim,
      evidenceSnippets: baseSnippets,
      fakeImplementationSignals: fakeSignals,
      requirement: loginRequirement,
    });

    expect(paths(selected).slice(0, 4)).toEqual(
      expect.arrayContaining(["src/components/LoginForm.tsx", "src/lib/auth.ts"]),
    );
    expect(countByPath(selected.slice(0, 4), "src/components/ExportButton.tsx")).toBeLessThan(2);
  });

  it("prefers export evidence for export requirements while allowing only limited unrelated context", () => {
    const fakeSignals: FakeImplementationSignal[] = [
      {
        filePath: "src/components/ExportButton.tsx",
        pattern: "alert-only",
        strength: "strong",
        targetId: "REQ-export",
        targetKind: "requirement",
      },
    ];

    const selected = selectEvidenceForRequirement({
      candidateFiles: [
        "src/components/LoginForm.tsx",
        "src/lib/auth.ts",
        "src/components/ExportButton.tsx",
        "src/components/TodoList.tsx",
        "package.json",
      ],
      claim: exportClaim,
      evidenceSnippets: baseSnippets,
      fakeImplementationSignals: fakeSignals,
      requirement: exportRequirement,
    });

    const exportCount = countByPath(selected, "src/components/ExportButton.tsx");
    const unrelatedCount =
      countByPath(selected, "src/components/LoginForm.tsx") +
      countByPath(selected, "src/lib/auth.ts") +
      countByPath(selected, "src/components/TodoList.tsx");

    expect(paths(selected).slice(0, 2)).toContain("src/components/ExportButton.tsx");
    expect(exportCount).toBeGreaterThan(unrelatedCount);
  });

  it("returns a smaller conservative subset when no test file exists", () => {
    const selected = selectEvidenceForRequirement({
      candidateFiles: [
        "src/components/LoginForm.tsx",
        "src/lib/auth.ts",
        "src/components/ExportButton.tsx",
        "src/components/TodoList.tsx",
        "package.json",
      ],
      evidenceSnippets: baseSnippets,
      requirement: testRequirement,
    });

    expect(selected.length).toBeLessThan(baseSnippets.length);
    expect(selected.length).toBeLessThanOrEqual(2);
    expect(paths(selected)).toContain("package.json");
  });

  it("keeps output order stable for identical inputs", () => {
    const input = {
      candidateFiles: ["src/components/ExportButton.tsx", "src/lib/auth.ts"],
      claim: exportClaim,
      evidenceSnippets: [...baseSnippets].reverse(),
      requirement: exportRequirement,
    };

    const first = selectEvidenceForRequirement(input).map((item) => item.id);
    const second = selectEvidenceForRequirement(input).map((item) => item.id);

    expect(second).toEqual(first);
  });

  it("enforces snippet, character, and per-file budgets", () => {
    const largeSnippets = Array.from({ length: 12 }, (_, index) =>
      snippet(
        index < 8 ? "src/feature/export.ts" : "src/feature/other.ts",
        index + 1,
        `export csv records ${index} ${"x".repeat(120)}`,
      ),
    );
    const selected = selectEvidenceForRequirement({
      budget: {
        maxEvidenceChars: 520,
        maxSnippets: 5,
        maxSnippetsPerFile: 2,
        minSnippets: 1,
      },
      candidateFiles: ["src/feature/export.ts", "src/feature/other.ts"],
      evidenceSnippets: largeSnippets,
      requirement: exportRequirement,
      staticSignals: [
        {
          filePath: "src/feature/export.ts",
          keyword: "download",
          strength: "medium",
          targetId: "REQ-export",
          targetKind: "requirement",
        } satisfies TargetedStaticSignal,
      ],
    });

    expect(selected.length).toBeLessThanOrEqual(5);
    expect(selected.reduce((sum, item) => sum + item.text.length, 0)).toBeLessThanOrEqual(520);
    expect(countByPath(selected, "src/feature/export.ts")).toBeLessThanOrEqual(2);
    expect(countByPath(selected, "src/feature/other.ts")).toBeLessThanOrEqual(2);
    expect(defaultEvidenceSelectionBudget.maxSnippets).toBe(16);
  });
});
