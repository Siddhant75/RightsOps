import { evaluateRights } from "@/domain/rights/evaluate-rights";
import type {
  Asset,
  Campaign,
  CampaignManifest,
  CampaignStatus,
  RightsFailureReason,
} from "@/domain/types";
import type { DemoWorkflowState } from "@/server/seed/demo-scenario";

const REASON_LABELS: Record<RightsFailureReason, string> = {
  CHANNEL_NOT_ALLOWED: "Required channel missing",
  COMMERCIAL_USE_NOT_ALLOWED: "Commercial use blocked",
  GRANT_INACTIVE: "Grant inactive",
  RIGHTS_EXPIRE_BEFORE_CAMPAIGN_END: "Rights expire too early",
  RIGHTS_START_AFTER_CAMPAIGN_START: "Rights start too late",
  TERRITORY_NOT_ALLOWED: "Required territory missing",
};

export interface AssetEvidence {
  eligible: boolean;
  reasonLabels: string[];
}

export interface AssetProofDelta {
  currentVersion: number;
  recordedVersion: number;
  stale: boolean;
}

export interface AuthorizationSummary {
  currentCount: number;
  label: string;
  reason: string;
  requiredCount: number;
  stage: CampaignStatus;
  tone: "blocked" | "complete" | "neutral" | "ready";
}

export function getAssetEvidence(
  asset: Asset,
  campaign: Campaign,
): AssetEvidence {
  const evaluation = evaluateRights(asset, campaign);

  return {
    eligible: evaluation.eligible,
    reasonLabels: evaluation.reasons.map((reason) => REASON_LABELS[reason]),
  };
}

export function getAssetProofDelta(
  asset: Asset,
  manifest: CampaignManifest | null,
): AssetProofDelta | null {
  const proof = manifest?.proofs.find((candidate) => candidate.assetId === asset.id);

  if (!proof) return null;

  return {
    currentVersion: asset.rightsVersion,
    recordedVersion: proof.rightsVersion,
    stale: asset.rightsVersion !== proof.rightsVersion,
  };
}

export function getRecommendedManifestAssetIds(
  state: DemoWorkflowState,
): string[] {
  const eligibleAssetIds = state.assets
    .filter((asset) => getAssetEvidence(asset, state.campaign).eligible)
    .map((asset) => asset.id);
  const eligibleAssetIdSet = new Set(eligibleAssetIds);
  const retainedAssetIds =
    state.currentManifest?.assetIds.filter((assetId) =>
      eligibleAssetIdSet.has(assetId),
    ) ?? [];

  return [...new Set([...retainedAssetIds, ...eligibleAssetIds])].slice(
    0,
    state.campaign.requiredAssetCount,
  );
}

export function getAuthorizationSummary(
  state: DemoWorkflowState,
): AuthorizationSummary {
  const currentCount =
    state.currentManifest?.proofs.filter((proof) => {
      const asset = state.assets.find((candidate) => candidate.id === proof.assetId);
      return Boolean(asset && asset.rightsVersion === proof.rightsVersion);
    }).length ?? 0;
  const requiredCount = state.campaign.requiredAssetCount;
  const shared = {
    currentCount,
    label: `${currentCount}/${requiredCount} current`,
    requiredCount,
    stage: state.campaign.status,
  };

  switch (state.campaign.status) {
    case "DRAFT":
      return {
        ...shared,
        reason: "No manifest has been prepared for review.",
        tone: "neutral",
      };
    case "REVIEW_READY":
      return {
        ...shared,
        reason: "Every selected asset has a current rights proof.",
        tone: "ready",
      };
    case "APPROVED":
      return {
        ...shared,
        reason: "Human approval is bound to the current manifest hash.",
        tone: "ready",
      };
    case "STALE":
      return {
        ...shared,
        reason: "Rights changed after manifest preparation; repair is required.",
        tone: "blocked",
      };
    case "PUBLISHED":
      return {
        ...shared,
        reason: "The approved manifest was consumed by simulated publishing.",
        tone: "complete",
      };
  }
}
