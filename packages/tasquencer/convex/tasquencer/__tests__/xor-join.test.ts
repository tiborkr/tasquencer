import { setup, Builder } from "./setup.test";
import { it, vi, beforeEach, afterEach } from "vitest";
import { internal } from "../../../convex/_generated/api";

import schema from "../../schema";
import { registerVersionManagersForTesting } from "./helpers/versionManager";

const WORKFLOW_VERSION_NAME = "v0";

const workflowDefinition = Builder.workflow("activities")
  .startCondition("start")
  .task(
    "initial_task",
    Builder.noOpTask.withActivities({
      onEnabled: async ({ workItem }) => {
        await workItem.initialize();
      },
    })
  )
  .condition("choice")
  .task(
    "task_a",
    Builder.noOpTask.withActivities({
      onEnabled: async ({ workItem }) => {
        await workItem.initialize();
      },
    })
  )
  .task(
    "task_b",
    Builder.noOpTask.withActivities({
      onEnabled: async ({ workItem }) => {
        await workItem.initialize();
      },
    })
  )
  .task(
    "task_c",
    Builder.noOpTask.withActivities({
      onEnabled: async ({ workItem }) => {
        await workItem.initialize();
      },
    })
  )
  .task(
    "finish_task",
    Builder.noOpTask.withJoinType("xor").withActivities({
      onEnabled: async ({ workItem }) => {
        await workItem.initialize();
      },
    })
  )
  .endCondition("end")
  .connectCondition("start", (to) => to.task("initial_task"))
  .connectTask("initial_task", (to) => to.condition("choice"))
  .connectCondition("choice", (to) =>
    to.task("task_a").task("task_b").task("task_c")
  )
  .connectTask("task_a", (to) => to.task("finish_task"))
  .connectTask("task_b", (to) => to.task("finish_task"))
  .connectTask("task_c", (to) => to.task("finish_task"))
  .connectTask("finish_task", (to) => to.condition("end"));

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

it('runs a net with "xor" join', async ({ expect }) => {
  const t = setup();

  const id = await t.mutation(
    internal.testing.tasquencer.initializeRootWorkflow,
    {
      workflowName: "activities",
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
  expect(enabledTasks1[0].name).toBe("initial_task");

  const workItemsInitialTask = await t.query(
    internal.testing.tasquencer.getWorkflowTaskWorkItems,
    {
      workflowId: id,
      taskName: "initial_task",
    }
  );
  expect(workItemsInitialTask.length).toBe(1);
  expect(workItemsInitialTask[0].state).toBe("initialized");

  await t.mutation(internal.testing.tasquencer.startWorkItem, {
    workflowName: "activities",
    workItemId: workItemsInitialTask[0]._id,
    workflowVersionName: WORKFLOW_VERSION_NAME,
  });

  await t.mutation(internal.testing.tasquencer.completeWorkItem, {
    workflowName: "activities",
    workItemId: workItemsInitialTask[0]._id,
    workflowVersionName: WORKFLOW_VERSION_NAME,
  });

  const enabledTasks2 = await t.query(
    internal.testing.tasquencer.getWorkflowTasksByState,
    {
      workflowId: id,
      state: "enabled",
    }
  );
  expect(enabledTasks2.length).toBe(3);
  expect(new Set(enabledTasks2.map((t) => t.name))).toEqual(
    new Set(["task_a", "task_b", "task_c"])
  );

  const workItemsTaskA = await t.query(
    internal.testing.tasquencer.getWorkflowTaskWorkItems,
    {
      workflowId: id,
      taskName: "task_a",
    }
  );
  expect(workItemsTaskA.length).toBe(1);
  expect(workItemsTaskA[0].state).toBe("initialized");

  const workItemsTaskB = await t.query(
    internal.testing.tasquencer.getWorkflowTaskWorkItems,
    {
      workflowId: id,
      taskName: "task_b",
    }
  );
  expect(workItemsTaskB.length).toBe(1);
  expect(workItemsTaskB[0].state).toBe("initialized");

  const workItemsTaskC = await t.query(
    internal.testing.tasquencer.getWorkflowTaskWorkItems,
    {
      workflowId: id,
      taskName: "task_c",
    }
  );
  expect(workItemsTaskC.length).toBe(1);
  expect(workItemsTaskC[0].state).toBe("initialized");

  await t.mutation(internal.testing.tasquencer.startWorkItem, {
    workflowName: "activities",
    workItemId: workItemsTaskA[0]._id,
    workflowVersionName: WORKFLOW_VERSION_NAME,
  });

  const workItemsTaskB2 = await t.query(
    internal.testing.tasquencer.getWorkflowTaskWorkItems,
    {
      workflowId: id,
      taskName: "task_b",
    }
  );
  expect(workItemsTaskB2.length).toBe(1);
  expect(workItemsTaskB2[0].state).toBe("canceled");

  const workItemsTaskC2 = await t.query(
    internal.testing.tasquencer.getWorkflowTaskWorkItems,
    {
      workflowId: id,
      taskName: "task_c",
    }
  );
  expect(workItemsTaskC2.length).toBe(1);
  expect(workItemsTaskC2[0].state).toBe("canceled");

  await t.mutation(internal.testing.tasquencer.completeWorkItem, {
    workflowName: "activities",
    workItemId: workItemsTaskA[0]._id,
    workflowVersionName: WORKFLOW_VERSION_NAME,
  });

  const enabledTasks3 = await t.query(
    internal.testing.tasquencer.getWorkflowTasksByState,
    {
      workflowId: id,
      state: "enabled",
    }
  );
  expect(enabledTasks3.length).toBe(1);
  expect(enabledTasks3[0].name).toBe("finish_task");
});
