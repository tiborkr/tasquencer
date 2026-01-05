import { setup, Builder } from "./setup.test";
import { it, vi, beforeEach, afterEach } from "vitest";
import { internal } from "../../../convex/_generated/api";

import schema from "../../schema";
import { withVersionManagerBuilders } from "./helpers/versionManager";

const WORKFLOW_VERSION_NAME = "v0";

function makeWorkflowDefinition(taskToEnable: "B" | "C" | "D") {
  return Builder.workflow("xor-split-join")
    .startCondition("start")
    .task(
      "A",
      Builder.noOpTask.withSplitType("xor").withActivities({
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
      Builder.noOpTask.withActivities({
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
    .endCondition("end")
    .connectCondition("start", (to) => to.task("A"))
    .connectTask("A", (to) =>
      to
        .task("B")
        .task("C")
        .task("D")
        .route(async ({ route }) => {
          if (taskToEnable === "B") {
            return route.toTask("B");
          }
          if (taskToEnable === "C") {
            return route.toTask("C");
          }
          return route.toTask("D");
        })
    )
    .connectTask("B", (to) => to.condition("end"))
    .connectTask("C", (to) => to.condition("end"))
    .connectTask("D", (to) => to.condition("end"));
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

it("xor-split-join (B)", async ({ expect }) => {
  await withVersionManagerBuilders(
    {
      workflowName: "xor-split-join",
      versionName: WORKFLOW_VERSION_NAME,
      builder: makeWorkflowDefinition("B"),
    },
    async () => {
      const t = setup();

      const id = await t.mutation(
        internal.testing.tasquencer.initializeRootWorkflow,
        {
          workflowName: "xor-split-join",
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
        workflowName: "xor-split-join",
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
      expect(enabledTasks2.length).toBe(0);

      await t.mutation(internal.testing.tasquencer.completeWorkItem, {
        workflowName: "xor-split-join",
        workItemId: workItemsA[0]._id,
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
      expect(enabledTasks3[0].name).toBe("B");

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
        workflowName: "xor-split-join",
        workItemId: workItemsB[0]._id,
        workflowVersionName: WORKFLOW_VERSION_NAME,
      });

      await t.mutation(internal.testing.tasquencer.completeWorkItem, {
        workflowName: "xor-split-join",
        workItemId: workItemsB[0]._id,
        workflowVersionName: WORKFLOW_VERSION_NAME,
      });

      const enabledTasks4 = await t.query(
        internal.testing.tasquencer.getWorkflowTasksByState,
        {
          workflowId: id,
          state: "enabled",
        }
      );
      expect(enabledTasks4.length).toBe(0);

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

it("xor-split-join (C)", async ({ expect }) => {
  await withVersionManagerBuilders(
    {
      workflowName: "xor-split-join",
      versionName: WORKFLOW_VERSION_NAME,
      builder: makeWorkflowDefinition("C"),
    },
    async () => {
      const t = setup();

      const id = await t.mutation(
        internal.testing.tasquencer.initializeRootWorkflow,
        {
          workflowName: "xor-split-join",
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
        workflowName: "xor-split-join",
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
      expect(enabledTasks2.length).toBe(0);

      await t.mutation(internal.testing.tasquencer.completeWorkItem, {
        workflowName: "xor-split-join",
        workItemId: workItemsA[0]._id,
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
        workflowName: "xor-split-join",
        workItemId: workItemsC[0]._id,
        workflowVersionName: WORKFLOW_VERSION_NAME,
      });

      await t.mutation(internal.testing.tasquencer.completeWorkItem, {
        workflowName: "xor-split-join",
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
      expect(enabledTasks4.length).toBe(0);

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
