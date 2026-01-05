import { Workflow } from "./workflow";
import { Condition } from "./condition";
import { ConditionToTaskFlow, TaskToConditionFlow } from "./flow";
import {
  assertWorkflowExists,
  assertTaskExists,
  TaskMissingRouterError,
  TaskInvalidJoinTypeError,
  TaskInvalidRouteError,
  TaskMissingLogItemError,
  assertWorkflowMigrationExists,
  InvalidStateTransitionError,
} from "../exceptions";
import {
  type TaskJoinType,
  type TaskSplitType,
  type TaskState,
  validTaskTransitions,
} from "../types";
import { type Doc, type Id } from "../../_generated/dataModel";
import { ConditionRouting, TaskRouting } from "../builder/flow";
import {
  ensureTaskStatsShards,
  DEFAULT_STATS_SHARD_COUNT,
} from "../util/statsShards";
import type { TaskMigrationMode } from "../versionManager/migration";
import { ExecutionContext } from "./executionContext";
import { createTaskAttributes } from "../util/attributeHelpers";
import { getWorkflowRootWorkflowId } from "../util/workflowHelpers";

type TaskRunMode = "normal" | "fastForward";

async function insertTaskStateLog(
  executionContext: ExecutionContext,
  args: {
    workflowId: Id<"tasquencerWorkflows">;
    name: string;
    versionName: string;
    generation: number;
    state: TaskState;
  }
): Promise<void> {
  await executionContext.mutationCtx.db.insert("tasquencerTasksStateLog", args);
}

export abstract class BaseTask {
  readonly splitType: TaskSplitType;
  readonly joinType: TaskJoinType;
  readonly preSet: Record<string, Condition> = {};
  readonly postSet: Record<string, Condition> = {};
  readonly incomingFlows = new Set<ConditionToTaskFlow>();
  readonly outgoingFlows = new Set<TaskToConditionFlow>();
  readonly cancellationRegion: {
    tasks: Record<string, BaseTask>;
    conditions: Record<string, Condition>;
  } = {
    tasks: {},
    conditions: {},
  };
  protected readonly statsShardCount: number;
  private router?: (...args: any[]) => Promise<unknown>;

  constructor(
    readonly name: string,
    readonly versionName: string,
    readonly path: string[],
    readonly parentWorkflow: Workflow,

    props?: {
      splitType?: TaskSplitType;
      joinType?: TaskJoinType;
      statsShardCount?: number;
    }
  ) {
    this.splitType = props?.splitType ?? "and";
    this.joinType = props?.joinType ?? "and";
    this.statsShardCount = props?.statsShardCount ?? DEFAULT_STATS_SHARD_COUNT;
  }

  addIncomingFlow(flow: ConditionToTaskFlow) {
    this.incomingFlows.add(flow);
    this.preSet[flow.prevElement.name] = flow.prevElement;
  }
  addOutgoingFlow(flow: TaskToConditionFlow) {
    this.outgoingFlows.add(flow);
    this.postSet[flow.nextElement.name] = flow.nextElement;
  }

  addTaskToCancellationRegion(task: BaseTask) {
    this.cancellationRegion.tasks[task.name] = task;
  }
  addConditionToCancellationRegion(condition: Condition) {
    this.cancellationRegion.conditions[condition.name] = condition;
  }

  getPresetElements() {
    return new Set(Object.values(this.preSet));
  }

  getPostsetElements() {
    return new Set(Object.values(this.postSet));
  }

  getRemoveSet() {
    return new Set([
      ...Object.values(this.cancellationRegion.tasks),
      ...Object.values(this.cancellationRegion.conditions),
    ]);
  }

  setRouter(router: (...args: any[]) => Promise<unknown>) {
    this.router = router;
  }

  getRouter() {
    const router = this.router;
    if (!router) {
      throw new TaskMissingRouterError(this.name);
    }
    return router;
  }

