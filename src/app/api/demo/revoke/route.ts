import { NextResponse } from "next/server";
import { z } from "zod";

import { getWorkflowRepository } from "@/server/db/client";
import { REVOCABLE_ASSET_ID } from "@/server/seed/demo-scenario";
import { DemoService } from "@/server/services/demo-service";

const revokeInput = z.object({
  assetId: z.string().min(1).optional(),
}).strict();

export async function POST(request: Request) {
  const parsed = revokeInput.safeParse(
    await request.json().catch(() => ({})),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid revoke request", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const asset = await new DemoService(
      getWorkflowRepository(),
    ).revokeAssetRights(parsed.data.assetId ?? REVOCABLE_ASSET_ID);
    return NextResponse.json(asset);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 409 },
    );
  }
}
