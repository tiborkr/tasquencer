import { setup, Builder } from "./setup.test";
import { it, vi, beforeEach, afterEach, expect } from "vitest";
import { internal } from "../../_generated/api";

import { versionManagerFor } from "../versionManager";
import schema from "../../schema";
import { internalVersionManagerRegistry } from "../../testing/tasquencer";

const WORKFLOW_VERSION_NAME = "v0";

const multiItemTaskWorkflow = Builder.workflow("task-multi-items")
  .startCondition("start")
  .task(
    "multiWorkItem",
    Builder.task(Builder.noOpWorkItem).withActivities({
      onEnabled: async ({
        workItem,
        mutationCtx,
        registerScheduled,
        parent,
        task,
      }) => {
        // Initialize two work items immediately.
        await workItem.initialize();
        await workItem.initialize();

        // Schedule another initialization that should be canceled if the task fails.
        await registerScheduled(
          mutationCtx.scheduler.runAfter(
            0,
            internal.testing.tasquencer.initializeWorkItem,
            {
              workflowName: "task-multi-items",
              workflowVersionName: WORKFLOW_VERSION_NAME,
              target: {
                path: workItem.path,
                parentWorkflowId: parent.workflow.id,
                parentTaskName: task.name,
              },
              payload: undefined,
            }
          )
        );
      },
    })
  )
  .endCondition("end")
  .connectCondition("start", (to) => to.task("multiWorkItem"))
  .connectTask("multiWorkItem", (to) => to.condition("end"));

const multiItemTaskVersionManager = versionManagerFor("task-multi-items")
  .registerVersion(WORKFLOW_VERSION_NAME, multiItemTaskWorkflow)
  .build();

beforeEach(() => {
  vi.useFakeTimers();
  internalVersionManagerRegistry.registerVersionManager(
    multiItemTaskVersionManager
  );
});

afterEach(() => {
  vi.useRealTimers();
  internalVersionManagerRegistry.unregisterVersionManager(
    multiItemTaskVersionManager
  );
});

it("cancels non-finalized work items and scheduled initializations when the task fails", async () => {
  const t = setup();

  const workflowId = await t.mutation(
    internal.testing.tasquencer.initializeRootWorkflow,
    {
      workflowName: "task-multi-items",
      workflowVersionName: WORKFLOW_VERSION_NAME,
    }
  );

  const workItems = await t.query(
    internal.testing.tasquencer.getWorkflowTaskWorkItems,
    {
      workflowId,
      taskName: "multiWorkItem",
    }
  );

  expect(workItems).toHaveLength(2);

  // Start and fail the first work item to fail the task.
  await t.mutation(internal.testing.tasquencer.startWorkItem, {
    workflowName: "task-multi-items",
    workflowVersionName: WORKFLOW_VERSION_NAME,
    workItemId: workItems[0]._id,
  });

  await t.mutation(internal.testing.tasquencer.failWorkItem, {
    workflowName: "task-multi-items",
    workflowVersionName: WORKFLOW_VERSION_NAME,
    workItemId: workItems[0]._id,
  });

  // Flush any scheduled functions; the scheduled initialization should have been canceled.
  await t.finishAllScheduledFunctions(vi.runAllTimersAsync);

  const workItemsAfter = await t.query(
    internal.testing.tasquencer.getWorkflowTaskWorkItems,
    {
      workflowId,
      taskName: "multiWorkItem",
    }
  );

  expect(workItemsAfter).toHaveLength(2);

  const states = workItemsAfter.map((w) => w.state).sort();
  expect(states).toEqual(["canceled", "failed"]);
});
