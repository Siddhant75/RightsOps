import { describe, expect, it, vi } from "vitest";

import { withTransientDatabaseReadRetry } from "@/server/db/database-retry";

describe("withTransientDatabaseReadRetry", () => {
  it("retries a failed idempotent read and returns the next successful result", async () => {
    const read = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error("transient Neon query failure"))
      .mockResolvedValueOnce("current state");

    await expect(
      withTransientDatabaseReadRetry(read, { baseDelayMs: 0 }),
    ).resolves.toBe("current state");
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("stops after the bounded attempt count", async () => {
    const read = vi
      .fn<() => Promise<string>>()
      .mockRejectedValue(new Error("database unavailable"));

    await expect(
      withTransientDatabaseReadRetry(read, {
        attempts: 3,
        baseDelayMs: 0,
      }),
    ).rejects.toThrow("database unavailable");
    expect(read).toHaveBeenCalledTimes(3);
  });
});
