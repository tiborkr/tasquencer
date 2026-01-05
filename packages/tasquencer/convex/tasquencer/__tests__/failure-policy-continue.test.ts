import { setup, Builder } from "./setup.test";
import { it, vi, beforeEach, afterEach } from "vitest";
import { internal } from "../../../convex/_generated/api";

import schema from "../../schema";
import { withVersionManagerBuilders } from "./helpers/versionManager";

const WORKFLOW_VERSION_NAME = "v0";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

it("demonstrates policy returning continue stops failure propagation", async ({
  expect,
}) => {
  // Create workflow with custom policy that returns 'continue' on failure
  const workflowDefinition = Builder.workflow("policyStopsPropagation")
    .startCondition("start")
    .task(
      "t1",
      Builder.noOpTask
        .withActivities({
          onEnabled: async ({ workItem }) => {
            await workItem.initialize();
            await workItem.initialize();
          },
        })
        .withPolicy(async (ctx) => {
          // Custom policy: when work item fails, return 'continue' instead of 'fail'
          if (ctx.transition.nextState === "failed") {
            return "continue"; // Stop propagation!
          }
          // Default behavior for other states
          const stats = await ctx.task.getStats();
          const allFinalized =
            stats.completed + stats.failed + stats.canceled === stats.total;
          if (ctx.transition.nextState === "completed") {
            return allFinalized ? "complete" : "continue";
          }
          if (ctx.transition.nextState === "canceled") {
            return allFinalized ? "complete" : "continue";
          }
          return "continue";
        })
    )
    .endCondition("end")
    .connectCondition("start", (to) => to.task("t1"))
    .connectTask("t1", (to) => to.condition("end"));

  await withVersionManagerBuilders(
    {
      workflowName: "policyStopsPropagation",
      versionName: WORKFLOW_VERSION_NAME,
      builder: workflowDefinition,
    },
    async () => {
      const t = setup();

      const id = await t.mutation(
        internal.testing.tasquencer.initializeRootWorkflow,
        {
          workflowName: "policyStopsPropagation",
          workflowVersionName: WORKFLOW_VERSION_NAME,
        }
      );

      // Get work items
      const workItems = await t.query(
        internal.testing.tasquencer.getWorkflowTaskWorkItems,
        {
          workflowId: id,
          taskName: "t1",
        }
      );
      expect(workItems.length).toBe(2);

      // Start both work items
      await t.mutation(internal.testing.tasquencer.startWorkItem, {
        workflowName: "policyStopsPropagation",
        workItemId: workItems[0]._id,
        workflowVersionName: WORKFLOW_VERSION_NAME,
      });
      await t.mutation(internal.testing.tasquencer.startWorkItem, {
        workflowName: "policyStopsPropagation",
        workItemId: workItems[1]._id,
        workflowVersionName: WORKFLOW_VERSION_NAME,
      });

      // Fail one work item
      await t.mutation(internal.testing.tasquencer.failWorkItem, {
        workflowName: "policyStopsPropagation",
        workItemId: workItems[0]._id,
        workflowVersionName: WORKFLOW_VERSION_NAME,
      });

      // Verify: work item is failed, but task and workflow are NOT failed
      const workItemsAfter = await t.query(
        internal.testing.tasquencer.getWorkflowTaskWorkItems,
        {
          workflowId: id,
          taskName: "t1",
        }
      );
      const failedWorkItem = workItemsAfter.find(
        (wi) => wi._id === workItems[0]._id
      );
      expect(failedWorkItem?.state).toBe("failed");

      // The other work item is still started (not canceled)
      const stillActiveWorkItem = workItemsAfter.find(
        (wi) => wi._id === workItems[1]._id
      );
      expect(stillActiveWorkItem?.state).toBe("started");

      // Task is still started (NOT failed) - policy stopped propagation
      const tasks = await t.query(
        internal.testing.tasquencer.getWorkflowTasks,
        {
          workflowId: id,
        }
      );
      expect(tasks[0].state).toBe("started");

      // Workflow is still started (NOT failed)
      const wf = await t.query(internal.testing.tasquencer.getWorkflowById, {
        workflowId: id,
      });
      expect(wf.state).toBe("started");

      // Now complete the other work item
      await t.mutation(internal.testing.tasquencer.completeWorkItem, {
        workflowName: "policyStopsPropagation",
        workItemId: workItems[1]._id,
        workflowVersionName: WORKFLOW_VERSION_NAME,
      });

      // Task should now complete (all work items finalized: 1 failed, 1 completed)
      const tasksAfter = await t.query(
        internal.testing.tasquencer.getWorkflowTasks,
        {
          workflowId: id,
        }
      );
      expect(tasksAfter[0].state).toBe("completed");

      // Workflow should complete
      const wfAfter = await t.query(
        internal.testing.tasquencer.getWorkflowById,
        {
          workflowId: id,
        }
      );
      expect(wfAfter.state).toBe("completed");
    }
  );
});
