import { z } from "zod/v3";
import type { GenericMutationCtx } from "convex/server";
import type {
  GenericWorkItemActions,
  WorkItemActionContext,
  WorkItemCancelAction,
  WorkItemCancelActionContext,
  WorkItemCompleteAction,
  WorkItemCompleteActionContext,
  WorkItemFailAction,
  WorkItemFailActionContext,
  WorkItemInitializeAction,
  WorkItemInitializeActionContext,
  WorkItemResetAction,
  WorkItemResetActionContext,
  WorkItemStartAction,
  WorkItemStartActionContext,
} from "../../../../../tasquencer/builder/workItem/actions";
import { WorkItemActions } from "../../../../../tasquencer/builder/workItem/actions";
import type { AuthorizationContext, WorkItemPolicy } from "./policy";
import { assertAuthorized } from "./policy";
import type { AnyAuthorizationService } from "../service";
import { PolicyException, PolicyResult } from "./policy";
import type {
  AnyAuthorizationUserProvider,
  GetAuthorizationUserProviderUser,
} from "../userProvider";

export class AuthorizedWorkItemActions<
  TAuthUserProvider extends AnyAuthorizationUserProvider,
  TMutationCtx extends GenericMutationCtx<any> = GenericMutationCtx<any>,
  TScope extends string = never,
  TWorkItemActionsDefinition = Record<never, never>,
