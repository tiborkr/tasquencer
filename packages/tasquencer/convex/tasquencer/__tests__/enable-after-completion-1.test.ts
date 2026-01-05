import { setup, Builder } from "./setup.test";
import { it } from "vitest";
import { internal } from "../../_generated/api";

import { versionManagerFor } from "../versionManager";
import schema from "../../schema";
import { internalVersionManagerRegistry } from "../../testing/tasquencer";

const WORKFLOW_VERSION_NAME = "v0";

function makeWorkflowDefinition() {
  let aEnabledTimes = 0;
  return Builder.workflow("enable-after-completion")
    .startCondition("start")
    .task(
      "a",
      Builder.noOpTask
        .withSplitType("xor")
        .withJoinType("xor")
        .withActivities({
          onEnabled: async ({ workItem }) => {
            aEnabledTimes++;
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
    .condition("postA")
    .endCondition("end")
    .connectCondition("start", (to) => to.task("a"))
    .connectTask("a", (to) =>
      to
        .condition("postA")
        .condition("end")
        .route(async ({ route }) => {
          if (aEnabledTimes === 1) {
            return route.toCondition("postA");
          }
          return route.toCondition("end");
        })
    )
    .connectCondition("postA", (to) => to.task("a").task("b"))
    .connectTask("b", (to) => to.condition("end"));
}

/*it('enables task after completion if join is satisfied - 1', async ({
  expect,
}) => {
  const workflow = makeWorkflowDefinition().build()
  workflowRegistry.registerWorkflow(workflow)
  const t = convexTest(schema)

  const id = await t.mutation(internal.testing.tasquencer.initializeRootWorkflow, {
    workflowName: 'enable-after-completion',
  })

  const enabledTasks1 = await t.query(
    internal.testing.tasquencer.getWorkflowTasksByState,
    {
      workflowId: id,
      state: 'enabled',
    },
  )
  expect(enabledTasks1.length).toBe(1)
  expect(enabledTasks1[0].name).toBe('a')

  const workItemsA = await t.query(
    internal.testing.tasquencer.getWorkflowTaskWorkItems,
    {
      workflowId: id,
      taskName: 'a',
    },
  )
  expect(workItemsA.length).toBe(1)
  expect(workItemsA[0].state).toBe('initialized')

  await t.mutation(internal.testing.tasquencer.startWorkItem, {
    workflowName: 'enable-after-completion',
    workItemId: workItemsA[0]._id,
  })

  await t.mutation(internal.testing.tasquencer.completeWorkItem, {
    workflowName: 'enable-after-completion',
    workItemId: workItemsA[0]._id,
  })

  const enabledTasks2 = await t.query(
    internal.testing.tasquencer.getWorkflowTasksByState,
    {
      workflowId: id,
      state: 'enabled',
    },
  )
  expect(enabledTasks2.length).toBe(2)
  expect(new Set(enabledTasks2.map((t) => t.name))).toEqual(new Set(['a', 'b']))

  const workItemsA2 = await t.query(
    internal.testing.tasquencer.getWorkflowTaskWorkItems,
    {
      workflowId: id,
      taskName: 'a',
    },
  )
  expect(workItemsA2.length).toBe(1)
  expect(workItemsA2[0].state).toBe('initialized')

  await t.mutation(internal.testing.tasquencer.startWorkItem, {
    workflowName: 'enable-after-completion',
    workItemId: workItemsA2[0]._id,
  })

  const workItemsB = await t.query(
    internal.testing.tasquencer.getWorkflowTaskWorkItems,
    {
      workflowId: id,
      taskName: 'b',
    },
  )
  expect(workItemsB.length).toBe(1)
  expect(workItemsB[0].state).toBe('canceled')

  await t.mutation(internal.testing.tasquencer.completeWorkItem, {
    workflowName: 'enable-after-completion',
    workItemId: workItemsA2[0]._id,
  })

  const enabledTasks3 = await t.query(
    internal.testing.tasquencer.getWorkflowTasksByState,
    {
      workflowId: id,
      state: 'enabled',
    },
  )
  expect(enabledTasks3.length).toBe(0)

  const workflowInstance = await t.query(
    internal.testing.tasquencer.getWorkflowById,
    {
      workflowId: id,
    },
  )
  expect(workflowInstance.state).toBe('completed')

  workflowRegistry.unregisterWorkflow(workflow)
})*/

it("enables task after completion if join is satisfied - 1", async ({
  expect,
}) => {
  const versionManager = versionManagerFor("enable-after-completion")
    .registerVersion(WORKFLOW_VERSION_NAME, makeWorkflowDefinition())
    .build();
  internalVersionManagerRegistry.registerVersionManager(versionManager);
  const t = setup();

  try {
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
      new Set(["a", "b"])
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

    const workItemsA2 = await t.query(
      internal.testing.tasquencer.getWorkflowTaskWorkItems,
      {
        workflowId: id,
        taskName: "a",
      }
    );
    expect(workItemsA2.length).toBe(1);
    expect(workItemsA2[0].state).toBe("canceled");

    await t.mutation(internal.testing.tasquencer.completeWorkItem, {
      workflowName: "enable-after-completion",
      workItemId: workItemsB[0]._id,
      workflowVersionName: WORKFLOW_VERSION_NAME,
    });

    const enabledTasks3 = await t.query(
      internal.testing.tasquencer.getWorkflowTasksByState,
      {
        workflowId: id,
        state: "enabled",
      }
    );
    expect(enabledTasks3.length).toBe(0);

    const workflowInstance = await t.query(
      internal.testing.tasquencer.getWorkflowById,
      {
        workflowId: id,
      }
    );
    expect(workflowInstance.state).toBe("completed");
  } finally {
    internalVersionManagerRegistry.unregisterVersionManager(versionManager);
  }
});
