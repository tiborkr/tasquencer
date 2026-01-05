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

const workflowC = Builder.workflow("WorkflowC")
  .startCondition("start")
  .task(
    "taskC1",
    Builder.noOpTask.withActivities({
      onEnabled: async ({ workItem }) => {
        await workItem.initialize();
      },
    })
  )
  .endCondition("end")
  .connectCondition("start", (to) => to.task("taskC1"))
  .connectTask("taskC1", (to) => to.condition("end"));

// Test initializing multiple different workflow types
const parentWorkflow = Builder.workflow("parent")
  .startCondition("start")
  .dynamicCompositeTask(
    "dynamicComposite",
    Builder.dynamicCompositeTask([
      workflowA,
      workflowB,
      workflowC,
    ]).withActivities({
      onEnabled: async ({ workflow }) => {
        // Initialize all three workflow types
        await workflow.initialize.WorkflowA();
        await workflow.initialize.WorkflowB();
        await workflow.initialize.WorkflowC();
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

const workflowCVersionManager = versionManagerFor("WorkflowC")
  .registerVersion(WORKFLOW_VERSION_NAME, workflowC)
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
  internalVersionManagerRegistry.registerVersionManager(
    workflowCVersionManager
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
  internalVersionManagerRegistry.unregisterVersionManager(
    workflowCVersionManager
  );
});

it("initializes multiple different workflow types", async () => {
  const t = setup();

  const parentId = await t.mutation(
    internal.testing.tasquencer.initializeRootWorkflow,
    {
      workflowName: "parent",
      workflowVersionName: WORKFLOW_VERSION_NAME,
    }
  );

  // Get child workflows
  const childWorkflows = await t.query(
    internal.testing.tasquencer.getWorkflowCompositeTaskWorkflows,
    {
      workflowId: parentId,
      taskName: "dynamicComposite",
    }
  );

  // Should have initialized all three workflows
  expect(childWorkflows).toHaveLength(3);

  const workflowNames = childWorkflows.map((w) => w.name).sort();
  expect(workflowNames).toEqual(["WorkflowA", "WorkflowB", "WorkflowC"]);

  // All should be initialized
  childWorkflows.forEach((workflow) => {
    expect(workflow.state).toBe("initialized");
  });
});

it("completes parent when all child workflows complete", async () => {
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

  // Complete each child workflow
  for (const childWorkflow of childWorkflows) {
    const taskName =
      childWorkflow.name === "WorkflowA"
        ? "taskA1"
        : childWorkflow.name === "WorkflowB"
          ? "taskB1"
          : "taskC1";

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

  // All child workflows should be completed
  const completedChildren = await t.query(
    internal.testing.tasquencer.getWorkflowCompositeTaskWorkflows,
    {
      workflowId: parentId,
      taskName: "dynamicComposite",
    }
  );

  completedChildren.forEach((workflow) => {
    expect(workflow.state).toBe("completed");
  });

  // Parent should also be completed
  const completedParent = await t.query(
    internal.testing.tasquencer.getWorkflowById,
    {
      workflowId: parentId,
    }
  );
  expect(completedParent?.state).toBe("completed");
});

it("does not complete parent until all workflows finish", async () => {
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

  // Complete only the first two workflows
  for (let i = 0; i < 2; i++) {
    const taskName =
      childWorkflows[i].name === "WorkflowA"
        ? "taskA1"
        : childWorkflows[i].name === "WorkflowB"
          ? "taskB1"
          : "taskC1";

    const workItems = await t.query(
      internal.testing.tasquencer.getWorkflowTaskWorkItems,
      {
        workflowId: childWorkflows[i]._id,
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

  // Parent should still be started (not completed yet)
  const parentWorkflow = await t.query(
    internal.testing.tasquencer.getWorkflowById,
    {
      workflowId: parentId,
    }
  );
  expect(parentWorkflow?.state).toBe("started");

  // Complete the third workflow
  const taskName =
    childWorkflows[2].name === "WorkflowA"
      ? "taskA1"
      : childWorkflows[2].name === "WorkflowB"
        ? "taskB1"
        : "taskC1";

  const workItems = await t.query(
    internal.testing.tasquencer.getWorkflowTaskWorkItems,
    {
      workflowId: childWorkflows[2]._id,
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

  // Now parent should be completed
  const completedParent = await t.query(
    internal.testing.tasquencer.getWorkflowById,
    {
      workflowId: parentId,
    }
  );
  expect(completedParent?.state).toBe("completed");
});
