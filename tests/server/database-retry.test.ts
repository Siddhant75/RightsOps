import { describe, expect, it, vi } from "vitest";

import {
  withTransientDatabaseReadRetry,
  withTransientDatabaseRetry,
  withTransientDatabaseWriteRetry,
} from "@/server/db/database-retry";

describe("database retry policy", () => {
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

  it("allows the default retry window to outlast brief DNS outages", async () => {
    const operation = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error("dns unavailable 1"))
      .mockRejectedValueOnce(new Error("dns unavailable 2"))
      .mockRejectedValueOnce(new Error("dns unavailable 3"))
      .mockRejectedValueOnce(new Error("dns unavailable 4"))
      .mockResolvedValueOnce("connected");

    await expect(
      withTransientDatabaseRetry(operation, { baseDelayMs: 0 }),
    ).resolves.toBe("connected");
    expect(operation).toHaveBeenCalledTimes(5);
  });

  it("retries a write only when a nested connection error proves it was unsent", async () => {
    const dnsError = Object.assign(new Error("database query failed"), {
      cause: {
        sourceError: Object.assign(new Error("getaddrinfo ENOTFOUND"), {
          code: "ENOTFOUND",
        }),
      },
    });
    const operation = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(dnsError)
      .mockResolvedValueOnce("updated");

    await expect(
      withTransientDatabaseWriteRetry(operation, { baseDelayMs: 0 }),
    ).resolves.toBe("updated");
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it("does not replay a write after an ambiguous connection reset", async () => {
    const ambiguousError = Object.assign(new Error("socket reset"), {
      code: "ECONNRESET",
    });
    const operation = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(ambiguousError)
      .mockResolvedValueOnce("must not be reached");

    await expect(
      withTransientDatabaseWriteRetry(operation, { baseDelayMs: 0 }),
    ).rejects.toBe(ambiguousError);
    expect(operation).toHaveBeenCalledTimes(1);
  });
});
