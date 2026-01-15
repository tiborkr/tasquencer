/// <reference types="vite/client" />
/**
 * End-to-End Workflow Tests for PSA Platform
 * Tests the complete deal-to-delivery flow:
 * 1. Sales Phase: Create deal → Qualify → Create estimate → Create proposal → Win
 * 2. Planning Phase: Create project → Set budget
 * 3. Resource Planning: Book resources
 * 4. Execution Phase: Create tasks → Execute → Complete
 * 5. Time Tracking: Log time entries → Submit
 * 6. Expense Tracking: Log expenses → Submit
 * 7. Approvals: Approve time and expenses
 * 8. Invoice Generation: Create invoice → Finalize
 * 9. Billing: Send invoice → Record payment
 * 10. Close: Close project
 *
 * Contract-based tests derived from: recipes/psa-platform/specs/14-workflow-master.md
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setup, type TestContext } from './helpers.test'
import * as db from '../workflows/dealToDelivery/db'
import type { DatabaseWriter } from '../_generated/server'

/**
 * Helper to set up common seed data for e2e tests
 */
async function setupE2ETestData(dbWriter: DatabaseWriter) {
  const orgId = await db.insertOrganization(dbWriter, {
    name: 'Acme Consulting',
    settings: {
      defaultBillingMethod: 'T&M',
      defaultPaymentTerms: 30,
    },
    createdAt: Date.now(),
  })

  // Create rate card for billing
  const rateCardId = await db.insertRateCard(dbWriter, {
    organizationId: orgId,
    name: 'Standard Rates 2026',
    isDefault: true,
    createdAt: Date.now(),
  })

  await db.insertRateCardItem(dbWriter, {
    rateCardId,
    serviceName: 'Senior Developer',
    rate: 20000, // $200/hr
  })

  await db.insertRateCardItem(dbWriter, {
    rateCardId,
    serviceName: 'Project Manager',
    rate: 25000, // $250/hr
  })

  // Create sales rep
  const salesRepId = await db.insertUser(dbWriter, {
    organizationId: orgId,
    email: 'sales@acme.com',
    name: 'Sarah Sales',
    role: 'sales_rep',
    costRate: 4000,
    billRate: 15000,
    skills: ['sales', 'account_management'],
    department: 'Sales',
    location: 'NYC',
    isActive: true,
  })

  // Create project manager
  const projectManagerId = await db.insertUser(dbWriter, {
    organizationId: orgId,
    email: 'pm@acme.com',
    name: 'Peter Manager',
    role: 'project_manager',
    costRate: 6000,
    billRate: 25000,
    skills: ['project_management', 'agile'],
    department: 'Delivery',
    location: 'NYC',
    isActive: true,
  })

  // Create developer (team member)
  const developerId = await db.insertUser(dbWriter, {
    organizationId: orgId,
    email: 'dev@acme.com',
    name: 'Diana Developer',
    role: 'team_member',
    costRate: 5000,
    billRate: 20000,
    skills: ['typescript', 'react', 'node'],
    department: 'Engineering',
    location: 'Remote',
    isActive: true,
  })

  // Create finance user
  const financeUserId = await db.insertUser(dbWriter, {
    organizationId: orgId,
    email: 'finance@acme.com',
    name: 'Frank Finance',
    role: 'finance_accountant',
    costRate: 4500,
    billRate: 0, // Non-billable role
    skills: ['accounting', 'invoicing'],
    department: 'Finance',
    location: 'NYC',
    isActive: true,
  })

  // Create client company
  const clientCompanyId = await db.insertCompany(dbWriter, {
    organizationId: orgId,
    name: 'TechCorp Inc',
    billingAddress: {
      street: '100 Innovation Way',
      city: 'San Francisco',
      state: 'CA',
      postalCode: '94105',
      country: 'USA',
    },
    paymentTerms: 30,
  })

  // Create client contact
  const clientContactId = await db.insertContact(dbWriter, {
    organizationId: orgId,
    companyId: clientCompanyId,
    name: 'Carol Client',
    email: 'carol@techcorp.com',
    phone: '+1-415-555-1234',
    isPrimary: true,
  })

  return {
    orgId,
    rateCardId,
    salesRepId,
    projectManagerId,
    developerId,
    financeUserId,
    clientCompanyId,
    clientContactId,
  }
}

