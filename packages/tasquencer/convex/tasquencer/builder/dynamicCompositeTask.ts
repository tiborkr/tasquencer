import { DynamicCompositeTask } from "../elements/dynamicCompositeTask";
import { Workflow } from "../elements/workflow";
import {
  type GetWorkflowBuilderName,
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
import { type UnionToIntersection } from "type-fest";
import type { GenericMutationCtx } from "convex/server";

type WorfklowInitializeFn<TWorkflowPayload> =
  ShouldBeOptional<TWorkflowPayload> extends true
    ? (payload?: unknown) => Promise<Id<"tasquencerWorkflows">>
    : (payload: TWorkflowPayload) => Promise<Id<"tasquencerWorkflows">>;

type WorkflowBuilderUnionToInitializeFn<
  TWorkflowBuilder extends AnyWorkflowBuilder,
> = UnionToIntersection<
  TWorkflowBuilder extends TWorkflowBuilder
    ? {
        [K in GetWorkflowBuilderName<TWorkflowBuilder>]: WorfklowInitializeFn<
          GetTypeForWorkflowAction<
            Get<GetWorkflowBuilderActions<TWorkflowBuilder>, "actions">,
            "initialize"
          >
        >;
      }
    : never
>;

export type DynamicCompositeTaskSharedContext = SharedActivityTaskContext;

type DynamicCompositeTaskWorkflowInitializeFn<
  TWorkflowBuilder extends AnyWorkflowBuilder,
> = {
  initialize: WorkflowBuilderUnionToInitializeFn<TWorkflowBuilder>;
};

type DynamicCompositeTaskWorkflowQueriesContext<
  TWorkflowBuilder extends AnyWorkflowBuilder = AnyWorkflowBuilder,
> = {
  getAllWorkflowIds: () => Promise<Id<"tasquencerWorkflows">[]>;
  paths: UnionToIntersection<
    TWorkflowBuilder extends TWorkflowBuilder
      ? { [K in GetWorkflowBuilderName<TWorkflowBuilder>]: string[] }
      : never
  >;
  names: UnionToIntersection<
    TWorkflowBuilder extends TWorkflowBuilder
      ? {
          [K in GetWorkflowBuilderName<TWorkflowBuilder>]: GetWorkflowBuilderName<TWorkflowBuilder>;
        }
      : never
  >;
};

export type DynamicCompositeTaskWorkflowContext<
  TWorkflowBuilder extends AnyWorkflowBuilder,
> = DynamicCompositeTaskWorkflowInitializeFn<TWorkflowBuilder> &
  DynamicCompositeTaskWorkflowQueriesContext<TWorkflowBuilder>;

export type DynamicCompositeTaskOnDisabledContext<
  TWorkflowBuilder extends AnyWorkflowBuilder = AnyWorkflowBuilder,
> = DynamicCompositeTaskSharedContext & {
  workflow: DynamicCompositeTaskWorkflowQueriesContext<TWorkflowBuilder>;
};
export type DynamicCompositeTaskOnDisabledCallback<
  TWorkflowBuilder extends AnyWorkflowBuilder = AnyWorkflowBuilder,
> = (
  context: DynamicCompositeTaskOnDisabledContext<TWorkflowBuilder>
) => Promise<any>;

export type DynamicCompositeTaskOnEnabledContext<
  TWorkflowBuilder extends AnyWorkflowBuilder,
> = DynamicCompositeTaskSharedContext & {
  workflow: DynamicCompositeTaskWorkflowContext<TWorkflowBuilder>;
  registerScheduled: RegisterScheduled;
};
export type DynamicCompositeTaskOnEnabledCallback<
  TWorkflowBuilder extends AnyWorkflowBuilder,
> = (
  context: DynamicCompositeTaskOnEnabledContext<TWorkflowBuilder>
) => Promise<any>;

export type DynamicCompositeTaskOnStartedContext<
  TWorkflowBuilder extends AnyWorkflowBuilder,
> = DynamicCompositeTaskSharedContext & {
  workflow: DynamicCompositeTaskWorkflowContext<TWorkflowBuilder>;
  registerScheduled: RegisterScheduled;
};
export type DynamicCompositeTaskOnStartedCallback<
  TWorkflowBuilder extends AnyWorkflowBuilder,
> = (
  context: DynamicCompositeTaskOnStartedContext<TWorkflowBuilder>
) => Promise<any>;

export type DynamicCompositeTaskOnCompletedContext<
  TWorkflowBuilder extends AnyWorkflowBuilder = AnyWorkflowBuilder,
> = DynamicCompositeTaskSharedContext & {
  workflow: DynamicCompositeTaskWorkflowQueriesContext<TWorkflowBuilder>;
};
export type DynamicCompositeTaskOnCompletedCallback<
  TWorkflowBuilder extends AnyWorkflowBuilder = AnyWorkflowBuilder,
> = (
  context: DynamicCompositeTaskOnCompletedContext<TWorkflowBuilder>
) => Promise<any>;

export type DynamicCompositeTaskOnFailedContext<
  TWorkflowBuilder extends AnyWorkflowBuilder = AnyWorkflowBuilder,
> = DynamicCompositeTaskSharedContext & {
  workflow: DynamicCompositeTaskWorkflowQueriesContext<TWorkflowBuilder>;
};
export type DynamicCompositeTaskOnFailedCallback<
  TWorkflowBuilder extends AnyWorkflowBuilder = AnyWorkflowBuilder,
> = (
  context: DynamicCompositeTaskOnFailedContext<TWorkflowBuilder>
) => Promise<any>;

export type DynamicCompositeTaskOnCanceledContext<
  TWorkflowBuilder extends AnyWorkflowBuilder = AnyWorkflowBuilder,
> = DynamicCompositeTaskSharedContext & {
  workflow: DynamicCompositeTaskWorkflowQueriesContext<TWorkflowBuilder>;
};
export type DynamicCompositeTaskOnCanceledCallback<
  TWorkflowBuilder extends AnyWorkflowBuilder = AnyWorkflowBuilder,
> = (
  context: DynamicCompositeTaskOnCanceledContext<TWorkflowBuilder>
) => Promise<any>;

export type DynamicCompositeTaskOnWorkflowStateChangedContext<
  TWorkflowBuilder extends AnyWorkflowBuilder,
> = DynamicCompositeTaskSharedContext & {
  workflow: DynamicCompositeTaskWorkflowContext<TWorkflowBuilder> & {
    prevState: WorkflowState;
    nextState: WorkflowState;
  } & {
    id: Id<"tasquencerWorkflows">;
    name: string;
  };
  registerScheduled: RegisterScheduled;
};
export type DynamicCompositeTaskOnWorkflowStateChangedCallback<
  TWorkflowBuilder extends AnyWorkflowBuilder,
> = (
  context: DynamicCompositeTaskOnWorkflowStateChangedContext<TWorkflowBuilder>
) => Promise<any>;

export type DynamicCompositeTaskActivities<
  TWorkflowBuilder extends AnyWorkflowBuilder,
> = {
  onDisabled: DynamicCompositeTaskOnDisabledCallback<TWorkflowBuilder>;
  onEnabled: DynamicCompositeTaskOnEnabledCallback<TWorkflowBuilder>;
  onStarted: DynamicCompositeTaskOnStartedCallback<TWorkflowBuilder>;
  onCompleted: DynamicCompositeTaskOnCompletedCallback<TWorkflowBuilder>;
  onFailed: DynamicCompositeTaskOnFailedCallback<TWorkflowBuilder>;
  onCanceled: DynamicCompositeTaskOnCanceledCallback<TWorkflowBuilder>;
  onWorkflowStateChanged: DynamicCompositeTaskOnWorkflowStateChangedCallback<TWorkflowBuilder>;
};

export type AnyDynamicCompositeTaskActivities =
  DynamicCompositeTaskActivities<AnyWorkflowBuilder>;

export type GetDynamicCompositeTaskSplitType<TTaskBuilder> =
  TTaskBuilder extends DynamicCompositeTaskBuilder<
    any,
    any,
    infer TSplitType,
    any
  >
    ? TSplitType
    : never;

export type AnyDynamicCompositeTaskBuilder = DynamicCompositeTaskBuilder<
  any,
  any,
  any,
  any
>;

export type DynamicCompositeTaskStateTransitionPolicy = (props: {
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
  workflows: Array<{
    getAllWorkflowIds: () => Promise<Id<"tasquencerWorkflows">[]>;
    path: string[];
    name: string;
  }>;
  transition: {
    prevState: WorkflowState;
    nextState: WorkflowState;
  };
}) => Promise<PolicyResult>;

export type DynamicCompositeTaskPolicy =
  DynamicCompositeTaskStateTransitionPolicy;

export type GetDynamicCompositeTaskBuilderWorkflowBuilder<TTaskBuilder> =
  TTaskBuilder extends DynamicCompositeTaskBuilder<
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
export class DynamicCompositeTaskBuilder<
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
    TWorkflowBuilders extends readonly AnyWorkflowBuilder[],
  >(workflowBuilders: TWorkflowBuilders) {
    return new DynamicCompositeTaskBuilder<
      TMutationCtx,
      TWorkflowBuilders[number],
      "and",
      "and"
    >(
      [...workflowBuilders],
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
    readonly workflowBuilders: TWorkflowBuilder[],
    private readonly activities: DynamicCompositeTaskActivities<TWorkflowBuilder>,
    private readonly policy: DynamicCompositeTaskPolicy,
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
    activities: Partial<DynamicCompositeTaskActivities<TWorkflowBuilder>>
  ) {
    return new DynamicCompositeTaskBuilder<
      TMutationCtx,
      TWorkflowBuilder,
      TSplitType,
      TJoinType
    >(
      this.workflowBuilders,
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
  withPolicy(policy: DynamicCompositeTaskPolicy) {
    return new DynamicCompositeTaskBuilder<
      TMutationCtx,
      TWorkflowBuilder,
      TSplitType,
      TJoinType
    >(
      this.workflowBuilders,
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
    return new DynamicCompositeTaskBuilder<
      TMutationCtx,
      TWorkflowBuilder,
      TNewSplitType,
      TJoinType
    >(
      this.workflowBuilders,
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
    return new DynamicCompositeTaskBuilder<
      TMutationCtx,
      TWorkflowBuilder,
      TSplitType,
      TNewJoinType
    >(
      this.workflowBuilders,
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
    return new DynamicCompositeTaskBuilder<
      TMutationCtx,
      TWorkflowBuilder,
      TSplitType,
      TJoinType
    >(
      this.workflowBuilders,
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
    return new DynamicCompositeTaskBuilder<
      TMutationCtx,
      TWorkflowBuilder,
      TSplitType,
      TJoinType
    >(
      this.workflowBuilders,
      this.activities,
      this.policy,
      this.splitType,
      this.joinType,
      this.statsShardCount,
      description
    );
  }

  /**
   * Compile the builder into a runtime {@link DynamicCompositeTask} and attach the nested workflow.
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
    const { workflowBuilders, activities, statsShardCount } = this;
    const task = new DynamicCompositeTask(
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

    const workflows = new Map<string, Workflow>();
    for (const workflowBuilder of workflowBuilders) {
      const workflow = workflowBuilder.build(versionName, props, task.path);
      workflows.set(workflow.name, workflow);
      workflow.setParentDynamicCompositeTask(task);
    }

    task.setWorkflows(workflows);

    return task;
  }
}

export function makeDynamicCompositeTaskBuilder<
  TMutationCtx extends GenericMutationCtx<any>,
>() {
  return function <TWorkflowBuilder extends AnyWorkflowBuilder>(
    workflowBuilders: TWorkflowBuilder[]
  ) {
    return DynamicCompositeTaskBuilder.make<TMutationCtx, TWorkflowBuilder[]>(
      workflowBuilders
    );
  };
}
