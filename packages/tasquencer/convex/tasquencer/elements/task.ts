import {
  assertWorkItemExists,
  ConstraintViolationError,
  WorkItemNotFoundError,
} from "../exceptions";
import { BaseTask } from "./baseTask";
import {
  WorkItem,
  WorkItemAutoTriggerQueue,
  type AutoTriggerEntry,
} from "./workItem";
import { type Doc, type Id } from "../../_generated/dataModel";
import {
  type TaskJoinType,
  type TaskSplitType,
  type WorkItemState,
} from "../types";
import { Workflow } from "./workflow";
import { type AnyTaskActivities, type TaskPolicy } from "../builder";
import {
  createTaskActivitySpan,
  completeSpan,
  failSpan,
  type AuditCallbackInfo,
} from "../audit/integration";
import { type AuditContext } from "../../components/audit/src/shared/context";
import { type SpanAttributes } from "../../components/audit/src/shared/attributeSchemas";
import { cancelScheduledForTask } from "../util/scheduler";
import { getAggregatedTaskStats } from "../util/statsShards";
import type { TaskOnMigrate } from "../versionManager/migration";
import {
  auditInfoFromSpanResult,
  type AuditSpanResult,
} from "./helpers/auditHelpers";
import { createTaskRegisterScheduled } from "./helpers/schedulerHelpers";
import {
  loadEntitiesByStates,
  cancelEntities,
} from "./helpers/nonFinalizedHelpers";
import { ExecutionContext } from "./executionContext";

function isTaskOnMigrate(
  migrator: unknown
): migrator is TaskOnMigrate<unknown> {
  return typeof migrator === "function";
}

type TaskActivityExecution = {
  spanResult: AuditSpanResult;
  auditInfo: ReturnType<typeof auditInfoFromSpanResult>;
  complete: (attributes?: SpanAttributes) => void;
  fail: (error: unknown) => void;
};

function createTaskActivityExecution({
  activityName,
  taskName,
  workflowId,
  parentContext,
}: {
  activityName: string;
  taskName: string;
  workflowId: Id<"tasquencerWorkflows">;
  parentContext: AuditContext;
}): TaskActivityExecution {
  const spanResult = createTaskActivitySpan({
    activityName,
    taskName,
    workflowId,
    parentContext,
  });
  const auditInfo = auditInfoFromSpanResult(spanResult);
  const traceId = parentContext.traceId;

  return {
    spanResult,
    auditInfo,
    complete: (attributes?: SpanAttributes) => {
      completeSpan(traceId, spanResult.spanId, attributes);
    },
    fail: (error: unknown) => {
      failSpan(traceId, spanResult.spanId, error as Error);
    },
  };
}

/**
 * Runtime executor for a workflow task.
 *
 * Tracks task state transitions, coordinates work item lifecycles, and enforces split/join semantics.
 * Tasks orchestrate auto-triggered transitions via {@link WorkItemAutoTriggerQueue} so handlers can
 * chain start/complete/fail/cancel operations without racing the underlying mutations.
 */
export class Task extends BaseTask {
  private workItem?: WorkItem;

  constructor(
    name: string,
    versionName: string,
    path: string[],
    parentWorkflow: Workflow,
    readonly activities: AnyTaskActivities,
    readonly policy: TaskPolicy,
    props?: {
      splitType?: TaskSplitType;
      joinType?: TaskJoinType;
      statsShardCount?: number;
    }
  ) {
    super(name, versionName, path, parentWorkflow, props);
  }

  setWorkItem(workItem: WorkItem) {
    this.workItem = workItem;
  }

  getWorkItem() {
    const workItem = this.workItem;
    if (!workItem) {
      throw new WorkItemNotFoundError(this.name as any);
    }
    return workItem;
  }

  async getWorkItemsByState(
    executionContext: ExecutionContext,
    workflowId: Id<"tasquencerWorkflows">,
    task: Doc<"tasquencerTasks">,
    state: WorkItemState
  ) {
    return executionContext.mutationCtx.db
      .query("tasquencerWorkItems")
      .withIndex(
        "by_parent_workflow_id_task_name_task_generation_and_state",
        (q) =>
          q
            .eq("parent.workflowId", workflowId)
            .eq("parent.taskName", task.name)
            .eq("parent.taskGeneration", task.generation)
            .eq("state", state)
      )
      .collect();
  }

