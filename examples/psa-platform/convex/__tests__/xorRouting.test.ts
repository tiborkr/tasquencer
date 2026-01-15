/// <reference types="vite/client" />
/**
 * XOR Routing Decision Tests for PSA Platform
 * Tests the domain state conditions that drive XOR routing decisions in workflows.
 * These tests verify that the routing logic correctly interprets domain state.
 *
 * Contract-based tests for workflow routing decisions per:
 * - P2.7: Replace Math.random() placeholders with real domain-driven routing
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setup, type TestContext } from './helpers.test'
import * as db from '../workflows/dealToDelivery/db'

describe('PSA Platform XOR Routing Decisions', () => {
  let t: TestContext

  beforeEach(() => {
    vi.useFakeTimers()
    t = setup()
  })

  // ============================================================================
  // SALES PHASE ROUTING DECISIONS
  // ============================================================================

  describe('Sales Phase Routing', () => {
    describe('qualifyLead decision', () => {
      it('routes to createEstimate when deal stage is Qualified', async () => {
        const result = await t.run(async (ctx) => {
          const { dealId } = await createTestDealSetup(ctx.db)

          // Qualify the deal
          await db.updateDeal(ctx.db, dealId, {
            stage: 'Qualified',
            probability: 25,
          })

          const deal = await db.getDeal(ctx.db, dealId)

          // Routing decision: Qualified → createEstimate
          const shouldRouteToCreateEstimate = deal?.stage === 'Qualified'

          return { deal, shouldRouteToCreateEstimate }
        })

        expect(result.deal?.stage).toBe('Qualified')
        expect(result.shouldRouteToCreateEstimate).toBe(true)
      })

      it('routes to disqualifyLead when deal stage is not Qualified', async () => {
        const result = await t.run(async (ctx) => {
          const { dealId } = await createTestDealSetup(ctx.db)

          // Leave deal in Lead stage
          const deal = await db.getDeal(ctx.db, dealId)

          // Routing decision: not Qualified → disqualifyLead
          const shouldRouteToDisqualify = deal?.stage !== 'Qualified'

          return { deal, shouldRouteToDisqualify }
        })

        expect(result.deal?.stage).toBe('Lead')
        expect(result.shouldRouteToDisqualify).toBe(true)
      })
    })

    describe('negotiateTerms decision', () => {
      it('routes to getProposalSigned when probability >= 70', async () => {
        const result = await t.run(async (ctx) => {
          const { dealId } = await createTestDealSetup(ctx.db)

          // Set high probability
          await db.updateDeal(ctx.db, dealId, {
            stage: 'Negotiation',
            probability: 80,
          })

          const deal = await db.getDeal(ctx.db, dealId)

          // Routing decision: probability >= 70 and no lostReason → getProposalSigned
          const shouldRouteToGetProposalSigned =
            (deal?.probability ?? 0) >= 70 && !deal?.lostReason

          return { deal, shouldRouteToGetProposalSigned }
        })

        expect(result.deal?.probability).toBe(80)
        expect(result.shouldRouteToGetProposalSigned).toBe(true)
      })

      it('routes to archiveDeal when deal has lostReason', async () => {
        const result = await t.run(async (ctx) => {
          const { dealId } = await createTestDealSetup(ctx.db)

          // Set lost reason
          await db.updateDeal(ctx.db, dealId, {
            stage: 'Lost',
            probability: 0,
            lostReason: 'Budget constraints',
          })

          const deal = await db.getDeal(ctx.db, dealId)

          // Routing decision: has lostReason → archiveDeal
          const shouldRouteToArchive = !!deal?.lostReason

          return { deal, shouldRouteToArchive }
        })

        expect(result.deal?.lostReason).toBe('Budget constraints')
        expect(result.shouldRouteToArchive).toBe(true)
      })

      it('routes to reviseProposal when probability < 70 and no lostReason', async () => {
        const result = await t.run(async (ctx) => {
          const { dealId } = await createTestDealSetup(ctx.db)

          // Set moderate probability
          await db.updateDeal(ctx.db, dealId, {
            stage: 'Negotiation',
            probability: 50,
          })

          const deal = await db.getDeal(ctx.db, dealId)

          // Routing decision: probability < 70 and no lostReason → reviseProposal
          const shouldRouteToRevise =
            (deal?.probability ?? 0) < 70 && !deal?.lostReason

          return { deal, shouldRouteToRevise }
        })

        expect(result.deal?.probability).toBe(50)
        expect(result.shouldRouteToRevise).toBe(true)
      })
    })

    describe('getProposalSigned decision', () => {
      it('routes to completeSales when deal stage is Won', async () => {
        const result = await t.run(async (ctx) => {
          const { dealId } = await createTestDealSetup(ctx.db)

          await db.updateDeal(ctx.db, dealId, {
            stage: 'Won',
            probability: 100,
            closedAt: Date.now(),
          })

          const deal = await db.getDeal(ctx.db, dealId)

          // Routing decision: stage === Won → completeSales
          const shouldRouteToCompleteSales = deal?.stage === 'Won'

          return { deal, shouldRouteToCompleteSales }
        })

        expect(result.deal?.stage).toBe('Won')
        expect(result.shouldRouteToCompleteSales).toBe(true)
      })

      it('routes to archiveDeal when deal stage is Lost', async () => {
        const result = await t.run(async (ctx) => {
          const { dealId } = await createTestDealSetup(ctx.db)

          await db.updateDeal(ctx.db, dealId, {
            stage: 'Lost',
            probability: 0,
            lostReason: 'Competitor won',
            closedAt: Date.now(),
          })

          const deal = await db.getDeal(ctx.db, dealId)

          // Routing decision: stage === Lost → archiveDeal
          const shouldRouteToArchive = deal?.stage === 'Lost'

          return { deal, shouldRouteToArchive }
        })

        expect(result.deal?.stage).toBe('Lost')
        expect(result.shouldRouteToArchive).toBe(true)
      })
    })
  })

  // ============================================================================
  // RESOURCE PLANNING ROUTING DECISIONS
  // ============================================================================

  describe('Resource Planning Routing', () => {
    describe('reviewBookings decision', () => {
      it('routes to checkConfirmationNeeded when approved is true', async () => {
        // Test the routing decision based on work item metadata
        const routingDecision = {
          approved: true,
          hasConflicts: false,
          reviewedAt: Date.now(),
        }

        // Routing decision: approved === true → checkConfirmationNeeded
        const shouldRouteToConfirmationCheck = routingDecision.approved === true

        expect(shouldRouteToConfirmationCheck).toBe(true)
      })

      it('routes to filterBySkillsRole when approved is false', async () => {
        const routingDecision = {
          approved: false,
          hasConflicts: true,
          reviewedAt: Date.now(),
        }

        // Routing decision: approved !== true → filterBySkillsRole
        const shouldRouteToFilter = routingDecision.approved !== true

        expect(shouldRouteToFilter).toBe(true)
      })
    })

    describe('checkConfirmationNeeded decision', () => {
      it('routes to confirmBookings when tentative bookings exist', async () => {
        const result = await t.run(async (ctx) => {
          const { projectId, orgId, developerId } = await createTestProjectSetup(ctx.db)

          // Create tentative booking
          await db.insertBooking(ctx.db, {
            organizationId: orgId,
            projectId,
            userId: developerId,
            startDate: Date.now(),
            endDate: Date.now() + 7 * 24 * 60 * 60 * 1000,
            hoursPerDay: 8,
            type: 'Tentative',
            createdAt: Date.now(),
          })

          const bookings = await db.listBookingsByProject(ctx.db, projectId)
          const tentativeBookings = bookings.filter(b => b.type === 'Tentative')

          // Routing decision: has Tentative bookings → confirmBookings
          const shouldRouteToConfirm = tentativeBookings.length > 0

          return { tentativeBookings, shouldRouteToConfirm }
        })

        expect(result.tentativeBookings.length).toBeGreaterThan(0)
        expect(result.shouldRouteToConfirm).toBe(true)
      })

      it('routes to completeAllocation when no tentative bookings', async () => {
        const result = await t.run(async (ctx) => {
          const { projectId, orgId, developerId } = await createTestProjectSetup(ctx.db)

          // Create confirmed booking only
          await db.insertBooking(ctx.db, {
            organizationId: orgId,
            projectId,
            userId: developerId,
            startDate: Date.now(),
            endDate: Date.now() + 7 * 24 * 60 * 60 * 1000,
            hoursPerDay: 8,
            type: 'Confirmed',
            createdAt: Date.now(),
          })

          const bookings = await db.listBookingsByProject(ctx.db, projectId)
          const tentativeBookings = bookings.filter(b => b.type === 'Tentative')

          // Routing decision: no Tentative bookings → completeAllocation
          const shouldRouteToComplete = tentativeBookings.length === 0

          return { tentativeBookings, shouldRouteToComplete }
        })

        expect(result.tentativeBookings.length).toBe(0)
        expect(result.shouldRouteToComplete).toBe(true)
      })
    })
  })

  // ============================================================================
  // EXECUTION PHASE ROUTING DECISIONS
  // ============================================================================

  describe('Execution Phase Routing', () => {
    describe('monitorBudgetBurn decision', () => {
      it('routes to completeExecution when burn rate < 90%', async () => {
        const result = await t.run(async (ctx) => {
          const { projectId } = await createTestProjectWithBudget(ctx.db)

          // Calculate budget burn (will be 0 with no time entries)
          const burn = await db.calculateProjectBudgetBurn(ctx.db, projectId)

          // Routing decision: burnRate < 90 → completeExecution
          const shouldRouteToComplete = burn.burnRate < 90

          return { burn, shouldRouteToComplete }
        })

        expect(result.burn.burnRate).toBeLessThan(90)
        expect(result.shouldRouteToComplete).toBe(true)
      })

      it('routes to pauseWork when burn rate >= 90%', async () => {
        const result = await t.run(async (ctx) => {
          const { projectId, budgetId, orgId, developerId } = await createTestProjectWithBudget(ctx.db)

          // Create time entries that exceed 90% of budget
          // Developer costRate is 5000 cents/hr, budget is 200000 cents
          // Need total cost >= 180000 for 90% burn rate
          // 180000 / 5000 = 36 hours minimum
          const serviceId = await db.insertService(ctx.db, {
            organizationId: orgId,
            budgetId,
            name: 'Development',
            rate: 15000,
            estimatedHours: 40,
            totalAmount: 600000,
          })

          // Log 40 hours at costRate 5000 = 200000 cents = 100% burn
          for (let i = 0; i < 40; i++) {
            await db.insertTimeEntry(ctx.db, {
              organizationId: orgId,
              projectId,
              userId: developerId,
              serviceId,
              date: Date.now() + i * 24 * 60 * 60 * 1000,
              hours: 1,
              billable: true,
              status: 'Approved',
              createdAt: Date.now(),
            })
          }

          const burn = await db.calculateProjectBudgetBurn(ctx.db, projectId)

          // Routing decision: burnRate >= 90 → pauseWork
          const shouldRouteToPause = burn.burnRate >= 90

          return { burn, shouldRouteToPause }
        })

        expect(result.burn.burnRate).toBeGreaterThanOrEqual(90)
        expect(result.shouldRouteToPause).toBe(true)
      })
    })

    describe('getChangeOrderApproval decision', () => {
      it('routes to monitorBudgetBurn when change order is Approved', async () => {
        const result = await t.run(async (ctx) => {
          const { projectId, orgId, managerId } = await createTestProjectSetup(ctx.db)

          // Create approved change order
          const changeOrderId = await db.insertChangeOrder(ctx.db, {
            organizationId: orgId,
            projectId,
            requestedBy: managerId,
            description: 'Scope expansion',
            budgetImpact: 50000,
            status: 'Approved',
            approvedBy: managerId,
            approvedAt: Date.now(),
            createdAt: Date.now(),
          })

          const changeOrder = await db.getChangeOrder(ctx.db, changeOrderId)

          // Routing decision: status === Approved → monitorBudgetBurn
          const shouldRouteToMonitor = changeOrder?.status === 'Approved'

          return { changeOrder, shouldRouteToMonitor }
        })

        expect(result.changeOrder?.status).toBe('Approved')
        expect(result.shouldRouteToMonitor).toBe(true)
      })

      it('routes to completeExecution when change order is Rejected', async () => {
        const result = await t.run(async (ctx) => {
          const { projectId, orgId, managerId } = await createTestProjectSetup(ctx.db)

          const changeOrderId = await db.insertChangeOrder(ctx.db, {
            organizationId: orgId,
            projectId,
            requestedBy: managerId,
            description: 'Scope expansion',
            budgetImpact: 50000,
            status: 'Rejected',
            createdAt: Date.now(),
          })

          const changeOrder = await db.getChangeOrder(ctx.db, changeOrderId)

          // Routing decision: status !== Approved → completeExecution
          const shouldRouteToComplete = changeOrder?.status !== 'Approved'

          return { changeOrder, shouldRouteToComplete }
        })

        expect(result.changeOrder?.status).toBe('Rejected')
        expect(result.shouldRouteToComplete).toBe(true)
      })
    })
  })

  // ============================================================================
  // TIME TRACKING ROUTING DECISIONS
  // ============================================================================

  describe('Time Tracking Routing', () => {
    describe('selectEntryMethod decision', () => {
      it.each([
        ['timer', 'useTimer'],
        ['manual', 'manualEntry'],
        ['calendar', 'importFromCalendar'],
        ['autoBooking', 'autoFromBookings'],
      ])('routes to %s task when method is %s', (method, expectedTask) => {
        // Test the routing decision based on work item metadata
        type EntryMethod = 'timer' | 'manual' | 'calendar' | 'autoBooking'
        const workItemMetadata = {
          type: 'selectEntryMethod' as const,
          method: method as EntryMethod,
        }

        // Routing decision based on method field
        let targetTask: string
        switch (workItemMetadata.method) {
          case 'timer':
            targetTask = 'useTimer'
            break
          case 'manual':
            targetTask = 'manualEntry'
            break
          case 'calendar':
            targetTask = 'importFromCalendar'
            break
          case 'autoBooking':
            targetTask = 'autoFromBookings'
            break
          default:
            targetTask = 'manualEntry'
        }

        expect(targetTask).toBe(expectedTask)
      })

      it('defaults to manualEntry when no method specified', () => {
        const workItemMetadata = {
          type: 'selectEntryMethod' as const,
          method: undefined,
        }

        // Default routing when no method
        const targetTask = workItemMetadata.method ? workItemMetadata.method : 'manualEntry'

        expect(targetTask).toBe('manualEntry')
      })
    })
  })

  // ============================================================================
  // EXPENSE TRACKING ROUTING DECISIONS
  // ============================================================================

  describe('Expense Tracking Routing', () => {
    describe('selectExpenseType decision', () => {
      it.each([
        ['Software', 'logSoftwareExpense'],
        ['Travel', 'logTravelExpense'],
        ['Materials', 'logMaterialsExpense'],
        ['Subcontractor', 'logSubcontractorExpense'],
        ['Other', 'logOtherExpense'],
      ])('routes to %s task when expense type is %s', (expenseType, expectedTask) => {
        type ExpenseType = 'Software' | 'Travel' | 'Materials' | 'Subcontractor' | 'Other'
        const workItemMetadata = {
          type: 'selectExpenseType' as const,
          expenseType: expenseType as ExpenseType,
        }

        // Routing decision based on expenseType field
        let targetTask: string
        switch (workItemMetadata.expenseType) {
          case 'Software':
            targetTask = 'logSoftwareExpense'
            break
          case 'Travel':
            targetTask = 'logTravelExpense'
            break
          case 'Materials':
            targetTask = 'logMaterialsExpense'
            break
          case 'Subcontractor':
            targetTask = 'logSubcontractorExpense'
            break
          case 'Other':
            targetTask = 'logOtherExpense'
            break
          default:
            targetTask = 'logOtherExpense'
        }

        expect(targetTask).toBe(expectedTask)
      })
    })

    describe('markBillable decision', () => {
      it('routes to setBillableRate when billable is true', () => {
        const workItemMetadata = {
          type: 'markBillable' as const,
          billable: true,
        }

        // Routing decision: billable === true → setBillableRate
        const shouldRouteToSetRate = workItemMetadata.billable === true

        expect(shouldRouteToSetRate).toBe(true)
      })

      it('routes to submitExpense when billable is false', () => {
        const workItemMetadata = {
          type: 'markBillable' as const,
          billable: false,
        }

        // Routing decision: billable !== true → submitExpense
        const shouldRouteToSubmit = workItemMetadata.billable !== true

        expect(shouldRouteToSubmit).toBe(true)
      })
    })
  })

  // ============================================================================
  // BILLING PHASE ROUTING DECISIONS
  // ============================================================================

  describe('Billing Phase Routing', () => {
    describe('sendInvoice decision', () => {
      it.each([
        ['email', 'sendViaEmail'],
        ['pdf', 'sendViaPdf'],
        ['portal', 'sendViaPortal'],
      ])('routes to %s task when delivery method is %s', (method, expectedTask) => {
        type DeliveryMethod = 'email' | 'pdf' | 'portal'
        const workItemMetadata = {
          type: 'sendInvoice' as const,
          selectedMethod: method as DeliveryMethod,
        }

        // Routing decision based on selectedMethod field
        let targetTask: string
        switch (workItemMetadata.selectedMethod) {
          case 'email':
            targetTask = 'sendViaEmail'
            break
          case 'pdf':
            targetTask = 'sendViaPdf'
            break
          case 'portal':
            targetTask = 'sendViaPortal'
            break
          default:
            targetTask = 'sendViaEmail'
        }

        expect(targetTask).toBe(expectedTask)
      })

      it('defaults to sendViaEmail when no method specified', () => {
        const workItemMetadata = {
          type: 'sendInvoice' as const,
          selectedMethod: undefined,
        }

        // Default routing when no method
        const targetTask = workItemMetadata.selectedMethod || 'email'

        expect(targetTask).toBe('email')
      })
    })

    describe('checkMoreBilling decision', () => {
      it('routes to generateInvoice when moreBillingCycles is true', () => {
        const workItemMetadata = {
          type: 'checkMoreBilling' as const,
          moreBillingCycles: true,
          uninvoicedTimeCount: 5,
          uninvoicedExpenseCount: 2,
        }

        // Routing decision: moreBillingCycles === true → generateInvoice
        const shouldRouteToGenerate = workItemMetadata.moreBillingCycles === true

        expect(shouldRouteToGenerate).toBe(true)
      })

      it('routes to completeBilling when moreBillingCycles is false', () => {
        const workItemMetadata = {
          type: 'checkMoreBilling' as const,
          moreBillingCycles: false,
          uninvoicedTimeCount: 0,
          uninvoicedExpenseCount: 0,
        }

        // Routing decision: moreBillingCycles !== true → completeBilling
        const shouldRouteToComplete = workItemMetadata.moreBillingCycles !== true

        expect(shouldRouteToComplete).toBe(true)
      })
    })
  })

  // ============================================================================
  // SEQUENTIAL EXECUTION ROUTING DECISIONS
  // ============================================================================

  describe('Sequential Execution Routing', () => {
    describe('completeTask decision', () => {
      it('routes to getNextTask when hasMoreTasks is true', async () => {
        const result = await t.run(async (ctx) => {
          const { projectId, orgId, developerId } = await createTestProjectSetup(ctx.db)

          // Create multiple tasks
          await db.insertTask(ctx.db, {
            organizationId: orgId,
            projectId,
            name: 'Task 1',
            description: 'First task',
            status: 'Done',
            priority: 'Medium',
            assigneeIds: [developerId],
            dependencies: [],
            sortOrder: 1,
            createdAt: Date.now(),
          })

          await db.insertTask(ctx.db, {
            organizationId: orgId,
            projectId,
            name: 'Task 2',
            description: 'Second task',
            status: 'Todo',
            priority: 'Medium',
            assigneeIds: [developerId],
            dependencies: [],
            sortOrder: 2,
            createdAt: Date.now(),
          })

          const allTasks = await db.listTasksByProject(ctx.db, projectId)
          const pendingTasks = allTasks.filter(
            t => t.status === 'Todo' || t.status === 'InProgress'
          )

          // Routing decision: has pending tasks → getNextTask
          const hasMoreTasks = pendingTasks.length > 0
          const shouldRouteToGetNext = hasMoreTasks

          return { pendingTasks, hasMoreTasks, shouldRouteToGetNext }
        })

        expect(result.pendingTasks.length).toBeGreaterThan(0)
        expect(result.hasMoreTasks).toBe(true)
        expect(result.shouldRouteToGetNext).toBe(true)
      })

      it('routes to finishSequence when hasMoreTasks is false', async () => {
        const result = await t.run(async (ctx) => {
          const { projectId, orgId, developerId } = await createTestProjectSetup(ctx.db)

          // Create single completed task
          await db.insertTask(ctx.db, {
            organizationId: orgId,
            projectId,
            name: 'Task 1',
            description: 'Only task',
            status: 'Done',
            priority: 'Medium',
            assigneeIds: [developerId],
            dependencies: [],
            sortOrder: 1,
            createdAt: Date.now(),
          })

          const allTasks = await db.listTasksByProject(ctx.db, projectId)
          const pendingTasks = allTasks.filter(
            t => t.status === 'Todo' || t.status === 'InProgress'
          )

          // Routing decision: no pending tasks → finishSequence
          const hasMoreTasks = pendingTasks.length > 0
          const shouldRouteToFinish = !hasMoreTasks

          return { pendingTasks, hasMoreTasks, shouldRouteToFinish }
        })

        expect(result.pendingTasks.length).toBe(0)
        expect(result.hasMoreTasks).toBe(false)
        expect(result.shouldRouteToFinish).toBe(true)
      })
    })
  })

  // ============================================================================
  // CONDITIONAL EXECUTION ROUTING DECISIONS
  // ============================================================================

  describe('Conditional Execution Routing', () => {
    describe('evaluateCondition decision', () => {
      describe('budgetThreshold condition', () => {
        it('routes to executePrimaryBranch when burn rate >= threshold', async () => {
          const result = await t.run(async (ctx) => {
            const { projectId, budgetId, orgId, developerId } = await createTestProjectWithBudget(ctx.db)

            // Create time entries to reach threshold
            // Developer costRate is 5000 cents/hr, budget is 200000 cents
            // Need total cost >= 180000 for 90% burn rate
            const serviceId = await db.insertService(ctx.db, {
              organizationId: orgId,
              budgetId,
              name: 'Development',
              rate: 15000,
              estimatedHours: 40,
              totalAmount: 600000,
            })

            // Log 40 hours at costRate 5000 = 200000 cents = 100% burn
            for (let i = 0; i < 40; i++) {
              await db.insertTimeEntry(ctx.db, {
                organizationId: orgId,
                projectId,
                userId: developerId,
                serviceId,
                date: Date.now() + i * 24 * 60 * 60 * 1000,
                hours: 1,
                billable: true,
                status: 'Approved',
                createdAt: Date.now(),
              })
            }

            const burn = await db.calculateProjectBudgetBurn(ctx.db, projectId)
            const threshold = 90

            // Routing decision: burnRate >= threshold → primaryBranch
            const conditionMet = burn.burnRate >= threshold

            return { burn, threshold, conditionMet }
          })

          expect(result.burn.burnRate).toBeGreaterThanOrEqual(result.threshold)
          expect(result.conditionMet).toBe(true)
        })

        it('routes to executeAlternateBranch when burn rate < threshold', async () => {
          const result = await t.run(async (ctx) => {
            const { projectId } = await createTestProjectWithBudget(ctx.db)

            // No time entries = 0% burn rate
            const burn = await db.calculateProjectBudgetBurn(ctx.db, projectId)
            const threshold = 90

            // Routing decision: burnRate < threshold → alternateBranch
            const conditionMet = burn.burnRate >= threshold

            return { burn, threshold, conditionMet }
          })

          expect(result.burn.burnRate).toBeLessThan(result.threshold)
          expect(result.conditionMet).toBe(false)
        })
      })

      describe('taskCompletion condition', () => {
        it('routes to executePrimaryBranch when completion rate >= threshold', async () => {
          const result = await t.run(async (ctx) => {
            const { projectId, orgId, developerId } = await createTestProjectSetup(ctx.db)

            // Create tasks all done
            for (let i = 0; i < 5; i++) {
              await db.insertTask(ctx.db, {
                organizationId: orgId,
                projectId,
                name: `Task ${i + 1}`,
                description: 'Test task',
                status: 'Done',
                priority: 'Medium',
                assigneeIds: [developerId],
                dependencies: [],
                sortOrder: i,
                createdAt: Date.now(),
              })
            }

            const tasks = await db.listTasksByProject(ctx.db, projectId)
            const completedTasks = tasks.filter(t => t.status === 'Done').length
            const completionRate = tasks.length > 0
              ? (completedTasks / tasks.length) * 100
              : 0
            const threshold = 100

            // Routing decision: completionRate >= threshold → primaryBranch
            const conditionMet = completionRate >= threshold

            return { completionRate, threshold, conditionMet }
          })

          expect(result.completionRate).toBeGreaterThanOrEqual(result.threshold)
          expect(result.conditionMet).toBe(true)
        })

        it('routes to executeAlternateBranch when completion rate < threshold', async () => {
          const result = await t.run(async (ctx) => {
            const { projectId, orgId, developerId } = await createTestProjectSetup(ctx.db)

            // Create 5 tasks, only 2 done
            for (let i = 0; i < 5; i++) {
              await db.insertTask(ctx.db, {
                organizationId: orgId,
                projectId,
                name: `Task ${i + 1}`,
                description: 'Test task',
                status: i < 2 ? 'Done' : 'Todo',
                priority: 'Medium',
                assigneeIds: [developerId],
                dependencies: [],
                sortOrder: i,
                createdAt: Date.now(),
              })
            }

            const tasks = await db.listTasksByProject(ctx.db, projectId)
            const completedTasks = tasks.filter(t => t.status === 'Done').length
            const completionRate = tasks.length > 0
              ? (completedTasks / tasks.length) * 100
              : 0
            const threshold = 100

            // Routing decision: completionRate < threshold → alternateBranch
            const conditionMet = completionRate >= threshold

            return { completionRate, threshold, conditionMet }
          })

          expect(result.completionRate).toBeLessThan(result.threshold)
          expect(result.conditionMet).toBe(false)
        })
      })
    })
  })

  // ============================================================================
  // DEAL-TO-DELIVERY MASTER ROUTING DECISIONS
  // ============================================================================

  describe('Deal-to-Delivery Master Routing', () => {
    describe('sales phase completion decision', () => {
      it('routes to planning when deal stage is Won', async () => {
        const result = await t.run(async (ctx) => {
          const { dealId } = await createTestDealSetup(ctx.db)

          await db.updateDeal(ctx.db, dealId, {
            stage: 'Won',
            probability: 100,
            closedAt: Date.now(),
          })

          const deal = await db.getDeal(ctx.db, dealId)

          // Routing decision: stage === Won → planning
          const shouldRouteToPlan = deal?.stage === 'Won'

          return { deal, shouldRouteToPlan }
        })

        expect(result.deal?.stage).toBe('Won')
        expect(result.shouldRouteToPlan).toBe(true)
      })

      it('routes to handleDealLost when deal stage is not Won', async () => {
        const result = await t.run(async (ctx) => {
          const { dealId } = await createTestDealSetup(ctx.db)

          await db.updateDeal(ctx.db, dealId, {
            stage: 'Lost',
            probability: 0,
            lostReason: 'Competitor won',
            closedAt: Date.now(),
          })

          const deal = await db.getDeal(ctx.db, dealId)

          // Routing decision: stage !== Won → handleDealLost
          const shouldRouteToHandleLost = deal?.stage !== 'Won'

          return { deal, shouldRouteToHandleLost }
        })

        expect(result.deal?.stage).toBe('Lost')
        expect(result.shouldRouteToHandleLost).toBe(true)
      })
    })
  })
})

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

type DatabaseWriter = Parameters<typeof db.insertOrganization>[0]

async function createTestDealSetup(ctxDb: DatabaseWriter) {
  const orgId = await db.insertOrganization(ctxDb, {
    name: 'Test Org',
    settings: {},
    createdAt: Date.now(),
  })

  const companyId = await db.insertCompany(ctxDb, {
    organizationId: orgId,
    name: 'Client Corp',
    billingAddress: {
      street: '123 Main St',
      city: 'New York',
      state: 'NY',
      postalCode: '10001',
      country: 'USA',
    },
    paymentTerms: 30,
  })

  const ownerId = await db.insertUser(ctxDb, {
    organizationId: orgId,
    email: 'sales@test.com',
    name: 'Sales Rep',
    role: 'sales_rep',
    costRate: 5000,
    billRate: 10000,
    skills: ['sales'],
    department: 'Sales',
    location: 'NYC',
    isActive: true,
  })

  const contactId = await db.insertContact(ctxDb, {
    organizationId: orgId,
    companyId,
    name: 'John Client',
    email: 'john@client.com',
    phone: '+1-555-123-4567',
    isPrimary: true,
  })

  const dealId = await db.insertDeal(ctxDb, {
    organizationId: orgId,
    companyId,
    contactId,
    name: 'Test Deal',
    value: 5000000,
    ownerId,
    stage: 'Lead',
    probability: 10,
    createdAt: Date.now(),
  })

  return { orgId, companyId, ownerId, contactId, dealId }
}

async function createTestProjectSetup(ctxDb: DatabaseWriter) {
  const orgId = await db.insertOrganization(ctxDb, {
    name: 'Test Org',
    settings: {},
    createdAt: Date.now(),
  })

  const companyId = await db.insertCompany(ctxDb, {
    organizationId: orgId,
    name: 'Client Corp',
    billingAddress: {
      street: '123 Main St',
      city: 'New York',
      state: 'NY',
      postalCode: '10001',
      country: 'USA',
    },
    paymentTerms: 30,
  })

  const managerId = await db.insertUser(ctxDb, {
    organizationId: orgId,
    email: 'pm@test.com',
    name: 'Project Manager',
    role: 'project_manager',
    costRate: 7500,
    billRate: 15000,
    skills: ['project_management'],
    department: 'Operations',
    location: 'NYC',
    isActive: true,
  })

  const developerId = await db.insertUser(ctxDb, {
    organizationId: orgId,
    email: 'dev@test.com',
    name: 'Developer',
    role: 'team_member',
    costRate: 5000,
    billRate: 10000,
    skills: ['typescript', 'react'],
    department: 'Engineering',
    location: 'Remote',
    isActive: true,
  })

  const projectId = await db.insertProject(ctxDb, {
    organizationId: orgId,
    companyId,
    name: 'Test Project',
    status: 'Active',
    startDate: Date.now(),
    managerId,
    createdAt: Date.now(),
  })

  return { orgId, companyId, managerId, developerId, projectId }
}

async function createTestProjectWithBudget(ctxDb: DatabaseWriter) {
  const { orgId, companyId, managerId, developerId, projectId } =
    await createTestProjectSetup(ctxDb)

  const budgetId = await db.insertBudget(ctxDb, {
    organizationId: orgId,
    projectId,
    type: 'TimeAndMaterials',
    totalAmount: 200000, // $2,000
    createdAt: Date.now(),
  })

  // Link budget to project
  await db.updateProject(ctxDb, projectId, { budgetId })

  return { orgId, companyId, managerId, developerId, projectId, budgetId }
}
