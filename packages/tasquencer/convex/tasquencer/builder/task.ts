import { Task } from "../elements/task";
import { Workflow } from "../elements/workflow";
import {
  type AnyWorkItemBuilder,
  type GetWorkItemBuilderActions,
} from "./workItem";
import { type MutationCtx } from "../../_generated/server";
import {
  type TaskJoinType,
  type TaskSplitType,
  type WorkItemState,
  type RegisterScheduled,
  type ShouldBeOptional,
  type PolicyResult,
} from "../types";
import { type Id } from "../../_generated/dataModel";
import { type GetSchemaForWorkItemAction } from "./workItem/actions";
import { DEFAULT_STATS_SHARD_COUNT } from "../util/statsShards";
import type { AnyMigration } from "../versionManager/migration";
import type { WorkflowInfo, SharedActivityTaskContext } from "./types";
import type { GenericMutationCtx } from "convex/server";

export type TaskSharedContext = SharedActivityTaskContext;

type TaskWorkItemInitializeFn<
  TWorkItemBuilder extends AnyWorkItemBuilder,
  TWorkItemPayload = GetSchemaForWorkItemAction<
    GetWorkItemBuilderActions<TWorkItemBuilder>,
    "initialize"
  >,
> = {
  initialize: ShouldBeOptional<TWorkItemPayload> extends true
    ? (payload?: TWorkItemPayload) => Promise<Id<"tasquencerWorkItems">>
    : (payload: TWorkItemPayload) => Promise<Id<"tasquencerWorkItems">>;
};

type TaskWorkItemQueriesContext = {
  getAllWorkItemIds: () => Promise<Id<"tasquencerWorkItems">[]>;
  path: string[];
};

export type TaskWorkItemContext<
  TWorkItemBuilder extends AnyWorkItemBuilder,
  TWorkItemPayload = GetSchemaForWorkItemAction<
    GetWorkItemBuilderActions<TWorkItemBuilder>,
    "initialize"
  >,
> = TaskWorkItemInitializeFn<TWorkItemBuilder, TWorkItemPayload> &
  TaskWorkItemQueriesContext;

export type TaskOnDisabledContext = TaskSharedContext;
export type TaskOnDisabledCallback = (
  context: TaskOnDisabledContext & { workItem: TaskWorkItemQueriesContext }
) => Promise<any>;

export type TaskOnEnabledContext<TWorkItemBuilder extends AnyWorkItemBuilder> =
  TaskSharedContext & {
    workItem: TaskWorkItemContext<TWorkItemBuilder>;
    registerScheduled: RegisterScheduled;
  };
export type TaskOnEnabledCallback<TWorkItemBuilder extends AnyWorkItemBuilder> =
  (context: TaskOnEnabledContext<TWorkItemBuilder>) => Promise<any>;

export type TaskOnStartedContext<TWorkItemBuilder extends AnyWorkItemBuilder> =
  TaskSharedContext & {
    workItem: TaskWorkItemContext<TWorkItemBuilder>;
    registerScheduled: RegisterScheduled;
  };
export type TaskOnStartedCallback<TWorkItemBuilder extends AnyWorkItemBuilder> =
  (context: TaskOnStartedContext<TWorkItemBuilder>) => Promise<any>;

export type TaskOnCompletedContext = TaskSharedContext & {
  workItem: TaskWorkItemQueriesContext;
};
export type TaskOnCompletedCallback = (
  context: TaskOnCompletedContext
) => Promise<any>;
export type TaskOnFailedContext = TaskSharedContext & {
  workItem: TaskWorkItemQueriesContext;
};
export type TaskOnFailedCallback = (
  context: TaskOnFailedContext
) => Promise<any>;

export type TaskOnCanceledContext = TaskSharedContext & {
  workItem: TaskWorkItemQueriesContext;
};
export type TaskOnCanceledCallback = (
  context: TaskOnCanceledContext
) => Promise<any>;

export type TaskOnWorkItemStateChangedContext<
  TWorkItemBuilder extends AnyWorkItemBuilder,
> = TaskSharedContext & {
  workItem: TaskWorkItemContext<TWorkItemBuilder> & {
    prevState: WorkItemState;
    nextState: WorkItemState;
    id: Id<"tasquencerWorkItems">;
  };
  registerScheduled: RegisterScheduled;
};
export type TaskOnWorkItemStateChangedCallback<
  TWorkItemBuilder extends AnyWorkItemBuilder,
