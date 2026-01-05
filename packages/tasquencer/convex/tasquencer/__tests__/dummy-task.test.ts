import { setup, Builder } from "./setup.test";
import { it, vi, beforeEach, afterEach } from "vitest";
import { internal } from "../../../convex/_generated/api";

import schema from "../../schema";
import { registerVersionManagersForTesting } from "./helpers/versionManager";

const WORKFLOW_VERSION_NAME = "v0";

const workflowDefinition = Builder.workflow("activities")
  .startCondition("start")
  .dummyTask("split", Builder.dummyTask())
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
  .dummyTask("join", Builder.dummyTask())
  .task(
    "t3",
    Builder.noOpTask.withJoinType("and").withActivities({
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
  .connectCondition("start", (to) => to.task("split"))
  .connectTask("split", (to) => to.task("t1").task("t2"))
  .connectTask("t1", (to) => to.task("join"))
  .connectTask("t2", (to) => to.task("join"))
  .connectTask("join", (to) => to.task("t3").task("t4"))
  .connectTask("t3", (to) => to.condition("end"))
  .connectTask("t4", (to) => to.condition("end"));

let cleanupVersionManagers: () => void;

beforeEach(() => {
  vi.useFakeTimers();
  cleanupVersionManagers = registerVersionManagersForTesting({
    workflowName: "activities",
    versionName: WORKFLOW_VERSION_NAME,
    builder: workflowDefinition,
  });
});

afterEach(() => {
  vi.useRealTimers();
  cleanupVersionManagers();
});

it("handles workflow completion in simple workflows", async ({ expect }) => {
  const t = setup();

  const id = await t.mutation(
    internal.testing.tasquencer.initializeRootWorkflow,
    {
      workflowName: "activities",
      workflowVersionName: WORKFLOW_VERSION_NAME,
    }
  );

  expect(id).toBeDefined();

  const enabledTasks1 = await t.query(
    internal.testing.tasquencer.getWorkflowTasksByState,
    {
      workflowId: id,
      state: "enabled",
    }
  );
  expect(new Set(enabledTasks1.map((t) => t.name))).toEqual(
    new Set(["t1", "t2"])
  );

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
    workflowName: "activities",
    workItemId: workItemsT1[0]._id,
    workflowVersionName: WORKFLOW_VERSION_NAME,
  });

  await t.mutation(internal.testing.tasquencer.completeWorkItem, {
    workflowName: "activities",
    workItemId: workItemsT1[0]._id,
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
    workflowName: "activities",
    workItemId: workItemsT2[0]._id,
    workflowVersionName: WORKFLOW_VERSION_NAME,
  });

  await t.mutation(internal.testing.tasquencer.completeWorkItem, {
    workflowName: "activities",
    workItemId: workItemsT2[0]._id,
    workflowVersionName: WORKFLOW_VERSION_NAME,
  });

  const enabledTasks2 = await t.query(
    internal.testing.tasquencer.getWorkflowTasksByState,
    {
      workflowId: id,
      state: "enabled",
    }
  );
  expect(new Set(enabledTasks2.map((t) => t.name))).toEqual(
    new Set(["t3", "t4"])
  );
});
