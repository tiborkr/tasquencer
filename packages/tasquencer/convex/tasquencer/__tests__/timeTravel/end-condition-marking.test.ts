import { setup, Builder } from "../setup.test";
import { describe, it, vi, beforeEach, afterEach } from "vitest";
import { internal, components } from "../../../_generated/api";

import { versionManagerFor } from "../../versionManager";
import { internalVersionManagerRegistry } from "../../../testing/tasquencer";
import { waitForFlush } from "../audit/helpers.test";

const WORKFLOW_VERSION_NAME = "v0";

const simpleWorkflow = Builder.workflow("endConditionTest")
  .startCondition("start")
  .task(
    "task1",
    Builder.noOpTask.withActivities({
      onEnabled: async ({ workItem }) => {
        await workItem.initialize();
      },
    })
  )
  .task(
    "task2",
    Builder.noOpTask.withActivities({
      onEnabled: async ({ workItem }) => {
        await workItem.initialize();
      },
    })
  )
  .endCondition("end")
  .connectCondition("start", (to) => to.task("task1"))
  .connectTask("task1", (to) => to.task("task2"))
  .connectTask("task2", (to) => to.condition("end"));

const endConditionVersionManager = versionManagerFor("endConditionTest")
  .registerVersion(WORKFLOW_VERSION_NAME, simpleWorkflow)
  .build();

beforeEach(() => {
  vi.useFakeTimers();
  internalVersionManagerRegistry.registerVersionManager(
    endConditionVersionManager
  );
});

afterEach(() => {
  vi.useRealTimers();
  internalVersionManagerRegistry.unregisterVersionManager(
    endConditionVersionManager
  );
});