  async getNonFinalizedWorkItems(
    executionContext: ExecutionContext,
    workflowId: Id<"tasquencerWorkflows">
  ) {
    const task = await this.getTaskByName(executionContext, workflowId);
    return await loadEntitiesByStates(
      ["initialized", "started"] as const,
      async (state) =>
        await this.getWorkItemsByState(
          executionContext,
          workflowId,
          task,
          state
        )
    );
  }

  async cancelNonFinalizedWorkItems(
    executionContext: ExecutionContext,
    workflowId: Id<"tasquencerWorkflows">,
    callPolicy: boolean = false
  ) {
    const workItems = await this.getNonFinalizedWorkItems(
      executionContext,
      workflowId
    );
    await cancelEntities(workItems, async (workItem) => {
      await this.getWorkItem().cancel(
        executionContext,
        workItem,
        undefined,
        "teardown",
        callPolicy
      );
    });
  }

  async onFastForward(
    executionContext: ExecutionContext,
    workflowId: Id<"tasquencerWorkflows">,
    task: Doc<"tasquencerTasks">
  ) {
    const migrator = this.parentWorkflow.getMigratorForTask(this.name);
    const migration = await this.getMigration(executionContext, workflowId);

    if (isTaskOnMigrate(migrator)) {
      const activity = createTaskActivityExecution({
        activityName: "onFastForward",
        taskName: this.name,
        workflowId,
        parentContext: executionContext.auditContext,
      });

      try {
        let wasChildWorkItemInitialized = false;
        const workItemAutoTriggerQueue = new WorkItemAutoTriggerQueue();
        const result = await migrator({
          mutationCtx: executionContext.mutationCtx,
          isInternalMutation: executionContext.isInternalMutation,
          migratingFromWorkflow: {
            name: this.name,
            id: migration.fromWorkflowId,
          },
          parent: {
            workflow: {
              name: this.parentWorkflow.name,
              id: workflowId,
            },
          },
          task: {
            name: this.name,
            generation: task.generation,
            path: this.path,
          },
          workItem: {
            initialize: async (
              payload?: unknown
            ): Promise<Id<"tasquencerWorkItems">> => {
              wasChildWorkItemInitialized = true;
              return await this.getWorkItem().initialize(
                executionContext.extend({ isInternalMutation: true }),
                {
                  workflowId: workflowId,
                  taskName: this.name,
                  taskGeneration: task.generation,
                },
                payload,
                workItemAutoTriggerQueue
              );
            },
          },
          registerScheduled: createTaskRegisterScheduled(
            executionContext.mutationCtx,
            task._id,
            task.generation
          ),
          audit: activity.auditInfo,
        });

        if (wasChildWorkItemInitialized && result === "fastForward") {
          throw new ConstraintViolationError(
            "FAST_FORWARD_AND_CHILD_WORKITEM_INITIALIZATION",
            {
              taskName: this.name,
              parentWorkflowName: this.parentWorkflow.name,
            }
          );
        }

        if (wasChildWorkItemInitialized) {
          await this.drainAutoTriggerQueue(
            executionContext,
            workItemAutoTriggerQueue
          );
        }

        activity.complete();

        return result;
      } catch (error) {
        activity.fail(error);
        throw error;
      }
    }

    return "continue" as const;
  }

  async afterEnable(
    executionContext: ExecutionContext,
    workflowId: Id<"tasquencerWorkflows">,
    task: Doc<"tasquencerTasks">
  ) {
    const registerScheduled = createTaskRegisterScheduled(
      executionContext.mutationCtx,
      task._id,
      task.generation
    );

    const activity = createTaskActivityExecution({
      activityName: "onEnabled",
      taskName: this.name,
      workflowId,
      parentContext: executionContext.auditContext,
    });

    try {
      // Buffer auto-triggered transitions until we finish the current state mutation.
      const workItemAutoTriggerQueue = new WorkItemAutoTriggerQueue();

      const initialActivityContext = this.makeTaskActivityContext(
        executionContext,
        task,
        workflowId,
        activity.auditInfo
      );

      await this.activities.onEnabled({
        ...initialActivityContext,
        registerScheduled,
        workItem: {
          ...initialActivityContext.workItem,
          initialize: this.makeTaskActivityWorkItemInitialize(
            executionContext,
            task,
            workflowId,
            workItemAutoTriggerQueue
          ),
        },
      });

      activity.complete();

      await this.drainAutoTriggerQueue(
        executionContext,
        workItemAutoTriggerQueue
      );
    } catch (error) {
      activity.fail(error);
      throw error;
    }
  }

