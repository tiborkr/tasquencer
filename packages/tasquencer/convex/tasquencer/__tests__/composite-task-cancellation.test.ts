import { setup, Builder } from "./setup.test";
import { it, vi, beforeEach, afterEach, expect } from "vitest";
import { internal } from "../../../convex/_generated/api";

import { versionManagerFor } from "../../../convex/tasquencer/versionManager";
import schema from "../../schema";
import { internalVersionManagerRegistry } from "../../testing/tasquencer";

const WORKFLOW_VERSION_NAME = "v0";

const childWorkflow = Builder.workflow("ChildWorkflow")
  .startCondition("start")
  .task(
    "task1",
    Builder.noOpTask.withActivities({
      onEnabled: async ({ workItem }) => {
        await workItem.initialize();
      },
    })
  )
  .endCondition("end")
  .connectCondition("start", (to) => to.task("task1"))
  .connectTask("task1", (to) => to.condition("end"));

const parentWorkflow = Builder.workflow("parent")
  .startCondition("start")
  .compositeTask(
    "compositeTask",
    Builder.compositeTask(childWorkflow).withActivities({
      onEnabled: async ({ workflow }) => {
        await workflow.initialize();
      },
    })
  )
  .endCondition("end")
  .connectCondition("start", (to) => to.task("compositeTask"))
  .connectTask("compositeTask", (to) => to.condition("end"));

const parentVersionManager = versionManagerFor("parent")
  .registerVersion(WORKFLOW_VERSION_NAME, parentWorkflow)
  .build();

const parentWithMultipleChildrenWorkflow = Builder.workflow(
  "parent-multi-child"
)
  .startCondition("start")
  .compositeTask(
    "compositeTask",
    Builder.compositeTask(childWorkflow).withActivities({
      onEnabled: async ({ workflow }) => {
        await workflow.initialize();
        await workflow.initialize();
      },
    })
  )
  .endCondition("end")
  .connectCondition("start", (to) => to.task("compositeTask"))
  .connectTask("compositeTask", (to) => to.condition("end"));

