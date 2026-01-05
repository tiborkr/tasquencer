import { setup, Builder } from "../setup.test";
import { describe, it, vi, beforeEach, afterEach } from "vitest";
import { internal, components } from "../../../_generated/api";

import { versionManagerFor } from "../../versionManager";
import schema from "../../../schema";
import { internalVersionManagerRegistry } from "../../../testing/tasquencer";
import { waitForFlush } from "../audit/helpers.test";

// Workflow: task1 -> task2 -> task3
// All tasks should remain "completed" in state reconstruction after they finish

const WORKFLOW_VERSION_NAME = "v0";

const sequentialWorkflow = Builder.workflow("taskStateRetention")
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
  .task(
    "task3",
    Builder.noOpTask.withActivities({
      onEnabled: async ({ workItem }) => {
        await workItem.initialize();
      },
    })
  )
  .endCondition("end")
  .connectCondition("start", (to) => to.task("task1"))
  .connectTask("task1", (to) => to.task("task2"))
  .connectTask("task2", (to) => to.task("task3"))
  .connectTask("task3", (to) => to.condition("end"));

const taskStateRetentionVersionManager = versionManagerFor("taskStateRetention")
  .registerVersion(WORKFLOW_VERSION_NAME, sequentialWorkflow)
  .build();

beforeEach(() => {
  vi.useFakeTimers();
  internalVersionManagerRegistry.registerVersionManager(
    taskStateRetentionVersionManager
  );
});

afterEach(() => {
  vi.useRealTimers();
  internalVersionManagerRegistry.unregisterVersionManager(
    taskStateRetentionVersionManager
  );
});