  async afterStart(
    executionContext: ExecutionContext,
    workflowId: Id<"tasquencerWorkflows">,
    task: Doc<"tasquencerTasks">
  ) {
    const registerScheduled = createTaskRegisterScheduled(
      executionContext.mutationCtx,
      task._id,
      task.generation
    );

    const activity = createTaskActivityExecution({
      activityName: "onStarted",
      taskName: this.name,
      workflowId,
      parentContext: executionContext.auditContext,
    });

    try {
      const workItemAutoTriggerQueue = new WorkItemAutoTriggerQueue();
      const initialActivityContext = this.makeTaskActivityContext(
        executionContext,
        task,
        workflowId,
        activity.auditInfo
      );

      await this.activities.onStarted({
        ...initialActivityContext,
        registerScheduled,
        workItem: {
          ...initialActivityContext.workItem,
          initialize: this.makeTaskActivityWorkItemInitialize(
            executionContext,
            task,
            workflowId,
            workItemAutoTriggerQueue
          ),
        },
      });

      activity.complete();

      await this.drainAutoTriggerQueue(
        executionContext,
        workItemAutoTriggerQueue
      );
    } catch (error) {
      activity.fail(error);
      throw error;
    }
  }

  async afterComplete(
    executionContext: ExecutionContext,
    workflowId: Id<"tasquencerWorkflows">,
    task: Doc<"tasquencerTasks">
  ) {
    await this.cancelNonFinalizedWorkItems(executionContext, workflowId);
    await this.cancelScheduledWorkItemInitializations(executionContext, task);

    const activity = createTaskActivityExecution({
      activityName: "onCompleted",
      taskName: this.name,
      workflowId,
      parentContext: executionContext.auditContext,
    });

    try {
      await this.activities.onCompleted(
        this.makeTaskActivityContext(
          executionContext,
          task,
          workflowId,
          activity.auditInfo
        )
      );
      activity.complete();
    } catch (error) {
      activity.fail(error);
      throw error;
    }
  }

  async maybeComplete(
    executionContext: ExecutionContext,
    workflowId: Id<"tasquencerWorkflows">,
    task: Doc<"tasquencerTasks">
  ) {
    const policyResult = await this.policy({
      mutationCtx: executionContext.mutationCtx,
      parent: {
        workflow: {
          id: workflowId,
          name: this.parentWorkflow.name,
        },
      },
      task: {
        name: this.name,
        generation: task.generation,
        path: this.path,
        getStats: async () => {
          return await getAggregatedTaskStats(executionContext.mutationCtx.db, {
            workflowId,
            taskName: this.name,
            taskGeneration: task.generation,
          });
        },
      },
      workItem: {
        getAllWorkItemIds: async () => {
          return await this.getWorkItem().getAllWorkItemIds(executionContext, {
            workflowId,
            taskName: this.name,
            taskGeneration: task.generation,
          });
        },
        path: this.getWorkItem().path,
      },
      transition: {
        prevState: "started" as WorkItemState,
        nextState: "completed",
      },
    });

    if (policyResult === "complete") {
      await this.complete(executionContext, workflowId, task);
    } else if (policyResult === "fail") {
      await this.fail(executionContext, workflowId, task);
    }
  }

  async afterFail(
    executionContext: ExecutionContext,
    workflowId: Id<"tasquencerWorkflows">,
    task: Doc<"tasquencerTasks">
  ) {
    await this.cancelNonFinalizedWorkItems(executionContext, workflowId);
    await this.cancelScheduledWorkItemInitializations(executionContext, task);

    const activity = createTaskActivityExecution({
      activityName: "onFailed",
      taskName: this.name,
      workflowId,
      parentContext: executionContext.auditContext,
    });

    try {
      await this.activities.onFailed(
        this.makeTaskActivityContext(
          executionContext,
          task,
          workflowId,
          activity.auditInfo
        )
      );

      activity.complete({
        type: "activity",
        workflowId,
        activityName: "onFailed",
        data: { businessResult: "failed" },
      });
    } catch (error) {
      if (activity.spanResult) {
        failSpan(
          activity.spanResult.context.traceId,
          activity.spanResult.spanId,
          error as Error
        );
      }
      throw error;
    }
  }

