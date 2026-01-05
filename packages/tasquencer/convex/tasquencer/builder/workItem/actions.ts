import { z } from "zod/v3";
import { type Id } from "../../../_generated/dataModel";
import {
  type RegisterScheduled,
  type WorkflowExecutionMode,
} from "../../types";
import { type Get } from "type-fest";
import { type AuditCallbackInfo } from "../../audit/integration";
import { assertIsInternalMutation } from "../../exceptions/helpers";
import type { WorkItemInfo, WorkItemParentInfo } from "../types";
import type { GenericMutationCtx } from "convex/server";

export type WorkItemActionContext<
  TMutationCtx extends GenericMutationCtx<any>,
  TWorkItemPayload extends object,
> = {
  mutationCtx: TMutationCtx;
  isInternalMutation: boolean;
  executionMode: WorkflowExecutionMode;
  parent: WorkItemParentInfo;
  workItem: TWorkItemPayload;
  audit: AuditCallbackInfo;
};

export type WorkItemInitializeActionContext<
  TMutationCtx extends GenericMutationCtx<any>,
> = WorkItemActionContext<
  TMutationCtx,
  {
    name: string;
    initialize: () => Promise<Id<"tasquencerWorkItems">>;
  }
> & {
  registerScheduled: RegisterScheduled;
};
export type WorkItemInitializeAction<
  TMutationCtx extends GenericMutationCtx<any>,
  TPayload,
> = {
  schema: TPayload;
  callback: (
    ctx: WorkItemInitializeActionContext<TMutationCtx>,
    payload: TPayload
  ) => Promise<void>;
};

export type WorkItemStartActionContext<
  TMutationCtx extends GenericMutationCtx<any>,
> = WorkItemActionContext<
  TMutationCtx,
  WorkItemInfo & {
    start: () => Promise<void>;
  }
> & {
  registerScheduled: RegisterScheduled;
};
export type WorkItemStartAction<
  TMutationCtx extends GenericMutationCtx<any>,
  TPayload,
> = {
  schema: TPayload;
  callback: (
    ctx: WorkItemStartActionContext<TMutationCtx>,
    payload: TPayload
  ) => Promise<void>;
};

export type WorkItemCompleteActionContext<
  TMutationCtx extends GenericMutationCtx<any>,
> = WorkItemActionContext<
  TMutationCtx,
  WorkItemInfo & {
    complete: () => Promise<void>;
  }
>;
export type WorkItemCompleteAction<
  TMutationCtx extends GenericMutationCtx<any>,
  TPayload,
> = {
  schema: TPayload;
  callback: (
    ctx: WorkItemCompleteActionContext<TMutationCtx>,
    payload: TPayload
  ) => Promise<void>;
};

export type WorkItemFailActionContext<
  TMutationCtx extends GenericMutationCtx<any>,
> = WorkItemActionContext<
  TMutationCtx,
  WorkItemInfo & {
    fail: () => Promise<void>;
  }
>;

export type WorkItemFailAction<
  TMutationCtx extends GenericMutationCtx<any>,
  TPayload,
> = {
  schema: TPayload;
  callback: (
    ctx: WorkItemFailActionContext<TMutationCtx>,
    payload: TPayload
  ) => Promise<void>;
};

export type WorkItemCancelActionContext<
  TMutationCtx extends GenericMutationCtx<any>,
> = WorkItemActionContext<
  TMutationCtx,
  WorkItemInfo & {
    cancel: () => Promise<void>;
  }
>;

export type WorkItemCancelAction<
  TMutationCtx extends GenericMutationCtx<any>,
  TPayload,
> = {
  schema: TPayload;
  callback: (
    ctx: WorkItemCancelActionContext<TMutationCtx>,
    payload: TPayload
  ) => Promise<void>;
};

export type WorkItemResetActionContext<
  TMutationCtx extends GenericMutationCtx<any>,
> = WorkItemActionContext<
  TMutationCtx,
  WorkItemInfo & {
    reset: () => Promise<void>;
  }
>;
export type WorkItemResetAction<
  TMutationCtx extends GenericMutationCtx<any>,
  TPayload,
> = {
  schema: TPayload;
  callback: (
    ctx: WorkItemResetActionContext<TMutationCtx>,
    payload: TPayload
  ) => Promise<void>;
};

export type GenericWorkItemActions<
  TMutationCtx extends GenericMutationCtx<any>,
  TPayload,
> = {
  initialize: WorkItemInitializeAction<TMutationCtx, TPayload>;
  start: WorkItemStartAction<TMutationCtx, TPayload>;
  complete: WorkItemCompleteAction<TMutationCtx, TPayload>;
  fail: WorkItemFailAction<TMutationCtx, TPayload>;
  cancel: WorkItemCancelAction<TMutationCtx, TPayload>;
  reset: WorkItemResetAction<TMutationCtx, TPayload>;
};

export type GetWorkItemActionsDefinition<T> =
  T extends WorkItemActions<any, infer TWorkItemActions>
    ? TWorkItemActions
    : never;

export type GetSchemaForWorkItemAction<
  TWorkItemActions,
  TActionName extends keyof GenericWorkItemActions<any, any>,
> =
  TWorkItemActions extends WorkItemActions<infer TWorkItemActionsDefinition>
    ? Get<TWorkItemActionsDefinition, [TActionName, "schema"]>
    : never;

export type AnyWorkItemActions = WorkItemActions<any, any>;

export class WorkItemActions<
  TMutationCtx extends GenericMutationCtx<any>,
  TWorkItemActionsDefinition = Record<never, never>,
