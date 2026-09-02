import { expect, test, type Page } from "@playwright/test";

const CAMPAIGN_PATH = "/campaign/campaign-japan-social";
const INITIAL_ASSET_IDS = ["asset-sakura", "asset-neon", "asset-train"];
const REPLACEMENT_ASSET_IDS = ["asset-neon", "asset-train", "asset-market"];
const ALWAYS_AVAILABLE_TOOLS = [
  "find_eligible_assets",
  "get_campaign_state",
  "inspect_asset_rights",
  "list_assets",
];

interface HarnessTool {
  annotations?: Record<string, boolean>;
  description: string;
  execute: (
    input: Record<string, unknown>,
    options?: { signal: AbortSignal },
  ) => Promise<string> | string;
  inputSchema: Record<string, unknown>;
  name: string;
  title?: string;
}

interface HarnessModelContext extends EventTarget {
  __execute(name: string, input: Record<string, unknown>): Promise<string>;
  getTools(): Promise<Array<Omit<HarnessTool, "execute">>>;
  registerTool(
    tool: HarnessTool,
    options?: { signal?: AbortSignal },
  ): Promise<void>;
}

async function installWebMcpHarness(page: Page) {
  await page.addInitScript(() => {
    const registered = new Map<string, HarnessTool>();
    const context = new EventTarget() as HarnessModelContext;

    context.registerTool = async (tool, options) => {
      if (registered.has(tool.name)) {
        throw new Error(`Tool is already registered: ${tool.name}`);
      }
      if (options?.signal?.aborted) {
        throw new DOMException("Registration aborted", "AbortError");
      }

      registered.set(tool.name, tool);
      options?.signal?.addEventListener(
        "abort",
        () => {
          if (registered.delete(tool.name)) {
            context.dispatchEvent(new Event("toolchange"));
          }
        },
        { once: true },
      );
      context.dispatchEvent(new Event("toolchange"));
    };

    context.getTools = async () =>
      [...registered.values()].map(
        ({ annotations, description, inputSchema, name, title }) => ({
          annotations,
          description,
          inputSchema,
          name,
          title,
        }),
      );

    context.__execute = async (name, input) => {
      const tool = registered.get(name);
      if (!tool) throw new Error(`WebMCP tool is not registered: ${name}`);
      return tool.execute(input, { signal: new AbortController().signal });
    };

    Object.defineProperty(document, "modelContext", {
      configurable: true,
      value: context,
    });
  });
}

async function listToolNames(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const context = (
      document as Document & { modelContext: HarnessModelContext }
    ).modelContext;
    const tools = await context.getTools();
    return tools.map((tool) => tool.name).sort();
  });
}

async function executeTool<T>(
  page: Page,
  name: string,
  input: Record<string, unknown> = {},
): Promise<T> {
  const output = await page.evaluate(
    async ({ input: toolInput, name: toolName }) => {
      const context = (
        document as Document & { modelContext: HarnessModelContext }
      ).modelContext;
      return context.__execute(toolName, toolInput);
    },
    { input, name },
  );
  return JSON.parse(output) as T;
}

async function expectToolSurface(page: Page, expectedNames: string[]) {
  await expect
    .poll(() => listToolNames(page))
    .toEqual([...expectedNames].sort());
}

function captureBrowserErrors(page: Page): string[] {
  const browserErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") {
      browserErrors.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => browserErrors.push(`pageerror: ${error.message}`));
  return browserErrors;
}

async function expectScopeDisclaimer(page: Page) {
  await expect(
    page.getByText(
      "Demo rights metadata is structured input for workflow authorization; this project does not provide legal advice. Rights updates and publishing are simulated.",
      { exact: true },
    ),
  ).toBeVisible();
}

