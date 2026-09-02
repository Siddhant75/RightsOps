import { describe, expect, it } from "vitest";

import {
  getModelContext,
  type DocumentWithOptionalModelContext,
} from "../../src/webmcp/feature-detect";

describe("getModelContext", () => {
  it("accepts registerTool without optional enumeration or event APIs", () => {
    const context = { registerTool: async () => undefined };

    expect(getModelContext({ modelContext: context })).toBe(context);
  });

  it("returns the WebMCP context only when the required API is available", () => {
    const context = {
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      getTools: async () => [],
      registerTool: async () => undefined,
    };

    expect(
      getModelContext({ modelContext: context } as DocumentWithOptionalModelContext),
    ).toBe(context);
    expect(getModelContext({} as DocumentWithOptionalModelContext)).toBeNull();
    expect(
      getModelContext({
        modelContext: { getTools: async () => [] },
      } as unknown as DocumentWithOptionalModelContext),
    ).toBeNull();
  });
});
