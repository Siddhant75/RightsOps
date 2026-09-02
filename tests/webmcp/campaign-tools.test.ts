import { describe, expect, it } from "vitest";

import { createCampaignManifest } from "@/domain/campaign/manifest";
import { approveManifest } from "@/domain/campaign/state-machine";
import { createRightsProof } from "@/domain/rights/proof";
import type { CampaignStatus, PublishReceipt } from "@/domain/types";
import {
  CAMPAIGN_ID,
  createDemoScenario,
  INITIAL_SELECTED_ASSET_IDS,
  REVOCABLE_ASSET_ID,
  type DemoWorkflowState,
} from "@/server/seed/demo-scenario";
import type {
  ModelContextLike,
  ModelContextTool,
  RegisteredTool,
  RegistryObservation,
} from "@/webmcp/registry";
import {
  CampaignToolCoordinator,
  createCampaignToolsForState,
} from "@/webmcp/use-campaign-tools";
import {
  requestJson,
  type CampaignToolDependencies,
  type ToolRequestInit,
} from "@/webmcp/tool-types";

const NOW = "2026-09-01T00:00:00.000Z";

function createState(status: CampaignStatus): DemoWorkflowState {
  const state = createDemoScenario(NOW);
  if (status === "DRAFT") return state;

  const selectedAssets = INITIAL_SELECTED_ASSET_IDS.map((assetId) => {
    const asset = state.assets.find((candidate) => candidate.id === assetId);
    if (!asset) throw new Error(`Missing test asset: ${assetId}`);
    return asset;
  });
  const manifest = createCampaignManifest({
    assetIds: [...INITIAL_SELECTED_ASSET_IDS],
    campaignId: CAMPAIGN_ID,
    id: "manifest-7",
    proofs: selectedAssets.map((asset) =>
      createRightsProof(asset, state.campaign, NOW),
    ),
  });
  state.currentManifest = manifest;
  state.campaign.status = "REVIEW_READY";

  if (status === "REVIEW_READY") return state;

  state.currentManifest = approveManifest(manifest, NOW);
  state.campaign.status = "APPROVED";
  if (status === "APPROVED") return state;

  if (status === "STALE") {
    const revoked = state.assets.find((asset) => asset.id === REVOCABLE_ASSET_ID)!;
    revoked.rightsVersion += 1;
    revoked.rightsGrants[0].status = "REVOKED";
    state.currentManifest.status = "STALE";
    state.campaign.status = "STALE";
    return state;
  }

  state.currentManifest.status = "CONSUMED";
  state.campaign.status = "PUBLISHED";
  state.publishReceipt = {
    campaignId: CAMPAIGN_ID,
    id: "receipt-3",
    manifestId: state.currentManifest.id,
    publishedAssetIds: [...state.currentManifest.assetIds],
    publishedAt: NOW,
    receiptHash: "a".repeat(64),
  };
  return state;
}

function createDependencies(
  state: DemoWorkflowState,
  calls: Array<{ path: string; init?: ToolRequestInit }> = [],
  scheduled: Array<() => void> = [],
): CampaignToolDependencies {
  return {
    request: async <T>(path: string, init?: ToolRequestInit) => {
      calls.push({ init, path });
      if (path === "/api/demo/state") return structuredClone(state) as T;
      if (path.endsWith("/publish")) {
        return structuredClone(state.publishReceipt) as T;
      }
      if (path.includes("/manifest") && init?.method === "POST") {
        return structuredClone(state.currentManifest) as T;
      }
      throw new Error(`Unexpected test request: ${path}`);
    },
    scheduleStateRefresh: () => scheduled.push(() => undefined),
  };
}

class FakeModelContext extends EventTarget implements ModelContextLike {
  readonly signals = new Map<string, AbortSignal>();
  readonly tools = new Map<string, ModelContextTool>();

  async registerTool(
    tool: ModelContextTool,
    options: { signal?: AbortSignal } = {},
  ): Promise<void> {
    this.tools.set(tool.name, tool);
    if (options.signal) {
      this.signals.set(tool.name, options.signal);
      options.signal.addEventListener("abort", () => this.tools.delete(tool.name), {
        once: true,
      });
    }
  }

  async getTools(): Promise<RegisteredTool[]> {
    return [...this.tools.values()].map((tool) => ({
      annotations: tool.annotations,
      description: tool.description,
      inputSchema: tool.inputSchema,
      name: tool.name,
      title: tool.title,
    }));
  }
}

const EXPECTED_ALWAYS = [
  "find_eligible_assets",
  "get_campaign_state",
  "inspect_asset_rights",
  "list_assets",
];

