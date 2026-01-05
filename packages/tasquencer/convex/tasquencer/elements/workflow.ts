import { type WorkflowActivities } from "../builder";
import { E2WFOJNet } from "../lib/e2wfojnet";
import {
  activeTaskStates,
  finalWorkflowInstanceStates,
  type CancellationReason,
  type WorkflowState,
} from "../types";
import { type BaseTask } from "./baseTask";
import { type Condition } from "./condition";
import {
  assertWorkflowExists,
  assertWorkflowState,
  assertParentExists,
  assertTaskExists,
  assertConditionExists,
  assertWorkflowMigrationExists,
  InvalidStateTransitionError,
  WorkflowMissingStartConditionError,
  WorkflowMissingEndConditionError,
  WorkflowInvalidStateError,
  assertWorkflowIsNotDeprecated,
  StructuralIntegrityError,
} from "../exceptions";
import { Marking } from "./marking";
import { type Id } from "../../_generated/dataModel";
import { CompositeTask } from "./compositeTask";
import { DynamicCompositeTask } from "./dynamicCompositeTask";
import { type AnyWorkflowActions } from "../builder/workflow/actions";
import { createWorkflowAttributes } from "../util/attributeHelpers";
import {
  type AuditCallbackInfo,
  completeSpan,
  failSpan,
  saveAuditContext,
} from "../audit/integration";
import { getAuditService } from "../../components/audit/src/client/service";
import {
  registerWorkflowScheduled,
  cancelScheduledForWorkflow,
  cancelScheduledForTask,
} from "../util/scheduler";
import { parsePayload } from "../util/helpers";
import {
  type AnyMigration,
  type CompositeTaskOnMigrate,
  type TaskOnMigrate,
} from "../versionManager/migration";
import { createActionAuditInfo } from "./helpers/auditHelpers";
import { ExecutionContext } from "./executionContext";

/**
 * Runtime executor for a workflow instance.
 *
 * Manages task and condition lifecycles, coordinates nested workflows, and bridges workflow
 * actions/activities with audit instrumentation and scheduler integration.
 */
export class Workflow {
  readonly tasks: Record<string, BaseTask> = {};
  readonly conditions: Record<string, Condition> = {};
  private startCondition?: Condition;
  private endCondition?: Condition;
  private parentCompositeTask?: CompositeTask | DynamicCompositeTask;

  constructor(
    readonly name: string,
    readonly versionName: string,
    readonly isVersionDeprecated: boolean,
    readonly migration: undefined | AnyMigration,
    readonly path: string[],
    private readonly activities: WorkflowActivities,
    private readonly actions: AnyWorkflowActions["actions"]
  ) {}

  addTask(task: BaseTask) {
    this.tasks[task.name] = task;
  }

  addCondition(condition: Condition) {
    this.conditions[condition.name] = condition;
  }

  setStartCondition(condition: Condition) {
    this.startCondition = condition;
  }

  getStartCondition() {
    if (!this.startCondition) {
      throw new WorkflowMissingStartConditionError(this.name);
    }
    return this.startCondition;
  }

  setEndCondition(condition: Condition) {
    this.endCondition = condition;
  }

  getEndCondition() {
    if (!this.endCondition) {
      throw new WorkflowMissingEndConditionError(this.name);
    }
    return this.endCondition;
  }

  getCondition(name: string) {
    const condition = this.conditions[name];
    assertConditionExists(condition, name, this.name);
    return condition;
  }

  getTask(name: string) {
    const task = this.tasks[name];
    assertTaskExists(task, name);
    return task;
  }

  setParentCompositeTask(compositeTask: CompositeTask) {
    this.parentCompositeTask = compositeTask;
  }

  setParentDynamicCompositeTask(dynamicCompositeTask: DynamicCompositeTask) {
    this.parentCompositeTask = dynamicCompositeTask;
  }

  getParentCompositeTask() {
    return this.parentCompositeTask;
  }

  getMigrationInitializer() {
    return this.migration?.initializer;
  }

  getMigratorForTask(task: string) {
    return this.migration?.taskMigrators?.[`${this.name}/${task}`] as
      | CompositeTaskOnMigrate<unknown>
      | TaskOnMigrate<unknown>
      | undefined;
  }

