"use client";

import { useEffect, useRef, useState } from "react";

import type { DemoWorkflowState } from "@/server/seed/demo-scenario";
import { getModelContext } from "@/webmcp/feature-detect";
import {
  WebMcpRegistry,
  type ModelContextLike,
  type ModelContextTool,
  type RegisteredTool,
} from "@/webmcp/registry";
import {
  requestJson,
  type CampaignToolDependencies,
} from "@/webmcp/tool-types";
import { createApprovedPublishTool } from "@/webmcp/tools/approved-tools";
import {
  createInspectStaleCampaignTool,
  createPrepareManifestTool,
} from "@/webmcp/tools/draft-tools";
import { createPublishedTools } from "@/webmcp/tools/published-tools";
import { createAlwaysReadTools } from "@/webmcp/tools/read-tools";

export type CampaignToolsAvailability =
  | "available"
  | "checking"
  | "error"
  | "unavailable";

export interface CampaignToolsStatus {
  availability: CampaignToolsAvailability;
  error: string | null;
  observedTools: RegisteredTool[];
}

export function createCampaignToolsForState(
  state: DemoWorkflowState,
  dependencies: CampaignToolDependencies,
): ModelContextTool[] {
  const tools = createAlwaysReadTools(dependencies);

  switch (state.campaign.status) {
    case "DRAFT":
      return [
        ...tools,
        createPrepareManifestTool(state.campaign.id, dependencies),
      ];
    case "REVIEW_READY":
      return tools;
    case "APPROVED": {
      const manifest = state.currentManifest;
      if (!manifest || manifest.status !== "APPROVED") {
        return tools;
      }
      return [
        ...tools,
        createApprovedPublishTool(manifest.id, dependencies),
      ];
    }
    case "STALE":
      return [
        ...tools,
        createInspectStaleCampaignTool(dependencies),
        createPrepareManifestTool(state.campaign.id, dependencies),
      ];
    case "PUBLISHED":
      return [...tools, ...createPublishedTools(dependencies)];
  }
}

export class CampaignToolCoordinator {
  private readonly registry: WebMcpRegistry;
  private readonly registeredNames = new Set<string>();
  private synchronization: Promise<RegisteredTool[]> = Promise.resolve([]);
  private disposed = false;

  constructor(
    modelContext: ModelContextLike,
    private readonly dependencies: CampaignToolDependencies,
  ) {
    this.registry = new WebMcpRegistry(modelContext);
  }

  synchronize(state: DemoWorkflowState): Promise<RegisteredTool[]> {
    const synchronize = () => this.synchronizeNow(state);
    this.synchronization = this.synchronization.then(synchronize, synchronize);
    return this.synchronization;
  }

  dispose(): void {
    this.disposed = true;
    this.registeredNames.clear();
    this.registry.dispose();
  }

  private async synchronizeNow(
    state: DemoWorkflowState,
  ): Promise<RegisteredTool[]> {
    if (this.disposed) return [];

    const desiredTools = createCampaignToolsForState(state, this.dependencies);
    const desiredNames = new Set(desiredTools.map((tool) => tool.name));

    for (const name of this.registeredNames) {
      if (!desiredNames.has(name)) {
        try {
          await this.registry.unregister(name);
        } finally {
          this.registeredNames.delete(name);
        }
      }
    }

    for (const tool of desiredTools) {
      if (!this.registeredNames.has(tool.name)) {
        await this.registry.register(tool);
        this.registeredNames.add(tool.name);
      }
    }

    return this.registry.reconcile();
  }
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function useCampaignTools(
  state: DemoWorkflowState | null,
  refreshState: () => Promise<void>,
): CampaignToolsStatus {
  const coordinatorRef = useRef<CampaignToolCoordinator | null>(null);
  const [status, setStatus] = useState<CampaignToolsStatus>({
    availability: "checking",
    error: null,
    observedTools: [],
  });

  useEffect(() => {
    const modelContext = getModelContext();
    if (!modelContext) {
      queueMicrotask(() => {
        setStatus({
          availability: "unavailable",
          error: null,
          observedTools: [],
        });
      });
      return;
    }

    const dependencies: CampaignToolDependencies = {
      request: requestJson,
      scheduleStateRefresh: () => {
        window.setTimeout(() => {
          void refreshState().catch((error: unknown) => {
            setStatus((current) => ({
              ...current,
              availability: "error",
              error: formatError(error),
            }));
          });
        }, 0);
      },
    };
    const coordinator = new CampaignToolCoordinator(
      modelContext,
      dependencies,
    );
    coordinatorRef.current = coordinator;

    return () => {
      coordinator.dispose();
      coordinatorRef.current = null;
    };
  }, [refreshState]);

  useEffect(() => {
    const coordinator = coordinatorRef.current;
    if (!coordinator || !state) return;
    let active = true;

    void coordinator
      .synchronize(state)
      .then((observedTools) => {
        if (!active) return;
        setStatus({
          availability: "available",
          error: null,
          observedTools,
        });
      })
      .catch((error: unknown) => {
        if (!active) return;
        setStatus({
          availability: "error",
          error: formatError(error),
          observedTools: [],
        });
      });

    return () => {
      active = false;
    };
  }, [state]);

  return status;
}