  async initialize(
    executionContext: ExecutionContext,
    workflowId: Id<"tasquencerWorkflows">
  ) {
    return await executionContext.withSpan(
      {
        operation: "Task.initialize",
        operationType: "task",
        resourceType: "task",
        resourceId: `${workflowId}:${this.name}`,
        resourceName: this.name,
        attributes: createTaskAttributes({
          workflowId,
          generation: 0,
          versionName: this.versionName,
          state: "disabled",
        }),
      },
      async (executionContext) => {
        const workflow = await executionContext.mutationCtx.db.get(workflowId);
        assertWorkflowExists(workflow, workflowId);

        await executionContext.mutationCtx.db.insert("tasquencerTasks", {
          name: this.name,
          path: this.path,
          versionName: this.versionName,
          executionMode: executionContext.executionMode,
          realizedPath: [...workflow.realizedPath, workflowId],
          workflowId,
          state: "disabled",
          generation: 0,
        });
        await insertTaskStateLog(executionContext, {
          workflowId,
          name: this.name,
          generation: 0,
          versionName: this.versionName,
          state: "disabled",
        });

        await ensureTaskStatsShards({
          ctx: executionContext.mutationCtx,
          workflowId,
          taskName: this.name,
          taskGeneration: 0,
          versionName: this.versionName,
          shardCount: this.statsShardCount,
        });
      }
    );
  }

  async getTaskByName(
    executionContext: ExecutionContext,
    workflowId: Id<"tasquencerWorkflows">
  ) {
    const task = await executionContext.mutationCtx.db
      .query("tasquencerTasks")
      .withIndex("by_workflow_id_name_and_generation", (q) =>
        q.eq("workflowId", workflowId).eq("name", this.name)
      )
      .unique();

    assertTaskExists(task, this.name, workflowId);

    return task;
  }

  async enableIfInStateThatCanTransitionToEnabled(
    executionContext: ExecutionContext,
    workflowId: Id<"tasquencerWorkflows">
  ) {
    const logItem = await executionContext.mutationCtx.db
      .query("tasquencerTasksStateLog")
      .withIndex("by_workflow_id_name_and_generation", (q) =>
        q.eq("workflowId", workflowId).eq("name", this.name)
      )
      .order("desc")
      .first();

    if (!logItem) {
      throw new TaskMissingLogItemError(this.name, workflowId);
    }

    if (validTaskTransitions[logItem.state].has("enabled")) {
      const task = await this.getTaskByName(executionContext, workflowId);
      await this.enable(executionContext, workflowId, task);
    }
  }

  async enable(
    executionContext: ExecutionContext,
    workflowId: Id<"tasquencerWorkflows">,
    task: Doc<"tasquencerTasks">
  ) {
    const isJoinSatisfied = await this.isJoinSatisfied(
      executionContext,
      workflowId
    );
    const generation = task.generation + 1;

    if (
      isJoinSatisfied &&
      validTaskTransitions[task.state as TaskState].has("enabled")
    ) {
      const inputConditions = await Promise.all(
        Object.values(this.preSet).map(async (condition) => ({
          name: condition.name,
          marking: await condition.getMarking(executionContext, workflowId),
        }))
      );

      return await executionContext.withSpan(
        {
          operation: "Task.enable",
          operationType: "task",
          resourceType: "task",
          resourceId: `${workflowId}:${this.name}`,
          resourceName: this.name,
          attributes: createTaskAttributes({
            workflowId,
            generation,
            versionName: this.versionName,
            state: "enabled",
            joinType: this.joinType,
            splitType: this.splitType,
            inputConditions,
            joinSatisfied: true,
          }),
        },
        async (executionContext) => {
          const patch = {
            state: "enabled",
            generation,
          } as const;

          await executionContext.mutationCtx.db.patch(task._id, patch);
          await insertTaskStateLog(executionContext, {
            workflowId,
            name: this.name,
            generation,
            versionName: this.versionName,
            state: "enabled",
          });

          await ensureTaskStatsShards({
            ctx: executionContext.mutationCtx,
            workflowId,
            taskName: this.name,
            taskGeneration: generation,
            versionName: this.versionName,
            shardCount: this.statsShardCount,
          });

          const updatedTask = {
            ...task,
            ...patch,
          };

          const fastForwardHandled = await this.tryFastForwardEnable(
            executionContext,
            workflowId,
            updatedTask
          );

          if (fastForwardHandled) {
            return;
          }

          await this.afterEnable(executionContext, workflowId, updatedTask);
        }
      );
    }
  }

  abstract onFastForward(
    executionContext: ExecutionContext,
    workflowId: Id<"tasquencerWorkflows">,
    task: Doc<"tasquencerTasks">
  ): Promise<TaskMigrationMode>;

  abstract afterEnable(
    executionContext: ExecutionContext,
    workflowId: Id<"tasquencerWorkflows">,
    task: Doc<"tasquencerTasks">
  ): Promise<void>;

