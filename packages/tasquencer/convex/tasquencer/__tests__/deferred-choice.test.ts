import { setup, Builder } from "./setup.test";
import { it, vi, beforeEach, afterEach } from "vitest";
import { internal } from "../../../convex/_generated/api";

import schema from "../../schema";
import { registerVersionManagersForTesting } from "./helpers/versionManager";

const WORKFLOW_VERSION_NAME = "v0";

const workflowDefinition = Builder.workflow("deferred-choice")
  .startCondition("start")
  .task(
    "t1",
    Builder.noOpTask.withActivities({
      onEnabled: async ({ workItem }) => {
        await workItem.initialize();
      },
    })
  )
  .task("t1_a", Builder.noOpTask)
  .task(
    "t2",
    Builder.noOpTask.withActivities({
      onEnabled: async ({ workItem }) => {
        await workItem.initialize();
      },
    })
  )
  .task("t2_a", Builder.noOpTask)
  .endCondition("end")
  .connectCondition("start", (to) => to.task("t1").task("t2"))
  .connectTask("t1", (to) => to.task("t1_a"))
  .connectTask("t2", (to) => to.task("t2_a"))
  .connectTask("t1_a", (to) => to.condition("end"))
  .connectTask("t2_a", (to) => to.condition("end"));

let cleanupVersionManagers: () => void;

beforeEach(() => {
  vi.useFakeTimers();
  cleanupVersionManagers = registerVersionManagersForTesting({
    workflowName: "deferred-choice",
    versionName: WORKFLOW_VERSION_NAME,
    builder: workflowDefinition,
  });
});

afterEach(() => {
  vi.useRealTimers();
  cleanupVersionManagers();
});

it("supports deferred choice pattern", async ({ expect }) => {
  const t = setup();

  const id = await t.mutation(
    internal.testing.tasquencer.initializeRootWorkflow,
    {
      workflowName: "deferred-choice",
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
  expect(enabledTasks1.map((t) => t.name)).toEqual(["t1", "t2"]);

  const workItems = await t.query(
    internal.testing.tasquencer.getWorkflowTaskWorkItems,
    {
      workflowId: id,
      taskName: "t1",
    }
  );
  expect(workItems.length).toBe(1);
  expect(workItems[0].state).toBe("initialized");

  const workItems2 = await t.query(
    internal.testing.tasquencer.getWorkflowTaskWorkItems,
    {
      workflowId: id,
      taskName: "t2",
    }
  );
  expect(workItems2.length).toBe(1);
  expect(workItems2[0].state).toBe("initialized");

  await t.mutation(internal.testing.tasquencer.startWorkItem, {
    workflowName: "deferred-choice",
    workItemId: workItems[0]._id,
    workflowVersionName: WORKFLOW_VERSION_NAME,
  });

  const enabledTasks2 = await t.query(
    internal.testing.tasquencer.getWorkflowTasksByState,
    {
      workflowId: id,
      state: "enabled",
    }
  );
  expect(enabledTasks2.length).toBe(0);

  const disabledTasks1 = await t.query(
    internal.testing.tasquencer.getWorkflowTasksByState,
    {
      workflowId: id,
      state: "disabled",
    }
  );

  expect(new Set(disabledTasks1.map((t) => t.name))).toEqual(
    new Set(["t2", "t2_a", "t1_a"])
  );

  const workItemsT2 = await t.query(
    internal.testing.tasquencer.getWorkflowTaskWorkItems,
    {
      workflowId: id,
      taskName: "t2",
    }
  );
  expect(workItemsT2.length).toBe(1);
  expect(workItemsT2[0].state).toBe("canceled");
});
