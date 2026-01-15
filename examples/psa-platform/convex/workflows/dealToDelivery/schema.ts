// Deal To Delivery Workflow Schema
// ================================
// Defines all domain tables and work item metadata for the PSA platform.

import { defineTable } from 'convex/server'
import { v } from 'convex/values'
import { defineWorkItemMetadataTable } from '@repo/tasquencer'

// ============================================================================
// ORGANIZATION & USERS
// ============================================================================

const organizations = defineTable({
  name: v.string(),
  settings: v.any(), // Organization-level settings (JSON)
  createdAt: v.number(),
})

const users = defineTable({
  organizationId: v.id('organizations'),
  email: v.string(),
  name: v.string(),
  role: v.string(), // References permission set
  costRate: v.number(), // Internal hourly cost rate in cents
  billRate: v.number(), // Default external billing rate in cents
  skills: v.array(v.string()), // Array of skill tags
  department: v.string(),
  location: v.string(),
  isActive: v.boolean(),
})
  .index('by_organization', ['organizationId'])
  .index('by_email', ['organizationId', 'email'])

// ============================================================================
// COMPANIES & CONTACTS
// ============================================================================

const companies = defineTable({
  organizationId: v.id('organizations'),
  name: v.string(),
  billingAddress: v.object({
    street: v.string(),
    city: v.string(),
    state: v.string(),
    postalCode: v.string(),
    country: v.string(),
  }),
  paymentTerms: v.number(), // Payment terms in days (default 30)
  defaultRateCardId: v.optional(v.id('rateCards')), // FK to rate cards (optional for new companies)
})
  .index('by_organization', ['organizationId'])

const contacts = defineTable({
  companyId: v.id('companies'),
  organizationId: v.id('organizations'),
  name: v.string(),
  email: v.string(),
  phone: v.string(),
  isPrimary: v.boolean(),
})
  .index('by_company', ['companyId'])
  .index('by_organization', ['organizationId'])

// ============================================================================
// DEALS & SALES PIPELINE
// ============================================================================

// Deal stages: Lead, Qualified, Disqualified, Proposal, Negotiation, Won, Lost
const dealStage = v.union(
  v.literal('Lead'),
  v.literal('Qualified'),
  v.literal('Disqualified'),
  v.literal('Proposal'),
  v.literal('Negotiation'),
  v.literal('Won'),
  v.literal('Lost')
)

const deals = defineTable({
  organizationId: v.id('organizations'),
  companyId: v.id('companies'),
  contactId: v.id('contacts'),
  name: v.string(),
  value: v.number(), // Deal value in cents
  probability: v.number(), // Win probability 0-100
  stage: dealStage,
  ownerId: v.id('users'),
  estimateId: v.optional(v.id('estimates')),
  lostReason: v.optional(v.string()),
  qualificationNotes: v.optional(v.string()),
  createdAt: v.number(),
  closedAt: v.optional(v.number()),
  workflowId: v.optional(v.id('tasquencerWorkflows')), // Link to workflow instance
})
  .index('by_organization', ['organizationId'])
  .index('by_company', ['companyId'])
  .index('by_owner', ['ownerId'])
  .index('by_stage', ['organizationId', 'stage'])
  .index('by_workflow_id', ['workflowId'])

// ============================================================================
// ESTIMATES & PROPOSALS
// ============================================================================

const estimates = defineTable({
  organizationId: v.id('organizations'),
  dealId: v.id('deals'),
  total: v.number(), // Total amount in cents
  createdAt: v.number(),
})
  .index('by_deal', ['dealId'])

const estimateServices = defineTable({
  estimateId: v.id('estimates'),
  name: v.string(),
  rate: v.number(), // Hourly rate in cents
  hours: v.number(), // Estimated hours
  total: v.number(), // Computed total
})
  .index('by_estimate', ['estimateId'])

// Proposal status: Draft, Sent, Viewed, Signed, Rejected
const proposalStatus = v.union(
  v.literal('Draft'),
  v.literal('Sent'),
  v.literal('Viewed'),
  v.literal('Signed'),
  v.literal('Rejected')
)

