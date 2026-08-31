import { NextResponse } from "next/server";
import { z } from "zod";

import { getWorkflowRepository } from "@/server/db/client";
import { CampaignService } from "@/server/services/campaign-service";

const manifestInput = z.object({
  assetIds: z.array(z.string().min(1)).min(1),
}).strict();

interface RouteContext {
  params: Promise<{ campaignId: string }>;
}

export async function POST(request: Request, context: RouteContext) {
  const parsed = manifestInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid manifest request", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const { campaignId } = await context.params;
    const manifest = await new CampaignService(
      getWorkflowRepository(),
    ).prepareManifest(campaignId, parsed.data.assetIds);
    return NextResponse.json(manifest, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 409 },
    );
  }
}
