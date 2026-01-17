/**
 * SubmitTimeEntry Work Item
 *
 * Submit time entries for manager approval.
 *
 * Entry condition: Time entry created in Draft status
 * Exit condition: Time entry status changed to "Submitted", manager notified
 *
 * Reference: .review/recipes/psa-platform/specs/07-workflow-time-tracking.md
 */
import { Builder } from "../../../tasquencer";
import { z } from "zod";
import { zid } from "convex-helpers/server/zod4";
import { startAndClaimWorkItem, cleanupWorkItemOnCancel } from "./helpers";
import { initializeDealWorkItemAuth, updateWorkItemMetadataPayload } from "./helpersAuth";
import { authService } from "../../../authorization";
import { authComponent } from "../../../auth";
import { getTimeEntry, updateTimeEntryStatus } from "../db/timeEntries";
import { getRootWorkflowAndDealForWorkItem } from "../db/workItemContext";
import { assertTimeEntryExists, assertAuthenticatedUser } from "../exceptions";
import { DealToDeliveryWorkItemHelpers } from "../helpers";
import type { Id } from "../../../_generated/dataModel";

// Policy: Requires 'dealToDelivery:time:submit' scope
const timeSubmitPolicy = authService.policies.requireScope(
  "dealToDelivery:time:submit"
);

/**
 * Actions for the submitTimeEntry work item.
 *
 * - initialize: Sets up work item metadata with time entry context
 * - start: Claims the work item for the current user
 * - complete: Changes time entry status to "Submitted"
 * - fail: Marks the work item as failed
 */
const submitTimeEntryWorkItemActions = authService.builders.workItemActions
  .initialize(
    z.object({
      timeEntryId: zid("timeEntries"),
    }),
    timeSubmitPolicy,
    async ({ mutationCtx, workItem }, payload) => {
      const workItemId = await workItem.initialize();

      // Get deal from workflow context for metadata
      const { deal } = await getRootWorkflowAndDealForWorkItem(
        mutationCtx.db,
        workItemId
      );

      // Validate time entry exists and is in Draft status
      const timeEntry = await getTimeEntry(mutationCtx.db, payload.timeEntryId);
      assertTimeEntryExists(timeEntry, { timeEntryId: payload.timeEntryId });

      if (timeEntry.status !== "Draft") {
        throw new Error(
          `Time entry must be in Draft status to submit. Current status: ${timeEntry.status}`
        );
      }

      await initializeDealWorkItemAuth(mutationCtx, workItemId, {
        scope: "dealToDelivery:time:submit",
        dealId: deal._id,
        payload: {
          type: "submitTimeEntry",
          taskName: "Submit Time Entry",
          priority: "normal",
          timeEntryId: payload.timeEntryId,
        },
      });
    }
  )
  .start(z.never(), timeSubmitPolicy, async ({ mutationCtx, workItem }) => {
    await startAndClaimWorkItem(mutationCtx, workItem);
  })
  .complete(
    z.object({
      timeEntryId: zid("timeEntries"),
    }),
    timeSubmitPolicy,
    async ({ mutationCtx, workItem }, payload) => {
      const authUser = await authComponent.safeGetAuthUser(mutationCtx);
      assertAuthenticatedUser(authUser, {
        operation: "submitTimeEntry:complete",
        workItemId: workItem.id,
      });

      const userId = authUser.userId as Id<"users">;

      // Validate time entry exists
      const timeEntry = await getTimeEntry(mutationCtx.db, payload.timeEntryId);
      assertTimeEntryExists(timeEntry, { timeEntryId: payload.timeEntryId });

      // Validate entry belongs to current user
      if (timeEntry.userId !== userId) {
        throw new Error("Cannot submit time entries for other users");
      }

      // Validate entry is in "Draft" status
      if (timeEntry.status !== "Draft") {
        throw new Error(
          `Time entry must be in Draft status to submit. Current status: ${timeEntry.status}`
        );
      }

      // Update status to "Submitted"
      await updateTimeEntryStatus(mutationCtx.db, payload.timeEntryId, "Submitted");

      // Update work item metadata with the time entry ID
      const metadata = await DealToDeliveryWorkItemHelpers.getWorkItemMetadata(
        mutationCtx.db,
        workItem.id
      );
      if (metadata) {
        await updateWorkItemMetadataPayload(mutationCtx, workItem.id, {
          type: "submitTimeEntry",
          taskName: "Submit Time Entry",
          priority: "normal",
          timeEntryId: payload.timeEntryId,
        });
      }

      // TODO: Notify project manager about submitted time entry
      // (deferred:time-tracking-notifications)

      await workItem.complete();
    }
  )
  .fail(z.any().optional(), timeSubmitPolicy, async ({ workItem }) => {
    await workItem.fail();
  });

/**
 * The submitTimeEntry work item with actions and lifecycle activities.
 */
export const submitTimeEntryWorkItem = Builder.workItem("submitTimeEntry")
  .withActions(submitTimeEntryWorkItemActions.build())
  .withActivities({
    onCanceled: async ({ mutationCtx, workItem }) => {
      await cleanupWorkItemOnCancel(mutationCtx, workItem.id);
    },
    onFailed: async ({ mutationCtx, workItem }) => {
      await cleanupWorkItemOnCancel(mutationCtx, workItem.id);
    },
  });

/**
 * The submitTimeEntry task.
 */
export const submitTimeEntryTask = Builder.task(submitTimeEntryWorkItem);
