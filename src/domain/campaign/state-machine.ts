import type {
  CampaignManifest,
  CampaignStatus,
} from "@/domain/types";
import {
  assertManifestHashMatchesContents,
  assertManifestPublishable,
} from "@/domain/campaign/invariants";

const LEGAL_CAMPAIGN_TRANSITIONS: Record<
  CampaignStatus,
  readonly CampaignStatus[]
> = {
  APPROVED: ["STALE", "PUBLISHED"],
  DRAFT: ["REVIEW_READY"],
  PUBLISHED: [],
  REVIEW_READY: ["DRAFT", "APPROVED"],
  STALE: ["REVIEW_READY"],
};

export function transitionCampaignStatus(
  current: CampaignStatus,
  next: CampaignStatus,
): CampaignStatus {
  if (!LEGAL_CAMPAIGN_TRANSITIONS[current].includes(next)) {
    throw new Error(`Illegal campaign transition: ${current} -> ${next}`);
  }
  return next;
}

export function approveManifest(
  manifest: CampaignManifest,
  approvedAt: string,
): CampaignManifest {
  if (manifest.status !== "REVIEW_READY") {
    throw new Error(`Manifest is not review-ready: ${manifest.status}`);
  }
  assertManifestHashMatchesContents(manifest);

  return {
    ...manifest,
    approvedAt,
    approvedManifestHash: manifest.manifestHash,
    status: "APPROVED",
  };
}

export function consumeApprovedManifest(
  manifest: CampaignManifest,
  currentRightsVersions: ReadonlyMap<string, number>,
): CampaignManifest {
  assertManifestPublishable(manifest, currentRightsVersions);
  return { ...manifest, status: "CONSUMED" };
}
