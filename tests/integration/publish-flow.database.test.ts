import { describe, expect, it } from "vitest";

import { getWorkflowRepository } from "@/server/db/client";
import {
  CAMPAIGN_ID,
  INITIAL_SELECTED_ASSET_IDS,
  REPLACEMENT_ASSET_ID,
  REVOCABLE_ASSET_ID,
} from "@/server/seed/demo-scenario";
import { ApprovalService } from "@/server/services/approval-service";
import { CampaignService } from "@/server/services/campaign-service";
import { DemoService } from "@/server/services/demo-service";
import {
  PublishService,
  WorkflowConflictError,
} from "@/server/services/publish-service";

const describeDatabase = process.env.DATABASE_URL ? describe : describe.skip;
const NOW = "2026-08-31T15:00:00.000Z";

describeDatabase("managed Postgres publish flow", () => {
  it("persists the complete stale-recovery and one-shot publish workflow", async () => {
    const repository = getWorkflowRepository();
    const now = () => NOW;
    const approvalService = new ApprovalService(repository, now);
    const campaignService = new CampaignService(repository, now);
    const demoService = new DemoService(repository, now);
    const publishService = new PublishService(repository, now);

    try {
      await demoService.reset();

      const firstManifest = await campaignService.prepareManifest(
        CAMPAIGN_ID,
        INITIAL_SELECTED_ASSET_IDS,
      );
      await approvalService.approveManifest(firstManifest.id);
      await demoService.revokeAssetRights(REVOCABLE_ASSET_ID);

      await expect(
        publishService.publishApprovedManifest(firstManifest.id),
      ).rejects.toEqual(
        new WorkflowConflictError("Manifest is not approved: STALE"),
      );

      const replacementManifest = await campaignService.prepareManifest(
        CAMPAIGN_ID,
        [
          ...INITIAL_SELECTED_ASSET_IDS.filter(
            (assetId) => assetId !== REVOCABLE_ASSET_ID,
          ),
          REPLACEMENT_ASSET_ID,
        ],
      );
      await approvalService.approveManifest(replacementManifest.id);

      const receipt = await publishService.publishApprovedManifest(
        replacementManifest.id,
      );
      expect(receipt).toMatchObject({
        campaignId: CAMPAIGN_ID,
        manifestId: replacementManifest.id,
        publishedAssetIds: replacementManifest.assetIds,
        publishedAt: NOW,
      });
      expect(receipt.receiptHash).toMatch(/^[a-f0-9]{64}$/);

      await expect(
        publishService.publishApprovedManifest(replacementManifest.id),
      ).rejects.toEqual(
        new WorkflowConflictError("Manifest is not approved: CONSUMED"),
      );

      const persisted = await demoService.getState();
      expect(persisted.campaign.status).toBe("PUBLISHED");
      expect(persisted.currentManifest?.status).toBe("CONSUMED");
      expect(persisted.publishReceipt?.id).toBe(receipt.id);
    } finally {
      await demoService.reset();
    }
  });
});
