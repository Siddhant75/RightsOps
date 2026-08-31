import { NextResponse } from "next/server";

import { getWorkflowRepository } from "@/server/db/client";
import { acceptsOnlyEmptyObject } from "@/server/http/empty-input";
import { ApprovalService } from "@/server/services/approval-service";

interface RouteContext {
  params: Promise<{ manifestId: string }>;
}

export async function POST(request: Request, context: RouteContext) {
  if (!(await acceptsOnlyEmptyObject(request))) {
    return NextResponse.json(
      { error: "Approval accepts only an empty object" },
      { status: 400 },
    );
  }

  try {
    const { manifestId } = await context.params;
    const manifest = await new ApprovalService(
      getWorkflowRepository(),
    ).approveManifest(manifestId);
    return NextResponse.json(manifest);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 409 },
    );
  }
}
