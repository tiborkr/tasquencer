import { setup, Builder } from "./setup.test";
import { it, vi, beforeEach, afterEach, expect } from "vitest";
import { internal } from "../../../convex/_generated/api";

import { versionManagerFor } from "../../../convex/tasquencer/versionManager";
import schema from "../../schema";
import { internalVersionManagerRegistry } from "../../testing/tasquencer";

const WORKFLOW_VERSION_NAME = "v0";

const workflowA = Builder.workflow("WorkflowA")
  .startCondition("start")
  .task(
    "taskA1",
    Builder.noOpTask.withActivities({
      onEnabled: async ({ workItem }) => {
        await workItem.initialize();
      },
    })
  )
  .endCondition("end")
  .connectCondition("start", (to) => to.task("taskA1"))
  .connectTask("taskA1", (to) => to.condition("end"));

const workflowB = Builder.workflow("WorkflowB")
  .startCondition("start")
  .task(
    "taskB1",
    Builder.noOpTask.withActivities({
      onEnabled: async ({ workItem }) => {
        await workItem.initialize();
      },
    })
  )
  .endCondition("end")
  .connectCondition("start", (to) => to.task("taskB1"))
  .connectTask("taskB1", (to) => to.condition("end"));

const parentWorkflow = Builder.workflow("parent")
  .startCondition("start")
  .dynamicCompositeTask(
    "dynamicComposite",
    Builder.dynamicCompositeTask([workflowA, workflowB]).withActivities({
      onEnabled: async ({ workflow }) => {
        await workflow.initialize.WorkflowA();
        await workflow.initialize.WorkflowB();
      },
      onDisabled: async () => {},
      onStarted: async () => {},
      onCompleted: async () => {},
      onFailed: async () => {},
      onCanceled: async () => {},
      onWorkflowStateChanged: async () => {},
    })
  )
  .endCondition("end")
  .connectCondition("start", (to) => to.task("dynamicComposite"))
  .connectTask("dynamicComposite", (to) => to.condition("end"));

const parentVersionManager = versionManagerFor("parent")
  .registerVersion(WORKFLOW_VERSION_NAME, parentWorkflow)
  .build();

const workflowAVersionManager = versionManagerFor("WorkflowA")
  .registerVersion(WORKFLOW_VERSION_NAME, workflowA)
  .build();

const workflowBVersionManager = versionManagerFor("WorkflowB")
  .registerVersion(WORKFLOW_VERSION_NAME, workflowB)
  .build();

beforeEach(() => {
  vi.useFakeTimers();
  internalVersionManagerRegistry.registerVersionManager(parentVersionManager);
  internalVersionManagerRegistry.registerVersionManager(
    workflowAVersionManager
  );
  internalVersionManagerRegistry.registerVersionManager(
    workflowBVersionManager
  );
});

afterEach(() => {
  vi.useRealTimers();
  internalVersionManagerRegistry.unregisterVersionManager(parentVersionManager);
  internalVersionManagerRegistry.unregisterVersionManager(
    workflowAVersionManager
  );
  internalVersionManagerRegistry.unregisterVersionManager(
    workflowBVersionManager
  );
});

it("cancels all child workflows when parent is canceled", async () => {
  const t = setup();

  const parentId = await t.mutation(
    internal.testing.tasquencer.initializeRootWorkflow,
    {
      workflowName: "parent",
      workflowVersionName: WORKFLOW_VERSION_NAME,
    }
  );

  const childWorkflows = await t.query(
    internal.testing.tasquencer.getWorkflowCompositeTaskWorkflows,
    {
      workflowId: parentId,
      taskName: "dynamicComposite",
    }
  );

  expect(childWorkflows).toHaveLength(2);
  expect(childWorkflows.every((w) => w.state === "initialized")).toBe(true);

  // Cancel parent workflow
  await t.mutation(internal.testing.tasquencer.cancelWorkflow, {
    workflowName: "parent",
    workflowVersionName: WORKFLOW_VERSION_NAME,
    workflowId: parentId,
  });

  // Parent should be canceled
  const canceledParent = await t.query(
    internal.testing.tasquencer.getWorkflowById,
    {
      workflowId: parentId,
    }
  );
  expect(canceledParent?.state).toBe("canceled");

  // All child workflows should also be canceled
  const canceledChildren = await t.query(
    internal.testing.tasquencer.getWorkflowCompositeTaskWorkflows,
    {
      workflowId: parentId,
      taskName: "dynamicComposite",
    }
  );

  expect(canceledChildren.every((w) => w.state === "canceled")).toBe(true);
});

