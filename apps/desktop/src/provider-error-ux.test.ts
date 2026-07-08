import { describe, expect, it } from "vitest";
import { classifyProviderError } from "./provider-error-ux.js";

describe("provider error UX", () => {
  it.each([
    ["Premature close", "connection-closed"],
    ["502 Upstream request failed", "upstream-502"],
    ["504 Gateway Time-out", "gateway-timeout"],
    ["401 Incorrect API key", "auth"],
    ["429 rate limit exceeded", "rate-limit"],
    ["response_format unavailable for this model", "response-format"],
    ["Unexpected token < in JSON at position 0", "invalid-json"],
    ["OPENAI_STRUCTURED_OUTPUT_STRICT must be one of true, false", "strict-output"],
  ])("classifies %s", (message, kind) => {
    expect(classifyProviderError(new Error(message)).kind).toBe(kind);
  });

  it("returns provider-agnostic copy with suggestions and technical details", () => {
    const classified = classifyProviderError(new Error("401 Incorrect API key"));

    expect(classified.title).toBe("API key was rejected");
    expect(classified.summary).toContain("OpenAI-compatible provider");
    expect(classified.suggestions).toEqual(
      expect.arrayContaining([
        "Check Settings > Provider and enter a valid session API key.",
        "Use Deterministic mock mode when you only need to validate DoneCheck structure.",
      ]),
    );
    expect(classified.technicalDetail).toBe("401 Incorrect API key");
  });

  it("uses a generic fallback for unknown errors", () => {
    const classified = classifyProviderError("something unexpected");

    expect(classified.kind).toBe("unknown");
    expect(classified.title).toBe("Provider request failed");
    expect(classified.technicalDetail).toBe("something unexpected");
  });
});
