export const providerErrorKinds = [
  "connection-closed",
  "service-unavailable",
  "service-timeout",
  "auth",
  "rate-limit",
  "response-format",
  "invalid-json",
  "strict-output",
  "missing-key",
  "unknown",
] as const;

export type ProviderErrorKind = (typeof providerErrorKinds)[number];

export function classifyProviderErrorKind(error: unknown): ProviderErrorKind {
  const detail = errorDetail(error).toLocaleLowerCase();
  if (detail.includes("premature close")) return "connection-closed";
  if (detail.includes("502") || detail.includes("upstream request failed")) {
    return "service-unavailable";
  }
  if (
    detail.includes("504") ||
    detail.includes("gateway time-out") ||
    detail.includes("gateway timeout")
  ) {
    return "service-timeout";
  }
  if (detail.includes("401") || detail.includes("incorrect api key")) return "auth";
  if (detail.includes("429") || detail.includes("rate limit")) return "rate-limit";
  if (detail.includes("response_format")) return "response-format";
  if (detail.includes("structured_output_strict") || detail.includes("strict")) {
    return "strict-output";
  }
  if (
    detail.includes("not valid json") ||
    detail.includes("unexpected token") ||
    detail.includes("json")
  ) {
    return "invalid-json";
  }
  if (
    detail.includes("requires an api key") ||
    detail.includes("requires an access key") ||
    detail.includes("openai_api_key is not set")
  ) {
    return "missing-key";
  }
  return "unknown";
}

function errorDetail(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }
  return "";
}
