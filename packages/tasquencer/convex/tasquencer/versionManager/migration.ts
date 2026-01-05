import {
  type AnyWorkflowBuilder,
  type GetWorkflowActions,
  type GetWorkflowBuilderActionsRegistry,
  type GetWorkflowBuilderTaskToChildElement,
  type GetWorkItemActions,
  type TaskToChildElement,
} from '../builder'
import { type Id } from '../../_generated/dataModel'
import { type MutationCtx } from '../../_generated/server'
import {
  type RegisterScheduled,
  type ShouldBeOptional,
  type WorkflowState,
} from '../types'
import { type AuditCallbackInfo } from '../audit/integration'
import { type TaskInfo, type WorkflowInfo } from '../builder/types'
import { type UnionToIntersection } from 'type-fest'

export type TaskMigrationMode = 'continue' | 'fastForward'

export type CompositeTaskOnMigrate<TWorkflowPayload> = (props: {
  mutationCtx: MutationCtx
  isInternalMutation: boolean
  migratingFromWorkflow: WorkflowInfo
  parent: {
    workflow: WorkflowInfo
  }
  task: TaskInfo
  workflow: {
    initialize: ShouldBeOptional<TWorkflowPayload> extends true
      ? (payload?: unknown) => Promise<Id<'tasquencerWorkflows'>>
      : (payload: TWorkflowPayload) => Promise<Id<'tasquencerWorkflows'>>
  }
  registerScheduled: RegisterScheduled
  audit: AuditCallbackInfo
}) => Promise<TaskMigrationMode>

/**
 * Helper type to convert a union of workflow payloads into an object of initialize functions.
 * E.g., { name: "A"; payload?: P1 } | { name: "B"; payload: P2 } becomes
 * { A: (payload?: P1) => Promise<Id<'tasquencerWorkflows'>>; B: (payload: P2) => Promise<Id<'tasquencerWorkflows'>> }
 */
type DynamicWorkflowInitializeFunctions<
  TWorkflowPayload extends { name: string; payload?: unknown },
> = UnionToIntersection<
  TWorkflowPayload extends TWorkflowPayload
    ? {
        [K in TWorkflowPayload['name']]: ShouldBeOptional<
          TWorkflowPayload['payload']
        > extends true
          ? (payload?: unknown) => Promise<Id<'tasquencerWorkflows'>>
          : (
              payload: TWorkflowPayload['payload']
            ) => Promise<Id<'tasquencerWorkflows'>>
      }
    : never
>

/**
 * Migration callback type for dynamic composite tasks.
 *
 * Unlike regular composite tasks that have a single workflow type, dynamic composite tasks
 * can host multiple workflow types. The `workflow.initialize` property is an object with
 * a method for each possible workflow type.
 *
 * @example
 * ```typescript
 * type MyWorkflowPayloads =
 *   | { name: 'workflowA'; payload?: unknown }
 *   | { name: 'workflowB'; payload: { requiredField: string } };
 *
 * const migrator: DynamicCompositeTaskOnMigrate<MyWorkflowPayloads> = async ({ workflow }) => {
 *   await workflow.initialize.workflowA();
 *   // or: await workflow.initialize.workflowB({ requiredField: 'value' });
 *   return MigrationMode.continue;
 * };
 * ```
 */
export type DynamicCompositeTaskOnMigrate<
  TWorkflowPayloads extends { name: string; payload?: unknown },
> = (props: {
  mutationCtx: MutationCtx
  isInternalMutation: boolean
  migratingFromWorkflow: WorkflowInfo
  parent: {
    workflow: WorkflowInfo
  }
  task: TaskInfo
  workflow: {
    initialize: DynamicWorkflowInitializeFunctions<TWorkflowPayloads>
  }
  registerScheduled: RegisterScheduled
  audit: AuditCallbackInfo
}) => Promise<TaskMigrationMode>

