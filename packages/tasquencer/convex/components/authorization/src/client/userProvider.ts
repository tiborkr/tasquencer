import type { GenericMutationCtx } from "convex/server";
import { PolicyException, PolicyResult } from "./service/policy";

export type AnyAuthorizationUserProvider = AuthorizationUserProvider<any, any>;
export type GetAuthorizationUserProviderUser<T> =
  T extends AuthorizationUserProvider<any, infer U> ? U : never;

export class AuthorizationUserProvider<
  TMutationCtx extends GenericMutationCtx<any>,
  TUser,
> {
  static initialize<TMutationCtx extends GenericMutationCtx<any>>() {
    return {
      withGetUser: <TGetUserFn extends (ctx: TMutationCtx) => Promise<any>>(
        getUserFn: TGetUserFn
      ) => ({
        withUserToUserId: <
          TGetUserIdFn extends (
            user: NonNullable<Awaited<ReturnType<TGetUserFn>>>
          ) => string,
        >(
          getUserIdFn: TGetUserIdFn
        ) => {
          return new AuthorizationUserProvider<
            TMutationCtx,
            NonNullable<Awaited<ReturnType<TGetUserFn>>>
          >(getUserFn, getUserIdFn);
        },
      }),
    };
  }
  constructor(
    private readonly getUserFn: (
      ctx: TMutationCtx
    ) => Promise<TUser | null | undefined>,
    private readonly getUserIdFromUserFn: (user: NonNullable<TUser>) => string
  ) {}
  async getUser(ctx: TMutationCtx) {
    const user = await this.getUserFn(ctx);

    if (!user) {
      throw new PolicyException("Authentication required", PolicyResult.DENY);
    }

    return user;
  }
  async getUserId(ctx: TMutationCtx) {
    const user = await this.getUser(ctx);
    return this.getUserIdFromUserFn(user);
  }
  getUserIdFromUser(user: NonNullable<TUser>) {
    return this.getUserIdFromUserFn(user);
  }
}
