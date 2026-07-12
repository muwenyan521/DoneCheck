import { describe, expect, it } from "vitest";
import { classifyProviderErrorKind } from "./provider-error-kind.js";
import { providerErrorUxForKind } from "./provider-error-ux.js";

describe("provider error UX", () => {
  it.each([
    ["Premature close", "connection-closed"],
    ["502 Upstream request failed", "service-unavailable"],
    ["504 Gateway Time-out", "service-timeout"],
    ["401 Incorrect API key", "auth"],
    ["429 rate limit exceeded", "rate-limit"],
    ["response_format unavailable for this model", "response-format"],
    ["Unexpected token < in JSON at position 0", "invalid-json"],
    ["OPENAI_STRUCTURED_OUTPUT_STRICT must be one of true, false", "strict-output"],
    ["Online analysis requires an access key.", "missing-key"],
  ])("classifies %s", (message, kind) => {
    expect(classifyProviderErrorKind(new Error(message))).toBe(kind);
  });

  it("builds UX copy from a safe IPC provider error category", () => {
    expect(providerErrorUxForKind("service-unavailable").kind).toBe("service-unavailable");
  });

  it("returns provider-agnostic copy without exposing technical details", () => {
    const classified = providerErrorUxForKind("auth");

    expect(classified.title).toBe("Access key could not be used");
    expect(classified.summary).toBe("Online analysis needs a valid access key.");
    expect(classified.suggestions).toEqual(
      expect.arrayContaining([
        "Review the online analysis settings.",
        "Use offline analysis instead.",
      ]),
    );
    expect(classified).not.toHaveProperty("technicalDetail");
  });

  it("uses a generic fallback for unknown errors", () => {
    const classified = providerErrorUxForKind("unknown");

    expect(classified.kind).toBe("unknown");
    expect(classified.title).toBe("Online analysis did not finish");
    expect(classified).not.toHaveProperty("technicalDetail");
  });

  it.each([
    "response_format unavailable for this model",
    "OPENAI_STRUCTURED_OUTPUT_STRICT must be one of true, false",
    "Unexpected token < in JSON at position 0",
  ])("keeps implementation terminology out of recovery guidance for %s", (message) => {
    const classified = providerErrorUxForKind(classifyProviderErrorKind(new Error(message)));
    const publicCopy = [classified.title, classified.summary, ...classified.suggestions].join(" ");

    expect(publicCopy).not.toMatch(/schema|json|strict|structured|validated|response_format/iu);
  });

  it("never includes credentials, addresses, or infrastructure details in the UX model", () => {
    const input =
      "502 Cloudflare origin web server Authorization: Bearer test-secret-value https://service.test/v1?token=query-secret";
    const publicCopy = JSON.stringify(
      providerErrorUxForKind(classifyProviderErrorKind(new Error(input))),
    );

    expect(publicCopy).not.toMatch(
      /502|cloudflare|origin web server|test-secret-value|query-secret|https?:\/\//iu,
    );
  });
});