const proposals = defineTable({
  organizationId: v.id('organizations'),
  dealId: v.id('deals'),
  version: v.number(),
  status: proposalStatus,
  documentUrl: v.string(),
  sentAt: v.optional(v.number()),
  viewedAt: v.optional(v.number()),
  signedAt: v.optional(v.number()),
  rejectedAt: v.optional(v.number()),
  createdAt: v.number(),
})
  .index('by_deal', ['dealId'])

// ============================================================================
// PROJECTS & BUDGETS
// ============================================================================

// Project status: Planning, Active, OnHold, Completed, Archived
const projectStatus = v.union(
  v.literal('Planning'),
  v.literal('Active'),
  v.literal('OnHold'),
  v.literal('Completed'),
  v.literal('Archived')
)

const projects = defineTable({
  organizationId: v.id('organizations'),
  companyId: v.id('companies'),
  dealId: v.optional(v.id('deals')),
  name: v.string(),
  status: projectStatus,
  startDate: v.number(),
  endDate: v.optional(v.number()),
  managerId: v.id('users'),
  budgetId: v.optional(v.id('budgets')), // Made optional for creation order
  createdAt: v.number(),
  workflowId: v.optional(v.id('tasquencerWorkflows')), // Link to workflow instance
})
  .index('by_organization', ['organizationId'])
  .index('by_company', ['companyId'])
  .index('by_manager', ['managerId'])
  .index('by_status', ['organizationId', 'status'])
  .index('by_workflow_id', ['workflowId'])

// Budget type: TimeAndMaterials, FixedFee, Retainer
const budgetType = v.union(
  v.literal('TimeAndMaterials'),
  v.literal('FixedFee'),
  v.literal('Retainer')
)

const budgets = defineTable({
  projectId: v.id('projects'),
  organizationId: v.id('organizations'),
  type: budgetType,
  totalAmount: v.number(), // Total budget in cents
  createdAt: v.number(),
})
  .index('by_project', ['projectId'])

const services = defineTable({
  budgetId: v.id('budgets'),
  organizationId: v.id('organizations'),
  name: v.string(),
  rate: v.number(), // Hourly rate in cents
  estimatedHours: v.number(),
  totalAmount: v.number(), // Computed total
})
  .index('by_budget', ['budgetId'])

const milestones = defineTable({
  projectId: v.id('projects'),
  organizationId: v.id('organizations'),
  name: v.string(),
  percentage: v.number(), // Percentage of budget
  amount: v.number(), // Amount in cents
  dueDate: v.optional(v.number()),
  completedAt: v.optional(v.number()),
  invoiceId: v.optional(v.id('invoices')),
  sortOrder: v.number(),
})
  .index('by_project', ['projectId'])

// ============================================================================
// TASKS
// ============================================================================

// Task status (customizable per project, defaults)
const taskStatus = v.union(
  v.literal('Todo'),
  v.literal('InProgress'),
  v.literal('Review'),
  v.literal('Done')
)

// Task priority
const taskPriority = v.union(
  v.literal('Low'),
  v.literal('Medium'),
  v.literal('High'),
  v.literal('Urgent')
)

const tasks = defineTable({
  projectId: v.id('projects'),
  organizationId: v.id('organizations'),
  parentTaskId: v.optional(v.id('tasks')),
  name: v.string(),
  description: v.string(),
  status: taskStatus,
  assigneeIds: v.array(v.id('users')),
  dueDate: v.optional(v.number()),
  estimatedHours: v.optional(v.number()),
  priority: taskPriority,
  dependencies: v.array(v.id('tasks')),
  sortOrder: v.number(),
  createdAt: v.number(),
})
  .index('by_project', ['projectId'])
  .index('by_parent', ['parentTaskId'])
  .index('by_organization', ['organizationId'])

// ============================================================================
// RESOURCE PLANNING & BOOKINGS
// ============================================================================

// Booking type: Tentative, Confirmed, TimeOff
const bookingType = v.union(
  v.literal('Tentative'),
  v.literal('Confirmed'),
  v.literal('TimeOff')
)

const bookings = defineTable({
  organizationId: v.id('organizations'),
  userId: v.id('users'),
  projectId: v.optional(v.id('projects')), // Required unless type = TimeOff
  taskId: v.optional(v.id('tasks')),
  type: bookingType,
  startDate: v.number(),
  endDate: v.number(),
  hoursPerDay: v.number(),
  notes: v.optional(v.string()),
  createdAt: v.number(),
})
  .index('by_user', ['userId'])
  .index('by_project', ['projectId'])
  .index('by_date_range', ['organizationId', 'startDate', 'endDate'])