const parentWithScheduledInitWorkflow = Builder.workflow(
  "parent-with-scheduled"
)
  .startCondition("start")
  .compositeTask(
    "compositeTask",
    Builder.compositeTask(childWorkflow).withActivities({
      onEnabled: async ({
        workflow,
        registerScheduled,
        mutationCtx,
        parent,
        task,
      }) => {
        await workflow.initialize();
        await registerScheduled(
          mutationCtx.scheduler.runAfter(
            0,
            internal.testing.tasquencer.initializeWorkflow,
            {
              workflowName: "ChildWorkflow",
              workflowVersionName: WORKFLOW_VERSION_NAME,
              target: {
                path: workflow.path,
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
  .connectCondition("start", (to) => to.task("compositeTask"))
  .connectTask("compositeTask", (to) => to.condition("end"));

const parentMultiChildVersionManager = versionManagerFor("parent-multi-child")
  .registerVersion(WORKFLOW_VERSION_NAME, parentWithMultipleChildrenWorkflow)
  .build();

const parentWithScheduledVersionManager = versionManagerFor(
  "parent-with-scheduled"
)
  .registerVersion(WORKFLOW_VERSION_NAME, parentWithScheduledInitWorkflow)
  .build();

const childVersionManager = versionManagerFor("ChildWorkflow")
  .registerVersion(WORKFLOW_VERSION_NAME, childWorkflow)
  .build();

beforeEach(() => {
  vi.useFakeTimers();
  internalVersionManagerRegistry.registerVersionManager(parentVersionManager);
  internalVersionManagerRegistry.registerVersionManager(
    parentMultiChildVersionManager
  );
  internalVersionManagerRegistry.registerVersionManager(
    parentWithScheduledVersionManager
  );
  internalVersionManagerRegistry.registerVersionManager(childVersionManager);
});

afterEach(() => {
  vi.useRealTimers();
  internalVersionManagerRegistry.unregisterVersionManager(parentVersionManager);
  internalVersionManagerRegistry.unregisterVersionManager(
    parentMultiChildVersionManager
  );
  internalVersionManagerRegistry.unregisterVersionManager(
    parentWithScheduledVersionManager
  );
  internalVersionManagerRegistry.unregisterVersionManager(childVersionManager);
});

it("cancels child workflow when parent is canceled (composite task enabled, child initialized)", async () => {
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
      taskName: "compositeTask",
    }
  );

  expect(childWorkflows).toHaveLength(1);
  expect(childWorkflows[0].state).toBe("initialized");

  // Verify composite task is enabled (not started)
  const tasks = await t.query(internal.testing.tasquencer.getWorkflowTasks, {
    workflowId: parentId,
  });
  const compositeTask = tasks.find((t) => t.name === "compositeTask");
  expect(compositeTask?.state).toBe("enabled");

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

  // Child workflow should also be canceled
  const canceledChildren = await t.query(
    internal.testing.tasquencer.getWorkflowCompositeTaskWorkflows,
    {
      workflowId: parentId,
      taskName: "compositeTask",
    }
  );

  expect(canceledChildren[0].state).toBe("canceled");
});

it("cancels non-finalized child workflows when a sibling fails", async () => {
  const t = setup();

  const parentId = await t.mutation(
    internal.testing.tasquencer.initializeRootWorkflow,
    {
      workflowName: "parent-multi-child",
      workflowVersionName: WORKFLOW_VERSION_NAME,
    }
  );

  const childWorkflows = await t.query(
    internal.testing.tasquencer.getWorkflowCompositeTaskWorkflows,
    {
      workflowId: parentId,
      taskName: "compositeTask",
    }
  );

  expect(childWorkflows).toHaveLength(2);

  const [firstChild, secondChild] = childWorkflows;

  const secondChildItems = await t.query(
    internal.testing.tasquencer.getWorkflowTaskWorkItems,
    {
      workflowId: secondChild._id,
      taskName: "task1",
    }
  );

  await t.mutation(internal.testing.tasquencer.startWorkItem, {
    workflowName: "parent-multi-child",
    workflowVersionName: WORKFLOW_VERSION_NAME,
    workItemId: secondChildItems[0]._id,
  });

  const firstChildItems = await t.query(
    internal.testing.tasquencer.getWorkflowTaskWorkItems,
    {
      workflowId: firstChild._id,
      taskName: "task1",
    }
  );

  await t.mutation(internal.testing.tasquencer.startWorkItem, {
    workflowName: "parent-multi-child",
    workflowVersionName: WORKFLOW_VERSION_NAME,
    workItemId: firstChildItems[0]._id,
  });

  await t.mutation(internal.testing.tasquencer.failWorkItem, {
    workflowName: "parent-multi-child",
    workflowVersionName: WORKFLOW_VERSION_NAME,
    workItemId: firstChildItems[0]._id,
  });

  const canceledSecondChild = await t.query(
    internal.testing.tasquencer.getWorkflowById,
    {
      workflowId: secondChild._id,
    }
  );

  expect(canceledSecondChild?.state).toBe("canceled");
});

it("cancels scheduled child workflow initializations when parent fails", async () => {
  const t = setup();

  const parentId = await t.mutation(
    internal.testing.tasquencer.initializeRootWorkflow,
    {
      workflowName: "parent-with-scheduled",
      workflowVersionName: WORKFLOW_VERSION_NAME,
    }
  );

  const initialChildren = await t.query(
    internal.testing.tasquencer.getWorkflowCompositeTaskWorkflows,
    {
      workflowId: parentId,
      taskName: "compositeTask",
    }
  );
  expect(initialChildren).toHaveLength(1);

  const child = initialChildren[0];
  const childItems = await t.query(
    internal.testing.tasquencer.getWorkflowTaskWorkItems,
    {
      workflowId: child._id,
      taskName: "task1",
    }
  );

  await t.mutation(internal.testing.tasquencer.startWorkItem, {
    workflowName: "parent-with-scheduled",
    workflowVersionName: WORKFLOW_VERSION_NAME,
    workItemId: childItems[0]._id,
  });

  await t.mutation(internal.testing.tasquencer.failWorkItem, {
    workflowName: "parent-with-scheduled",
    workflowVersionName: WORKFLOW_VERSION_NAME,
    workItemId: childItems[0]._id,
  });

  await t.finishAllScheduledFunctions(vi.runAllTimersAsync);

  const childrenAfter = await t.query(
    internal.testing.tasquencer.getWorkflowCompositeTaskWorkflows,
    {
      workflowId: parentId,
      taskName: "compositeTask",
    }
  );

  expect(childrenAfter).toHaveLength(1);
});
