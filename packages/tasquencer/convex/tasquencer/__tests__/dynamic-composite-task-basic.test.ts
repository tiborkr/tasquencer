import { setup, Builder } from "./setup.test";
import { it, vi, beforeEach, afterEach, expect } from "vitest";
import { internal } from "../../../convex/_generated/api";

import { versionManagerFor } from "../../../convex/tasquencer/versionManager";
import schema from "../../schema";
import { internalVersionManagerRegistry } from "../../testing/tasquencer";

const WORKFLOW_VERSION_NAME = "v0";

// Define two different child workflows
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
  .task(
    "taskB2",
    Builder.noOpTask.withActivities({
      onEnabled: async ({ workItem }) => {
        await workItem.initialize();
      },
    })
  )
  .endCondition("end")
  .connectCondition("start", (to) => to.task("taskB1"))
  .connectTask("taskB1", (to) => to.task("taskB2"))
  .connectTask("taskB2", (to) => to.condition("end"));

// Parent workflow with dynamic composite task
const parentWorkflow = Builder.workflow("parent")
  .startCondition("start")
  .dynamicCompositeTask(
    "dynamicComposite",
    Builder.dynamicCompositeTask([workflowA, workflowB]).withActivities({
      onEnabled: async ({ workflow }) => {
        // Initialize WorkflowA
        await workflow.initialize.WorkflowA();
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

it("rejects workflow initialization when path ends at dynamic composite task", async () => {
  const t = setup();

  const parentId = await t.mutation(
    internal.testing.tasquencer.initializeRootWorkflow,
    {
      workflowName: "parent",
      workflowVersionName: WORKFLOW_VERSION_NAME,
    }
  );

  await expect(
    t.mutation(internal.testing.tasquencer.initializeWorkflow, {
      workflowName: "parent",
      workflowVersionName: WORKFLOW_VERSION_NAME,
      target: {
        path: ["parent", "dynamicComposite"],
        parentWorkflowId: parentId,
        parentTaskName: "dynamicComposite",
      },
    })
  ).rejects.toThrowError(/Workflow not found in path/);
});

it("initializes WorkflowA from dynamic composite task", async () => {
  const t = setup();

  const parentId = await t.mutation(
    internal.testing.tasquencer.initializeRootWorkflow,
    {
      workflowName: "parent",
      workflowVersionName: WORKFLOW_VERSION_NAME,
    }
  );

  // Check the composite task is enabled
  const enabledTasks = await t.query(
    internal.testing.tasquencer.getWorkflowTasksByState,
    {
      workflowId: parentId,
      state: "enabled",
    }
  );

  expect(enabledTasks).toHaveLength(1);
  expect(enabledTasks[0].name).toBe("dynamicComposite");

  // Get child workflows for the dynamic composite task
  const childWorkflows = await t.query(
    internal.testing.tasquencer.getWorkflowCompositeTaskWorkflows,
    {
      workflowId: parentId,
      taskName: "dynamicComposite",
    }
  );

  // Should have initialized WorkflowA
  expect(childWorkflows).toHaveLength(1);
  expect(childWorkflows[0].name).toBe("WorkflowA");
  expect(childWorkflows[0].state).toBe("initialized");

  // Check that WorkflowA's task is initialized
  const workflowAId = childWorkflows[0]._id;
  const workflowATasks = await t.query(
    internal.testing.tasquencer.getWorkflowTasksByState,
    {
      workflowId: workflowAId,
      state: "enabled",
    }
  );

  expect(workflowATasks).toHaveLength(1);
  expect(workflowATasks[0].name).toBe("taskA1");

  // Get work items for the task
  const workItems = await t.query(
    internal.testing.tasquencer.getWorkflowTaskWorkItems,
    {
      workflowId: workflowAId,
      taskName: "taskA1",
    }
  );

  expect(workItems).toHaveLength(1);
  expect(workItems[0].state).toBe("initialized");
});

it("completes parent workflow when child WorkflowA completes", async () => {
  const t = setup();

  const parentId = await t.mutation(
    internal.testing.tasquencer.initializeRootWorkflow,
    {
      workflowName: "parent",
      workflowVersionName: WORKFLOW_VERSION_NAME,
    }
  );

  // Get child workflow
  const childWorkflows = await t.query(
    internal.testing.tasquencer.getWorkflowCompositeTaskWorkflows,
    {
      workflowId: parentId,
      taskName: "dynamicComposite",
    }
  );
  const workflowAId = childWorkflows[0]._id;

  // Get and complete the child workflow's work item
  const workItems = await t.query(
    internal.testing.tasquencer.getWorkflowTaskWorkItems,
    {
      workflowId: workflowAId,
      taskName: "taskA1",
    }
  );

  await t.mutation(internal.testing.tasquencer.startWorkItem, {
    workflowName: "parent",
    workItemId: workItems[0]._id,
    workflowVersionName: WORKFLOW_VERSION_NAME,
  });

  await t.mutation(internal.testing.tasquencer.completeWorkItem, {
    workflowName: "parent",
    workItemId: workItems[0]._id,
    workflowVersionName: WORKFLOW_VERSION_NAME,
  });

  // Child workflow should be completed
  const completedChildWorkflows = await t.query(
    internal.testing.tasquencer.getWorkflowCompositeTaskWorkflows,
    {
      workflowId: parentId,
      taskName: "dynamicComposite",
    }
  );
  expect(completedChildWorkflows[0].state).toBe("completed");

  // Parent task should be completed
  const completedTasks = await t.query(
    internal.testing.tasquencer.getWorkflowTasksByState,
    {
      workflowId: parentId,
      state: "completed",
    }
  );
  expect(completedTasks).toHaveLength(1);
  expect(completedTasks[0].name).toBe("dynamicComposite");

  // Parent workflow should also complete
  const completedParent = await t.query(
    internal.testing.tasquencer.getWorkflowById,
    {
      workflowId: parentId,
    }
  );
  expect(completedParent?.state).toBe("completed");
});
