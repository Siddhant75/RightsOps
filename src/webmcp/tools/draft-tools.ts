import type { DemoWorkflowState } from "@/server/seed/demo-scenario";
import type { ModelContextTool } from "@/webmcp/registry";
import {
  EMPTY_OBJECT_SCHEMA,
  type CampaignToolDependencies,
} from "@/webmcp/tool-types";

export function createPrepareManifestTool(
  campaignId: string,
  dependencies: CampaignToolDependencies,
): ModelContextTool {
  return {
    description:
      "Prepare an exact review manifest from three selected eligible asset IDs. Use in Draft or Stale state after finding eligible assets. Returns the server-created manifest and rights proofs; it does not approve or publish.",
    execute: async (input, options) => {
      if (
        !Array.isArray(input.assetIds) ||
        input.assetIds.some(
          (assetId) => typeof assetId !== "string" || assetId.length === 0,
        )
      ) {
        throw new Error(
          "prepare_campaign_manifest requires assetIds as an array of asset IDs.",
        );
      }

      const manifest = await dependencies.request(
        `/api/campaigns/${campaignId}/manifest`,
        {
          body: { assetIds: input.assetIds },
          method: "POST",
          signal: options?.signal,
        },
      );
      dependencies.scheduleStateRefresh();
      return JSON.stringify({ manifest });
    },
    inputSchema: {
      additionalProperties: false,
      properties: {
        assetIds: {
          items: { minLength: 1, type: "string" },
          maxItems: 3,
          minItems: 3,
          type: "array",
          uniqueItems: true,
        },
      },
      required: ["assetIds"],
      type: "object",
    },
    name: "prepare_campaign_manifest",
    title: "Prepare campaign manifest",
  };
}

export function createInspectStaleCampaignTool(
  dependencies: CampaignToolDependencies,
): ModelContextTool {
  return {
    annotations: { readOnlyHint: true },
    description:
      "Inspect which selected rights proofs became stale and why publish authority was removed. Use in Stale state before choosing replacements. Returns stale and still-current proof details.",
    execute: async (_input, options) => {
      const state = await dependencies.request<DemoWorkflowState>(
        "/api/demo/state",
        { signal: options?.signal },
      );
      const manifest = state.currentManifest;
      if (!manifest || state.campaign.status !== "STALE") {
        throw new Error("The campaign is not currently stale.");
      }

      const proofs = manifest.proofs.map((proof) => {
        const asset = state.assets.find((candidate) => candidate.id === proof.assetId);
        const currentRightsVersion = asset?.rightsVersion ?? null;
        return {
          assetId: proof.assetId,
          current: currentRightsVersion === proof.rightsVersion,
          currentRightsVersion,
          proofRightsVersion: proof.rightsVersion,
        };
      });
      return JSON.stringify({
        manifestId: manifest.id,
        proofs,
        staleAssetIds: proofs
          .filter((proof) => !proof.current)
          .map((proof) => proof.assetId),
      });
    },
    inputSchema: EMPTY_OBJECT_SCHEMA,
    name: "inspect_stale_campaign",
    title: "Inspect stale campaign",
  };
}
