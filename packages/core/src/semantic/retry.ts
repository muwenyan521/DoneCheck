export interface RetryOptions {
  readonly baseDelayMs?: number;
  readonly maxAttempts?: number;
  readonly sleep?: (delayMs: number) => Promise<void>;
  readonly signal?: AbortSignal;
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
    options.signal?.throwIfAborted();
    try {
      return await operation();
    } catch (error) {
      if (options.signal?.aborted) throw error;
      lastError = error;
      if (attempt === maxAttempts) break;
      const jitter = Math.random() * baseDelayMs;
      await abortableSleep(sleep, baseDelayMs * 2 ** (attempt - 1) + jitter, options.signal);
    }
  }

  throw lastError;
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
