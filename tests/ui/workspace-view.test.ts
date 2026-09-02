import { describe, expect, it } from "vitest";

import { createCampaignManifest } from "@/domain/campaign/manifest";
import { createRightsProof } from "@/domain/rights/proof";
import type { DemoWorkflowState } from "@/server/seed/demo-scenario";
import {
  createDemoScenario,
  INITIAL_SELECTED_ASSET_IDS,
  REPLACEMENT_ASSET_ID,
  REVOCABLE_ASSET_ID,
} from "@/server/seed/demo-scenario";
import {
  getAssetEvidence,
  getAssetProofDelta,
  getAuthorizationSummary,
  getRecommendedManifestAssetIds,
} from "@/components/campaign/workspace-view";

const NOW = "2026-09-01T00:00:00.000Z";

function setManifest(state: DemoWorkflowState, assetIds: string[]) {
  const proofs = assetIds.map((assetId) => {
    const asset = state.assets.find((candidate) => candidate.id === assetId);

    if (!asset) {
      throw new Error(`Missing test asset: ${assetId}`);
    }

    return createRightsProof(asset, state.campaign, NOW);
  });

  state.currentManifest = createCampaignManifest({
    assetIds,
    campaignId: state.campaign.id,
    id: "manifest-test",
    proofs,
  });
}

function revokeSelectedAsset(state: DemoWorkflowState) {
  const asset = state.assets.find((candidate) => candidate.id === REVOCABLE_ASSET_ID);

  if (!asset) {
    throw new Error(`Missing test asset: ${REVOCABLE_ASSET_ID}`);
  }

  asset.rightsVersion += 1;
  asset.rightsGrants[0].status = "REVOKED";
  state.currentManifest!.status = "STALE";
  state.campaign.status = "STALE";
}

describe("campaign workspace view state", () => {
  it("shows authorization sequence as 0/3, 3/3, 2/3, restored 3/3", () => {
    const state = createDemoScenario(NOW);

    expect(getAuthorizationSummary(state)).toMatchObject({
      currentCount: 0,
      label: "0/3 current",
      stage: "DRAFT",
    });

    setManifest(state, [...INITIAL_SELECTED_ASSET_IDS]);
    state.campaign.status = "REVIEW_READY";
    expect(getAuthorizationSummary(state)).toMatchObject({
      currentCount: 3,
      label: "3/3 current",
      stage: "REVIEW_READY",
    });

    revokeSelectedAsset(state);
    expect(getAuthorizationSummary(state)).toMatchObject({
      currentCount: 2,
      label: "2/3 current",
      stage: "STALE",
    });

    setManifest(state, [
      INITIAL_SELECTED_ASSET_IDS[1],
      INITIAL_SELECTED_ASSET_IDS[2],
      REPLACEMENT_ASSET_ID,
    ]);
    state.campaign.status = "REVIEW_READY";
    expect(getAuthorizationSummary(state)).toMatchObject({
      currentCount: 3,
      label: "3/3 current",
      stage: "REVIEW_READY",
    });
  });

  it("recommends only eligible assets and preserves eligible selections during repair", () => {
    const state = createDemoScenario(NOW);

    expect(getRecommendedManifestAssetIds(state)).toEqual([
      "asset-sakura",
      "asset-neon",
      "asset-train",
    ]);
    expect(getAssetEvidence(state.assets[4], state.campaign)).toMatchObject({
      eligible: false,
      reasonLabels: ["Commercial use blocked"],
    });

    setManifest(state, [...INITIAL_SELECTED_ASSET_IDS]);
    revokeSelectedAsset(state);

    expect(getRecommendedManifestAssetIds(state)).toEqual([
      "asset-neon",
      "asset-train",
      "asset-market",
    ]);
  });

  it("exposes the recorded-to-current proof delta only when evidence is stale", () => {
    const state = createDemoScenario(NOW);
    setManifest(state, [...INITIAL_SELECTED_ASSET_IDS]);
    const sakura = state.assets.find(
      (asset) => asset.id === REVOCABLE_ASSET_ID,
    );

    expect(sakura).toBeDefined();
    expect(getAssetProofDelta(sakura!, state.currentManifest)).toEqual({
      currentVersion: 1,
      recordedVersion: 1,
      stale: false,
    });

    revokeSelectedAsset(state);

    expect(getAssetProofDelta(sakura!, state.currentManifest)).toEqual({
      currentVersion: 2,
      recordedVersion: 1,
      stale: true,
    });
    expect(
      getAssetProofDelta(state.assets[3], state.currentManifest),
    ).toBeNull();
  });
});