  async ensureStarted(
    executionContext: ExecutionContext,
    workflowId: Id<"tasquencerWorkflows">,
    generation: number
  ) {
    await this.ensureStartedInternal(
      executionContext,
      workflowId,
      generation,
      "normal"
    );
  }

  async ensureStartedFromFastForward(
    executionContext: ExecutionContext,
    workflowId: Id<"tasquencerWorkflows">,
    generation: number,
    options?: { autoComplete?: boolean }
  ) {
    await this.ensureStartedInternal(
      executionContext,
      workflowId,
      generation,
      "fastForward",
      options?.autoComplete ?? true
    );
  }

  private async ensureStartedInternal(
    executionContext: ExecutionContext,
    workflowId: Id<"tasquencerWorkflows">,
    generation: number,
    mode: TaskRunMode,
    autoComplete: boolean = false
  ) {
    const startedLogItem = await executionContext.mutationCtx.db
      .query("tasquencerTasksStateLog")
      .withIndex("by_workflow_id_name_and_generation", (q) =>
        q
          .eq("workflowId", workflowId)
          .eq("name", this.name)
          .eq("generation", generation)
      )
      .order("desc")
      .first();

    const isStarted = startedLogItem?.state === "started";

    if (isStarted) {
      return;
    }

    await executionContext.withSpan(
      {
        operation: "Task.start",
        operationType: "task",
        resourceType: "task",
        resourceId: `${workflowId}:${this.name}`,
        resourceName: this.name,
        attributes: createTaskAttributes({
          workflowId,
          generation,
          versionName: this.versionName,
          state: "started",
        }),
      },
      async (executionContext) => {
        await insertTaskStateLog(executionContext, {
          workflowId,
          name: this.name,
          versionName: this.versionName,
          generation,
          state: "started",
        });

        const task = await this.getTaskByName(executionContext, workflowId);

        if (mode === "fastForward") {
          await this.parentWorkflow.ensureStartedFromFastForward(
            executionContext,
            workflowId
          );
        } else {
          await this.parentWorkflow.ensureStarted(executionContext, workflowId);
        }
        await executionContext.mutationCtx.db.patch(task._id, {
          state: "started",
        });

        const startedTask = {
          ...task,
          state: "started" as const,
        };

        await Promise.all(
          Object.values(this.preSet).map((condition) =>
            condition.decrementMarking(executionContext, workflowId)
          )
        );

        if (mode === "fastForward" && autoComplete) {
          await this.completeSilently(
            executionContext,
            workflowId,
            startedTask
          );
          return;
        }

        if (mode === "normal") {
          await this.afterStart(executionContext, workflowId, startedTask);
          await this.maybeComplete(executionContext, workflowId, startedTask);
        }
      }
    );
  }

  abstract afterStart(
    executionContext: ExecutionContext,
    workflowId: Id<"tasquencerWorkflows">,
    task: Doc<"tasquencerTasks">
  ): Promise<void>;

  abstract maybeComplete(
    executionContext: ExecutionContext,
    workflowId: Id<"tasquencerWorkflows">,
    task: Doc<"tasquencerTasks">
  ): Promise<void>;

  async complete(
    executionContext: ExecutionContext,
    workflowId: Id<"tasquencerWorkflows">,
    task: Doc<"tasquencerTasks">
  ) {
    await this.completeInternal(
      executionContext.extend({ executionMode: "normal" }),
      workflowId,
      task
    );
  }

  private async completeSilently(
    executionContext: ExecutionContext,
    workflowId: Id<"tasquencerWorkflows">,
    task: Doc<"tasquencerTasks">
  ) {
    await this.completeInternal(
      executionContext.extend({ executionMode: "fastForward" }),
      workflowId,
      task
    );
  }