  async initialize(
    executionContext: ExecutionContext,
    parent:
      | {
          workflowId: Id<"tasquencerWorkflows">;
          taskName: string;
          taskGeneration: number;
        }
      | undefined,
    payload: unknown
  ) {
    assertWorkflowIsNotDeprecated(this);

    return await this.initializeInternal(executionContext, parent, payload, {
      initalizationMode: { type: "normal" },
    });
  }

  async initializeFastForwarded(
    executionContext: ExecutionContext,
    fromWorkflowId: Id<"tasquencerWorkflows">
  ) {
    assertWorkflowIsNotDeprecated(this);

    if (this.getParentCompositeTask()) {
      throw new StructuralIntegrityError(
        "Workflow.initializeFastForwarded can only be called for root workflows",
        { workflowName: this.name }
      );
    }

    return await this.initializeInternal(
      executionContext,
      undefined,
      undefined,
      {
        initalizationMode: {
          type: "fastForward",
          fromWorkflowId: fromWorkflowId,
        },
      }
    );
  }

  private async initializeInternal(
    executionContext: ExecutionContext,
    parent:
      | {
          workflowId: Id<"tasquencerWorkflows">;
          taskName: string;
          taskGeneration: number;
        }
      | undefined,
    payload: unknown,
    options: {
      initalizationMode:
        | {
            type: "fastForward";
            fromWorkflowId: Id<"tasquencerWorkflows">;
          }
        | {
            type: "normal";
          };
    }
  ) {
    return await executionContext.withSpan(
      {
        operation: "Workflow.initialize",
        operationType: "workflow",
        resourceType: "workflow",
        resourceName: this.name,
        attributes: createWorkflowAttributes({
          parent,
          workflowName: this.name,
          versionName: this.versionName,
        }),
      },
      async (executionContext) => {
        const skipLifecycleHooks =
          options.initalizationMode.type === "fastForward";
        const initializeFn = (() => {
          let id: Id<"tasquencerWorkflows"> | undefined;

          return async () => {
            if (id) {
              return id;
            }

            const workflowId = await executionContext.mutationCtx.db.insert(
              "tasquencerWorkflows",
              {
                path: this.path,
                name: this.name,
                versionName: this.versionName,
                executionMode: executionContext.executionMode,
                state: "initialized",
                realizedPath: await this.getParentRealizedPath(
                  executionContext,
                  parent
                ),
                parent,
              }
            );

            await this.initializeWorkflowElements(executionContext, workflowId);

            if (options.initalizationMode.type === "fastForward") {
              await executionContext.mutationCtx.db.insert(
                "tasquencerMigration",
                {
                  fromWorkflowId: options.initalizationMode.fromWorkflowId,
                  toWorkflowId: workflowId,
                }
              );
              const migrationInitializer = this.getMigrationInitializer();

              const registerScheduledForMigration = async (
                scheduled: Promise<Id<"_scheduled_functions">>
              ) => {
                return await registerWorkflowScheduled({
                  mutationCtx: executionContext.mutationCtx,
                  workflowId,
                  scheduled,
                });
              };

              if (migrationInitializer) {
                await migrationInitializer({
                  mutationCtx: executionContext.mutationCtx,
                  isInternalMutation: executionContext.isInternalMutation,
                  migratingFromWorkflow: {
                    id: options.initalizationMode.fromWorkflowId,
                    name: this.name,
                  },
                  registerScheduled: registerScheduledForMigration,
                  workflow: { id: workflowId, name: this.name },
                  audit: executionContext.createActionAuditInfo(),
                });
              }
            }

            id = workflowId;

            return id;
          };
        })();

        if (!skipLifecycleHooks) {
          const registerScheduledForActions = async (
            scheduled: Promise<Id<"_scheduled_functions">>
          ) => {
            const workflowId = await initializeFn();
            return await registerWorkflowScheduled({
              mutationCtx: executionContext.mutationCtx,
              workflowId,
              scheduled,
            });
          };

          const parsedPayload = parsePayload(
            this.actions.initialize.schema,
            payload
          );

          await this.actions.initialize.callback(
            {
              mutationCtx: executionContext.mutationCtx,
              isInternalMutation: executionContext.isInternalMutation,
              executionMode: executionContext.executionMode,
              registerScheduled: registerScheduledForActions,
              workflow: { name: this.name, initialize: initializeFn },
              parent: this.makeWorkflowParentInfo(parent),
              audit: executionContext.createActionAuditInfo(),
            },
            parsedPayload
          );
        }

        const id = await initializeFn();

        const parentCompositeTask = this.getParentCompositeTask();
        if (parentCompositeTask && parent) {
          await parentCompositeTask.workflowInitialized(
            executionContext,
            parent.workflowId,
            parent.taskGeneration,
            id
          );
        }

        const auditService = getAuditService();
        auditService.addEvent(
          executionContext.auditContext.traceId,
          executionContext.spanId,
          {
            name: "workflowIdAssigned",
            data: { workflowId: id },
          }
        );

        await this.getStartCondition().enableTasks(executionContext, id);

        if (!skipLifecycleHooks) {
          const activitySpan = executionContext.createWorkflowActivitySpan({
            activityName: "onInitialized",
            workflowId: id,
            workflowName: this.name,
          });

          const activityAuditInfo =
            executionContext.createActivityAuditInfo(activitySpan);

          try {
            await this.activities.onInitialized(
              this.makeWorkflowActivityContext(
                executionContext,
                activityAuditInfo,
                id,
                parent
              )
            );

            completeSpan(
              executionContext.auditContext.traceId,
              activitySpan.spanId
            );
          } catch (error) {
            failSpan(
              executionContext.auditContext.traceId,
              activitySpan.spanId,
              error as Error
            );
            throw error;
          }
        }

        // Save context for nested workflows so future mutations can load it
        if (parent) {
          await saveAuditContext(
            executionContext.mutationCtx,
            executionContext.auditFunctionHandles,
            id,
            executionContext.auditContext
          );
        }

        return id;
      }
    );
  }

