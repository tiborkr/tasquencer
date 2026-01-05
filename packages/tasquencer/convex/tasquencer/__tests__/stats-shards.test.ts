import { setup, Builder } from "./setup.test";
import {
  describe,
  it,
  beforeEach,
  afterEach,
  beforeAll,
  afterAll,
  vi,
} from "vitest";
import { internal } from "../../_generated/api";
import { withVersionManagerBuilders } from "./helpers/versionManager";
import { waitForFlush } from "./audit/helpers.test";

const WORKFLOW_VERSION_NAME = "v0";

async function getTaskDoc(
  t: ReturnType<typeof setup>,
  workflowId: any,
  taskName: string
) {
  return await t.run(async (ctx: any) => {
    return await ctx.db
      .query("tasquencerTasks")
      .withIndex("by_workflow_id_name_and_generation", (q: any) =>
        q.eq("workflowId", workflowId).eq("name", taskName)
      )
      .order("desc")
      .first();
  });
}

async function readShardTotals(
  t: ReturnType<typeof setup>,
  workflowId: any,
  taskName: string,
  generation: number
) {
  return await t.run(async (ctx: any) => {
    const shards = await ctx.db
      .query("tasquencerTaskStatsShards")
      .withIndex("by_workflow_task_generation", (q: any) =>
        q
          .eq("workflowId", workflowId)
          .eq("taskName", taskName)
          .eq("taskGeneration", generation)
      )
      .collect();

    return shards.reduce(
      (acc: any, shard: any) => {
        acc.total += shard.total;
        acc.initialized += shard.initialized;
        acc.started += shard.started;
        acc.completed += shard.completed;
        acc.failed += shard.failed;
        acc.canceled += shard.canceled;
        return acc;
      },
      {
        total: 0,
        initialized: 0,
        started: 0,
        completed: 0,
        failed: 0,
        canceled: 0,
      }
    );
  });
}

