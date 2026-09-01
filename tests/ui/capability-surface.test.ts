import { describe, expect, it } from "vitest";

import {
  getCapabilityToolBadges,
  getPublishAuthorityNarrative,
  getRecentRegistryEvidence,
  getVisibleObservedTools,
} from "@/components/campaign/CapabilitySurface";
import { getCampaignToolSurfaceKey } from "@/webmcp/use-campaign-tools";
import { createDemoScenario } from "@/server/seed/demo-scenario";
import type { RegisteredTool } from "@/webmcp/registry";

const NOW = "2026-09-01T00:00:00.000Z";

describe("Capability Surface judge narrative", () => {
  it("explains stale authority removal from server state, not telemetry", () => {
    const state = createDemoScenario(NOW);
    state.campaign.status = "STALE";

    expect(getPublishAuthorityNarrative(state)).toEqual({
      detail:
        "Authorization evidence became stale. Repair the manifest and obtain a new exact human approval.",
      headline: "Publish authority removed",
      tone: "removed",
    });
  });

  it("binds granted authority language to the server manifest", () => {
    const state = createDemoScenario(NOW);
    state.campaign.status = "APPROVED";
    state.currentManifest = {
      approvedAt: NOW,
      approvedManifestHash: "a".repeat(64),
      assetIds: ["asset-sakura", "asset-neon", "asset-train"],
      campaignId: state.campaign.id,
      id: "manifest-42",
      manifestHash: "a".repeat(64),
      proofs: [],
      status: "APPROVED",
    };

    expect(getPublishAuthorityNarrative(state)).toEqual({
      detail:
        "Exact human approval is current for manifest-42. The browser may expose its one-shot publish capability.",
      headline: "Publish authority granted",
      tone: "granted",
    });
  });

  it("labels reconciled annotations in judge-readable language", () => {
    const readTool: RegisteredTool = {
      annotations: { readOnlyHint: true },
      description: "Read campaign state.",
      name: "get_campaign_state",
    };
    const publishTool: RegisteredTool = {
      description: "Publish approved manifest.",
      name: "publish_approved_campaign_manifest-42",
    };

    expect(getCapabilityToolBadges(readTool)).toEqual(["read-only"]);
    expect(getCapabilityToolBadges(publishTool)).toEqual(["one-shot action"]);
  });

  it("retains the publish removal in the recent secondary registry trail", () => {
    const events = [
      {
        kind: "registered" as const,
        observedAt: "2026-09-01T00:00:00.000Z",
        toolName: "publish_approved_campaign_manifest-42",
      },
      {
        kind: "unregistered" as const,
        observedAt: "2026-09-01T00:01:00.000Z",
        toolName: "publish_approved_campaign_manifest-42",
      },
      {
        kind: "registered" as const,
        observedAt: "2026-09-01T00:01:01.000Z",
        toolName: "inspect_stale_campaign",
      },
      {
        kind: "registered" as const,
        observedAt: "2026-09-01T00:01:02.000Z",
        toolName: "prepare_campaign_manifest",
      },
    ];

    expect(
      getRecentRegistryEvidence(events).map(({ kind, toolName }) => ({
        kind,
        toolName,
      })),
    ).toEqual([
      { kind: "registered", toolName: "prepare_campaign_manifest" },
      { kind: "registered", toolName: "inspect_stale_campaign" },
      {
        kind: "unregistered",
        toolName: "publish_approved_campaign_manifest-42",
      },
    ]);
  });

  it("never presents tools reconciled for an older server state", () => {
    const state = createDemoScenario(NOW);
    state.campaign.status = "APPROVED";
    state.currentManifest = {
      approvedAt: NOW,
      approvedManifestHash: "a".repeat(64),
      assetIds: ["asset-sakura", "asset-neon", "asset-train"],
      campaignId: state.campaign.id,
      id: "manifest-42",
      manifestHash: "a".repeat(64),
      proofs: [],
      status: "APPROVED",
    };
    const publishTool: RegisteredTool = {
      description: "Publish approved manifest.",
      name: "publish_approved_campaign_manifest-42",
    };
    const approvedSurfaceKey = getCampaignToolSurfaceKey(state);

    expect(
      getVisibleObservedTools(state, [publishTool], approvedSurfaceKey),
    ).toEqual([publishTool]);

    state.campaign.status = "STALE";
    state.currentManifest.status = "STALE";

    expect(
      getVisibleObservedTools(state, [publishTool], approvedSurfaceKey),
    ).toEqual([]);
  });
});
