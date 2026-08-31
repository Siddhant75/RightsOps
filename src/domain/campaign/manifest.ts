import { createHash } from "node:crypto";

import type { CampaignManifest, RightsProof } from "@/domain/types";

export interface CampaignManifestHashInput {
  campaignId: string;
  assetIds: string[];
  proofs: RightsProof[];
}

export interface CreateCampaignManifestInput extends CampaignManifestHashInput {
  id: string;
}

function normalizeProof(proof: RightsProof): RightsProof {
  return {
    assetId: proof.assetId,
    campaignPolicyHash: proof.campaignPolicyHash,
    createdAt: proof.createdAt,
    eligible: proof.eligible,
    reasons: [...proof.reasons].sort(),
    rightsVersion: proof.rightsVersion,
  };
}

function normalizeManifestData(input: CampaignManifestHashInput) {
  return {
    assetIds: [...new Set(input.assetIds)].sort(),
    campaignId: input.campaignId,
    proofs: input.proofs
      .map(normalizeProof)
      .sort((left, right) => left.assetId.localeCompare(right.assetId)),
  };
}

export function hashCampaignManifest(
  input: CampaignManifestHashInput,
): string {
  const canonicalManifest = JSON.stringify(normalizeManifestData(input));
  return createHash("sha256").update(canonicalManifest).digest("hex");
}

export function createCampaignManifest(
  input: CreateCampaignManifestInput,
): CampaignManifest {
  const normalized = normalizeManifestData(input);

  return {
    approvedAt: null,
    approvedManifestHash: null,
    assetIds: normalized.assetIds,
    campaignId: normalized.campaignId,
    id: input.id,
    manifestHash: hashCampaignManifest(normalized),
    proofs: normalized.proofs,
    status: "REVIEW_READY",
  };
}
