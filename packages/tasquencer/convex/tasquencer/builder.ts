export * from "./builder/workflow";
export * from "./builder/task";
export * from "./builder/compositeTask";
export * from "./builder/dynamicCompositeTask";
export * from "./builder/dummyTask";
export * from "./builder/workItem";
export {
  makeWorkflowActions,
  type GetTypeForWorkflowAction as GetSchemaForWorkflowAction,
} from "./builder/workflow/actions";
export { makeWorkItemActions } from "./builder/workItem/actions";

import type { GenericMutationCtx } from "convex/server";
import { makeWorkflowBuilder } from "./builder/workflow";
import { makeCompositeTaskBuilder } from "./builder/compositeTask";
import { makeTaskBuilder } from "./builder/task";
import { makeDynamicCompositeTaskBuilder } from "./builder/dynamicCompositeTask";
import { makeDummyTaskBuilder } from "./builder/dummyTask";
import { makeWorkItemBuilder } from "./builder/workItem";
import { makeWorkflowActions } from "./builder/workflow/actions";
import { makeWorkItemActions } from "./builder/workItem/actions";

export const makeBuilder = <TMutationCtx extends GenericMutationCtx<any>>() => {
  return {
    workflow: makeWorkflowBuilder<TMutationCtx>(),
    task: makeTaskBuilder<TMutationCtx>(),
    compositeTask: makeCompositeTaskBuilder<TMutationCtx>(),
    dynamicCompositeTask: makeDynamicCompositeTaskBuilder<TMutationCtx>(),
    dummyTask: makeDummyTaskBuilder<TMutationCtx>(),
    workItem: makeWorkItemBuilder<TMutationCtx>(),
    workflowActions: makeWorkflowActions<TMutationCtx>(),
    workItemActions: makeWorkItemActions<TMutationCtx>(),
  };
};
