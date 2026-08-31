import { describe, expect, it } from "vitest";

import {
  createCampaignManifest,
  hashCampaignManifest,
} from "@/domain/campaign/manifest";
import type { RightsProof } from "@/domain/types";

const proofA: RightsProof = {
  assetId: "asset-a",
  campaignPolicyHash: "policy-hash",
  createdAt: "2026-08-31T12:00:00.000Z",
  eligible: true,
  reasons: [],
  rightsVersion: 3,
};

const proofB: RightsProof = {
  assetId: "asset-b",
  campaignPolicyHash: "policy-hash",
  createdAt: "2026-08-31T12:00:00.000Z",
  eligible: false,
  reasons: ["TERRITORY_NOT_ALLOWED", "CHANNEL_NOT_ALLOWED"],
  rightsVersion: 5,
};

describe("campaign manifest canonicalization", () => {
  it("produces the same hash for canonically equivalent manifest data", () => {
    const first = hashCampaignManifest({
      assetIds: ["asset-b", "asset-a"],
      campaignId: "campaign-1",
      proofs: [proofB, proofA],
    });
    const equivalent = hashCampaignManifest({
      assetIds: ["asset-a", "asset-b"],
      campaignId: "campaign-1",
      proofs: [
        proofA,
        {
          ...proofB,
          reasons: ["CHANNEL_NOT_ALLOWED", "TERRITORY_NOT_ALLOWED"],
        },
      ],
    });

    expect(first).toBe(equivalent);
  });

  it("changes the hash when an evidence version changes", () => {
    const baseline = hashCampaignManifest({
      assetIds: ["asset-a"],
      campaignId: "campaign-1",
      proofs: [proofA],
    });
    const changed = hashCampaignManifest({
      assetIds: ["asset-a"],
      campaignId: "campaign-1",
      proofs: [{ ...proofA, rightsVersion: 4 }],
    });

    expect(changed).not.toBe(baseline);
  });

  it("creates a review-ready manifest with normalized set-like fields", () => {
    const manifest = createCampaignManifest({
      assetIds: ["asset-b", "asset-a"],
      campaignId: "campaign-1",
      id: "manifest-1",
      proofs: [proofB, proofA],
    });

    expect(manifest.status).toBe("REVIEW_READY");
    expect(manifest.assetIds).toEqual(["asset-a", "asset-b"]);
    expect(manifest.proofs.map((proof) => proof.assetId)).toEqual([
      "asset-a",
      "asset-b",
    ]);
    expect(manifest.manifestHash).toMatch(/^[a-f0-9]{64}$/);
  });
});
