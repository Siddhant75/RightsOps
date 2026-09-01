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

export type RegistryObservationKind =
  | "registered"
  | "toolchange"
  | "unregistered";

export interface RegistryObservation {
  kind: RegistryObservationKind;
  observedAt: string;
  toolName: string | null;
}

export type RegistryObserver = (event: RegistryObservation) => void;

export class WebMcpRegistry {
  private readonly registrations = new Map<string, AbortController>();
  private readonly toolChangeListener: EventListener;

  constructor(
    private readonly modelContext: ModelContextLike,
    private readonly observer: RegistryObserver = () => undefined,
  ) {
    this.toolChangeListener = () => {
      this.observe("toolchange", null);
    };
    this.modelContext.addEventListener("toolchange", this.toolChangeListener);
  }

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
      const observedTools = await this.reconcile();
      this.observe("registered", tool.name);
      return observedTools;
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
      this.observe("unregistered", name);
    }

    return this.reconcile();
  }

  async reconcile(): Promise<RegisteredTool[]> {
    return this.modelContext.getTools();
  }

  dispose(): void {
    this.modelContext.removeEventListener(
      "toolchange",
      this.toolChangeListener,
    );

    for (const controller of this.registrations.values()) {
      controller.abort();
    }

    this.registrations.clear();
  }

  private observe(
    kind: RegistryObservationKind,
    toolName: string | null,
  ): void {
    this.observer({
      kind,
      observedAt: new Date().toISOString(),
      toolName,
    });
  }
}
