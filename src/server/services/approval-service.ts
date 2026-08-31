import { approveManifest as approveDomainManifest } from "@/domain/campaign/state-machine";
import { isRightsProofFresh } from "@/domain/rights/proof";
import type { CampaignManifest } from "@/domain/types";
import type { WorkflowRepository } from "@/server/db/client";

export class ApprovalService {
  constructor(
    private readonly repository: WorkflowRepository,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  async approveManifest(manifestId: string): Promise<CampaignManifest> {
    return this.repository.mutate((state) => {
      const manifest = state.currentManifest;
      if (!manifest || manifest.id !== manifestId) {
        throw new Error(`Manifest not found: ${manifestId}`);
      }

      for (const proof of manifest.proofs) {
        const asset = state.assets.find((candidate) => candidate.id === proof.assetId);
        if (!asset || !isRightsProofFresh(proof, asset.rightsVersion)) {
          throw new Error(`Rights proof is stale for asset: ${proof.assetId}`);
        }
      }

      const approvedAt = this.now();
      const approved = approveDomainManifest(manifest, approvedAt);
      state.currentManifest = approved;
      state.campaign.status = "APPROVED";
      state.auditEvents.push({
        actor: "HUMAN",
        createdAt: approvedAt,
        entityId: approved.id,
        id: `audit-${state.nextAuditSequence}`,
        kind: "MANIFEST_APPROVED",
        summary: `Human approved the exact hash for ${approved.id}.`,
      });
      state.nextAuditSequence += 1;

      return structuredClone(approved);
    });
  }
}
