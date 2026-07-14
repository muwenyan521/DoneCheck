import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { isRetryableProviderError, withRetry } from "./retry.js";

describe("provider retry policy", () => {
  it.each([
    "Request timed out.",
    "504 Gateway Timeout",
    "Analysis canceled",
    "401 invalid API key",
    "response_format is unsupported",
    "OpenAI returned no JSON content for schema RequirementDecompositionOutput",
    "Unexpected token < in JSON at position 0",
  ])("does not retry %s", async (message) => {
    const operation = vi.fn(async () => {
      throw new Error(message);
    });

    await expect(withRetry(operation)).rejects.toThrow(message);

    expect(operation).toHaveBeenCalledOnce();
    expect(isRetryableProviderError(new Error(message))).toBe(false);
  });

  it("retries a transient service failure", async () => {
    const operation = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error("502 Upstream request failed"))
      .mockResolvedValueOnce("ok");

    await expect(withRetry(operation, { baseDelayMs: 0 })).resolves.toBe("ok");

    expect(operation).toHaveBeenCalledTimes(2);
  });

  it("does not retry provider output schema validation failures", async () => {
    const parsed = z.object({ required: z.string() }).safeParse({});
    if (parsed.success) throw new Error("Expected invalid fixture");
    const validationError = parsed.error;
    const operation = vi.fn(async () => {
      throw validationError;
    });

    await expect(withRetry(operation)).rejects.toBe(validationError);

    expect(operation).toHaveBeenCalledOnce();
    expect(isRetryableProviderError(validationError)).toBe(false);
  });

  it("retries an unclassified provider failure to preserve transient-provider recovery", async () => {
    const operation = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error("temporary provider failure"))
      .mockResolvedValueOnce("ok");

    await expect(withRetry(operation, { baseDelayMs: 0 })).resolves.toBe("ok");

    expect(operation).toHaveBeenCalledTimes(2);
    expect(isRetryableProviderError(new Error("temporary provider failure"))).toBe(true);
  });
});
