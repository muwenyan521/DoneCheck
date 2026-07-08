export type ProviderErrorKind =
  | "connection-closed"
  | "upstream-502"
  | "gateway-timeout"
  | "auth"
  | "rate-limit"
  | "response-format"
  | "invalid-json"
  | "strict-output"
  | "missing-key"
  | "unknown";

export interface ProviderErrorUx {
  readonly kind: ProviderErrorKind;
  readonly title: string;
  readonly summary: string;
  readonly suggestions: readonly string[];
  readonly technicalDetail: string;
}

export function classifyProviderError(error: unknown): ProviderErrorUx {
  const technicalDetail = error instanceof Error ? error.message : String(error);
  const lower = technicalDetail.toLocaleLowerCase();
  if (lower.includes("premature close")) {
    return buildError("connection-closed", "Provider connection closed early", technicalDetail, [
      "Retry later; the upstream connection may have dropped.",
      "Check Settings > Provider for Base URL and Model.",
      "Use Deterministic mock mode when you only need to validate DoneCheck structure.",
    ]);
  }
  if (lower.includes("502") || lower.includes("upstream request failed")) {
    return buildError("upstream-502", "Provider upstream returned 502", technicalDetail, [
      "Retry later; the compatible endpoint may be temporarily unavailable.",
      "Check Settings > Provider for Base URL and Model.",
      "Try disabling Structured output strict for the next Analyze.",
    ]);
  }
  if (
    lower.includes("504") ||
    lower.includes("gateway time-out") ||
    lower.includes("gateway timeout")
  ) {
    return buildError("gateway-timeout", "Provider request timed out", technicalDetail, [
      "Retry later; the compatible endpoint may be overloaded.",
      "Check Settings > Provider for Base URL and Model.",
      "Use Deterministic mock mode for local structure validation.",
    ]);
  }
  if (lower.includes("401") || lower.includes("incorrect api key")) {
    return buildError("auth", "API key was rejected", technicalDetail, [
      "Check Settings > Provider and enter a valid session API key.",
      "Verify OPENAI_API_KEY if you rely on the environment key.",
      "Use Deterministic mock mode when you only need to validate DoneCheck structure.",
    ]);
  }
  if (lower.includes("429") || lower.includes("rate limit")) {
    return buildError("rate-limit", "Provider rate limit reached", technicalDetail, [
      "Retry later after the provider rate limit resets.",
      "Check whether another process is using the same API key.",
      "Use Deterministic mock mode for local structure validation.",
    ]);
  }
  if (lower.includes("response_format")) {
    return buildError(
      "response-format",
      "Structured response format is unavailable",
      technicalDetail,
      [
        "Disable Structured output strict in Settings > Provider for the next Analyze.",
        "Check whether the selected Model supports structured output.",
        "Use Deterministic mock mode to validate DoneCheck structure.",
      ],
    );
  }
  if (lower.includes("structured_output_strict") || lower.includes("strict")) {
    return buildError("strict-output", "Structured output strict mode failed", technicalDetail, [
      "Disable Structured output strict in Settings > Provider for the next Analyze.",
      "Check whether the selected compatible endpoint supports strict JSON schema handling.",
      "Use Deterministic mock mode to validate DoneCheck structure.",
    ]);
  }
  if (
    lower.includes("not valid json") ||
    lower.includes("unexpected token") ||
    lower.includes("json")
  ) {
    return buildError("invalid-json", "Provider returned invalid JSON", technicalDetail, [
      "Retry later; the provider may have returned a transient invalid body.",
      "Check Settings > Provider for Model compatibility.",
      "Try disabling Structured output strict for the next Analyze.",
    ]);
  }
  if (lower.includes("requires an api key") || lower.includes("openai_api_key is not set")) {
    return buildError("missing-key", "OpenAI-compatible mode needs an API key", technicalDetail, [
      "Enter a session API key in Settings > Provider.",
      "Set OPENAI_API_KEY before launching the app.",
      "Switch Provider mode to Deterministic mock.",
    ]);
  }
  return buildError("unknown", "Provider request failed", technicalDetail, [
    "Check Settings > Provider for Base URL, Model, API key, and Structured output strict.",
    "Retry later if the compatible endpoint is temporarily unavailable.",
    "Use Deterministic mock mode to validate DoneCheck structure.",
  ]);
}

function buildError(
  kind: ProviderErrorKind,
  title: string,
  technicalDetail: string,
  suggestions: readonly string[],
): ProviderErrorUx {
  return {
    kind,
    suggestions,
    summary: "The OpenAI-compatible provider request did not complete successfully.",
    technicalDetail,
    title,
  };
}
