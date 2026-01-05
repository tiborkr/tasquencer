import { setup, Builder } from "./setup.test";
import { it, vi, beforeEach, afterEach } from "vitest";
import { internal } from "../../../convex/_generated/api";

import schema from "../../schema";
import { registerVersionManagersForTesting } from "./helpers/versionManager";

const WORKFLOW_VERSION_NAME = "v0";

const workflowDefinition = Builder.workflow("or-join-loop-cancellation-region")
  .startCondition("start")
  .task(
    "A",
    Builder.noOpTask.withActivities({
      onEnabled: async ({ workItem }) => {
        await workItem.initialize();
      },
    })
  )
  .task(
    "B",
    Builder.noOpTask.withActivities({
      onEnabled: async ({ workItem }) => {
        await workItem.initialize();
      },
    })
  )
  .task(
    "C",
    Builder.noOpTask.withActivities({
      onEnabled: async ({ workItem }) => {
        await workItem.initialize();
      },
    })
  )
  .task(
    "D",
    Builder.noOpTask.withSplitType("and").withActivities({
      onEnabled: async ({ workItem }) => {
        await workItem.initialize();
      },
    })
  )
  .task(
    "E",
    Builder.noOpTask.withJoinType("or").withActivities({
      onEnabled: async ({ workItem }) => {
        await workItem.initialize();
      },
    })
  )
  .condition("c1")
  .condition("c2")
  .condition("c3")
  .endCondition("end")
  .connectCondition("start", (to) => to.task("A"))
  .connectTask("A", (to) => to.condition("c1"))
  .connectCondition("c1", (to) => to.task("B"))
  .connectTask("B", (to) => to.condition("c2"))
  .connectCondition("c2", (to) => to.task("C").task("E"))
  .connectTask("C", (to) => to.condition("c3"))
  .connectCondition("c3", (to) => to.task("D").task("E"))
  .connectTask("D", (to) => to.condition("c1").condition("c2"))
  .connectTask("E", (to) => to.condition("end"))
  .withCancellationRegion("C", (cr) =>
    cr.task("B").condition("c1").condition("c2")
  );

let cleanupVersionManagers: () => void;

beforeEach(() => {
  vi.useFakeTimers();
  cleanupVersionManagers = registerVersionManagersForTesting({
    workflowName: "or-join-loop-cancellation-region",
    versionName: WORKFLOW_VERSION_NAME,
    builder: workflowDefinition,
  });
});

afterEach(() => {
  vi.useRealTimers();
  cleanupVersionManagers();
});

