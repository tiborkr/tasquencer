/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin_audit from "../admin/audit.js";
import type * as admin_authorization from "../admin/authorization.js";
import type * as auth from "../auth.js";
import type * as authorization from "../authorization.js";
import type * as http from "../http.js";
import type * as scaffold from "../scaffold.js";
import type * as tasquencer from "../tasquencer.js";
import type * as workflows_campaign_approval_api from "../workflows/campaign_approval/api.js";
import type * as workflows_campaign_approval_authSetup from "../workflows/campaign_approval/authSetup.js";
import type * as workflows_campaign_approval_db from "../workflows/campaign_approval/db.js";
import type * as workflows_campaign_approval_definition from "../workflows/campaign_approval/definition.js";
import type * as workflows_campaign_approval_helpers from "../workflows/campaign_approval/helpers.js";
import type * as workflows_campaign_approval_scopes from "../workflows/campaign_approval/scopes.js";
import type * as workflows_campaign_approval_workItems_authHelpers from "../workflows/campaign_approval/workItems/authHelpers.js";
import type * as workflows_campaign_approval_workItems_budget_index from "../workflows/campaign_approval/workItems/budget/index.js";
import type * as workflows_campaign_approval_workItems_closure_index from "../workflows/campaign_approval/workItems/closure/index.js";
import type * as workflows_campaign_approval_workItems_creative_index from "../workflows/campaign_approval/workItems/creative/index.js";
import type * as workflows_campaign_approval_workItems_execution_index from "../workflows/campaign_approval/workItems/execution/index.js";
import type * as workflows_campaign_approval_workItems_initiation_index from "../workflows/campaign_approval/workItems/initiation/index.js";
import type * as workflows_campaign_approval_workItems_launch_index from "../workflows/campaign_approval/workItems/launch/index.js";
import type * as workflows_campaign_approval_workItems_strategy_index from "../workflows/campaign_approval/workItems/strategy/index.js";
import type * as workflows_campaign_approval_workItems_technical_index from "../workflows/campaign_approval/workItems/technical/index.js";
import type * as workflows_metadata from "../workflows/metadata.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "admin/audit": typeof admin_audit;
  "admin/authorization": typeof admin_authorization;
  auth: typeof auth;
  authorization: typeof authorization;
  http: typeof http;
  scaffold: typeof scaffold;
  tasquencer: typeof tasquencer;
  "workflows/campaign_approval/api": typeof workflows_campaign_approval_api;
  "workflows/campaign_approval/authSetup": typeof workflows_campaign_approval_authSetup;
  "workflows/campaign_approval/db": typeof workflows_campaign_approval_db;
  "workflows/campaign_approval/definition": typeof workflows_campaign_approval_definition;
  "workflows/campaign_approval/helpers": typeof workflows_campaign_approval_helpers;
  "workflows/campaign_approval/scopes": typeof workflows_campaign_approval_scopes;
  "workflows/campaign_approval/workItems/authHelpers": typeof workflows_campaign_approval_workItems_authHelpers;
  "workflows/campaign_approval/workItems/budget/index": typeof workflows_campaign_approval_workItems_budget_index;
  "workflows/campaign_approval/workItems/closure/index": typeof workflows_campaign_approval_workItems_closure_index;
  "workflows/campaign_approval/workItems/creative/index": typeof workflows_campaign_approval_workItems_creative_index;
  "workflows/campaign_approval/workItems/execution/index": typeof workflows_campaign_approval_workItems_execution_index;
  "workflows/campaign_approval/workItems/initiation/index": typeof workflows_campaign_approval_workItems_initiation_index;
  "workflows/campaign_approval/workItems/launch/index": typeof workflows_campaign_approval_workItems_launch_index;
  "workflows/campaign_approval/workItems/strategy/index": typeof workflows_campaign_approval_workItems_strategy_index;
  "workflows/campaign_approval/workItems/technical/index": typeof workflows_campaign_approval_workItems_technical_index;
  "workflows/metadata": typeof workflows_metadata;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  betterAuth: {
    adapter: {
      create: FunctionReference<
        "mutation",
        "internal",
        {
          input:
            | {
                data: {
                  createdAt: number;
                  displayUsername?: null | string;
                  email: string;
                  emailVerified: boolean;
                  image?: null | string;
                  isAnonymous?: null | boolean;
                  name: string;
                  phoneNumber?: null | string;
                  phoneNumberVerified?: null | boolean;
                  twoFactorEnabled?: null | boolean;
                  updatedAt: number;
                  userId?: null | string;
                  username?: null | string;
                };
                model: "user";
              }
            | {
                data: {
                  createdAt: number;
                  expiresAt: number;
                  ipAddress?: null | string;
                  token: string;
                  updatedAt: number;
                  userAgent?: null | string;
                  userId: string;
                };
                model: "session";
              }
            | {
                data: {
                  accessToken?: null | string;
                  accessTokenExpiresAt?: null | number;
                  accountId: string;
                  createdAt: number;
                  idToken?: null | string;
                  password?: null | string;
                  providerId: string;
                  refreshToken?: null | string;
                  refreshTokenExpiresAt?: null | number;
                  scope?: null | string;
                  updatedAt: number;
                  userId: string;
                };
                model: "account";
              }
            | {
                data: {
                  createdAt: number;
                  expiresAt: number;
                  identifier: string;
                  updatedAt: number;
                  value: string;
                };
                model: "verification";
              }
            | {
                data: { backupCodes: string; secret: string; userId: string };
                model: "twoFactor";
              }
            | {
                data: {
                  aaguid?: null | string;
                  backedUp: boolean;
                  counter: number;
                  createdAt?: null | number;
                  credentialID: string;
                  deviceType: string;
                  name?: null | string;
                  publicKey: string;
                  transports?: null | string;
                  userId: string;
                };
                model: "passkey";
              }
            | {
                data: {
                  clientId?: null | string;
                  clientSecret?: null | string;
                  createdAt?: null | number;
                  disabled?: null | boolean;
                  icon?: null | string;
                  metadata?: null | string;
                  name?: null | string;
                  redirectURLs?: null | string;
                  type?: null | string;
                  updatedAt?: null | number;
                  userId?: null | string;
                };
                model: "oauthApplication";
              }
            | {
                data: {
                  accessToken?: null | string;
                  accessTokenExpiresAt?: null | number;
                  clientId?: null | string;
                  createdAt?: null | number;
                  refreshToken?: null | string;
                  refreshTokenExpiresAt?: null | number;
                  scopes?: null | string;
                  updatedAt?: null | number;
                  userId?: null | string;
                };
                model: "oauthAccessToken";
              }
            | {
                data: {
                  clientId?: null | string;
                  consentGiven?: null | boolean;
                  createdAt?: null | number;
                  scopes?: null | string;
                  updatedAt?: null | number;
                  userId?: null | string;
                };
                model: "oauthConsent";
              }
            | {
                data: {
                  createdAt: number;
                  privateKey: string;
                  publicKey: string;
                };
                model: "jwks";
              }
            | {
                data: {
                  count?: null | number;
                  key?: null | string;
                  lastRequest?: null | number;
                };
                model: "rateLimit";
              };
          onCreateHandle?: string;
          select?: Array<string>;
        },
        any
      >;
      deleteMany: FunctionReference<
        "mutation",
        "internal",
        {
          input:
            | {
                model: "user";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "name"
                    | "email"
                    | "emailVerified"
                    | "image"
                    | "createdAt"
                    | "updatedAt"
                    | "twoFactorEnabled"
                    | "isAnonymous"
                    | "username"
                    | "displayUsername"
                    | "phoneNumber"
                    | "phoneNumberVerified"
                    | "userId"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "session";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "expiresAt"
                    | "token"
                    | "createdAt"
                    | "updatedAt"
                    | "ipAddress"
                    | "userAgent"
                    | "userId"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "account";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "accountId"
                    | "providerId"
                    | "userId"
                    | "accessToken"
                    | "refreshToken"
                    | "idToken"
                    | "accessTokenExpiresAt"
                    | "refreshTokenExpiresAt"
                    | "scope"
                    | "password"
                    | "createdAt"
                    | "updatedAt"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "verification";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "identifier"
                    | "value"
                    | "expiresAt"
                    | "createdAt"
                    | "updatedAt"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "twoFactor";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field: "secret" | "backupCodes" | "userId" | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "passkey";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "name"
                    | "publicKey"
                    | "userId"
                    | "credentialID"
                    | "counter"
                    | "deviceType"
                    | "backedUp"
                    | "transports"
                    | "createdAt"
                    | "aaguid"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "oauthApplication";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "name"
                    | "icon"
                    | "metadata"
                    | "clientId"
                    | "clientSecret"
                    | "redirectURLs"
                    | "type"
                    | "disabled"
                    | "userId"
                    | "createdAt"
                    | "updatedAt"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "oauthAccessToken";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "accessToken"
                    | "refreshToken"
                    | "accessTokenExpiresAt"
                    | "refreshTokenExpiresAt"
                    | "clientId"
                    | "userId"
                    | "scopes"
                    | "createdAt"
                    | "updatedAt"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "oauthConsent";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "clientId"
                    | "userId"
                    | "scopes"
                    | "createdAt"
                    | "updatedAt"
                    | "consentGiven"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "jwks";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field: "publicKey" | "privateKey" | "createdAt" | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "rateLimit";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field: "key" | "count" | "lastRequest" | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              };
          onDeleteHandle?: string;
          paginationOpts: {
            cursor: string | null;
            endCursor?: string | null;
            id?: number;
            maximumBytesRead?: number;
            maximumRowsRead?: number;
            numItems: number;
          };
        },
        any
      >;
      deleteOne: FunctionReference<
        "mutation",
        "internal",
        {
          input:
            | {
                model: "user";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "name"
                    | "email"
                    | "emailVerified"
                    | "image"
                    | "createdAt"
                    | "updatedAt"
                    | "twoFactorEnabled"
                    | "isAnonymous"
                    | "username"
                    | "displayUsername"
                    | "phoneNumber"
                    | "phoneNumberVerified"
                    | "userId"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "session";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "expiresAt"
                    | "token"
                    | "createdAt"
                    | "updatedAt"
                    | "ipAddress"
                    | "userAgent"
                    | "userId"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "account";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "accountId"
                    | "providerId"
                    | "userId"
                    | "accessToken"
                    | "refreshToken"
                    | "idToken"
                    | "accessTokenExpiresAt"
                    | "refreshTokenExpiresAt"
                    | "scope"
                    | "password"
                    | "createdAt"
                    | "updatedAt"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "verification";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "identifier"
                    | "value"
                    | "expiresAt"
                    | "createdAt"
                    | "updatedAt"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "twoFactor";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field: "secret" | "backupCodes" | "userId" | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "passkey";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "name"
                    | "publicKey"
                    | "userId"
                    | "credentialID"
                    | "counter"
                    | "deviceType"
                    | "backedUp"
                    | "transports"
                    | "createdAt"
                    | "aaguid"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "oauthApplication";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "name"
                    | "icon"
                    | "metadata"
                    | "clientId"
                    | "clientSecret"
                    | "redirectURLs"
                    | "type"
                    | "disabled"
                    | "userId"
                    | "createdAt"
                    | "updatedAt"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "oauthAccessToken";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "accessToken"
                    | "refreshToken"
                    | "accessTokenExpiresAt"
                    | "refreshTokenExpiresAt"
                    | "clientId"
                    | "userId"
                    | "scopes"
                    | "createdAt"
                    | "updatedAt"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "oauthConsent";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "clientId"
                    | "userId"
                    | "scopes"
                    | "createdAt"
                    | "updatedAt"
                    | "consentGiven"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "jwks";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field: "publicKey" | "privateKey" | "createdAt" | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "rateLimit";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field: "key" | "count" | "lastRequest" | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              };
          onDeleteHandle?: string;
        },
        any
      >;
      findMany: FunctionReference<
        "query",
        "internal",
        {
          limit?: number;
          model:
            | "user"
            | "session"
            | "account"
            | "verification"
            | "twoFactor"
            | "passkey"
            | "oauthApplication"
            | "oauthAccessToken"
            | "oauthConsent"
            | "jwks"
            | "rateLimit";
          offset?: number;
          paginationOpts: {
            cursor: string | null;
            endCursor?: string | null;
            id?: number;
            maximumBytesRead?: number;
            maximumRowsRead?: number;
            numItems: number;
          };
          sortBy?: { direction: "asc" | "desc"; field: string };
          where?: Array<{
            connector?: "AND" | "OR";
            field: string;
            operator?:
              | "lt"
              | "lte"
              | "gt"
              | "gte"
              | "eq"
              | "in"
              | "not_in"
              | "ne"
              | "contains"
              | "starts_with"
              | "ends_with";
            value:
              | string
              | number
              | boolean
              | Array<string>
              | Array<number>
              | null;
          }>;
        },
        any
      >;
      findOne: FunctionReference<
        "query",
        "internal",
        {
          model:
            | "user"
            | "session"
            | "account"
            | "verification"
            | "twoFactor"
            | "passkey"
            | "oauthApplication"
            | "oauthAccessToken"
            | "oauthConsent"
            | "jwks"
            | "rateLimit";
          select?: Array<string>;
          where?: Array<{
            connector?: "AND" | "OR";
            field: string;
            operator?:
              | "lt"
              | "lte"
              | "gt"
              | "gte"
              | "eq"
              | "in"
              | "not_in"
              | "ne"
              | "contains"
              | "starts_with"
              | "ends_with";
            value:
              | string
              | number
              | boolean
              | Array<string>
              | Array<number>
              | null;
          }>;
        },
        any
      >;
      migrationRemoveUserId: FunctionReference<
        "mutation",
        "internal",
        { userId: string },
        any
      >;
      updateMany: FunctionReference<
        "mutation",
        "internal",
        {
          input:
            | {
                model: "user";
                update: {
                  createdAt?: number;
                  displayUsername?: null | string;
                  email?: string;
                  emailVerified?: boolean;
                  image?: null | string;
                  isAnonymous?: null | boolean;
                  name?: string;
                  phoneNumber?: null | string;
                  phoneNumberVerified?: null | boolean;
                  twoFactorEnabled?: null | boolean;
                  updatedAt?: number;
                  userId?: null | string;
                  username?: null | string;
                };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "name"
                    | "email"
                    | "emailVerified"
                    | "image"
                    | "createdAt"
                    | "updatedAt"
                    | "twoFactorEnabled"
                    | "isAnonymous"
                    | "username"
                    | "displayUsername"
                    | "phoneNumber"
                    | "phoneNumberVerified"
                    | "userId"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "session";
                update: {
                  createdAt?: number;
                  expiresAt?: number;
                  ipAddress?: null | string;
                  token?: string;
                  updatedAt?: number;
                  userAgent?: null | string;
                  userId?: string;
                };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "expiresAt"
                    | "token"
                    | "createdAt"
                    | "updatedAt"
                    | "ipAddress"
                    | "userAgent"
                    | "userId"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "account";
                update: {
                  accessToken?: null | string;
                  accessTokenExpiresAt?: null | number;
                  accountId?: string;
                  createdAt?: number;
                  idToken?: null | string;
                  password?: null | string;
                  providerId?: string;
                  refreshToken?: null | string;
                  refreshTokenExpiresAt?: null | number;
                  scope?: null | string;
                  updatedAt?: number;
                  userId?: string;
                };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "accountId"
                    | "providerId"
                    | "userId"
                    | "accessToken"
                    | "refreshToken"
                    | "idToken"
                    | "accessTokenExpiresAt"
                    | "refreshTokenExpiresAt"
                    | "scope"
                    | "password"
                    | "createdAt"
                    | "updatedAt"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "verification";
                update: {
                  createdAt?: number;
                  expiresAt?: number;
                  identifier?: string;
                  updatedAt?: number;
                  value?: string;
                };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "identifier"
                    | "value"
                    | "expiresAt"
                    | "createdAt"
                    | "updatedAt"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "twoFactor";
                update: {
                  backupCodes?: string;
                  secret?: string;
                  userId?: string;
                };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field: "secret" | "backupCodes" | "userId" | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "passkey";
                update: {
                  aaguid?: null | string;
                  backedUp?: boolean;
                  counter?: number;
                  createdAt?: null | number;
                  credentialID?: string;
                  deviceType?: string;
                  name?: null | string;
                  publicKey?: string;
                  transports?: null | string;
                  userId?: string;
                };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "name"
                    | "publicKey"
                    | "userId"
                    | "credentialID"
                    | "counter"
                    | "deviceType"
                    | "backedUp"
                    | "transports"
                    | "createdAt"
                    | "aaguid"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "oauthApplication";
                update: {
                  clientId?: null | string;
                  clientSecret?: null | string;
                  createdAt?: null | number;
                  disabled?: null | boolean;
                  icon?: null | string;
                  metadata?: null | string;
                  name?: null | string;
                  redirectURLs?: null | string;
                  type?: null | string;
                  updatedAt?: null | number;
                  userId?: null | string;
                };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "name"
                    | "icon"
                    | "metadata"
                    | "clientId"
                    | "clientSecret"
                    | "redirectURLs"
                    | "type"
                    | "disabled"
                    | "userId"
                    | "createdAt"
                    | "updatedAt"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "oauthAccessToken";
                update: {
                  accessToken?: null | string;
                  accessTokenExpiresAt?: null | number;
                  clientId?: null | string;
                  createdAt?: null | number;
                  refreshToken?: null | string;
                  refreshTokenExpiresAt?: null | number;
                  scopes?: null | string;
                  updatedAt?: null | number;
                  userId?: null | string;
                };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "accessToken"
                    | "refreshToken"
                    | "accessTokenExpiresAt"
                    | "refreshTokenExpiresAt"
                    | "clientId"
                    | "userId"
                    | "scopes"
                    | "createdAt"
                    | "updatedAt"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "oauthConsent";
                update: {
                  clientId?: null | string;
                  consentGiven?: null | boolean;
                  createdAt?: null | number;
                  scopes?: null | string;
                  updatedAt?: null | number;
                  userId?: null | string;
                };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "clientId"
                    | "userId"
                    | "scopes"
                    | "createdAt"
                    | "updatedAt"
                    | "consentGiven"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "jwks";
                update: {
                  createdAt?: number;
                  privateKey?: string;
                  publicKey?: string;
                };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field: "publicKey" | "privateKey" | "createdAt" | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "rateLimit";
                update: {
                  count?: null | number;
                  key?: null | string;
                  lastRequest?: null | number;
                };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field: "key" | "count" | "lastRequest" | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              };
          onUpdateHandle?: string;
          paginationOpts: {
            cursor: string | null;
            endCursor?: string | null;
            id?: number;
            maximumBytesRead?: number;
            maximumRowsRead?: number;
            numItems: number;
          };
        },
        any
      >;
      updateOne: FunctionReference<
        "mutation",
        "internal",
        {
          input:
            | {
                model: "user";
                update: {
                  createdAt?: number;
                  displayUsername?: null | string;
                  email?: string;
                  emailVerified?: boolean;
                  image?: null | string;
                  isAnonymous?: null | boolean;
                  name?: string;
                  phoneNumber?: null | string;
                  phoneNumberVerified?: null | boolean;
                  twoFactorEnabled?: null | boolean;
                  updatedAt?: number;
                  userId?: null | string;
                  username?: null | string;
                };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "name"
                    | "email"
                    | "emailVerified"
                    | "image"
                    | "createdAt"
                    | "updatedAt"
                    | "twoFactorEnabled"
                    | "isAnonymous"
                    | "username"
                    | "displayUsername"
                    | "phoneNumber"
                    | "phoneNumberVerified"
                    | "userId"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "session";
                update: {
                  createdAt?: number;
                  expiresAt?: number;
                  ipAddress?: null | string;
                  token?: string;
                  updatedAt?: number;
                  userAgent?: null | string;
                  userId?: string;
                };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "expiresAt"
                    | "token"
                    | "createdAt"
                    | "updatedAt"
                    | "ipAddress"
                    | "userAgent"
                    | "userId"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "account";
                update: {
                  accessToken?: null | string;
                  accessTokenExpiresAt?: null | number;
                  accountId?: string;
                  createdAt?: number;
                  idToken?: null | string;
                  password?: null | string;
                  providerId?: string;
                  refreshToken?: null | string;
                  refreshTokenExpiresAt?: null | number;
                  scope?: null | string;
                  updatedAt?: number;
                  userId?: string;
                };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "accountId"
                    | "providerId"
                    | "userId"
                    | "accessToken"
                    | "refreshToken"
                    | "idToken"
                    | "accessTokenExpiresAt"
                    | "refreshTokenExpiresAt"
                    | "scope"
                    | "password"
                    | "createdAt"
                    | "updatedAt"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "verification";
                update: {
                  createdAt?: number;
                  expiresAt?: number;
                  identifier?: string;
                  updatedAt?: number;
                  value?: string;
                };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "identifier"
                    | "value"
                    | "expiresAt"
                    | "createdAt"
                    | "updatedAt"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "twoFactor";
                update: {
                  backupCodes?: string;
                  secret?: string;
                  userId?: string;
                };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field: "secret" | "backupCodes" | "userId" | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "passkey";
                update: {
                  aaguid?: null | string;
                  backedUp?: boolean;
                  counter?: number;
                  createdAt?: null | number;
                  credentialID?: string;
                  deviceType?: string;
                  name?: null | string;
                  publicKey?: string;
                  transports?: null | string;
                  userId?: string;
                };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "name"
                    | "publicKey"
                    | "userId"
                    | "credentialID"
                    | "counter"
                    | "deviceType"
                    | "backedUp"
                    | "transports"
                    | "createdAt"
                    | "aaguid"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "oauthApplication";
                update: {
                  clientId?: null | string;
                  clientSecret?: null | string;
                  createdAt?: null | number;
                  disabled?: null | boolean;
                  icon?: null | string;
                  metadata?: null | string;
                  name?: null | string;
                  redirectURLs?: null | string;
                  type?: null | string;
                  updatedAt?: null | number;
                  userId?: null | string;
                };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "name"
                    | "icon"
                    | "metadata"
                    | "clientId"
                    | "clientSecret"
                    | "redirectURLs"
                    | "type"
                    | "disabled"
                    | "userId"
                    | "createdAt"
                    | "updatedAt"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "oauthAccessToken";
                update: {
                  accessToken?: null | string;
                  accessTokenExpiresAt?: null | number;
                  clientId?: null | string;
                  createdAt?: null | number;
                  refreshToken?: null | string;
                  refreshTokenExpiresAt?: null | number;
                  scopes?: null | string;
                  updatedAt?: null | number;
                  userId?: null | string;
                };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "accessToken"
                    | "refreshToken"
                    | "accessTokenExpiresAt"
                    | "refreshTokenExpiresAt"
                    | "clientId"
                    | "userId"
                    | "scopes"
                    | "createdAt"
                    | "updatedAt"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "oauthConsent";
                update: {
                  clientId?: null | string;
                  consentGiven?: null | boolean;
                  createdAt?: null | number;
                  scopes?: null | string;
                  updatedAt?: null | number;
                  userId?: null | string;
                };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "clientId"
                    | "userId"
                    | "scopes"
                    | "createdAt"
                    | "updatedAt"
                    | "consentGiven"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "jwks";
                update: {
                  createdAt?: number;
                  privateKey?: string;
                  publicKey?: string;
                };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field: "publicKey" | "privateKey" | "createdAt" | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "rateLimit";
                update: {
                  count?: null | number;
                  key?: null | string;
                  lastRequest?: null | number;
                };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field: "key" | "count" | "lastRequest" | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              };
          onUpdateHandle?: string;
        },
        any
      >;
    };
    adapterTest: {
      count: FunctionReference<"query", "internal", any, any>;
      create: FunctionReference<"mutation", "internal", any, any>;
      delete: FunctionReference<"mutation", "internal", any, any>;
      deleteMany: FunctionReference<"mutation", "internal", any, any>;
      findMany: FunctionReference<"query", "internal", any, any>;
      findOne: FunctionReference<"query", "internal", any, any>;
      update: FunctionReference<"mutation", "internal", any, any>;
      updateMany: FunctionReference<"mutation", "internal", any, any>;
    };
  };
  tasquencerAudit: {
    api: {
      computeWorkflowSnapshot: FunctionReference<
        "mutation",
        "internal",
        { retryCount?: number; timestamp: number; traceId: string },
        null
      >;
      flushTracePayload: FunctionReference<
        "mutation",
        "internal",
        { spans: Array<any>; trace?: any },
        null
      >;
      getAuditContext: FunctionReference<
        "query",
        "internal",
        { workflowId: string },
        {
          _creationTime: number;
          _id: string;
          context: any;
          createdAt: number;
          traceId: string;
          traceMetadata?: any;
          workflowId: string;
        } | null
      >;
      getChildSpans: FunctionReference<
        "query",
        "internal",
        { parentSpanId: string; traceId: string },
        Array<{
          _creationTime: number;
          _id: string;
          attributes?:
            | {
                parent?: {
                  taskGeneration: number;
                  taskName: string;
                  workflowId: string;
                };
                payload?: any;
                state?: string;
                type: "workflow";
                versionName: string;
                workflowId?: string;
                workflowName: string;
              }
            | {
                generation: number;
                inputConditions?: Array<{ marking: number; name: string }>;
                joinSatisfied?: boolean;
                joinType?: string;
                outputConditions?: Array<string>;
                splitType?: string;
                state?: string;
                type: "task";
                versionName: string;
                workflowId: string;
              }
            | {
                delta: number;
                newMarking: number;
                oldMarking: number;
                operation: "incrementMarking" | "decrementMarking";
                type: "condition";
                workflowId: string;
              }
            | {
                parent: {
                  taskGeneration: number;
                  taskName: string;
                  workflowId: string;
                };
                payload?: any;
                state?: string;
                type: "workItem";
                versionName: string;
                workflowId: string;
              }
            | {
                activityName: string;
                data?: any;
                type: "activity";
                workflowId: string;
              }
            | { payload: any; type: "custom" };
          causationId?: string;
          depth: number;
          duration?: number;
          endedAt?: number;
          error?: any;
          events?: any;
          operation: string;
          operationType: string;
          parentSpanId?: string;
          path: Array<string>;
          resourceId?: string;
          resourceName?: string;
          resourceType?: string;
          sequenceNumber?: number;
          spanId: string;
          startedAt: number;
          state: "started" | "completed" | "failed" | "canceled";
          traceId: string;
        }>
      >;
      getChildWorkflowInstances: FunctionReference<
        "query",
        "internal",
        {
          taskName: string;
          timestamp: number;
          traceId: string;
          workflowName?: string;
        },
        Array<{
          endedAt?: number;
          generation: number;
          startedAt: number;
          state: string;
          workflowId: string;
          workflowName: string;
        }>
      >;
      getKeyEvents: FunctionReference<
        "query",
        "internal",
        { traceId: string },
        Array<{
          category: "workflow" | "task" | "condition" | "workItem" | "error";
          depth: number;
          description: string;
          spanId: string;
          timestamp: number;
          type: string;
          workflowName?: string;
        }>
      >;
      getRootSpans: FunctionReference<
        "query",
        "internal",
        { traceId: string },
        Array<{
          _creationTime: number;
          _id: string;
          attributes?:
            | {
                parent?: {
                  taskGeneration: number;
                  taskName: string;
                  workflowId: string;
                };
                payload?: any;
                state?: string;
                type: "workflow";
                versionName: string;
                workflowId?: string;
                workflowName: string;
              }
            | {
                generation: number;
                inputConditions?: Array<{ marking: number; name: string }>;
                joinSatisfied?: boolean;
                joinType?: string;
                outputConditions?: Array<string>;
                splitType?: string;
                state?: string;
                type: "task";
                versionName: string;
                workflowId: string;
              }
            | {
                delta: number;
                newMarking: number;
                oldMarking: number;
                operation: "incrementMarking" | "decrementMarking";
                type: "condition";
                workflowId: string;
              }
            | {
                parent: {
                  taskGeneration: number;
                  taskName: string;
                  workflowId: string;
                };
                payload?: any;
                state?: string;
                type: "workItem";
                versionName: string;
                workflowId: string;
              }
            | {
                activityName: string;
                data?: any;
                type: "activity";
                workflowId: string;
              }
            | { payload: any; type: "custom" };
          causationId?: string;
          depth: number;
          duration?: number;
          endedAt?: number;
          error?: any;
          events?: any;
          operation: string;
          operationType: string;
          parentSpanId?: string;
          path: Array<string>;
          resourceId?: string;
          resourceName?: string;
          resourceType?: string;
          sequenceNumber?: number;
          spanId: string;
          startedAt: number;
          state: "started" | "completed" | "failed" | "canceled";
          traceId: string;
        }>
      >;
      getSpansByResource: FunctionReference<
        "query",
        "internal",
        { resourceId: string; resourceType: string },
        Array<{
          _creationTime: number;
          _id: string;
          attributes?:
            | {
                parent?: {
                  taskGeneration: number;
                  taskName: string;
                  workflowId: string;
                };
                payload?: any;
                state?: string;
                type: "workflow";
                versionName: string;
                workflowId?: string;
                workflowName: string;
              }
            | {
                generation: number;
                inputConditions?: Array<{ marking: number; name: string }>;
                joinSatisfied?: boolean;
                joinType?: string;
                outputConditions?: Array<string>;
                splitType?: string;
                state?: string;
                type: "task";
                versionName: string;
                workflowId: string;
              }
            | {
                delta: number;
                newMarking: number;
                oldMarking: number;
                operation: "incrementMarking" | "decrementMarking";
                type: "condition";
                workflowId: string;
              }
            | {
                parent: {
                  taskGeneration: number;
                  taskName: string;
                  workflowId: string;
                };
                payload?: any;
                state?: string;
                type: "workItem";
                versionName: string;
                workflowId: string;
              }
            | {
                activityName: string;
                data?: any;
                type: "activity";
                workflowId: string;
              }
            | { payload: any; type: "custom" };
          causationId?: string;
          depth: number;
          duration?: number;
          endedAt?: number;
          error?: any;
          events?: any;
          operation: string;
          operationType: string;
          parentSpanId?: string;
          path: Array<string>;
          resourceId?: string;
          resourceName?: string;
          resourceType?: string;
          sequenceNumber?: number;
          spanId: string;
          startedAt: number;
          state: "started" | "completed" | "failed" | "canceled";
          traceId: string;
        }>
      >;
      getSpansByTimeRange: FunctionReference<
        "query",
        "internal",
        { endTime: number; startTime: number; traceId: string },
        Array<{
          _creationTime: number;
          _id: string;
          attributes?:
            | {
                parent?: {
                  taskGeneration: number;
                  taskName: string;
                  workflowId: string;
                };
                payload?: any;
                state?: string;
                type: "workflow";
                versionName: string;
                workflowId?: string;
                workflowName: string;
              }
            | {
                generation: number;
                inputConditions?: Array<{ marking: number; name: string }>;
                joinSatisfied?: boolean;
                joinType?: string;
                outputConditions?: Array<string>;
                splitType?: string;
                state?: string;
                type: "task";
                versionName: string;
                workflowId: string;
              }
            | {
                delta: number;
                newMarking: number;
                oldMarking: number;
                operation: "incrementMarking" | "decrementMarking";
                type: "condition";
                workflowId: string;
              }
            | {
                parent: {
                  taskGeneration: number;
                  taskName: string;
                  workflowId: string;
                };
                payload?: any;
                state?: string;
                type: "workItem";
                versionName: string;
                workflowId: string;
              }
            | {
                activityName: string;
                data?: any;
                type: "activity";
                workflowId: string;
              }
            | { payload: any; type: "custom" };
          causationId?: string;
          depth: number;
          duration?: number;
          endedAt?: number;
          error?: any;
          events?: any;
          operation: string;
          operationType: string;
          parentSpanId?: string;
          path: Array<string>;
          resourceId?: string;
          resourceName?: string;
          resourceType?: string;
          sequenceNumber?: number;
          spanId: string;
          startedAt: number;
          state: "started" | "completed" | "failed" | "canceled";
          traceId: string;
        }>
      >;
      getTrace: FunctionReference<
        "query",
        "internal",
        { traceId: string },
        {
          _creationTime: number;
          _id: string;
          attributes?:
            | {
                payload?: any;
                type: "workflow";
                versionName: string;
                workflowId: string;
                workflowName: string;
              }
            | { payload?: any; type: "custom" };
          correlationId?: string;
          endedAt?: number;
          initiatorType?: "user" | "system" | "scheduled";
          initiatorUserId?: string;
          metadata?: any;
          name: string;
          startedAt: number;
          state: "running" | "completed" | "failed" | "canceled";
          traceId: string;
        } | null
      >;
      getTraceSpans: FunctionReference<
        "query",
        "internal",
        { traceId: string },
        Array<{
          _creationTime: number;
          _id: string;
          attributes?:
            | {
                parent?: {
                  taskGeneration: number;
                  taskName: string;
                  workflowId: string;
                };
                payload?: any;
                state?: string;
                type: "workflow";
                versionName: string;
                workflowId?: string;
                workflowName: string;
              }
            | {
                generation: number;
                inputConditions?: Array<{ marking: number; name: string }>;
                joinSatisfied?: boolean;
                joinType?: string;
                outputConditions?: Array<string>;
                splitType?: string;
                state?: string;
                type: "task";
                versionName: string;
                workflowId: string;
              }
            | {
                delta: number;
                newMarking: number;
                oldMarking: number;
                operation: "incrementMarking" | "decrementMarking";
                type: "condition";
                workflowId: string;
              }
            | {
                parent: {
                  taskGeneration: number;
                  taskName: string;
                  workflowId: string;
                };
                payload?: any;
                state?: string;
                type: "workItem";
                versionName: string;
                workflowId: string;
              }
            | {
                activityName: string;
                data?: any;
                type: "activity";
                workflowId: string;
              }
            | { payload: any; type: "custom" };
          causationId?: string;
          depth: number;
          duration?: number;
          endedAt?: number;
          error?: any;
          events?: any;
          operation: string;
          operationType: string;
          parentSpanId?: string;
          path: Array<string>;
          resourceId?: string;
          resourceName?: string;
          resourceType?: string;
          sequenceNumber?: number;
          spanId: string;
          startedAt: number;
          state: "started" | "completed" | "failed" | "canceled";
          traceId: string;
        }>
      >;
      getWorkflowSnapshots: FunctionReference<
        "query",
        "internal",
        { traceId: string },
        Array<{
          _creationTime: number;
          _id: string;
          sequenceNumber: number;
          state: any;
          timestamp: number;
          traceId: string;
          workflowId: string;
        }>
      >;
      getWorkflowStateAtTime: FunctionReference<
        "query",
        "internal",
        { timestamp: number; traceId: string; workflowId?: string },
        {
          conditions: Record<
            string,
            { lastChangedAt: number; marking: number; name: string }
          >;
          sequenceNumber: number;
          tasks: Record<
            string,
            {
              generation: number;
              lastChangedAt: number;
              name: string;
              state:
                | "disabled"
                | "enabled"
                | "started"
                | "completed"
                | "failed"
                | "canceled";
            }
          >;
          timestamp: number;
          workItems: Record<
            string,
            {
              id: string;
              lastChangedAt: number;
              name: string;
              state:
                | "initialized"
                | "started"
                | "completed"
                | "failed"
                | "canceled";
              taskName: string;
            }
          >;
          workflow: {
            name: string;
            state:
              | "initialized"
              | "started"
              | "completed"
              | "failed"
              | "canceled";
          };
        } | null
      >;
      listRecentTraces: FunctionReference<
        "query",
        "internal",
        { limit?: number },
        Array<{
          _creationTime: number;
          _id: string;
          attributes?:
            | {
                payload?: any;
                type: "workflow";
                versionName: string;
                workflowId: string;
                workflowName: string;
              }
            | { payload?: any; type: "custom" };
          correlationId?: string;
          endedAt?: number;
          initiatorType?: "user" | "system" | "scheduled";
          initiatorUserId?: string;
          metadata?: any;
          name: string;
          startedAt: number;
          state: "running" | "completed" | "failed" | "canceled";
          traceId: string;
        }>
      >;
      removeAuditContext: FunctionReference<
        "mutation",
        "internal",
        { workflowId: string },
        null
      >;
      saveAuditContext: FunctionReference<
        "mutation",
        "internal",
        {
          data: {
            context: {
              causationId?: string;
              correlationId?: string;
              depth: number;
              parentSpanId?: string;
              path: Array<string>;
              traceId: string;
            };
            traceId: string;
            traceMetadata?: any;
          };
          workflowId: string;
        },
        null
      >;
    };
  };
  tasquencerAuthorization: {
    api: {
      addUserToAuthGroup: FunctionReference<
        "mutation",
        "internal",
        { expiresAt?: number; groupId: string; userId: string },
        string
      >;
      assignAuthRoleToGroup: FunctionReference<
        "mutation",
        "internal",
        { assignedBy?: string; groupId: string; roleId: string },
        string
      >;
      assignAuthRoleToUser: FunctionReference<
        "mutation",
        "internal",
        {
          assignedBy?: string;
          expiresAt?: number;
          roleId: string;
          userId: string;
        },
        string
      >;
      createAuthGroup: FunctionReference<
        "mutation",
        "internal",
        { description: string; metadata?: any; name: string },
        string
      >;
      createAuthRole: FunctionReference<
        "mutation",
        "internal",
        {
          description: string;
          metadata?: any;
          name: string;
          scopes: Array<string>;
        },
        string
      >;
      deleteAuthGroup: FunctionReference<
        "mutation",
        "internal",
        { groupId: string },
        null
      >;
      deleteAuthRole: FunctionReference<
        "mutation",
        "internal",
        { roleId: string },
        null
      >;
      getAuthGroup: FunctionReference<
        "query",
        "internal",
        { groupId: string },
        {
          _creationTime: number;
          _id: string;
          description: string;
          isActive: boolean;
          metadata?: any;
          name: string;
        } | null
      >;
      getAuthGroupByName: FunctionReference<
        "query",
        "internal",
        { name: string },
        {
          _creationTime: number;
          _id: string;
          description: string;
          isActive: boolean;
          metadata?: any;
          name: string;
        } | null
      >;
      getAuthGroupMemberCount: FunctionReference<
        "query",
        "internal",
        { groupId: string },
        number
      >;
      getAuthGroupRoles: FunctionReference<
        "query",
        "internal",
        { groupId: string },
        Array<{
          _creationTime: number;
          _id: string;
          description: string;
          isActive: boolean;
          metadata?: any;
          name: string;
          scopes: Array<string>;
        }>
      >;
      getAuthRole: FunctionReference<
        "query",
        "internal",
        { roleId: string },
        {
          _creationTime: number;
          _id: string;
          description: string;
          isActive: boolean;
          metadata?: any;
          name: string;
          scopes: Array<string>;
        } | null
      >;
      getAuthRoleByName: FunctionReference<
        "query",
        "internal",
        { name: string },
        {
          _creationTime: number;
          _id: string;
          description: string;
          isActive: boolean;
          metadata?: any;
          name: string;
          scopes: Array<string>;
        } | null
      >;
      getGroupByName: FunctionReference<
        "query",
        "internal",
        { name: string },
        {
          _creationTime: number;
          _id: string;
          description: string;
          isActive: boolean;
          metadata?: any;
          name: string;
        } | null
      >;
      getGroupMembers: FunctionReference<
        "query",
        "internal",
        { groupId: string },
        Array<string>
      >;
      getRoleByName: FunctionReference<
        "query",
        "internal",
        { name: string },
        {
          _creationTime: number;
          _id: string;
          description: string;
          isActive: boolean;
          metadata?: any;
          name: string;
          scopes: Array<string>;
        } | null
      >;
      getRoleScopes: FunctionReference<
        "query",
        "internal",
        { roleId: string },
        Array<string>
      >;
      getUserAuthGroupMemberships: FunctionReference<
        "query",
        "internal",
        { userId: string },
        Array<{
          _creationTime: number;
          _id: string;
          expiresAt?: number;
          groupId: string;
          joinedAt: number;
          userId: string;
        }>
      >;
      getUserAuthGroups: FunctionReference<
        "query",
        "internal",
        { userId: string },
        Array<{
          _creationTime: number;
          _id: string;
          description: string;
          isActive: boolean;
          metadata?: any;
          name: string;
        }>
      >;
      getUserAuthRoleAssignments: FunctionReference<
        "query",
        "internal",
        { userId: string },
        Array<{
          _creationTime: number;
          _id: string;
          assignedAt: number;
          assignedBy?: string;
          expiresAt?: number;
          roleId: string;
          userId: string;
        }>
      >;
      getUserAuthRoles: FunctionReference<
        "query",
        "internal",
        { userId: string },
        Array<{
          _creationTime: number;
          _id: string;
          description: string;
          isActive: boolean;
          metadata?: any;
          name: string;
          scopes: Array<string>;
        }>
      >;
      getUserScopes: FunctionReference<
        "query",
        "internal",
        { userId: string },
        Array<string>
      >;
      getUsersWithScope: FunctionReference<
        "query",
        "internal",
        { scope: string },
        Array<string>
      >;
      insertAuthGroupRoleAssignments: FunctionReference<
        "mutation",
        "internal",
        {
          assignments: Array<{
            assignedAt: number;
            assignedBy?: string;
            groupId: string;
            roleId: string;
          }>;
        },
        Array<string>
      >;
      insertAuthGroups: FunctionReference<
        "mutation",
        "internal",
        {
          groups: Array<{
            description: string;
            isActive: boolean;
            name: string;
          }>;
        },
        Array<string>
      >;
      insertAuthRoles: FunctionReference<
        "mutation",
        "internal",
        {
          roles: Array<{
            description: string;
            isActive: boolean;
            name: string;
            scopes: Array<string>;
          }>;
        },
        Array<string>
      >;
      listAuthGroupRoleAssignments: FunctionReference<
        "query",
        "internal",
        any,
        Array<{
          _creationTime: number;
          _id: string;
          assignedAt: number;
          assignedBy?: string;
          groupId: string;
          roleId: string;
        }>
      >;
      listAuthGroups: FunctionReference<
        "query",
        "internal",
        { isActive?: boolean },
        Array<{
          _creationTime: number;
          _id: string;
          description: string;
          isActive: boolean;
          metadata?: any;
          name: string;
        }>
      >;
      listAuthRoles: FunctionReference<
        "query",
        "internal",
        { isActive?: boolean },
        Array<{
          _creationTime: number;
          _id: string;
          description: string;
          isActive: boolean;
          metadata?: any;
          name: string;
          scopes: Array<string>;
        }>
      >;
      removeAuthRoleFromGroup: FunctionReference<
        "mutation",
        "internal",
        { groupId: string; roleId: string },
        null
      >;
      removeAuthRoleFromUser: FunctionReference<
        "mutation",
        "internal",
        { roleId: string; userId: string },
        null
      >;
      removeUserFromAuthGroup: FunctionReference<
        "mutation",
        "internal",
        { groupId: string; userId: string },
        null
      >;
      updateAuthGroup: FunctionReference<
        "mutation",
        "internal",
        {
          description?: string;
          groupId: string;
          isActive?: boolean;
          metadata?: any;
          name?: string;
        },
        null
      >;
      updateAuthRole: FunctionReference<
        "mutation",
        "internal",
        {
          description?: string;
          isActive?: boolean;
          metadata?: any;
          name?: string;
          roleId: string;
          scopes?: Array<string>;
        },
        null
      >;
      updateUserAuthGroupMemberships: FunctionReference<
        "mutation",
        "internal",
        { groupIds: Array<string>; userId: string },
        null
      >;
      updateUserAuthRoleAssignments: FunctionReference<
        "mutation",
        "internal",
        { roleIds: Array<string>; userId: string },
        null
      >;
      userInGroup: FunctionReference<
        "query",
        "internal",
        { groupId: string; userId: string },
        boolean
      >;
    };
  };
};
