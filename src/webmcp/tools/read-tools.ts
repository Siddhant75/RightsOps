import { evaluateRights } from "@/domain/rights/evaluate-rights";
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

export function createAlwaysReadTools(
  dependencies: CampaignToolDependencies,
): ModelContextTool[] {
  return [
    {
      annotations: READ_ONLY,
      description:
        "Get the current server-authoritative campaign, manifest, approval state, and publish receipt. Use before choosing the next campaign operation. Returns the current workflow snapshot.",
      execute: async (_input, options) => {
        const state = await readState(dependencies, options?.signal);
        return JSON.stringify({
          campaign: state.campaign,
          currentManifest: state.currentManifest,
          publishReceipt: state.publishReceipt,
        });
      },
      inputSchema: EMPTY_OBJECT_SCHEMA,
      name: "get_campaign_state",
      title: "Get campaign state",
    },
    {
      annotations: READ_ONLY,
      description:
        "List the campaign's seeded creative assets with identifiers and evidence versions. Use to discover candidates before inspecting rights. Returns a compact asset list.",
      execute: async (_input, options) => {
        const state = await readState(dependencies, options?.signal);
        return JSON.stringify({
          assets: state.assets.map((asset) => ({
            id: asset.id,
            rightsVersion: asset.rightsVersion,
            title: asset.title,
          })),
          note:
            state.assets.length === 0
              ? "The campaign currently has no candidate assets."
              : `${state.assets.length} candidate assets are available.`,
        });
      },
      inputSchema: EMPTY_OBJECT_SCHEMA,
      name: "list_assets",
      title: "List campaign assets",
    },
    {
      annotations: READ_ONLY,
      description:
        "Inspect one asset's structured rights grants against the current campaign policy. Use after list_assets when evaluating a candidate. Returns the asset, policy, and deterministic eligibility result.",
      execute: async (input, options) => {
        if (typeof input.assetId !== "string" || input.assetId.length === 0) {
          throw new Error("inspect_asset_rights requires a non-empty assetId.");
        }
        const state = await readState(dependencies, options?.signal);
        const asset = state.assets.find((candidate) => candidate.id === input.assetId);
        if (!asset) throw new Error(`Asset not found: ${input.assetId}`);

        return JSON.stringify({
          asset,
          campaignPolicy: {
            channels: state.campaign.channels,
            commercialUse: state.campaign.commercialUse,
            endsAt: state.campaign.endsAt,
            startsAt: state.campaign.startsAt,
            territory: state.campaign.territory,
          },
          evaluation: evaluateRights(asset, state.campaign),
        });
      },
      inputSchema: {
        additionalProperties: false,
        properties: { assetId: { minLength: 1, type: "string" } },
        required: ["assetId"],
        type: "object",
      },
      name: "inspect_asset_rights",
      title: "Inspect asset rights",
    },
    {
      annotations: READ_ONLY,
      description:
        "Find assets whose structured rights are eligible for the current campaign policy. Use to select a manifest without guessing. Returns eligible identifiers, titles, and evidence versions.",
      execute: async (_input, options) => {
        const state = await readState(dependencies, options?.signal);
        const assets = state.assets
          .filter((asset) => evaluateRights(asset, state.campaign).eligible)
          .map((asset) => ({
            id: asset.id,
            rightsVersion: asset.rightsVersion,
            title: asset.title,
          }));
        return JSON.stringify({
          assets,
          note:
            assets.length === 0
              ? "No assets currently satisfy the campaign policy."
              : `${assets.length} assets currently satisfy the campaign policy.`,
        });
      },
      inputSchema: EMPTY_OBJECT_SCHEMA,
      name: "find_eligible_assets",
      title: "Find eligible assets",
    },
  ];
}