  async afterCancel(
    executionContext: ExecutionContext,
    workflowId: Id<"tasquencerWorkflows">,
    task: Doc<"tasquencerTasks">
  ) {
    await this.cancelNonFinalizedWorkItems(executionContext, workflowId);
    await this.cancelScheduledWorkItemInitializations(executionContext, task);

    const activity = createTaskActivityExecution({
      activityName: "onCanceled",
      taskName: this.name,
      workflowId,
      parentContext: executionContext.auditContext,
    });

    try {
      await this.activities.onCanceled(
        this.makeTaskActivityContext(
          executionContext,
          task,
          workflowId,
          activity.auditInfo
        )
      );

      activity.complete();
    } catch (error) {
      activity.fail(error);
      throw error;
    }
  }

  async afterDisable(
    executionContext: ExecutionContext,
    workflowId: Id<"tasquencerWorkflows">,
    task: Doc<"tasquencerTasks">
  ) {
    await this.cancelNonFinalizedWorkItems(executionContext, workflowId);
    await this.cancelScheduledWorkItemInitializations(executionContext, task);

    const activity = createTaskActivityExecution({
      activityName: "onDisabled",
      taskName: this.name,
      workflowId,
      parentContext: executionContext.auditContext,
    });

    try {
      await this.activities.onDisabled(
        this.makeTaskActivityContext(
          executionContext,
          task,
          workflowId,
          activity.auditInfo
        )
      );

      activity.complete();
    } catch (error) {
      activity.fail(error);
      throw error;
    }
  }

  async getRouterPayload(
    executionContext: ExecutionContext,
    task: Doc<"tasquencerTasks">,
    workflowId: Id<"tasquencerWorkflows">
  ) {
    return {
      workItem: {
        name: this.name,
        getAllWorkItemIds: async () => {
          return await this.getWorkItem().getAllWorkItemIds(executionContext, {
            workflowId,
            taskName: this.name,
            taskGeneration: task.generation,
          });
        },
      },
    };
  }

  async workItemStateChanged(
    executionContext: ExecutionContext,
    parentWorkflowId: Id<"tasquencerWorkflows">,
    workItem: Doc<"tasquencerWorkItems">,
    prevState: WorkItemState,
    nextState: WorkItemState,
    callPolicy: boolean = true
  ) {
    const workItemParent = workItem.parent;
    if (!workItemParent) {
      throw new Error(`Work item ${workItem.name} has no parent`);
    }

    const task = await this.getTaskByName(executionContext, parentWorkflowId);

    const getAllWorkItemIds = async () => {
      return await this.getWorkItem().getAllWorkItemIds(executionContext, {
        workflowId: parentWorkflowId,
        taskName: this.name,
        taskGeneration: workItemParent.taskGeneration,
      });
    };

    const getStats = async () => {
      return await getAggregatedTaskStats(executionContext.mutationCtx.db, {
        workflowId: parentWorkflowId,
        taskName: this.name,
        taskGeneration: workItemParent.taskGeneration,
      });
    };

    // Buffer auto-triggered transitions until we finish the current state mutation.
    const workItemAutoTriggerQueue = new WorkItemAutoTriggerQueue();

    const activity = createTaskActivityExecution({
      activityName: "onWorkItemStateChanged",
      taskName: this.name,
      workflowId: parentWorkflowId,
      parentContext: executionContext.auditContext,
    });

    const registerScheduled = createTaskRegisterScheduled(
      executionContext.mutationCtx,
      task._id,
      workItemParent.taskGeneration
    );

    const initialActivityContext = this.makeTaskActivityContext(
      executionContext,
      task,
      parentWorkflowId,
      activity.auditInfo
    );

    try {
      await this.activities.onWorkItemStateChanged({
        ...initialActivityContext,
        registerScheduled,
        workItem: {
          ...initialActivityContext.workItem,
          id: workItem._id,
          prevState,
          nextState,
          initialize: this.makeTaskActivityWorkItemInitialize(
            executionContext,
            task,
            parentWorkflowId,
            workItemAutoTriggerQueue
          ),
        },
        audit: activity.auditInfo,
      });

      await workItemAutoTriggerQueue.drainSequentially(async (entry) => {
        await this.dispatchAutoTriggerEntry(executionContext, entry);
      });

      activity.complete();
    } catch (error) {
      activity.fail(error);
      throw error;
    }

    if (!callPolicy) {
      return;
    }

    if (
      nextState === "completed" ||
      nextState === "failed" ||
      nextState === "canceled"
    ) {
      const policyResult = await this.policy({
        mutationCtx: executionContext.mutationCtx,
        parent: {
          workflow: {
            id: parentWorkflowId,
            name: this.parentWorkflow.name,
          },
        },
        task: {
          name: this.name,
          generation: workItemParent.taskGeneration,
          path: this.path,
          getStats,
        },
        workItem: {
          getAllWorkItemIds,
          path: this.getWorkItem().path,
        },
        transition: {
          prevState,
          nextState,
        },
      });

      switch (policyResult) {
        case "complete":
          await this.complete(executionContext, parentWorkflowId, task);
          break;
        case "fail":
          await this.fail(executionContext, parentWorkflowId, task);
          await this.parentWorkflow.fail(executionContext, parentWorkflowId);
          break;
        case "continue":
          break;
      }
    }
  }

