/**
 * InvoiceTimeAndMaterials Work Item
 *
 * Create a draft invoice from logged time and expenses not yet invoiced.
 *
 * Entry condition: selectInvoicingMethod completed with method = "TimeAndMaterials"
 * Exit condition: Draft invoice created with line items from time entries and expenses
 *
 * Reference: .review/recipes/psa-platform/specs/11-workflow-invoice-generation.md
 */
import { Builder } from "../../../tasquencer";
import { z } from "zod";
import { zid } from "convex-helpers/server/zod4";
import { startAndClaimWorkItem, cleanupWorkItemOnCancel } from "./helpers";
import { initializeDealWorkItemAuth, updateWorkItemMetadataPayload } from "./helpersAuth";
import { authService } from "../../../authorization";
import { authComponent } from "../../../auth";
import { getProject } from "../db/projects";
import { getBudgetByProjectId, listServicesByBudget } from "../db/budgets";
import { listBillableUninvoicedTimeEntries } from "../db/timeEntries";
import { listBillableUninvoicedExpenses } from "../db/expenses";
import { insertInvoice, insertInvoiceLineItem, recalculateInvoiceTotals } from "../db/invoices";
import { getRootWorkflowAndDealForWorkItem } from "../db/workItemContext";
import { assertProjectExists, assertAuthenticatedUser } from "../exceptions";
import type { Id, Doc } from "../../../_generated/dataModel";

// Policy: Requires 'dealToDelivery:invoices:create' scope
const invoicesCreatePolicy = authService.policies.requireScope(
  "dealToDelivery:invoices:create"
);

/**
 * Actions for the invoiceTimeAndMaterials work item.
 */
