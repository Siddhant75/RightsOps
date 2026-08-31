import { NextResponse } from "next/server";

import { getWorkflowRepository } from "@/server/db/client";
import { acceptsOnlyEmptyObject } from "@/server/http/empty-input";
import {
  PublishService,
  WorkflowConflictError,
} from "@/server/services/publish-service";

interface RouteContext {
  params: Promise<{ manifestId: string }>;
}

export async function POST(request: Request, context: RouteContext) {
  if (!(await acceptsOnlyEmptyObject(request))) {
    return NextResponse.json(
      { error: "Publish accepts only an empty object" },
      { status: 400 },
    );
  }

  try {
    const { manifestId } = await context.params;
    const receipt = await new PublishService(
      getWorkflowRepository(),
    ).publishApprovedManifest(manifestId);
    return NextResponse.json(receipt, { status: 201 });
  } catch (error) {
    const status = error instanceof WorkflowConflictError ? error.status : 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status },
    );
  }
}
