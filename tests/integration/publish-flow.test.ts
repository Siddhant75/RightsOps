import { beforeEach, describe, expect, it } from "vitest";

import type { WorkflowRepository } from "@/server/db/client";
import {
  CAMPAIGN_ID,
  INITIAL_SELECTED_ASSET_IDS,
  REPLACEMENT_ASSET_ID,
  REVOCABLE_ASSET_ID,
  type DemoWorkflowState,
} from "@/server/seed/demo-scenario";
import { ApprovalService } from "@/server/services/approval-service";
import { CampaignService } from "@/server/services/campaign-service";
import { DemoService } from "@/server/services/demo-service";
import {
  PublishService,
  WorkflowConflictError,
} from "@/server/services/publish-service";

class MemoryWorkflowRepository implements WorkflowRepository {
  private state: DemoWorkflowState | null = null;

  async read(): Promise<DemoWorkflowState | null> {
    return this.state === null ? null : structuredClone(this.state);
  }

  async reset(state: DemoWorkflowState): Promise<void> {
    this.state = structuredClone(state);
  }

  async mutate<T>(
    mutation: (state: DemoWorkflowState) => T | Promise<T>,
  ): Promise<T> {
    if (this.state === null) {
      throw new Error("Demo workflow has not been initialized");
    }

    const workingState = structuredClone(this.state);
    const result = await mutation(workingState);
    this.state = workingState;
    return result;
  }
}

class FlakyResetWorkflowRepository extends MemoryWorkflowRepository {
  resetAttempts = 0;

  override async reset(state: DemoWorkflowState): Promise<void> {
    this.resetAttempts += 1;
    if (this.resetAttempts === 1) {
      throw new Error("transient reset write failure");
    }
    await super.reset(state);
  }
}

const NOW = "2026-08-31T14:00:00.000Z";
const now = () => NOW;

describe("server-authoritative publish flow", () => {
  let repository: MemoryWorkflowRepository;
  let approvalService: ApprovalService;
  let campaignService: CampaignService;
  let demoService: DemoService;
  let publishService: PublishService;

  beforeEach(() => {
    repository = new MemoryWorkflowRepository();
    approvalService = new ApprovalService(repository, now);
    campaignService = new CampaignService(repository, now);
    demoService = new DemoService(repository, now);
    publishService = new PublishService(repository, now);
  });

  it("retries the idempotent one-action reset after a transient repository failure", async () => {
    const flakyRepository = new FlakyResetWorkflowRepository();
    const service = new DemoService(flakyRepository, now);

    await expect(service.reset()).resolves.toMatchObject({
      campaign: { id: CAMPAIGN_ID, status: "DRAFT" },
      currentManifest: null,
      publishReceipt: null,
    });
    expect(flakyRepository.resetAttempts).toBe(2);
    await expect(flakyRepository.read()).resolves.toMatchObject({
      campaign: { status: "DRAFT" },
    });
  });

  it.each(["REVIEW_READY", "APPROVED", "STALE", "PUBLISHED"] as const)(
    "restores the exact deterministic baseline from partial %s state",
    async (partialStatus) => {
      await demoService.reset();
      const manifest = await campaignService.prepareManifest(
        CAMPAIGN_ID,
        INITIAL_SELECTED_ASSET_IDS,
      );

      if (partialStatus !== "REVIEW_READY") {
        await approvalService.approveManifest(manifest.id);
      }
      if (partialStatus === "STALE") {
        await demoService.revokeAssetRights(REVOCABLE_ASSET_ID);
      }
      if (partialStatus === "PUBLISHED") {
        await publishService.publishApprovedManifest(manifest.id);
      }

      expect((await demoService.getState()).campaign.status).toBe(partialStatus);

      const reset = await demoService.reset();

      expect(reset).toMatchObject({
        auditEvents: [
          {
            actor: "SYSTEM",
            id: "audit-1",
            kind: "DEMO_RESET",
          },
        ],
        campaign: { id: CAMPAIGN_ID, status: "DRAFT" },
        currentManifest: null,
        nextAuditSequence: 2,
        nextManifestSequence: 1,
        nextReceiptSequence: 1,
        publishReceipt: null,
      });
      expect(reset.assets).toHaveLength(8);
      expect(
        reset.assets.find((asset) => asset.id === REVOCABLE_ASSET_ID),
      ).toMatchObject({
        rightsGrants: [{ status: "ACTIVE" }],
        rightsVersion: 1,
      });
    },
  );

  it("rejects stale publication, accepts a replacement approval once, and rejects replay", async () => {
    const resetState = await demoService.reset();
    expect(resetState).toMatchObject({
      campaign: { id: CAMPAIGN_ID, status: "DRAFT" },
      currentManifest: null,
      publishReceipt: null,
    });

    const firstManifest = await campaignService.prepareManifest(
      CAMPAIGN_ID,
      INITIAL_SELECTED_ASSET_IDS,
    );
    expect(firstManifest.status).toBe("REVIEW_READY");

    const firstApproval = await approvalService.approveManifest(
      firstManifest.id,
    );
    expect(firstApproval.status).toBe("APPROVED");

    const revokedAsset = await demoService.revokeAssetRights(
      REVOCABLE_ASSET_ID,
    );
    expect(revokedAsset.rightsVersion).toBe(2);
    expect((await demoService.getState()).currentManifest?.status).toBe(
      "STALE",
    );

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
    expect(replacementManifest.id).not.toBe(firstManifest.id);
    expect(replacementManifest.assetIds).toContain(REPLACEMENT_ASSET_ID);

    const replacementApproval = await approvalService.approveManifest(
      replacementManifest.id,
    );
    expect(replacementApproval.status).toBe("APPROVED");

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

    const finalState = await demoService.getState();
    expect(finalState.campaign.status).toBe("PUBLISHED");
    expect(finalState.currentManifest?.status).toBe("CONSUMED");
    expect(finalState.publishReceipt?.id).toBe(receipt.id);
  });
});
