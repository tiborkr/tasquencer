import { setup, Builder } from "../setup.test";
import { it, vi, expect, beforeEach, afterEach } from "vitest";
import { components, internal } from "../../../_generated/api";

import { versionManagerFor } from "../../versionManager";
import { internalVersionManagerRegistry } from "../../../testing/tasquencer";
import { waitForFlush } from "../audit/helpers.test";

/**
 * Test that verifies child workflow state is correctly filtered
 * when querying getWorkflowStateAtTime with a specific workflowId
 */

const WORKFLOW_VERSION_NAME = "v0";

const childWorkflowDefinition = Builder.workflow("childWorkflow")
  .startCondition("childStart")
  .task(
    "childTask1",
    Builder.noOpTask.withActivities({
      onEnabled: async ({ workItem }) => {
        await workItem.initialize();
      },
    })
  )
  .task(
    "childTask2",
    Builder.noOpTask.withActivities({
      onEnabled: async ({ workItem }) => {
        await workItem.initialize();
      },
    })
  )
  .endCondition("childEnd")
  .connectCondition("childStart", (to) => to.task("childTask1"))
  .connectTask("childTask1", (to) => to.task("childTask2"))
  .connectTask("childTask2", (to) => to.condition("childEnd"));

const parentWorkflowDefinition = Builder.workflow("parentWorkflow")
  .startCondition("parentStart")
  .task(
    "parentTask1",
    Builder.noOpTask.withActivities({
      onEnabled: async ({ workItem }) => {
        await workItem.initialize();
      },
    })
  )
  .compositeTask(
    "compositeTask",
    Builder.compositeTask(childWorkflowDefinition).withActivities({
      onEnabled: async ({ workflow }) => {
        await workflow.initialize();
      },
    })
  )
  .task(
    "parentTask2",
    Builder.noOpTask.withActivities({
      onEnabled: async ({ workItem }) => {
        await workItem.initialize();
      },
    })
  )
  .endCondition("parentEnd")
  .connectCondition("parentStart", (to) => to.task("parentTask1"))
  .connectTask("parentTask1", (to) => to.task("compositeTask"))
  .connectTask("compositeTask", (to) => to.task("parentTask2"))
  .connectTask("parentTask2", (to) => to.condition("parentEnd"));

const parentWorkflowVersionManager = versionManagerFor("parentWorkflow")
  .registerVersion(WORKFLOW_VERSION_NAME, parentWorkflowDefinition)
  .build();

const childWorkflowVersionManager = versionManagerFor("childWorkflow")
  .registerVersion(WORKFLOW_VERSION_NAME, childWorkflowDefinition)
  .build();

beforeEach(() => {
  vi.useFakeTimers();
  internalVersionManagerRegistry.registerVersionManager(
    parentWorkflowVersionManager
  );
  internalVersionManagerRegistry.registerVersionManager(
    childWorkflowVersionManager
  );
});

afterEach(() => {
  vi.useRealTimers();
  internalVersionManagerRegistry.unregisterVersionManager(
    parentWorkflowVersionManager
  );
  internalVersionManagerRegistry.unregisterVersionManager(
    childWorkflowVersionManager
  );
});

