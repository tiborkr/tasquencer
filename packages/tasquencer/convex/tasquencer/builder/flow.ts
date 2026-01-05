import { type Id } from "../../_generated/dataModel";
import { BaseTask } from "../elements/baseTask";
import { Condition } from "../elements/condition";
import { ConditionToTaskFlow, TaskToConditionFlow } from "../elements/flow";
import { Workflow } from "../elements/workflow";
import { type TaskSplitType } from "../types";
import type { AnyCompositeTaskBuilder } from "./compositeTask";
import type { AnyDummyTaskBuilder } from "./dummyTask";
import type { AnyTaskBuilder } from "./task";
import type { AnyDynamicCompositeTaskBuilder } from "./dynamicCompositeTask";
import type { TaskInfo, WorkflowInfo } from "./types";
import type { GenericMutationCtx } from "convex/server";

export const PLACEHOLDER: unique symbol = Symbol("PLACEHOLDER");
type Placeholder = typeof PLACEHOLDER;

type RouteTo<
  TConnectedTasks,
  TConnectedConditions,
  TCleanConnectedTasks = Exclude<TConnectedTasks, Placeholder>,
  TCleanConnectedConditions = Exclude<TConnectedConditions, Placeholder>,
> = {
  toCondition: (
    condition: TCleanConnectedConditions & string
  ) => ConditionRouting<TCleanConnectedConditions>;
  toTask: (
    task: TCleanConnectedTasks & string
  ) => TaskRouting<TCleanConnectedTasks>;
};

export type AvailableRoutes<T> =
  T extends RouteTo<
    infer _TConnectedTasks,
    infer _TConnectedConditions,
    infer TCleanConnectedTasks,
    infer TCleanConnectedConditions
  >
    ?
        | ([TCleanConnectedConditions] extends [never]
            ? never
            : ConditionRouting<TCleanConnectedConditions>)
        | ([TCleanConnectedTasks] extends [never]
            ? never
            : TaskRouting<TCleanConnectedTasks>)
        | TaskRouting<TCleanConnectedTasks>
    : never;

export class TaskRouting<TConnectedTasks> {
  constructor(readonly to: TConnectedTasks & string) {}
  getConditionName(task: BaseTask) {
    return getImplicitConditionName(task.name, this.to);
  }
}

export class ConditionRouting<TConnectedConditions> {
  constructor(readonly to: TConnectedConditions & string) {}
  getConditionName(_task: BaseTask) {
    return this.to;
  }
}

export type ImplicitConditionName<
  TFromTask extends string,
  TToTask extends string,
> = `${TFromTask}__to__${TToTask}`;

export function getImplicitConditionName(fromTask: string, toTask: string) {
  return `${fromTask}__to__${toTask}`;
}

function connectTaskFlows(
  workflow: Workflow,
  fromTaskName: string,
  toTaskNames: Set<string>,
  toConditionNames: Set<string>
) {
  const task = workflow.getTask(fromTaskName);
  for (const conditionName of toConditionNames) {
    const toCondition = workflow.getCondition(conditionName);
    const flow = new TaskToConditionFlow(task, toCondition);
    task.addOutgoingFlow(flow);
    toCondition.addIncomingFlow(flow);
  }
  for (const taskName of toTaskNames) {
    const toTask = workflow.getTask(taskName);
    const implicitConditionName = getImplicitConditionName(
      fromTaskName,
      taskName
    );
    const condition = new Condition(
      implicitConditionName,
      workflow.versionName,
      [...workflow.path, implicitConditionName],
      workflow,
      true
    );
    workflow.addCondition(condition);
    const leftFlow = new TaskToConditionFlow(task, condition);
    const rightFlow = new ConditionToTaskFlow(condition, toTask);
    task.addOutgoingFlow(leftFlow);
    condition.addIncomingFlow(leftFlow);
    condition.addOutgoingFlow(rightFlow);
    toTask.addIncomingFlow(rightFlow);
  }
}

export class TaskFlowBuilder<
  TOriginatingTaskName extends string,
  TTasks,
  TConditions,
  TImplicitConditionName = never,
