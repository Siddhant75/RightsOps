import { describe, expect, it } from "vitest";

import { createApprovedTool } from "../../src/app/webmcp-spike/page";

describe("approved spike tool", () => {
  it("executes when a target client omits callback options", async () => {
    let state = { approvalCycle: 1, approved: true, executions: 0 };
    const tool = createApprovedTool(
      () => {
        state = { ...state, executions: state.executions + 1 };
        return state;
      },
      () => state,
    );

    await expect(tool.execute({}, undefined as never)).resolves.toBe(
      JSON.stringify({
        approvalCycle: 1,
        executions: 1,
        status: "approved spike executed",
      }),
    );
    expect(state.executions).toBe(1);
  });

  it("does not execute when the target supplies an aborted signal", async () => {
    let executions = 0;
    const controller = new AbortController();
    controller.abort();
    const tool = createApprovedTool(
      () => {
        executions += 1;
        return { approvalCycle: 1, approved: true, executions };
      },
      () => ({ approvalCycle: 1, approved: true, executions }),
    );

    await expect(
      tool.execute({}, { signal: controller.signal }),
    ).rejects.toThrow("The approved spike execution was cancelled.");
    expect(executions).toBe(0);
  });
});
