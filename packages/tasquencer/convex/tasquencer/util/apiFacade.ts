import { internalMutation, mutation } from "../../_generated/server";

import * as impl from "./apiImpl";
import {
  type GetSchemaForWorkflowAction,
  type AnyWorkflowBuilder,
  type GetWorkflowBuilderActions,
  type GetWorkflowBuilderActionsRegistry,
  type GetWorkflowBuilderTaskNames,
  type GetWorkflowActions,
  type GetWorkItemActions,
} from "../builder";
import {
  type GenericDatabaseReader,
  type RegisteredMutation,
} from "convex/server";
import { type Id } from "../../_generated/dataModel";
import { v } from "convex/values";
import { type Simplify, type Get } from "type-fest";
import { type TaskState } from "../types";
import { extractWorkflowStructure } from "./extractWorkflowStructure";
import {
  getWorkflowState,
  getWorkItemState,
  safeGetWorkflowState,
  safeGetWorkItemState,
} from "./apiImpl";
import type { AnyMigration } from "../versionManager/migration";
import { makeAuditFunctionHandles } from "../audit/integration";
import type { ComponentApi } from "../../components/audit/src/component/_generated/component";

type GetWorkflowTaskStatesReturnType<
  TWorkflowNamesToTaskNames extends Record<string, string>,
  TWorkflowName extends string,
> = {
  [TKey in Get<TWorkflowNamesToTaskNames, TWorkflowName> & string]: TaskState;
};

export function apiFor<
  TVersionName extends string,
  TWorkflowBuilder extends AnyWorkflowBuilder,