> = (
  context: TaskOnWorkItemStateChangedContext<TWorkItemBuilder>
) => Promise<any>;

export type TaskActivities<TWorkItemBuilder extends AnyWorkItemBuilder> = {
  onDisabled: TaskOnDisabledCallback;
  onEnabled: TaskOnEnabledCallback<TWorkItemBuilder>;
  onStarted: TaskOnStartedCallback<TWorkItemBuilder>;
  onCompleted: TaskOnCompletedCallback;
  onFailed: TaskOnFailedCallback;
  onCanceled: TaskOnCanceledCallback;
  onWorkItemStateChanged: TaskOnWorkItemStateChangedCallback<TWorkItemBuilder>;
};

export type AnyTaskActivities = TaskActivities<AnyWorkItemBuilder>;

export type AnyTaskBuilder = TaskBuilder<any, any, any, any>;

export type GetTaskSplitType<TTaskBuilder> =
  TTaskBuilder extends TaskBuilder<any, any, infer TSplitType, any>
    ? TSplitType
    : never;

export type TaskStateTransitionPolicy = (props: {
  mutationCtx: MutationCtx;
  parent: {
    workflow: WorkflowInfo;
  };
  task: {
    name: string;
    generation: number;
    path: string[];
    getStats: () => Promise<{
      total: number;
      initialized: number;
      started: number;
      completed: number;
      failed: number;
      canceled: number;
    }>;
  };
  workItem: TaskWorkItemQueriesContext;
  transition: {
    prevState: WorkItemState;
    nextState: WorkItemState;
  };
}) => Promise<PolicyResult>;

export type TaskPolicy = TaskStateTransitionPolicy;

export type GetTaskBuilderWorkItemBuilder<TTaskBuilder> =
  TTaskBuilder extends TaskBuilder<any, infer TWorkItemBuilder, any, any>
    ? TWorkItemBuilder
    : never;

/**
 * Fluent builder for configuring workflow tasks.
 *
 * Each task builder owns a work item builder, lifecycle activities, split/join semantics,
 * and a state transition policy. The resulting task is compiled into the runtime
 * {@link Task} element when the workflow is built.
 *
 * @typeParam TMutationCtx - Mutation context.
 * @typeParam TWorkItemBuilder - Builder used to create work items for the task.
 * @typeParam TSplitType - Split semantics (AND/XOR/OR).
 * @typeParam TJoinType - Join semantics (AND/XOR/OR).
 */
export class TaskBuilder<
  TMutationCtx extends GenericMutationCtx<any>,
  TWorkItemBuilder extends AnyWorkItemBuilder,
  TSplitType extends TaskSplitType,
  TJoinType extends TaskJoinType,
