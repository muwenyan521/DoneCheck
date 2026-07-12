import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { DecomposeResponse } from "../ipc-contract.js";
import {
  DecompositionReviewPanel,
  normalizeEditedDecomposition,
} from "./DecompositionReviewPanel.js";

const sampleDecomposition: DecomposeResponse = {
  assumptions: ["login assumes cookie available"],
  claims: [
    { id: "CLAIM-1", text: "login stores token" },
    { id: "CLAIM-2", text: "logout clears token" },
  ],
  clarifyingQuestions: ["Should logout clear cookies?"],
  requirements: [
    { id: "REQ-1", text: "User can log in." },
    { id: "REQ-2", text: "User can log out." },
    { id: "REQ-3", text: "Session expires after 30 minutes." },
  ],
  warnings: ["REQ-3 has no matching claim"],
};

describe("DecompositionReviewPanel", () => {
  it("renders requirements, claims, assumptions, clarifyingQuestions, and warnings", () => {
    const html = renderToStaticMarkup(
      <DecompositionReviewPanel
        decomposition={sampleDecomposition}
        locale="en"
        onCancel={() => undefined}
        onConfirm={() => undefined}
        onRestart={() => undefined}
      />,
    );

    expect(html).toContain("User can log in.");
    expect(html).toContain("login stores token");
    expect(html).toContain("logout clears token");
    expect(html).toContain("login assumes cookie available");
    expect(html).toContain("Should logout clear cookies?");
    expect(html).toContain("Some items may need more detail before analysis.");
    expect(html).not.toContain("REQ-3");
    expect(html).not.toContain("matching claim");
  });

  it("localizes stable warnings without exposing analysis-service content", () => {
    const html = renderToStaticMarkup(
      <DecompositionReviewPanel
        decomposition={sampleDecomposition}
        locale="zh-CN"
        onCancel={() => undefined}
        onConfirm={() => undefined}
        onRestart={() => undefined}
      />,
    );

    expect(html).toContain("部分内容可能需要补充说明后再分析。");
    expect(html).not.toContain("REQ-3 has no matching claim");
  });

  it("renders Confirm and Cancel buttons", () => {
    const html = renderToStaticMarkup(
      <DecompositionReviewPanel
        decomposition={sampleDecomposition}
        locale="en"
        onCancel={() => undefined}
        onConfirm={() => undefined}
        onRestart={() => undefined}
      />,
    );

    expect(html).toContain("Confirm and analyze");
    expect(html).toContain("Review updated requirement");
    expect(html).toContain("Cancel");
    expect(html).not.toContain("Run decomposition again");
    expect(html).not.toContain("run decomposition again");
  });

  it("renders an empty-state note when a section is missing without crashing", () => {
    const sparse: DecomposeResponse = {
      assumptions: [],
      claims: [],
      clarifyingQuestions: [],
      requirements: [{ id: "REQ-1", text: "Only requirement." }],
      warnings: [],
    };
    const html = renderToStaticMarkup(
      <DecompositionReviewPanel
        decomposition={sparse}
        locale="zh-CN"
        onCancel={() => undefined}
        onConfirm={() => undefined}
        onRestart={() => undefined}
      />,
    );

    expect(html).toContain("Only requirement.");
  });

  it("trims, removes empty items, and renumbers edited content", () => {
    expect(
      normalizeEditedDecomposition({
        ...sampleDecomposition,
        claims: [{ id: "old", text: "  " }],
        requirements: [
          { id: "old-1", text: "  First  " },
          { id: "old-2", text: "" },
          { id: "old-3", text: "Second" },
        ],
      }),
    ).toMatchObject({
      claims: [],
      requirements: [
        { id: "REQ-1", text: "First" },
        { id: "REQ-2", text: "Second" },
      ],
    });
  });

  it("rejects a review with no non-empty requirement", () => {
    expect(
      normalizeEditedDecomposition({
        ...sampleDecomposition,
        requirements: [{ id: "REQ-1", text: "  " }],
      }),
    ).toBeUndefined();
  });
});