>(
  versionName: TVersionName,
  workflowBuilder: TWorkflowBuilder,
  auditComponent: ComponentApi,
  props: {
    isVersionDeprecated: boolean;
    migration?: undefined | AnyMigration;
  }
) {
  const workflowNetwork = workflowBuilder.build(versionName, props);

  type WorkflowNetworkActionsRegistry =
    GetWorkflowBuilderActionsRegistry<TWorkflowBuilder>;
  type RootWorkflowBuilderActions = Get<
    GetWorkflowBuilderActions<TWorkflowBuilder>,
    "actions"
  >;
  type WorkflowActions = GetWorkflowActions<WorkflowNetworkActionsRegistry>;
  type WorkItemActions = GetWorkItemActions<WorkflowNetworkActionsRegistry>;

  const initializeRootWorkflow = mutation({
    args: {
      payload: v.optional(v.any()),
      parentContext: v.optional(v.any()),
    },
    handler: async (ctx, args) => {
      const auditFunctionHandles =
        await makeAuditFunctionHandles(auditComponent);
      return await impl.initializeRootWorkflow(
        ctx,
        auditFunctionHandles,
        false,
        {
          workflowNetwork,
          payload: args.payload,
          parentContext: args.parentContext,
        }
      );
    },
  }) as RegisteredMutation<
    "public",
    {
      payload: GetSchemaForWorkflowAction<
        RootWorkflowBuilderActions,
        "initialize"
      >;
      parentContext?: any;
    },
    Promise<Id<"tasquencerWorkflows">>
  >;

  const internalInitializeRootWorkflow = internalMutation({
    args: {
      payload: v.optional(v.any()),
      parentContext: v.optional(v.any()),
    },
    handler: async (ctx, args) => {
      const auditFunctionHandles =
        await makeAuditFunctionHandles(auditComponent);
      return await impl.initializeRootWorkflow(
        ctx,
        auditFunctionHandles,
        true,
        {
          workflowNetwork,
          payload: args.payload,
          parentContext: args.parentContext,
        }
      );
    },
  }) as RegisteredMutation<
    "internal",
    {
      payload: GetSchemaForWorkflowAction<
        RootWorkflowBuilderActions,
        "initialize"
      >;
      parentContext?: any;
    },
    Promise<Id<"tasquencerWorkflows">>
  >;

  const cancelRootWorkflow = mutation({
    args: {
      workflowId: v.id("tasquencerWorkflows"),
      payload: v.optional(v.any()),
    },
    handler: async (ctx, args) => {
      const auditFunctionHandles =
        await makeAuditFunctionHandles(auditComponent);
      return await impl.cancelRootWorkflow(ctx, auditFunctionHandles, false, {
        workflowNetwork,
        workflowId: args.workflowId,
        payload: args.payload,
      });
    },
  }) as RegisteredMutation<
    "public",
    {
      workflowId: Id<"tasquencerWorkflows">;
      payload: GetSchemaForWorkflowAction<RootWorkflowBuilderActions, "cancel">;
    },
    Promise<null>
  >;

  const internalCancelRootWorkflow = internalMutation({
    args: {
      workflowId: v.id("tasquencerWorkflows"),
      payload: v.optional(v.any()),
    },
    handler: async (ctx, args) => {
      const auditFunctionHandles =
        await makeAuditFunctionHandles(auditComponent);
      return await impl.cancelRootWorkflow(ctx, auditFunctionHandles, true, {
        workflowNetwork,
        workflowId: args.workflowId,
        payload: args.payload,
      });
    },
  }) as RegisteredMutation<
    "internal",
    {
      workflowId: Id<"tasquencerWorkflows">;
      payload: GetSchemaForWorkflowAction<RootWorkflowBuilderActions, "cancel">;
    },
    Promise<null>
  >;

  const initializeWorkflow = mutation({
    args: {
      target: v.object({
        path: v.array(v.string()),
        parentWorkflowId: v.id("tasquencerWorkflows"),
        parentTaskName: v.string(),
      }),
      args: v.object({
        name: v.string(),
        payload: v.optional(v.any()),
      }),
    },
    handler: async (ctx, args) => {
      const auditFunctionHandles =
        await makeAuditFunctionHandles(auditComponent);
      return await impl.initializeWorkflow(ctx, auditFunctionHandles, false, {
        workflowNetwork,
        target: args.target,
        payload: args.args!.payload,
      });
    },
  }) as RegisteredMutation<
    "public",
    {
      target: {
        path: string[];
        parentWorkflowId: Id<"tasquencerWorkflows">;
        parentTaskName: string;
      };
      args: Get<WorkflowActions, "initialize">;
    },
    Promise<Id<"tasquencerWorkflows">>
  >;

  const internalInitializeWorkflow = internalMutation({
    args: {
      target: v.object({
        path: v.array(v.string()),
        parentWorkflowId: v.id("tasquencerWorkflows"),
        parentTaskName: v.string(),
      }),
      args: v.object({
        name: v.string(),
        payload: v.optional(v.any()),
      }),
    },
    handler: async (ctx, args) => {
      const auditFunctionHandles =
        await makeAuditFunctionHandles(auditComponent);
      return await impl.initializeWorkflow(ctx, auditFunctionHandles, true, {
        workflowNetwork,
        target: args.target,
        payload: args.args!.payload,
      });
    },
  }) as RegisteredMutation<
    "internal",
    {
      target: {
        path: string[];
        parentWorkflowId: Id<"tasquencerWorkflows">;
        parentTaskName: string;
      };
      args: Get<WorkflowActions, "initialize">;
    },
    Promise<Id<"tasquencerWorkflows">>
  >;

  const cancelWorkflow = mutation({
    args: {
      workflowId: v.id("tasquencerWorkflows"),
      args: v.object({
        name: v.string(),
        payload: v.optional(v.any()),
      }),
    },
    handler: async (ctx, args) => {
      const auditFunctionHandles =
        await makeAuditFunctionHandles(auditComponent);
      return await impl.cancelWorkflow(ctx, auditFunctionHandles, false, {
        workflowNetwork,
        workflowId: args.workflowId,
        payload: args.args!.payload,
      });
    },
  }) as RegisteredMutation<
    "public",
    {
      workflowId: Id<"tasquencerWorkflows">;
      args: Get<WorkflowActions, "cancel">;
    },
    Promise<null>
  >;

  const internalCancelWorkflow = internalMutation({
    args: {
      workflowId: v.id("tasquencerWorkflows"),
      args: v.object({
        name: v.string(),
        payload: v.optional(v.any()),
      }),
    },
    handler: async (ctx, args) => {
      const auditFunctionHandles =
        await makeAuditFunctionHandles(auditComponent);
      return await impl.cancelWorkflow(ctx, auditFunctionHandles, true, {
        workflowNetwork,
        workflowId: args.workflowId,
        payload: args.args!.payload,
      });
    },
  }) as RegisteredMutation<
    "internal",
    {
      workflowId: Id<"tasquencerWorkflows">;
      args: Get<WorkflowActions, "cancel">;
    },
    Promise<null>
  >;

  const initializeWorkItem = mutation({
    args: {
      target: v.object({
        path: v.array(v.string()),
        parentWorkflowId: v.id("tasquencerWorkflows"),
        parentTaskName: v.string(),
      }),
      args: v.object({
        name: v.string(),
        payload: v.optional(v.any()),
      }),
    },
    handler: async (ctx, args) => {
      const auditFunctionHandles =
        await makeAuditFunctionHandles(auditComponent);
      return await impl.initializeWorkItem(ctx, auditFunctionHandles, false, {
        workflowNetwork,
        target: args.target,
        payload: args.args!.payload,
      });
    },
  }) as RegisteredMutation<
    "public",
    {
      target: {
        path: string[];
        parentWorkflowId: Id<"tasquencerWorkflows">;
        parentTaskName: string;
      };
      args: Get<WorkItemActions, "initialize">;
    },
    Promise<Id<"tasquencerWorkItems">>
  >;

  const internalInitializeWorkItem = internalMutation({
    args: {
      target: v.object({
        path: v.array(v.string()),
        parentWorkflowId: v.id("tasquencerWorkflows"),
        parentTaskName: v.string(),
      }),
      args: v.object({
        name: v.string(),
        payload: v.optional(v.any()),
      }),
    },
    handler: async (ctx, args) => {
      const auditFunctionHandles =
        await makeAuditFunctionHandles(auditComponent);
      return await impl.initializeWorkItem(ctx, auditFunctionHandles, true, {
        workflowNetwork,
        target: args.target,
        payload: args.args!.payload,
      });
    },
  }) as RegisteredMutation<
    "internal",
    {
      target: {
        path: string[];
        parentWorkflowId: Id<"tasquencerWorkflows">;
        parentTaskName: string;
      };
      args: Get<WorkItemActions, "initialize">;
    },
    Promise<Id<"tasquencerWorkItems">>
  >;

  const startWorkItem = mutation({
    args: {
      workItemId: v.id("tasquencerWorkItems"),
      args: v.object({
        name: v.string(),
        payload: v.optional(v.any()),
      }),
    },
    handler: async (ctx, args) => {
      const auditFunctionHandles =
        await makeAuditFunctionHandles(auditComponent);
      return await impl.startWorkItem(ctx, auditFunctionHandles, false, {
        workflowNetwork,
        workItemId: args.workItemId,
        payload: args.args!.payload,
      });
    },
  }) as RegisteredMutation<
    "public",
    {
      workItemId: Id<"tasquencerWorkItems">;
      args: Get<WorkItemActions, "start">;
    },
    Promise<null>
  >;

  const internalStartWorkItem = internalMutation({
    args: {
      workItemId: v.id("tasquencerWorkItems"),
      args: v.object({
        name: v.string(),
        payload: v.optional(v.any()),
      }),
    },
    handler: async (ctx, args) => {
      const auditFunctionHandles =
        await makeAuditFunctionHandles(auditComponent);
      return await impl.startWorkItem(ctx, auditFunctionHandles, true, {
        workflowNetwork,
        workItemId: args.workItemId,
        payload: args.args!.payload,
      });
    },
  }) as RegisteredMutation<
    "internal",
    {
      workItemId: Id<"tasquencerWorkItems">;
      args: Get<WorkItemActions, "start">;
    },
    Promise<null>
  >;

  const completeWorkItem = mutation({
    args: {
      workItemId: v.id("tasquencerWorkItems"),
      args: v.object({
        name: v.string(),
        payload: v.optional(v.any()),
      }),
    },
    handler: async (ctx, args) => {
      const auditFunctionHandles =
        await makeAuditFunctionHandles(auditComponent);
      return await impl.completeWorkItem(ctx, auditFunctionHandles, false, {
        workflowNetwork,
        workItemId: args.workItemId,
        payload: args.args!.payload,
      });
    },
  }) as RegisteredMutation<
    "public",
    {
      workItemId: Id<"tasquencerWorkItems">;
      args: Get<WorkItemActions, "complete">;
    },
    Promise<null>
  >;

  const internalCompleteWorkItem = internalMutation({
    args: {
      workItemId: v.id("tasquencerWorkItems"),
      args: v.object({
        name: v.string(),
        payload: v.optional(v.any()),
      }),
    },
    handler: async (ctx, args) => {
      const auditFunctionHandles =
        await makeAuditFunctionHandles(auditComponent);
      return await impl.completeWorkItem(ctx, auditFunctionHandles, true, {
        workflowNetwork,
        workItemId: args.workItemId,
        payload: args.args!.payload,
      });
    },
  }) as RegisteredMutation<
    "internal",
    {
      workItemId: Id<"tasquencerWorkItems">;
      args: Get<WorkItemActions, "complete">;
    },
    Promise<null>
  >;

  const resetWorkItem = mutation({
    args: {
      workItemId: v.id("tasquencerWorkItems"),
      args: v.object({
        name: v.string(),
        payload: v.optional(v.any()),
      }),
    },
    handler: async (ctx, args) => {
      const auditFunctionHandles =
        await makeAuditFunctionHandles(auditComponent);
      return await impl.resetWorkItem(ctx, auditFunctionHandles, false, {
        workflowNetwork,
        workItemId: args.workItemId,
        payload: args.args!.payload,
      });
    },
  }) as RegisteredMutation<
    "public",
    {
      workItemId: Id<"tasquencerWorkItems">;
      args: Get<WorkItemActions, "reset">;
    },
    Promise<null>
  >;

  const internalResetWorkItem = internalMutation({
    args: {
      workItemId: v.id("tasquencerWorkItems"),
      args: v.object({
        name: v.string(),
        payload: v.optional(v.any()),
      }),
    },
    handler: async (ctx, args) => {
      const auditFunctionHandles =
        await makeAuditFunctionHandles(auditComponent);
      return await impl.resetWorkItem(ctx, auditFunctionHandles, true, {
        workflowNetwork,
        workItemId: args.workItemId,
        payload: args.args!.payload,
      });
    },
  }) as RegisteredMutation<
    "internal",
    {
      workItemId: Id<"tasquencerWorkItems">;
      args: Get<WorkItemActions, "reset">;
    },
    Promise<null>
  >;

  const failWorkItem = mutation({
    args: {
      workItemId: v.id("tasquencerWorkItems"),
      args: v.object({
        name: v.string(),
        payload: v.optional(v.any()),
      }),
    },
    handler: async (ctx, args) => {
      const auditFunctionHandles =
        await makeAuditFunctionHandles(auditComponent);
      return await impl.failWorkItem(ctx, auditFunctionHandles, false, {
        workflowNetwork,
        workItemId: args.workItemId,
        payload: args.args!.payload,
      });
    },
  }) as RegisteredMutation<
    "public",
    {
      workItemId: Id<"tasquencerWorkItems">;
      args: Get<WorkItemActions, "fail">;
    },
    Promise<null>
  >;

  const internalFailWorkItem = internalMutation({
    args: {
      workItemId: v.id("tasquencerWorkItems"),
      args: v.object({
        name: v.string(),
        payload: v.optional(v.any()),
      }),
    },
    handler: async (ctx, args) => {
      const auditFunctionHandles =
        await makeAuditFunctionHandles(auditComponent);
      return await impl.failWorkItem(ctx, auditFunctionHandles, true, {
        workflowNetwork,
        workItemId: args.workItemId,
        payload: args.args!.payload,
      });
    },
  }) as RegisteredMutation<
    "internal",
    {
      workItemId: Id<"tasquencerWorkItems">;
      args: Get<WorkItemActions, "fail">;
    },
    Promise<null>
  >;

  const cancelWorkItem = mutation({
    args: {
      workItemId: v.id("tasquencerWorkItems"),
      args: v.object({
        name: v.string(),
        payload: v.optional(v.any()),
      }),
    },
    handler: async (ctx, args) => {
      const auditFunctionHandles =
        await makeAuditFunctionHandles(auditComponent);
      return await impl.cancelWorkItem(ctx, auditFunctionHandles, false, {
        workflowNetwork,
        workItemId: args.workItemId,
        payload: args.args!.payload,
      });
    },
  }) as RegisteredMutation<
    "public",
    {
      workItemId: Id<"tasquencerWorkItems">;
      args: Get<WorkItemActions, "cancel">;
    },
    Promise<null>
  >;

  const internalCancelWorkItem = internalMutation({
    args: {
      workItemId: v.id("tasquencerWorkItems"),
      args: v.object({
        name: v.string(),
        payload: v.optional(v.any()),
      }),
    },
    handler: async (ctx, args) => {
      const auditFunctionHandles =
        await makeAuditFunctionHandles(auditComponent);
      return await impl.cancelWorkItem(ctx, auditFunctionHandles, true, {
        workflowNetwork,
        workItemId: args.workItemId,
        payload: args.args!.payload,
      });
    },
  }) as RegisteredMutation<
    "internal",
    {
      workItemId: Id<"tasquencerWorkItems">;
      args: Get<WorkItemActions, "cancel">;
    },
    Promise<null>
  >;

  const getWorkflowTaskStates = async <TWorkflowName extends string>(
    db: GenericDatabaseReader<any>,
    args: {
      workflowName: TWorkflowName;
      workflowId: Id<"tasquencerWorkflows">;
    }
  ) => {
    const result = await impl.getWorkflowTaskStates(db, {
      workflowId: args.workflowId,
    });

    return result as Simplify<
      GetWorkflowTaskStatesReturnType<
        GetWorkflowBuilderTaskNames<TWorkflowBuilder>,
        TWorkflowName
      >
    >;
  };

  const getWorkflowStructure = function () {
    return extractWorkflowStructure(workflowBuilder);
  };

  return {
    initializeRootWorkflow,
    cancelRootWorkflow,
    initializeWorkflow,
    cancelWorkflow,
    initializeWorkItem,
    startWorkItem,
    completeWorkItem,
    resetWorkItem,
    failWorkItem,
    cancelWorkItem,
    internalInitializeRootWorkflow,
    internalCancelRootWorkflow,
    internalInitializeWorkflow,
    internalCancelWorkflow,
    internalInitializeWorkItem,
    internalStartWorkItem,
    internalCompleteWorkItem,
    internalResetWorkItem,
    internalFailWorkItem,
    internalCancelWorkItem,
    helpers: {
      getWorkflowTaskStates,
      getWorkflowStructure,
      getWorkflowState,
      getWorkItemState,
      safeGetWorkflowState,
      safeGetWorkItemState,
    },
  };
}
