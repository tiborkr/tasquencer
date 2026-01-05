import { setup, Builder } from "./setup.test";
import { it, vi, beforeEach, afterEach } from "vitest";
import { internal } from "../../../convex/_generated/api";

import { versionManagerFor } from "../../../convex/tasquencer/versionManager";
import schema from "../../schema";
import { internalVersionManagerRegistry } from "../../testing/tasquencer";

const WORKFLOW_VERSION_NAME = "v0";

const workflowDefinition = Builder.workflow("enable-after-completion")
  .startCondition("start")
  .task(
    "t1",
    Builder.noOpTask.withActivities({
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
  .task(
    "t3",
    Builder.noOpTask.withJoinType("xor").withActivities({
      onEnabled: async ({ workItem }) => {
        await workItem.initialize();
      },
    })
  )
  .task(
    "t4",
    Builder.noOpTask.withActivities({
      onEnabled: async ({ workItem }) => {
        await workItem.initialize();
      },
    })
  )
  .endCondition("end")
  .connectCondition("start", (to) => to.task("t1"))
  .connectTask("t1", (to) => to.task("t2").task("t3"))
  .connectTask("t2", (to) => to.task("t3"))
  .connectTask("t3", (to) => to.task("t4"))
  .connectTask("t4", (to) => to.condition("end"));

const enableAfterCompletionVersionManager = versionManagerFor(
  "enable-after-completion"
)
  .registerVersion(WORKFLOW_VERSION_NAME, workflowDefinition)
  .build();

beforeEach(() => {
  vi.useFakeTimers();
  internalVersionManagerRegistry.registerVersionManager(
    enableAfterCompletionVersionManager
  );
});

afterEach(() => {
  vi.useRealTimers();
  internalVersionManagerRegistry.unregisterVersionManager(
    enableAfterCompletionVersionManager
  );
});

it("enables task after completion if join is satisfied - 3", async ({
  expect,
}) => {
  const t = setup();

  const id = await t.mutation(
    internal.testing.tasquencer.initializeRootWorkflow,
    {
      workflowName: "enable-after-completion",
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
    workflowName: "enable-after-completion",
    workItemId: workItemsT1[0]._id,
    workflowVersionName: WORKFLOW_VERSION_NAME,
  });

  await t.mutation(internal.testing.tasquencer.completeWorkItem, {
    workflowName: "enable-after-completion",
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

  const workItemsT3 = await t.query(
    internal.testing.tasquencer.getWorkflowTaskWorkItems,
    {
      workflowId: id,
      taskName: "t3",
    }
  );
  expect(workItemsT3.length).toBe(1);
  expect(workItemsT3[0].state).toBe("initialized");

  await t.mutation(internal.testing.tasquencer.startWorkItem, {
    workflowName: "enable-after-completion",
    workItemId: workItemsT3[0]._id,
    workflowVersionName: WORKFLOW_VERSION_NAME,
  });

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
    workflowName: "enable-after-completion",
    workItemId: workItemsT2[0]._id,
    workflowVersionName: WORKFLOW_VERSION_NAME,
  });

  await t.mutation(internal.testing.tasquencer.completeWorkItem, {
    workflowName: "enable-after-completion",
    workItemId: workItemsT2[0]._id,
    workflowVersionName: WORKFLOW_VERSION_NAME,
  });

  await t.mutation(internal.testing.tasquencer.completeWorkItem, {
    workflowName: "enable-after-completion",
    workItemId: workItemsT3[0]._id,
    workflowVersionName: WORKFLOW_VERSION_NAME,
  });

  const enabledTasks3 = await t.query(
    internal.testing.tasquencer.getWorkflowTasksByState,
    {
      workflowId: id,
      state: "enabled",
    }
  );

  expect(enabledTasks3.length).toBe(2);
  expect(new Set(enabledTasks3.map((t) => t.name))).toEqual(
    new Set(["t3", "t4"])
  );
});