describe("Task State Retention", () => {
  it("tasks should retain completed state after subsequent tasks complete", async ({
    expect,
  }) => {
    const t = setup();

    const workflowId = await t.mutation(
      internal.testing.tasquencer.initializeRootWorkflow,
      {
        workflowName: "taskStateRetention",
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
      workflowName: "taskStateRetention",
      workItemId: task1WorkItems[0]._id,
      workflowVersionName: WORKFLOW_VERSION_NAME,
    });
    vi.advanceTimersByTime(100);

    await t.mutation(internal.testing.tasquencer.completeWorkItem, {
      workflowName: "taskStateRetention",
      workItemId: task1WorkItems[0]._id,
      workflowVersionName: WORKFLOW_VERSION_NAME,
    });
    await waitForFlush(t);
    vi.advanceTimersByTime(100);

    // Checkpoint 1: After task1 completes
    const state1 = await t.query(
      components.tasquencerAudit.api.getWorkflowStateAtTime,
      {
        traceId: workflowId,
        timestamp: Date.now(),
      }
    );

    expect(state1?.tasks["task1"].state).toBe("completed");
    expect(state1?.tasks["task2"].state).toBe("enabled");
    // task3 may not exist yet in state if it hasn't been touched
    // expect(state1.tasks['task3']?.state).toBe('disabled')

    // Complete task2
    const task2WorkItems = await t.query(
      internal.testing.tasquencer.getWorkflowTaskWorkItems,
      {
        workflowId,
        taskName: "task2",
      }
    );

    await t.mutation(internal.testing.tasquencer.startWorkItem, {
      workflowName: "taskStateRetention",
      workItemId: task2WorkItems[0]._id,
      workflowVersionName: WORKFLOW_VERSION_NAME,
    });
    vi.advanceTimersByTime(100);

    await t.mutation(internal.testing.tasquencer.completeWorkItem, {
      workflowName: "taskStateRetention",
      workItemId: task2WorkItems[0]._id,
      workflowVersionName: WORKFLOW_VERSION_NAME,
    });
    await waitForFlush(t);
    vi.advanceTimersByTime(100);

    // Checkpoint 2: After task2 completes - task1 should STILL be completed
    const state2 = await t.query(
      components.tasquencerAudit.api.getWorkflowStateAtTime,
      {
        traceId: workflowId,
        timestamp: Date.now(),
      }
    );

    expect(state2?.tasks["task1"].state).toBe("completed"); // ✅ Should STILL be completed
    expect(state2?.tasks["task2"].state).toBe("completed");
    expect(state2?.tasks["task3"].state).toBe("enabled");

    // Complete task3
    const task3WorkItems = await t.query(
      internal.testing.tasquencer.getWorkflowTaskWorkItems,
      {
        workflowId,
        taskName: "task3",
      }
    );

    await t.mutation(internal.testing.tasquencer.startWorkItem, {
      workflowName: "taskStateRetention",
      workItemId: task3WorkItems[0]._id,
      workflowVersionName: WORKFLOW_VERSION_NAME,
    });
    vi.advanceTimersByTime(100);

    await t.mutation(internal.testing.tasquencer.completeWorkItem, {
      workflowName: "taskStateRetention",
      workItemId: task3WorkItems[0]._id,
      workflowVersionName: WORKFLOW_VERSION_NAME,
    });
    await waitForFlush(t);
    vi.advanceTimersByTime(100);

    // Final state: ALL tasks should be completed
    const finalState = await t.query(
      components.tasquencerAudit.api.getWorkflowStateAtTime,
      {
        traceId: workflowId,
        timestamp: Date.now(),
      }
    );

    expect(finalState?.tasks["task1"].state).toBe("completed"); // ✅ Should STILL be completed
    expect(finalState?.tasks["task2"].state).toBe("completed"); // ✅ Should STILL be completed
    expect(finalState?.tasks["task3"].state).toBe("completed");
    expect(finalState?.workflow.state).toBe("completed");
  });

  it("completed tasks should be visible at any timestamp after completion", async ({
    expect,
  }) => {
    const t = setup();

    const workflowId = await t.mutation(
      internal.testing.tasquencer.initializeRootWorkflow,
      {
        workflowName: "taskStateRetention",
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
      workflowName: "taskStateRetention",
      workItemId: task1WorkItems[0]._id,
      workflowVersionName: WORKFLOW_VERSION_NAME,
    });
    vi.advanceTimersByTime(100);

    await t.mutation(internal.testing.tasquencer.completeWorkItem, {
      workflowName: "taskStateRetention",
      workItemId: task1WorkItems[0]._id,
      workflowVersionName: WORKFLOW_VERSION_NAME,
    });
    await waitForFlush(t);
    vi.advanceTimersByTime(100);

    const task1CompletedTimestamp = Date.now();

    // Complete task2
    const task2WorkItems = await t.query(
      internal.testing.tasquencer.getWorkflowTaskWorkItems,
      {
        workflowId,
        taskName: "task2",
      }
    );

    await t.mutation(internal.testing.tasquencer.startWorkItem, {
      workflowName: "taskStateRetention",
      workItemId: task2WorkItems[0]._id,
      workflowVersionName: WORKFLOW_VERSION_NAME,
    });
    vi.advanceTimersByTime(100);

    await t.mutation(internal.testing.tasquencer.completeWorkItem, {
      workflowName: "taskStateRetention",
      workItemId: task2WorkItems[0]._id,
      workflowVersionName: WORKFLOW_VERSION_NAME,
    });
    await waitForFlush(t);
    vi.advanceTimersByTime(100);

    const task2CompletedTimestamp = Date.now();

    // Query at different timestamps and verify task1 is always completed
    const stateAtTask1Complete = await t.query(
      components.tasquencerAudit.api.getWorkflowStateAtTime,
      {
        traceId: workflowId,
        timestamp: task1CompletedTimestamp,
      }
    );

    const stateAtTask2Complete = await t.query(
      components.tasquencerAudit.api.getWorkflowStateAtTime,
      {
        traceId: workflowId,
        timestamp: task2CompletedTimestamp,
      }
    );

    // At task1 completion timestamp
    expect(stateAtTask1Complete?.tasks["task1"].state).toBe("completed");

    // At task2 completion timestamp - task1 should STILL be completed
    expect(stateAtTask2Complete?.tasks["task1"].state).toBe("completed");
    expect(stateAtTask2Complete?.tasks["task2"].state).toBe("completed");
  });
});
