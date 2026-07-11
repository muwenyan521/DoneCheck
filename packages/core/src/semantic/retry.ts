export interface RetryOptions {
  readonly baseDelayMs?: number;
  readonly maxAttempts?: number;
  readonly sleep?: (delayMs: number) => Promise<void>;
}

export async function withRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 25;
  const sleep = options.sleep ?? defaultSleep;

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt === maxAttempts) break;
      const jitter = Math.random() * baseDelayMs;
      await sleep(baseDelayMs * 2 ** (attempt - 1) + jitter);
    }
  }

  throw lastError;
}

function defaultSleep(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}
