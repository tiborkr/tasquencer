import { Workflow } from "../elements/workflow";
import { type TaskJoinType, type TaskSplitType } from "../types";
import { DummyTask } from "../elements/dummyTask";
import { type AnyMigration } from "../versionManager/migration";
import { type SharedActivityTaskContext } from "./types";
import type { GenericMutationCtx } from "convex/server";

export type DummyTaskContext = SharedActivityTaskContext;

export type DummyTaskCallback = (context: DummyTaskContext) => Promise<any>;

export type DummyTaskActivities = {
  onDisabled: DummyTaskCallback;
  onEnabled: DummyTaskCallback;
  onStarted: DummyTaskCallback;
  onCompleted: DummyTaskCallback;
  onFailed: DummyTaskCallback;
  onCanceled: DummyTaskCallback;
};

export type AnyDummyTaskBuilder = DummyTaskBuilder<any, any, any>;

export type GetDummyTaskSplitType<TTaskBuilder> =
  TTaskBuilder extends DummyTaskBuilder<any, infer TSplitType, any>
    ? TSplitType
    : never;

/**
 * Fluent builder for dummy tasks (routing nodes with no work items).
 *
 * Useful for explicit joins/splits or placeholders when modelling the workflow graph.
 *
 * @typeParam TSplitType - Split semantics (`and`, `xor`, `or`).
 * @typeParam TJoinType - Join semantics (`and`, `xor`, `or`).
 */
export class DummyTaskBuilder<
  TMutationCtx extends GenericMutationCtx<any>,
  TSplitType extends TaskSplitType,
  TJoinType extends TaskJoinType,
> {
  /**
   * Create a dummy task builder with default activities and semantics.
   */
  static make<TMutationCtx extends GenericMutationCtx<any>>() {
    return new DummyTaskBuilder<TMutationCtx, "and", "and">(
      {
        onDisabled: async () => {},
        onEnabled: async () => {},
        onStarted: async () => {},
        onCompleted: async () => {},
        onFailed: async () => {},
        onCanceled: async () => {},
      },

      "and",
      "and",
      undefined
    );
  }
  private constructor(
    private readonly activities: DummyTaskActivities,
    readonly splitType: TSplitType,
    readonly joinType: TJoinType,
    readonly description: string | undefined
  ) {}

  /**
   * Override dummy task lifecycle activities.
   *
   * @param activities - Partial activity set to merge with existing callbacks.
   */
  withActivities(activities: Partial<DummyTaskActivities>) {
    return new DummyTaskBuilder<TMutationCtx, TSplitType, TJoinType>(
      { ...this.activities, ...activities },
      this.splitType,
      this.joinType,
      this.description
    );
  }

  /**
   * Change the dummy task's split semantics.
   *
   * @param splitType - Desired split type (`and`, `xor`, or `or`).
   */
  withSplitType<TNewSplitType extends TaskSplitType>(splitType: TNewSplitType) {
    return new DummyTaskBuilder<TMutationCtx, TNewSplitType, TJoinType>(
      this.activities,
      splitType,
      this.joinType,
      this.description
    );
  }
  /**
   * Change the dummy task's join semantics.
   *
   * @param joinType - Desired join type (`and`, `xor`, or `or`).
   */
  withJoinType<TNewJoinType extends TaskJoinType>(joinType: TNewJoinType) {
    return new DummyTaskBuilder<TMutationCtx, TSplitType, TNewJoinType>(
      this.activities,
      this.splitType,
      joinType,
      this.description
    );
  }

  /**
   * Attach documentation describing what the dummy task coordinates.
   */
  withDescription(description: string) {
    return new DummyTaskBuilder<TMutationCtx, TSplitType, TJoinType>(
      this.activities,
      this.splitType,
      this.joinType,
      description
    );
  }

  /**
   * Compile the builder into a runtime {@link DummyTask}.
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
    const { activities, splitType, joinType } = this;
    const task = new DummyTask(
      name,
      versionName,
      [...workflow.path, name],
      workflow,
      activities as any,
      {
        splitType,
        joinType,
      }
    );

    return task;
  }
}

/**
 * Entry point for constructing a dummy task builder.
 */
export function makeDummyTaskBuilder<
  TMutationCtx extends GenericMutationCtx<any>,
>() {
  return function () {
    return DummyTaskBuilder.make<TMutationCtx>();
  };
}
