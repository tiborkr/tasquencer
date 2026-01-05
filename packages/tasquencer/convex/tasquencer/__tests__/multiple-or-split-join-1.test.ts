import { setup, Builder } from "./setup.test";
import { it, vi, beforeEach, afterEach } from "vitest";
import { internal } from "../../../convex/_generated/api";

import schema from "../../schema";
import { withVersionManagerBuilders } from "./helpers/versionManager";

const WORKFLOW_VERSION_NAME = "v0";

function makeWorkflowDefinition(isTaskDEnabled: boolean) {
  return Builder.workflow("multiple-or-split-join-1")
    .startCondition("start")
    .task(
      "A",
      Builder.noOpTask.withActivities({
        onEnabled: async ({ workItem }) => {
          await workItem.initialize();
        },
      })
    )
    .task(
      "B",
      Builder.noOpTask.withActivities({
        onEnabled: async ({ workItem }) => {
          await workItem.initialize();
        },
      })
    )
    .task(
      "C",
      Builder.noOpTask.withSplitType("or").withActivities({
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
      Builder.noOpTask.withJoinType("or").withActivities({
        onEnabled: async ({ workItem }) => {
          await workItem.initialize();
        },
      })
    )
    .task(
      "F",
      Builder.noOpTask.withJoinType("or").withActivities({
        onEnabled: async ({ workItem }) => {
          await workItem.initialize();
        },
      })
    )
    .endCondition("end")
    .connectCondition("start", (to) => to.task("A"))
    .connectTask("A", (to) => to.task("B").task("C"))
    .connectTask("B", (to) => to.task("F"))
    .connectTask("C", (to) =>
      to
        .task("D")
        .task("E")
        .route(async ({ route }) => {
          return isTaskDEnabled
            ? [route.toTask("D"), route.toTask("E")]
            : [route.toTask("E")];
        })
    )
    .connectTask("D", (to) => to.task("E"))
    .connectTask("E", (to) => to.task("F"))
    .connectTask("F", (to) => to.condition("end"));
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

it("multiple-or-split-join-1 (D Enabled)", async ({ expect }) => {
  await withVersionManagerBuilders(
    {
      workflowName: "multiple-or-split-join-1",
      versionName: WORKFLOW_VERSION_NAME,
      builder: makeWorkflowDefinition(true),
    },
    async () => {
      const t = setup();

      const id = await t.mutation(
        internal.testing.tasquencer.initializeRootWorkflow,
        {
          workflowName: "multiple-or-split-join-1",
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
      expect(enabledTasks1[0].name).toBe("A");

      const workItemsA = await t.query(
        internal.testing.tasquencer.getWorkflowTaskWorkItems,
        {
          workflowId: id,
          taskName: "A",
        }
      );
      expect(workItemsA.length).toBe(1);
      expect(workItemsA[0].state).toBe("initialized");

      await t.mutation(internal.testing.tasquencer.startWorkItem, {
        workflowName: "multiple-or-split-join-1",
        workItemId: workItemsA[0]._id,
        workflowVersionName: WORKFLOW_VERSION_NAME,
      });
      await t.mutation(internal.testing.tasquencer.completeWorkItem, {
        workflowName: "multiple-or-split-join-1",
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
        new Set(["B", "C"])
      );

      const workItemsB = await t.query(
        internal.testing.tasquencer.getWorkflowTaskWorkItems,
        {
          workflowId: id,
          taskName: "B",
        }
      );
      expect(workItemsB.length).toBe(1);
      expect(workItemsB[0].state).toBe("initialized");
      await t.mutation(internal.testing.tasquencer.startWorkItem, {
        workflowName: "multiple-or-split-join-1",
        workItemId: workItemsB[0]._id,
        workflowVersionName: WORKFLOW_VERSION_NAME,
      });
      await t.mutation(internal.testing.tasquencer.completeWorkItem, {
        workflowName: "multiple-or-split-join-1",
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
      expect(enabledTasks3.length).toBe(1);
      expect(enabledTasks3[0].name).toBe("C");

      const workItemsC = await t.query(
        internal.testing.tasquencer.getWorkflowTaskWorkItems,
        {
          workflowId: id,
          taskName: "C",
        }
      );
      expect(workItemsC.length).toBe(1);
      expect(workItemsC[0].state).toBe("initialized");
      await t.mutation(internal.testing.tasquencer.startWorkItem, {
        workflowName: "multiple-or-split-join-1",
        workItemId: workItemsC[0]._id,
        workflowVersionName: WORKFLOW_VERSION_NAME,
      });
      await t.mutation(internal.testing.tasquencer.completeWorkItem, {
        workflowName: "multiple-or-split-join-1",
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
      expect(enabledTasks4.length).toBe(1);
      expect(new Set(enabledTasks4.map((t) => t.name))).toEqual(new Set(["D"]));

      const workItemsD = await t.query(
        internal.testing.tasquencer.getWorkflowTaskWorkItems,
        {
          workflowId: id,
          taskName: "D",
        }
      );
      expect(workItemsD.length).toBe(1);
      expect(workItemsD[0].state).toBe("initialized");
      await t.mutation(internal.testing.tasquencer.startWorkItem, {
        workflowName: "multiple-or-split-join-1",
        workItemId: workItemsD[0]._id,
        workflowVersionName: WORKFLOW_VERSION_NAME,
      });
      await t.mutation(internal.testing.tasquencer.completeWorkItem, {
        workflowName: "multiple-or-split-join-1",
        workItemId: workItemsD[0]._id,
        workflowVersionName: WORKFLOW_VERSION_NAME,
      });

      const enabledTasks5 = await t.query(
        internal.testing.tasquencer.getWorkflowTasksByState,
        {
          workflowId: id,
          state: "enabled",
        }
      );
      expect(enabledTasks5.length).toBe(1);
      expect(enabledTasks5[0].name).toBe("E");

      const workItemsE = await t.query(
        internal.testing.tasquencer.getWorkflowTaskWorkItems,
        {
          workflowId: id,
          taskName: "E",
        }
      );
      expect(workItemsE.length).toBe(1);
      expect(workItemsE[0].state).toBe("initialized");

      await t.mutation(internal.testing.tasquencer.startWorkItem, {
        workflowName: "multiple-or-split-join-1",
        workItemId: workItemsE[0]._id,
        workflowVersionName: WORKFLOW_VERSION_NAME,
      });
      await t.mutation(internal.testing.tasquencer.completeWorkItem, {
        workflowName: "multiple-or-split-join-1",
        workItemId: workItemsE[0]._id,
        workflowVersionName: WORKFLOW_VERSION_NAME,
      });

      const enabledTasks6 = await t.query(
        internal.testing.tasquencer.getWorkflowTasksByState,
        {
          workflowId: id,
          state: "enabled",
        }
      );
      expect(enabledTasks6.length).toBe(1);
      expect(enabledTasks6[0].name).toBe("F");

      const workItemsF = await t.query(
        internal.testing.tasquencer.getWorkflowTaskWorkItems,
        {
          workflowId: id,
          taskName: "F",
        }
      );
      expect(workItemsF.length).toBe(1);
      expect(workItemsF[0].state).toBe("initialized");

      await t.mutation(internal.testing.tasquencer.startWorkItem, {
        workflowName: "multiple-or-split-join-1",
        workItemId: workItemsF[0]._id,
        workflowVersionName: WORKFLOW_VERSION_NAME,
      });
      await t.mutation(internal.testing.tasquencer.completeWorkItem, {
        workflowName: "multiple-or-split-join-1",
        workItemId: workItemsF[0]._id,
        workflowVersionName: WORKFLOW_VERSION_NAME,
      });

      const workflowInstance = await t.query(
        internal.testing.tasquencer.getWorkflowById,
        {
          workflowId: id,
        }
      );
      expect(workflowInstance.state).toBe("completed");
    }
  );
});

it("multiple-or-split-join-1 (D Disabled)", async ({ expect }) => {
  await withVersionManagerBuilders(
    {
      workflowName: "multiple-or-split-join-1",
      versionName: WORKFLOW_VERSION_NAME,
      builder: makeWorkflowDefinition(false),
    },
    async () => {
      const t = setup();

      const id = await t.mutation(
        internal.testing.tasquencer.initializeRootWorkflow,
        {
          workflowName: "multiple-or-split-join-1",
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
      expect(enabledTasks1[0].name).toBe("A");

      const workItemsA = await t.query(
        internal.testing.tasquencer.getWorkflowTaskWorkItems,
        {
          workflowId: id,
          taskName: "A",
        }
      );
      expect(workItemsA.length).toBe(1);
      expect(workItemsA[0].state).toBe("initialized");

      await t.mutation(internal.testing.tasquencer.startWorkItem, {
        workflowName: "multiple-or-split-join-1",
        workItemId: workItemsA[0]._id,
        workflowVersionName: WORKFLOW_VERSION_NAME,
      });
      await t.mutation(internal.testing.tasquencer.completeWorkItem, {
        workflowName: "multiple-or-split-join-1",
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
        new Set(["B", "C"])
      );

      const workItemsB = await t.query(
        internal.testing.tasquencer.getWorkflowTaskWorkItems,
        {
          workflowId: id,
          taskName: "B",
        }
      );
      expect(workItemsB.length).toBe(1);
      expect(workItemsB[0].state).toBe("initialized");
      await t.mutation(internal.testing.tasquencer.startWorkItem, {
        workflowName: "multiple-or-split-join-1",
        workItemId: workItemsB[0]._id,
        workflowVersionName: WORKFLOW_VERSION_NAME,
      });
      await t.mutation(internal.testing.tasquencer.completeWorkItem, {
        workflowName: "multiple-or-split-join-1",
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
      expect(enabledTasks3.length).toBe(1);
      expect(enabledTasks3[0].name).toBe("C");

      const workItemsC = await t.query(
        internal.testing.tasquencer.getWorkflowTaskWorkItems,
        {
          workflowId: id,
          taskName: "C",
        }
      );
      expect(workItemsC.length).toBe(1);
      expect(workItemsC[0].state).toBe("initialized");
      await t.mutation(internal.testing.tasquencer.startWorkItem, {
        workflowName: "multiple-or-split-join-1",
        workItemId: workItemsC[0]._id,
        workflowVersionName: WORKFLOW_VERSION_NAME,
      });
      await t.mutation(internal.testing.tasquencer.completeWorkItem, {
        workflowName: "multiple-or-split-join-1",
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
      expect(enabledTasks4.length).toBe(1);
      expect(new Set(enabledTasks4.map((t) => t.name))).toEqual(new Set(["E"]));

      const workItemsE = await t.query(
        internal.testing.tasquencer.getWorkflowTaskWorkItems,
        {
          workflowId: id,
          taskName: "E",
        }
      );
      expect(workItemsE.length).toBe(1);
      expect(workItemsE[0].state).toBe("initialized");

      await t.mutation(internal.testing.tasquencer.startWorkItem, {
        workflowName: "multiple-or-split-join-1",
        workItemId: workItemsE[0]._id,
        workflowVersionName: WORKFLOW_VERSION_NAME,
      });
      await t.mutation(internal.testing.tasquencer.completeWorkItem, {
        workflowName: "multiple-or-split-join-1",
        workItemId: workItemsE[0]._id,
        workflowVersionName: WORKFLOW_VERSION_NAME,
      });

      const enabledTasks5 = await t.query(
        internal.testing.tasquencer.getWorkflowTasksByState,
        {
          workflowId: id,
          state: "enabled",
        }
      );
      expect(enabledTasks5.length).toBe(1);
      expect(enabledTasks5[0].name).toBe("F");

      const workItemsF = await t.query(
        internal.testing.tasquencer.getWorkflowTaskWorkItems,
        {
          workflowId: id,
          taskName: "F",
        }
      );
      expect(workItemsF.length).toBe(1);
      expect(workItemsF[0].state).toBe("initialized");

      await t.mutation(internal.testing.tasquencer.startWorkItem, {
        workflowName: "multiple-or-split-join-1",
        workItemId: workItemsF[0]._id,
        workflowVersionName: WORKFLOW_VERSION_NAME,
      });
      await t.mutation(internal.testing.tasquencer.completeWorkItem, {
        workflowName: "multiple-or-split-join-1",
        workItemId: workItemsF[0]._id,
        workflowVersionName: WORKFLOW_VERSION_NAME,
      });

      const workflowInstance = await t.query(
        internal.testing.tasquencer.getWorkflowById,
        {
          workflowId: id,
        }
      );
      expect(workflowInstance.state).toBe("completed");
    }
  );
});
