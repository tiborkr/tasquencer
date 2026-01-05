import { setup, Builder } from "./setup.test";
import { it, vi, beforeEach, afterEach } from "vitest";
import { internal } from "../../../convex/_generated/api";

import { versionManagerFor } from "../../../convex/tasquencer/versionManager";
import schema from "../../schema";
import { internalVersionManagerRegistry } from "../../testing/tasquencer";

const WORKFLOW_VERSION_NAME = "v0";

const subWorkflowDefinition = Builder.workflow("sub")
  .startCondition("start")
  .task(
    "subT1",
    Builder.noOpTask.withActivities({
      onEnabled: async ({ workItem }) => {
        await workItem.initialize();
      },
    })
  )
  .endCondition("end")
  .connectCondition("start", (to) => to.task("subT1"))
  .connectTask("subT1", (to) => to.condition("end"));

const workflowDefinition = Builder.workflow("main")
  .startCondition("start")
  .task(
    "t1",
    Builder.noOpTask.withSplitType("and").withActivities({
      onEnabled: async ({ workItem }) => {
        await workItem.initialize();
      },
    })
  )
  .task(
    "t2",
    Builder.noOpTask.withActivities({
      onEnabled: async ({ workItem }) => {
        await workItem.initialize();
      },
    })
  )
  .compositeTask(
    "t3",
    Builder.compositeTask(subWorkflowDefinition).withActivities({
      onEnabled: async ({ workflow }) => {
        await workflow.initialize();
      },
    })
  )
  .task(
    "t4",
    Builder.noOpTask.withJoinType("and").withActivities({
      onEnabled: async ({ workItem }) => {
        await workItem.initialize();
      },
    })
  )
  .endCondition("end")
  .connectCondition("start", (to) => to.task("t1"))
  .connectTask("t1", (to) => to.task("t2").task("t3"))
  .connectTask("t2", (to) => to.task("t4"))
  .connectTask("t3", (to) => to.task("t4"))
  .connectTask("t4", (to) => to.condition("end"));

const mainVersionManager = versionManagerFor("main")
  .registerVersion(WORKFLOW_VERSION_NAME, workflowDefinition)
  .build();

const subVersionManager = versionManagerFor("sub")
  .registerVersion(WORKFLOW_VERSION_NAME, subWorkflowDefinition)
  .build();

beforeEach(() => {
  vi.useFakeTimers();
  internalVersionManagerRegistry.registerVersionManager(mainVersionManager);
  internalVersionManagerRegistry.registerVersionManager(subVersionManager);
});

afterEach(() => {
  vi.useRealTimers();
  internalVersionManagerRegistry.unregisterVersionManager(mainVersionManager);
  internalVersionManagerRegistry.unregisterVersionManager(subVersionManager);
});