  private async initializeWorkflowElements(
    executionContext: ExecutionContext,
    workflowId: Id<"tasquencerWorkflows">
  ) {
    const taskInitializationPromises = Object.values(this.tasks).map((task) =>
      task.initialize(executionContext, workflowId)
    );
    const conditionInitializationPromises = Object.values(this.conditions).map(
      (condition) =>
        condition.initialize(
          executionContext,
          workflowId,
          condition === this.startCondition
        )
    );

    await Promise.all([
      ...taskInitializationPromises,
      ...conditionInitializationPromises,
    ]);
  }

  async ensureStarted(
    executionContext: ExecutionContext,
    workflowId: Id<"tasquencerWorkflows">
  ) {
    await this.ensureStartedInternal(
      executionContext.extend({ executionMode: "normal" }),
      workflowId
    );
  }

  async ensureStartedFromFastForward(
    executionContext: ExecutionContext,
    workflowId: Id<"tasquencerWorkflows">
  ) {
    await this.ensureStartedInternal(
      executionContext.extend({ executionMode: "fastForward" }),
      workflowId
    );
  }

  private async ensureStartedInternal(
    executionContext: ExecutionContext,
    workflowId: Id<"tasquencerWorkflows">
  ) {
    const workflow = await executionContext.mutationCtx.db.get(workflowId);

    assertWorkflowExists(workflow, workflowId);

    if (workflow.state === "started") {
      return;
    }

    if (workflow.state === "initialized") {
      await this.startInternal(executionContext, workflowId);
      return;
    }

    throw new WorkflowInvalidStateError(workflowId, workflow.state, [
      "started",
      "initialized",
    ]);
  }