// Note: disableTask API does not exist in testing API, skipping this test

it("handles partial completion before cancellation", async () => {
  const t = setup();

  const parentId = await t.mutation(
    internal.testing.tasquencer.initializeRootWorkflow,
    {
      workflowName: "parent",
      workflowVersionName: WORKFLOW_VERSION_NAME,
    }
  );

  const childWorkflows = await t.query(
    internal.testing.tasquencer.getWorkflowCompositeTaskWorkflows,
    {
      workflowId: parentId,
      taskName: "dynamicComposite",
    }
  );

  const workflowAInstance = childWorkflows.find((w) => w.name === "WorkflowA")!;
  const workflowBInstance = childWorkflows.find((w) => w.name === "WorkflowB")!;

  // Complete WorkflowA
  const workItemsA = await t.query(
    internal.testing.tasquencer.getWorkflowTaskWorkItems,
    {
      workflowId: workflowAInstance._id,
      taskName: "taskA1",
    }
  );

  await t.mutation(internal.testing.tasquencer.startWorkItem, {
    workflowName: "parent",
    workflowVersionName: WORKFLOW_VERSION_NAME,
    workItemId: workItemsA[0]._id,
  });

  await t.mutation(internal.testing.tasquencer.completeWorkItem, {
    workflowName: "parent",
    workflowVersionName: WORKFLOW_VERSION_NAME,
    workItemId: workItemsA[0]._id,
  });

  // WorkflowA should be completed
  const completedWorkflowA = await t.query(
    internal.testing.tasquencer.getWorkflowById,
    {
      workflowId: workflowAInstance._id,
    }
  );
  expect(completedWorkflowA?.state).toBe("completed");

  // Cancel parent before WorkflowB completes
  await t.mutation(internal.testing.tasquencer.cancelWorkflow, {
    workflowName: "parent",
    workflowVersionName: WORKFLOW_VERSION_NAME,
    workflowId: parentId,
  });

  // WorkflowA should remain completed (already finalized)
  const stillCompletedWorkflowA = await t.query(
    internal.testing.tasquencer.getWorkflowById,
    { workflowId: workflowAInstance._id }
  );
  expect(stillCompletedWorkflowA?.state).toBe("completed");

  // WorkflowB should be canceled (was still running)
  const canceledWorkflowB = await t.query(
    internal.testing.tasquencer.getWorkflowById,
    {
      workflowId: workflowBInstance._id,
    }
  );
  expect(canceledWorkflowB?.state).toBe("canceled");
});

it("does not cancel child workflows on completion", async () => {
  const t = setup();

  const parentId = await t.mutation(
    internal.testing.tasquencer.initializeRootWorkflow,
    {
      workflowName: "parent",
      workflowVersionName: WORKFLOW_VERSION_NAME,
    }
  );

  const childWorkflows = await t.query(
    internal.testing.tasquencer.getWorkflowCompositeTaskWorkflows,
    {
      workflowId: parentId,
      taskName: "dynamicComposite",
    }
  );

  // Complete all child workflows
  for (const childWorkflow of childWorkflows) {
    const taskName = childWorkflow.name === "WorkflowA" ? "taskA1" : "taskB1";
    const workItems = await t.query(
      internal.testing.tasquencer.getWorkflowTaskWorkItems,
      {
        workflowId: childWorkflow._id,
        taskName,
      }
    );

    await t.mutation(internal.testing.tasquencer.startWorkItem, {
      workflowName: "parent",
      workflowVersionName: WORKFLOW_VERSION_NAME,
      workItemId: workItems[0]._id,
    });

    await t.mutation(internal.testing.tasquencer.completeWorkItem, {
      workflowName: "parent",
      workflowVersionName: WORKFLOW_VERSION_NAME,
      workItemId: workItems[0]._id,
    });
  }

  // Parent should be completed
  const completedParent = await t.query(
    internal.testing.tasquencer.getWorkflowById,
    {
      workflowId: parentId,
    }
  );
  expect(completedParent?.state).toBe("completed");

  // All child workflows should be completed (not canceled)
  const completedChildren = await t.query(
    internal.testing.tasquencer.getWorkflowCompositeTaskWorkflows,
    {
      workflowId: parentId,
      taskName: "dynamicComposite",
    }
  );

  expect(completedChildren.every((w) => w.state === "completed")).toBe(true);
});