async function runGoldenDemo(page: Page) {
  const browserErrors = captureBrowserErrors(page);

  await installWebMcpHarness(page);
  await page.goto(CAMPAIGN_PATH);

  const iconHref = await page.locator('link[rel~="icon"]').getAttribute("href");
  expect(iconHref).toMatch(/^\/icon\.svg(?:\?.*)?$/);
  expect((await page.request.get(iconHref!)).ok()).toBe(true);
  await expectScopeDisclaimer(page);

  await expect(page.locator(".topbar-state")).toContainText("DRAFT");
  await expect(page.getByText("WebMCP: available", { exact: true })).toBeVisible();
  await expect(page.getByText("No review manifest", { exact: true })).toBeVisible();
  await expectToolSurface(page, [
    ...ALWAYS_AVAILABLE_TOOLS,
    "prepare_campaign_manifest",
  ]);

  const campaign = await executeTool<{
    campaign: { status: string };
    currentManifest: null;
    publishReceipt: null;
  }>(page, "get_campaign_state");
  expect(campaign).toMatchObject({
    campaign: { status: "DRAFT" },
    currentManifest: null,
    publishReceipt: null,
  });

  const assets = await executeTool<{
    assets: Array<{ id: string; rightsVersion: number }>;
  }>(page, "list_assets");
  expect(assets.assets).toHaveLength(8);
  expect(assets.assets.find((asset) => asset.id === "asset-sakura")).toEqual(
    expect.objectContaining({ rightsVersion: 1 }),
  );

  const inspection = await executeTool<{
    evaluation: { eligible: boolean };
  }>(page, "inspect_asset_rights", { assetId: "asset-sakura" });
  expect(inspection.evaluation.eligible).toBe(true);

  const eligible = await executeTool<{
    assets: Array<{ id: string }>;
  }>(page, "find_eligible_assets");
  expect(eligible.assets.map((asset) => asset.id)).toEqual([
    "asset-sakura",
    "asset-neon",
    "asset-train",
    "asset-market",
  ]);

  await executeTool(page, "prepare_campaign_manifest", {
    assetIds: INITIAL_ASSET_IDS,
  });
  await expect(page.locator(".topbar-state")).toContainText("REVIEW READY");
  await expect(page.getByRole("heading", { name: "3/3 current" })).toBeVisible();
  await expect(page.getByText("manifest-1", { exact: true })).toBeVisible();
  await expectToolSurface(page, ALWAYS_AVAILABLE_TOOLS);

  await page.getByRole("button", { name: "Approve exact manifest" }).click();
  await expect(page.locator(".topbar-state")).toContainText("APPROVED");
  await expect(page.getByText("Publish authority granted", { exact: true })).toBeVisible();
  await expectToolSurface(page, [
    ...ALWAYS_AVAILABLE_TOOLS,
    "publish_approved_campaign_manifest-1",
  ]);

  const withdrawalStartedAt = Date.now();
  await page.getByRole("button", { name: "Simulate rights update" }).click();
  await expect(page.locator(".topbar-state")).toContainText("STALE");
  await expect(page.getByRole("heading", { name: "2/3 current" })).toBeVisible();
  await expect(page.getByText("Publish authority removed", { exact: true })).toBeVisible();
  await expectToolSurface(page, [
    ...ALWAYS_AVAILABLE_TOOLS,
    "inspect_stale_campaign",
    "prepare_campaign_manifest",
  ]);
  expect(Date.now() - withdrawalStartedAt).toBeLessThan(12_000);

  const stale = await executeTool<{
    staleAssetIds: string[];
  }>(page, "inspect_stale_campaign");
  expect(stale.staleAssetIds).toEqual(["asset-sakura"]);

  const replacementCandidates = await executeTool<{
    assets: Array<{ id: string }>;
  }>(page, "find_eligible_assets");
  expect(replacementCandidates.assets.map((asset) => asset.id)).toEqual([
    "asset-neon",
    "asset-train",
    "asset-market",
  ]);

  await executeTool(page, "prepare_campaign_manifest", {
    assetIds: REPLACEMENT_ASSET_IDS,
  });
  await expect(page.locator(".topbar-state")).toContainText("REVIEW READY");
  await expect(page.getByRole("heading", { name: "3/3 current" })).toBeVisible();
  await expect(page.getByText("manifest-2", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Approve exact manifest" }).click();
  await expect(page.locator(".topbar-state")).toContainText("APPROVED");
  await expectToolSurface(page, [
    ...ALWAYS_AVAILABLE_TOOLS,
    "publish_approved_campaign_manifest-2",
  ]);

  const published = await executeTool<{
    receipt: { manifestId: string; publishedAssetIds: string[] };
  }>(page, "publish_approved_campaign_manifest-2");
  expect(published.receipt).toMatchObject({
    manifestId: "manifest-2",
    publishedAssetIds: ["asset-market", "asset-neon", "asset-train"],
  });

  await expect(page.locator(".topbar-state")).toContainText("PUBLISHED");
  await expect(page.getByRole("heading", { name: "Package accepted" })).toBeVisible();
  await expect(page.getByText("Publish authority consumed", { exact: true })).toBeVisible();
  await expectToolSurface(page, [
    ...ALWAYS_AVAILABLE_TOOLS,
    "get_campaign_audit",
    "get_publish_receipt",
  ]);

  const receipt = await executeTool<{
    receipt: { manifestId: string };
  }>(page, "get_publish_receipt");
  expect(receipt.receipt.manifestId).toBe("manifest-2");

  const audit = await executeTool<{
    events: Array<{ actor: string; kind: string }>;
  }>(page, "get_campaign_audit");
  expect(audit.events.map((event) => event.actor)).toEqual(
    expect.arrayContaining(["AGENT", "HUMAN", "SYSTEM"]),
  );
  expect(audit.events.map((event) => event.kind)).toEqual(
    expect.arrayContaining([
      "MANIFEST_PREPARED",
      "MANIFEST_APPROVED",
      "RIGHTS_REVOKED",
      "CAMPAIGN_PUBLISHED",
    ]),
  );

  await page.getByRole("button", { name: "Reset deterministic demo" }).click();
  await expect(page.locator(".topbar-state")).toContainText("DRAFT");
  await expect(page.getByText("No review manifest", { exact: true })).toBeVisible();
  await expect(page.getByText("No agent mutation recorded yet.", { exact: true })).toBeVisible();
  await expectToolSurface(page, [
    ...ALWAYS_AVAILABLE_TOOLS,
    "prepare_campaign_manifest",
  ]);
  expect(browserErrors).toEqual([]);
}

test.describe.serial("JCM golden demo", () => {
  test.beforeEach(async ({ request }) => {
    const response = await request.post("/api/demo/reset", { data: {} });
    expect(response.ok()).toBe(true);
  });

  for (const run of ["baseline", "fresh browser repeat"]) {
    test(`completes the deterministic proof loop from a ${run}`, async ({ page }) => {
      await runGoldenDemo(page);
    });
  }

  test("keeps the complete human workflow usable without WebMCP", async ({ page }) => {
    const browserErrors = captureBrowserErrors(page);
    await page.goto(CAMPAIGN_PATH);

    await expect(page.getByText("WebMCP: unavailable", { exact: true })).toBeVisible();
    await expect(
      page.getByText("WebMCP unavailable in this browser.", { exact: true }),
    ).toBeVisible();
    await expectScopeDisclaimer(page);

    await page.getByRole("button", { name: "Prepare eligible manifest" }).click();
    await expect(page.locator(".topbar-state")).toContainText("REVIEW READY");
    await page.getByRole("button", { name: "Approve exact manifest" }).click();
    await expect(page.locator(".topbar-state")).toContainText("APPROVED");
    await page.getByRole("button", { name: "Simulate rights update" }).click();
    await expect(page.locator(".topbar-state")).toContainText("STALE");
    await page
      .getByRole("button", { name: "Repair with eligible replacement" })
      .click();
    await expect(page.locator(".topbar-state")).toContainText("REVIEW READY");
    await page.getByRole("button", { name: "Approve exact manifest" }).click();
    await expect(page.locator(".topbar-state")).toContainText("APPROVED");
    await page.getByRole("button", { name: "Simulate approved publish" }).click();
    await expect(page.locator(".topbar-state")).toContainText("PUBLISHED");
    await expect(page.getByRole("heading", { name: "Package accepted" })).toBeVisible();

    await page.getByRole("button", { name: "Reset deterministic demo" }).click();
    await expect(page.locator(".topbar-state")).toContainText("DRAFT");
    expect(browserErrors).toEqual([]);
  });

  test("reconstructs Approved, Stale, and Published capability surfaces after refresh", async ({ page }) => {
    const browserErrors = captureBrowserErrors(page);
    await installWebMcpHarness(page);
    await page.goto(CAMPAIGN_PATH);
    await expectToolSurface(page, [
      ...ALWAYS_AVAILABLE_TOOLS,
      "prepare_campaign_manifest",
    ]);

    await executeTool(page, "prepare_campaign_manifest", {
      assetIds: INITIAL_ASSET_IDS,
    });
    await page.getByRole("button", { name: "Approve exact manifest" }).click();
    await expect(page.locator(".topbar-state")).toContainText("APPROVED");
    await page.reload();
    await expect(page.locator(".topbar-state")).toContainText("APPROVED");
    await expectToolSurface(page, [
      ...ALWAYS_AVAILABLE_TOOLS,
      "publish_approved_campaign_manifest-1",
    ]);

    await page.getByRole("button", { name: "Simulate rights update" }).click();
    await expect(page.locator(".topbar-state")).toContainText("STALE");
    await page.reload();
    await expect(page.locator(".topbar-state")).toContainText("STALE");
    await expectToolSurface(page, [
      ...ALWAYS_AVAILABLE_TOOLS,
      "inspect_stale_campaign",
      "prepare_campaign_manifest",
    ]);

    await executeTool(page, "prepare_campaign_manifest", {
      assetIds: REPLACEMENT_ASSET_IDS,
    });
    await page.getByRole("button", { name: "Approve exact manifest" }).click();
    await expect(page.locator(".topbar-state")).toContainText("APPROVED");
    await executeTool(page, "publish_approved_campaign_manifest-2");
    await expect(page.locator(".topbar-state")).toContainText("PUBLISHED");
    await page.reload();
    await expect(page.locator(".topbar-state")).toContainText("PUBLISHED");
    await expectToolSurface(page, [
      ...ALWAYS_AVAILABLE_TOOLS,
      "get_campaign_audit",
      "get_publish_receipt",
    ]);

    await page.getByRole("button", { name: "Reset deterministic demo" }).click();
    await expect(page.locator(".topbar-state")).toContainText("DRAFT");
    expect(browserErrors).toEqual([]);
  });
});
