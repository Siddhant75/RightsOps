import { createCampaignManifest } from "@/domain/campaign/manifest";
import { transitionCampaignStatus } from "@/domain/campaign/state-machine";
import { createRightsProof } from "@/domain/rights/proof";
import type { CampaignManifest } from "@/domain/types";
import type { WorkflowRepository } from "@/server/db/client";

export class CampaignService {
  constructor(
    private readonly repository: WorkflowRepository,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  async prepareManifest(
    campaignId: string,
    requestedAssetIds: readonly string[],
  ): Promise<CampaignManifest> {
    return this.repository.mutate((state) => {
      if (state.campaign.id !== campaignId) {
        throw new Error(`Campaign not found: ${campaignId}`);
      }

      const assetIds = [...new Set(requestedAssetIds)];
      if (assetIds.length !== state.campaign.requiredAssetCount) {
        throw new Error(
          `Campaign requires exactly ${state.campaign.requiredAssetCount} assets`,
        );
      }

      const assets = assetIds.map((assetId) => {
        const found = state.assets.find((asset) => asset.id === assetId);
        if (!found) throw new Error(`Asset not found: ${assetId}`);
        return found;
      });
      const createdAt = this.now();
      const proofs = assets.map((asset) =>
        createRightsProof(asset, state.campaign, createdAt),
      );
      const ineligible = proofs.find((proof) => !proof.eligible);
      if (ineligible) {
        throw new Error(
          `Asset is ineligible: ${ineligible.assetId} (${ineligible.reasons.join(", ")})`,
        );
      }

      const manifest = createCampaignManifest({
        assetIds,
        campaignId,
        id: `manifest-${state.nextManifestSequence}`,
        proofs,
      });
      state.nextManifestSequence += 1;
      state.currentManifest = manifest;
      state.publishReceipt = null;

      const currentStatus = state.campaign.status;
      state.campaign.status =
        currentStatus === "REVIEW_READY"
          ? "REVIEW_READY"
          : transitionCampaignStatus(currentStatus, "REVIEW_READY");
      state.auditEvents.push({
        actor: "AGENT",
        createdAt,
        entityId: manifest.id,
        id: `audit-${state.nextAuditSequence}`,
        kind: "MANIFEST_PREPARED",
        summary: `Prepared ${manifest.id} with ${manifest.assetIds.length} eligible assets.`,
      });
      state.nextAuditSequence += 1;

      return structuredClone(manifest);
    });
  }
}