// ============================================================================
// TIME TRACKING
// ============================================================================

// Time entry status: Draft, Submitted, Approved, Rejected, Locked
const timeEntryStatus = v.union(
  v.literal('Draft'),
  v.literal('Submitted'),
  v.literal('Approved'),
  v.literal('Rejected'),
  v.literal('Locked')
)

const timeEntries = defineTable({
  organizationId: v.id('organizations'),
  userId: v.id('users'),
  projectId: v.id('projects'),
  taskId: v.optional(v.id('tasks')),
  serviceId: v.optional(v.id('services')),
  date: v.number(),
  hours: v.number(), // Hours worked (decimal)
  billable: v.boolean(),
  status: timeEntryStatus,
  notes: v.optional(v.string()),
  approvedBy: v.optional(v.id('users')),
  approvedAt: v.optional(v.number()),
  rejectionComments: v.optional(v.string()),
  invoiceId: v.optional(v.id('invoices')),
  createdAt: v.number(),
})
  .index('by_user', ['userId'])
  .index('by_project', ['projectId'])
  .index('by_date', ['organizationId', 'date'])
  .index('by_status', ['organizationId', 'status'])
  .index('by_user_date', ['userId', 'date'])

// ============================================================================
// EXPENSE TRACKING
// ============================================================================

// Expense type: Software, Travel, Materials, Subcontractor, Other
const expenseType = v.union(
  v.literal('Software'),
  v.literal('Travel'),
  v.literal('Materials'),
  v.literal('Subcontractor'),
  v.literal('Other')
)

// Expense status: Draft, Submitted, Approved, Rejected
const expenseStatus = v.union(
  v.literal('Draft'),
  v.literal('Submitted'),
  v.literal('Approved'),
  v.literal('Rejected')
)

const expenses = defineTable({
  organizationId: v.id('organizations'),
  userId: v.id('users'),
  projectId: v.id('projects'),
  type: expenseType,
  amount: v.number(), // Amount in cents
  currency: v.string(), // Currency code (e.g., "USD")
  billable: v.boolean(),
  markupRate: v.optional(v.number()), // Markup multiplier
  receiptUrl: v.optional(v.string()),
  status: expenseStatus,
  date: v.number(),
  description: v.string(),
  approvedBy: v.optional(v.id('users')),
  approvedAt: v.optional(v.number()),
  rejectionComments: v.optional(v.string()),
  invoiceId: v.optional(v.id('invoices')),
  vendorInfo: v.optional(v.object({
    name: v.string(),
    taxId: v.optional(v.string()),
  })),
  createdAt: v.number(),
})
  .index('by_user', ['userId'])
  .index('by_project', ['projectId'])
  .index('by_status', ['organizationId', 'status'])

// ============================================================================
// INVOICING & PAYMENTS
// ============================================================================

// Invoice status: Draft, Finalized, Sent, Viewed, Paid, Void
const invoiceStatus = v.union(
  v.literal('Draft'),
  v.literal('Finalized'),
  v.literal('Sent'),
  v.literal('Viewed'),
  v.literal('Paid'),
  v.literal('Void')
)

// Invoice method: TimeAndMaterials, FixedFee, Milestone, Recurring
const invoiceMethod = v.union(
  v.literal('TimeAndMaterials'),
  v.literal('FixedFee'),
  v.literal('Milestone'),
  v.literal('Recurring')
)

const invoices = defineTable({
  organizationId: v.id('organizations'),
  projectId: v.id('projects'),
  companyId: v.id('companies'),
  number: v.optional(v.string()), // Invoice number (set on finalize)
  status: invoiceStatus,
  method: invoiceMethod,
  subtotal: v.number(), // Subtotal in cents
  tax: v.number(), // Tax amount in cents
  total: v.number(), // Total in cents
  dueDate: v.number(),
  sentAt: v.optional(v.number()),
  viewedAt: v.optional(v.number()),
  paidAt: v.optional(v.number()),
  finalizedAt: v.optional(v.number()),
  finalizedBy: v.optional(v.id('users')),
  createdAt: v.number(),
})
  .index('by_project', ['projectId'])
  .index('by_company', ['companyId'])
  .index('by_status', ['organizationId', 'status'])
  .index('by_number', ['organizationId', 'number'])

