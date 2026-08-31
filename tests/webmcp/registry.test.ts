import { describe, expect, it } from "vitest";

import {
  WebMcpRegistry,
  type ModelContextLike,
  type ModelContextTool,
  type RegisteredTool,
} from "../../src/webmcp/registry";

class FakeModelContext extends EventTarget implements ModelContextLike {
  readonly signals: AbortSignal[] = [];
  private readonly tools = new Map<string, RegisteredTool>();

  async registerTool(
    tool: ModelContextTool,
    options: { signal?: AbortSignal } = {},
  ): Promise<void> {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool already registered: ${tool.name}`);
    }

    const registered = {
      annotations: tool.annotations,
      description: tool.description,
      inputSchema: JSON.stringify(tool.inputSchema ?? {}),
      name: tool.name,
      origin: "https://spike.example",
      title: tool.title ?? "",
    };
    this.tools.set(tool.name, registered);

    if (options.signal) {
      this.signals.push(options.signal);
      options.signal.addEventListener(
        "abort",
        () => this.tools.delete(tool.name),
        { once: true },
      );
    }
  }

  async getTools(): Promise<RegisteredTool[]> {
    return [...this.tools.values()].sort((left, right) =>
      left.name.localeCompare(right.name),
    );
  }
}

const readTool: ModelContextTool = {
  annotations: { readOnlyHint: true },
  description: "Return the current deployment-spike state.",
  execute: async () => JSON.stringify({ approved: false }),
  inputSchema: { additionalProperties: false, properties: {}, type: "object" },
  name: "get_spike_state",
};

describe("WebMcpRegistry", () => {
  it("registers through an AbortSignal and reconciles from getTools", async () => {
    const context = new FakeModelContext();
    const registry = new WebMcpRegistry(context);

    const tools = await registry.register(readTool);

    expect(context.signals).toHaveLength(1);
    expect(context.signals[0]?.aborted).toBe(false);
    expect(tools.map((tool) => tool.name)).toEqual(["get_spike_state"]);
  });

  it("revokes a registered tool and returns the observed surface", async () => {
    const context = new FakeModelContext();
    const registry = new WebMcpRegistry(context);
    await registry.register(readTool);

    const tools = await registry.unregister(readTool.name);

    expect(context.signals[0]?.aborted).toBe(true);
    expect(tools).toEqual([]);
  });

  it("can discover a newly approved tool after it was revoked", async () => {
    const context = new FakeModelContext();
    const registry = new WebMcpRegistry(context);
    const approvedTool: ModelContextTool = {
      description: "Execute the currently approved deployment spike.",
      execute: async () => JSON.stringify({ executed: true }),
      inputSchema: {
        additionalProperties: false,
        properties: {},
        type: "object",
      },
      name: "execute_approved_spike",
    };

    await registry.register(approvedTool);
    await registry.unregister(approvedTool.name);
    const tools = await registry.register(approvedTool);

    expect(context.signals).toHaveLength(2);
    expect(context.signals[0]?.aborted).toBe(true);
    expect(context.signals[1]?.aborted).toBe(false);
    expect(tools.map((tool) => tool.name)).toEqual([
      "execute_approved_spike",
    ]);
  });

  it("aborts every owned registration during disposal", async () => {
    const context = new FakeModelContext();
    const registry = new WebMcpRegistry(context);
    await registry.register(readTool);
    await registry.register({ ...readTool, name: "another_read_tool" });

    registry.dispose();

    expect(context.signals.every((signal) => signal.aborted)).toBe(true);
    await expect(context.getTools()).resolves.toEqual([]);
  });

  it("aborts a registration that is still pending during disposal", async () => {
    let finishRegistration: (() => void) | undefined;
    let registrationSignal: AbortSignal | undefined;
    const context: ModelContextLike = {
      addEventListener: () => undefined,
      getTools: async () => [],
      registerTool: async (_tool, options) => {
        registrationSignal = options?.signal;
        await new Promise<void>((resolve) => {
          finishRegistration = resolve;
        });
      },
      removeEventListener: () => undefined,
    };
    const registry = new WebMcpRegistry(context);

    const registration = registry.register(readTool);
    registry.dispose();
    finishRegistration?.();
    await registration;

    expect(registrationSignal?.aborted).toBe(true);
  });

  it("fails closed when post-registration reconciliation fails", async () => {
    let registrationSignal: AbortSignal | undefined;
    const context: ModelContextLike = {
      addEventListener: () => undefined,
      getTools: async () => {
        throw new Error("observation unavailable");
      },
      registerTool: async (_tool, options) => {
        registrationSignal = options?.signal;
      },
      removeEventListener: () => undefined,
    };
    const registry = new WebMcpRegistry(context);

    await expect(registry.register(readTool)).rejects.toThrow(
      "observation unavailable",
    );

    expect(registrationSignal?.aborted).toBe(true);
    expect(registry.has(readTool.name)).toBe(false);
  });

  it("can revoke a registration while registerTool is still pending", async () => {
    let finishRegistration: (() => void) | undefined;
    let registrationSignal: AbortSignal | undefined;
    const observedTools = new Map<string, RegisteredTool>();
    const context: ModelContextLike = {
      addEventListener: () => undefined,
      getTools: async () => [...observedTools.values()],
      registerTool: async (tool, options) => {
        registrationSignal = options?.signal;
        await new Promise<void>((resolve) => {
          finishRegistration = resolve;
        });
        observedTools.set(tool.name, {
          description: tool.description,
          name: tool.name,
        });
        if (options?.signal?.aborted) {
          observedTools.delete(tool.name);
        } else {
          options?.signal?.addEventListener(
            "abort",
            () => observedTools.delete(tool.name),
            { once: true },
          );
        }
      },
      removeEventListener: () => undefined,
    };
    const registry = new WebMcpRegistry(context);

    const registration = registry.register(readTool);
    await registry.unregister(readTool.name);
    finishRegistration?.();
    await registration;

    expect(registrationSignal?.aborted).toBe(true);
    expect(registry.has(readTool.name)).toBe(false);
    await expect(context.getTools()).resolves.toEqual([]);
  });

  it("keeps a tool revoked when reconciliation after unregister fails", async () => {
    let failObservation = false;
    let registrationSignal: AbortSignal | undefined;
    const context: ModelContextLike = {
      addEventListener: () => undefined,
      getTools: async () => {
        if (failObservation) throw new Error("observation unavailable");
        return [];
      },
      registerTool: async (_tool, options) => {
        registrationSignal = options?.signal;
      },
      removeEventListener: () => undefined,
    };
    const registry = new WebMcpRegistry(context);
    await registry.register(readTool);
    failObservation = true;

    await expect(registry.unregister(readTool.name)).rejects.toThrow(
      "observation unavailable",
    );

    expect(registrationSignal?.aborted).toBe(true);
    expect(registry.has(readTool.name)).toBe(false);
  });
});
