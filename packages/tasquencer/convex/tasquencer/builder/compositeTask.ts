import { CompositeTask } from "../elements/compositeTask";
import { Workflow } from "../elements/workflow";
import {
  type AnyWorkflowBuilder,
  type GetWorkflowBuilderActions,
} from "./workflow";
import { type MutationCtx } from "../../_generated/server";
import {
  type TaskJoinType,
  type TaskSplitType,
  type WorkflowState,
  type RegisterScheduled,
  type ShouldBeOptional,
  type PolicyResult,
} from "../types";
import { type Id } from "../../_generated/dataModel";
import { type GetTypeForWorkflowAction } from "./workflow/actions";
import { type Get } from "type-fest";
import { DEFAULT_STATS_SHARD_COUNT } from "../util/statsShards";
import type { AnyMigration } from "../versionManager/migration";
import type { WorkflowInfo, SharedActivityTaskContext } from "./types";
import type { GenericMutationCtx } from "convex/server";

export type CompositeTaskSharedContext = SharedActivityTaskContext;

type CompositeTaskWorkflowInitializeFn<
  TWorkflowBuilder extends AnyWorkflowBuilder,
  TWorkflowPayload = GetTypeForWorkflowAction<
    Get<GetWorkflowBuilderActions<TWorkflowBuilder>, "actions">,
    "initialize"
  >,
> = {
  initialize: ShouldBeOptional<TWorkflowPayload> extends true
    ? (payload?: unknown) => Promise<Id<"tasquencerWorkflows">>
    : (payload: TWorkflowPayload) => Promise<Id<"tasquencerWorkflows">>;
};

type CompositeTaskWorkflowQueriesContext = {
  getAllWorkflowIds: () => Promise<Id<"tasquencerWorkflows">[]>;
  path: string[];
  name: string;
};

export type CompositeTaskWorkflowContext<
  TWorkflowBuilder extends AnyWorkflowBuilder,
  TWorkflowPayload = GetTypeForWorkflowAction<
    Get<GetWorkflowBuilderActions<TWorkflowBuilder>, "actions">,
    "initialize"
  >,
> = CompositeTaskWorkflowInitializeFn<TWorkflowBuilder, TWorkflowPayload> &
  CompositeTaskWorkflowQueriesContext;

export type CompositeTaskOnDisabledContext = CompositeTaskSharedContext;
export type CompositeTaskOnDisabledCallback = (
  context: CompositeTaskOnDisabledContext & {
    workflow: CompositeTaskWorkflowQueriesContext;
  }
) => Promise<any>;

export type CompositeTaskOnEnabledContext<
  TWorkflowBuilder extends AnyWorkflowBuilder,
> = CompositeTaskSharedContext & {
  workflow: CompositeTaskWorkflowContext<TWorkflowBuilder>;
  registerScheduled: RegisterScheduled;
};
export type CompositeTaskOnEnabledCallback<
  TWorkflowBuilder extends AnyWorkflowBuilder,
> = (context: CompositeTaskOnEnabledContext<TWorkflowBuilder>) => Promise<any>;

export type CompositeTaskOnStartedContext<
  TWorkflowBuilder extends AnyWorkflowBuilder,
> = CompositeTaskSharedContext & {
  workflow: CompositeTaskWorkflowContext<TWorkflowBuilder>;
  registerScheduled: RegisterScheduled;
};
export type CompositeTaskOnStartedCallback<
  TWorkflowBuilder extends AnyWorkflowBuilder,
> = (context: CompositeTaskOnStartedContext<TWorkflowBuilder>) => Promise<any>;

export type CompositeTaskOnCompletedContext = CompositeTaskSharedContext & {
  workflow: CompositeTaskWorkflowQueriesContext;
};
export type CompositeTaskOnCompletedCallback = (
  context: CompositeTaskOnCompletedContext
) => Promise<any>;
export type CompositeTaskOnFailedContext = CompositeTaskSharedContext & {
  workflow: CompositeTaskWorkflowQueriesContext;
};
export type CompositeTaskOnFailedCallback = (
  context: CompositeTaskOnFailedContext
) => Promise<any>;

export type CompositeTaskOnCanceledContext = CompositeTaskSharedContext & {
  workflow: CompositeTaskWorkflowQueriesContext;
};
export type CompositeTaskOnCanceledCallback = (
  context: CompositeTaskOnCanceledContext
) => Promise<any>;

export type CompositeTaskOnWorkflowStateChangedContext<
  TWorkflowBuilder extends AnyWorkflowBuilder,