describe("End Condition Marking", () => {
  it("end condition should have marking 0 before workflow completes", async ({
    expect,
  }) => {
    const t = setup();

    const workflowId = await t.mutation(
      internal.testing.tasquencer.initializeRootWorkflow,
      {
        workflowName: "endConditionTest",
        workflowVersionName: WORKFLOW_VERSION_NAME,
      }
    );

    await waitForFlush(t);

    // Get all spans
    const spans = await t.query(components.tasquencerAudit.api.getTraceSpans, {
      traceId: workflowId,
    });

    // Check for end condition spans - should be NONE yet
    const endConditionSpans = spans.filter(
      (s: any) => s.operationType === "condition" && s.resourceName === "end"
    );

    expect(endConditionSpans.length).toBe(0);
  });

  it("end condition should get increment span when final task completes", async ({
    expect,
  }) => {
    const t = setup();

    const workflowId = await t.mutation(
      internal.testing.tasquencer.initializeRootWorkflow,
      {
        workflowName: "endConditionTest",
        workflowVersionName: WORKFLOW_VERSION_NAME,
      }
    );

    await waitForFlush(t);

    // Complete task1
    const task1WorkItems = await t.query(
      internal.testing.tasquencer.getWorkflowTaskWorkItems,
      {
        workflowId,
        taskName: "task1",
      }
    );

    await t.mutation(internal.testing.tasquencer.startWorkItem, {
      workflowName: "endConditionTest",
      workItemId: task1WorkItems[0]._id,
      workflowVersionName: WORKFLOW_VERSION_NAME,
    });

    await t.mutation(internal.testing.tasquencer.completeWorkItem, {
      workflowName: "endConditionTest",
      workItemId: task1WorkItems[0]._id,
      workflowVersionName: WORKFLOW_VERSION_NAME,
    });

    await waitForFlush(t);

    // Complete task2 (final task)
    const task2WorkItems = await t.query(
      internal.testing.tasquencer.getWorkflowTaskWorkItems,
      {
        workflowId,
        taskName: "task2",
      }
    );

    await t.mutation(internal.testing.tasquencer.startWorkItem, {
      workflowName: "endConditionTest",
      workItemId: task2WorkItems[0]._id,
      workflowVersionName: WORKFLOW_VERSION_NAME,
    });

    await t.mutation(internal.testing.tasquencer.completeWorkItem, {
      workflowName: "endConditionTest",
      workItemId: task2WorkItems[0]._id,
      workflowVersionName: WORKFLOW_VERSION_NAME,
    });

    await waitForFlush(t);

    // Get all spans
    const spans = await t.query(components.tasquencerAudit.api.getTraceSpans, {
      traceId: workflowId,
    });

    // Check for end condition increment span
    const endConditionSpans = spans.filter(
      (s: any) =>
        s.operationType === "condition" &&
        s.resourceName === "end" &&
        s.operation === "Condition.incrementMarking"
    );

    expect(endConditionSpans.length).toBe(1);

    const endSpan = endConditionSpans[0];
    expect(endSpan.attributes).toMatchObject({
      oldMarking: 0,
      newMarking: 1,
    });
  });

  it("reconstructed state should show end condition with marking 1 after completion", async ({
    expect,
  }) => {
    const t = setup();

    const workflowId = await t.mutation(
      internal.testing.tasquencer.initializeRootWorkflow,
      {
        workflowName: "endConditionTest",
        workflowVersionName: WORKFLOW_VERSION_NAME,
      }
    );

    await waitForFlush(t);
    vi.advanceTimersByTime(100);

    // Complete task1
    const task1WorkItems = await t.query(
      internal.testing.tasquencer.getWorkflowTaskWorkItems,
      {
        workflowId,
        taskName: "task1",
      }
    );

    await t.mutation(internal.testing.tasquencer.startWorkItem, {
      workflowName: "endConditionTest",
      workItemId: task1WorkItems[0]._id,
      workflowVersionName: WORKFLOW_VERSION_NAME,
    });

    vi.advanceTimersByTime(100);

    await t.mutation(internal.testing.tasquencer.completeWorkItem, {
      workflowName: "endConditionTest",
      workItemId: task1WorkItems[0]._id,
      workflowVersionName: WORKFLOW_VERSION_NAME,
    });

    await waitForFlush(t);
    vi.advanceTimersByTime(100);

    // Complete task2 (final task)
    const task2WorkItems = await t.query(
      internal.testing.tasquencer.getWorkflowTaskWorkItems,
      {
        workflowId,
        taskName: "task2",
      }
    );

    await t.mutation(internal.testing.tasquencer.startWorkItem, {
      workflowName: "endConditionTest",
      workItemId: task2WorkItems[0]._id,
      workflowVersionName: WORKFLOW_VERSION_NAME,
    });

    vi.advanceTimersByTime(100);

    await t.mutation(internal.testing.tasquencer.completeWorkItem, {
      workflowName: "endConditionTest",
      workItemId: task2WorkItems[0]._id,
      workflowVersionName: WORKFLOW_VERSION_NAME,
    });

    await waitForFlush(t);
    vi.advanceTimersByTime(100);

    // Get final timestamp (after all operations)
    const finalTimestamp = Date.now();

    // Reconstruct state at final timestamp
    const state = await t.query(
      components.tasquencerAudit.api.getWorkflowStateAtTime,
      {
        traceId: workflowId,
        timestamp: finalTimestamp,
      }
    );

    // The end condition SHOULD exist with marking 1
    expect(state?.conditions["end"]).toBeDefined();
    expect(state?.conditions["end"].marking).toBe(1);

    // Workflow should be completed
    expect(state?.workflow.state).toBe("completed");

    // All other conditions should be 0
    expect(state?.conditions["start"].marking).toBe(0);

    // Tasks should be completed
    expect(state?.tasks["task1"].state).toBe("completed");
    expect(state?.tasks["task2"].state).toBe("completed");
  });

  it("end condition should appear at exact timestamp when final task completes", async ({
    expect,
  }) => {
    const t = setup();

    const workflowId = await t.mutation(
      internal.testing.tasquencer.initializeRootWorkflow,
      {
        workflowName: "endConditionTest",
        workflowVersionName: WORKFLOW_VERSION_NAME,
      }
    );

    await waitForFlush(t);
    vi.advanceTimersByTime(100);

    // Complete task1
    const task1WorkItems = await t.query(
      internal.testing.tasquencer.getWorkflowTaskWorkItems,
      {
        workflowId,
        taskName: "task1",
      }
    );

    await t.mutation(internal.testing.tasquencer.startWorkItem, {
      workflowName: "endConditionTest",
      workItemId: task1WorkItems[0]._id,
      workflowVersionName: WORKFLOW_VERSION_NAME,
    });
    vi.advanceTimersByTime(100);

    await t.mutation(internal.testing.tasquencer.completeWorkItem, {
      workflowName: "endConditionTest",
      workItemId: task1WorkItems[0]._id,
      workflowVersionName: WORKFLOW_VERSION_NAME,
    });
    await waitForFlush(t);
    vi.advanceTimersByTime(100);

    // Complete task2 (final task) - capture timestamp right before
    const task2WorkItems = await t.query(
      internal.testing.tasquencer.getWorkflowTaskWorkItems,
      {
        workflowId,
        taskName: "task2",
      }
    );

    await t.mutation(internal.testing.tasquencer.startWorkItem, {
      workflowName: "endConditionTest",
      workItemId: task2WorkItems[0]._id,
      workflowVersionName: WORKFLOW_VERSION_NAME,
    });
    vi.advanceTimersByTime(100);

    const beforeCompleteTimestamp = Date.now();

    await t.mutation(internal.testing.tasquencer.completeWorkItem, {
      workflowName: "endConditionTest",
      workItemId: task2WorkItems[0]._id,
      workflowVersionName: WORKFLOW_VERSION_NAME,
    });
    await waitForFlush(t);

    const afterCompleteTimestamp = Date.now();

    // State BEFORE task2 completes - end should NOT exist or be 0
    const stateBefore = await t.query(
      components.tasquencerAudit.api.getWorkflowStateAtTime,
      {
        traceId: workflowId,
        timestamp: Math.max(0, beforeCompleteTimestamp - 1),
      }
    );

    // State AFTER task2 completes - end should exist with marking 1
    const stateAfter = await t.query(
      components.tasquencerAudit.api.getWorkflowStateAtTime,
      {
        traceId: workflowId,
        timestamp: afterCompleteTimestamp,
      }
    );

    // Before: end condition might not exist yet
    if (stateBefore?.conditions["end"]) {
      expect(stateBefore.conditions["end"].marking).toBe(0);
    }

    // After: end condition MUST exist with marking 1
    expect(stateAfter?.conditions["end"]).toBeDefined();
    expect(stateAfter?.conditions["end"].marking).toBe(1);
  });
});
