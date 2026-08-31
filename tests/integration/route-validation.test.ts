import { describe, expect, it } from "vitest";

import { POST as prepareManifest } from "@/app/api/campaigns/[campaignId]/manifest/route";
import { POST as resetDemo } from "@/app/api/demo/reset/route";
import { POST as revokeRights } from "@/app/api/demo/revoke/route";
import { POST as approveManifest } from "@/app/api/manifests/[manifestId]/approve/route";
import { POST as publishManifest } from "@/app/api/manifests/[manifestId]/publish/route";

function decisionBearingRequest() {
  return new Request("http://localhost/api/manifests/manifest-1/action", {
    body: JSON.stringify({ assetIds: ["asset-a"] }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
}

const context = {
  params: Promise.resolve({ manifestId: "manifest-1" }),
};

function jsonRequest(path: string, body: unknown) {
  return new Request(`http://localhost${path}`, {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
}

describe("manifest mutation route validation", () => {
  it("rejects decision-bearing approval input before accessing persistence", async () => {
    const response = await approveManifest(decisionBearingRequest(), context);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Approval accepts only an empty object",
    });
  });

  it("rejects decision-bearing publish input before accessing persistence", async () => {
    const response = await publishManifest(decisionBearingRequest(), context);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Publish accepts only an empty object",
    });
  });

  it("rejects reset input before accessing persistence", async () => {
    const response = await resetDemo(
      jsonRequest("/api/demo/reset", { campaignId: "another-campaign" }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Reset accepts only an empty object",
    });
  });

  it("rejects unknown revoke fields before accessing persistence", async () => {
    const response = await revokeRights(
      jsonRequest("/api/demo/revoke", { approved: true }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Invalid revoke request",
    });
  });

  it("rejects unknown manifest fields before accessing persistence", async () => {
    const response = await prepareManifest(
      jsonRequest("/api/campaigns/campaign-1/manifest", {
        assetIds: ["asset-a"],
        territory: "US",
      }),
      { params: Promise.resolve({ campaignId: "campaign-1" }) },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Invalid manifest request",
    });
  });
});