> {
  static make<TMutationCtx extends GenericMutationCtx<any>>() {
    return new WorkItemActions<TMutationCtx>({
      initialize: {
        schema: z.any().optional(),
        callback: async (ctx) => {
          assertIsInternalMutation(ctx.isInternalMutation);
          await ctx.workItem.initialize();
        },
      },
      start: {
        schema: z.any().optional(),
        callback: async (ctx) => {
          assertIsInternalMutation(ctx.isInternalMutation);
          await ctx.workItem.start();
        },
      },
      complete: {
        schema: z.any().optional(),
        callback: async (ctx) => {
          assertIsInternalMutation(ctx.isInternalMutation);
          await ctx.workItem.complete();
        },
      },
      fail: {
        schema: z.any().optional(),
        callback: async (ctx) => {
          assertIsInternalMutation(ctx.isInternalMutation);
          await ctx.workItem.fail();
        },
      },
      cancel: {
        schema: z.any().optional(),
        callback: async (ctx) => {
          assertIsInternalMutation(ctx.isInternalMutation);
          await ctx.workItem.cancel();
        },
      },
      reset: {
        schema: z.any().optional(),
        callback: async (ctx) => {
          assertIsInternalMutation(ctx.isInternalMutation);
          await ctx.workItem.reset();
        },
      },
    });
  }
  constructor(readonly actions: GenericWorkItemActions<any, any>) {}
  initialize<TSchema extends z.ZodType>(
    schema: TSchema,
    callback: (
      ctx: WorkItemInitializeActionContext<TMutationCtx>,
      payload: z.infer<TSchema>
    ) => Promise<void>
  ) {
    const definition: WorkItemInitializeAction<
      TMutationCtx,
      z.infer<TSchema>
    > = {
      schema,
      callback,
    };

    return new WorkItemActions<
      TMutationCtx,
      TWorkItemActionsDefinition & {
        initialize: WorkItemInitializeAction<TMutationCtx, z.infer<TSchema>>;
      }
    >({
      ...this.actions,
      initialize: definition,
    });
  }

  start<TSchema extends z.ZodType>(
    schema: TSchema,
    callback: (
      ctx: WorkItemStartActionContext<TMutationCtx>,
      payload: z.infer<TSchema>
    ) => Promise<void>
  ) {
    const definition: WorkItemStartAction<TMutationCtx, z.infer<TSchema>> = {
      schema,
      callback,
    };

    return new WorkItemActions<
      TMutationCtx,
      TWorkItemActionsDefinition & {
        start: WorkItemStartAction<TMutationCtx, z.infer<TSchema>>;
      }
    >({
      ...this.actions,
      start: definition,
    });
  }

  complete<TSchema extends z.ZodType>(
    schema: TSchema,
    callback: (
      ctx: WorkItemCompleteActionContext<TMutationCtx>,
      payload: z.infer<TSchema>
    ) => Promise<void>
  ) {
    const definition: WorkItemCompleteAction<TMutationCtx, z.infer<TSchema>> = {
      schema,
      callback,
    };

    return new WorkItemActions<
      TMutationCtx,
      TWorkItemActionsDefinition & {
        complete: WorkItemCompleteAction<TMutationCtx, z.infer<TSchema>>;
      }
    >({
      ...this.actions,
      complete: definition,
    });
  }

  fail<TSchema extends z.ZodType>(
    schema: TSchema,
    callback: (
      ctx: WorkItemFailActionContext<TMutationCtx>,
      payload: z.infer<TSchema>
    ) => Promise<void>
  ) {
    const definition: WorkItemFailAction<TMutationCtx, z.infer<TSchema>> = {
      schema,
      callback,
    };

    return new WorkItemActions<
      TMutationCtx,
      TWorkItemActionsDefinition & {
        fail: WorkItemFailAction<TMutationCtx, z.infer<TSchema>>;
      }
    >({
      ...this.actions,
      fail: definition,
    });
  }

  cancel<TSchema extends z.ZodType>(
    schema: TSchema,
    callback: (
      ctx: WorkItemCancelActionContext<TMutationCtx>,
      payload: z.infer<TSchema>
    ) => Promise<void>
  ) {
    const definition: WorkItemCancelAction<TMutationCtx, z.infer<TSchema>> = {
      schema,
      callback,
    };

    return new WorkItemActions<
      TMutationCtx,
      TWorkItemActionsDefinition & {
        cancel: WorkItemCancelAction<TMutationCtx, z.infer<TSchema>>;
      }
    >({
      ...this.actions,
      cancel: definition,
    });
  }

  /**
   * Define a custom reset action with a typed payload.
   *
   * The reset action transitions a work item from `started` back to `initialized`,
   * enabling retry scenarios without failing the work item.
   *
   * @param schema - Zod schema for validating the reset payload
   * @param callback - Handler called when reset is invoked
   *
   * @example
   * ```typescript
   * .reset(
   *   z.object({ reason: z.string() }),
   *   async ({ workItem }, payload) => {
   *     console.log(`Resetting due to: ${payload.reason}`)
   *     await workItem.reset()
   *   }
   * )
   * ```
   */
  reset<TSchema extends z.ZodType>(
    schema: TSchema,
    callback: (
      ctx: WorkItemResetActionContext<TMutationCtx>,
      payload: z.infer<TSchema>
    ) => Promise<void>
  ) {
    const definition: WorkItemResetAction<TMutationCtx, z.infer<TSchema>> = {
      schema,
      callback,
    };

    return new WorkItemActions<
      TMutationCtx,
      TWorkItemActionsDefinition & {
        reset: WorkItemResetAction<TMutationCtx, z.infer<TSchema>>;
      }
    >({
      ...this.actions,
      reset: definition,
    });
  }
}

export function makeWorkItemActions<
  TMutationCtx extends GenericMutationCtx<any>,
>() {
  return function () {
    return WorkItemActions.make<TMutationCtx>();
  };
}
