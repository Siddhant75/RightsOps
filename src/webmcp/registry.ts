import { getObservationCapabilities } from "./feature-detect";

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
  ): void | Promise<void>;
  getTools?(): RegisteredTool[] | Promise<RegisteredTool[]>;
  addEventListener?(type: "toolchange", listener: EventListener): void;
  removeEventListener?(type: "toolchange", listener: EventListener): void;
}

export interface RegistryObservationStatus {
  reconciliation: "available" | "unavailable" | "error";
  toolchange: boolean;
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
  private readonly observation: RegistryObservationStatus;

  constructor(
    private readonly modelContext: ModelContextLike,
    private readonly observer: RegistryObserver = () => undefined,
  ) {
    this.toolChangeListener = () => {
      this.observe("toolchange", null);
    };
    const capabilities = getObservationCapabilities(modelContext);
    this.observation = {
      reconciliation: capabilities.getTools ? "available" : "unavailable",
      toolchange: false,
    };
    if (capabilities.toolchange) {
      try {
        this.modelContext.addEventListener!("toolchange", this.toolChangeListener);
        this.observation.toolchange = true;
      } catch {
        // Optional telemetry must not prevent core tool registration.
      }
    }
  }

  get observationStatus(): RegistryObservationStatus {
    return { ...this.observation };
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

    this.observe("registered", tool.name);
    return this.reconcile();
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
    if (typeof this.modelContext.getTools !== "function") {
      this.observation.reconciliation = "unavailable";
      return [];
    }

    try {
      const tools = await this.modelContext.getTools();
      this.observation.reconciliation = "available";
      return tools;
    } catch {
      // A failed observation must not revoke successfully registered tools.
      this.observation.reconciliation = "error";
      return [];
    }
  }

  dispose(): void {
    if (this.observation.toolchange) {
      try {
        this.modelContext.removeEventListener!("toolchange", this.toolChangeListener);
      } catch {
        // Cleanup of optional telemetry must not prevent capability revocation.
      }
      this.observation.toolchange = false;
    }

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