export type TaskOnMigrate<TWorkItemPayload> = (props: {
  mutationCtx: MutationCtx
  isInternalMutation: boolean
  migratingFromWorkflow: WorkflowInfo
  parent: {
    workflow: WorkflowInfo
  }
  task: TaskInfo
  workItem: {
    initialize: ShouldBeOptional<TWorkItemPayload> extends true
      ? (payload?: unknown) => Promise<Id<'tasquencerWorkItems'>>
      : (payload: TWorkItemPayload) => Promise<Id<'tasquencerWorkItems'>>
  }
  registerScheduled: RegisterScheduled
  audit: AuditCallbackInfo
}) => Promise<TaskMigrationMode>

/**
 * Collects all workflow names that share the same parent workflow and task name.
 * This is used to detect dynamic composite tasks which have multiple workflow types.
 */
type CollectWorkflowNamesForKey<
  TEntries extends TaskToChildElement,
  TParentWorkflowName extends string,
  TTaskName extends string,
> = Extract<
  TEntries,
  {
    parentWorkflowName: TParentWorkflowName
    taskName: TTaskName
    child: { type: 'workflow' }
  }
>['child']['name']

/**
 * Gets the child type (workflow or workItem) for a given key.
 * For dynamic composite tasks, returns 'workflow'.
 */
type GetChildTypeForKey<
  TEntries extends TaskToChildElement,
  TParentWorkflowName extends string,
  TTaskName extends string,
> = Extract<
  TEntries,
  { parentWorkflowName: TParentWorkflowName; taskName: TTaskName }
>['child']['type']

/**
 * Checks if a type is a union type.
 * Returns true for union types like "A" | "B", false for single types like "A".
 */
type IsUnion<T> = [T] extends [UnionToIntersection<T>] ? false : true

/**
 * Determines the appropriate migrator type for a task.
 *
 * - For work items: returns TaskOnMigrate
 * - For single workflow (composite task): returns CompositeTaskOnMigrate
 * - For multiple workflows (dynamic composite task): returns DynamicCompositeTaskOnMigrate
 */
type GetMigratorPayloadForKey<
  TWorkflowBuilder extends AnyWorkflowBuilder,
  TEntries extends TaskToChildElement,
  TParentWorkflowName extends string,
  TTaskName extends string,
  TChildType extends 'workflow' | 'workItem' = GetChildTypeForKey<
    TEntries,
    TParentWorkflowName,
    TTaskName
  >,
  TWorkflowNames extends string = CollectWorkflowNamesForKey<
    TEntries,
    TParentWorkflowName,
    TTaskName
  >,
> = TChildType extends 'workItem'
  ? TaskOnMigrate<
      Extract<
        GetWorkItemActions<
          GetWorkflowBuilderActionsRegistry<TWorkflowBuilder>
        >['initialize'],
        {
          name: Extract<
            TEntries,
            { parentWorkflowName: TParentWorkflowName; taskName: TTaskName }
          >['child']['name']
        }
      >
    >
  : TChildType extends 'workflow'
    ? IsUnion<TWorkflowNames> extends true
      ? // Multiple workflows = dynamic composite task
        DynamicCompositeTaskOnMigrate<
          Extract<
            GetWorkflowActions<
              GetWorkflowBuilderActionsRegistry<TWorkflowBuilder>
            >['initialize'],
            { name: TWorkflowNames }
          >
        >
      : // Single workflow = regular composite task
        CompositeTaskOnMigrate<
          Extract<
            GetWorkflowActions<
              GetWorkflowBuilderActionsRegistry<TWorkflowBuilder>
            >['initialize'],
            { name: TWorkflowNames }
          >
        >
    : never

export type GetMigratorsDefinition<
  TWorkflowBuilder extends AnyWorkflowBuilder,
  TEntries extends
    TaskToChildElement = GetWorkflowBuilderTaskToChildElement<TWorkflowBuilder>,
