export interface ToolAnnotations {
  readOnlyHint?: boolean;
  untrustedContentHint?: boolean;
}

export interface ToolExecuteCallbackOptions {
  signal: AbortSignal;
}

export interface ModelContextTool {
  name: string;
  title?: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute: (
    input: Record<string, unknown>,
    options?: ToolExecuteCallbackOptions,
  ) => string | Promise<string>;
  annotations?: ToolAnnotations;
}

export interface RegisteredTool {
  name: string;
  title?: string;
  description: string;
  inputSchema?: unknown;
  annotations?: ToolAnnotations;
  origin?: string;
}

export interface ModelContextLike {
  registerTool(
    tool: ModelContextTool,
    options?: { signal?: AbortSignal },
  ): Promise<void>;
  getTools(): Promise<RegisteredTool[]>;
  addEventListener(type: "toolchange", listener: EventListener): void;
  removeEventListener(type: "toolchange", listener: EventListener): void;
}

export class WebMcpRegistry {
  private readonly registrations = new Map<string, AbortController>();

  constructor(private readonly modelContext: ModelContextLike) {}

  has(name: string): boolean {
    return this.registrations.has(name);
  }

  async register(tool: ModelContextTool): Promise<RegisteredTool[]> {
    if (this.registrations.has(tool.name)) {
      throw new Error(`Tool is already registered: ${tool.name}`);
    }

    const controller = new AbortController();
    this.registrations.set(tool.name, controller);

    try {
      await this.modelContext.registerTool(tool, { signal: controller.signal });
    } catch (error) {
      if (this.registrations.get(tool.name) === controller) {
        this.registrations.delete(tool.name);
      }
      controller.abort();
      throw error;
    }

    try {
      return await this.reconcile();
    } catch (error) {
      if (this.registrations.get(tool.name) === controller) {
        this.registrations.delete(tool.name);
      }
      controller.abort();
      throw error;
    }
  }

  async unregister(name: string): Promise<RegisteredTool[]> {
    const controller = this.registrations.get(name);

    if (controller) {
      controller.abort();
      this.registrations.delete(name);
    }

    return this.reconcile();
  }

  async reconcile(): Promise<RegisteredTool[]> {
    return this.modelContext.getTools();
  }

  dispose(): void {
    for (const controller of this.registrations.values()) {
      controller.abort();
    }

    this.registrations.clear();
  }
}
