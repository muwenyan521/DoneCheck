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
  fragments: ["uDbYwwp//", "eEkndwWeL", "HvbJDABjH", "6tjCKxRx3"],
  seed: 31,
} as const satisfies EncodedValue;

const encodedModel = {
  fragments: ["gdM2YqNR", "B5yMM2qj", "DkSOxz0="],
  seed: 89,
} as const satisfies EncodedValue;

const encodedApiKey = {
  fragments: ["f2OKTRuHr2k+", "iEQZ0/ljMYpH", "T9CrNDnwQByD", "/2Zr+UACje4="],
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
