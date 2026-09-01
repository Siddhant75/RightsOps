import type { DemoWorkflowState } from "@/server/seed/demo-scenario";
import type { ModelContextTool } from "@/webmcp/registry";
import {
  EMPTY_OBJECT_SCHEMA,
  type CampaignToolDependencies,
} from "@/webmcp/tool-types";

const READ_ONLY = { readOnlyHint: true } as const;

async function readState(
  dependencies: CampaignToolDependencies,
  signal?: AbortSignal,
): Promise<DemoWorkflowState> {
  return dependencies.request<DemoWorkflowState>("/api/demo/state", { signal });
}

export function createPublishedTools(
  dependencies: CampaignToolDependencies,
): ModelContextTool[] {
  return [
    {
      annotations: READ_ONLY,
      description:
        "Get the server-generated receipt for the simulated campaign publication. Use after Published state. Returns the receipt or an explicit note when none exists.",
      execute: async (_input, options) => {
        const state = await readState(dependencies, options?.signal);
        return JSON.stringify({
          note: state.publishReceipt
            ? "The simulated publish receipt is available."
            : "No publish receipt exists for the current campaign state.",
          receipt: state.publishReceipt,
        });
      },
      inputSchema: EMPTY_OBJECT_SCHEMA,
      name: "get_publish_receipt",
      title: "Get publish receipt",
    },
    {
      annotations: READ_ONLY,
      description:
        "Get the campaign's server-recorded human, agent, and system audit events. Use after publication to explain the completed causal sequence. Returns the ordered audit record.",
      execute: async (_input, options) => {
        const state = await readState(dependencies, options?.signal);
        return JSON.stringify({
          events: state.auditEvents,
          note:
            state.auditEvents.length === 0
              ? "No audit events exist for this campaign."
              : `${state.auditEvents.length} audit events are recorded.`,
        });
      },
      inputSchema: EMPTY_OBJECT_SCHEMA,
      name: "get_campaign_audit",
      title: "Get campaign audit",
    },
  ];
}
