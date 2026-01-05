import { setup, Builder } from "./setup.test";
import { it, vi, beforeEach, afterEach } from "vitest";
import { internal } from "../../../convex/_generated/api";

import schema from "../../schema";
import { registerVersionManagersForTesting } from "./helpers/versionManager";

const WORKFLOW_VERSION_NAME = "v0";

const workflowDefinition = Builder.workflow("or-join-cancellation-region")
  .startCondition("start")
  .task(
    "A",
    Builder.noOpTask.withSplitType("and").withActivities({
      onEnabled: async ({ workItem }) => {
        await workItem.initialize();
      },
    })
  )
  .task(
    "B",
    Builder.noOpTask
      .withSplitType("and")
      .withJoinType("xor")
      .withActivities({
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
    Builder.noOpTask.withActivities({
      onEnabled: async ({ workItem }) => {
        await workItem.initialize();
      },
    })
  )
  .task(
    "E",
    Builder.noOpTask.withActivities({
      onEnabled: async ({ workItem }) => {
        await workItem.initialize();
      },
    })
  )
  .task(
    "F",
    Builder.noOpTask.withJoinType("and").withActivities({
      onEnabled: async ({ workItem }) => {
        await workItem.initialize();
      },
    })
  )
  .task(
    "G",
    Builder.noOpTask.withJoinType("or").withActivities({
      onEnabled: async ({ workItem }) => {
        await workItem.initialize();
      },
    })
  )
  .endCondition("end")
  .condition("bToB")
  .condition("bToDAndE")
  .connectCondition("start", (to) => to.task("A"))
  .connectTask("A", (to) => to.task("B").task("C"))
  .connectTask("B", (to) => to.condition("bToB").condition("bToDAndE"))
  .connectCondition("bToB", (to) => to.task("B"))
  .connectCondition("bToDAndE", (to) => to.task("D").task("E"))
  .connectTask("C", (to) => to.task("G"))
  .connectTask("D", (to) => to.task("F"))
  .connectTask("E", (to) => to.task("F"))
  .connectTask("F", (to) => to.task("G"))
  .connectTask("G", (to) => to.condition("end"))
  .withCancellationRegion("D", (cr) => cr.condition("bToB"));

let cleanupVersionManagers: () => void;

beforeEach(() => {
  vi.useFakeTimers();
  cleanupVersionManagers = registerVersionManagersForTesting({
    workflowName: "or-join-cancellation-region",
    versionName: WORKFLOW_VERSION_NAME,
    builder: workflowDefinition,
  });
});

afterEach(() => {
  vi.useRealTimers();
  cleanupVersionManagers();
});

it('runs a net with an "or" join and a cancellation region', async ({
  expect,
}) => {
  const t = setup();

  const id = await t.mutation(
    internal.testing.tasquencer.initializeRootWorkflow,
    {
      workflowName: "or-join-cancellation-region",
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
    workflowName: "or-join-cancellation-region",
    workItemId: workItemsA[0]._id,
    workflowVersionName: WORKFLOW_VERSION_NAME,
  });
  await t.mutation(internal.testing.tasquencer.completeWorkItem, {
    workflowName: "or-join-cancellation-region",
    workItemId: workItemsA[0]._id,
    workflowVersionName: WORKFLOW_VERSION_NAME,
  });

  // State 2: B and C are enabled
  const enabledTasks2 = await t.query(
    internal.testing.tasquencer.getWorkflowTasksByState,
    {
      workflowId: id,
      state: "enabled",
    }
  );
  expect(new Set(enabledTasks2.map((t) => t.name))).toEqual(
    new Set(["B", "C"])
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
    workflowName: "or-join-cancellation-region",
    workItemId: workItemsC[0]._id,
    workflowVersionName: WORKFLOW_VERSION_NAME,
  });
  await t.mutation(internal.testing.tasquencer.completeWorkItem, {
    workflowName: "or-join-cancellation-region",
    workItemId: workItemsC[0]._id,
    workflowVersionName: WORKFLOW_VERSION_NAME,
  });

  // State 3: B is enabled
  const enabledTasks3 = await t.query(
    internal.testing.tasquencer.getWorkflowTasksByState,
    {
      workflowId: id,
      state: "enabled",
    }
  );
  expect(new Set(enabledTasks3.map((t) => t.name))).toEqual(new Set(["B"]));

  // Start B (first time)
  const workItemsB1 = await t.query(
    internal.testing.tasquencer.getWorkflowTaskWorkItems,
    {
      workflowId: id,
      taskName: "B",
    }
  );
  await t.mutation(internal.testing.tasquencer.startWorkItem, {
    workflowName: "or-join-cancellation-region",
    workItemId: workItemsB1[0]._id,
    workflowVersionName: WORKFLOW_VERSION_NAME,
  });
  await t.mutation(internal.testing.tasquencer.completeWorkItem, {
    workflowName: "or-join-cancellation-region",
    workItemId: workItemsB1[0]._id,
    workflowVersionName: WORKFLOW_VERSION_NAME,
  });

  // State 4: B, D, and E are enabled
  const enabledTasks4 = await t.query(
    internal.testing.tasquencer.getWorkflowTasksByState,
    {
      workflowId: id,
      state: "enabled",
    }
  );
  expect(new Set(enabledTasks4.map((t) => t.name))).toEqual(
    new Set(["B", "D", "E"])
  );

  // Start E
  const workItemsE = await t.query(
    internal.testing.tasquencer.getWorkflowTaskWorkItems,
    {
      workflowId: id,
      taskName: "E",
    }
  );
  await t.mutation(internal.testing.tasquencer.startWorkItem, {
    workflowName: "or-join-cancellation-region",
    workItemId: workItemsE[0]._id,
    workflowVersionName: WORKFLOW_VERSION_NAME,
  });
  await t.mutation(internal.testing.tasquencer.completeWorkItem, {
    workflowName: "or-join-cancellation-region",
    workItemId: workItemsE[0]._id,
    workflowVersionName: WORKFLOW_VERSION_NAME,
  });

  // State 5: B is enabled (D was canceled because bToB was not taken)
  const enabledTasks5 = await t.query(
    internal.testing.tasquencer.getWorkflowTasksByState,
    {
      workflowId: id,
      state: "enabled",
    }
  );
  expect(new Set(enabledTasks5.map((t) => t.name))).toEqual(new Set(["B"]));

  // Start B (second time)
  const workItemsB2 = await t.query(
    internal.testing.tasquencer.getWorkflowTaskWorkItems,
    {
      workflowId: id,
      taskName: "B",
    }
  );
  const workItemB2 = workItemsB2.filter((wi) => wi.state === "initialized")[0];
  await t.mutation(internal.testing.tasquencer.startWorkItem, {
    workflowName: "or-join-cancellation-region",
    workItemId: workItemB2._id,
    workflowVersionName: WORKFLOW_VERSION_NAME,
  });
  await t.mutation(internal.testing.tasquencer.completeWorkItem, {
    workflowName: "or-join-cancellation-region",
    workItemId: workItemB2._id,
    workflowVersionName: WORKFLOW_VERSION_NAME,
  });

  // State 6: B, D, and E are enabled again
  const enabledTasks6 = await t.query(
    internal.testing.tasquencer.getWorkflowTasksByState,
    {
      workflowId: id,
      state: "enabled",
    }
  );
  expect(new Set(enabledTasks6.map((t) => t.name))).toEqual(
    new Set(["B", "D", "E"])
  );

  // Start D
  const workItemsD = await t.query(
    internal.testing.tasquencer.getWorkflowTaskWorkItems,
    {
      workflowId: id,
      taskName: "D",
    }
  );
  const workItemD = workItemsD.filter((wi) => wi.state === "initialized")[0];
  await t.mutation(internal.testing.tasquencer.startWorkItem, {
    workflowName: "or-join-cancellation-region",
    workItemId: workItemD._id,
    workflowVersionName: WORKFLOW_VERSION_NAME,
  });
  await t.mutation(internal.testing.tasquencer.completeWorkItem, {
    workflowName: "or-join-cancellation-region",
    workItemId: workItemD._id,
    workflowVersionName: WORKFLOW_VERSION_NAME,
  });

  // State 7: F is enabled
  const enabledTasks7 = await t.query(
    internal.testing.tasquencer.getWorkflowTasksByState,
    {
      workflowId: id,
      state: "enabled",
    }
  );
  expect(new Set(enabledTasks7.map((t) => t.name))).toEqual(new Set(["F"]));

  // Start F
  const workItemsF = await t.query(
    internal.testing.tasquencer.getWorkflowTaskWorkItems,
    {
      workflowId: id,
      taskName: "F",
    }
  );
  await t.mutation(internal.testing.tasquencer.startWorkItem, {
    workflowName: "or-join-cancellation-region",
    workItemId: workItemsF[0]._id,
    workflowVersionName: WORKFLOW_VERSION_NAME,
  });
  await t.mutation(internal.testing.tasquencer.completeWorkItem, {
    workflowName: "or-join-cancellation-region",
    workItemId: workItemsF[0]._id,
    workflowVersionName: WORKFLOW_VERSION_NAME,
  });

  // State 8: G is enabled
  const enabledTasks8 = await t.query(
    internal.testing.tasquencer.getWorkflowTasksByState,
    {
      workflowId: id,
      state: "enabled",
    }
  );
  expect(new Set(enabledTasks8.map((t) => t.name))).toEqual(new Set(["G"]));

  // Start G
  const workItemsG = await t.query(
    internal.testing.tasquencer.getWorkflowTaskWorkItems,
    {
      workflowId: id,
      taskName: "G",
    }
  );
  await t.mutation(internal.testing.tasquencer.startWorkItem, {
    workflowName: "or-join-cancellation-region",
    workItemId: workItemsG[0]._id,
    workflowVersionName: WORKFLOW_VERSION_NAME,
  });
  await t.mutation(internal.testing.tasquencer.completeWorkItem, {
    workflowName: "or-join-cancellation-region",
    workItemId: workItemsG[0]._id,
    workflowVersionName: WORKFLOW_VERSION_NAME,
  });

  // State 9: Workflow is completed
  const workflowInstance = await t.query(
    internal.testing.tasquencer.getWorkflowById,
    {
      workflowId: id,
    }
  );
  expect(workflowInstance.state).toBe("completed");
});
