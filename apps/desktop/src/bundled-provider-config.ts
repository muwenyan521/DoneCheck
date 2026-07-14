export interface BundledProviderConfig {
  readonly apiKey: string;
  readonly baseURL: string;
  readonly model: string;
}

interface EncodedValue {
  readonly fragments: readonly string[];
  readonly seed: number;
}

const encodedBaseUrl = {
  fragments: ["nBI0ouY02cs", "Vc7vzKovYEj", "Pm4iPUwxIx", "+rYwisUcdw=="],
  seed: 31,
} as const satisfies EncodedValue;

const encodedModel = {
  fragments: ["pA5Bj9", "V1OehI", "GZ/SPg=="],
  seed: 89,
} as const satisfies EncodedValue;

const encodedApiKey = {
  fragments: ["kdQiNY0EGYKkDUfpO2", "2G6zhh60Bug+keP4", "o3XrbdYU/aN3iM7j", "htoTRj0c8mZLQzAo3u"],
  seed: 157,
} as const satisfies EncodedValue;

export function decodeBundledProviderConfig(): BundledProviderConfig {
  return {
    apiKey: decodeValue(encodedApiKey),
    baseURL: decodeValue(encodedBaseUrl),
    model: decodeValue(encodedModel),
  };
}

function decodeValue(value: EncodedValue): string {
  const bytes = Buffer.from(value.fragments.join(""), "base64");
  bytes.reverse();
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = (bytes[index] ?? 0) ^ ((index * 73 + value.seed) & 0xff);
  }
  const decoded = bytes.toString("utf8");
  bytes.fill(0);
  return decoded;
}
