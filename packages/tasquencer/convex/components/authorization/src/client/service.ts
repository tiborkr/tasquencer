import type { GenericMutationCtx } from "convex/server";
import { AuthorizedWorkflowActions } from "./service/authorizedWorkflowActions";
import { AuthorizedWorkItemActions } from "./service/authorizedWorkItemActions";
import { makePolicyHelpers } from "./service/policy";
import type { AnyAuthorizationUserProvider } from "./userProvider";
import type { ComponentApi } from "../component/_generated/component";
import type {
  AnyScopeModule,
  GetScopeModuleNames,
  GetScopeModuleScopes,
  ScopeMetadata,
} from "./scopes";

export class AuthorizationServiceInit<
  TMutationCtx extends GenericMutationCtx<any>,
  TAuthUserProvider extends AnyAuthorizationUserProvider,
  TScope extends string = never,
> {
  static make<
    TMutationCtx extends GenericMutationCtx<any>,
    TAuthUserProvider extends AnyAuthorizationUserProvider,
    TScope extends string = never,
  >(
    componentApi: ComponentApi,
    userProvider: TAuthUserProvider,
    scopes: Record<string, ScopeMetadata>
  ) {
    return new AuthorizationServiceInit<
      TMutationCtx,
      TAuthUserProvider,
      TScope
    >(componentApi, userProvider, scopes);
  }

  private constructor(
    readonly componentApi: ComponentApi,
    readonly userProvider: TAuthUserProvider,
    readonly scopes: Record<string, ScopeMetadata>
  ) {}

  withScopeModule<TModule extends AnyScopeModule>(module: TModule) {
    const namespacedScopes = Object.fromEntries(
      Object.entries(module.scopes).map(([scope, metadata]) => [
        `${module.name}:${scope}`,
        metadata,
      ])
    );
    return new AuthorizationServiceInit<
      TMutationCtx,
      TAuthUserProvider,
      | TScope
      | `${GetScopeModuleNames<TModule>}:${GetScopeModuleScopes<TModule>}`
    >(this.componentApi, this.userProvider, {
      ...this.scopes,
      ...namespacedScopes,
    });
  }
  build() {
    return new AuthorizationService<TMutationCtx, TAuthUserProvider, TScope>(
      this.componentApi,
      this.userProvider,
      {
        ...this.scopes,
      }
    );
  }
}

export type GetAuthorizationServiceScopes<TAuthorizationService> =
  TAuthorizationService extends AuthorizationService<any, any, infer TScope>
    ? TScope
    : never;

export type AnyAuthorizationService = AuthorizationService<any, any, any>;

export class AuthorizationService<
  TMutationCtx extends GenericMutationCtx<any>,
  TAuthUserProvider extends AnyAuthorizationUserProvider,
  TScope extends string = never,
> {
  static initialize<TMutationCtx extends GenericMutationCtx<any>>(
    componentApi: ComponentApi
  ) {
    return {
      make: <TAuthUserProvider extends AnyAuthorizationUserProvider>(
        userProvider: TAuthUserProvider
      ) => {
        return AuthorizationServiceInit.make<
          TMutationCtx,
          TAuthUserProvider,
          never
        >(componentApi, userProvider, {});
      },
    };
  }

  readonly builders: {
    workflowActions: AuthorizedWorkflowActions<
      TAuthUserProvider,
      TMutationCtx,
      TScope
    >;
    workItemActions: AuthorizedWorkItemActions<
      TAuthUserProvider,
      TMutationCtx,
      TScope
    >;
  };

  readonly policies = makePolicyHelpers<TAuthUserProvider, TScope>(this);

  constructor(
    readonly componentApi: ComponentApi,
    readonly userProvider: TAuthUserProvider,
    readonly scopes: Record<string, ScopeMetadata>
  ) {
    this.builders = {
      workflowActions: AuthorizedWorkflowActions.make<
        TAuthUserProvider,
        TMutationCtx,
        TScope
      >(this),
      workItemActions: AuthorizedWorkItemActions.make<
        TAuthUserProvider,
        TMutationCtx,
        TScope
      >(this),
    };
  }
}
