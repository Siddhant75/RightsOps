import { createHash } from "node:crypto";

import { consumeApprovedManifest } from "@/domain/campaign/state-machine";
import type { PublishReceipt } from "@/domain/types";
import type { WorkflowRepository } from "@/server/db/client";

export class WorkflowConflictError extends Error {
  readonly status = 409;

  constructor(message: string) {
    super(message);
    this.name = "WorkflowConflictError";
  }
}

export class PublishService {
  constructor(
    private readonly repository: WorkflowRepository,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  async publishApprovedManifest(manifestId: string): Promise<PublishReceipt> {
    return this.repository.mutate((state) => {
      const manifest = state.currentManifest;
      if (!manifest || manifest.id !== manifestId) {
        throw new WorkflowConflictError(`Manifest not found: ${manifestId}`);
      }

      const currentRightsVersions = new Map(
        state.assets.map((asset) => [asset.id, asset.rightsVersion]),
      );
      let consumed;
      try {
        consumed = consumeApprovedManifest(manifest, currentRightsVersions);
      } catch (error) {
        throw new WorkflowConflictError(
          error instanceof Error ? error.message : String(error),
        );
      }

      const publishedAt = this.now();
      const receiptId = `receipt-${state.nextReceiptSequence}`;
      const publishedAssetIds = [...consumed.assetIds];
      const receiptHash = createHash("sha256")
        .update(
          JSON.stringify({
            campaignId: state.campaign.id,
            manifestId: consumed.id,
            publishedAssetIds,
            publishedAt,
            receiptId,
          }),
        )
        .digest("hex");
      const receipt: PublishReceipt = {
        campaignId: state.campaign.id,
        id: receiptId,
        manifestId: consumed.id,
        publishedAssetIds,
        publishedAt,
        receiptHash,
      };

      state.currentManifest = consumed;
      state.campaign.status = "PUBLISHED";
      state.publishReceipt = receipt;
      state.nextReceiptSequence += 1;
      state.auditEvents.push({
        actor: "AGENT",
        createdAt: publishedAt,
        entityId: receipt.id,
        id: `audit-${state.nextAuditSequence}`,
        kind: "CAMPAIGN_PUBLISHED",
        summary: `Consumed ${consumed.id} and created ${receipt.id}.`,
      });
      state.nextAuditSequence += 1;

      return structuredClone(receipt);
    });
  }
}
