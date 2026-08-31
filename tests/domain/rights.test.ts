import { describe, expect, it } from "vitest";

import { evaluateRights } from "@/domain/rights/evaluate-rights";
import {
  createRightsProof,
  isRightsProofFresh,
} from "@/domain/rights/proof";
import type { Asset, Campaign, RightsGrant } from "@/domain/types";

const campaign: Campaign = {
  channels: ["INSTAGRAM", "TIKTOK"],
  commercialUse: true,
  endsAt: "2027-03-01T00:00:00.000Z",
  id: "campaign-japan-social",
  requiredAssetCount: 3,
  startsAt: "2026-09-01T00:00:00.000Z",
  status: "DRAFT",
  territory: "JP",
  title: "Japan social launch",
};

const eligibleGrant: RightsGrant = {
  assetId: "asset-hero",
  channels: ["INSTAGRAM", "TIKTOK", "YOUTUBE"],
  commercialAllowed: true,
  holderLabel: "Synthetic creator",
  id: "grant-hero",
  status: "ACTIVE",
  territories: ["JP", "US"],
  validFrom: "2026-01-01T00:00:00.000Z",
  validUntil: "2027-12-31T23:59:59.999Z",
};

function assetWithGrant(grant: RightsGrant): Asset {
  return {
    id: "asset-hero",
    rightsGrants: [grant],
    rightsVersion: 7,
    thumbnailUrl: "/assets/hero.webp",
    title: "Hero image",
  };
}

describe("rights evaluation", () => {
  it("accepts an active grant covering commercial use, territory, every channel, and the full campaign window", () => {
    expect(evaluateRights(assetWithGrant(eligibleGrant), campaign)).toEqual({
      eligible: true,
      grantId: "grant-hero",
      reasons: [],
    });
  });

  it.each([
    {
      expected: "TERRITORY_NOT_ALLOWED",
      grant: { ...eligibleGrant, territories: ["US"] },
      name: "territory",
    },
    {
      expected: "CHANNEL_NOT_ALLOWED",
      grant: { ...eligibleGrant, channels: ["INSTAGRAM"] },
      name: "channel",
    },
    {
      expected: "COMMERCIAL_USE_NOT_ALLOWED",
      grant: { ...eligibleGrant, commercialAllowed: false },
      name: "commercial use",
    },
    {
      expected: "RIGHTS_EXPIRE_BEFORE_CAMPAIGN_END",
      grant: {
        ...eligibleGrant,
        validUntil: "2026-12-31T23:59:59.999Z",
      },
      name: "expiry",
    },
  ])("returns an explicit reason for a $name failure", ({ expected, grant }) => {
    expect(evaluateRights(assetWithGrant(grant), campaign)).toEqual({
      eligible: false,
      reasons: [expected],
    });
  });

  it("rejects an inactive grant explicitly", () => {
    expect(
      evaluateRights(
        assetWithGrant({ ...eligibleGrant, status: "REVOKED" }),
        campaign,
      ),
    ).toEqual({
      eligible: false,
      reasons: ["GRANT_INACTIVE"],
    });
  });
});

describe("rights proof freshness", () => {
  it("makes a prior proof stale when the asset rightsVersion changes", () => {
    const proof = createRightsProof(
      assetWithGrant(eligibleGrant),
      campaign,
      "2026-08-31T12:00:00.000Z",
    );

    expect(proof.rightsVersion).toBe(7);
    expect(isRightsProofFresh(proof, 7)).toBe(true);
    expect(isRightsProofFresh(proof, 8)).toBe(false);
  });
});
