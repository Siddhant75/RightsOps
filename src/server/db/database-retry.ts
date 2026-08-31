interface DatabaseReadRetryOptions {
  attempts?: number;
  baseDelayMs?: number;
}

export async function withTransientDatabaseReadRetry<T>(
  read: () => Promise<T>,
  options: DatabaseReadRetryOptions = {},
): Promise<T> {
  const attempts = options.attempts ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 75;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await read();
    } catch (error) {
      if (attempt === attempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, baseDelayMs * attempt));
    }
  }

  throw new Error("Database read retry exhausted unexpectedly");
}