it('runs a net with an "or" join, a loop and a cancellation region', async ({
  expect,
}) => {
  const t = setup();

  const id = await t.mutation(
    internal.testing.tasquencer.initializeRootWorkflow,
    {
      workflowName: "or-join-loop-cancellation-region",
      workflowVersionName: WORKFLOW_VERSION_NAME,
    }
  );

  expect(id).toBeDefined();

  // State 1: A is enabled
  const enabledTasks1 = await t.query(
    internal.testing.tasquencer.getWorkflowTasksByState,
    {
      workflowId: id,
      state: "enabled",
    }
  );
  expect(new Set(enabledTasks1.map((t) => t.name))).toEqual(new Set(["A"]));

  // Start A
  const workItemsA = await t.query(
    internal.testing.tasquencer.getWorkflowTaskWorkItems,
    {
      workflowId: id,
      taskName: "A",
    }
  );
  await t.mutation(internal.testing.tasquencer.startWorkItem, {
    workflowName: "or-join-loop-cancellation-region",
    workItemId: workItemsA[0]._id,
    workflowVersionName: WORKFLOW_VERSION_NAME,
  });
  await t.mutation(internal.testing.tasquencer.completeWorkItem, {
    workflowName: "or-join-loop-cancellation-region",
    workItemId: workItemsA[0]._id,
    workflowVersionName: WORKFLOW_VERSION_NAME,
  });

  // State 2: B is enabled
  const enabledTasks2 = await t.query(
    internal.testing.tasquencer.getWorkflowTasksByState,
    {
      workflowId: id,
      state: "enabled",
    }
  );
  expect(new Set(enabledTasks2.map((t) => t.name))).toEqual(new Set(["B"]));

  // Start B
  const workItemsB = await t.query(
    internal.testing.tasquencer.getWorkflowTaskWorkItems,
    {
      workflowId: id,
      taskName: "B",
    }
  );
  await t.mutation(internal.testing.tasquencer.startWorkItem, {
    workflowName: "or-join-loop-cancellation-region",
    workItemId: workItemsB[0]._id,
    workflowVersionName: WORKFLOW_VERSION_NAME,
  });
  await t.mutation(internal.testing.tasquencer.completeWorkItem, {
    workflowName: "or-join-loop-cancellation-region",
    workItemId: workItemsB[0]._id,
    workflowVersionName: WORKFLOW_VERSION_NAME,
  });

  // State 3: C and E are enabled
  const enabledTasks3 = await t.query(
    internal.testing.tasquencer.getWorkflowTasksByState,
    {
      workflowId: id,
      state: "enabled",
    }
  );
  expect(new Set(enabledTasks3.map((t) => t.name))).toEqual(
    new Set(["C", "E"])
  );

  // Start C
  const workItemsC = await t.query(
    internal.testing.tasquencer.getWorkflowTaskWorkItems,
    {
      workflowId: id,
      taskName: "C",
    }
  );
  await t.mutation(internal.testing.tasquencer.startWorkItem, {
    workflowName: "or-join-loop-cancellation-region",
    workItemId: workItemsC[0]._id,
    workflowVersionName: WORKFLOW_VERSION_NAME,
  });
  await t.mutation(internal.testing.tasquencer.completeWorkItem, {
    workflowName: "or-join-loop-cancellation-region",
    workItemId: workItemsC[0]._id,
    workflowVersionName: WORKFLOW_VERSION_NAME,
  });

  // State 4: D is enabled (E is still enabled but not yet satisfied)
  const enabledTasks4 = await t.query(
    internal.testing.tasquencer.getWorkflowTasksByState,
    {
      workflowId: id,
      state: "enabled",
    }
  );
  expect(new Set(enabledTasks4.map((t) => t.name))).toEqual(new Set(["D"]));

  // Start D
  const workItemsD = await t.query(
    internal.testing.tasquencer.getWorkflowTaskWorkItems,
    {
      workflowId: id,
      taskName: "D",
    }
  );
  await t.mutation(internal.testing.tasquencer.startWorkItem, {
    workflowName: "or-join-loop-cancellation-region",
    workItemId: workItemsD[0]._id,
    workflowVersionName: WORKFLOW_VERSION_NAME,
  });
  await t.mutation(internal.testing.tasquencer.completeWorkItem, {
    workflowName: "or-join-loop-cancellation-region",
    workItemId: workItemsD[0]._id,
    workflowVersionName: WORKFLOW_VERSION_NAME,
  });

  // State 5: B, C, and E are enabled (loop back from D)
  const enabledTasks5 = await t.query(
    internal.testing.tasquencer.getWorkflowTasksByState,
    {
      workflowId: id,
      state: "enabled",
    }
  );
  expect(new Set(enabledTasks5.map((t) => t.name))).toEqual(
    new Set(["B", "C", "E"])
  );

  // Start and complete C (second time) - this should trigger the cancellation region on completion!
  // The cancellation region should cancel B and remove tokens from c1 and c2
  const workItemsC2 = await t.query(
    internal.testing.tasquencer.getWorkflowTaskWorkItems,
    {
      workflowId: id,
      taskName: "C",
    }
  );
  const workItemC2 = workItemsC2.filter((wi) => wi.state === "initialized")[0];
  await t.mutation(internal.testing.tasquencer.startWorkItem, {
    workflowName: "or-join-loop-cancellation-region",
    workItemId: workItemC2._id,
    workflowVersionName: WORKFLOW_VERSION_NAME,
  });

  // After C starts but before completion, B should NOT yet be canceled
  const tasksAfterCStarts = await t.query(
    internal.testing.tasquencer.getWorkflowTasksByState,
    {
      workflowId: id,
      state: "enabled",
    }
  );
  expect(new Set(tasksAfterCStarts.map((t) => t.name))).toEqual(new Set(["B"]));

  await t.mutation(internal.testing.tasquencer.completeWorkItem, {
    workflowName: "or-join-loop-cancellation-region",
    workItemId: workItemC2._id,
    workflowVersionName: WORKFLOW_VERSION_NAME,
  });

  // After C completes, B should be canceled by the cancellation region
  const canceledTasksAfterC = await t.query(
    internal.testing.tasquencer.getWorkflowTasksByState,
    {
      workflowId: id,
      state: "canceled",
    }
  );
  expect(new Set(canceledTasksAfterC.map((t) => t.name))).toEqual(
    new Set(["B"])
  );

  // B's work items should also be canceled
  const workItemsB_after = await t.query(
    internal.testing.tasquencer.getWorkflowTaskWorkItems,
    {
      workflowId: id,
      taskName: "B",
    }
  );
  const canceledWorkItems = workItemsB_after.filter(
    (wi) => wi.state === "canceled"
  );
  expect(canceledWorkItems.length).toBeGreaterThan(0);

  // State 6: After C completes, D should be enabled
  // E was disabled when c2 was canceled, even though it has OR join and c3 might have tokens
  // This is expected behavior: when a condition is canceled, it disables dependent tasks
  // They can be re-enabled when new tokens arrive
  const enabledTasks6 = await t.query(
    internal.testing.tasquencer.getWorkflowTasksByState,
    {
      workflowId: id,
      state: "enabled",
    }
  );
  expect(new Set(enabledTasks6.map((t) => t.name))).toEqual(new Set(["D"]));

  // Start D to produce tokens in c1 and c2, which will re-enable E
  const workItemsD2 = await t.query(
    internal.testing.tasquencer.getWorkflowTaskWorkItems,
    {
      workflowId: id,
      taskName: "D",
    }
  );
  const workItemD2 = workItemsD2.filter((wi) => wi.state === "initialized")[0];
  await t.mutation(internal.testing.tasquencer.startWorkItem, {
    workflowName: "or-join-loop-cancellation-region",
    workItemId: workItemD2._id,
    workflowVersionName: WORKFLOW_VERSION_NAME,
  });
  await t.mutation(internal.testing.tasquencer.completeWorkItem, {
    workflowName: "or-join-loop-cancellation-region",
    workItemId: workItemD2._id,
    workflowVersionName: WORKFLOW_VERSION_NAME,
  });

  // State 7: After D completes, C and E should be enabled (via c2), and B (via c1)
  const enabledTasks7 = await t.query(
    internal.testing.tasquencer.getWorkflowTasksByState,
    {
      workflowId: id,
      state: "enabled",
    }
  );
  // B, C, and E are re-enabled by the loop
  expect(new Set(enabledTasks7.map((t) => t.name))).toEqual(
    new Set(["B", "C", "E"])
  );

  // Start E to complete the workflow
  const workItemsE = await t.query(
    internal.testing.tasquencer.getWorkflowTaskWorkItems,
    {
      workflowId: id,
      taskName: "E",
    }
  );
  const workItemE = workItemsE.filter((wi) => wi.state === "initialized")[0];
  await t.mutation(internal.testing.tasquencer.startWorkItem, {
    workflowName: "or-join-loop-cancellation-region",
    workItemId: workItemE._id,
    workflowVersionName: WORKFLOW_VERSION_NAME,
  });
  await t.mutation(internal.testing.tasquencer.completeWorkItem, {
    workflowName: "or-join-loop-cancellation-region",
    workItemId: workItemE._id,
    workflowVersionName: WORKFLOW_VERSION_NAME,
  });

  // State 8: Workflow completes
  const workflowInstance8 = await t.query(
    internal.testing.tasquencer.getWorkflowById,
    {
      workflowId: id,
    }
  );
  expect(workflowInstance8.state).toBe("completed");
});
