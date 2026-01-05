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

// Test default failure policy (fail on first child failure)
const parentWithDefaultPolicy = Builder.workflow("parentDefault")
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
    // Default policy - should fail when any child fails
  )
  .endCondition("end")
  .connectCondition("start", (to) => to.task("dynamicComposite"))
  .connectTask("dynamicComposite", (to) => to.condition("end"));

// Test custom policy (continue on failure)
const parentWithCustomPolicy = Builder.workflow("parentCustom")
  .startCondition("start")
  .dynamicCompositeTask(
    "dynamicComposite",
    Builder.dynamicCompositeTask([workflowA, workflowB])
      .withActivities({
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
      .withPolicy(async ({ task, workflows }) => {
        const stats = await task.getStats();

        // Get total workflows across all types
        const totalWorkflows = await Promise.all(
          workflows.map((w) => w.getAllWorkflowIds())
        ).then((ids) => ids.flat().length);

        // Only complete when all workflows are finalized
        if (
          stats.completed + stats.failed + stats.canceled ===
          totalWorkflows
        ) {
          return "complete";
        }

        return "continue";
      })
  )
  .endCondition("end")
  .connectCondition("start", (to) => to.task("dynamicComposite"))
  .connectTask("dynamicComposite", (to) => to.condition("end"));

const parentWithScheduledInit = Builder.workflow("parentWithSchedule")
  .startCondition("start")
  .dynamicCompositeTask(
    "dynamicComposite",
    Builder.dynamicCompositeTask([workflowA]).withActivities({
      onEnabled: async ({
        workflow,
        registerScheduled,
        mutationCtx,
        parent,
        task,
      }) => {
        await workflow.initialize.WorkflowA();

        await registerScheduled(
          mutationCtx.scheduler.runAfter(
            0,
            internal.testing.tasquencer.initializeWorkflow,
            {
              workflowName: "WorkflowA",
              workflowVersionName: WORKFLOW_VERSION_NAME,
              target: {
                path: workflow.paths.WorkflowA,
                parentWorkflowId: parent.workflow.id,
                parentTaskName: task.name,
              },
              payload: undefined,
            }
          )
        );
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

const parentDefaultVersionManager = versionManagerFor("parentDefault")
  .registerVersion(WORKFLOW_VERSION_NAME, parentWithDefaultPolicy)
  .build();

const parentCustomVersionManager = versionManagerFor("parentCustom")
  .registerVersion(WORKFLOW_VERSION_NAME, parentWithCustomPolicy)
  .build();

const parentWithScheduleVersionManager = versionManagerFor("parentWithSchedule")
  .registerVersion(WORKFLOW_VERSION_NAME, parentWithScheduledInit)
  .build();

const workflowAVersionManager = versionManagerFor("WorkflowA")
  .registerVersion(WORKFLOW_VERSION_NAME, workflowA)
  .build();

const workflowBVersionManager = versionManagerFor("WorkflowB")
  .registerVersion(WORKFLOW_VERSION_NAME, workflowB)
  .build();

beforeEach(() => {
  vi.useFakeTimers();
  internalVersionManagerRegistry.registerVersionManager(
    parentDefaultVersionManager
  );
  internalVersionManagerRegistry.registerVersionManager(
    parentCustomVersionManager
  );
  internalVersionManagerRegistry.registerVersionManager(
    workflowAVersionManager
  );
  internalVersionManagerRegistry.registerVersionManager(
    workflowBVersionManager
  );
});

afterEach(() => {
  vi.useRealTimers();
  internalVersionManagerRegistry.unregisterVersionManager(
    parentDefaultVersionManager
  );
  internalVersionManagerRegistry.unregisterVersionManager(
    parentCustomVersionManager
  );
  internalVersionManagerRegistry.unregisterVersionManager(
    workflowAVersionManager
  );
  internalVersionManagerRegistry.unregisterVersionManager(
    workflowBVersionManager
  );
});

it("fails parent workflow when child fails with default policy", async () => {
  const t = setup();

  const parentId = await t.mutation(
    internal.testing.tasquencer.initializeRootWorkflow,
    {
      workflowName: "parentDefault",
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

  // Fail WorkflowA
  const workItemsA = await t.query(
    internal.testing.tasquencer.getWorkflowTaskWorkItems,
    {
      workflowId: workflowAInstance._id,
      taskName: "taskA1",
    }
  );

  await t.mutation(internal.testing.tasquencer.startWorkItem, {
    workflowName: "parentDefault",
    workflowVersionName: WORKFLOW_VERSION_NAME,
    workItemId: workItemsA[0]._id,
  });

  await t.mutation(internal.testing.tasquencer.failWorkItem, {
    workflowName: "parentDefault",
    workflowVersionName: WORKFLOW_VERSION_NAME,
    workItemId: workItemsA[0]._id,
  });

  // Parent should fail due to default policy
  const parentWorkflow = await t.query(
    internal.testing.tasquencer.getWorkflowById,
    {
      workflowId: parentId,
    }
  );
  expect(parentWorkflow?.state).toBe("failed");
});

it("continues when child fails with custom policy", async () => {
  const t = setup();

  const parentId = await t.mutation(
    internal.testing.tasquencer.initializeRootWorkflow,
    {
      workflowName: "parentCustom",
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

  // Fail WorkflowA
  const workItemsA = await t.query(
    internal.testing.tasquencer.getWorkflowTaskWorkItems,
    {
      workflowId: workflowAInstance._id,
      taskName: "taskA1",
    }
  );

  await t.mutation(internal.testing.tasquencer.startWorkItem, {
    workflowName: "parentCustom",
    workflowVersionName: WORKFLOW_VERSION_NAME,
    workItemId: workItemsA[0]._id,
  });

  await t.mutation(internal.testing.tasquencer.failWorkItem, {
    workflowName: "parentCustom",
    workflowVersionName: WORKFLOW_VERSION_NAME,
    workItemId: workItemsA[0]._id,
  });

  // Parent should still be started (custom policy continues)
  let parentWorkflow = await t.query(
    internal.testing.tasquencer.getWorkflowById,
    {
      workflowId: parentId,
    }
  );
  expect(parentWorkflow?.state).toBe("started");

  // Complete WorkflowB
  const workItemsB = await t.query(
    internal.testing.tasquencer.getWorkflowTaskWorkItems,
    {
      workflowId: workflowBInstance._id,
      taskName: "taskB1",
    }
  );

  await t.mutation(internal.testing.tasquencer.startWorkItem, {
    workflowName: "parentCustom",
    workflowVersionName: WORKFLOW_VERSION_NAME,
    workItemId: workItemsB[0]._id,
  });

  await t.mutation(internal.testing.tasquencer.completeWorkItem, {
    workflowName: "parentCustom",
    workflowVersionName: WORKFLOW_VERSION_NAME,
    workItemId: workItemsB[0]._id,
  });

  // Now parent should complete (all workflows finalized)
  parentWorkflow = await t.query(internal.testing.tasquencer.getWorkflowById, {
    workflowId: parentId,
  });
  expect(parentWorkflow?.state).toBe("completed");
});

it("completes when all workflows finish regardless of success/failure", async () => {
  const t = setup();

  const parentId = await t.mutation(
    internal.testing.tasquencer.initializeRootWorkflow,
    {
      workflowName: "parentCustom",
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

  // Fail both workflows
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
      workflowName: "parentCustom",
      workflowVersionName: WORKFLOW_VERSION_NAME,
      workItemId: workItems[0]._id,
    });

    await t.mutation(internal.testing.tasquencer.failWorkItem, {
      workflowName: "parentCustom",
      workflowVersionName: WORKFLOW_VERSION_NAME,
      workItemId: workItems[0]._id,
    });
  }

  // Parent should still complete (policy says complete when all finalized)
  const parentWorkflow = await t.query(
    internal.testing.tasquencer.getWorkflowById,
    {
      workflowId: parentId,
    }
  );
  expect(parentWorkflow?.state).toBe("completed");
});

it("cancels non-finalized sibling workflows when parent fails", async () => {
  const t = setup();

  const parentId = await t.mutation(
    internal.testing.tasquencer.initializeRootWorkflow,
    {
      workflowName: "parentDefault",
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

  // Start WorkflowB so it is non-finalized when WorkflowA fails.
  const workflowBWorkItems = await t.query(
    internal.testing.tasquencer.getWorkflowTaskWorkItems,
    {
      workflowId: workflowBInstance._id,
      taskName: "taskB1",
    }
  );

  await t.mutation(internal.testing.tasquencer.startWorkItem, {
    workflowName: "parentDefault",
    workflowVersionName: WORKFLOW_VERSION_NAME,
    workItemId: workflowBWorkItems[0]._id,
  });

  // Fail WorkflowA to trigger parent failure (default policy).
  const workflowAWorkItems = await t.query(
    internal.testing.tasquencer.getWorkflowTaskWorkItems,
    {
      workflowId: workflowAInstance._id,
      taskName: "taskA1",
    }
  );

  await t.mutation(internal.testing.tasquencer.startWorkItem, {
    workflowName: "parentDefault",
    workflowVersionName: WORKFLOW_VERSION_NAME,
    workItemId: workflowAWorkItems[0]._id,
  });

  await t.mutation(internal.testing.tasquencer.failWorkItem, {
    workflowName: "parentDefault",
    workflowVersionName: WORKFLOW_VERSION_NAME,
    workItemId: workflowAWorkItems[0]._id,
  });

  // Parent fails due to policy; sibling workflow should be canceled.
  const canceledWorkflowB = await t.query(
    internal.testing.tasquencer.getWorkflowById,
    {
      workflowId: workflowBInstance._id,
    }
  );
  expect(canceledWorkflowB?.state).toBe("canceled");
});

it("cancels scheduled sub-workflow initializations on parent failure", async () => {
  const t = setup();

  internalVersionManagerRegistry.registerVersionManager(
    parentWithScheduleVersionManager
  );

  try {
    const parentId = await t.mutation(
      internal.testing.tasquencer.initializeRootWorkflow,
      {
        workflowName: "parentWithSchedule",
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

    expect(childWorkflows).toHaveLength(1);
    const workflowAInstance = childWorkflows[0];

    // Fail the only child to fail the parent workflow.
    const workItemsA = await t.query(
      internal.testing.tasquencer.getWorkflowTaskWorkItems,
      {
        workflowId: workflowAInstance._id,
        taskName: "taskA1",
      }
    );

    await t.mutation(internal.testing.tasquencer.startWorkItem, {
      workflowName: "parentWithSchedule",
      workflowVersionName: WORKFLOW_VERSION_NAME,
      workItemId: workItemsA[0]._id,
    });

    await t.mutation(internal.testing.tasquencer.failWorkItem, {
      workflowName: "parentWithSchedule",
      workflowVersionName: WORKFLOW_VERSION_NAME,
      workItemId: workItemsA[0]._id,
    });

    // Flush scheduled jobs; none should initialize because parent failed.
    await t.finishAllScheduledFunctions(vi.runAllTimersAsync);

    const childWorkflowsAfter = await t.query(
      internal.testing.tasquencer.getWorkflowCompositeTaskWorkflows,
      {
        workflowId: parentId,
        taskName: "dynamicComposite",
      }
    );

    expect(childWorkflowsAfter).toHaveLength(1);
  } finally {
    internalVersionManagerRegistry.unregisterVersionManager(
      parentWithScheduleVersionManager
    );
  }
});