const invoiceLineItems = defineTable({
  invoiceId: v.id('invoices'),
  description: v.string(),
  quantity: v.number(), // Quantity (hours or units)
  rate: v.number(), // Rate in cents
  amount: v.number(), // Total amount in cents
  timeEntryIds: v.optional(v.array(v.id('timeEntries'))),
  expenseIds: v.optional(v.array(v.id('expenses'))),
  sortOrder: v.number(),
})
  .index('by_invoice', ['invoiceId'])

const payments = defineTable({
  organizationId: v.id('organizations'),
  invoiceId: v.id('invoices'),
  amount: v.number(), // Payment amount in cents
  date: v.number(),
  method: v.string(), // Payment method
  reference: v.optional(v.string()),
  syncedToAccounting: v.boolean(),
  createdAt: v.number(),
})
  .index('by_invoice', ['invoiceId'])

// ============================================================================
// RATE CARDS
// ============================================================================

const rateCards = defineTable({
  organizationId: v.id('organizations'),
  name: v.string(),
  isDefault: v.boolean(),
  createdAt: v.number(),
})
  .index('by_organization', ['organizationId'])

const rateCardItems = defineTable({
  rateCardId: v.id('rateCards'),
  serviceName: v.string(),
  rate: v.number(), // Hourly rate in cents
})
  .index('by_rate_card', ['rateCardId'])

// ============================================================================
// CHANGE ORDERS
// ============================================================================

// Change order status: Pending, Approved, Rejected
const changeOrderStatus = v.union(
  v.literal('Pending'),
  v.literal('Approved'),
  v.literal('Rejected')
)

const changeOrders = defineTable({
  organizationId: v.id('organizations'),
  projectId: v.id('projects'),
  requestedBy: v.id('users'),
  description: v.string(),
  budgetImpact: v.number(), // Budget impact in cents
  status: changeOrderStatus,
  approvedBy: v.optional(v.id('users')),
  approvedAt: v.optional(v.number()),
  createdAt: v.number(),
})
  .index('by_project', ['projectId'])

// ============================================================================
// WORK ITEM METADATA
// ============================================================================

