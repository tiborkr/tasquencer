import type {
  GenericDatabaseReader,
  GenericDataModel,
  GenericMutationCtx,
} from "convex/server";
import * as Builder from "./builder";

export { Builder };
export { startBusinessTrace } from "./audit/integration";
export { withSpan } from "../components/audit/src/client/helpers";
export { getAuditService } from "../components/audit/src/client/service";
export type { AuditContext } from "../components/audit/src/shared/context";
export { versionManagerFor, type VersionManager } from "./versionManager";
import { makeWorkItemMetadataHelpersForTable } from "../components/authorization/src/client/builders";
import type { ComponentApi as AuditComponentApi } from "../components/audit/src/component/_generated/component";
import type { ComponentApi as AuthorizationComponentApi } from "../components/authorization/src/component/_generated/component";
import { makeVersionManagerFor } from "./versionManager";
import { AuthorizationService } from "../components/authorization/src/client/service";
import { AuthorizationUserProvider } from "../components/authorization/src/client/userProvider";
import { assertWorkflowExists, assertWorkItemExists } from "./exceptions";
import type { Id } from "../_generated/dataModel";

function makeHelpers<TDataModel extends GenericDataModel>() {
  const getRootWorkflowId = async (
    db: GenericDatabaseReader<TDataModel>,
    workflowId: Id<"tasquencerWorkflows">
  ) => {
    const workflow = await db.get(workflowId);
    assertWorkflowExists(workflow, workflowId);
    // realizedPath[0] is always the root workflow ID
    // For root workflows without a parent, realizedPath[0] is the workflow itself
    return (
      (workflow.realizedPath[0] as Id<"tasquencerWorkflows">) || workflowId
    );
  };

  const getRootWorkflowIdForWorkItem = async (
    db: GenericDatabaseReader<TDataModel>,
    workItemId: Id<"tasquencerWorkItems">
  ) => {
    const workItem = await db.get(workItemId);
    assertWorkItemExists(workItem, workItemId);
    return workItem.realizedPath[0] as Id<"tasquencerWorkflows">;
  };

  const getWorkflowIdForWorkItem = async (
    db: GenericDatabaseReader<TDataModel>,
    workItemId: Id<"tasquencerWorkItems">
  ) => {
    const workItem = await db.get(workItemId);
    assertWorkItemExists(workItem, workItemId);
    return workItem.parent.workflowId as Id<"tasquencerWorkflows">;
  };

  return {
    getRootWorkflowId,
    getRootWorkflowIdForWorkItem,
    getWorkflowIdForWorkItem,
  };
}

export class Tasquencer<TDataModel extends GenericDataModel> {
  static initialize<TDataModel extends GenericDataModel>(
    auditComponent: AuditComponentApi,
    authorizationComponent: AuthorizationComponentApi
  ) {
    return new Tasquencer<TDataModel>(auditComponent, authorizationComponent);
  }

  constructor(
    readonly auditComponent: AuditComponentApi,
    readonly authorizationComponent: AuthorizationComponentApi
  ) {}

  build() {
    return {
      Builder: Builder.makeBuilder<GenericMutationCtx<TDataModel>>(),
      versionManagerFor: makeVersionManagerFor(this.auditComponent),
      Authorization: {
        workItemMetadataHelpersForTable:
          makeWorkItemMetadataHelpersForTable<TDataModel>(
            this.authorizationComponent
          ),
        Service: AuthorizationService.initialize<
          GenericMutationCtx<TDataModel>
        >(this.authorizationComponent),
        UserProvider:
          AuthorizationUserProvider.initialize<
            GenericMutationCtx<TDataModel>
          >(),
      },
      helpers: makeHelpers<TDataModel>(),
    };
  }
}
