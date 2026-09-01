interface DatabaseRetryOptions {
  attempts?: number;
  baseDelayMs?: number;
  shouldRetry?: (error: unknown) => boolean;
}

const DEFINITELY_UNSENT_CONNECTION_CODES = new Set([
  "EAI_AGAIN",
  "ENOTFOUND",
  "UND_ERR_CONNECT_TIMEOUT",
]);

function isDefinitelyUnsentConnectionError(error: unknown): boolean {
  const pending = [error];
  const seen = new Set<unknown>();

  while (pending.length > 0) {
    const current = pending.shift();
    if (!current || typeof current !== "object" || seen.has(current)) continue;
    seen.add(current);

    const record = current as Record<string, unknown>;
    if (
      typeof record.code === "string" &&
      DEFINITELY_UNSENT_CONNECTION_CODES.has(record.code)
    ) {
      return true;
    }
    pending.push(record.cause, record.sourceError);
  }

  return false;
}

export async function withTransientDatabaseRetry<T>(
  operation: () => Promise<T>,
  options: DatabaseRetryOptions = {},
): Promise<T> {
  const attempts = options.attempts ?? 5;
  const baseDelayMs = options.baseDelayMs ?? 250;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (
        attempt === attempts ||
        (options.shouldRetry && !options.shouldRetry(error))
      ) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, baseDelayMs * attempt));
    }
  }

  throw new Error("Database retry exhausted unexpectedly");
}

export function withTransientDatabaseReadRetry<T>(
  read: () => Promise<T>,
  options: DatabaseRetryOptions = {},
): Promise<T> {
  return withTransientDatabaseRetry(read, options);
}

export function withTransientDatabaseWriteRetry<T>(
  write: () => Promise<T>,
  options: Omit<DatabaseRetryOptions, "shouldRetry"> = {},
): Promise<T> {
  return withTransientDatabaseRetry(write, {
    ...options,
    shouldRetry: isDefinitelyUnsentConnectionError,
  });
}