> {
  readonly toConditions: Set<string> = new Set();
  readonly toTasks: Set<string> = new Set();
  // Hold the implicit condition name type information without affecting runtime.
  declare readonly __implicitConditionName?: TImplicitConditionName;

  constructor(readonly from: string) {}

  condition<TCondition extends TConditions>(condition: TCondition & string) {
    this.toConditions.add(condition);
    return this as TaskFlowBuilder<
      TOriginatingTaskName,
      TTasks,
      TConditions,
      TImplicitConditionName
    >;
  }

  task<TTask extends TTasks>(task: TTask & string) {
    this.toTasks.add(task);
    return this as TaskFlowBuilder<
      TOriginatingTaskName,
      TTasks,
      TConditions,
      | TImplicitConditionName
      | ImplicitConditionName<TOriginatingTaskName, TTask & string>
    >;
  }
  build(workflow: Workflow) {
    connectTaskFlows(workflow, this.from, this.toTasks, this.toConditions);
  }
}

export class XorTaskFlowBuilderInit<
  TMutationCtx extends GenericMutationCtx<any>,
  TOriginatingTaskName extends string,
  TTaskType extends
    | AnyTaskBuilder
    | AnyDummyTaskBuilder
    | AnyCompositeTaskBuilder
    | AnyDynamicCompositeTaskBuilder,
  TTasks,
  TConditions,
  TConnectedTasks = Placeholder,
  TConnectedConditions = Placeholder,
  TImplicitConditionName = never,
> {
  readonly from: string;
  readonly toConditions: Set<string> = new Set();
  readonly toTasks: Set<string> = new Set();

  constructor(from: string) {
    this.from = from;
  }

  condition<TCondition extends TConditions>(condition: TCondition & string) {
    this.toConditions.add(condition);
    return this as XorTaskFlowBuilderInit<
      TMutationCtx,
      TOriginatingTaskName,
      TTaskType,
      TTasks,
      TConditions,
      TConnectedTasks,
      TConnectedConditions | TCondition,
      TImplicitConditionName
    >;
  }

  task<TTask extends TTasks>(task: TTask & string) {
    this.toTasks.add(task);
    return this as XorTaskFlowBuilderInit<
      TMutationCtx,
      TOriginatingTaskName,
      TTaskType,
      TTasks,
      TConditions,
      TConnectedTasks | TTask,
      TConnectedConditions,
      | TImplicitConditionName
      | ImplicitConditionName<TOriginatingTaskName, TTask & string>
    >;
  }
  route(
    router: XorTaskRouter<
      TMutationCtx,
      TOriginatingTaskName,
      TTaskType,
      TConnectedTasks,
      TConnectedConditions,
      TImplicitConditionName
    >
  ) {
    return new XorTaskFlowBuilder<
      TMutationCtx,
      TOriginatingTaskName,
      TTaskType,
      TConnectedTasks,
      TConnectedConditions,
      TImplicitConditionName
    >(this.from, this.toConditions, this.toTasks, router);
  }
}

type XorTaskRouter<
  TMutationCtx extends GenericMutationCtx<any>,
  _TOriginatingTaskName extends string,
  TTaskType extends
    | AnyTaskBuilder
    | AnyDummyTaskBuilder
    | AnyCompositeTaskBuilder
    | AnyDynamicCompositeTaskBuilder,
  TConnectedTasks,
  TConnectedConditions,
  _TImplicitConditionName = never,
> = (
  ctx: {
    mutationCtx: TMutationCtx;
    parent: { workflow: WorkflowInfo };
    task: TaskInfo;
    route: RouteTo<TConnectedTasks, TConnectedConditions>;
  } & (TTaskType extends AnyTaskBuilder
    ? {
        workItem: {
          name: string;
          getAllWorkItemIds: () => Promise<Id<"tasquencerWorkItems">[]>;
        };
      }
    : TTaskType extends AnyCompositeTaskBuilder
      ? {
          workflow: {
            name: string;
            getAllWorkflowIds: () => Promise<Id<"tasquencerWorkflows">[]>;
          };
        }
      : TTaskType extends AnyDynamicCompositeTaskBuilder
        ? {
            workflow: {
              name: string;
              getAllWorkflowIds: () => Promise<Id<"tasquencerWorkflows">[]>;
            };
          }
        : {})
) => Promise<
  TaskRouting<TConnectedTasks> | ConditionRouting<TConnectedConditions>