// Work item type discriminated union - covers all 68+ work items
const workItemPayloadType = v.union(
  // Sales Phase (10)
  v.object({ type: v.literal('createDeal'), taskName: v.string(), dealId: v.optional(v.id('deals')) }),
  v.object({ type: v.literal('qualifyLead'), taskName: v.string(), dealId: v.id('deals') }),
  v.object({ type: v.literal('disqualifyLead'), taskName: v.string(), dealId: v.id('deals') }),
  v.object({ type: v.literal('createEstimate'), taskName: v.string(), dealId: v.id('deals') }),
  v.object({ type: v.literal('createProposal'), taskName: v.string(), dealId: v.id('deals') }),
  v.object({ type: v.literal('sendProposal'), taskName: v.string(), proposalId: v.id('proposals') }),
  v.object({ type: v.literal('negotiateTerms'), taskName: v.string(), dealId: v.id('deals') }),
  v.object({ type: v.literal('reviseProposal'), taskName: v.string(), proposalId: v.id('proposals') }),
  v.object({ type: v.literal('getProposalSigned'), taskName: v.string(), proposalId: v.id('proposals') }),
  v.object({ type: v.literal('archiveDeal'), taskName: v.string(), dealId: v.id('deals') }),

  // Planning Phase (2)
  v.object({ type: v.literal('createProject'), taskName: v.string(), dealId: v.id('deals') }),
  v.object({ type: v.literal('setBudget'), taskName: v.string(), projectId: v.id('projects') }),

  // Resource Planning (7)
  v.object({ type: v.literal('viewTeamAvailability'), taskName: v.string(), projectId: v.id('projects') }),
  v.object({ type: v.literal('filterBySkillsRole'), taskName: v.string(), projectId: v.id('projects') }),
  v.object({ type: v.literal('recordPlannedTimeOff'), taskName: v.string(), userId: v.id('users') }),
  v.object({ type: v.literal('createBookings'), taskName: v.string(), projectId: v.id('projects') }),
  v.object({ type: v.literal('reviewBookings'), taskName: v.string(), projectId: v.id('projects') }),
  v.object({ type: v.literal('checkConfirmationNeeded'), taskName: v.string(), projectId: v.id('projects') }),
  v.object({ type: v.literal('confirmBookings'), taskName: v.string(), projectId: v.id('projects') }),

  // Execution Phase (5)
  v.object({ type: v.literal('createAndAssignTasks'), taskName: v.string(), projectId: v.id('projects') }),
  v.object({ type: v.literal('monitorBudgetBurn'), taskName: v.string(), projectId: v.id('projects') }),
  v.object({ type: v.literal('pauseWork'), taskName: v.string(), projectId: v.id('projects') }),
  v.object({ type: v.literal('requestChangeOrder'), taskName: v.string(), projectId: v.id('projects') }),
  v.object({ type: v.literal('getChangeOrderApproval'), taskName: v.string(), changeOrderId: v.id('changeOrders') }),

  // Sequential/Parallel/Conditional Execution (9)
  v.object({ type: v.literal('getNextTask'), taskName: v.string(), projectId: v.id('projects') }),
  v.object({ type: v.literal('executeTask'), taskName: v.string(), taskId: v.id('tasks') }),
  v.object({ type: v.literal('completeTask'), taskName: v.string(), taskId: v.id('tasks') }),
  v.object({ type: v.literal('initParallelTasks'), taskName: v.string(), projectId: v.id('projects') }),
  v.object({ type: v.literal('executeParallelTask'), taskName: v.string(), taskId: v.id('tasks') }),
  v.object({ type: v.literal('syncParallelTasks'), taskName: v.string(), projectId: v.id('projects') }),
  v.object({ type: v.literal('evaluateCondition'), taskName: v.string(), projectId: v.id('projects') }),
  v.object({ type: v.literal('executePrimaryBranch'), taskName: v.string(), projectId: v.id('projects') }),
  v.object({ type: v.literal('executeAlternateBranch'), taskName: v.string(), projectId: v.id('projects') }),

  // Time Tracking (6)
  v.object({ type: v.literal('selectEntryMethod'), taskName: v.string(), userId: v.id('users'), projectId: v.id('projects') }),
  v.object({ type: v.literal('useTimer'), taskName: v.string(), userId: v.id('users'), projectId: v.id('projects') }),
  v.object({ type: v.literal('manualEntry'), taskName: v.string(), userId: v.id('users'), projectId: v.id('projects') }),
  v.object({ type: v.literal('importFromCalendar'), taskName: v.string(), userId: v.id('users'), projectId: v.id('projects') }),
  v.object({ type: v.literal('autoFromBookings'), taskName: v.string(), userId: v.id('users'), projectId: v.id('projects') }),
  v.object({ type: v.literal('submitTimeEntry'), taskName: v.string(), timeEntryId: v.id('timeEntries') }),

  // Expense Tracking (10)
  v.object({ type: v.literal('selectExpenseType'), taskName: v.string(), userId: v.id('users'), projectId: v.id('projects') }),
  v.object({ type: v.literal('logSoftwareExpense'), taskName: v.string(), userId: v.id('users'), projectId: v.id('projects') }),
  v.object({ type: v.literal('logTravelExpense'), taskName: v.string(), userId: v.id('users'), projectId: v.id('projects') }),
  v.object({ type: v.literal('logMaterialsExpense'), taskName: v.string(), userId: v.id('users'), projectId: v.id('projects') }),
  v.object({ type: v.literal('logSubcontractorExpense'), taskName: v.string(), userId: v.id('users'), projectId: v.id('projects') }),
  v.object({ type: v.literal('logOtherExpense'), taskName: v.string(), userId: v.id('users'), projectId: v.id('projects') }),
  v.object({ type: v.literal('attachReceipt'), taskName: v.string(), expenseId: v.id('expenses') }),
  v.object({ type: v.literal('markBillable'), taskName: v.string(), expenseId: v.id('expenses') }),
  v.object({ type: v.literal('setBillableRate'), taskName: v.string(), expenseId: v.id('expenses') }),
  v.object({ type: v.literal('submitExpense'), taskName: v.string(), expenseId: v.id('expenses') }),

  // Timesheet Approval (4)
  v.object({ type: v.literal('reviewTimesheet'), taskName: v.string(), userId: v.id('users'), weekStartDate: v.number() }),
  v.object({ type: v.literal('approveTimesheet'), taskName: v.string(), userId: v.id('users'), weekStartDate: v.number() }),
  v.object({ type: v.literal('rejectTimesheet'), taskName: v.string(), userId: v.id('users'), weekStartDate: v.number() }),
  v.object({ type: v.literal('reviseTimesheet'), taskName: v.string(), userId: v.id('users'), weekStartDate: v.number() }),

  // Expense Approval (4)
  v.object({ type: v.literal('reviewExpense'), taskName: v.string(), expenseId: v.id('expenses') }),
  v.object({ type: v.literal('approveExpense'), taskName: v.string(), expenseId: v.id('expenses') }),
  v.object({ type: v.literal('rejectExpense'), taskName: v.string(), expenseId: v.id('expenses') }),
  v.object({ type: v.literal('reviseExpense'), taskName: v.string(), expenseId: v.id('expenses') }),

  // Invoice Generation (8)
  v.object({ type: v.literal('selectInvoicingMethod'), taskName: v.string(), projectId: v.id('projects') }),
  v.object({ type: v.literal('invoiceTimeAndMaterials'), taskName: v.string(), projectId: v.id('projects') }),
  v.object({ type: v.literal('invoiceFixedFee'), taskName: v.string(), projectId: v.id('projects') }),
  v.object({ type: v.literal('invoiceMilestone'), taskName: v.string(), projectId: v.id('projects'), milestoneId: v.optional(v.id('milestones')) }),
  v.object({ type: v.literal('invoiceRecurring'), taskName: v.string(), projectId: v.id('projects') }),
  v.object({ type: v.literal('reviewDraft'), taskName: v.string(), invoiceId: v.id('invoices') }),
  v.object({ type: v.literal('editDraft'), taskName: v.string(), invoiceId: v.id('invoices') }),
  v.object({ type: v.literal('finalizeInvoice'), taskName: v.string(), invoiceId: v.id('invoices') }),

  // Billing Phase (6)
  v.object({ type: v.literal('sendInvoice'), taskName: v.string(), invoiceId: v.id('invoices') }),
  v.object({ type: v.literal('sendViaEmail'), taskName: v.string(), invoiceId: v.id('invoices') }),
  v.object({ type: v.literal('sendViaPdf'), taskName: v.string(), invoiceId: v.id('invoices') }),
  v.object({ type: v.literal('sendViaPortal'), taskName: v.string(), invoiceId: v.id('invoices') }),
  v.object({ type: v.literal('recordPayment'), taskName: v.string(), invoiceId: v.id('invoices') }),
  v.object({ type: v.literal('checkMoreBilling'), taskName: v.string(), projectId: v.id('projects') }),

  // Close Phase (2)
  v.object({ type: v.literal('closeProject'), taskName: v.string(), projectId: v.id('projects') }),
  v.object({ type: v.literal('conductRetro'), taskName: v.string(), projectId: v.id('projects') })
)

/**
 * Work item metadata table for dealToDelivery workflow
 * Uses auth scope-based authorization
 * Links to deals table as the primary aggregate root
 */
const dealToDeliveryWorkItems = defineWorkItemMetadataTable('deals').withPayload(
  workItemPayloadType
)

// Export all tables for schema spread
export default {
  // Organization & Users
  organizations,
  users,

  // Companies & Contacts
  companies,
  contacts,

  // Deals & Sales
  deals,
  estimates,
  estimateServices,
  proposals,

  // Projects & Budgets
  projects,
  budgets,
  services,
  milestones,

  // Tasks
  tasks,

  // Resource Planning
  bookings,

  // Time Tracking
  timeEntries,

  // Expenses
  expenses,

  // Invoicing
  invoices,
  invoiceLineItems,
  payments,

  // Rate Cards
  rateCards,
  rateCardItems,

  // Change Orders
  changeOrders,

  // Work Item Metadata
  dealToDeliveryWorkItems,
}
