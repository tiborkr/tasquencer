import { v } from "convex/values";

import { defineTable } from "convex/server";
import type {
  GenericDatabaseReader,
  GenericDatabaseWriter,
  GenericDataModel,
  GenericMutationCtx,
  GenericQueryCtx,
  TableDefinition,
  TableNamesInDataModel,
} from "convex/server";
import type { GenericId, GenericValidator, Infer } from "convex/values";
import type { Doc, Id } from "../../../../_generated/dataModel";
import {
  userHasScope,
  userInGroup,
  getUserScopes,
  getUserAuthGroups,
} from "./helpers";
import type { ComponentApi } from "../component/_generated/component";

export type HumanWorkItemOffer = {
  type: "human";
  requiredScope?: string;
  requiredGroupId?: string;
};

export type AgentWorkItemOffer = {
  type: "agent";
};

export type WorkItemOffer = HumanWorkItemOffer | AgentWorkItemOffer;

export type HumanWorkItemClaim = {
  type: "human";
  userId?: string;
  at: number;
};

export type AgentWorkItemClaim = {
  type: "agent";
  at: number;
};

export type WorkItemClaim = HumanWorkItemClaim | AgentWorkItemClaim;

export function isHumanOffer(
  offer: WorkItemOffer
): offer is HumanWorkItemOffer {
  return offer.type === "human";
}

export function isHumanClaim(
  claim: WorkItemClaim | null | undefined
): claim is HumanWorkItemClaim {
  return claim?.type === "human";
}

export function defineWorkItemMetadataTable<TAggregateTableName extends string>(
  aggregateTable: TAggregateTableName
) {
  return {
    withPayload: <TValidator extends GenericValidator>(
      payloadValidator: TValidator
    ) => {
      return defineTable({
        workItemId: v.id("tasquencerWorkItems"),
        workflowName: v.string(),
        offer: v.union(
          v.object({
            type: v.literal("human"),
            requiredScope: v.optional(v.string()),
            requiredGroupId: v.optional(v.string()),
          }),
          v.object({
            type: v.literal("agent"),
          })
        ),
        claim: v.optional(
          v.union(
            v.object({
              type: v.literal("human"),
              userId: v.optional(v.string()),
              at: v.number(),
            }),
            v.object({
              type: v.literal("agent"),
              at: v.number(),
            })
          )
        ),
        aggregateTableId: v.id(aggregateTable),
        payload: payloadValidator,
      })
        .index("by_workItemId", ["workItemId"])
        .index("by_offer_type_claim", ["offer.type", "claim"])
        .index("by_claim_userId", ["claim.userId"])
        .index("by_aggregateTableId", ["aggregateTableId"])
        .index("by_workflowName_workItemId", ["workflowName", "workItemId"])
        .index("by_workflowName_offer_type_claim", [
          "workflowName",
          "offer.type",
          "claim",
        ]);
    },
  };
}

type GetTableDefinitionValidator<T> =
  T extends TableDefinition<infer U> ? U : never;
type WorkItemMetadataTableResult = Infer<
  GetTableDefinitionValidator<
    ReturnType<ReturnType<typeof defineWorkItemMetadataTable>["withPayload"]>
  >
>;

export function makeWorkItemMetadataHelpersForTable<
  const TDataModel extends GenericDataModel,
