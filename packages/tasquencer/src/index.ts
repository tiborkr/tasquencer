import { schema } from "./schema";

export {
  createSystemScopeModule,
  createScopeModule,
} from "../convex/components/authorization/src/client/scopes";
export { schema };
export { type GetAuthorizationServiceScopes } from "../convex/components/authorization/src/client/service";
export {
  type AnyAuthorizationUserProvider,
  type GetAuthorizationUserProviderUser,
} from "../convex/components/authorization/src/client/userProvider";
export type * from "../convex/components/authorization/src/client/builders";
export {
  defineWorkItemMetadataTable,
  isHumanOffer,
  isHumanClaim,
} from "../convex/components/authorization/src/client/builders";
export { makeGetWorkflowStructureQuery } from "../convex/lib/metadataHelpers";
import type {
  AuditSpansDoc as InternalAuditSpansDoc,
  AuditTracesDoc as InternalAuditTracesDoc,
} from "../convex/components/audit/src/component/types";
export type { TaskState } from "../convex/tasquencer/types";
export type { AvailableRoutes } from "../convex/tasquencer/builder/flow";
export {
  type ExtractedWorkflowStructure,
  extractWorkflowStructure,
} from "../convex/tasquencer/util/extractWorkflowStructure";

export { Tasquencer } from "../convex/tasquencer/index";

export type AuditSpansDoc = Omit<InternalAuditSpansDoc, "_id"> & {
  _id: string;
};
export type AuditTracesDoc = Omit<InternalAuditTracesDoc, "_id"> & {
  _id: string;
};
export * from "../convex/tasquencer/exceptions";