  private async startInternal(
    executionContext: ExecutionContext,
    workflowId: Id<"tasquencerWorkflows">
  ) {
    const workflow = await executionContext.mutationCtx.db.get(workflowId);

    assertWorkflowExists(workflow, workflowId);
    assertWorkflowState(workflow, ["initialized"]);

    return executionContext.withSpan(
      {
        operation: "Workflow.start",
        operationType: "workflow",
        resourceType: "workflow",
        resourceId: workflowId,
        resourceName: this.name,
        attributes: createWorkflowAttributes({
          workflowId,
          workflowName: this.name,
          versionName: this.versionName,
          state: "starting",
        }),
      },
      async (executionContext) => {
        const parentCompositeTask = this.getParentCompositeTask();

        if (parentCompositeTask) {
          assertParentExists(workflow, "Workflow", workflowId);
          if (executionContext.executionMode === "fastForward") {
            await parentCompositeTask.ensureStartedFromFastForward(
              executionContext,
              workflow.parent.workflowId,
              workflow.parent.taskGeneration,
              { autoComplete: false }
            );
          } else {
            await parentCompositeTask.ensureStarted(
              executionContext,
              workflow.parent.workflowId,
              workflow.parent.taskGeneration
            );
          }
        }

        await executionContext.mutationCtx.db.patch(workflowId, {
          state: "started",
        });

        const activitySpan = executionContext.createWorkflowActivitySpan({
          activityName: "onStarted",
          workflowId: workflowId,
          workflowName: this.name,
        });

        const activityAuditInfo =
          executionContext.createActivityAuditInfo(activitySpan);

        try {
          // We supress the onStarted activity when initialized from a fast forwarded task.
          if (executionContext.executionMode === "normal") {
            await this.activities.onStarted(
              this.makeWorkflowActivityContext(
                executionContext,
                activityAuditInfo,
                workflowId,
                workflow.parent
              )
            );
          }

          completeSpan(
            executionContext.auditContext.traceId,
            activitySpan.spanId
          );
        } catch (error) {
          failSpan(
            executionContext.auditContext.traceId,
            activitySpan.spanId,
            error as Error
          );
          throw error;
        }

        if (parentCompositeTask) {
          /*
          We don't propagate fast forward to parent composite task, because we only want to supress the activity onInitalized activity for the root workflow. Child workflow can't be initialized from a fast forwarded task by design. If we have a child workflow, this means that the parent composite task is operating in normal mode.
          */
          assertParentExists(workflow, "Workflow", workflowId);

          await parentCompositeTask.workflowStateChanged(
            executionContext,
            workflow.parent.workflowId,
            workflow,
            workflow.state,
            "started",
            true
          );
        }
      }
    );
  }

  async complete(
    executionContext: ExecutionContext,
    workflowId: Id<"tasquencerWorkflows">
  ) {
    const parentCompositeTask = this.getParentCompositeTask();
    const workflow = await executionContext.mutationCtx.db.get(workflowId);
    assertWorkflowExists(workflow, workflowId);
    assertWorkflowState(workflow, ["started"]);

    return executionContext.withSpan(
      {
        operation: "Workflow.complete",
        operationType: "workflow",
        resourceType: "workflow",
        resourceId: workflowId,
        resourceName: this.name,
        attributes: createWorkflowAttributes({
          workflowId,
          workflowName: this.name,
          versionName: this.versionName,
          state: "completing",
        }),
      },
      async (executionContext) => {
        await this.shutdownActiveTasks(executionContext, workflowId);

        await executionContext.mutationCtx.db.patch(workflowId, {
          state: "completed",
        });

        await cancelScheduledForWorkflow(
          executionContext.mutationCtx,
          workflowId
        );

        const parentInfo = workflow.parent;
        if (parentInfo) {
          const parentTask = await executionContext.mutationCtx.db
            .query("tasquencerTasks")
            .withIndex("by_workflow_id_name_and_generation", (q) =>
              q
                .eq("workflowId", parentInfo.workflowId)
                .eq("name", parentInfo.taskName)
                .eq("generation", parentInfo.taskGeneration)
            )
            .unique();
          assertTaskExists(
            parentTask,
            parentInfo.taskName,
            parentInfo.workflowId
          );
          await cancelScheduledForTask(
            executionContext.mutationCtx,
            parentTask._id
          );
        }

        const activitySpan = executionContext.createWorkflowActivitySpan({
          activityName: "onCompleted",
          workflowId: workflowId,
          workflowName: this.name,
        });

        const activityAuditInfo =
          executionContext.createActivityAuditInfo(activitySpan);

        try {
          await this.activities.onCompleted(
            this.makeWorkflowActivityContext(
              executionContext,
              activityAuditInfo,
              workflowId,
              workflow.parent
            )
          );

          completeSpan(
            executionContext.auditContext.traceId,
            activitySpan.spanId
          );
        } catch (error) {
          failSpan(
            executionContext.auditContext.traceId,
            activitySpan.spanId,
            error as Error
          );
          throw error;
        }

        if (parentCompositeTask) {
          assertParentExists(workflow, "Workflow", workflowId);
          await parentCompositeTask.workflowStateChanged(
            executionContext,
            workflow.parent.workflowId,
            workflow,
            workflow.state,
            "completed",
            true
          );
        }

        await this.maybeRunMigrationFinalizer(
          executionContext,
          workflowId,
          "completed"
        );
      }
    );
  }

