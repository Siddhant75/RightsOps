import { describe, expect, it } from "vitest";

import {
  approveManifest,
  consumeApprovedManifest,
  transitionCampaignStatus,
} from "@/domain/campaign/state-machine";
import { assertManifestPublishable } from "@/domain/campaign/invariants";
import type { CampaignManifest } from "@/domain/types";

const reviewManifest: CampaignManifest = {
  approvedAt: null,
  approvedManifestHash: null,
  assetIds: ["asset-a"],
  campaignId: "campaign-1",
  id: "manifest-1",
  manifestHash: "7edbacfe22882b4d8f9ac60b9fc416677d99aef610ffa55bc44cebf47e6eabef",
  proofs: [
    {
      assetId: "asset-a",
      campaignPolicyHash: "policy-hash",
      createdAt: "2026-08-31T12:00:00.000Z",
      eligible: true,
      reasons: [],
      rightsVersion: 3,
    },
  ],
  status: "REVIEW_READY",
};

describe("campaign workflow state machine", () => {
  it("allows the planned drafting transition", () => {
    expect(transitionCampaignStatus("DRAFT", "REVIEW_READY")).toBe(
      "REVIEW_READY",
    );
  });

  it("rejects a direct DRAFT to PUBLISHED transition", () => {
    expect(() => transitionCampaignStatus("DRAFT", "PUBLISHED")).toThrow(
      "Illegal campaign transition: DRAFT -> PUBLISHED",
    );
  });
});

describe("manifest approval invariants", () => {
  it("rejects approval outside review-ready state", () => {
    expect(() =>
      approveManifest(
        { ...reviewManifest, status: "STALE" },
        "2026-08-31T13:00:00.000Z",
      ),
    ).toThrow("Manifest is not review-ready: STALE");
  });

  it("rejects approval when manifest contents do not match its hash", () => {
    expect(() =>
      approveManifest(
        { ...reviewManifest, assetIds: ["asset-b"] },
        "2026-08-31T13:00:00.000Z",
      ),
    ).toThrow("Manifest hash does not match manifest contents");
  });

  it("binds approval to the exact manifest hash", () => {
    const approved = approveManifest(
      reviewManifest,
      "2026-08-31T13:00:00.000Z",
    );

    expect(approved).toMatchObject({
      approvedAt: "2026-08-31T13:00:00.000Z",
      approvedManifestHash:
        "7edbacfe22882b4d8f9ac60b9fc416677d99aef610ffa55bc44cebf47e6eabef",
      status: "APPROVED",
    });
    expect(() =>
      assertManifestPublishable(approved, new Map([["asset-a", 3]])),
    ).not.toThrow();
  });

  it("rejects publication when current evidence is stale", () => {
    const approved = approveManifest(
      reviewManifest,
      "2026-08-31T13:00:00.000Z",
    );

    expect(() =>
      assertManifestPublishable(approved, new Map([["asset-a", 4]])),
    ).toThrow("Rights proof is stale for asset: asset-a");
  });

  it("rejects publication when approved manifest semantics change", () => {
    const approved = approveManifest(
      reviewManifest,
      "2026-08-31T13:00:00.000Z",
    );
    const changedAfterApproval = {
      ...approved,
      manifestHash: "changed-manifest-hash",
    };

    expect(() =>
      assertManifestPublishable(
        changedAfterApproval,
        new Map([["asset-a", 3]]),
      ),
    ).toThrow("Approved manifest hash does not match current manifest");
  });

  it("rejects publication when contents change without updating the hash", () => {
    const approved = approveManifest(
      reviewManifest,
      "2026-08-31T13:00:00.000Z",
    );

    expect(() =>
      assertManifestPublishable(
        { ...approved, assetIds: ["asset-b"] },
        new Map([["asset-a", 3]]),
      ),
    ).toThrow("Manifest hash does not match manifest contents");
  });

  it("prevents a consumed approval from publishing twice", () => {
    const approved = approveManifest(
      reviewManifest,
      "2026-08-31T13:00:00.000Z",
    );
    const consumed = consumeApprovedManifest(
      approved,
      new Map([["asset-a", 3]]),
    );

    expect(consumed.status).toBe("CONSUMED");
    expect(() =>
      consumeApprovedManifest(consumed, new Map([["asset-a", 3]])),
    ).toThrow("Manifest is not approved: CONSUMED");
  });
});