> {
  /**
   * Create a task builder around the provided work item builder using default semantics.
   *
   * @param workItemBuilder - Work item definition associated with the task.
   */
  static make<
    TMutationCtx extends GenericMutationCtx<any>,
    TWorkItemBuilder extends AnyWorkItemBuilder,
  >(workItemBuilder: TWorkItemBuilder) {
    return new TaskBuilder<TMutationCtx, TWorkItemBuilder, "and", "and">(
      workItemBuilder,
      {
        onDisabled: async () => {},
        onEnabled: async () => {},
        onStarted: async () => {},
        onCompleted: async () => {},
        onFailed: async () => {},
        onCanceled: async () => {},
        onWorkItemStateChanged: async () => {},
      },
      async ({ task: { getStats }, transition }) => {
        const { nextState } = transition;
        const stats = await getStats();

        // Check if all work items are finalized (in a final state)
        const allFinalized =
          stats.completed + stats.failed + stats.canceled === stats.total;

        if (nextState === "completed") {
          // Complete task if all work items are finalized
          return allFinalized ? "complete" : "continue";
        }

        if (nextState === "failed") {
          // Fail immediately on first work item failure (default teardown behavior)
          return "fail";
        }

        if (nextState === "canceled") {
          // When a work item is canceled, check if all work items are finalized
          return allFinalized ? "complete" : "continue";
        }

        return "continue";
      },
      "and",
      "and",
      DEFAULT_STATS_SHARD_COUNT,
      undefined
    );
  }
  private constructor(
    private readonly workItemBuilder: TWorkItemBuilder,
    private readonly activities: TaskActivities<TWorkItemBuilder>,
    private readonly policy: TaskPolicy,
    readonly splitType: TSplitType,
    readonly joinType: TJoinType,
    private readonly statsShardCount: number,
    readonly description: string | undefined
  ) {}

  /**
   * Override task lifecycle activities.
   *
   * @param activities - Partial activity set to merge with existing callbacks.
   */
  withActivities(activities: Partial<TaskActivities<TWorkItemBuilder>>) {
    return new TaskBuilder<
      TMutationCtx,
      TWorkItemBuilder,
      TSplitType,
      TJoinType
    >(
      this.workItemBuilder,
      { ...this.activities, ...activities },
      this.policy,
      this.splitType,
      this.joinType,
      this.statsShardCount,
      this.description
    );
  }

  /**
   * Override the task state transition policy.
   *
   * @param policy - Async policy invoked on work item transitions.
   */
  withPolicy(policy: TaskPolicy) {
    return new TaskBuilder<
      TMutationCtx,
      TWorkItemBuilder,
      TSplitType,
      TJoinType
    >(
      this.workItemBuilder,
      this.activities,
      policy,
      this.splitType,
      this.joinType,
      this.statsShardCount,
      this.description
    );
  }

  /**
   * Change the task's split semantics (outgoing routing behaviour).
   *
   * @param splitType - Desired split type (`and`, `xor`, or `or`).
   */
  withSplitType<TNewSplitType extends TaskSplitType>(splitType: TNewSplitType) {
    return new TaskBuilder<
      TMutationCtx,
      TWorkItemBuilder,
      TNewSplitType,
      TJoinType
    >(
      this.workItemBuilder,
      this.activities,
      this.policy,
      splitType,
      this.joinType,
      this.statsShardCount,
      this.description
    );
  }
  /**
   * Change the task's join semantics (incoming token aggregation).
   *
   * @param joinType - Desired join type (`and`, `xor`, or `or`).
   */
  withJoinType<TNewJoinType extends TaskJoinType>(joinType: TNewJoinType) {
    return new TaskBuilder<
      TMutationCtx,
      TWorkItemBuilder,
      TSplitType,
      TNewJoinType
    >(
      this.workItemBuilder,
      this.activities,
      this.policy,
      this.splitType,
      joinType,
      this.statsShardCount,
      this.description
    );
  }

  /**
   * Configure the number of stats shards maintained for this task.
   *
   * Increase the shard count when you expect many concurrent work item transitions and want to
   * minimize contention on the aggregated counters. The default is {@link DEFAULT_STATS_SHARD_COUNT}.
   *
   * @param count - Number of shards to create per task generation.
   */
  withStatsShards(count: number) {
    return new TaskBuilder<
      TMutationCtx,
      TWorkItemBuilder,
      TSplitType,
      TJoinType
    >(
      this.workItemBuilder,
      this.activities,
      this.policy,
      this.splitType,
      this.joinType,
      count,
      this.description
    );
  }

  /**
   * Attach documentation describing the task's purpose.
   */
  withDescription(description: string) {
    return new TaskBuilder<
      TMutationCtx,
      TWorkItemBuilder,
      TSplitType,
      TJoinType
    >(
      this.workItemBuilder,
      this.activities,
      this.policy,
      this.splitType,
      this.joinType,
      this.statsShardCount,
      description
    );
  }

  getWorkItemBuilder() {
    return this.workItemBuilder;
  }

  /**
   * Compile the builder into a runtime {@link Task} and attach its work item.
   *
   * @param workflow - Parent workflow instance.
   * @param name - Task identifier.
   */
  build(
    versionName: string,
    _props: {
      isVersionDeprecated: boolean;
      migration?: undefined | AnyMigration;
    },
    workflow: Workflow,
    name: string
  ) {
    const {
      workItemBuilder,
      activities,
      splitType,
      joinType,
      policy,
      statsShardCount,
    } = this;
    const task = new Task(
      name,
      versionName,
      [...workflow.path, name],
      workflow,
      activities as any,
      policy,
      {
        splitType,
        joinType,
        statsShardCount,
      }
    );

    const workItem = workItemBuilder.build(versionName, task);
    task.setWorkItem(workItem);

    return task;
  }
}

export function makeTaskBuilder<
  TMutationCtx extends GenericMutationCtx<any>,
>() {
  return function <TWorkItemBuilder extends AnyWorkItemBuilder>(
    workItemBuilder: TWorkItemBuilder
  ) {
    return TaskBuilder.make<TMutationCtx, TWorkItemBuilder>(workItemBuilder);
  };
}