  async maybeComplete(
    executionContext: ExecutionContext,
    workflowId: Id<"tasquencerWorkflows">
  ) {
    const workflow = await executionContext.mutationCtx.db.get(workflowId);
    assertWorkflowExists(workflow, workflowId);

    if (
      (await this.isEndReached(executionContext, workflowId)) &&
      !finalWorkflowInstanceStates.has(workflow.state)
    ) {
      await this.complete(executionContext, workflowId);
    }
  }

  async cancel(
    executionContext: ExecutionContext,
    workflowId: Id<"tasquencerWorkflows">,
    payload: unknown,
    reason: CancellationReason = "explicit",
    callPolicy: boolean = true
  ) {
    await this.cancelInternal(
      executionContext,
      workflowId,
      payload,
      reason,
      callPolicy
    );
  }

  async cancelForMigration(
    executionContext: ExecutionContext,
    workflowId: Id<"tasquencerWorkflows">,
    payload: unknown
  ) {
    if (this.getParentCompositeTask()) {
      throw new StructuralIntegrityError(
        "Workflow.cancelForMigration can only be called for root workflows",
        { workflowName: this.name }
      );
    }

    await this.cancelInternal(
      executionContext,
      workflowId,
      payload,
      "migration",
      true
    );
  }

  private async cancelInternal(
    executionContext: ExecutionContext,
    workflowId: Id<"tasquencerWorkflows">,
    payload: unknown,
    reason: CancellationReason,
    callPolicy: boolean
  ) {
    const parentCompositeTask = this.getParentCompositeTask();
    const workflow = await executionContext.mutationCtx.db.get(workflowId);
    assertWorkflowExists(workflow, workflowId);
    assertWorkflowState(workflow, ["started", "initialized"]);

    return executionContext.withSpan(
      {
        operation: "Workflow.cancel",
        operationType: "workflow",
        resourceType: "workflow",
        resourceId: workflowId,
        resourceName: this.name,
        attributes: createWorkflowAttributes({
          workflowId,
          workflowName: this.name,
          versionName: this.versionName,
          state: "canceling",
          parent: workflow.parent,
          payload: { reason },
        }),
      },
      async (executionContext) => {
        const cancelFn = (() => {
          let called = false;
          return async () => {
            if (called) {
              return;
            }
            await executionContext.mutationCtx.db.patch(workflowId, {
              state: "canceled",
            });
            called = true;
          };
        })();

        if (reason === "explicit") {
          const actionAuditInfo = createActionAuditInfo(
            executionContext.parent.auditContext,
            executionContext.auditContext,
            executionContext.spanId
          );

          const parsedPayload = parsePayload(
            this.actions.cancel.schema,
            payload
          );

          await this.actions.cancel.callback(
            {
              mutationCtx: executionContext.mutationCtx,
              isInternalMutation: executionContext.isInternalMutation,
              executionMode: executionContext.executionMode,
              workflow: { id: workflowId, name: this.name, cancel: cancelFn },
              parent: this.makeWorkflowParentInfo(workflow.parent),
              audit: actionAuditInfo,
            },
            parsedPayload
          );
        }

        await this.shutdownActiveTasks(executionContext, workflowId);

        await cancelFn();

        await cancelScheduledForWorkflow(
          executionContext.mutationCtx,
          workflowId
        );

        const parentInfo = workflow.parent;
        if (parentInfo) {
          const parentTask = await executionContext.mutationCtx.db
            .query("tasquencerTasks")
            .withIndex("by_workflow_id_name_and_generation", (q) =>
              q
                .eq("workflowId", parentInfo.workflowId)
                .eq("name", parentInfo.taskName)
                .eq("generation", parentInfo.taskGeneration)
            )
            .unique();
          assertTaskExists(
            parentTask,
            parentInfo.taskName,
            parentInfo.workflowId
          );
          await cancelScheduledForTask(
            executionContext.mutationCtx,
            parentTask._id
          );
        }

        const activitySpan = executionContext.createWorkflowActivitySpan({
          activityName: "onCanceled",
          workflowId: workflowId,
          workflowName: this.name,
        });

        const activityAuditInfo =
          executionContext.createActivityAuditInfo(activitySpan);

        try {
          await this.activities.onCanceled(
            this.makeWorkflowActivityContext(
              executionContext,
              activityAuditInfo,
              workflowId,
              workflow.parent
            )
          );

          completeSpan(
            executionContext.auditContext.traceId,
            activitySpan.spanId
          );
        } catch (error) {
          failSpan(
            executionContext.auditContext.traceId,
            activitySpan.spanId,
            error as Error
          );
          throw error;
        }

        if (parentCompositeTask) {
          assertParentExists(workflow, "Workflow", workflowId);
          await parentCompositeTask.workflowStateChanged(
            executionContext,
            workflow.parent.workflowId,
            workflow,
            workflow.state,
            "canceled",
            callPolicy
          );
        }

        await this.maybeRunMigrationFinalizer(
          executionContext,
          workflowId,
          "canceled"
        );
      }
    );
  }

