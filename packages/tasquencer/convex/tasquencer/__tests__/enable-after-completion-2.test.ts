import { setup, Builder } from "./setup.test";
import { it, vi, beforeEach, afterEach } from "vitest";
import { internal } from "../../_generated/api";

import { versionManagerFor } from "../versionManager";
import schema from "../../schema";
import { internalVersionManagerRegistry } from "../../testing/tasquencer";

const WORKFLOW_VERSION_NAME = "v0";

const workflowDefinition = Builder.workflow("enable-after-completion")
  .startCondition("start")
  .task(
    "a",
    Builder.noOpTask.withActivities({
      onEnabled: async ({ workItem }) => {
        await workItem.initialize();
      },
    })
  )
  .task(
    "b",
    Builder.noOpTask.withActivities({
      onEnabled: async ({ workItem }) => {
        await workItem.initialize();
      },
    })
  )
  .task(
    "c",
    Builder.noOpTask.withActivities({
      onEnabled: async ({ workItem }) => {
        await workItem.initialize();
      },
    })
  )
  .task(
    "d",
    Builder.noOpTask.withActivities({
      onEnabled: async ({ workItem }) => {
        await workItem.initialize();
      },
    })
  )
  .condition("postAB")
  .endCondition("end")
  .connectCondition("start", (to) => to.task("a"))
  .connectTask("a", (to) => to.task("b").condition("postAB"))
  .connectTask("b", (to) => to.condition("postAB"))
  .connectCondition("postAB", (to) => to.task("c"))
  .connectTask("c", (to) => to.task("d"))
  .connectTask("d", (to) => to.condition("end"));

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

it("enables task after completion if join is satisfied - 1", async ({
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
  expect(enabledTasks1[0].name).toBe("a");

  const workItemsA = await t.query(
    internal.testing.tasquencer.getWorkflowTaskWorkItems,
    {
      workflowId: id,
      taskName: "a",
    }
  );
  expect(workItemsA.length).toBe(1);
  expect(workItemsA[0].state).toBe("initialized");

  await t.mutation(internal.testing.tasquencer.startWorkItem, {
    workflowName: "enable-after-completion",
    workItemId: workItemsA[0]._id,
    workflowVersionName: WORKFLOW_VERSION_NAME,
  });

  await t.mutation(internal.testing.tasquencer.completeWorkItem, {
    workflowName: "enable-after-completion",
    workItemId: workItemsA[0]._id,
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
    new Set(["b", "c"])
  );

  const workItemsB = await t.query(
    internal.testing.tasquencer.getWorkflowTaskWorkItems,
    {
      workflowId: id,
      taskName: "b",
    }
  );
  expect(workItemsB.length).toBe(1);
  expect(workItemsB[0].state).toBe("initialized");

  await t.mutation(internal.testing.tasquencer.startWorkItem, {
    workflowName: "enable-after-completion",
    workItemId: workItemsB[0]._id,
    workflowVersionName: WORKFLOW_VERSION_NAME,
  });

  await t.mutation(internal.testing.tasquencer.completeWorkItem, {
    workflowName: "enable-after-completion",
    workItemId: workItemsB[0]._id,
    workflowVersionName: WORKFLOW_VERSION_NAME,
  });

  const workItemsC = await t.query(
    internal.testing.tasquencer.getWorkflowTaskWorkItems,
    {
      workflowId: id,
      taskName: "c",
    }
  );
  expect(workItemsC.length).toBe(1);
  expect(workItemsC[0].state).toBe("initialized");

  const enabledTasks3 = await t.query(
    internal.testing.tasquencer.getWorkflowTasksByState,
    {
      workflowId: id,
      state: "enabled",
    }
  );
  expect(enabledTasks3.length).toBe(1);
  expect(new Set(enabledTasks3.map((t) => t.name))).toEqual(new Set(["c"]));

  await t.mutation(internal.testing.tasquencer.startWorkItem, {
    workflowName: "enable-after-completion",
    workItemId: workItemsC[0]._id,
    workflowVersionName: WORKFLOW_VERSION_NAME,
  });

  await t.mutation(internal.testing.tasquencer.completeWorkItem, {
    workflowName: "enable-after-completion",
    workItemId: workItemsC[0]._id,
    workflowVersionName: WORKFLOW_VERSION_NAME,
  });

  const enabledTasks4 = await t.query(
    internal.testing.tasquencer.getWorkflowTasksByState,
    {
      workflowId: id,
      state: "enabled",
    }
  );

  expect(enabledTasks4.length).toBe(2);
  expect(new Set(enabledTasks4.map((t) => t.name))).toEqual(
    new Set(["d", "c"])
  );
});
