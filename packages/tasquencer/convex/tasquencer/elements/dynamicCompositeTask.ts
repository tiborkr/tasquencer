import {
  assertParentExists,
  StructuralIntegrityError,
  ConstraintViolationError,
} from "../exceptions";
import { BaseTask } from "./baseTask";
import { type Doc, type Id } from "../../_generated/dataModel";
import {
  type TaskJoinType,
  type TaskSplitType,
  type WorkflowState,
} from "../types";
import { Workflow } from "./workflow";
import {
  type AnyDynamicCompositeTaskActivities,
  type DynamicCompositeTaskPolicy,
} from "../builder";
import { cancelScheduledForTask } from "../util/scheduler";
import {
  applyStatsTransition,
  getAggregatedTaskStats,
} from "../util/statsShards";
import {
  createTaskActivitySpan,
  completeSpan,
  failSpan,
  type AuditCallbackInfo,
} from "../audit/integration";
import { type SpanAttributes } from "../../components/audit/src/shared/attributeSchemas";
import { createCompositeTaskRegisterScheduled } from "./helpers/schedulerHelpers";
import {
  loadEntitiesByStates,
  cancelEntities,
} from "./helpers/nonFinalizedHelpers";
import { ExecutionContext } from "./executionContext";
import { type AuditContext } from "../../components/audit/src/shared/context";
import {
  auditInfoFromSpanResult,
  type AuditSpanResult,
} from "./helpers/auditHelpers";
import type { DynamicCompositeTaskOnMigrate } from "../versionManager/migration";

function isDynamicCompositeTaskOnMigrate(
  migrator: unknown
): migrator is DynamicCompositeTaskOnMigrate<{ name: string; payload?: unknown }> {
  return typeof migrator === "function";
}

type DynamicCompositeTaskActivityExecution = {
  spanResult: AuditSpanResult;
  auditInfo: ReturnType<typeof auditInfoFromSpanResult>;
  complete: (attributes?: SpanAttributes) => void;
  fail: (error: unknown) => void;
};