describe("production WebMCP tool surface", () => {
  it.each([
    ["DRAFT", [...EXPECTED_ALWAYS, "prepare_campaign_manifest"]],
    ["REVIEW_READY", EXPECTED_ALWAYS],
    [
      "APPROVED",
      [...EXPECTED_ALWAYS, "publish_approved_campaign_manifest-7"],
    ],
    [
      "STALE",
      [...EXPECTED_ALWAYS, "inspect_stale_campaign", "prepare_campaign_manifest"],
    ],
    [
      "PUBLISHED",
      [...EXPECTED_ALWAYS, "get_campaign_audit", "get_publish_receipt"],
    ],
  ] as const)("derives only the %s tools from server state", (status, expected) => {
    const state = createState(status);
    const tools = createCampaignToolsForState(
      state,
      createDependencies(state),
    );
    const names = tools.map((tool) => tool.name).sort();

    expect(names).toEqual([...expected].sort());
    expect(names.some((name) => name.startsWith("approve"))).toBe(false);

    for (const tool of tools.filter((candidate) =>
      [
        ...EXPECTED_ALWAYS,
        "inspect_stale_campaign",
        "get_campaign_audit",
        "get_publish_receipt",
      ].includes(candidate.name),
    )) {
      expect(tool.annotations).toEqual({ readOnlyHint: true });
    }
  });

  it("binds the approved publish tool to one manifest with empty input", () => {
    const state = createState("APPROVED");
    const publishTool = createCampaignToolsForState(
      state,
      createDependencies(state),
    ).find((tool) => tool.name.startsWith("publish_approved_campaign_"));

    expect(publishTool).toMatchObject({
      description: expect.stringContaining("manifest-7"),
      inputSchema: {
        additionalProperties: false,
        properties: {},
        type: "object",
      },
      name: "publish_approved_campaign_manifest-7",
    });
  });
});

describe("production WebMCP execution", () => {
  it("prepares exactly the requested manifest through the same-origin route", async () => {
    const state = createState("DRAFT");
    const calls: Array<{ path: string; init?: ToolRequestInit }> = [];
    const scheduled: Array<() => void> = [];
    const tool = createCampaignToolsForState(
      state,
      createDependencies(state, calls, scheduled),
    ).find((candidate) => candidate.name === "prepare_campaign_manifest")!;

    const output = await tool.execute({
      assetIds: [...INITIAL_SELECTED_ASSET_IDS],
    });

    expect(calls).toEqual([
      {
        init: {
          body: { assetIds: [...INITIAL_SELECTED_ASSET_IDS] },
          method: "POST",
        },
        path: `/api/campaigns/${CAMPAIGN_ID}/manifest`,
      },
    ]);
    expect(JSON.parse(output)).toMatchObject({ manifest: null });
    expect(scheduled).toHaveLength(1);
  });

  it("publishes only its bound manifest and defers state synchronization", async () => {
    const state = createState("APPROVED");
    const receipt: PublishReceipt = {
      campaignId: CAMPAIGN_ID,
      id: "receipt-9",
      manifestId: "manifest-7",
      publishedAssetIds: [...INITIAL_SELECTED_ASSET_IDS],
      publishedAt: NOW,
      receiptHash: "b".repeat(64),
    };
    state.publishReceipt = receipt;
    const calls: Array<{ path: string; init?: ToolRequestInit }> = [];
    const scheduled: Array<() => void> = [];
    const tool = createCampaignToolsForState(
      state,
      createDependencies(state, calls, scheduled),
    ).find((candidate) => candidate.name.startsWith("publish_approved_campaign_"))!;

    const output = await tool.execute({});

    expect(calls).toEqual([
      {
        init: { body: {}, method: "POST" },
        path: "/api/manifests/manifest-7/publish",
      },
    ]);
    expect(JSON.parse(output)).toEqual({ receipt });
    expect(scheduled).toHaveLength(1);
  });

  it("returns precise same-origin route failures", async () => {
    const fetcher = async () =>
      new Response(JSON.stringify({ error: "Manifest is not approved: STALE" }), {
        headers: { "content-type": "application/json" },
        status: 409,
      });

    await expect(
      requestJson(
        "/api/manifests/manifest-7/publish",
        { body: {}, method: "POST" },
        fetcher,
      ),
    ).rejects.toThrow(
      "POST /api/manifests/manifest-7/publish failed (409): Manifest is not approved: STALE",
    );
  });

  it("adds method, route, and recovery guidance to ordinary network failures", async () => {
    const fetcher = async () => {
      throw new TypeError("Failed to fetch");
    };

    await expect(
      requestJson("/api/demo/state", {}, fetcher),
    ).rejects.toThrow(
      "GET /api/demo/state failed before response: Unable to reach the RightsOps server. Check the connection and retry. Cause: Failed to fetch",
    );
  });

  it("preserves abort cancellation without converting it to a network failure", async () => {
    const cancellation = new DOMException("The operation was aborted", "AbortError");
    const fetcher = async () => {
      throw cancellation;
    };

    await expect(
      requestJson("/api/demo/state", {}, fetcher),
    ).rejects.toBe(cancellation);
  });
});