  async fail(
    executionContext: ExecutionContext,
    workflowId: Id<"tasquencerWorkflows">
  ) {
    const parentCompositeTask = this.getParentCompositeTask();
    const workflow = await executionContext.mutationCtx.db.get(workflowId);
    assertWorkflowExists(workflow, workflowId);
    assertWorkflowState(workflow, ["started"]);

    return executionContext.withSpan(
      {
        operation: "Workflow.fail",
        operationType: "workflow",
        resourceType: "workflow",
        resourceId: workflowId,
        resourceName: this.name,
        attributes: createWorkflowAttributes({
          workflowId,
          workflowName: this.name,
          versionName: this.versionName,
          state: "failing",
        }),
      },
      async (executionContext) => {
        await this.shutdownActiveTasks(executionContext, workflowId);

        await executionContext.mutationCtx.db.patch(workflowId, {
          state: "failed",
        });

        await cancelScheduledForWorkflow(
          executionContext.mutationCtx,
          workflowId
        );

        const parentInfo = workflow.parent;
        if (parentInfo) {
          const parentTask = await executionContext.mutationCtx.db
            .query("tasquencerTasks")
            .withIndex("by_workflow_id_name_and_generation", (q) =>
              q
                .eq("workflowId", parentInfo.workflowId)
                .eq("name", parentInfo.taskName)
                .eq("generation", parentInfo.taskGeneration)
            )
            .unique();
          assertTaskExists(
            parentTask,
            parentInfo.taskName,
            parentInfo.workflowId
          );
          await cancelScheduledForTask(
            executionContext.mutationCtx,
            parentTask._id
          );
        }

        const activitySpan = executionContext.createWorkflowActivitySpan({
          activityName: "onFailed",
          workflowId: workflowId,
          workflowName: this.name,
        });

        const activityAuditInfo =
          executionContext.createActivityAuditInfo(activitySpan);

        try {
          await this.activities.onFailed(
            this.makeWorkflowActivityContext(
              executionContext,
              activityAuditInfo,
              workflowId,
              workflow.parent
            )
          );

          completeSpan(
            executionContext.auditContext.traceId,
            activitySpan.spanId,
            {
              type: "activity",
              workflowId,
              activityName: "onFailed",
              data: { businessResult: "failed" },
            }
          );
        } catch (error) {
          failSpan(
            executionContext.auditContext.traceId,
            activitySpan.spanId,
            error as Error
          );
          throw error;
        }

        if (parentCompositeTask) {
          assertParentExists(workflow, "Workflow", workflowId);
          await parentCompositeTask.workflowStateChanged(
            executionContext,
            workflow.parent.workflowId,
            workflow,
            workflow.state,
            "failed",
            true
          );
        }

        await this.maybeRunMigrationFinalizer(
          executionContext,
          workflowId,
          "failed"
        );
      }
    );
  }

