import { setup, Builder } from "./setup.test";
import { it, vi, beforeEach, afterEach } from "vitest";
import { internal } from "../../../convex/_generated/api";

import schema from "../../schema";
import { registerVersionManagersForTesting } from "./helpers/versionManager";

const WORKFLOW_VERSION_NAME = "v0";

const workflowDefinition = Builder.workflow("interleaved-parallel")
  .startCondition("start")
  .condition("mutex")
  .task(
    "initial_task",
    Builder.noOpTask.withActivities({
      onEnabled: async ({ workItem }) => {
        await workItem.initialize();
      },
    })
  )
  .task(
    "task_a",
    Builder.noOpTask.withSplitType("and").withActivities({
      onEnabled: async ({ workItem }) => {
        await workItem.initialize();
      },
    })
  )
  .task(
    "task_b",
    Builder.noOpTask.withSplitType("and").withActivities({
      onEnabled: async ({ workItem }) => {
        await workItem.initialize();
      },
    })
  )
  .task(
    "task_c",
    Builder.noOpTask.withSplitType("and").withActivities({
      onEnabled: async ({ workItem }) => {
        await workItem.initialize();
      },
    })
  )
  .task(
    "task_d",
    Builder.noOpTask.withSplitType("and").withActivities({
      onEnabled: async ({ workItem }) => {
        await workItem.initialize();
      },
    })
  )
  .task(
    "finish_task",
    Builder.noOpTask.withJoinType("and").withActivities({
      onEnabled: async ({ workItem }) => {
        await workItem.initialize();
      },
    })
  )
  .endCondition("end")
  .connectCondition("start", (to) => to.task("initial_task"))
  .connectTask("initial_task", (to) =>
    to.condition("mutex").task("task_a").task("task_c")
  )
  .connectTask("task_a", (to) => to.task("task_b").condition("mutex"))
  .connectTask("task_b", (to) => to.task("finish_task").condition("mutex"))
  .connectTask("task_c", (to) => to.task("task_d").condition("mutex"))
  .connectTask("task_d", (to) => to.task("finish_task").condition("mutex"))
  .connectTask("finish_task", (to) => to.condition("end"))
  .connectCondition("mutex", (to) =>
    to.task("task_a").task("task_b").task("task_c").task("task_d")
  )
  .withCancellationRegion("finish_task", (cr) => cr.condition("mutex"));

let cleanupVersionManagers: () => void;

beforeEach(() => {
  vi.useFakeTimers();
  cleanupVersionManagers = registerVersionManagersForTesting({
    workflowName: "interleaved-parallel",
    versionName: WORKFLOW_VERSION_NAME,
    builder: workflowDefinition,
  });
});

afterEach(() => {
  vi.useRealTimers();
  cleanupVersionManagers();
});