  private async completeInternal(
    executionContext: ExecutionContext,
    workflowId: Id<"tasquencerWorkflows">,
    task: Doc<"tasquencerTasks">
  ) {
    return await executionContext.withSpan(
      {
        operation: "Task.complete",
        operationType: "task",
        resourceType: "task",
        resourceId: `${workflowId}:${this.name}`,
        resourceName: this.name,
        attributes: createTaskAttributes({
          workflowId,
          generation: task.generation,
          versionName: this.versionName,
          state: "completed",
          splitType: this.splitType,
          outputConditions: Object.keys(this.postSet),
        }),
      },
      async (executionContext) => {
        await executionContext.mutationCtx.db.patch(task._id, {
          state: "completed",
        });
        await insertTaskStateLog(executionContext, {
          workflowId,
          name: this.name,
          versionName: this.versionName,
          generation: task.generation,
          state: "completed",
        });

        if (executionContext.executionMode === "normal") {
          await this.afterComplete(executionContext, workflowId, task);
        }

        await this.cancelCancellationRegion(executionContext, workflowId);

        await this.produceTokensInOutgoingFlows(
          executionContext,
          workflowId,
          task
        );
        /*
      Previously this code looked like this:

      const toEnable = Array.from(this.outgoingFlows).map((flow) =>
        flow.nextElement.enableTasks(mutationCtx, workflowId, childContext),
      )

      But it had an issue where if a task had multiple outgoing flows, it would enable the task multiple times.
      So we now use a set to ensure that each task is enabled only once.
      */
        const tasksToEnable = new Set(
          Array.from(this.outgoingFlows).flatMap((flow) => {
            return Object.values(flow.nextElement.postSet);
          })
        );

        // Sequential execution is required because parallel task enabling with
        // nested sub-workflow initialization can cause race conditions in the
        // test framework (convex-test) where newly inserted documents become
        // inaccessible during parallel async operations within the same mutation.
        // TODO: Revisit in the future to see if the issue was fixed in convex-test
        for (const task of tasksToEnable) {
          await task.enableIfInStateThatCanTransitionToEnabled(
            executionContext,
            workflowId
          );
        }

        // Enable the task again if the join is satisfied
        await this.enable(
          executionContext,
          workflowId,
          await this.getTaskByName(executionContext, workflowId)
        );
        await this.parentWorkflow.maybeComplete(executionContext, workflowId);
      }
    );
  }

  abstract afterComplete(
    executionContext: ExecutionContext,
    workflowId: Id<"tasquencerWorkflows">,
    task: Doc<"tasquencerTasks">
  ): Promise<void>;

  async fail(
    executionContext: ExecutionContext,
    workflowId: Id<"tasquencerWorkflows">,
    task: Doc<"tasquencerTasks">
  ) {
    if (!validTaskTransitions[task.state as TaskState].has("failed")) {
      throw new InvalidStateTransitionError(
        "Task",
        String(task._id),
        task.state,
        ["started"]
      );
    }

    return await executionContext.withSpan(
      {
        operation: "Task.fail",
        operationType: "task",
        resourceType: "task",
        resourceId: `${workflowId}:${this.name}`,
        resourceName: this.name,
        attributes: createTaskAttributes({
          workflowId,
          generation: task.generation,
          versionName: this.versionName,
          state: "failed",
        }),
      },
      async (executionContext) => {
        await executionContext.mutationCtx.db.patch(task._id, {
          state: "failed",
        });
        await insertTaskStateLog(executionContext, {
          workflowId,
          name: this.name,
          versionName: this.versionName,
          generation: task.generation,
          state: "failed",
        });

        await this.afterFail(executionContext, workflowId, task);
      }
    );
  }

  abstract afterFail(
    executionContext: ExecutionContext,
    workflowId: Id<"tasquencerWorkflows">,
    task: Doc<"tasquencerTasks">
  ): Promise<void>;

  async cancel(
    executionContext: ExecutionContext,
    workflowId: Id<"tasquencerWorkflows">,
    task: Doc<"tasquencerTasks">
  ) {
    if (!validTaskTransitions[task.state as TaskState].has("canceled")) {
      throw new InvalidStateTransitionError(
        "Task",
        String(task._id),
        task.state,
        ["enabled", "started"]
      );
    }

    return await executionContext.withSpan(
      {
        operation: "Task.cancel",
        operationType: "task",
        resourceType: "task",
        resourceId: `${workflowId}:${this.name}`,
        resourceName: this.name,
        attributes: createTaskAttributes({
          workflowId,
          generation: task.generation,
          versionName: this.versionName,
          state: "canceled",
        }),
      },
      async (executionContext) => {
        await executionContext.mutationCtx.db.patch(task._id, {
          state: "canceled",
        });
        await insertTaskStateLog(executionContext, {
          workflowId,
          name: this.name,
          versionName: this.versionName,
          generation: task.generation,
          state: "canceled",
        });

        await this.afterCancel(executionContext, workflowId, task);
      }
    );
  }

  abstract afterCancel(
    executionContext: ExecutionContext,
    workflowId: Id<"tasquencerWorkflows">,
    task: Doc<"tasquencerTasks">
  ): Promise<void>;