  async isEndReached(
    executionContext: ExecutionContext,
    workflowId: Id<"tasquencerWorkflows">
  ) {
    const endConditionMarking = await this.getEndCondition().getMarking(
      executionContext,
      workflowId
    );

    return endConditionMarking > 0;
  }

  private async shutdownActiveTasks(
    executionContext: ExecutionContext,
    workflowId: Id<"tasquencerWorkflows">
  ) {
    const [enabledTasks, startedTasks] = await Promise.all([
      executionContext.mutationCtx.db
        .query("tasquencerTasks")
        .withIndex("by_workflow_id_and_state", (q) =>
          q.eq("workflowId", workflowId).eq("state", "enabled")
        )
        .collect(),
      executionContext.mutationCtx.db
        .query("tasquencerTasks")
        .withIndex("by_workflow_id_and_state", (q) =>
          q.eq("workflowId", workflowId).eq("state", "started")
        )
        .collect(),
    ]);

    await Promise.all([
      ...enabledTasks.map((t) =>
        this.getTask(t.name).disable(executionContext, workflowId, t)
      ),
      ...startedTasks.map((t) =>
        this.getTask(t.name).cancel(executionContext, workflowId, t)
      ),
    ]);
  }

  async isOrJoinSatisfied(
    executionContext: ExecutionContext,
    workflowId: Id<"tasquencerWorkflows">,
    task: BaseTask
  ) {
    const prevConditions = Array.from(task.incomingFlows).flatMap(
      (f) => f.prevElement
    );
    const prevConditionsMarking = await Promise.all(
      prevConditions.map((c) => c.getMarking(executionContext, workflowId))
    );

    // This is handling the case where isOrJoinSatisfied is called as a result of
    // task completion. Previously, Task.isJoinSatisfied was only called as a result
    // of a condition increment, which ensured that at least one condition had a positive marking.
    // This is not the case when a task is completed, so we need to check that at least one
    // condition has a positive marking, otherwise we might get false positives
    if (!prevConditionsMarking.some((m) => m > 0)) {
      return false;
    }

    const startedTasks = (
      await executionContext.mutationCtx.db
        .query("tasquencerTasks")
        .withIndex("by_workflow_id_and_state", (q) =>
          q.eq("workflowId", workflowId).eq("state", "started")
        )
        .collect()
    ).map((t) => this.getTask(t.name));

    const enabledConditions = (
      await executionContext.mutationCtx.db
        .query("tasquencerConditions")
        .withIndex("by_workflow_id_and_marking", (q) =>
          q.eq("workflowId", workflowId).gt("marking", 0)
        )
        .collect()
    ).map((c) => this.getCondition(c.name));

    const marking = new Marking(startedTasks, enabledConditions);

    const e2wfojnet = new E2WFOJNet(
      Object.values(this.tasks),
      Object.values(this.conditions),
      task
    );

    e2wfojnet.restrictNet(marking);
    e2wfojnet.restrictNet(task);

    return e2wfojnet.orJoinEnabled(marking, task);
  }

  async getAllWorkflowIds(
    executionContext: ExecutionContext,
    parentWorkflowId: Id<"tasquencerWorkflows">,
    task: {
      name: string;
      generation: number;
    }
  ) {
    const workflows = await executionContext.mutationCtx.db
      .query("tasquencerWorkflows")
      .withIndex(
        "by_parent_workflow_id_task_name_task_generation_and_name",
        (q) =>
          q
            .eq("parent.workflowId", parentWorkflowId)
            .eq("parent.taskName", task.name)
            .eq("parent.taskGeneration", task.generation)
            .eq("name", this.name)
      )
      .collect();
    return workflows.map((w) => w._id);
  }