> = {
  [TKey in `${TEntries['parentWorkflowName']}/${TEntries['taskName']}`]: GetMigratorPayloadForKey<
    TWorkflowBuilder,
    TEntries,
    TKey extends `${infer P}/${string}` ? P : never,
    TKey extends `${string}/${infer T}` ? T : never
  >
}

export type MigrationInitializer = (props: {
  mutationCtx: MutationCtx
  isInternalMutation: boolean
  migratingFromWorkflow: WorkflowInfo
  registerScheduled: RegisterScheduled
  workflow: WorkflowInfo
  audit: AuditCallbackInfo
}) => Promise<void>

export type MigrationFinalizer = (props: {
  mutationCtx: MutationCtx
  isInternalMutation: boolean
  migratingFromWorkflow: WorkflowInfo
  workflow: WorkflowInfo
  result: { state: WorkflowState }
  registerScheduled: RegisterScheduled
  audit: AuditCallbackInfo
}) => Promise<void>

export class MigrationInit<
  TFromWorkflowBuilder extends AnyWorkflowBuilder,
  TToWorkflowBuilder extends AnyWorkflowBuilder,
> {
  static make<
    TFromWorkflowBuilder extends AnyWorkflowBuilder,
    TToWorkflowBuilder extends AnyWorkflowBuilder,
  >(from: TFromWorkflowBuilder, to: TToWorkflowBuilder) {
    return new MigrationInit<TFromWorkflowBuilder, TToWorkflowBuilder>(
      from,
      to,
      () => Promise.resolve(),
      () => Promise.resolve(),
      {},
    )
  }
  private constructor(
    readonly from: TFromWorkflowBuilder,
    readonly to: TToWorkflowBuilder,
    private readonly initializer: MigrationInitializer,
    private readonly finalizer: MigrationFinalizer,
    private readonly taskMigrators: Partial<
      GetMigratorsDefinition<TToWorkflowBuilder>
    >,
  ) {}

  withInitializer(initializer: MigrationInitializer) {
    return new MigrationInit<TFromWorkflowBuilder, TToWorkflowBuilder>(
      this.from,
      this.to,
      initializer,
      this.finalizer,
      this.taskMigrators,
    )
  }

  withFinalizer(finalizer: MigrationFinalizer) {
    return new MigrationInit<TFromWorkflowBuilder, TToWorkflowBuilder>(
      this.from,
      this.to,
      this.initializer,
      finalizer,
      this.taskMigrators,
    )
  }

  withTaskMigrators(
    taskMigrators: Partial<GetMigratorsDefinition<TToWorkflowBuilder>>,
  ) {
    return new MigrationInit<TFromWorkflowBuilder, TToWorkflowBuilder>(
      this.from,
      this.to,
      this.initializer,
      this.finalizer,
      taskMigrators,
    )
  }

  build() {
    return new Migration<TFromWorkflowBuilder, TToWorkflowBuilder>(
      this.from,
      this.to,
      this.initializer,
      this.finalizer,
      this.taskMigrators,
    )
  }
}

export type AnyMigration = Migration<any, any>

export class Migration<
  TFromWorkflowBuilder extends AnyWorkflowBuilder,
  TToWorkflowBuilder extends AnyWorkflowBuilder,
> {
  constructor(
    readonly from: TFromWorkflowBuilder,
    readonly to: TToWorkflowBuilder,
    readonly initializer: MigrationInitializer,
    readonly finalizer: MigrationFinalizer,
    readonly taskMigrators: Partial<GetMigratorsDefinition<TToWorkflowBuilder>>,
  ) {}
}

export function migrate<
  TFromWorkflowBuilder extends AnyWorkflowBuilder,
  TToWorkflowBuilder extends AnyWorkflowBuilder,
>(from: TFromWorkflowBuilder, to: TToWorkflowBuilder) {
  return MigrationInit.make(from, to)
}

export const MigrationMode = {
  continue: 'continue',
  fastForward: 'fastForward',
} as const