  async disable(
    executionContext: ExecutionContext,
    workflowId: Id<"tasquencerWorkflows">,
    task: Doc<"tasquencerTasks">
  ) {
    if (!validTaskTransitions[task.state].has("disabled")) {
      throw new InvalidStateTransitionError(
        "Task",
        String(task._id),
        task.state,
        ["enabled"]
      );
    }

    return await executionContext.withSpan(
      {
        operation: "Task.disable",
        operationType: "task",
        resourceType: "task",
        resourceId: `${workflowId}:${this.name}`,
        resourceName: this.name,
        attributes: createTaskAttributes({
          workflowId,
          generation: task.generation,
          versionName: this.versionName,
          state: "disabled",
        }),
      },
      async (executionContext) => {
        await executionContext.mutationCtx.db.patch(task._id, {
          state: "disabled",
        });
        await insertTaskStateLog(executionContext, {
          workflowId,
          name: this.name,
          versionName: this.versionName,
          generation: task.generation,
          state: "disabled",
        });

        await this.afterDisable(executionContext, workflowId, task);
      }
    );
  }

  abstract afterDisable(
    executionContext: ExecutionContext,
    workflowId: Id<"tasquencerWorkflows">,
    task: Doc<"tasquencerTasks">
  ): Promise<void>;

  async isJoinSatisfied(
    executionContext: ExecutionContext,
    workflowId: Id<"tasquencerWorkflows">
  ) {
    switch (this.joinType) {
      case "and":
        return await this.isAndJoinSatisfied(executionContext, workflowId);
      case "xor":
        return await this.isXorJoinSatisfied(executionContext, workflowId);
      case "or":
        return await this.isOrJoinSatisfied(executionContext, workflowId);
      default:
        const joinType: never = this.joinType;
        throw new TaskInvalidJoinTypeError(joinType);
    }
  }

  async isXorJoinSatisfied(
    executionContext: ExecutionContext,
    workflowId: Id<"tasquencerWorkflows">
  ) {
    const markings = await Promise.all(
      Array.from(this.incomingFlows).map((flow) =>
        flow.prevElement.getMarking(executionContext, workflowId)
      )
    );
    return markings.some((marking) => marking > 0);
  }
  async isOrJoinSatisfied(
    executionContext: ExecutionContext,
    workflowId: Id<"tasquencerWorkflows">
  ) {
    return await this.parentWorkflow.isOrJoinSatisfied(
      executionContext,
      workflowId,
      this
    );
  }
  async isAndJoinSatisfied(
    executionContext: ExecutionContext,
    workflowId: Id<"tasquencerWorkflows">
  ) {
    const markings = await Promise.all(
      Array.from(this.incomingFlows).map((flow) =>
        flow.prevElement.getMarking(executionContext, workflowId)
      )
    );
    return markings.every((marking) => marking > 0);
  }

  async produceTokensInOutgoingFlows(
    executionContext: ExecutionContext,
    workflowId: Id<"tasquencerWorkflows">,
    task: Doc<"tasquencerTasks">
  ) {
    switch (this.splitType) {
      case "xor":
        return await this.produceTokensInXorOutgoingFlows(
          executionContext,
          workflowId,
          task
        );
      case "or":
        return await this.produceTokensInOrOutgoingFlows(
          executionContext,
          workflowId,
          task
        );
      default:
        return await this.produceTokensInAndOutgoingFlows(
          executionContext,
          workflowId,
          task
        );
    }
  }

  abstract getRouterPayload(
    executionContext: ExecutionContext,
    task: Doc<"tasquencerTasks">,
    workflowId: Id<"tasquencerWorkflows">
  ): Promise<object>;

  private async tryFastForwardEnable(
    executionContext: ExecutionContext,
    workflowId: Id<"tasquencerWorkflows">,
    task: Doc<"tasquencerTasks">
  ) {
    if (task.executionMode !== "fastForward") {
      return false;
    }

    const result = await this.onFastForward(executionContext, workflowId, task);

    if (result !== "fastForward") {
      return false;
    }

    await this.runFastForwardLifecycle(executionContext, workflowId, task);

    return true;
  }

  private async runFastForwardLifecycle(
    executionContext: ExecutionContext,
    workflowId: Id<"tasquencerWorkflows">,
    task: Doc<"tasquencerTasks">
  ) {
    await this.ensureStartedFromFastForward(
      executionContext,
      workflowId,
      task.generation,
      { autoComplete: false }
    );

    const latestTask = await this.getTaskByName(executionContext, workflowId);

    await this.completeSilently(executionContext, workflowId, latestTask);
  }