  async getParentRealizedPath(
    executionContext: ExecutionContext,
    parent:
      | {
          workflowId: Id<"tasquencerWorkflows">;
          taskName: string;
          taskGeneration: number;
        }
      | undefined
  ) {
    if (!parent) {
      return [];
    }
    const task = await executionContext.mutationCtx.db
      .query("tasquencerTasks")
      .withIndex("by_workflow_id_name_and_generation", (q) =>
        q
          .eq("workflowId", parent.workflowId)
          .eq("name", parent.taskName)
          .eq("generation", parent.taskGeneration)
      )
      .unique();
    assertTaskExists(task, parent.taskName, parent.workflowId);
    if (
      !activeTaskStates.includes(
        task.state as (typeof activeTaskStates)[number]
      )
    ) {
      throw new InvalidStateTransitionError(
        "Task",
        String(task._id),
        task.state,
        [...activeTaskStates]
      );
    }
    return [...task.realizedPath, task._id];
  }
  private makeWorkflowParentInfo(
    parent:
      | {
          workflowId: Id<"tasquencerWorkflows">;
          taskName: string;
          taskGeneration: number;
        }
      | undefined
  ) {
    const parentCompositeTask = this.getParentCompositeTask();
    if (parentCompositeTask) {
      if (!parent) {
        throw new StructuralIntegrityError(
          "Workflow has no parent but parent is required",
          { workflowName: this.name }
        );
      }
      return {
        workflow: {
          id: parent.workflowId,
          name: parentCompositeTask.parentWorkflow.name,
        },
        task: {
          name: parent.taskName,
          generation: parent.taskGeneration,
          path: parentCompositeTask.path,
        },
      };
    }
    return undefined;
  }
  private makeWorkflowActivityContext(
    executionContext: ExecutionContext,
    activityAuditInfo: AuditCallbackInfo,
    workflowId: Id<"tasquencerWorkflows">,
    parent:
      | {
          workflowId: Id<"tasquencerWorkflows">;
          taskName: string;
          taskGeneration: number;
        }
      | undefined
  ) {
    return {
      mutationCtx: executionContext.mutationCtx,
      isInternalMutation: executionContext.isInternalMutation,
      executionMode: executionContext.executionMode,
      registerScheduled: async (
        scheduled: Promise<Id<"_scheduled_functions">>
      ) =>
        await registerWorkflowScheduled({
          mutationCtx: executionContext.mutationCtx,
          workflowId,
          scheduled,
        }),
      workflow: { id: workflowId, name: this.name },
      parent: this.makeWorkflowParentInfo(parent),
      audit: activityAuditInfo,
    };
  }

  private async maybeRunMigrationFinalizer(
    executionContext: ExecutionContext,
    workflowId: Id<"tasquencerWorkflows">,
    finalState: WorkflowState
  ) {
    const workflow = await executionContext.mutationCtx.db.get(workflowId);
    assertWorkflowExists(workflow, workflowId);

    if (
      workflow.parent ||
      workflow.executionMode !== "fastForward" ||
      !this.migration?.finalizer
    ) {
      return;
    }

    const migration = await executionContext.mutationCtx.db
      .query("tasquencerMigration")
      .withIndex("by_toWorkflowId", (q) => q.eq("toWorkflowId", workflowId))
      .first();
    assertWorkflowMigrationExists(migration, workflowId);

    const registerScheduledForFinalizer = async (
      scheduled: Promise<Id<"_scheduled_functions">>
    ) => {
      return await registerWorkflowScheduled({
        mutationCtx: executionContext.mutationCtx,
        workflowId,
        scheduled,
      });
    };

    await this.migration.finalizer({
      mutationCtx: executionContext.mutationCtx,
      isInternalMutation: executionContext.isInternalMutation,
      migratingFromWorkflow: {
        id: migration.fromWorkflowId,
        name: this.name,
      },
      workflow: { id: workflowId, name: this.name },
      result: { state: finalState },
      registerScheduled: registerScheduledForFinalizer,
      audit: executionContext.createActionAuditInfo(),
    });
  }
}