it("getWorkflowStateAtTime filters state by workflowId", async () => {
  const t = setup();

  // Initialize parent workflow
  const parentId = await t.mutation(
    internal.testing.tasquencer.initializeRootWorkflow,
    {
      workflowName: "parentWorkflow",
      workflowVersionName: WORKFLOW_VERSION_NAME,
    }
  );

  // Complete parentTask1 to enable composite task
  const parentTask1Items = await t.query(
    internal.testing.tasquencer.getWorkflowTaskWorkItems,
    { workflowId: parentId, taskName: "parentTask1" }
  );
  await t.mutation(internal.testing.tasquencer.startWorkItem, {
    workflowName: "parentWorkflow",
    workItemId: parentTask1Items[0]._id,
    workflowVersionName: WORKFLOW_VERSION_NAME,
  });
  await t.mutation(internal.testing.tasquencer.completeWorkItem, {
    workflowName: "parentWorkflow",
    workItemId: parentTask1Items[0]._id,
    workflowVersionName: WORKFLOW_VERSION_NAME,
  });

  // Get child workflow
  const childWorkflows = await t.query(
    internal.testing.tasquencer.getWorkflowCompositeTaskWorkflows,
    { workflowId: parentId, taskName: "compositeTask" }
  );
  expect(childWorkflows.length).toBe(1);
  const childId = childWorkflows[0]._id;

  // Complete childTask1
  const childTask1Items = await t.query(
    internal.testing.tasquencer.getWorkflowTaskWorkItems,
    { workflowId: childId, taskName: "childTask1" }
  );
  await t.mutation(internal.testing.tasquencer.startWorkItem, {
    workflowName: "parentWorkflow",
    workItemId: childTask1Items[0]._id,
    workflowVersionName: WORKFLOW_VERSION_NAME,
  });
  await t.mutation(internal.testing.tasquencer.completeWorkItem, {
    workflowName: "parentWorkflow",
    workItemId: childTask1Items[0]._id,
    workflowVersionName: WORKFLOW_VERSION_NAME,
  });

  // Complete childTask2
  const childTask2Items = await t.query(
    internal.testing.tasquencer.getWorkflowTaskWorkItems,
    { workflowId: childId, taskName: "childTask2" }
  );
  await t.mutation(internal.testing.tasquencer.startWorkItem, {
    workflowName: "parentWorkflow",
    workItemId: childTask2Items[0]._id,
    workflowVersionName: WORKFLOW_VERSION_NAME,
  });
  await t.mutation(internal.testing.tasquencer.completeWorkItem, {
    workflowName: "parentWorkflow",
    workItemId: childTask2Items[0]._id,
    workflowVersionName: WORKFLOW_VERSION_NAME,
  });

  // Complete parentTask2
  const parentTask2Items = await t.query(
    internal.testing.tasquencer.getWorkflowTaskWorkItems,
    { workflowId: parentId, taskName: "parentTask2" }
  );
  await t.mutation(internal.testing.tasquencer.startWorkItem, {
    workflowName: "parentWorkflow",
    workItemId: parentTask2Items[0]._id,
    workflowVersionName: WORKFLOW_VERSION_NAME,
  });
  await t.mutation(internal.testing.tasquencer.completeWorkItem, {
    workflowName: "parentWorkflow",
    workItemId: parentTask2Items[0]._id,
    workflowVersionName: WORKFLOW_VERSION_NAME,
  });

  // Wait for audit spans to flush
  await waitForFlush(t);

  // Now query state at current time
  const now = Date.now();

  // Get parent workflow state (should only have parent tasks)
  const parentState = await t.query(
    components.tasquencerAudit.api.getWorkflowStateAtTime,
    {
      traceId: parentId,
      workflowId: parentId, // Explicitly query parent
      timestamp: now,
    }
  );

  expect(parentState?.tasks["parentTask1"]).toBeDefined();
  expect(parentState?.tasks["parentTask1"].state).toBe("completed");
  expect(parentState?.tasks["compositeTask"]).toBeDefined();
  expect(parentState?.tasks["compositeTask"].state).toBe("completed");
  expect(parentState?.tasks["parentTask2"]).toBeDefined();
  expect(parentState?.tasks["parentTask2"].state).toBe("completed");

  // Parent state should NOT have child tasks
  expect(parentState?.tasks["childTask1"]).toBeUndefined();
  expect(parentState?.tasks["childTask2"]).toBeUndefined();

  // Get child workflow state (should only have child tasks)
  const childState = await t.query(
    components.tasquencerAudit.api.getWorkflowStateAtTime,
    {
      traceId: parentId, // Use parent traceId to find spans
      workflowId: childId, // But filter to child workflow
      timestamp: now,
    }
  );

  expect(childState?.tasks["childTask1"]).toBeDefined();
  expect(childState?.tasks["childTask1"].state).toBe("completed");
  expect(childState?.tasks["childTask2"]).toBeDefined();
  expect(childState?.tasks["childTask2"].state).toBe("completed");

  // Child state should NOT have parent tasks
  expect(childState?.tasks["parentTask1"]).toBeUndefined();
  expect(childState?.tasks["compositeTask"]).toBeUndefined();
  expect(childState?.tasks["parentTask2"]).toBeUndefined();
});
