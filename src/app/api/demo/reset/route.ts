import { NextResponse } from "next/server";

import { getWorkflowRepository } from "@/server/db/client";
import { acceptsOnlyEmptyObject } from "@/server/http/empty-input";
import { DemoService } from "@/server/services/demo-service";

export async function POST(request: Request) {
  if (!(await acceptsOnlyEmptyObject(request))) {
    return NextResponse.json(
      { error: "Reset accepts only an empty object" },
      { status: 400 },
    );
  }

  try {
    const state = await new DemoService(getWorkflowRepository()).reset();
    return NextResponse.json(state);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
