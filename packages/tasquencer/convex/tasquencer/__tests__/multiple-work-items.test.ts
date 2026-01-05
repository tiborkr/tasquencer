import { setup, Builder } from "./setup.test";
import { it, vi, beforeEach, afterEach } from "vitest";
import { internal } from "../../../convex/_generated/api";

import schema from "../../schema";
import { registerVersionManagersForTesting } from "./helpers/versionManager";

const WORKFLOW_VERSION_NAME = "v0";

const workflowDefinition = Builder.workflow("activities")
  .startCondition("start")
  .task(
    "t1",
    Builder.noOpTask.withActivities({
      onEnabled: async ({ workItem }) => {
        await workItem.initialize();
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
  .endCondition("end")
  .connectCondition("start", (to) => to.task("t1"))
  .connectTask("t1", (to) => to.task("t2"))
  .connectTask("t2", (to) => to.condition("end"));

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

  const tasks = await t.query(internal.testing.tasquencer.getWorkflowTasks, {
    workflowId: id,
  });
  expect(new Set(tasks.map((t) => t.name))).toEqual(new Set(["t1", "t2"]));

  const conditions = await t.query(
    internal.testing.tasquencer.getWorkflowConditions,
    {
      workflowId: id,
    }
  );

  expect(new Set(conditions.map((c) => c.name))).toEqual(
    new Set(["start", "end", "t1__to__t2"])
  );

  const enabledTasks1 = await t.query(
    internal.testing.tasquencer.getWorkflowTasksByState,
    {
      workflowId: id,
      state: "enabled",
    }
  );

  expect(new Set(enabledTasks1.map((t) => t.name))).toEqual(new Set(["t1"]));
  expect(enabledTasks1[0]).toMatchObject({
    name: "t1",
    state: "enabled",
    generation: 1,
  });

  const workItems1 = await t.query(
    internal.testing.tasquencer.getWorkflowTaskWorkItems,
    {
      workflowId: id,
      taskName: "t1",
    }
  );
  expect(workItems1.length).toBe(2);
  expect(workItems1.every((w) => w.state === "initialized")).toBeTruthy();

  await t.mutation(internal.testing.tasquencer.startWorkItem, {
    workflowName: "activities",
    workItemId: workItems1[0]._id,
    workflowVersionName: WORKFLOW_VERSION_NAME,
  });

  await t.mutation(internal.testing.tasquencer.completeWorkItem, {
    workflowName: "activities",
    workItemId: workItems1[0]._id,
    workflowVersionName: WORKFLOW_VERSION_NAME,
  });

  const workflowInstance1 = await t.query(
    internal.testing.tasquencer.getWorkflowById,
    {
      workflowId: id,
    }
  );

  expect(workflowInstance1.state).toBe("started");

  const startedTasks1 = await t.query(
    internal.testing.tasquencer.getWorkflowTasksByState,
    {
      workflowId: id,
      state: "started",
    }
  );
  expect(startedTasks1.length).toBe(1);
  expect(startedTasks1[0].name).toBe("t1");

  await t.mutation(internal.testing.tasquencer.startWorkItem, {
    workflowName: "activities",
    workItemId: workItems1[1]._id,
    workflowVersionName: WORKFLOW_VERSION_NAME,
  });

  await t.mutation(internal.testing.tasquencer.completeWorkItem, {
    workflowName: "activities",
    workItemId: workItems1[1]._id,
    workflowVersionName: WORKFLOW_VERSION_NAME,
  });

  const completedTasks1 = await t.query(
    internal.testing.tasquencer.getWorkflowTasksByState,
    {
      workflowId: id,
      state: "completed",
    }
  );
  expect(completedTasks1.length).toBe(1);
  expect(completedTasks1[0].name).toBe("t1");
});
