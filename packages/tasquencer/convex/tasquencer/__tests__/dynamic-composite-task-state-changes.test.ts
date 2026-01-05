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

// Track state changes
const stateChanges: Array<{
  workflowName: string;
  prevState: string;
  nextState: string;
}> = [];

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
      onWorkflowStateChanged: async ({ workflow }) => {
        // Track which workflow transitioned
        stateChanges.push({
          workflowName: workflow.name,
          prevState: workflow.prevState,
          nextState: workflow.nextState,
        });
      },
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
  stateChanges.length = 0; // Clear state changes
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

it("tracks state changes for each workflow type", async () => {
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

  // Should have recorded WorkflowA completion
  const workflowACompletions = stateChanges.filter(
    (c) => c.workflowName === "WorkflowA" && c.nextState === "completed"
  );
  expect(workflowACompletions.length).toBeGreaterThan(0);

  // Complete WorkflowB
  const workItemsB = await t.query(
    internal.testing.tasquencer.getWorkflowTaskWorkItems,
    {
      workflowId: workflowBInstance._id,
      taskName: "taskB1",
    }
  );

  await t.mutation(internal.testing.tasquencer.startWorkItem, {
    workflowName: "parent",
    workflowVersionName: WORKFLOW_VERSION_NAME,
    workItemId: workItemsB[0]._id,
  });

  await t.mutation(internal.testing.tasquencer.completeWorkItem, {
    workflowName: "parent",
    workflowVersionName: WORKFLOW_VERSION_NAME,
    workItemId: workItemsB[0]._id,
  });

  // Should have recorded WorkflowB completion
  const workflowBCompletions = stateChanges.filter(
    (c) => c.workflowName === "WorkflowB" && c.nextState === "completed"
  );
  expect(workflowBCompletions.length).toBeGreaterThan(0);
});

it("provides correct workflow name in onWorkflowStateChanged", async () => {
  const t = setup();

  await t.mutation(internal.testing.tasquencer.initializeRootWorkflow, {
    workflowName: "parent",
    workflowVersionName: WORKFLOW_VERSION_NAME,
  });

  // Each state change should have the correct workflow name
  stateChanges.forEach((change) => {
    expect(["WorkflowA", "WorkflowB"]).toContain(change.workflowName);
    expect(change.prevState).toBeTruthy();
    expect(change.nextState).toBeTruthy();
    expect(change.prevState).not.toBe(change.nextState);
  });
});