>(authorizationComponent: ComponentApi) {
  type MutationCtx = GenericMutationCtx<TDataModel>;
  type QueryCtx = GenericQueryCtx<TDataModel>;
  type DatabaseReader = GenericDatabaseReader<TDataModel>;
  type DatabaseWriter = GenericDatabaseWriter<TDataModel>;

  /**
   * Creates type-safe authorization helpers for a work item metadata table.
   *
   * TypeScript limitation: We cannot prove at compile-time that the table name
   * corresponds to a work item metadata table structure, so we use runtime
   * assertions. The caller must ensure the table was created with
   * defineWorkItemMetadataTable().withPayload().
   *
   * @param workItemMetadataTable - Name of the work item metadata table
   * @returns Authorization helper functions for that table
   */
  return function <
    const TTableName extends TableNamesInDataModel<TDataModel> &
      keyof {
        [K in TableNamesInDataModel<TDataModel> as TDataModel[K] extends {
          document: { claim?: any; workItemId?: any; offer?: any };
        }
          ? K
          : never]: true;
      },
  >(workItemMetadataTable: TTableName) {
    type MetadataDoc = WorkItemMetadataTableResult & {
      _id: GenericId<TTableName>;
      _creationTime: number;
    };

    type ExternalMetadataDoc = TDataModel[TTableName]["document"];

    // Isolated type escape hatches - only place where we use `as any`
    const queryTable = (db: DatabaseReader) => {
      return (db as any).query(workItemMetadataTable);
    };

    const patchRecord = (db: DatabaseWriter, id: any, value: any) => {
      return (db as any).patch(id, value);
    };

    const getWorkItemMetadata = async (
      db: DatabaseReader,
      workItemId: Id<"tasquencerWorkItems">
    ) => {
      const result = await queryTable(db)
        .withIndex("by_workItemId", (q: any) => q.eq("workItemId", workItemId))
        .first();

      return result as ExternalMetadataDoc | null;
    };

    const claimWorkItem = async (
      ctx: MutationCtx,
      workItemId: Id<"tasquencerWorkItems">,
      userId: string
    ): Promise<void> => {
      const metadata = await getWorkItemMetadata(ctx.db, workItemId);
      if (!metadata) throw new Error("Metadata not found");

      if (metadata.claim) {
        throw new Error("Already claimed");
      }

      if (!isHumanOffer(metadata.offer as WorkItemOffer)) {
        throw new Error("Work item is not offered to humans");
      }

      const canClaim = await canUserClaimWorkItem(ctx, userId, workItemId);
      if (!canClaim) {
        throw new Error("User cannot claim this work item");
      }

      await patchRecord(ctx.db, metadata._id, {
        claim: {
          type: "human",
          userId,
          at: Date.now(),
        },
      });
    };

    const claimWorkItemAsAgent = async (
      db: DatabaseWriter,
      workItemId: Id<"tasquencerWorkItems">
    ): Promise<void> => {
      const metadata = (await getWorkItemMetadata(
        db,
        workItemId
      )) as MetadataDoc;
      if (!metadata) throw new Error("Metadata not found");

      if (metadata.claim) {
        throw new Error("Already claimed");
      }

      if (metadata.offer.type !== "agent") {
        throw new Error("Work item is not offered to agents");
      }

      await patchRecord(db, metadata._id, {
        claim: {
          type: "agent",
          at: Date.now(),
        },
      });
    };

    const releaseWorkItem = async (
      db: DatabaseWriter,
      workItemId: Id<"tasquencerWorkItems">
    ): Promise<void> => {
      const metadata = await getWorkItemMetadata(db, workItemId);
      if (!metadata) return;

      await patchRecord(db, metadata._id, {
        claim: undefined,
      });
    };

    const getClaimedWorkItemsByUser = async (
      db: DatabaseReader,
      userId: string
    ): Promise<
      Array<{
        metadata: ExternalMetadataDoc;
        workItem: Doc<"tasquencerWorkItems"> | null;
      }>
    > => {
      const metadataItems = await queryTable(db)
        .withIndex("by_claim_userId", (q: any) => q.eq("claim.userId", userId))
        .collect();

      return await Promise.all(
        metadataItems.map(async (metadata: any) => ({
          metadata: metadata as ExternalMetadataDoc,
          workItem: (await db.get(
            metadata.workItemId
          )) as Doc<"tasquencerWorkItems"> | null,
        }))
      );
    };

    const canUserClaimWorkItem = async (
      ctx: QueryCtx | MutationCtx,
      userId: string,
      workItemId: Id<"tasquencerWorkItems">
    ): Promise<boolean> => {
      const metadata = (await getWorkItemMetadata(
        ctx.db,
        workItemId
      )) as MetadataDoc;
      if (!metadata || metadata.claim) return false;

      if (!isHumanOffer(metadata.offer)) {
        return false;
      }

      const workItem = await ctx.db.get(workItemId);
      if (!workItem || workItem.state !== "initialized") return false;

      // Check scope requirement
      if (metadata.offer.requiredScope) {
        const hasScope = await userHasScope(
          ctx,
          authorizationComponent,
          userId,
          metadata.offer.requiredScope
        );
        if (!hasScope) return false;
      }

      // Check group requirement
      if (metadata.offer.requiredGroupId) {
        const inGroup = await userInGroup(
          ctx,
          authorizationComponent,
          userId,
          metadata.offer.requiredGroupId
        );
        if (!inGroup) return false;
      }

      return true;
    };

    const getAvailableAgentWorkItems = async (
      db: DatabaseReader
    ): Promise<
      Array<{
        metadata: ExternalMetadataDoc;
        workItem: Doc<"tasquencerWorkItems"> | null;
      }>
    > => {
      const metadataItems = await queryTable(db)
        .withIndex("by_offer_type_claim", (q: any) =>
          q.eq("offer.type", "agent").eq("claim", undefined)
        )
        .collect();

      const workItems = await Promise.all(
        metadataItems.map((metadata: any) => db.get(metadata.workItemId))
      );

      return metadataItems.map((metadata: any, idx: number) => ({
        metadata: metadata as ExternalMetadataDoc,
        workItem: workItems[idx] as Doc<"tasquencerWorkItems"> | null,
      }));
    };

    const getAvailableWorkItemsForUser = async (
      ctx: QueryCtx | MutationCtx,
      userId: string
    ): Promise<
      Array<{
        metadata: ExternalMetadataDoc;
        workItem: Doc<"tasquencerWorkItems"> | null;
      }>
    > => {
      // Get all unclaimed human work items
      const allMetadata = await queryTable(ctx.db)
        .withIndex("by_offer_type_claim", (q: any) =>
          q.eq("offer.type", "human").eq("claim", undefined)
        )
        .collect();

      const userScopes = await getUserScopes(
        ctx,
        authorizationComponent,
        userId
      );
      const userGroupIds = new Set(
        await getUserAuthGroups(ctx, authorizationComponent, userId)
      );

      // Filter for items the user can claim
      const filteredMetadata: MetadataDoc[] = [];
      for (const m of allMetadata) {
        if (m.offer.type !== "human") continue;

        let canAccess = true;

        // Check scope requirement
        if (m.offer.requiredScope) {
          if (!userScopes.includes(m.offer.requiredScope)) {
            canAccess = false;
          }
        }

        // Check group requirement
        if (m.offer.requiredGroupId && canAccess) {
          if (!userGroupIds.has(m.offer.requiredGroupId)) {
            canAccess = false;
          }
        }

        if (canAccess) {
          filteredMetadata.push(m as MetadataDoc);
        }
      }

      const workItems = await Promise.all(
        filteredMetadata.map((m) => ctx.db.get(m.workItemId))
      );

      return filteredMetadata.map((metadata, idx) => ({
        metadata,
        workItem: workItems[idx] as Doc<"tasquencerWorkItems"> | null,
      }));
    };
    const getAvailableWorkItemsByWorkflow = async (
      ctx: QueryCtx | MutationCtx,
      userId: string,
      workflowName: string
    ): Promise<
      Array<{
        metadata: ExternalMetadataDoc;
        workItem: Doc<"tasquencerWorkItems"> | null;
      }>
    > => {
      const allItems = await getAvailableWorkItemsForUser(ctx, userId);

      return allItems.filter(
        ({ metadata }) => metadata.workflowName === workflowName
      );
    };

    return {
      claimWorkItem,
      claimWorkItemAsAgent,
      releaseWorkItem,
      getWorkItemMetadata,
      canUserClaimWorkItem,
      getAvailableWorkItemsForUser,
      getAvailableAgentWorkItems,
      getAvailableWorkItemsByWorkflow,
      getClaimedWorkItemsByUser,
    };
  };
}
