export type CampaignStatus =
  | "DRAFT"
  | "REVIEW_READY"
  | "APPROVED"
  | "STALE"
  | "PUBLISHED";

export type ManifestStatus =
  | "REVIEW_READY"
  | "APPROVED"
  | "STALE"
  | "CONSUMED";

export type RightsGrantStatus = "ACTIVE" | "REVOKED";

export type RightsFailureReason =
  | "GRANT_INACTIVE"
  | "COMMERCIAL_USE_NOT_ALLOWED"
  | "TERRITORY_NOT_ALLOWED"
  | "CHANNEL_NOT_ALLOWED"
  | "RIGHTS_START_AFTER_CAMPAIGN_START"
  | "RIGHTS_EXPIRE_BEFORE_CAMPAIGN_END";

export interface RightsGrant {
  id: string;
  assetId: string;
  holderLabel: string;
  commercialAllowed: boolean;
  territories: string[];
  channels: string[];
  validFrom: string;
  validUntil: string;
  status: RightsGrantStatus;
}

export interface Asset {
  id: string;
  title: string;
  thumbnailUrl: string;
  rightsVersion: number;
  rightsGrants: RightsGrant[];
}

export interface Campaign {
  id: string;
  title: string;
  territory: string;
  channels: string[];
  commercialUse: boolean;
  startsAt: string;
  endsAt: string;
  requiredAssetCount: number;
  status: CampaignStatus;
}

export interface RightsEvaluation {
  eligible: boolean;
  grantId?: string;
  reasons: RightsFailureReason[];
}

export interface RightsProof {
  assetId: string;
  rightsVersion: number;
  campaignPolicyHash: string;
  eligible: boolean;
  reasons: RightsFailureReason[];
  createdAt: string;
}

export interface CampaignManifest {
  id: string;
  campaignId: string;
  assetIds: string[];
  proofs: RightsProof[];
  manifestHash: string;
  status: ManifestStatus;
  approvedAt: string | null;
  approvedManifestHash: string | null;
}

export interface PublishReceipt {
  id: string;
  manifestId: string;
  campaignId: string;
  publishedAssetIds: string[];
  publishedAt: string;
  receiptHash: string;
}

export type AuditActor = "HUMAN" | "AGENT" | "SYSTEM";

export interface AuditEvent {
  id: string;
  kind: string;
  actor: AuditActor;
  summary: string;
  entityId: string;
  createdAt: string;
}