describe("CampaignToolCoordinator", () => {
  it("preserves the campaign lifecycle on a registerTool-only client", async () => {
    const context = new FakeModelContext();
    const draft = createState("DRAFT");
    const coordinator = new CampaignToolCoordinator(
      { registerTool: context.registerTool.bind(context) },
      createDependencies(draft),
    );

    await expect(coordinator.synchronize(draft)).resolves.toEqual([]);
    expect(coordinator.observationStatus).toEqual({
      reconciliation: "unavailable",
      toolchange: false,
    });
    expect([...context.tools.keys()].sort()).toEqual(
      [...EXPECTED_ALWAYS, "prepare_campaign_manifest"].sort(),
    );
    const result = JSON.parse(
      await context.tools.get("get_campaign_state")!.execute({}),
    );
    expect(result.campaign.status).toBe("DRAFT");

    await coordinator.synchronize(createState("REVIEW_READY"));
    expect([...context.tools.keys()].sort()).toEqual(EXPECTED_ALWAYS);
    await coordinator.synchronize(createState("APPROVED"));
    expect(context.tools.has("publish_approved_campaign_manifest-7")).toBe(true);

    await coordinator.synchronize(createState("STALE"));
    expect(context.tools.has("publish_approved_campaign_manifest-7")).toBe(false);
    expect(context.tools.has("inspect_stale_campaign")).toBe(true);
    expect(context.tools.has("prepare_campaign_manifest")).toBe(true);

    const replacement = createState("REVIEW_READY");
    replacement.currentManifest!.id = "manifest-8";
    await coordinator.synchronize(replacement);
    expect([...context.tools.keys()].sort()).toEqual(EXPECTED_ALWAYS);
    replacement.campaign.status = "APPROVED";
    replacement.currentManifest!.status = "APPROVED";
    await coordinator.synchronize(replacement);
    expect(context.tools.has("publish_approved_campaign_manifest-8")).toBe(true);

    const published = createState("PUBLISHED");
    published.currentManifest!.id = "manifest-8";
    await coordinator.synchronize(published);
    expect(context.tools.has("publish_approved_campaign_manifest-8")).toBe(false);
    expect(context.tools.has("get_publish_receipt")).toBe(true);
    expect(context.tools.has("get_campaign_audit")).toBe(true);
    expect(
      [...context.tools.keys()].some((name) => name.startsWith("approve")),
    ).toBe(false);
    coordinator.dispose();
    expect(context.tools.size).toBe(0);
  });

  it("forwards registry operations and browser toolchange as observation only", async () => {
    const context = new FakeModelContext();
    const draft = createState("DRAFT");
    const observations: RegistryObservation[] = [];
    const coordinator = new CampaignToolCoordinator(
      context,
      createDependencies(draft),
      (event) => observations.push(event),
    );

    await coordinator.synchronize(draft);
    context.dispatchEvent(new Event("toolchange"));

    expect(
      observations
        .filter((event) => event.kind === "registered")
        .map((event) => event.toolName)
        .sort(),
    ).toEqual([...EXPECTED_ALWAYS, "prepare_campaign_manifest"].sort());
    expect(observations.at(-1)).toMatchObject({
      kind: "toolchange",
      toolName: null,
    });
    expect(draft.campaign.status).toBe("DRAFT");
  });

  it("reconciles approval, staleness, replacement approval, and publication", async () => {
    const context = new FakeModelContext();
    const draft = createState("DRAFT");
    const scheduled: Array<() => void> = [];
    const coordinator = new CampaignToolCoordinator(
      context,
      createDependencies(draft, [], scheduled),
    );

    await coordinator.synchronize(draft);
    expect((await context.getTools()).map((tool) => tool.name).sort()).toEqual(
      [...EXPECTED_ALWAYS, "prepare_campaign_manifest"].sort(),
    );

    const approved = createState("APPROVED");
    await coordinator.synchronize(approved);
    const publishName = "publish_approved_campaign_manifest-7";
    expect(context.tools.has(publishName)).toBe(true);
    const publishSignal = context.signals.get(publishName)!;

    const stale = createState("STALE");
    await coordinator.synchronize(stale);
    expect(publishSignal.aborted).toBe(true);
    expect(context.tools.has(publishName)).toBe(false);

    const replacement = createState("APPROVED");
    replacement.currentManifest!.id = "manifest-8";
    await coordinator.synchronize(replacement);
    expect(context.tools.has("publish_approved_campaign_manifest-8")).toBe(true);

    const published = createState("PUBLISHED");
    published.currentManifest!.id = "manifest-8";
    await coordinator.synchronize(published);
    expect(context.tools.has("publish_approved_campaign_manifest-8")).toBe(false);
    expect(context.tools.has("get_publish_receipt")).toBe(true);
    expect(context.tools.has("get_campaign_audit")).toBe(true);
  });

  it("does not abort a publish registration inside its executing callback", async () => {
    const context = new FakeModelContext();
    const approved = createState("APPROVED");
    const scheduled: Array<() => void> = [];
    const coordinator = new CampaignToolCoordinator(
      context,
      createDependencies(approved, [], scheduled),
    );
    await coordinator.synchronize(approved);
    const publishName = "publish_approved_campaign_manifest-7";
    const publishSignal = context.signals.get(publishName)!;

    await context.tools.get(publishName)!.execute({});

    expect(publishSignal.aborted).toBe(false);
    expect(scheduled).toHaveLength(1);
  });
});
