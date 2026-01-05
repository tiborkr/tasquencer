import { setup, Builder } from "./setup.test";
import { it, vi, beforeEach, afterEach } from "vitest";
import { internal } from "../../../convex/_generated/api";

import schema from "../../schema";
import { registerVersionManagersForTesting } from "./helpers/versionManager";

const WORKFLOW_VERSION_NAME = "v0";

const workflowDefinition = Builder.workflow("cancellationSemantics")
  .startCondition("start")
  .task(
    "t1",
    Builder.noOpTask.withActivities({
      onEnabled: async ({ workItem }) => {
        await workItem.initialize();
        await workItem.initialize();
      },
    })
  )
  .endCondition("end")
  .connectCondition("start", (to) => to.task("t1"))
  .connectTask("t1", (to) => to.condition("end"));

let cleanupVersionManagers: () => void;

beforeEach(() => {
  vi.useFakeTimers();
  cleanupVersionManagers = registerVersionManagersForTesting({
    workflowName: "cancellationSemantics",
    versionName: WORKFLOW_VERSION_NAME,
    builder: workflowDefinition,
  });
});

afterEach(() => {
  vi.useRealTimers();
  cleanupVersionManagers();
});

it("demonstrates new cancellation semantics - cancellation does not bubble up", async ({
  expect,
}) => {
  const t = setup();

  const id = await t.mutation(
    internal.testing.tasquencer.initializeRootWorkflow,
    {
      workflowName: "cancellationSemantics",
      workflowVersionName: WORKFLOW_VERSION_NAME,
    }
  );

  expect(id).toBeDefined();

  // Get the two work items
  const workItems = await t.query(
    internal.testing.tasquencer.getWorkflowTaskWorkItems,
    {
      workflowId: id,
      taskName: "t1",
    }
  );
  expect(workItems.length).toBe(2);
  expect(workItems[0].state).toBe("initialized");
  expect(workItems[1].state).toBe("initialized");

  // Start both work items
  await t.mutation(internal.testing.tasquencer.startWorkItem, {
    workflowName: "cancellationSemantics",
    workItemId: workItems[0]._id,
    workflowVersionName: WORKFLOW_VERSION_NAME,
  });
  await t.mutation(internal.testing.tasquencer.startWorkItem, {
    workflowName: "cancellationSemantics",
    workItemId: workItems[1]._id,
    workflowVersionName: WORKFLOW_VERSION_NAME,
  });

  // Cancel one work item
  await t.mutation(internal.testing.tasquencer.cancelWorkItem, {
    workflowName: "cancellationSemantics",
    workItemId: workItems[0]._id,
    workflowVersionName: WORKFLOW_VERSION_NAME,
  });

  // Verify the work items state after cancellation
  const workItemsAfterCancel = await t.query(
    internal.testing.tasquencer.getWorkflowTaskWorkItems,
    {
      workflowId: id,
      taskName: "t1",
    }
  );

  const canceledWorkItem = workItemsAfterCancel.find(
    (wi) => wi._id === workItems[0]._id
  );
  const stillStartedWorkItem = workItemsAfterCancel.find(
    (wi) => wi._id === workItems[1]._id
  );

  expect(canceledWorkItem?.state).toBe("canceled");
  expect(stillStartedWorkItem?.state).toBe("started");

  // Verify the task is still started (NOT canceled - cancellation does not bubble up)
  const task = await t.query(internal.testing.tasquencer.getWorkflowTasks, {
    workflowId: id,
  });
  expect(task[0].state).toBe("started");

  // Complete the second work item
  await t.mutation(internal.testing.tasquencer.completeWorkItem, {
    workflowName: "cancellationSemantics",
    workItemId: workItems[1]._id,
    workflowVersionName: WORKFLOW_VERSION_NAME,
  });

  // Now the task should complete (default policy completes when all work items finalized)
  const taskAfter = await t.query(
    internal.testing.tasquencer.getWorkflowTasks,
    {
      workflowId: id,
    }
  );
  expect(taskAfter[0].state).toBe("completed");
});

it("demonstrates workflow cancellation bypasses policy", async ({ expect }) => {
  const t = setup();

  const id = await t.mutation(
    internal.testing.tasquencer.initializeRootWorkflow,
    {
      workflowName: "cancellationSemantics",
      workflowVersionName: WORKFLOW_VERSION_NAME,
    }
  );

  const workItems = await t.query(
    internal.testing.tasquencer.getWorkflowTaskWorkItems,
    {
      workflowId: id,
      taskName: "t1",
    }
  );
  expect(workItems.length).toBe(2);

  // Start one work item
  await t.mutation(internal.testing.tasquencer.startWorkItem, {
    workflowName: "cancellationSemantics",
    workItemId: workItems[0]._id,
    workflowVersionName: WORKFLOW_VERSION_NAME,
  });

  // Cancel the entire workflow
  await t.mutation(internal.testing.tasquencer.cancelRootWorkflow, {
    workflowName: "cancellationSemantics",
    workflowId: id,
    workflowVersionName: WORKFLOW_VERSION_NAME,
  });

  // Verify workflow is canceled
  const workflowAfter = await t.query(
    internal.testing.tasquencer.getWorkflowById,
    {
      workflowId: id,
    }
  );
  expect(workflowAfter.state).toBe("canceled");

  // Verify task is canceled
  const task = await t.query(internal.testing.tasquencer.getWorkflowTasks, {
    workflowId: id,
  });
  expect(task[0].state).toBe("canceled");

  // Verify work items are canceled
  const workItemsAfter = await t.query(
    internal.testing.tasquencer.getWorkflowTaskWorkItems,
    {
      workflowId: id,
      taskName: "t1",
    }
  );
  expect(workItemsAfter[0].state).toBe("canceled");
  expect(workItemsAfter[1].state).toBe("canceled");
});
