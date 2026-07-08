import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { DecomposeResponse } from "../ipc-contract.js";
import { DecompositionReviewPanel } from "./DecompositionReviewPanel.js";

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
        onCancel={() => undefined}
        onConfirm={() => undefined}
      />,
    );

    expect(html).toContain("REQ-1");
    expect(html).toContain("User can log in.");
    expect(html).toContain("REQ-2");
    expect(html).toContain("REQ-3");
    expect(html).toContain("CLAIM-1");
    expect(html).toContain("login stores token");
    expect(html).toContain("CLAIM-2");
    expect(html).toContain("logout clears token");
    expect(html).toContain("login assumes cookie available");
    expect(html).toContain("Should logout clear cookies?");
    expect(html).toContain("REQ-3 has no matching claim");
  });

  it("renders Confirm and Cancel buttons", () => {
    const html = renderToStaticMarkup(
      <DecompositionReviewPanel
        decomposition={sampleDecomposition}
        onCancel={() => undefined}
        onConfirm={() => undefined}
      />,
    );

    expect(html).toContain("Confirm");
    expect(html).toContain("Cancel");
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
        onCancel={() => undefined}
        onConfirm={() => undefined}
      />,
    );

    expect(html).toContain("REQ-1");
    expect(html).toContain("Only requirement.");
  });
});