> {
  static make<
    TAuthUserProvider extends AnyAuthorizationUserProvider,
    TMutationCtx extends GenericMutationCtx<any>,
    TScope extends string,
  >(authorizationService: AnyAuthorizationService) {
    return new AuthorizedWorkItemActions<
      TAuthUserProvider,
      TMutationCtx,
      TScope,
      Record<never, never>
    >(
      authorizationService,
      authorizationService.userProvider,
      WorkItemActions.make<TMutationCtx>().actions
    );
  }
  private constructor(
    readonly authorizationService: AnyAuthorizationService,
    readonly userProvider: TAuthUserProvider,
    readonly actions: GenericWorkItemActions<TMutationCtx, any>
  ) {}

  private extendPolicyContextWithAuthorization<TWorkItemContext extends object>(
    ctx: TWorkItemContext,
    user: NonNullable<GetAuthorizationUserProviderUser<TAuthUserProvider>>
  ) {
    return {
      ...ctx,
      authorization: {
        user: user,
        scope: <TPolicyScope extends TScope>(scope: TPolicyScope) => scope,
      },
    };
  }
  private extendActionContextWithAuthorization<TWorkItemContext extends object>(
    ctx: TWorkItemContext,
    user: NonNullable<
      GetAuthorizationUserProviderUser<TAuthUserProvider>
    > | null
  ) {
    return {
      ...ctx,
      authorization: {
        user: user,
        scope: <TPolicyScope extends TScope>(scope: TPolicyScope) => scope,
      },
    };
  }
  private wrapCallbackWithAuthorizationPolicy<
    TSchema extends z.ZodType,
    TWorkItemContext extends WorkItemActionContext<TMutationCtx, any>,
  >(
    policy: WorkItemPolicy<TAuthUserProvider, TScope, z.infer<TSchema>>,
    callback: (
      ctx: TWorkItemContext &
        AuthorizationContext<TAuthUserProvider, TScope, true>,
      payload: z.infer<TSchema>
    ) => Promise<void>
  ) {
    return async (ctx: TWorkItemContext, payload: z.infer<TSchema>) => {
      if (ctx.isInternalMutation) {
        return await callback(
          this.extendActionContextWithAuthorization(ctx, null),
          payload
        );
      }

      const user = await this.userProvider.getUser(ctx.mutationCtx);

      if (!user) {
        throw new PolicyException("Authentication required", PolicyResult.DENY);
      }

      const result = await policy(
        this.extendPolicyContextWithAuthorization(ctx, user),
        payload
      );

      assertAuthorized(result);

      await callback(
        this.extendActionContextWithAuthorization(ctx, user),
        payload
      );
    };
  }

  initialize<TSchema extends z.ZodType>(
    schema: TSchema,
    policy: WorkItemPolicy<TAuthUserProvider, TScope, z.infer<TSchema>>,
    callback: (
      ctx: WorkItemInitializeActionContext<TMutationCtx> &
        AuthorizationContext<TAuthUserProvider, TScope, true>,
      payload: z.infer<TSchema>
    ) => Promise<void>
  ) {
    const definition: WorkItemInitializeAction<
      TMutationCtx,
      z.infer<TSchema>
    > = {
      schema,
      callback: this.wrapCallbackWithAuthorizationPolicy(policy, callback),
    };

    return new AuthorizedWorkItemActions<
      TAuthUserProvider,
      TMutationCtx,
      TScope,
      TWorkItemActionsDefinition & {
        initialize: WorkItemInitializeAction<TMutationCtx, z.infer<TSchema>>;
      }
    >(this.authorizationService, this.userProvider, {
      ...this.actions,
      initialize: definition,
    });
  }

  start<TSchema extends z.ZodType>(
    schema: TSchema,
    policy: WorkItemPolicy<TAuthUserProvider, TScope, z.infer<TSchema>>,
    callback: (
      ctx: WorkItemStartActionContext<TMutationCtx> &
        AuthorizationContext<TAuthUserProvider, TScope, true>,
      payload: z.infer<TSchema>
    ) => Promise<void>
  ) {
    const definition: WorkItemStartAction<TMutationCtx, z.infer<TSchema>> = {
      schema,
      callback: this.wrapCallbackWithAuthorizationPolicy(policy, callback),
    };

    return new AuthorizedWorkItemActions<
      TAuthUserProvider,
      TMutationCtx,
      TScope,
      TWorkItemActionsDefinition & {
        start: WorkItemStartAction<TMutationCtx, z.infer<TSchema>>;
      }
    >(this.authorizationService, this.userProvider, {
      ...this.actions,
      start: definition,
    });
  }

  complete<TSchema extends z.ZodType>(
    schema: TSchema,
    policy: WorkItemPolicy<TAuthUserProvider, TScope, z.infer<TSchema>>,
    callback: (
      ctx: WorkItemCompleteActionContext<TMutationCtx> &
        AuthorizationContext<TAuthUserProvider, TScope, true>,
      payload: z.infer<TSchema>
    ) => Promise<void>
  ) {
    const definition: WorkItemCompleteAction<TMutationCtx, z.infer<TSchema>> = {
      schema,
      callback: this.wrapCallbackWithAuthorizationPolicy(policy, callback),
    };

    return new AuthorizedWorkItemActions<
      TAuthUserProvider,
      TMutationCtx,
      TScope,
      TWorkItemActionsDefinition & {
        complete: WorkItemCompleteAction<TMutationCtx, z.infer<TSchema>>;
      }
    >(this.authorizationService, this.userProvider, {
      ...this.actions,
      complete: definition,
    });
  }

  fail<TSchema extends z.ZodType>(
    schema: TSchema,
    policy: WorkItemPolicy<TAuthUserProvider, TScope, z.infer<TSchema>>,
    callback: (
      ctx: WorkItemFailActionContext<TMutationCtx> &
        AuthorizationContext<TAuthUserProvider, TScope, true>,
      payload: z.infer<TSchema>
    ) => Promise<void>
  ) {
    const definition: WorkItemFailAction<TMutationCtx, z.infer<TSchema>> = {
      schema,
      callback: this.wrapCallbackWithAuthorizationPolicy(policy, callback),
    };

    return new AuthorizedWorkItemActions<
      TAuthUserProvider,
      TMutationCtx,
      TScope,
      TWorkItemActionsDefinition & {
        fail: WorkItemFailAction<TMutationCtx, z.infer<TSchema>>;
      }
    >(this.authorizationService, this.userProvider, {
      ...this.actions,
      fail: definition,
    });
  }

  cancel<TSchema extends z.ZodType>(
    schema: TSchema,
    policy: WorkItemPolicy<TAuthUserProvider, TScope, z.infer<TSchema>>,
    callback: (
      ctx: WorkItemCancelActionContext<TMutationCtx> &
        AuthorizationContext<TAuthUserProvider, TScope, true>,
      payload: z.infer<TSchema>
    ) => Promise<void>
  ) {
    const definition: WorkItemCancelAction<TMutationCtx, z.infer<TSchema>> = {
      schema,
      callback: this.wrapCallbackWithAuthorizationPolicy(policy, callback),
    };

    return new AuthorizedWorkItemActions<
      TAuthUserProvider,
      TMutationCtx,
      TScope,
      TWorkItemActionsDefinition & {
        cancel: WorkItemCancelAction<TMutationCtx, z.infer<TSchema>>;
      }
    >(this.authorizationService, this.userProvider, {
      ...this.actions,
      cancel: definition,
    });
  }

  reset<TSchema extends z.ZodType>(
    schema: TSchema,
    policy: WorkItemPolicy<TAuthUserProvider, TScope, z.infer<TSchema>>,
    callback: (
      ctx: WorkItemResetActionContext<TMutationCtx> &
        AuthorizationContext<TAuthUserProvider, TScope, true>,
      payload: z.infer<TSchema>
    ) => Promise<void>
  ) {
    const definition: WorkItemResetAction<TMutationCtx, z.infer<TSchema>> = {
      schema,
      callback: this.wrapCallbackWithAuthorizationPolicy(policy, callback),
    };

    return new AuthorizedWorkItemActions<
      TAuthUserProvider,
      TMutationCtx,
      TScope,
      TWorkItemActionsDefinition & {
        reset: WorkItemResetAction<TMutationCtx, z.infer<TSchema>>;
      }
    >(this.authorizationService, this.userProvider, {
      ...this.actions,
      reset: definition,
    });
  }

  build() {
    return new WorkItemActions<TMutationCtx, TWorkItemActionsDefinition>(
      this.actions
    );
  }
}