>;

export class XorTaskFlowBuilder<
  TMutationCtx extends GenericMutationCtx<any>,
  TOriginatingTaskName extends string,
  TTaskType extends
    | AnyTaskBuilder
    | AnyDummyTaskBuilder
    | AnyCompositeTaskBuilder
    | AnyDynamicCompositeTaskBuilder,
  TConnectedTasks,
  TConnectedConditions,
  TImplicitConditionName = never,
> {
  constructor(
    readonly from: string,
    readonly toConditions: Set<string>,
    readonly toTasks: Set<string>,
    readonly router: XorTaskRouter<
      TMutationCtx,
      TOriginatingTaskName,
      TTaskType,
      TConnectedTasks,
      TConnectedConditions
    >
  ) {}
  // Preserve implicit condition name type information.
  declare readonly __implicitConditionName?: TImplicitConditionName;
  build(workflow: Workflow) {
    connectTaskFlows(workflow, this.from, this.toTasks, this.toConditions);
    const task = workflow.getTask(this.from);
    task.setRouter(this.router);
  }
}

export class OrTaskFlowBuilderInit<
  TMutationCtx extends GenericMutationCtx<any>,
  TOriginatingTaskName extends string,
  TTaskType extends
    | AnyTaskBuilder
    | AnyDummyTaskBuilder
    | AnyCompositeTaskBuilder
    | AnyDynamicCompositeTaskBuilder,
  TTasks,
  TConditions,
  TConnectedTasks = Placeholder,
  TConnectedConditions = Placeholder,
  TImplicitConditionName = never,
> {
  readonly from: string;
  readonly toConditions: Set<string> = new Set();
  readonly toTasks: Set<string> = new Set();

  constructor(from: string) {
    this.from = from;
  }

  condition<TCondition extends TConditions>(condition: TCondition & string) {
    this.toConditions.add(condition);
    return this as OrTaskFlowBuilderInit<
      TMutationCtx,
      TOriginatingTaskName,
      TTaskType,
      TTasks,
      TConditions,
      TConnectedTasks,
      TConnectedConditions | TCondition,
      TImplicitConditionName
    >;
  }

  task<TTask extends TTasks>(task: TTask & string) {
    this.toTasks.add(task);
    return this as OrTaskFlowBuilderInit<
      TMutationCtx,
      TOriginatingTaskName,
      TTaskType,
      TTasks,
      TConditions,
      TConnectedTasks | TTask,
      TConnectedConditions,
      | TImplicitConditionName
      | ImplicitConditionName<TOriginatingTaskName, TTask & string>
    >;
  }
  route(
    router: OrTaskRouter<
      TMutationCtx,
      TOriginatingTaskName,
      TTaskType,
      TConnectedTasks,
      TConnectedConditions,
      TImplicitConditionName
    >
  ) {
    return new OrTaskFlowBuilder<
      TMutationCtx,
      TOriginatingTaskName,
      TTaskType,
      TConnectedTasks,
      TConnectedConditions,
      TImplicitConditionName
    >(this.from, this.toConditions, this.toTasks, router);
  }
}

type OrTaskRouter<
  TMutationCtx extends GenericMutationCtx<any>,
  _TOriginatingTaskName extends string,
  TTaskType extends
    | AnyTaskBuilder
    | AnyDummyTaskBuilder
    | AnyCompositeTaskBuilder
    | AnyDynamicCompositeTaskBuilder,
  TConnectedTasks,
  TConnectedConditions,
  _TImplicitConditionName = never,