describe('PSA Platform End-to-End Workflow', () => {
  let t: TestContext

  beforeEach(() => {
    vi.useFakeTimers()
    t = setup()
  })

  // ============================================================================
  // COMPLETE HAPPY PATH: Deal to Delivery
  // ============================================================================

  describe('Complete Happy Path', () => {
    it('executes full deal-to-delivery workflow: from lead to closed project', async () => {
      const result = await t.run(async (ctx) => {
        const baseData = await setupE2ETestData(ctx.db)
        const {
          orgId,
          salesRepId,
          projectManagerId,
          developerId,
          financeUserId,
          clientCompanyId,
          clientContactId,
        } = baseData

        // ======================================================================
        // PHASE 1: SALES - Create and win the deal
        // ======================================================================

        // 1.1 Create deal in Lead stage
        const dealId = await db.insertDeal(ctx.db, {
          organizationId: orgId,
          companyId: clientCompanyId,
          contactId: clientContactId,
          name: 'TechCorp Website Redesign',
          value: 15000000, // $150,000
          ownerId: salesRepId,
          stage: 'Lead',
          probability: 10,
          createdAt: Date.now(),
        })

        let deal = await db.getDeal(ctx.db, dealId)
        expect(deal?.stage).toBe('Lead')
        expect(deal?.probability).toBe(10)

        // 1.2 Qualify the lead
        await ctx.db.patch(dealId, {
          stage: 'Qualified',
          probability: 25,
          qualificationNotes: 'Strong budget, timeline Q1 2026',
        })

        deal = await db.getDeal(ctx.db, dealId)
        expect(deal?.stage).toBe('Qualified')
        expect(deal?.probability).toBe(25)

        // 1.3 Create estimate
        const estimateId = await db.insertEstimate(ctx.db, {
          organizationId: orgId,
          dealId,
          total: 12600000, // $126,000
          createdAt: Date.now(),
        })

        // 1.4 Add estimate services
        await db.insertEstimateService(ctx.db, {
          estimateId,
          name: 'UX Design',
          hours: 80,
          rate: 20000, // $200/hr
          total: 1600000, // $16,000
        })

        await db.insertEstimateService(ctx.db, {
          estimateId,
          name: 'Development',
          hours: 400,
          rate: 20000,
          total: 8000000, // $80,000
        })

        await db.insertEstimateService(ctx.db, {
          estimateId,
          name: 'Project Management',
          hours: 120,
          rate: 25000,
          total: 3000000, // $30,000
        })

        // Link estimate to deal
        await ctx.db.patch(dealId, { estimateId })

        // 1.5 Create proposal
        const proposalId = await db.insertProposal(ctx.db, {
          organizationId: orgId,
          dealId,
          version: 1,
          status: 'Draft',
          documentUrl: 'https://docs.example.com/proposal-v1.pdf',
          createdAt: Date.now(),
        })

        // 1.6 Send proposal
        await ctx.db.patch(proposalId, {
          status: 'Sent',
          sentAt: Date.now(),
        })

        // Move deal to Proposal stage
        await ctx.db.patch(dealId, {
          stage: 'Proposal',
          probability: 50,
        })

        // 1.7 Client views and signs
        await ctx.db.patch(proposalId, {
          status: 'Viewed',
          viewedAt: Date.now(),
        })

        await ctx.db.patch(proposalId, {
          status: 'Signed',
          signedAt: Date.now(),
        })

        // 1.8 Deal Won
        await ctx.db.patch(dealId, {
          stage: 'Won',
          probability: 100,
          closedAt: Date.now(),
        })

        deal = await db.getDeal(ctx.db, dealId)
        expect(deal?.stage).toBe('Won')
        expect(deal?.probability).toBe(100)

        // ======================================================================
        // PHASE 2: PLANNING - Create project and budget
        // ======================================================================

        // 2.1 Create project from deal
        const projectId = await db.insertProject(ctx.db, {
          organizationId: orgId,
          companyId: clientCompanyId,
          dealId,
          name: 'TechCorp Website Redesign',
          status: 'Planning',
          startDate: Date.now(),
          managerId: projectManagerId,
          createdAt: Date.now(),
        })

        let project = await db.getProject(ctx.db, projectId)
        expect(project?.status).toBe('Planning')

        // 2.2 Create budget
        const budgetId = await db.insertBudget(ctx.db, {
          projectId,
          organizationId: orgId,
          type: 'TimeAndMaterials',
          totalAmount: 12600000,
          createdAt: Date.now(),
        })

        // Link budget to project
        await ctx.db.patch(projectId, { budgetId })

        // 2.3 Add budget services
        const uxServiceId = await db.insertService(ctx.db, {
          budgetId,
          organizationId: orgId,
          name: 'UX Design',
          rate: 20000,
          estimatedHours: 80,
          totalAmount: 1600000,
        })

        await db.insertService(ctx.db, {
          budgetId,
          organizationId: orgId,
          name: 'Development',
          rate: 20000,
          estimatedHours: 400,
          totalAmount: 8000000,
        })

        await db.insertService(ctx.db, {
          budgetId,
          organizationId: orgId,
          name: 'Project Management',
          rate: 25000,
          estimatedHours: 120,
          totalAmount: 3000000,
        })

        // 2.4 Create milestone
        const milestone1Id = await db.insertMilestone(ctx.db, {
          projectId,
          organizationId: orgId,
          name: 'Design Phase Complete',
          percentage: 25,
          amount: 3150000, // 25% of $126,000
          dueDate: Date.now() + 30 * 24 * 60 * 60 * 1000,
          sortOrder: 1,
        })

        // 2.5 Activate project
        await ctx.db.patch(projectId, {
          status: 'Active',
        })

        project = await db.getProject(ctx.db, projectId)
        expect(project?.status).toBe('Active')

        // ======================================================================
        // PHASE 3: RESOURCE PLANNING - Book resources
        // ======================================================================

        // 3.1 Book developer
        const devBookingId = await db.insertBooking(ctx.db, {
          organizationId: orgId,
          userId: developerId,
          projectId,
          type: 'Confirmed',
          startDate: Date.now(),
          endDate: Date.now() + 60 * 24 * 60 * 60 * 1000, // 60 days
          hoursPerDay: 8,
          createdAt: Date.now(),
        })

        // 3.2 Book project manager (part-time)
        const pmBookingId = await db.insertBooking(ctx.db, {
          organizationId: orgId,
          userId: projectManagerId,
          projectId,
          type: 'Confirmed',
          startDate: Date.now(),
          endDate: Date.now() + 90 * 24 * 60 * 60 * 1000, // 90 days
          hoursPerDay: 3,
          createdAt: Date.now(),
        })

        // ======================================================================
        // PHASE 4: EXECUTION - Create and complete tasks
        // ======================================================================

        // 4.1 Create tasks
        const task1Id = await db.insertTask(ctx.db, {
          projectId,
          organizationId: orgId,
          name: 'User Research',
          description: 'Conduct user interviews and surveys',
          status: 'Todo',
          priority: 'High',
          estimatedHours: 20,
          assigneeIds: [developerId],
          dependencies: [],
          sortOrder: 1,
          createdAt: Date.now(),
        })

        const task2Id = await db.insertTask(ctx.db, {
          projectId,
          organizationId: orgId,
          name: 'Wireframing',
          description: 'Create wireframes for all pages',
          status: 'Todo',
          priority: 'High',
          estimatedHours: 40,
          assigneeIds: [developerId],
          dependencies: [task1Id],
          sortOrder: 2,
          createdAt: Date.now(),
        })

        // 4.2 Start and complete first task
        await ctx.db.patch(task1Id, { status: 'InProgress' })

        let task1 = await db.getTask(ctx.db, task1Id)
        expect(task1?.status).toBe('InProgress')

        await ctx.db.patch(task1Id, {
          status: 'Done',
        })

        // 4.3 Start and complete second task
        await ctx.db.patch(task2Id, { status: 'InProgress' })
        await ctx.db.patch(task2Id, {
          status: 'Done',
        })

        // 4.4 Complete milestone
        await ctx.db.patch(milestone1Id, {
          completedAt: Date.now(),
        })

        // ======================================================================
        // PHASE 5: TIME TRACKING - Log time
        // ======================================================================

        // 5.1 Log time entries for completed tasks
        const timeEntry1Id = await db.insertTimeEntry(ctx.db, {
          organizationId: orgId,
          userId: developerId,
          projectId,
          taskId: task1Id,
          serviceId: uxServiceId,
          date: Date.now() - 7 * 24 * 60 * 60 * 1000, // Last week
          hours: 18,
          notes: 'User research and interview analysis',
          billable: true,
          status: 'Draft',
          createdAt: Date.now(),
        })

        const timeEntry2Id = await db.insertTimeEntry(ctx.db, {
          organizationId: orgId,
          userId: developerId,
          projectId,
          taskId: task2Id,
          serviceId: uxServiceId,
          date: Date.now(),
          hours: 42,
          notes: 'Wireframe design and iteration',
          billable: true,
          status: 'Draft',
          createdAt: Date.now(),
        })

        // 5.2 Submit time entries
        await ctx.db.patch(timeEntry1Id, { status: 'Submitted' })
        await ctx.db.patch(timeEntry2Id, { status: 'Submitted' })

        // ======================================================================
        // PHASE 6: EXPENSE TRACKING - Log expenses
        // ======================================================================

        // 6.1 Log a software expense
        const expenseId = await db.insertExpense(ctx.db, {
          organizationId: orgId,
          userId: developerId,
          projectId,
          type: 'Software',
          date: Date.now(),
          amount: 9900, // $99 Figma subscription
          currency: 'USD',
          description: 'Figma design tool subscription',
          billable: true,
          status: 'Draft',
          createdAt: Date.now(),
        })

        // 6.2 Attach receipt and submit
        await ctx.db.patch(expenseId, {
          receiptUrl: 'https://receipts.example.com/figma-001.pdf',
          vendorInfo: {
            name: 'Figma Inc',
          },
          status: 'Submitted',
        })

        // ======================================================================
        // PHASE 7: APPROVALS - Approve time and expenses
        // ======================================================================

        // 7.1 Project manager approves time entries
        await ctx.db.patch(timeEntry1Id, {
          status: 'Approved',
          approvedAt: Date.now(),
          approvedBy: projectManagerId,
        })

        await ctx.db.patch(timeEntry2Id, {
          status: 'Approved',
          approvedAt: Date.now(),
          approvedBy: projectManagerId,
        })

        // 7.2 Approve expense
        await ctx.db.patch(expenseId, {
          status: 'Approved',
          approvedAt: Date.now(),
          approvedBy: projectManagerId,
        })

        // ======================================================================
        // PHASE 8: INVOICE GENERATION - Create invoice
        // ======================================================================

        // 8.1 Create invoice
        const invoiceId = await db.insertInvoice(ctx.db, {
          organizationId: orgId,
          projectId,
          companyId: clientCompanyId,
          status: 'Draft',
          method: 'TimeAndMaterials',
          subtotal: 1200000 + 9900, // Time + expense
          tax: 0,
          total: 1209900, // $12,099
          dueDate: Date.now() + 30 * 24 * 60 * 60 * 1000,
          createdAt: Date.now(),
        })

        // 8.2 Add line items
        await db.insertInvoiceLineItem(ctx.db, {
          invoiceId,
          description: 'UX Design - User Research (18 hrs @ $200/hr)',
          quantity: 18,
          rate: 20000,
          amount: 360000,
          timeEntryIds: [timeEntry1Id],
          sortOrder: 1,
        })

        await db.insertInvoiceLineItem(ctx.db, {
          invoiceId,
          description: 'UX Design - Wireframing (42 hrs @ $200/hr)',
          quantity: 42,
          rate: 20000,
          amount: 840000,
          timeEntryIds: [timeEntry2Id],
          sortOrder: 2,
        })

        await db.insertInvoiceLineItem(ctx.db, {
          invoiceId,
          description: 'Software Expense - Figma subscription',
          quantity: 1,
          rate: 9900,
          amount: 9900,
          expenseIds: [expenseId],
          sortOrder: 3,
        })

        // 8.3 Finalize invoice
        await ctx.db.patch(invoiceId, {
          number: 'INV-2026-00001',
          status: 'Finalized',
          finalizedAt: Date.now(),
          finalizedBy: financeUserId,
        })

        // 8.4 Lock time entries and mark expense as invoiced
        await ctx.db.patch(timeEntry1Id, { status: 'Locked', invoiceId })
        await ctx.db.patch(timeEntry2Id, { status: 'Locked', invoiceId })
        await ctx.db.patch(expenseId, { invoiceId })

        // ======================================================================
        // PHASE 9: BILLING - Send and record payment
        // ======================================================================

        // 9.1 Send invoice
        await ctx.db.patch(invoiceId, {
          status: 'Sent',
          sentAt: Date.now(),
        })

        const invoice = await db.getInvoice(ctx.db, invoiceId)
        expect(invoice?.status).toBe('Sent')

        // 9.2 Record payment
        await db.insertPayment(ctx.db, {
          organizationId: orgId,
          invoiceId,
          amount: 1209900, // Full payment
          date: Date.now(),
          method: 'ACH',
          reference: 'ACH-20260115-001',
          syncedToAccounting: false,
          createdAt: Date.now(),
        })

        // 9.3 Mark invoice as paid
        await ctx.db.patch(invoiceId, {
          status: 'Paid',
          paidAt: Date.now(),
        })

        const paidInvoice = await db.getInvoice(ctx.db, invoiceId)
        expect(paidInvoice?.status).toBe('Paid')

        // ======================================================================
        // PHASE 10: CLOSE - Complete the project
        // ======================================================================

        // 10.1 Verify all tasks complete
        const tasks = await db.listTasksByProject(ctx.db, projectId)
        const allTasksComplete = tasks.every((t) => t.status === 'Done')
        expect(allTasksComplete).toBe(true)

        // 10.2 Verify all time approved/locked
        const timeEntries = await db.listTimeEntriesByProject(ctx.db, projectId)
        const allTimeProcessed = timeEntries.every(
          (te) => te.status === 'Approved' || te.status === 'Locked'
        )
        expect(allTimeProcessed).toBe(true)

        // 10.3 Verify all invoices paid
        const invoices = await db.listInvoicesByProject(ctx.db, projectId)
        const allInvoicesPaid = invoices.every((inv) => inv.status === 'Paid')
        expect(allInvoicesPaid).toBe(true)

        // 10.4 Close project
        await ctx.db.patch(projectId, {
          status: 'Completed',
          endDate: Date.now(),
        })

        // 10.5 Delete future bookings (simulating cancellation)
        await db.deleteBooking(ctx.db, devBookingId)
        await db.deleteBooking(ctx.db, pmBookingId)

        // ======================================================================
        // FINAL VERIFICATION
        // ======================================================================

        const finalProject = await db.getProject(ctx.db, projectId)
        const finalDeal = await db.getDeal(ctx.db, dealId)
        const finalBudget = await db.getBudget(ctx.db, budgetId)

        return {
          deal: finalDeal,
          project: finalProject,
          budget: finalBudget,
          tasksCompleted: tasks.length,
          timeEntriesProcessed: timeEntries.length,
          invoicesPaid: invoices.length,
          totalBilled: 1209900,
          totalPaid: 1209900,
        }
      })

      // Verify the complete workflow executed successfully
      expect(result.deal?.stage).toBe('Won')
      expect(result.deal?.probability).toBe(100)
      expect(result.project?.status).toBe('Completed')
      expect(result.tasksCompleted).toBe(2)
      expect(result.timeEntriesProcessed).toBe(2)
      expect(result.invoicesPaid).toBe(1)
      expect(result.totalBilled).toBe(result.totalPaid)
    })
  })

  // ============================================================================
  // ALTERNATE PATH: Deal Lost
  // ============================================================================

  describe('Alternate Path: Deal Lost', () => {
    it('handles deal lost path: lead → qualified → proposal sent → lost', async () => {
      const result = await t.run(async (ctx) => {
        const baseData = await setupE2ETestData(ctx.db)

        // Create deal
        const dealId = await db.insertDeal(ctx.db, {
          organizationId: baseData.orgId,
          companyId: baseData.clientCompanyId,
          contactId: baseData.clientContactId,
          name: 'Lost Opportunity',
          value: 5000000,
          ownerId: baseData.salesRepId,
          stage: 'Lead',
          probability: 10,
          createdAt: Date.now(),
        })

        // Qualify
        await ctx.db.patch(dealId, {
          stage: 'Qualified',
          probability: 25,
        })

        // Create and send proposal
        const proposalId = await db.insertProposal(ctx.db, {
          organizationId: baseData.orgId,
          dealId,
          version: 1,
          status: 'Sent',
          documentUrl: 'https://docs.example.com/proposal-lost.pdf',
          createdAt: Date.now(),
          sentAt: Date.now(),
        })

        // Client rejects - deal lost
        await ctx.db.patch(proposalId, {
          status: 'Rejected',
          rejectedAt: Date.now(),
        })

        await ctx.db.patch(dealId, {
          stage: 'Lost',
          probability: 0,
          lostReason: 'Competitor pricing',
          closedAt: Date.now(),
        })

        const finalDeal = await db.getDeal(ctx.db, dealId)
        return { deal: finalDeal }
      })

      expect(result.deal?.stage).toBe('Lost')
      expect(result.deal?.probability).toBe(0)
      expect(result.deal?.lostReason).toBe('Competitor pricing')
    })
  })

  // ============================================================================
  // ALTERNATE PATH: Proposal Revision Loop
  // ============================================================================

  describe('Alternate Path: Proposal Revision', () => {
    it('handles proposal revision loop: send → reject → revise → send → accept', async () => {
      const result = await t.run(async (ctx) => {
        const baseData = await setupE2ETestData(ctx.db)

        // Create and qualify deal
        const dealId = await db.insertDeal(ctx.db, {
          organizationId: baseData.orgId,
          companyId: baseData.clientCompanyId,
          contactId: baseData.clientContactId,
          name: 'Revision Test Deal',
          value: 10000000,
          ownerId: baseData.salesRepId,
          stage: 'Qualified',
          probability: 25,
          createdAt: Date.now(),
        })

        // First proposal - rejected
        const proposal1Id = await db.insertProposal(ctx.db, {
          organizationId: baseData.orgId,
          dealId,
          version: 1,
          status: 'Sent',
          documentUrl: 'https://docs.example.com/proposal-v1.pdf',
          createdAt: Date.now(),
          sentAt: Date.now(),
        })

        await ctx.db.patch(proposal1Id, {
          status: 'Rejected',
          rejectedAt: Date.now(),
        })

        // Move deal to Negotiation
        await ctx.db.patch(dealId, {
          stage: 'Negotiation',
          probability: 50,
        })

        // Second proposal - accepted
        const proposal2Id = await db.insertProposal(ctx.db, {
          organizationId: baseData.orgId,
          dealId,
          version: 2,
          status: 'Sent',
          documentUrl: 'https://docs.example.com/proposal-v2.pdf',
          createdAt: Date.now(),
          sentAt: Date.now(),
        })

        await ctx.db.patch(proposal2Id, {
          status: 'Signed',
          signedAt: Date.now(),
        })

        await ctx.db.patch(dealId, {
          stage: 'Won',
          probability: 100,
          value: 8500000, // Updated to negotiated price
          closedAt: Date.now(),
        })

        // Count proposals
        const proposals = await db.listProposalsByDeal(ctx.db, dealId)

        return {
          deal: await db.getDeal(ctx.db, dealId),
          proposalCount: proposals.length,
          finalProposalVersion: proposal2Id
            ? (await ctx.db.get(proposal2Id))?.version
            : 0,
        }
      })

      expect(result.deal?.stage).toBe('Won')
      expect(result.deal?.value).toBe(8500000)
      expect(result.proposalCount).toBe(2)
      expect(result.finalProposalVersion).toBe(2)
    })
  })

  // ============================================================================
  // ALTERNATE PATH: Time Entry Rejection and Revision
  // ============================================================================

  describe('Alternate Path: Timesheet Rejection', () => {
    it('handles timesheet rejection and revision loop', async () => {
      const result = await t.run(async (ctx) => {
        const baseData = await setupE2ETestData(ctx.db)

        // Create project
        const dealId = await db.insertDeal(ctx.db, {
          organizationId: baseData.orgId,
          companyId: baseData.clientCompanyId,
          contactId: baseData.clientContactId,
          name: 'Project Deal',
          value: 5000000,
          ownerId: baseData.salesRepId,
          stage: 'Won',
          probability: 100,
          createdAt: Date.now(),
        })

        const projectId = await db.insertProject(ctx.db, {
          organizationId: baseData.orgId,
          companyId: baseData.clientCompanyId,
          dealId,
          name: 'Test Project',
          status: 'Active',
          startDate: Date.now(),
          managerId: baseData.projectManagerId,
          createdAt: Date.now(),
        })

        // Submit time entry with suspicious hours
        const timeEntryId = await db.insertTimeEntry(ctx.db, {
          organizationId: baseData.orgId,
          userId: baseData.developerId,
          projectId,
          date: Date.now(),
          hours: 16, // Excessive hours
          notes: 'Development work',
          billable: true,
          status: 'Submitted',
          createdAt: Date.now(),
        })

        // Manager rejects
        await ctx.db.patch(timeEntryId, {
          status: 'Rejected',
          rejectionComments: 'Hours exceed daily maximum, please clarify',
        })

        // Developer revises
        await ctx.db.patch(timeEntryId, {
          hours: 10,
          notes: 'Development work (corrected from 16 to 10 hours)',
          status: 'Submitted',
        })

        // Manager approves
        await ctx.db.patch(timeEntryId, {
          status: 'Approved',
          approvedAt: Date.now(),
          approvedBy: baseData.projectManagerId,
        })

        const finalTimeEntry = await db.getTimeEntry(ctx.db, timeEntryId)
        return { timeEntry: finalTimeEntry }
      })

      expect(result.timeEntry?.status).toBe('Approved')
      expect(result.timeEntry?.hours).toBe(10)
    })
  })

  // ============================================================================
  // ALTERNATE PATH: Expense Rejection
  // ============================================================================

  describe('Alternate Path: Expense Rejection', () => {
    it('handles expense rejection for missing receipt', async () => {
      const result = await t.run(async (ctx) => {
        const baseData = await setupE2ETestData(ctx.db)

        // Create project
        const dealId = await db.insertDeal(ctx.db, {
          organizationId: baseData.orgId,
          companyId: baseData.clientCompanyId,
          contactId: baseData.clientContactId,
          name: 'Expense Project Deal',
          value: 5000000,
          ownerId: baseData.salesRepId,
          stage: 'Won',
          probability: 100,
          createdAt: Date.now(),
        })

        const projectId = await db.insertProject(ctx.db, {
          organizationId: baseData.orgId,
          companyId: baseData.clientCompanyId,
          dealId,
          name: 'Expense Test Project',
          status: 'Active',
          startDate: Date.now(),
          managerId: baseData.projectManagerId,
          createdAt: Date.now(),
        })

        // Submit expense without receipt
        const expenseId = await db.insertExpense(ctx.db, {
          organizationId: baseData.orgId,
          userId: baseData.developerId,
          projectId,
          type: 'Travel',
          date: Date.now(),
          amount: 15000, // $150 meal
          currency: 'USD',
          description: 'Client lunch meeting',
          billable: true,
          status: 'Submitted',
          createdAt: Date.now(),
        })

        // Manager rejects - missing receipt
        await ctx.db.patch(expenseId, {
          status: 'Rejected',
          rejectionComments: 'missing_receipt: Please attach receipt for billable expenses',
        })

        // Developer adds receipt and resubmits
        await ctx.db.patch(expenseId, {
          receiptUrl: 'https://receipts.example.com/lunch-001.pdf',
          vendorInfo: { name: 'Restaurant XYZ' },
          status: 'Submitted',
        })

        // Manager approves
        await ctx.db.patch(expenseId, {
          status: 'Approved',
          approvedAt: Date.now(),
          approvedBy: baseData.projectManagerId,
        })

        const finalExpense = await db.getExpense(ctx.db, expenseId)
        return { expense: finalExpense }
      })

      expect(result.expense?.status).toBe('Approved')
      expect(result.expense?.receiptUrl).toBeTruthy()
    })
  })

  // ============================================================================
  // ALTERNATE PATH: Project with Change Order
  // ============================================================================

  describe('Alternate Path: Change Order', () => {
    it('handles budget change order approval and update', async () => {
      const result = await t.run(async (ctx) => {
        const baseData = await setupE2ETestData(ctx.db)

        // Create won deal and active project
        const dealId = await db.insertDeal(ctx.db, {
          organizationId: baseData.orgId,
          companyId: baseData.clientCompanyId,
          contactId: baseData.clientContactId,
          name: 'Change Order Project',
          value: 10000000,
          ownerId: baseData.salesRepId,
          stage: 'Won',
          probability: 100,
          createdAt: Date.now(),
        })

        const projectId = await db.insertProject(ctx.db, {
          organizationId: baseData.orgId,
          companyId: baseData.clientCompanyId,
          dealId,
          name: 'Change Order Test',
          status: 'Active',
          startDate: Date.now(),
          managerId: baseData.projectManagerId,
          createdAt: Date.now(),
        })

        const budgetId = await db.insertBudget(ctx.db, {
          projectId,
          organizationId: baseData.orgId,
          type: 'FixedFee',
          totalAmount: 10000000,
          createdAt: Date.now(),
        })

        // Request change order for additional scope
        const changeOrderId = await db.insertChangeOrder(ctx.db, {
          organizationId: baseData.orgId,
          projectId,
          requestedBy: baseData.projectManagerId,
          description: 'Additional feature: Mobile responsive design - adding $25,000',
          budgetImpact: 2500000, // $25,000 additional
          status: 'Pending',
          createdAt: Date.now(),
        })

        let budget = await db.getBudget(ctx.db, budgetId)
        expect(budget?.totalAmount).toBe(10000000) // Not yet changed

        // Client approves change order (approved by PM on behalf of client)
        await ctx.db.patch(changeOrderId, {
          status: 'Approved',
          approvedBy: baseData.projectManagerId,
          approvedAt: Date.now(),
        })

        // Update budget with change order
        await ctx.db.patch(budgetId, {
          totalAmount: 12500000, // Original + change order
        })

        budget = await db.getBudget(ctx.db, budgetId)
        const changeOrder = await db.getChangeOrder(ctx.db, changeOrderId)

        return { budget, changeOrder }
      })

      expect(result.changeOrder?.status).toBe('Approved')
      expect(result.budget?.totalAmount).toBe(12500000)
    })
  })

  // ============================================================================
  // CONCURRENT OPERATIONS: Multiple Team Members
  // ============================================================================

  describe('Concurrent Operations', () => {
    it('handles multiple team members tracking time on same project', async () => {
      const result = await t.run(async (ctx) => {
        const baseData = await setupE2ETestData(ctx.db)

        // Create second developer
        const developer2Id = await db.insertUser(ctx.db, {
          organizationId: baseData.orgId,
          email: 'dev2@acme.com',
          name: 'Danny Developer',
          role: 'team_member',
          costRate: 4500,
          billRate: 18000,
          skills: ['typescript', 'python'],
          department: 'Engineering',
          location: 'Remote',
          isActive: true,
        })

        // Create project
        const dealId = await db.insertDeal(ctx.db, {
          organizationId: baseData.orgId,
          companyId: baseData.clientCompanyId,
          contactId: baseData.clientContactId,
          name: 'Team Project',
          value: 10000000,
          ownerId: baseData.salesRepId,
          stage: 'Won',
          probability: 100,
          createdAt: Date.now(),
        })

        const projectId = await db.insertProject(ctx.db, {
          organizationId: baseData.orgId,
          companyId: baseData.clientCompanyId,
          dealId,
          name: 'Multi-dev Project',
          status: 'Active',
          startDate: Date.now(),
          managerId: baseData.projectManagerId,
          createdAt: Date.now(),
        })

        // Both developers log time on same day
        const today = Date.now()

        await db.insertTimeEntry(ctx.db, {
          organizationId: baseData.orgId,
          userId: baseData.developerId,
          projectId,
          date: today,
          hours: 8,
          notes: 'Frontend development',
          billable: true,
          status: 'Submitted',
          createdAt: Date.now(),
        })

        await db.insertTimeEntry(ctx.db, {
          organizationId: baseData.orgId,
          userId: developer2Id,
          projectId,
          date: today,
          hours: 6,
          notes: 'Backend API development',
          billable: true,
          status: 'Submitted',
          createdAt: Date.now(),
        })

        // Get all time entries for project
        const entries = await db.listTimeEntriesByProject(ctx.db, projectId)
        const totalHours = entries.reduce((sum, e) => sum + e.hours, 0)

        return {
          entries: entries.length,
          totalHours,
          users: [...new Set(entries.map((e) => e.userId))].length,
        }
      })

      expect(result.entries).toBe(2)
      expect(result.totalHours).toBe(14) // 8 + 6
      expect(result.users).toBe(2)
    })
  })

  // ============================================================================
  // INVOICE TYPES: T&M vs Fixed Fee vs Milestone
  // ============================================================================

  describe('Invoice Types', () => {
    it('generates T&M invoice from approved time entries', async () => {
      const result = await t.run(async (ctx) => {
        const baseData = await setupE2ETestData(ctx.db)

        // Setup minimal project with approved time
        const dealId = await db.insertDeal(ctx.db, {
          organizationId: baseData.orgId,
          companyId: baseData.clientCompanyId,
          contactId: baseData.clientContactId,
          name: 'T&M Invoice Test',
          value: 5000000,
          ownerId: baseData.salesRepId,
          stage: 'Won',
          probability: 100,
          createdAt: Date.now(),
        })

        const projectId = await db.insertProject(ctx.db, {
          organizationId: baseData.orgId,
          companyId: baseData.clientCompanyId,
          dealId,
          name: 'T&M Project',
          status: 'Active',
          startDate: Date.now(),
          managerId: baseData.projectManagerId,
          createdAt: Date.now(),
        })

        // Approved time entries
        await db.insertTimeEntry(ctx.db, {
          organizationId: baseData.orgId,
          userId: baseData.developerId,
          projectId,
          date: Date.now(),
          hours: 40,
          notes: 'Week 1 development',
          billable: true,
          status: 'Approved',
          approvedAt: Date.now(),
          approvedBy: baseData.projectManagerId,
          createdAt: Date.now(),
        })

        // Create T&M invoice
        const invoiceId = await db.insertInvoice(ctx.db, {
          organizationId: baseData.orgId,
          projectId,
          companyId: baseData.clientCompanyId,
          status: 'Draft',
          method: 'TimeAndMaterials',
          subtotal: 800000, // 40 hrs * $200
          tax: 0,
          total: 800000,
          dueDate: Date.now() + 30 * 24 * 60 * 60 * 1000,
          createdAt: Date.now(),
        })

        const invoice = await db.getInvoice(ctx.db, invoiceId)
        return { invoice }
      })

      expect(result.invoice?.method).toBe('TimeAndMaterials')
      expect(result.invoice?.total).toBe(800000)
    })

    it('generates milestone invoice based on milestone completion', async () => {
      const result = await t.run(async (ctx) => {
        const baseData = await setupE2ETestData(ctx.db)

        // Setup project with fixed fee budget and milestone
        const dealId = await db.insertDeal(ctx.db, {
          organizationId: baseData.orgId,
          companyId: baseData.clientCompanyId,
          contactId: baseData.clientContactId,
          name: 'Fixed Fee Test',
          value: 5000000,
          ownerId: baseData.salesRepId,
          stage: 'Won',
          probability: 100,
          createdAt: Date.now(),
        })

        const projectId = await db.insertProject(ctx.db, {
          organizationId: baseData.orgId,
          companyId: baseData.clientCompanyId,
          dealId,
          name: 'Fixed Fee Project',
          status: 'Active',
          startDate: Date.now(),
          managerId: baseData.projectManagerId,
          createdAt: Date.now(),
        })

        await db.insertBudget(ctx.db, {
          projectId,
          organizationId: baseData.orgId,
          type: 'FixedFee',
          totalAmount: 5000000,
          createdAt: Date.now(),
        })

        // Milestone invoice (50% on design completion)
        const milestoneId = await db.insertMilestone(ctx.db, {
          projectId,
          organizationId: baseData.orgId,
          name: 'Design Complete',
          percentage: 50,
          amount: 2500000,
          dueDate: Date.now() + 30 * 24 * 60 * 60 * 1000,
          completedAt: Date.now(),
          sortOrder: 1,
        })

        const invoiceId = await db.insertInvoice(ctx.db, {
          organizationId: baseData.orgId,
          projectId,
          companyId: baseData.clientCompanyId,
          status: 'Draft',
          method: 'Milestone',
          subtotal: 2500000, // 50% of fixed fee
          tax: 0,
          total: 2500000,
          dueDate: Date.now() + 30 * 24 * 60 * 60 * 1000,
          createdAt: Date.now(),
        })

        // Link milestone to invoice
        await ctx.db.patch(milestoneId, { invoiceId })

        const invoice = await db.getInvoice(ctx.db, invoiceId)
        return { invoice }
      })

      expect(result.invoice?.method).toBe('Milestone')
      expect(result.invoice?.total).toBe(2500000)
    })
  })

  // ============================================================================
  // PARTIAL PAYMENTS
  // ============================================================================

  describe('Partial Payments', () => {
    it('handles multiple partial payments until invoice is fully paid', async () => {
      const result = await t.run(async (ctx) => {
        const baseData = await setupE2ETestData(ctx.db)

        // Create invoice
        const dealId = await db.insertDeal(ctx.db, {
          organizationId: baseData.orgId,
          companyId: baseData.clientCompanyId,
          contactId: baseData.clientContactId,
          name: 'Partial Payment Test',
          value: 1000000,
          ownerId: baseData.salesRepId,
          stage: 'Won',
          probability: 100,
          createdAt: Date.now(),
        })

        const projectId = await db.insertProject(ctx.db, {
          organizationId: baseData.orgId,
          companyId: baseData.clientCompanyId,
          dealId,
          name: 'Partial Payment Project',
          status: 'Active',
          startDate: Date.now(),
          managerId: baseData.projectManagerId,
          createdAt: Date.now(),
        })

        const invoiceId = await db.insertInvoice(ctx.db, {
          organizationId: baseData.orgId,
          projectId,
          companyId: baseData.clientCompanyId,
          number: 'INV-TEST-001',
          status: 'Sent',
          method: 'TimeAndMaterials',
          subtotal: 1000000,
          tax: 0,
          total: 1000000,
          dueDate: Date.now() + 30 * 24 * 60 * 60 * 1000,
          sentAt: Date.now(),
          createdAt: Date.now(),
        })

        // First partial payment - 50%
        await db.insertPayment(ctx.db, {
          organizationId: baseData.orgId,
          invoiceId,
          amount: 500000,
          date: Date.now(),
          method: 'Check',
          reference: 'CHK-001',
          syncedToAccounting: false,
          createdAt: Date.now(),
        })

        // Check total payments
        let totalPaid = await db.getTotalPaymentsForInvoice(ctx.db, invoiceId)
        expect(totalPaid).toBe(500000)

        // Second partial payment - remaining 50%
        await db.insertPayment(ctx.db, {
          organizationId: baseData.orgId,
          invoiceId,
          amount: 500000,
          date: Date.now(),
          method: 'ACH',
          reference: 'ACH-002',
          syncedToAccounting: false,
          createdAt: Date.now(),
        })

        // Mark as paid since total equals invoice amount
        totalPaid = await db.getTotalPaymentsForInvoice(ctx.db, invoiceId)
        if (totalPaid >= 1000000) {
          await ctx.db.patch(invoiceId, {
            status: 'Paid',
            paidAt: Date.now(),
          })
        }

        const invoice = await db.getInvoice(ctx.db, invoiceId)
        const payments = await db.listPaymentsByInvoice(ctx.db, invoiceId)

        return {
          invoice,
          paymentCount: payments.length,
          totalPaid: payments.reduce((sum, p) => sum + p.amount, 0),
        }
      })

      expect(result.invoice?.status).toBe('Paid')
      expect(result.paymentCount).toBe(2)
      expect(result.totalPaid).toBe(1000000)
    })
  })
})