describe("Tasquencer stats shards", () => {
  //let originalAuditConfig: TasquencerAuditConfig

  beforeAll(() => {
    //originalAuditConfig = getAuditConfig()
    //setAuditConfig({ enabled: false })
  });

  afterAll(() => {
    //setAuditConfig(originalAuditConfig)
  });

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(async () => {
    vi.useRealTimers();
  });

  it("aggregates work item transitions across shards", async ({ expect }) => {
    const workflowBuilder = Builder.workflow("shard-work-items")
      .startCondition("start")
      .task(
        "bulkTask",
        Builder.task(Builder.noOpWorkItem)
          .withStatsShards(4)
          .withActivities({
            onEnabled: async ({ workItem }) => {
              for (let i = 0; i < 12; i++) {
                await workItem.initialize();
              }
            },
          })
      )
      .endCondition("end")
      .connectCondition("start", (to) => to.task("bulkTask"))
      .connectTask("bulkTask", (to) => to.condition("end"));

    await withVersionManagerBuilders(
      {
        workflowName: "shard-work-items",
        versionName: WORKFLOW_VERSION_NAME,
        builder: workflowBuilder,
      },
      async () => {
        const t = setup();

        const workflowId = await t.mutation(
          internal.testing.tasquencer.initializeRootWorkflow,
          {
            workflowName: "shard-work-items",
            workflowVersionName: WORKFLOW_VERSION_NAME,
          }
        );

        const bulkTask = await getTaskDoc(t, workflowId, "bulkTask");
        const initialTotals = await readShardTotals(
          t,
          workflowId,
          "bulkTask",
          bulkTask.generation
        );

        expect(initialTotals).toEqual({
          total: 12,
          initialized: 12,
          started: 0,
          completed: 0,
          failed: 0,
          canceled: 0,
        });

        const workItems = await t.query(
          internal.testing.tasquencer.getWorkflowTaskWorkItems,
          {
            workflowId,
            taskName: "bulkTask",
          }
        );

        for (const workItem of workItems) {
          await t.mutation(internal.testing.tasquencer.startWorkItem, {
            workflowName: "shard-work-items",
            workItemId: workItem._id,
            workflowVersionName: WORKFLOW_VERSION_NAME,
          });
          await t.mutation(internal.testing.tasquencer.completeWorkItem, {
            workflowName: "shard-work-items",
            workItemId: workItem._id,
            workflowVersionName: WORKFLOW_VERSION_NAME,
          });
        }

        await t.finishAllScheduledFunctions(vi.runAllTimersAsync);

        const completedTotals = await readShardTotals(
          t,
          workflowId,
          "bulkTask",
          bulkTask.generation
        );

        expect(completedTotals).toEqual({
          total: 12,
          initialized: 0,
          started: 0,
          completed: 12,
          failed: 0,
          canceled: 0,
        });

        const taskAfter = await getTaskDoc(t, workflowId, "bulkTask");
        expect(taskAfter.state).toBe("completed");
        await waitForFlush(t);
      }
    );
  });

  it("aggregates nested workflow transitions across shards", async ({
    expect,
  }) => {
    const childWorkflow = Builder.workflow("shard-composite-child")
      .startCondition("start")
      .task("childTask", Builder.noOpTask)
      .endCondition("end")
      .connectCondition("start", (to) => to.task("childTask"))
      .connectTask("childTask", (to) => to.condition("end"));

    const parentWorkflowBuilder = Builder.workflow("shard-composite")
      .startCondition("start")
      .compositeTask(
        "compositeTask",
        Builder.compositeTask(childWorkflow)
          .withStatsShards(4)
          .withActivities({
            onEnabled: async ({ workflow }) => {
              for (let i = 0; i < 6; i++) {
                await workflow.initialize();
              }
            },
          })
      )
      .endCondition("end")
      .connectCondition("start", (to) => to.task("compositeTask"))
      .connectTask("compositeTask", (to) => to.condition("end"));

    await withVersionManagerBuilders(
      {
        workflowName: "shard-composite",
        versionName: WORKFLOW_VERSION_NAME,
        builder: parentWorkflowBuilder,
      },
      async () => {
        const t = setup();

        const workflowId = await t.mutation(
          internal.testing.tasquencer.initializeRootWorkflow,
          {
            workflowName: "shard-composite",
            workflowVersionName: WORKFLOW_VERSION_NAME,
          }
        );

        const compositeTask = await getTaskDoc(t, workflowId, "compositeTask");

        let shardTotals = await readShardTotals(
          t,
          workflowId,
          "compositeTask",
          compositeTask.generation
        );

        expect(shardTotals).toEqual({
          total: 6,
          initialized: 6,
          started: 0,
          completed: 0,
          failed: 0,
          canceled: 0,
        });

        const childWorkflows = await t.run(async (ctx: any) => {
          return await ctx.db
            .query("tasquencerWorkflows")
            .withIndex(
              "by_parent_workflow_id_task_name_task_generation_state_and_name",
              (q: any) =>
                q
                  .eq("parent.workflowId", workflowId)
                  .eq("parent.taskName", "compositeTask")
                  .eq("parent.taskGeneration", compositeTask.generation)
            )
            .collect();
        });

        expect(childWorkflows).toHaveLength(6);

        for (const child of childWorkflows) {
          const childTaskDoc = await getTaskDoc(t, child._id, "childTask");

          let childWorkItems = await t.query(
            internal.testing.tasquencer.getWorkflowTaskWorkItems,
            {
              workflowId: child._id,
              taskName: "childTask",
            }
          );

          if (childWorkItems.length === 0 && childTaskDoc) {
            await t.mutation(internal.testing.tasquencer.initializeWorkItem, {
              workflowName: "shard-composite",
              target: {
                path: [...childTaskDoc.path, "tasquencer/no-op-work-item"],
                parentWorkflowId: child._id,
                parentTaskName: "childTask",
              },
              payload: {},
              workflowVersionName: WORKFLOW_VERSION_NAME,
            });

            childWorkItems = await t.query(
              internal.testing.tasquencer.getWorkflowTaskWorkItems,
              {
                workflowId: child._id,
                taskName: "childTask",
              }
            );
          }

          const workItemId = childWorkItems[0]._id;

          await t.mutation(internal.testing.tasquencer.startWorkItem, {
            workflowName: "shard-composite",
            workItemId,
            workflowVersionName: WORKFLOW_VERSION_NAME,
          });

          await t.mutation(internal.testing.tasquencer.completeWorkItem, {
            workflowName: "shard-composite",
            workItemId,
            workflowVersionName: WORKFLOW_VERSION_NAME,
          });
        }

        await t.finishAllScheduledFunctions(vi.runAllTimersAsync);

        shardTotals = await readShardTotals(
          t,
          workflowId,
          "compositeTask",
          compositeTask.generation
        );

        expect(shardTotals).toEqual({
          total: 6,
          initialized: 0,
          started: 0,
          completed: 6,
          failed: 0,
          canceled: 0,
        });

        const taskAfter = await getTaskDoc(t, workflowId, "compositeTask");
        expect(taskAfter.state).toBe("completed");
        await waitForFlush(t);
      }
    );
  });
});
