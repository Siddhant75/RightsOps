import type { PublishReceipt } from "@/domain/types";
import type { ModelContextTool } from "@/webmcp/registry";
import {
  EMPTY_OBJECT_SCHEMA,
  type CampaignToolDependencies,
} from "@/webmcp/tool-types";

export function getApprovedPublishToolName(manifestId: string): string {
  return `publish_approved_campaign_${manifestId}`;
}

export function createApprovedPublishTool(
  manifestId: string,
  dependencies: CampaignToolDependencies,
): ModelContextTool {
  return {
    description: `Publish only the already human-approved manifest ${manifestId}. Use only when this exact transient capability is present. It accepts no choices and returns the completed simulated publish receipt.`,
    execute: async (_input, options) => {
      const receipt = await dependencies.request<PublishReceipt>(
        `/api/manifests/${manifestId}/publish`,
        {
          body: {},
          method: "POST",
          signal: options?.signal,
        },
      );

      // This schedules state reconciliation in a later task. The current
      // execute promise resolves before Published state aborts this tool.
      dependencies.scheduleStateRefresh();
      return JSON.stringify({ receipt });
    },
    inputSchema: EMPTY_OBJECT_SCHEMA,
    name: getApprovedPublishToolName(manifestId),
    title: `Publish approved manifest ${manifestId}`,
  };
}
