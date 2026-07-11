import { describe, expect, it } from "vitest";
import {
  buildExtraScopeCandidates,
  matchClaimsToRequirements,
  targetSignals,
} from "./item-matching.js";

describe("pipeline item matching", () => {
  it("matches claims to requirements with text similarity instead of numbering only", () => {
    const requirements = [
      { id: "REQ-1", text: "Implement email password login." },
      { id: "REQ-2", text: "Implement todo item creation and local persistence." },
      { id: "REQ-3", text: "Implement CSV export for todo items." },
      { id: "REQ-4", text: "Provide automated test evidence for login and todo behavior." },
    ];
    const claims = [
      { id: "CLAIM-9", text: "Login is implemented with email and password." },
      { id: "CLAIM-8", text: "Todo item creation is implemented." },
      { id: "CLAIM-7", text: "CSV export is implemented." },
      { id: "CLAIM-6", text: "Automated tests cover login and todo behavior." },
    ];

    expect(
      matchClaimsToRequirements(requirements, claims).map((match) => [
        match.requirement.id,
        match.claim.id,
      ]),
    ).toEqual([
      ["REQ-1", "CLAIM-9"],
      ["REQ-2", "CLAIM-8"],
      ["REQ-3", "CLAIM-7"],
      ["REQ-4", "CLAIM-6"],
    ]);
  });

  it("targets export fake signals without contaminating login", () => {
    const requirements = [
      { id: "REQ-1", text: "Implement email password login." },
      { id: "REQ-3", text: "Implement CSV export for todo items." },
    ];
    const claims = [
      { id: "CLAIM-1", text: "Login is implemented." },
      { id: "CLAIM-3", text: "CSV export is implemented." },
    ];
    const matches = matchClaimsToRequirements(requirements, claims);
    const targeted = targetSignals({
      claims,
      matches,
      requirements,
      staticSignals: [],
      fakeImplementationSignals: [
        {
          filePath: "src/components/ExportButton.tsx",
          lineEnd: 12,
          lineStart: 12,
          pattern: "alert-only",
          strength: "strong",
        },
      ],
    });

    expect(targeted.fakeImplementationSignals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ targetKind: "requirement", targetId: "REQ-3" }),
        expect.objectContaining({ targetKind: "claim", targetId: "CLAIM-3" }),
      ]),
    );
    expect(targeted.fakeImplementationSignals).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ targetId: "REQ-1" })]),
    );
  });

  it("does not drop signals when file path has no token overlap with requirement text (cross-language)", () => {
    const requirements = [
      { id: "REQ-1", text: "支持新增任务" },
      { id: "REQ-2", text: "支持删除任务" },
      { id: "REQ-3", text: "支持标记完成" },
    ];
    const claims = [
      { id: "CLAIM-1", text: "已实现新增任务功能" },
      { id: "CLAIM-2", text: "已实现删除任务功能" },
    ];
    const matches = matchClaimsToRequirements(requirements, claims);
    const targeted = targetSignals({
      candidateFiles: ["src/TodoApp.tsx"],
      claims,
      matches,
      requirements,
      staticSignals: [
        {
          filePath: "src/TodoApp.tsx",
          keyword: "localStorage",
          strength: "strong" as const,
        },
      ],
      fakeImplementationSignals: [
        {
          filePath: "src/TodoApp.tsx",
          lineEnd: 15,
          lineStart: 15,
          pattern: "alert-only",
          strength: "strong" as const,
        },
      ],
    });

    expect(targeted.staticSignals.length).toBeGreaterThan(0);
    expect(targeted.fakeImplementationSignals.length).toBeGreaterThan(0);
  });

  it("builds extra-scope candidates from unmatched additive claims", () => {
    const requirements = [
      { id: "REQ-1", text: "Implement todo tracking without billing controls." },
    ];
    const claims = [
      { id: "CLAIM-1", text: "Todo tracking is implemented." },
      { id: "CLAIM-2", text: "I also added subscription billing controls." },
    ];
    const matches = matchClaimsToRequirements(requirements, claims);

    expect(buildExtraScopeCandidates({ requirements, claims, matches })).toEqual([
      expect.objectContaining({
        sourceId: "CLAIM-2",
        summary: "I also added subscription billing controls.",
      }),
    ]);
  });
});
