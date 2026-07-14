import { ZodError } from "zod";

export interface RetryOptions {
  readonly baseDelayMs?: number;
  readonly maxAttempts?: number;
  readonly sleep?: (delayMs: number) => Promise<void>;
  readonly signal?: AbortSignal;
  readonly shouldRetry?: (error: unknown) => boolean;
}

export async function withRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 25;
  const sleep = options.sleep ?? defaultSleep;
  const shouldRetry = options.shouldRetry ?? isRetryableProviderError;

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    options.signal?.throwIfAborted();
    try {
      return await operation();
    } catch (error) {
      if (options.signal?.aborted) throw error;
      lastError = error;
      if (attempt === maxAttempts || !shouldRetry(error)) break;
      const jitter = Math.random() * baseDelayMs;
      await abortableSleep(sleep, baseDelayMs * 2 ** (attempt - 1) + jitter, options.signal);
    }
  }

  throw lastError;
}

export function isRetryableProviderError(error: unknown): boolean {
  if (error instanceof ZodError) return false;
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLocaleLowerCase();
  if (
    /\b(?:abort(?:ed)?|cancel(?:ed|led)?|timed?\s*out|timeout|deadline exceeded|504)\b/u.test(
      normalized,
    )
  ) {
    return false;
  }
  if (
    /\b(?:400|401|403|404|422)\b/u.test(normalized) ||
    normalized.includes("invalid api key") ||
    normalized.includes("response_format") ||
    normalized.includes("not valid json") ||
    normalized.includes("unexpected token")
  ) {
    return false;
  }
  return true;
}

async function abortableSleep(
  sleep: (delayMs: number) => Promise<void>,
  delayMs: number,
  signal?: AbortSignal,
): Promise<void> {
  if (signal === undefined) return sleep(delayMs);
  signal.throwIfAborted();
  await Promise.race([
    sleep(delayMs),
    new Promise<never>((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    }),
  ]);
}

function defaultSleep(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}
