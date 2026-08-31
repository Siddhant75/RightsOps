import { createHash } from "node:crypto";

import type { Asset, Campaign, RightsProof } from "@/domain/types";
import { evaluateRights } from "@/domain/rights/evaluate-rights";

export function hashCampaignPolicy(campaign: Campaign): string {
  const canonicalPolicy = JSON.stringify({
    channels: [...campaign.channels].sort(),
    commercialUse: campaign.commercialUse,
    endsAt: campaign.endsAt,
    startsAt: campaign.startsAt,
    territory: campaign.territory,
  });

  return createHash("sha256").update(canonicalPolicy).digest("hex");
}

export function createRightsProof(
  asset: Asset,
  campaign: Campaign,
  createdAt: string,
): RightsProof {
  const evaluation = evaluateRights(asset, campaign);

  return {
    assetId: asset.id,
    campaignPolicyHash: hashCampaignPolicy(campaign),
    createdAt,
    eligible: evaluation.eligible,
    reasons: evaluation.reasons,
    rightsVersion: asset.rightsVersion,
  };
}

export function isRightsProofFresh(
  proof: RightsProof,
  currentRightsVersion: number,
): boolean {
  return proof.rightsVersion === currentRightsVersion;
}
