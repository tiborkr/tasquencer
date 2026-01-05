import { setup, Builder } from "../setup.test";
import { describe, it, vi, beforeEach, afterEach, expect } from "vitest";
import { internal, components } from "../../../../convex/_generated/api";

import { registerVersionManagersForTesting } from "../helpers/versionManager";
import { waitForFlush } from "./helpers.test";

const WORKFLOW_VERSION_NAME = "v0";

const simpleWorkflow = Builder.workflow("snapshotRetryTest")
  .startCondition("start")
  .task(
    "t1",
    Builder.noOpTask.withActivities({
      onEnabled: async ({ workItem }) => {
        await workItem.initialize();
      },
      // Completion happens via test mutations
    })
  )
  .endCondition("end")
  .connectCondition("start", (to) => to.task("t1"))
  .connectTask("t1", (to) => to.condition("end"));

let cleanupVersionManagers: () => void;

beforeEach(() => {
  vi.useFakeTimers();
  cleanupVersionManagers = registerVersionManagersForTesting({
    workflowName: "snapshotRetryTest",
    versionName: WORKFLOW_VERSION_NAME,
    builder: simpleWorkflow,
  });
});

afterEach(() => {
  vi.useRealTimers();
  cleanupVersionManagers();
});

describe("snapshot scheduling retry", () => {
  it("reschedules snapshot when init span is not yet flushed", async () => {
    const t = setup();

    // Initialize workflow; on completion the engine schedules a snapshot
    const workflowId = await t.mutation(
      internal.testing.tasquencer.initializeRootWorkflow,
      {
        workflowName: "snapshotRetryTest",
        workflowVersionName: WORKFLOW_VERSION_NAME,
      }
    );

    const workItems = await t.query(
      internal.testing.tasquencer.getWorkflowTaskWorkItems,
      {
        workflowId,
        taskName: "t1",
      }
    );

    await t.mutation(internal.testing.tasquencer.startWorkItem, {
      workflowName: "snapshotRetryTest",
      workflowVersionName: WORKFLOW_VERSION_NAME,
      workItemId: workItems[0]._id,
    });

    await t.mutation(internal.testing.tasquencer.completeWorkItem, {
      workflowName: "snapshotRetryTest",
      workflowVersionName: WORKFLOW_VERSION_NAME,
      workItemId: workItems[0]._id,
    });

    // First scheduled snapshot may run before init span is flushed; retry should succeed
    await waitForFlush(t);
    await t.finishInProgressScheduledFunctions();
    await vi.advanceTimersByTimeAsync(100);
    await t.finishInProgressScheduledFunctions();

    const snapshots = await t.query(
      components.tasquencerAudit.api.getWorkflowSnapshots,
      {
        traceId: workflowId,
      }
    );

    expect(snapshots.length).toBeGreaterThan(0);
    snapshots.forEach((s) => {
      expect(s.state.workflow.state).toBe("completed");
    });
  });
});
