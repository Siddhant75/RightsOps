import type {
  Asset,
  AuditEvent,
  Campaign,
  CampaignManifest,
  PublishReceipt,
  RightsGrant,
} from "@/domain/types";

export const CAMPAIGN_ID = "campaign-japan-social";
export const REVOCABLE_ASSET_ID = "asset-sakura";
export const REPLACEMENT_ASSET_ID = "asset-market";
export const INITIAL_SELECTED_ASSET_IDS = [
  REVOCABLE_ASSET_ID,
  "asset-neon",
  "asset-train",
] as const;

export interface DemoWorkflowState {
  campaign: Campaign;
  assets: Asset[];
  currentManifest: CampaignManifest | null;
  publishReceipt: PublishReceipt | null;
  auditEvents: AuditEvent[];
  nextManifestSequence: number;
  nextReceiptSequence: number;
  nextAuditSequence: number;
}

const CAMPAIGN_START = "2026-09-01T00:00:00.000Z";
const CAMPAIGN_END = "2027-03-01T00:00:00.000Z";

function grant(
  assetId: string,
  overrides: Partial<RightsGrant> = {},
): RightsGrant {
  return {
    assetId,
    channels: ["INSTAGRAM", "TIKTOK"],
    commercialAllowed: true,
    holderLabel: "Synthetic rights holder",
    id: `grant-${assetId}`,
    status: "ACTIVE",
    territories: ["JP"],
    validFrom: "2026-01-01T00:00:00.000Z",
    validUntil: "2027-12-31T23:59:59.999Z",
    ...overrides,
  };
}

function asset(
  id: string,
  title: string,
  grantOverrides: Partial<RightsGrant> = {},
): Asset {
  return {
    id,
    rightsGrants: [grant(id, grantOverrides)],
    rightsVersion: 1,
    thumbnailUrl: `/assets/${id}.webp`,
    title,
  };
}

export function createDemoScenario(createdAt: string): DemoWorkflowState {
  const campaign: Campaign = {
    channels: ["INSTAGRAM", "TIKTOK"],
    commercialUse: true,
    endsAt: CAMPAIGN_END,
    id: CAMPAIGN_ID,
    requiredAssetCount: 3,
    startsAt: CAMPAIGN_START,
    status: "DRAFT",
    territory: "JP",
    title: "Japan social launch",
  };

  return {
    assets: [
      asset(REVOCABLE_ASSET_ID, "Sakura crossing"),
      asset("asset-neon", "Neon storefront"),
      asset("asset-train", "City train"),
      asset(REPLACEMENT_ASSET_ID, "Market detail"),
      asset("asset-no-commercial", "Editorial portrait", {
        commercialAllowed: false,
      }),
      asset("asset-no-japan", "US-only skyline", {
        territories: ["US"],
      }),
      asset("asset-no-tiktok", "Instagram-only reel", {
        channels: ["INSTAGRAM"],
      }),
      asset("asset-expiring", "Short-window installation", {
        validUntil: "2026-12-31T23:59:59.999Z",
      }),
    ],
    auditEvents: [
      {
        actor: "SYSTEM",
        createdAt,
        entityId: CAMPAIGN_ID,
        id: "audit-1",
        kind: "DEMO_RESET",
        summary: "Restored the deterministic demo baseline.",
      },
    ],
    campaign,
    currentManifest: null,
    nextAuditSequence: 2,
    nextManifestSequence: 1,
    nextReceiptSequence: 1,
    publishReceipt: null,
  };
}