> = CompositeTaskSharedContext & {
  workflow: CompositeTaskWorkflowContext<TWorkflowBuilder> & {
    prevState: WorkflowState;
    nextState: WorkflowState;
  } & {
    id: Id<"tasquencerWorkflows">;
  };
  registerScheduled: RegisterScheduled;
};
export type CompositeTaskOnWorkflowStateChangedCallback<
  TWorkflowBuilder extends AnyWorkflowBuilder,
> = (
  context: CompositeTaskOnWorkflowStateChangedContext<TWorkflowBuilder>
) => Promise<any>;

export type CompositeTaskActivities<
  TWorkflowBuilder extends AnyWorkflowBuilder,
> = {
  onDisabled: CompositeTaskOnDisabledCallback;
  onEnabled: CompositeTaskOnEnabledCallback<TWorkflowBuilder>;
  onStarted: CompositeTaskOnStartedCallback<TWorkflowBuilder>;
  onCompleted: CompositeTaskOnCompletedCallback;
  onFailed: CompositeTaskOnFailedCallback;
  onCanceled: CompositeTaskOnCanceledCallback;
  onWorkflowStateChanged: CompositeTaskOnWorkflowStateChangedCallback<TWorkflowBuilder>;
};

export type AnyCompositeTaskActivities =
  CompositeTaskActivities<AnyWorkflowBuilder>;

export type GetCompositeTaskSplitType<TTaskBuilder> =
  TTaskBuilder extends CompositeTaskBuilder<any, any, infer TSplitType, any>
    ? TSplitType
    : never;

export type AnyCompositeTaskBuilder = CompositeTaskBuilder<any, any, any, any>;

export type CompositeTaskStateTransitionPolicy = (props: {
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
  workflow: CompositeTaskWorkflowQueriesContext;
  transition: {
    prevState: WorkflowState;
    nextState: WorkflowState;
  };
}) => Promise<PolicyResult>;

export type CompositeTaskPolicy = CompositeTaskStateTransitionPolicy;

export type GetCompositeTaskBuilderWorkflowBuilder<TTaskBuilder> =
  TTaskBuilder extends CompositeTaskBuilder<
    any,
    infer TWorkflowBuilder,
    any,
    any
  >
    ? TWorkflowBuilder
    : never;

/**
 * Fluent builder for composite tasks that host nested workflows.
 *
 * Manages the child workflow builder, lifecycle activities, and state policies that control
 * how the parent task reacts to sub-workflow progress.
 *
 * @typeParam TWorkflowBuilder - Builder used to create the nested workflow.
 * @typeParam TSplitType - Split semantics for the composite task.
 * @typeParam TJoinType - Join semantics for the composite task.
 */
export class CompositeTaskBuilder<
  TMutationCtx extends GenericMutationCtx<any>,
  TWorkflowBuilder extends AnyWorkflowBuilder,
  TSplitType extends TaskSplitType,
  TJoinType extends TaskJoinType,