  async produceTokensInXorOutgoingFlows(
    executionContext: ExecutionContext,
    workflowId: Id<"tasquencerWorkflows">,
    task: Doc<"tasquencerTasks">
  ) {
    const router = this.getRouter();
    const routerPayload = await this.getRouterPayload(
      executionContext,
      task,
      workflowId
    );
    const route = await router({
      mutationCtx: executionContext.mutationCtx,
      parent: { workflow: { id: workflowId, name: this.parentWorkflow.name } },
      task: { name: this.name, generation: task.generation, path: this.path },
      route: {
        toCondition: (condition: string) => new ConditionRouting(condition),
        toTask: (task: string) => new TaskRouting(task),
      },
      ...routerPayload,
    });

    if (!(route instanceof TaskRouting || route instanceof ConditionRouting)) {
      throw new TaskInvalidRouteError(this.name, typeof route);
    }

    for (const flow of this.outgoingFlows) {
      if (route.getConditionName(this) === flow.nextElement.name) {
        await flow.nextElement.incrementMarking(executionContext, workflowId);
      }
    }
  }

  async produceTokensInOrOutgoingFlows(
    executionContext: ExecutionContext,
    workflowId: Id<"tasquencerWorkflows">,
    task: Doc<"tasquencerTasks">
  ) {
    const router = this.getRouter();
    const routerPayload = await this.getRouterPayload(
      executionContext,
      task,
      workflowId
    );
    const route = await router({
      mutationCtx: executionContext.mutationCtx,
      parent: {
        workflow: { id: workflowId, name: this.parentWorkflow.name },
      },
      task: { name: this.name, generation: task.generation, path: this.path },
      route: {
        toCondition: (condition: string) => new ConditionRouting(condition),
        toTask: (task: string) => new TaskRouting(task),
      },
      ...routerPayload,
    });

    if (
      !(
        Array.isArray(route) &&
        route.every(
          (r) => r instanceof TaskRouting || r instanceof ConditionRouting
        )
      )
    ) {
      throw new TaskInvalidRouteError(this.name, typeof route);
    }

    const conditionNames = new Set(route.map((r) => r.getConditionName(this)));
    const updates = Array.from(this.outgoingFlows)
      .filter((flow) => conditionNames.has(flow.nextElement.name))
      .map((flow) =>
        flow.nextElement.incrementMarking(executionContext, workflowId)
      );

    return await Promise.all(updates);
  }

  async produceTokensInAndOutgoingFlows(
    executionContext: ExecutionContext,
    workflowId: Id<"tasquencerWorkflows">,
    _task: Doc<"tasquencerTasks">
  ) {
    return await Promise.all(
      Array.from(this.outgoingFlows).map((flow) =>
        flow.nextElement.incrementMarking(executionContext, workflowId)
      )
    );
  }

  cancelCancellationRegion(
    executionContext: ExecutionContext,
    workflowId: Id<"tasquencerWorkflows">
  ) {
    const tasksToCancel = Object.values(this.cancellationRegion.tasks);
    const conditionsToCancel = Object.values(
      this.cancellationRegion.conditions
    );
    return Promise.all([
      ...tasksToCancel.map(async (taskElement) => {
        const task = await taskElement.getTaskByName(
          executionContext,
          workflowId
        );
        // Only cancel tasks that can be canceled (enabled or started)
        if (validTaskTransitions[task.state as TaskState].has("canceled")) {
          return taskElement.cancel(executionContext, workflowId, task);
        }
      }),
      ...conditionsToCancel.map((conditionElement) =>
        conditionElement.cancel(executionContext, workflowId)
      ),
    ]);
  }

  getStatsShardCount() {
    return this.statsShardCount;
  }

  protected async getMigration(
    executionContext: ExecutionContext,
    workflowId: Id<"tasquencerWorkflows">
  ) {
    const workflow = await executionContext.mutationCtx.db.get(workflowId);
    assertWorkflowExists(workflow, workflowId);

    const rootWorkflowId = getWorkflowRootWorkflowId(workflow);
    const migration = await executionContext.mutationCtx.db
      .query("tasquencerMigration")
      .withIndex("by_toWorkflowId", (q) => q.eq("toWorkflowId", rootWorkflowId))
      .first();
    assertWorkflowMigrationExists(migration, rootWorkflowId);

    return migration;
  }
}
