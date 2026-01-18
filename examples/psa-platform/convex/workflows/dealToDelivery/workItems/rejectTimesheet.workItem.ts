/**
 * RejectTimesheet Work Item
 *
 * Reject time entries with feedback for correction.
 *
 * Entry condition: reviewTimesheet completed with decision = "reject"
 * Exit condition: Time entries status = "Rejected", routed to reviseTimesheet
 *
 * Reference: .review/recipes/psa-platform/specs/09-workflow-timesheet-approval.md
 */
import { Builder } from "../../../tasquencer";
import { z } from "zod";
import { zid } from "convex-helpers/server/zod4";
import { startAndClaimWorkItem, cleanupWorkItemOnCancel } from "./helpers";
import { initializeDealWorkItemAuth, updateWorkItemMetadataPayload } from "./helpersAuth";
import { authService } from "../../../authorization";
import { authComponent } from "../../../auth";
import { getTimeEntry, rejectTimeEntryWithRevisionTracking } from "../db/timeEntries";
import { getRootWorkflowAndDealForWorkItem } from "../db/workItemContext";
import { assertTimeEntryExists, assertAuthenticatedUser } from "../exceptions";
import { DealToDeliveryWorkItemHelpers } from "../helpers";
import { MAX_REVISION_CYCLES } from "../db/revisionCycle";

// Policy: Requires 'dealToDelivery:time:approve' scope (approvers can also reject)
const timeApprovePolicy = authService.policies.requireScope(
  "dealToDelivery:time:approve"
);

/**
 * Actions for the rejectTimesheet work item.
 *
 * - initialize: Sets up work item metadata with time entry context
 * - start: Claims the work item for the reviewer
 * - complete: Rejects time entries with feedback
 * - fail: Marks the work item as failed
 */
const rejectTimesheetWorkItemActions = authService.builders.workItemActions
  .initialize(
    z.object({
      timeEntryIds: z.array(zid("timeEntries")).min(1),
    }),
    timeApprovePolicy,
    async ({ mutationCtx, workItem }, payload) => {
      const workItemId = await workItem.initialize();

      // Get deal from workflow context for metadata
      const { deal } = await getRootWorkflowAndDealForWorkItem(
        mutationCtx.db,
        workItemId
      );

      // Validate time entries exist
      for (const timeEntryId of payload.timeEntryIds) {
        const timeEntry = await getTimeEntry(mutationCtx.db, timeEntryId);
        assertTimeEntryExists(timeEntry, { timeEntryId });
      }

      await initializeDealWorkItemAuth(mutationCtx, workItemId, {
        scope: "dealToDelivery:time:approve",
        dealId: deal._id,
        payload: {
          type: "rejectTimesheet",
          taskName: "Reject Timesheet",
          priority: "normal",
        },
      });
    }
  )
  .start(z.never(), timeApprovePolicy, async ({ mutationCtx, workItem }) => {
    await startAndClaimWorkItem(mutationCtx, workItem);
  })
  .complete(
    z.object({
      timeEntryIds: z.array(zid("timeEntries")).min(1),
      comments: z.string().min(1, "Rejection reason is required"),
    }),
    timeApprovePolicy,
    async ({ mutationCtx, workItem }, payload) => {
      const authUser = await authComponent.safeGetAuthUser(mutationCtx);
      assertAuthenticatedUser(authUser, {
        operation: "rejectTimesheet:complete",
        workItemId: workItem.id,
      });


      // Track if any entries need escalation
      let anyEscalated = false;
      const rejectionResults: Array<{ entryId: string; revisionCount: number; escalated: boolean }> = [];

      // Reject each time entry with revision tracking
      for (const timeEntryId of payload.timeEntryIds) {
        const timeEntry = await getTimeEntry(mutationCtx.db, timeEntryId);
        assertTimeEntryExists(timeEntry, { timeEntryId });

        // Validate entry is in correct status
        if (timeEntry.status !== "Submitted") {
          throw new Error(
            `Time entry must be in Submitted status to reject. Entry ${timeEntryId} has status: ${timeEntry.status}`
          );
        }

        // Reject with revision tracking (per spec 09-workflow-timesheet-approval.md line 281)
        const result = await rejectTimeEntryWithRevisionTracking(
          mutationCtx.db,
          timeEntryId,
          payload.comments,
          MAX_REVISION_CYCLES
        );

        rejectionResults.push({
          entryId: timeEntryId,
          revisionCount: result.newRevisionCount,
          escalated: result.escalated,
        });

        if (result.escalated) {
          anyEscalated = true;
        }
      }

      // Update work item metadata with escalation status
      const metadata = await DealToDeliveryWorkItemHelpers.getWorkItemMetadata(
        mutationCtx.db,
        workItem.id
      );
      if (metadata) {
        await updateWorkItemMetadataPayload(mutationCtx, workItem.id, {
          type: "rejectTimesheet",
          taskName: anyEscalated ? "Reject Timesheet (Escalated to Admin)" : "Reject Timesheet",
          priority: anyEscalated ? "high" : "normal",
        });
      }

      // TODO: Notify team member that their timesheet was rejected with comments
      // If escalated, also notify admin (per spec 09-workflow-timesheet-approval.md line 281)
      // (deferred:timesheet-approval-notifications)

      await workItem.complete();
    }
  )
  .fail(z.any().optional(), timeApprovePolicy, async ({ workItem }) => {
    await workItem.fail();
  });

/**
 * The rejectTimesheet work item with actions and lifecycle activities.
 */
export const rejectTimesheetWorkItem = Builder.workItem("rejectTimesheet")
  .withActions(rejectTimesheetWorkItemActions.build())
  .withActivities({
    onCanceled: async ({ mutationCtx, workItem }) => {
      await cleanupWorkItemOnCancel(mutationCtx, workItem.id);
    },
    onFailed: async ({ mutationCtx, workItem }) => {
      await cleanupWorkItemOnCancel(mutationCtx, workItem.id);
    },
  });

/**
 * The rejectTimesheet task.
 */
export const rejectTimesheetTask = Builder.task(rejectTimesheetWorkItem);