function createDynamicCompositeTaskActivityExecution({
  activityName,
  taskName,
  workflowId,
  parentContext,
}: {
  activityName: string;
  taskName: string;
  workflowId: Id<"tasquencerWorkflows">;
  parentContext: AuditContext;
}): DynamicCompositeTaskActivityExecution {
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

export class DynamicCompositeTask extends BaseTask {
  private workflows: Map<string, Workflow> = new Map();

  constructor(
    name: string,
    versionName: string,
    path: string[],
    parentWorkflow: Workflow,
    readonly activities: AnyDynamicCompositeTaskActivities,
    readonly policy: DynamicCompositeTaskPolicy,
    props?: {
      splitType?: TaskSplitType;
      joinType?: TaskJoinType;
      statsShardCount?: number;
    }
  ) {
    super(name, versionName, path, parentWorkflow, props);
  }

  setWorkflows(workflows: Map<string, Workflow>) {
    this.workflows = workflows;
  }

  getWorkflows() {
    return this.workflows;
  }

  getWorkflow(name: string) {
    const workflow = this.workflows.get(name);
    if (!workflow) {
      throw new StructuralIntegrityError(
        `Workflow ${name} not found for dynamic composite task ${this.name}`,
        { taskName: this.name, workflowName: name }
      );
    }
    return workflow;
  }

  private async updateWorkflowStats(
    executionContext: ExecutionContext,
    parentWorkflowId: Id<"tasquencerWorkflows">,
    taskGeneration: number,
    workflowId: Id<"tasquencerWorkflows">,
    prevState: WorkflowState | undefined,
    nextState: WorkflowState
  ) {
    await applyStatsTransition({
      ctx: executionContext.mutationCtx,
      workflowId: parentWorkflowId,
      taskName: this.name,
      taskGeneration,
      shardCount: this.getStatsShardCount(),
      entityId: workflowId,
      prevState,
      nextState,
    });
  }

  async workflowInitialized(
    executionContext: ExecutionContext,
    parentWorkflowId: Id<"tasquencerWorkflows">,
    taskGeneration: number,
    workflowId: Id<"tasquencerWorkflows">
  ) {
    await this.updateWorkflowStats(
      executionContext,
      parentWorkflowId,
      taskGeneration,
      workflowId,
      undefined,
      "initialized"
    );
  }

  async getWorkflowsByState(
    executionContext: ExecutionContext,
    parentWorkflowId: Id<"tasquencerWorkflows">,
    task: Doc<"tasquencerTasks">,
    state: WorkflowState
  ) {
    return await executionContext.mutationCtx.db
      .query("tasquencerWorkflows")
      .withIndex(
        "by_parent_workflow_id_task_name_task_generation_state_and_name",
        (q) =>
          q
            .eq("parent.workflowId", parentWorkflowId)
            .eq("parent.taskName", this.name)
            .eq("parent.taskGeneration", task.generation)
            .eq("state", state)
      )
      .collect();
  }

  async getNonFinalizedWorkflows(
    executionContext: ExecutionContext,
    parentWorkflowId: Id<"tasquencerWorkflows">
  ) {
    const task = await this.getTaskByName(executionContext, parentWorkflowId);

    return await loadEntitiesByStates(
      ["initialized", "started"] as const,
      async (state) =>
        await this.getWorkflowsByState(
          executionContext,
          parentWorkflowId,
          task,
          state
        )
    );
  }

  async cancelNonFinalizedWorkflows(
    executionContext: ExecutionContext,
    parentWorkflowId: Id<"tasquencerWorkflows">,
    callPolicy: boolean = false
  ) {
    const workflows = await this.getNonFinalizedWorkflows(
      executionContext,
      parentWorkflowId
    );
    await cancelEntities(workflows, async (workflow) => {
      const workflowDef = this.getWorkflow(workflow.name);
      return await workflowDef.cancel(
        executionContext,
        workflow._id,
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

    if (isDynamicCompositeTaskOnMigrate(migrator)) {
      const activity = createDynamicCompositeTaskActivityExecution({
        activityName: "onFastForward",
        taskName: this.name,
        workflowId,
        parentContext: executionContext.auditContext,
      });

      try {
        let wasChildWorkflowInitialized = false;

        // Build initialize functions object for each workflow type
        const initializeFunctions: Record<
          string,
          (payload?: unknown) => Promise<Id<"tasquencerWorkflows">>
        > = {};

        for (const workflowName of this.workflows.keys()) {
          initializeFunctions[workflowName] = async (payload?: unknown) => {
            wasChildWorkflowInitialized = true;
            return await this.getWorkflow(workflowName).initialize(
              executionContext.extend({ isInternalMutation: true }),
              {
                workflowId: workflowId,
                taskName: this.name,
                taskGeneration: task.generation,
              },
              payload
            );
          };
        }

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
          workflow: {
            initialize: initializeFunctions as any,
          },
          registerScheduled: createCompositeTaskRegisterScheduled(
            executionContext.mutationCtx,
            task._id,
            task.generation
          ),
          audit: activity.auditInfo,
        });

        if (wasChildWorkflowInitialized && result === "fastForward") {
          throw new ConstraintViolationError(
            "FAST_FORWARD_AND_CHILD_WORKFLOW_INITIALIZATION",
            {
              taskName: this.name,
            }
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
    parentWorkflowId: Id<"tasquencerWorkflows">,
    task: Doc<"tasquencerTasks">
  ) {
    const registerScheduled = createCompositeTaskRegisterScheduled(
      executionContext.mutationCtx,
      task._id,
      task.generation
    );

    const activity = createDynamicCompositeTaskActivityExecution({
      activityName: "onEnabled",
      taskName: this.name,
      workflowId: parentWorkflowId,
      parentContext: executionContext.auditContext,
    });

    const initialActivityContext = this.makeDynamicCompositeTaskActivityContext(
      executionContext,
      task,
      parentWorkflowId,
      activity.auditInfo
    );

    try {
      await this.activities.onEnabled({
        ...initialActivityContext,
        registerScheduled,
        workflow: {
          ...initialActivityContext.workflow,
          initialize: this.makeDynamicCompositeTaskActivityWorkflowInitialize(
            executionContext,
            task,
            parentWorkflowId
          ),
        },
      });
      activity.complete();
    } catch (error) {
      activity.fail(error);
      throw error;
    }
  }

  async afterStart(
    executionContext: ExecutionContext,
    parentWorkflowId: Id<"tasquencerWorkflows">,
    task: Doc<"tasquencerTasks">
  ) {
    const registerScheduled = createCompositeTaskRegisterScheduled(
      executionContext.mutationCtx,
      task._id,
      task.generation
    );

    const activity = createDynamicCompositeTaskActivityExecution({
      activityName: "onStarted",
      taskName: this.name,
      workflowId: parentWorkflowId,
      parentContext: executionContext.auditContext,
    });

    const initialActivityContext = this.makeDynamicCompositeTaskActivityContext(
      executionContext,
      task,
      parentWorkflowId,
      activity.auditInfo
    );

    try {
      await this.activities.onStarted({
        ...initialActivityContext,
        registerScheduled,
        workflow: {
          ...initialActivityContext.workflow,
          initialize: this.makeDynamicCompositeTaskActivityWorkflowInitialize(
            executionContext,
            task,
            parentWorkflowId
          ),
        },
      });
      activity.complete();
    } catch (error) {
      activity.fail(error);
      throw error;
    }
  }

  async maybeComplete(
    executionContext: ExecutionContext,
    parentWorkflowId: Id<"tasquencerWorkflows">,
    task: Doc<"tasquencerTasks">
  ) {
    const policyResult = await this.policy({
      mutationCtx: executionContext.mutationCtx,
      parentWorkflow: {
        id: parentWorkflowId,
        name: this.parentWorkflow.name,
      },
      task: {
        name: this.name,
        generation: task.generation,
        path: this.path,
        getStats: async () =>
          getAggregatedTaskStats(executionContext.mutationCtx.db, {
            workflowId: parentWorkflowId,
            taskName: this.name,
            taskGeneration: task.generation,
          }),
      },
      workflows: Array.from(this.workflows.values()).map((workflow) => ({
        getAllWorkflowIds: async () => {
          return await workflow.getAllWorkflowIds(
            executionContext,
            parentWorkflowId,
            task
          );
        },
        path: workflow.path,
        name: workflow.name,
      })),
      transition: {
        prevState: "started" as WorkflowState,
        nextState: "completed",
      },
    });

    if (policyResult === "complete") {
      await this.complete(executionContext, parentWorkflowId, task);
    } else if (policyResult === "fail") {
      await this.fail(executionContext, parentWorkflowId, task);
    }
  }

  async afterComplete(
    executionContext: ExecutionContext,
    parentWorkflowId: Id<"tasquencerWorkflows">,
    task: Doc<"tasquencerTasks">
  ) {
    await this.cancelScheduledSubWorkflowInitializations(
      executionContext,
      task
    );

    const activity = createDynamicCompositeTaskActivityExecution({
      activityName: "onCompleted",
      taskName: this.name,
      workflowId: parentWorkflowId,
      parentContext: executionContext.auditContext,
    });

    try {
      await this.activities.onCompleted(
        this.makeDynamicCompositeTaskActivityContext(
          executionContext,
          task,
          parentWorkflowId,
          activity.auditInfo
        )
      );
      activity.complete();
    } catch (error) {
      activity.fail(error);
      throw error;
    }
  }

  async afterFail(
    executionContext: ExecutionContext,
    parentWorkflowId: Id<"tasquencerWorkflows">,
    task: Doc<"tasquencerTasks">
  ) {
    await this.cancelNonFinalizedWorkflows(executionContext, parentWorkflowId);
    await this.cancelScheduledSubWorkflowInitializations(
      executionContext,
      task
    );

    const activity = createDynamicCompositeTaskActivityExecution({
      activityName: "onFailed",
      taskName: this.name,
      workflowId: parentWorkflowId,
      parentContext: executionContext.auditContext,
    });

    try {
      await this.activities.onFailed(
        this.makeDynamicCompositeTaskActivityContext(
          executionContext,
          task,
          parentWorkflowId,
          activity.auditInfo
        )
      );
      activity.complete();
    } catch (error) {
      activity.fail(error);
      throw error;
    }
  }

  async afterCancel(
    executionContext: ExecutionContext,
    parentWorkflowId: Id<"tasquencerWorkflows">,
    task: Doc<"tasquencerTasks">
  ) {
    await this.cancelNonFinalizedWorkflows(executionContext, parentWorkflowId);
    await this.cancelScheduledSubWorkflowInitializations(
      executionContext,
      task
    );

    const activity = createDynamicCompositeTaskActivityExecution({
      activityName: "onCanceled",
      taskName: this.name,
      workflowId: parentWorkflowId,
      parentContext: executionContext.auditContext,
    });

    try {
      await this.activities.onCanceled(
        this.makeDynamicCompositeTaskActivityContext(
          executionContext,
          task,
          parentWorkflowId,
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
    parentWorkflowId: Id<"tasquencerWorkflows">,
    task: Doc<"tasquencerTasks">
  ) {
    await this.cancelNonFinalizedWorkflows(executionContext, parentWorkflowId);
    await this.cancelScheduledSubWorkflowInitializations(
      executionContext,
      task
    );

    const activity = createDynamicCompositeTaskActivityExecution({
      activityName: "onDisabled",
      taskName: this.name,
      workflowId: parentWorkflowId,
      parentContext: executionContext.auditContext,
    });

    try {
      await this.activities.onDisabled(
        this.makeDynamicCompositeTaskActivityContext(
          executionContext,
          task,
          parentWorkflowId,
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
      workflows: Array.from(this.workflows.values()).map((workflow) => ({
        name: workflow.name,
        getAllWorkflowIds: async () => {
          return await workflow.getAllWorkflowIds(
            executionContext,
            workflowId,
            task
          );
        },
      })),
    };
  }

  async workflowStateChanged(
    executionContext: ExecutionContext,
    parentWorkflowId: Id<"tasquencerWorkflows">,
    workflow: Doc<"tasquencerWorkflows">,
    prevState: WorkflowState,
    nextState: WorkflowState,
    callPolicy: boolean = true
  ) {
    assertParentExists(workflow, "Workflow", workflow._id);
    const workflowParent = workflow.parent;
    const task = await this.getTaskByName(executionContext, parentWorkflowId);

    await this.updateWorkflowStats(
      executionContext,
      parentWorkflowId,
      workflowParent.taskGeneration,
      workflow._id,
      prevState,
      nextState
    );

    const registerScheduled = createCompositeTaskRegisterScheduled(
      executionContext.mutationCtx,
      task._id,
      workflowParent.taskGeneration
    );

    const activity = createDynamicCompositeTaskActivityExecution({
      activityName: "onWorkflowStateChanged",
      taskName: this.name,
      workflowId: parentWorkflowId,
      parentContext: executionContext.auditContext,
    });

    const initialActivityContext = this.makeDynamicCompositeTaskActivityContext(
      executionContext,
      task,
      parentWorkflowId,
      activity.auditInfo
    );

    try {
      await this.activities.onWorkflowStateChanged({
        ...initialActivityContext,
        registerScheduled,
        workflow: {
          ...initialActivityContext.workflow,
          id: workflow._id,
          name: workflow.name,
          prevState,
          nextState,
          initialize: this.makeDynamicCompositeTaskActivityWorkflowInitialize(
            executionContext,
            task,
            parentWorkflowId
          ),
        },
      });
      activity.complete();
    } catch (error) {
      activity.fail(error);
      throw error;
    }

    if (
      nextState === "completed" ||
      nextState === "failed" ||
      nextState === "canceled"
    ) {
      await this.cancelScheduledSubWorkflowInitializations(
        executionContext,
        task
      );
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
        parentWorkflow: {
          id: parentWorkflowId,
          name: this.parentWorkflow.name,
        },
        task: {
          name: this.name,
          generation: workflowParent.taskGeneration,
          path: this.path,
          getStats: async () =>
            getAggregatedTaskStats(executionContext.mutationCtx.db, {
              workflowId: parentWorkflowId,
              taskName: this.name,
              taskGeneration: workflowParent.taskGeneration,
            }),
        },
        workflows: Array.from(this.workflows.values()).map((workflow) => ({
          getAllWorkflowIds: async () => {
            return await workflow.getAllWorkflowIds(
              executionContext,
              parentWorkflowId,
              {
                name: this.name,
                generation: workflowParent.taskGeneration,
              }
            );
          },
          path: workflow.path,
          name: workflow.name,
        })),
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

  private async cancelScheduledSubWorkflowInitializations(
    executionContext: ExecutionContext,
    task: Doc<"tasquencerTasks">
  ) {
    await cancelScheduledForTask(executionContext.mutationCtx, task._id);
  }

  private makeDynamicCompositeTaskActivityContext(
    executionContext: ExecutionContext,
    task: Doc<"tasquencerTasks">,
    parentWorkflowId: Id<"tasquencerWorkflows">,
    auditInfo: AuditCallbackInfo
  ) {
    const paths: Record<string, string[]> = {};
    const names: Record<string, string> = {};

    for (const [workflowName, workflow] of this.workflows.entries()) {
      paths[workflowName] = workflow.path;
      names[workflowName] = workflow.name;
    }

    return {
      mutationCtx: executionContext.mutationCtx,
      isInternalMutation: executionContext.isInternalMutation,
      executionMode: executionContext.executionMode,
      workflow: {
        getAllWorkflowIds: async () => {
          const allIds = await Promise.all(
            Array.from(this.workflows.values()).map((workflow) =>
              workflow.getAllWorkflowIds(
                executionContext,
                parentWorkflowId,
                task
              )
            )
          );
          return allIds.flat();
        },
        paths,
        names,
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

  private makeDynamicCompositeTaskActivityWorkflowInitialize(
    executionContext: ExecutionContext,
    task: Doc<"tasquencerTasks">,
    parentWorkflowId: Id<"tasquencerWorkflows">
  ) {
    const initializeFunctions: Record<
      string,
      (payload?: unknown) => Promise<Id<"tasquencerWorkflows">>
    > = {};

    for (const [workflowName, workflow] of this.workflows.entries()) {
      initializeFunctions[workflowName] = async (payload?: unknown) => {
        return await workflow.initialize(
          executionContext.extend({ isInternalMutation: true }),
          {
            workflowId: parentWorkflowId,
            taskName: this.name,
            taskGeneration: task.generation,
          },
          payload
        );
      };
    }

    return initializeFunctions;
  }
}