> = (
  ctx: {
    parent: { workflow: WorkflowInfo };
    task: TaskInfo;
    route: RouteTo<TConnectedTasks, TConnectedConditions>;
    mutationCtx: TMutationCtx;
  } & (TTaskType extends AnyTaskBuilder
    ? {
        workItem: {
          name: string;
          getAllWorkItemIds: () => Promise<Id<"tasquencerWorkItems">[]>;
        };
      }
    : TTaskType extends AnyCompositeTaskBuilder
      ? {
          workflow: {
            name: string;
            getAllWorkflowIds: () => Promise<Id<"tasquencerWorkflows">[]>;
          };
        }
      : TTaskType extends AnyDynamicCompositeTaskBuilder
        ? {
            workflow: {
              name: string;
              getAllWorkflowIds: () => Promise<Id<"tasquencerWorkflows">[]>;
            };
          }
        : {})
) => Promise<
  (TaskRouting<TConnectedTasks> | ConditionRouting<TConnectedConditions>)[]
>;

export class OrTaskFlowBuilder<
  TMutationCtx extends GenericMutationCtx<any>,
  TOriginatingTaskName extends string,
  TTaskType extends
    | AnyTaskBuilder
    | AnyDummyTaskBuilder
    | AnyCompositeTaskBuilder
    | AnyDynamicCompositeTaskBuilder,
  TConnectedTasks,
  TConnectedConditions,
  TImplicitConditionName = never,
> {
  constructor(
    readonly from: string,
    readonly toConditions: Set<string>,
    readonly toTasks: Set<string>,
    readonly router: OrTaskRouter<
      TMutationCtx,
      TOriginatingTaskName,
      TTaskType,
      TConnectedTasks,
      TConnectedConditions
    >
  ) {}
  // Preserve implicit condition name type information.
  declare readonly __implicitConditionName?: TImplicitConditionName;
  build(workflow: Workflow) {
    connectTaskFlows(workflow, this.from, this.toTasks, this.toConditions);
    const task = workflow.getTask(this.from);
    task.setRouter(this.router);
  }
}

export type TaskFlowBuilderForSplitType<
  TMutationCtx extends GenericMutationCtx<any>,
  TOriginatingTaskName extends string,
  TTaskType extends
    | AnyTaskBuilder
    | AnyDummyTaskBuilder
    | AnyCompositeTaskBuilder
    | AnyDynamicCompositeTaskBuilder,
  TSplitType extends TaskSplitType,
  TTasks,
  TConditions,
> = TSplitType extends "xor"
  ? (
      builder: XorTaskFlowBuilderInit<
        TMutationCtx,
        TOriginatingTaskName,
        TTaskType,
        TTasks,
        TConditions
      >
    ) => XorTaskFlowBuilder<any, any, any, any, any, any>
  : TSplitType extends "or"
    ? (
        builder: OrTaskFlowBuilderInit<
          TMutationCtx,
          TOriginatingTaskName,
          TTaskType,
          TTasks,
          TConditions
        >
      ) => OrTaskFlowBuilder<any, any, any, any, any, any>
    : (
        builder: TaskFlowBuilder<TOriginatingTaskName, TTasks, TConditions>
      ) => TaskFlowBuilder<any, any, any, any>;

export class ConditionFlowBuilder<TTasks> {
  readonly toTasks: Set<string> = new Set();
  constructor(readonly from: string) {}

  task(task: TTasks & string) {
    this.toTasks.add(task);
    return this;
  }
  build(workflow: Workflow) {
    const { from, toTasks } = this;
    const condition = workflow.getCondition(from);

    for (const taskName of toTasks) {
      const task = workflow.getTask(taskName);
      const flow = new ConditionToTaskFlow(condition, task);
      task.addIncomingFlow(flow);
      condition.addOutgoingFlow(flow);
    }
  }
}

export type AnyTaskFlowBuilder =
  | XorTaskFlowBuilder<any, any, any, any, any, any>
  | OrTaskFlowBuilder<any, any, any, any, any, any>
  | TaskFlowBuilder<any, any, any, any>;

export type AnyConditionFlowBuilder = ConditionFlowBuilder<any>;

export type GetFlowBuilderImplicitConditionName<T> = T extends {
  __implicitConditionName?: infer TImplicitConditionName;
}
  ? TImplicitConditionName
  : never;
