import type { ProviderErrorKind } from "./provider-error-kind.js";

export type { ProviderErrorKind } from "./provider-error-kind.js";

export interface ProviderErrorUx {
  readonly kind: ProviderErrorKind;
  readonly title: string;
  readonly summary: string;
  readonly suggestions: readonly string[];
}

export function providerErrorUxForKind(kind: ProviderErrorKind): ProviderErrorUx {
  switch (kind) {
    case "auth":
    case "missing-key":
      return accessKeyError(kind);
    case "service-unavailable":
    case "service-timeout":
    case "rate-limit":
      return unavailableError(kind);
    case "connection-closed":
    case "response-format":
    case "invalid-json":
    case "strict-output":
    case "unknown":
      return genericError(kind);
  }
}

const genericSuggestions = [
  "Review the online analysis settings.",
  "Try again shortly.",
  "Use offline analysis instead.",
] as const;

function genericError(kind: ProviderErrorKind): ProviderErrorUx {
  return buildError(
    kind,
    "Online analysis did not finish",
    "This online analysis could not be completed.",
  );
}

function accessKeyError(kind: ProviderErrorKind): ProviderErrorUx {
  return buildError(
    kind,
    "Access key could not be used",
    "Online analysis needs a valid access key.",
  );
}

function unavailableError(kind: ProviderErrorKind): ProviderErrorUx {
  return buildError(
    kind,
    "Online analysis is temporarily unavailable",
    "Online analysis cannot be completed right now.",
  );
}

function buildError(kind: ProviderErrorKind, title: string, summary: string): ProviderErrorUx {
  return {
    kind,
    suggestions: genericSuggestions,
    summary,
    title,
  };
}