  private async cancelScheduledWorkItemInitializations(
    executionContext: ExecutionContext,
    task: Doc<"tasquencerTasks">
  ) {
    await cancelScheduledForTask(executionContext.mutationCtx, task._id);
  }

  private async drainAutoTriggerQueue(
    executionContext: ExecutionContext,
    queue: WorkItemAutoTriggerQueue
  ) {
    await queue.drainSequentially(async (entry) => {
      await this.dispatchAutoTriggerEntry(executionContext, entry);
    });
  }

  private async dispatchAutoTriggerEntry(
    executionContext: ExecutionContext,
    entry: AutoTriggerEntry
  ) {
    const workItemElement = this.getWorkItem();
    const workItem = await executionContext.mutationCtx.db.get(
      entry.workItemId
    );
    assertWorkItemExists(workItem, entry.workItemId);

    const autoStartExecutionContext = executionContext.extend({
      isInternalMutation: true,
    });

    switch (entry.transition) {
      case "start":
        await workItemElement.start(
          autoStartExecutionContext,
          workItem,
          entry.payload
        );
        break;
      case "complete":
        await workItemElement.complete(
          autoStartExecutionContext,
          workItem,
          entry.payload
        );
        break;
      case "fail":
        await workItemElement.fail(
          autoStartExecutionContext,
          workItem,
          entry.payload
        );
        break;
      case "cancel":
        await workItemElement.cancel(
          autoStartExecutionContext,
          workItem,
          entry.payload
        );
        break;
    }
  }
  private makeTaskActivityContext(
    executionContext: ExecutionContext,
    task: Doc<"tasquencerTasks">,
    parentWorkflowId: Id<"tasquencerWorkflows">,
    auditInfo: AuditCallbackInfo
  ) {
    return {
      mutationCtx: executionContext.mutationCtx,
      isInternalMutation: executionContext.isInternalMutation,
      executionMode: executionContext.executionMode,
      workItem: {
        getAllWorkItemIds: async () => {
          return await this.getWorkItem().getAllWorkItemIds(executionContext, {
            workflowId: parentWorkflowId,
            taskName: this.name,
            taskGeneration: task.generation,
          });
        },
        path: this.getWorkItem().path,
      },
      parent: {
        workflow: {
          id: parentWorkflowId,
          name: this.parentWorkflow.name,
        },
      },
      task: {
        name: this.name,
        generation: task.generation,
        path: this.path,
      },
      audit: auditInfo,
    };
  }

  private makeTaskActivityWorkItemInitialize(
    executionContext: ExecutionContext,
    task: Doc<"tasquencerTasks">,
    parentWorkflowId: Id<"tasquencerWorkflows">,
    workItemAutoTriggerQueue: WorkItemAutoTriggerQueue
  ): (payload?: unknown) => Promise<Id<"tasquencerWorkItems">> {
    return async (payload?: unknown): Promise<Id<"tasquencerWorkItems">> => {
      return await this.getWorkItem().initialize(
        executionContext.extend({ isInternalMutation: true }),

        {
          workflowId: parentWorkflowId,
          taskName: this.name,
          taskGeneration: task.generation,
        },
        payload,
        workItemAutoTriggerQueue
      );
    };
  }
}