it("handles workflow completion in nested workflows", async ({ expect }) => {
  const t = setup();

  const id = await t.mutation(
    internal.testing.tasquencer.initializeRootWorkflow,
    {
      workflowName: "main",
      workflowVersionName: WORKFLOW_VERSION_NAME,
    }
  );

  const enabledTasks1 = await t.query(
    internal.testing.tasquencer.getWorkflowTasksByState,
    {
      workflowId: id,
      state: "enabled",
    }
  );
  expect(enabledTasks1.length).toBe(1);
  expect(enabledTasks1[0].name).toBe("t1");

  const workItemsT1 = await t.query(
    internal.testing.tasquencer.getWorkflowTaskWorkItems,
    {
      workflowId: id,
      taskName: "t1",
    }
  );
  expect(workItemsT1.length).toBe(1);
  expect(workItemsT1[0].state).toBe("initialized");

  await t.mutation(internal.testing.tasquencer.startWorkItem, {
    workflowName: "main",
    workItemId: workItemsT1[0]._id,
    workflowVersionName: WORKFLOW_VERSION_NAME,
  });
  await t.mutation(internal.testing.tasquencer.completeWorkItem, {
    workflowName: "main",
    workItemId: workItemsT1[0]._id,
    workflowVersionName: WORKFLOW_VERSION_NAME,
  });

  const enabledTasks2 = await t.query(
    internal.testing.tasquencer.getWorkflowTasksByState,
    {
      workflowId: id,
      state: "enabled",
    }
  );
  expect(enabledTasks2.length).toBe(2);
  expect(new Set(enabledTasks2.map((t) => t.name))).toEqual(
    new Set(["t2", "t3"])
  );

  const workItemsT2 = await t.query(
    internal.testing.tasquencer.getWorkflowTaskWorkItems,
    {
      workflowId: id,
      taskName: "t2",
    }
  );
  expect(workItemsT2.length).toBe(1);
  expect(workItemsT2[0].state).toBe("initialized");

  await t.mutation(internal.testing.tasquencer.startWorkItem, {
    workflowName: "main",
    workItemId: workItemsT2[0]._id,
    workflowVersionName: WORKFLOW_VERSION_NAME,
  });

  await t.mutation(internal.testing.tasquencer.completeWorkItem, {
    workflowName: "main",
    workItemId: workItemsT2[0]._id,
    workflowVersionName: WORKFLOW_VERSION_NAME,
  });

  const workflowsT3 = await t.query(
    internal.testing.tasquencer.getWorkflowCompositeTaskWorkflows,
    {
      workflowId: id,
      taskName: "t3",
    }
  );
  expect(workflowsT3.length).toBe(1);
  expect(workflowsT3[0].state).toBe("initialized");

  const workItemsT3SubSubT1 = await t.query(
    internal.testing.tasquencer.getWorkflowTaskWorkItems,
    {
      workflowId: workflowsT3[0]._id,
      taskName: "subT1",
    }
  );
  expect(workItemsT3SubSubT1.length).toBe(1);
  expect(workItemsT3SubSubT1[0].state).toBe("initialized");

  await t.mutation(internal.testing.tasquencer.startWorkItem, {
    workflowName: "main",
    workItemId: workItemsT3SubSubT1[0]._id,
    workflowVersionName: WORKFLOW_VERSION_NAME,
  });

  const workflowsT3_2 = await t.query(
    internal.testing.tasquencer.getWorkflowCompositeTaskWorkflows,
    {
      workflowId: id,
      taskName: "t3",
    }
  );
  expect(workflowsT3_2.length).toBe(1);
  expect(workflowsT3_2[0].state).toBe("started");

  const completedTasks = await t.query(
    internal.testing.tasquencer.getWorkflowTasksByState,
    {
      workflowId: id,
      state: "completed",
    }
  );
  expect(completedTasks.length).toBe(2);
  expect(completedTasks.map((t) => t.name)).toEqual(["t1", "t2"]);

  await t.mutation(internal.testing.tasquencer.cancelRootWorkflow, {
    workflowName: "main",
    workflowId: id,
    workflowVersionName: WORKFLOW_VERSION_NAME,
  });

  const canceledTasks2 = await t.query(
    internal.testing.tasquencer.getWorkflowTasksByState,
    {
      workflowId: id,
      state: "canceled",
    }
  );
  expect(canceledTasks2.length).toBe(1);
  expect(canceledTasks2[0].name).toBe("t3");

  const subWorkflowWorkItems = await t.query(
    internal.testing.tasquencer.getWorkflowTaskWorkItems,
    {
      workflowId: workflowsT3_2[0]._id,
      taskName: "subT1",
    }
  );
  expect(subWorkflowWorkItems.length).toBe(1);
  expect(subWorkflowWorkItems[0].state).toBe("canceled");

  const subWorkflowInstance = await t.query(
    internal.testing.tasquencer.getWorkflowById,
    {
      workflowId: workflowsT3_2[0]._id,
    }
  );
  expect(subWorkflowInstance.state).toBe("canceled");

  const workflowInstance = await t.query(
    internal.testing.tasquencer.getWorkflowById,
    {
      workflowId: id,
    }
  );
  expect(workflowInstance.state).toBe("canceled");
});
