import type { Replace } from "type-fest";

export type ScopeModuleType = "system" | "domain";

export type ScopeMetadata = {
  tags: string[];
  type: ScopeModuleType;
  description: string;
  deprecated: boolean;
};

export type GetScopeModuleScopes<TScopeModule> =
  TScopeModule extends ScopeModule<any, any, infer TScope> ? TScope : never;
export type GetScopeModuleNames<TScopeModule> =
  TScopeModule extends ScopeModule<any, infer TName, any> ? TName : never;

export type AnyScopeModule = ScopeModule<any, any, any>;

export class ScopeModule<
  TType extends ScopeModuleType,
  TName extends string,
  TScope extends string = never,
> {
  constructor(
    readonly type: TType,
    readonly name: TName,
    readonly scopes: Record<string, ScopeMetadata>
  ) {}

  withScope<TNewScope extends string>(
    scope: TNewScope & Replace<TNewScope, ":", "">,
    metadata?: Partial<ScopeMetadata>
  ) {
    const defaultMetadata: ScopeMetadata = {
      tags: [],
      description: "",
      deprecated: false,
      type: this.type,
    };
    const mergedMetadata: ScopeMetadata = { ...defaultMetadata, ...metadata };
    return new ScopeModule<TType, TName, TScope | TNewScope>(
      this.type,
      this.name,
      {
        ...this.scopes,
        [scope]: mergedMetadata,
      }
    );
  }

  withNestedModule<TModule extends ScopeModule<TType, any, any>>(
    module: TModule
  ) {
    const namespacedScopes = Object.fromEntries(
      Object.entries(module.scopes).map(([scope, metadata]) => [
        `${module.name}:${scope}`,
        metadata,
      ])
    );

    return new ScopeModule<
      TType,
      TName,
      | TScope
      | `${GetScopeModuleNames<TModule>}:${GetScopeModuleScopes<TModule>}`
    >(this.type, this.name, { ...this.scopes, ...namespacedScopes });
  }
}

export function createScopeModule<TName extends string>(
  name: TName & Replace<TName, ":", "">
) {
  return new ScopeModule<"domain", TName, never>("domain", name, {});
}

export function createSystemScopeModule<TName extends string>(
  name: TName & Replace<TName, ":", "">
) {
  return new ScopeModule<"system", TName, never>("system", name, {});
}