const invoiceTimeAndMaterialsWorkItemActions = authService.builders.workItemActions
  .initialize(
    z.object({
      projectId: zid("projects"),
    }),
    invoicesCreatePolicy,
    async ({ mutationCtx, workItem }, payload) => {
      const workItemId = await workItem.initialize();

      // Get deal from workflow context for metadata
      const { deal } = await getRootWorkflowAndDealForWorkItem(
        mutationCtx.db,
        workItemId
      );

      // Validate project exists
      const project = await getProject(mutationCtx.db, payload.projectId);
      assertProjectExists(project, { projectId: payload.projectId });

      await initializeDealWorkItemAuth(mutationCtx, workItemId, {
        scope: "dealToDelivery:invoices:create",
        dealId: deal._id,
        payload: {
          type: "invoiceTimeAndMaterials",
          taskName: "Create Time & Materials Invoice",
          priority: "normal",
        },
      });
    }
  )
  .start(z.never(), invoicesCreatePolicy, async ({ mutationCtx, workItem }) => {
    await startAndClaimWorkItem(mutationCtx, workItem);
  })
  .complete(
    z.object({
      projectId: zid("projects"),
      dateRange: z.object({
        startDate: z.number(),
        endDate: z.number(),
      }).optional(),
      includeExpenses: z.boolean().default(true),
      groupBy: z.enum(["service", "task", "date", "person"]).default("service"),
      detailLevel: z.enum(["summary", "detailed"]).default("summary"),
    }),
    invoicesCreatePolicy,
    async ({ mutationCtx, workItem }, payload) => {
      const authUser = await authComponent.safeGetAuthUser(mutationCtx);
      assertAuthenticatedUser(authUser, {
        operation: "invoiceTimeAndMaterials:complete",
        workItemId: workItem.id,
      });

      // Get project and validate
      const project = await getProject(mutationCtx.db, payload.projectId);
      assertProjectExists(project, { projectId: payload.projectId });

      const budget = await getBudgetByProjectId(mutationCtx.db, payload.projectId);
      if (!budget) {
        throw new Error("Project must have a budget for T&M invoicing");
      }

      // Get billable, uninvoiced time entries
      let timeEntries = await listBillableUninvoicedTimeEntries(
        mutationCtx.db,
        payload.projectId
      );

      // Filter by date range if specified
      if (payload.dateRange) {
        timeEntries = timeEntries.filter(
          (e) => e.date >= payload.dateRange!.startDate && e.date <= payload.dateRange!.endDate
        );
      }

      // Get services for rate lookup
      const services = await listServicesByBudget(mutationCtx.db, budget._id);
      const serviceMap = new Map(services.map((s) => [s._id, s]));

      // Create the draft invoice
      const invoiceId = await insertInvoice(mutationCtx.db, {
        organizationId: project.organizationId,
        projectId: payload.projectId,
        companyId: project.companyId,
        status: "Draft",
        method: "TimeAndMaterials",
        subtotal: 0,
        tax: 0,
        total: 0,
        dueDate: Date.now() + 30 * 24 * 60 * 60 * 1000,
        createdAt: Date.now(),
      });

      // Group time entries and create line items
      if (payload.groupBy === "service") {
        // Group by service
        const byService = new Map<string, Doc<"timeEntries">[]>();
        for (const entry of timeEntries) {
          const key = entry.serviceId?.toString() ?? "unassigned";
          if (!byService.has(key)) {
            byService.set(key, []);
          }
          byService.get(key)!.push(entry);
        }

        for (const [serviceKey, entries] of byService) {
          const totalHours = entries.reduce((sum, e) => sum + e.hours, 0);
          const serviceId = serviceKey !== "unassigned" ? (serviceKey as Id<"services">) : undefined;
          const service = serviceId ? serviceMap.get(serviceId) : undefined;
          const rate = service?.rate ?? 0;
          const amount = Math.round(totalHours * rate);

          await insertInvoiceLineItem(mutationCtx.db, {
            invoiceId,
            description: service?.name ?? "Professional Services",
            quantity: totalHours,
            rate,
            amount,
            sortOrder: 0,
            timeEntryIds: entries.map((e) => e._id),
          });
        }
      } else {
        // Create individual line items for each entry (detailed view)
        for (const entry of timeEntries) {
          const serviceId = entry.serviceId;
          const service = serviceId ? serviceMap.get(serviceId) : undefined;
          const rate = service?.rate ?? 0;
          const amount = Math.round(entry.hours * rate);

          await insertInvoiceLineItem(mutationCtx.db, {
            invoiceId,
            description: entry.notes ?? service?.name ?? "Professional Services",
            quantity: entry.hours,
            rate,
            amount,
            sortOrder: 0,
            timeEntryIds: [entry._id],
          });
        }
      }

      // Add expenses if requested
      if (payload.includeExpenses) {
        const expenses = await listBillableUninvoicedExpenses(
          mutationCtx.db,
          payload.projectId
        );

        for (const expense of expenses) {
          const markupRate = expense.markupRate ?? 1.0;
          const amount = Math.round(expense.amount * markupRate);

          await insertInvoiceLineItem(mutationCtx.db, {
            invoiceId,
            description: `Expense: ${expense.description}`,
            quantity: 1,
            rate: expense.amount,
            amount,
            sortOrder: 0,
            expenseIds: [expense._id],
          });
        }
      }

      // Recalculate totals
      await recalculateInvoiceTotals(mutationCtx.db, invoiceId);

      // Update work item metadata with invoice reference
      await updateWorkItemMetadataPayload(mutationCtx, workItem.id, {
        type: "invoiceTimeAndMaterials",
        taskName: "Create Time & Materials Invoice",
        priority: "normal",
      });

      await workItem.complete();
    }
  )
  .fail(z.any().optional(), invoicesCreatePolicy, async ({ workItem }) => {
    await workItem.fail();
  });

/**
 * The invoiceTimeAndMaterials work item with actions and lifecycle activities.
 */
export const invoiceTimeAndMaterialsWorkItem = Builder.workItem("invoiceTimeAndMaterials")
  .withActions(invoiceTimeAndMaterialsWorkItemActions.build())
  .withActivities({
    onCanceled: async ({ mutationCtx, workItem }) => {
      await cleanupWorkItemOnCancel(mutationCtx, workItem.id);
    },
    onFailed: async ({ mutationCtx, workItem }) => {
      await cleanupWorkItemOnCancel(mutationCtx, workItem.id);
    },
  });

/**
 * The invoiceTimeAndMaterials task.
 */
export const invoiceTimeAndMaterialsTask = Builder.task(invoiceTimeAndMaterialsWorkItem);
