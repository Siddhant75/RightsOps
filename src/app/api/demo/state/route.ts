import { NextResponse } from "next/server";

import { getWorkflowRepository } from "@/server/db/client";
import { DemoService } from "@/server/services/demo-service";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const state = await new DemoService(getWorkflowRepository()).getState();
    return NextResponse.json(state);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