> {
  /**
   * Create a composite task builder wrapping the provided workflow builder.
   *
   * @param workflowBuilder - Child workflow builder.
   */
  static make<
    TMutationCtx extends GenericMutationCtx<any>,
    TWorkflowBuilder extends AnyWorkflowBuilder,
  >(workflowBuilder: TWorkflowBuilder) {
    return new CompositeTaskBuilder<
      TMutationCtx,
      TWorkflowBuilder,
      "and",
      "and"
    >(
      workflowBuilder,
      {
        onDisabled: async () => {},
        onEnabled: async () => {},
        onStarted: async () => {},
        onCompleted: async () => {},
        onFailed: async () => {},
        onCanceled: async () => {},
        onWorkflowStateChanged: async () => {},
      },
      async ({ task: { getStats }, transition }) => {
        const { nextState } = transition;
        const stats = await getStats();

        // Check if all workflows are finalized (in a final state)
        const allFinalized =
          stats.total > 0 &&
          stats.completed + stats.failed + stats.canceled === stats.total;

        if (nextState === "completed") {
          // Complete task if all workflows are finalized
          return allFinalized ? "complete" : "continue";
        }

        if (nextState === "failed") {
          // Fail immediately on first sub-workflow failure (default teardown behavior)
          return "fail";
        }

        if (nextState === "canceled") {
          // When a child workflow is canceled, check if all workflows are finalized
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
    readonly workflowBuilder: TWorkflowBuilder,
    private readonly activities: CompositeTaskActivities<TWorkflowBuilder>,
    private readonly policy: CompositeTaskPolicy,
    readonly splitType: TSplitType,
    readonly joinType: TJoinType,
    private readonly statsShardCount: number,
    readonly description: string | undefined
  ) {}

  /**
   * Override composite task lifecycle activities.
   *
   * @param activities - Partial activity set to merge with existing callbacks.
   */
  withActivities(
    activities: Partial<CompositeTaskActivities<TWorkflowBuilder>>
  ) {
    return new CompositeTaskBuilder<
      TMutationCtx,
      TWorkflowBuilder,
      TSplitType,
      TJoinType
    >(
      this.workflowBuilder,
      { ...this.activities, ...activities },
      this.policy,
      this.splitType,
      this.joinType,
      this.statsShardCount,
      this.description
    );
  }

  /**
   * Override the composite task state transition policy.
   *
   * @param policy - Async policy invoked on sub-workflow transitions.
   */
  withPolicy(policy: CompositeTaskPolicy) {
    return new CompositeTaskBuilder<
      TMutationCtx,
      TWorkflowBuilder,
      TSplitType,
      TJoinType
    >(
      this.workflowBuilder,
      this.activities,
      policy,
      this.splitType,
      this.joinType,
      this.statsShardCount,
      this.description
    );
  }

  /**
   * Change the composite task's split semantics.
   *
   * @param splitType - Desired split type (`and`, `xor`, or `or`).
   */
  withSplitType<TNewSplitType extends TaskSplitType>(splitType: TNewSplitType) {
    return new CompositeTaskBuilder<
      TMutationCtx,
      TWorkflowBuilder,
      TNewSplitType,
      TJoinType
    >(
      this.workflowBuilder,
      this.activities,
      this.policy,
      splitType,
      this.joinType,
      this.statsShardCount,
      this.description
    );
  }
  /**
   * Change the composite task's join semantics.
   *
   * @param joinType - Desired join type (`and`, `xor`, or `or`).
   */
  withJoinType<TNewJoinType extends TaskJoinType>(joinType: TNewJoinType) {
    return new CompositeTaskBuilder<
      TMutationCtx,
      TWorkflowBuilder,
      TSplitType,
      TNewJoinType
    >(
      this.workflowBuilder,
      this.activities,
      this.policy,
      this.splitType,
      joinType,
      this.statsShardCount,
      this.description
    );
  }

  /**
   * Configure stats shard count for high fan-out nested workflows.
   *
   * @param count - Number of shards to create per composite task generation.
   */
  withStatsShards(count: number) {
    return new CompositeTaskBuilder<
      TMutationCtx,
      TWorkflowBuilder,
      TSplitType,
      TJoinType
    >(
      this.workflowBuilder,
      this.activities,
      this.policy,
      this.splitType,
      this.joinType,
      count,
      this.description
    );
  }

  /**
   * Attach documentation to the composite task wrapper.
   */
  withDescription(description: string) {
    return new CompositeTaskBuilder<
      TMutationCtx,
      TWorkflowBuilder,
      TSplitType,
      TJoinType
    >(
      this.workflowBuilder,
      this.activities,
      this.policy,
      this.splitType,
      this.joinType,
      this.statsShardCount,
      description
    );
  }

  /**
   * Compile the builder into a runtime {@link CompositeTask} and attach the nested workflow.
   *
   * @param parentWorkflow - Workflow that owns the composite task.
   * @param name - Task identifier.
   */
  build(
    versionName: string,
    props: {
      isVersionDeprecated: boolean;
      migration?: undefined | AnyMigration;
    },
    parentWorkflow: Workflow,
    name: string
  ) {
    const { workflowBuilder, activities, statsShardCount } = this;
    const task = new CompositeTask(
      name,
      versionName,
      [...parentWorkflow.path, name],
      parentWorkflow,
      activities as any,
      this.policy,
      {
        splitType: this.splitType,
        joinType: this.joinType,
        statsShardCount,
      }
    );

    const workflow = workflowBuilder.build(versionName, props, task.path);
    task.setWorkflow(workflow);
    workflow.setParentCompositeTask(task);

    return task;
  }
}

export function makeCompositeTaskBuilder<
  TMutationCtx extends GenericMutationCtx<any>,
>() {
  return function <TWorkflowBuilder extends AnyWorkflowBuilder>(
    workflowBuilder: TWorkflowBuilder
  ) {
    return CompositeTaskBuilder.make<TMutationCtx, TWorkflowBuilder>(
      workflowBuilder
    );
  };
}