it("supports the interleaved routing pattern", async ({ expect }) => {
  const t = setup();

  const id = await t.mutation(
    internal.testing.tasquencer.initializeRootWorkflow,
    {
      workflowName: "interleaved-parallel",
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
    new Set(["initial_task"])
  );

  const workItemsInitialTask = await t.query(
    internal.testing.tasquencer.getWorkflowTaskWorkItems,
    {
      workflowId: id,
      taskName: "initial_task",
    }
  );
  await t.mutation(internal.testing.tasquencer.startWorkItem, {
    workflowName: "interleaved-parallel",
    workItemId: workItemsInitialTask[0]._id,
    workflowVersionName: WORKFLOW_VERSION_NAME,
  });
  await t.mutation(internal.testing.tasquencer.completeWorkItem, {
    workflowName: "interleaved-parallel",
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
  expect(new Set(enabledTasks2.map((t) => t.name))).toEqual(
    new Set(["task_a", "task_c"])
  );

  const workItemsTaskA = await t.query(
    internal.testing.tasquencer.getWorkflowTaskWorkItems,
    {
      workflowId: id,
      taskName: "task_a",
    }
  );
  await t.mutation(internal.testing.tasquencer.startWorkItem, {
    workflowName: "interleaved-parallel",
    workItemId: workItemsTaskA[0]._id,
    workflowVersionName: WORKFLOW_VERSION_NAME,
  });
  await t.mutation(internal.testing.tasquencer.completeWorkItem, {
    workflowName: "interleaved-parallel",
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
  expect(new Set(enabledTasks3.map((t) => t.name))).toEqual(
    new Set(["task_c", "task_b"])
  );

  const workItemsTaskB = await t.query(
    internal.testing.tasquencer.getWorkflowTaskWorkItems,
    {
      workflowId: id,
      taskName: "task_b",
    }
  );
  await t.mutation(internal.testing.tasquencer.startWorkItem, {
    workflowName: "interleaved-parallel",
    workItemId: workItemsTaskB[0]._id,
    workflowVersionName: WORKFLOW_VERSION_NAME,
  });
  await t.mutation(internal.testing.tasquencer.completeWorkItem, {
    workflowName: "interleaved-parallel",
    workItemId: workItemsTaskB[0]._id,
    workflowVersionName: WORKFLOW_VERSION_NAME,
  });

  const enabledTasks4 = await t.query(
    internal.testing.tasquencer.getWorkflowTasksByState,
    {
      workflowId: id,
      state: "enabled",
    }
  );
  expect(new Set(enabledTasks4.map((t) => t.name))).toEqual(
    new Set(["task_c"])
  );

  const workItemsTaskC = await t.query(
    internal.testing.tasquencer.getWorkflowTaskWorkItems,
    {
      workflowId: id,
      taskName: "task_c",
    }
  );
  await t.mutation(internal.testing.tasquencer.startWorkItem, {
    workflowName: "interleaved-parallel",
    workItemId: workItemsTaskC[0]._id,
    workflowVersionName: WORKFLOW_VERSION_NAME,
  });
  await t.mutation(internal.testing.tasquencer.completeWorkItem, {
    workflowName: "interleaved-parallel",
    workItemId: workItemsTaskC[0]._id,
    workflowVersionName: WORKFLOW_VERSION_NAME,
  });

  const enabledTasks5 = await t.query(
    internal.testing.tasquencer.getWorkflowTasksByState,
    {
      workflowId: id,
      state: "enabled",
    }
  );
  expect(new Set(enabledTasks5.map((t) => t.name))).toEqual(
    new Set(["task_d"])
  );

  const workItemsTaskD = await t.query(
    internal.testing.tasquencer.getWorkflowTaskWorkItems,
    {
      workflowId: id,
      taskName: "task_d",
    }
  );
  await t.mutation(internal.testing.tasquencer.startWorkItem, {
    workflowName: "interleaved-parallel",
    workItemId: workItemsTaskD[0]._id,
    workflowVersionName: WORKFLOW_VERSION_NAME,
  });
  await t.mutation(internal.testing.tasquencer.completeWorkItem, {
    workflowName: "interleaved-parallel",
    workItemId: workItemsTaskD[0]._id,
    workflowVersionName: WORKFLOW_VERSION_NAME,
  });

  const enabledTasks6 = await t.query(
    internal.testing.tasquencer.getWorkflowTasksByState,
    {
      workflowId: id,
      state: "enabled",
    }
  );
  expect(new Set(enabledTasks6.map((t) => t.name))).toEqual(
    new Set(["finish_task"])
  );

  const workItemsFinishTask = await t.query(
    internal.testing.tasquencer.getWorkflowTaskWorkItems,
    {
      workflowId: id,
      taskName: "finish_task",
    }
  );
  await t.mutation(internal.testing.tasquencer.startWorkItem, {
    workflowName: "interleaved-parallel",
    workItemId: workItemsFinishTask[0]._id,
    workflowVersionName: WORKFLOW_VERSION_NAME,
  });
  await t.mutation(internal.testing.tasquencer.completeWorkItem, {
    workflowName: "interleaved-parallel",
    workItemId: workItemsFinishTask[0]._id,
    workflowVersionName: WORKFLOW_VERSION_NAME,
  });

  const workflowInstance = await t.query(
    internal.testing.tasquencer.getWorkflowById,
    {
      workflowId: id,
    }
  );
  expect(workflowInstance.state).toBe("completed");
});
