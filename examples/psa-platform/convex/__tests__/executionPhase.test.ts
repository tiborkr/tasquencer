/// <reference types="vite/client" />
/**
 * Execution Phase unit tests for PSA Platform
 * Tests the execution phase work items including tasks, budget monitoring,
 * change orders, and execution patterns (sequential, parallel, conditional)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setup, type TestContext } from './helpers.test'
import * as db from '../workflows/dealToDelivery/db'

describe('PSA Platform Execution Phase', () => {
  let t: TestContext

  beforeEach(() => {
    vi.useFakeTimers()
    t = setup()
  })

  // ============================================================================
  // TASK MANAGEMENT TESTS
  // ============================================================================

  describe('Task Management', () => {
    it('creates tasks for a project', async () => {
      const result = await t.run(async (ctx) => {
        // Setup organization, company, user, and project
        const orgId = await db.insertOrganization(ctx.db, {
          name: 'Test Org',
          settings: {},
          createdAt: Date.now(),
        })

        const companyId = await db.insertCompany(ctx.db, {
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

        const userId = await db.insertUser(ctx.db, {
          organizationId: orgId,
          email: 'dev@test.com',
          name: 'Developer',
          role: 'team_member',
          costRate: 5000,
          billRate: 10000,
          skills: ['typescript'],
          department: 'Engineering',
          location: 'Remote',
          isActive: true,
        })

        const managerId = await db.insertUser(ctx.db, {
          organizationId: orgId,
          email: 'pm@test.com',
          name: 'Project Manager',
          role: 'project_manager',
          costRate: 7500,
          billRate: 15000,
          skills: [],
          department: 'Operations',
          location: 'Remote',
          isActive: true,
        })

        const projectId = await db.insertProject(ctx.db, {
          organizationId: orgId,
          companyId,
          name: 'Website Redesign',
          status: 'Active',
          startDate: Date.now(),
          managerId,
          createdAt: Date.now(),
        })

        // Create tasks
        const task1Id = await db.insertTask(ctx.db, {
          projectId,
          organizationId: orgId,
          name: 'Design mockups',
          description: 'Create initial design mockups',
          status: 'Todo',
          assigneeIds: [userId],
          priority: 'High',
          dependencies: [],
          sortOrder: 0,
          createdAt: Date.now(),
        })

        const task2Id = await db.insertTask(ctx.db, {
          projectId,
          organizationId: orgId,
          name: 'Frontend development',
          description: 'Implement the frontend',
          status: 'Todo',
          assigneeIds: [userId],
          priority: 'Medium',
          dependencies: [task1Id], // Depends on design
          sortOrder: 1,
          createdAt: Date.now(),
        })

        const tasks = await db.listTasksByProject(ctx.db, projectId)
        return { tasks, task1Id, task2Id }
      })

      expect(result.tasks).toHaveLength(2)
      expect(result.tasks[0].name).toBe('Design mockups')
      expect(result.tasks[1].name).toBe('Frontend development')
      expect(result.tasks[1].dependencies).toContain(result.task1Id)
    })

    it('updates task status through workflow', async () => {
      const result = await t.run(async (ctx) => {
        const orgId = await db.insertOrganization(ctx.db, {
          name: 'Test Org',
          settings: {},
          createdAt: Date.now(),
        })

        const companyId = await db.insertCompany(ctx.db, {
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

        const userId = await db.insertUser(ctx.db, {
          organizationId: orgId,
          email: 'dev@test.com',
          name: 'Developer',
          role: 'team_member',
          costRate: 5000,
          billRate: 10000,
          skills: [],
          department: 'Engineering',
          location: 'Remote',
          isActive: true,
        })

        const projectId = await db.insertProject(ctx.db, {
          organizationId: orgId,
          companyId,
          name: 'Test Project',
          status: 'Active',
          startDate: Date.now(),
          managerId: userId,
          createdAt: Date.now(),
        })

        const taskId = await db.insertTask(ctx.db, {
          projectId,
          organizationId: orgId,
          name: 'Test task',
          description: 'A test task',
          status: 'Todo',
          assigneeIds: [userId],
          priority: 'Medium',
          dependencies: [],
          sortOrder: 0,
          createdAt: Date.now(),
        })

        // Simulate task execution workflow
        await db.updateTask(ctx.db, taskId, { status: 'InProgress' })
        const inProgress = await db.getTask(ctx.db, taskId)

        await db.updateTask(ctx.db, taskId, { status: 'Review' })
        const inReview = await db.getTask(ctx.db, taskId)

        await db.updateTask(ctx.db, taskId, { status: 'Done' })
        const done = await db.getTask(ctx.db, taskId)

        return { inProgress, inReview, done }
      })

      expect(result.inProgress?.status).toBe('InProgress')
      expect(result.inReview?.status).toBe('Review')
      expect(result.done?.status).toBe('Done')
    })

    it('lists tasks by priority order', async () => {
      const result = await t.run(async (ctx) => {
        const orgId = await db.insertOrganization(ctx.db, {
          name: 'Test Org',
          settings: {},
          createdAt: Date.now(),
        })

        const companyId = await db.insertCompany(ctx.db, {
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

        const userId = await db.insertUser(ctx.db, {
          organizationId: orgId,
          email: 'dev@test.com',
          name: 'Developer',
          role: 'team_member',
          costRate: 5000,
          billRate: 10000,
          skills: [],
          department: 'Engineering',
          location: 'Remote',
          isActive: true,
        })

        const projectId = await db.insertProject(ctx.db, {
          organizationId: orgId,
          companyId,
          name: 'Test Project',
          status: 'Active',
          startDate: Date.now(),
          managerId: userId,
          createdAt: Date.now(),
        })

        // Create tasks with different priorities
        await db.insertTask(ctx.db, {
          projectId,
          organizationId: orgId,
          name: 'Low priority task',
          description: '',
          status: 'Todo',
          assigneeIds: [userId],
          priority: 'Low',
          dependencies: [],
          sortOrder: 0,
          createdAt: Date.now(),
        })

        await db.insertTask(ctx.db, {
          projectId,
          organizationId: orgId,
          name: 'Urgent task',
          description: '',
          status: 'Todo',
          assigneeIds: [userId],
          priority: 'Urgent',
          dependencies: [],
          sortOrder: 1,
          createdAt: Date.now(),
        })

        await db.insertTask(ctx.db, {
          projectId,
          organizationId: orgId,
          name: 'High priority task',
          description: '',
          status: 'Todo',
          assigneeIds: [userId],
          priority: 'High',
          dependencies: [],
          sortOrder: 2,
          createdAt: Date.now(),
        })

        const tasks = await db.listTasksByProject(ctx.db, projectId)

        // Sort by priority
        const priorityOrder = { Urgent: 0, High: 1, Medium: 2, Low: 3 }
        const sortedTasks = [...tasks].sort(
          (a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]
        )

        return sortedTasks.map((t) => t.priority)
      })

      expect(result[0]).toBe('Urgent')
      expect(result[1]).toBe('High')
      expect(result[2]).toBe('Low')
    })
  })

  // ============================================================================
  // CHANGE ORDER TESTS
  // ============================================================================

  describe('Change Orders', () => {
    it('creates a change order request', async () => {
      const result = await t.run(async (ctx) => {
        const orgId = await db.insertOrganization(ctx.db, {
          name: 'Test Org',
          settings: {},
          createdAt: Date.now(),
        })

        const companyId = await db.insertCompany(ctx.db, {
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

        const userId = await db.insertUser(ctx.db, {
          organizationId: orgId,
          email: 'pm@test.com',
          name: 'Project Manager',
          role: 'project_manager',
          costRate: 7500,
          billRate: 15000,
          skills: [],
          department: 'Operations',
          location: 'Remote',
          isActive: true,
        })

        const projectId = await db.insertProject(ctx.db, {
          organizationId: orgId,
          companyId,
          name: 'Test Project',
          status: 'Active',
          startDate: Date.now(),
          managerId: userId,
          createdAt: Date.now(),
        })

        // Create a change order
        const changeOrderId = await db.insertChangeOrder(ctx.db, {
          organizationId: orgId,
          projectId,
          requestedBy: userId,
          description: 'Additional features requested by client',
          budgetImpact: 500000, // $5,000
          status: 'Pending',
          createdAt: Date.now(),
        })

        const changeOrder = await db.getChangeOrder(ctx.db, changeOrderId)
        return changeOrder
      })

      expect(result).not.toBeNull()
      expect(result?.description).toBe('Additional features requested by client')
      expect(result?.budgetImpact).toBe(500000)
      expect(result?.status).toBe('Pending')
    })

    it('approves a change order and updates budget', async () => {
      const result = await t.run(async (ctx) => {
        const orgId = await db.insertOrganization(ctx.db, {
          name: 'Test Org',
          settings: {},
          createdAt: Date.now(),
        })

        const companyId = await db.insertCompany(ctx.db, {
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

        const pmId = await db.insertUser(ctx.db, {
          organizationId: orgId,
          email: 'pm@test.com',
          name: 'Project Manager',
          role: 'project_manager',
          costRate: 7500,
          billRate: 15000,
          skills: [],
          department: 'Operations',
          location: 'Remote',
          isActive: true,
        })

        const approverId = await db.insertUser(ctx.db, {
          organizationId: orgId,
          email: 'exec@test.com',
          name: 'Executive',
          role: 'executive',
          costRate: 10000,
          billRate: 25000,
          skills: [],
          department: 'Management',
          location: 'NYC',
          isActive: true,
        })

        const projectId = await db.insertProject(ctx.db, {
          organizationId: orgId,
          companyId,
          name: 'Test Project',
          status: 'Active',
          startDate: Date.now(),
          managerId: pmId,
          createdAt: Date.now(),
        })

        // Create budget
        const budgetId = await db.insertBudget(ctx.db, {
          projectId,
          organizationId: orgId,
          type: 'TimeAndMaterials',
          totalAmount: 5000000, // $50,000
          createdAt: Date.now(),
        })

        await db.updateProject(ctx.db, projectId, { budgetId })

        // Create change order
        const changeOrderId = await db.insertChangeOrder(ctx.db, {
          organizationId: orgId,
          projectId,
          requestedBy: pmId,
          description: 'Scope expansion',
          budgetImpact: 1000000, // $10,000
          status: 'Pending',
          createdAt: Date.now(),
        })

        // Approve change order
        await db.updateChangeOrder(ctx.db, changeOrderId, {
          status: 'Approved',
          approvedBy: approverId,
          approvedAt: Date.now(),
        })

        // Update budget
        const budgetBefore = await db.getBudgetByProject(ctx.db, projectId)
        await db.updateBudget(ctx.db, budgetId, {
          totalAmount: budgetBefore!.totalAmount + 1000000,
        })

        const changeOrder = await db.getChangeOrder(ctx.db, changeOrderId)
        const budgetAfter = await db.getBudgetByProject(ctx.db, projectId)

        return { changeOrder, budgetAfter }
      })

      expect(result.changeOrder?.status).toBe('Approved')
      expect(result.budgetAfter?.totalAmount).toBe(6000000) // $60,000
    })

    it('rejects a change order', async () => {
      const result = await t.run(async (ctx) => {
        const orgId = await db.insertOrganization(ctx.db, {
          name: 'Test Org',
          settings: {},
          createdAt: Date.now(),
        })

        const companyId = await db.insertCompany(ctx.db, {
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

        const pmId = await db.insertUser(ctx.db, {
          organizationId: orgId,
          email: 'pm@test.com',
          name: 'Project Manager',
          role: 'project_manager',
          costRate: 7500,
          billRate: 15000,
          skills: [],
          department: 'Operations',
          location: 'Remote',
          isActive: true,
        })

        const projectId = await db.insertProject(ctx.db, {
          organizationId: orgId,
          companyId,
          name: 'Test Project',
          status: 'Active',
          startDate: Date.now(),
          managerId: pmId,
          createdAt: Date.now(),
        })

        // Create change order
        const changeOrderId = await db.insertChangeOrder(ctx.db, {
          organizationId: orgId,
          projectId,
          requestedBy: pmId,
          description: 'Scope expansion',
          budgetImpact: 1000000,
          status: 'Pending',
          createdAt: Date.now(),
        })

        // Reject change order
        await db.updateChangeOrder(ctx.db, changeOrderId, {
          status: 'Rejected',
          approvedBy: pmId,
          approvedAt: Date.now(),
        })

        return await db.getChangeOrder(ctx.db, changeOrderId)
      })

      expect(result?.status).toBe('Rejected')
    })

    it('lists pending change orders for a project', async () => {
      const result = await t.run(async (ctx) => {
        const orgId = await db.insertOrganization(ctx.db, {
          name: 'Test Org',
          settings: {},
          createdAt: Date.now(),
        })

        const companyId = await db.insertCompany(ctx.db, {
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

        const pmId = await db.insertUser(ctx.db, {
          organizationId: orgId,
          email: 'pm@test.com',
          name: 'Project Manager',
          role: 'project_manager',
          costRate: 7500,
          billRate: 15000,
          skills: [],
          department: 'Operations',
          location: 'Remote',
          isActive: true,
        })

        const projectId = await db.insertProject(ctx.db, {
          organizationId: orgId,
          companyId,
          name: 'Test Project',
          status: 'Active',
          startDate: Date.now(),
          managerId: pmId,
          createdAt: Date.now(),
        })

        // Create multiple change orders
        await db.insertChangeOrder(ctx.db, {
          organizationId: orgId,
          projectId,
          requestedBy: pmId,
          description: 'First change',
          budgetImpact: 100000,
          status: 'Pending',
          createdAt: Date.now(),
        })

        await db.insertChangeOrder(ctx.db, {
          organizationId: orgId,
          projectId,
          requestedBy: pmId,
          description: 'Second change',
          budgetImpact: 200000,
          status: 'Approved',
          createdAt: Date.now(),
        })

        await db.insertChangeOrder(ctx.db, {
          organizationId: orgId,
          projectId,
          requestedBy: pmId,
          description: 'Third change',
          budgetImpact: 300000,
          status: 'Pending',
          createdAt: Date.now(),
        })

        return await db.listPendingChangeOrdersByProject(ctx.db, projectId)
      })

      expect(result).toHaveLength(2)
      expect(result.every((co) => co.status === 'Pending')).toBe(true)
    })
  })

  // ============================================================================
  // PROJECT STATUS TESTS
  // ============================================================================

  describe('Project Status Management', () => {
    it('pauses a project by setting status to OnHold', async () => {
      const result = await t.run(async (ctx) => {
        const orgId = await db.insertOrganization(ctx.db, {
          name: 'Test Org',
          settings: {},
          createdAt: Date.now(),
        })

        const companyId = await db.insertCompany(ctx.db, {
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

        const pmId = await db.insertUser(ctx.db, {
          organizationId: orgId,
          email: 'pm@test.com',
          name: 'Project Manager',
          role: 'project_manager',
          costRate: 7500,
          billRate: 15000,
          skills: [],
          department: 'Operations',
          location: 'Remote',
          isActive: true,
        })

        const projectId = await db.insertProject(ctx.db, {
          organizationId: orgId,
          companyId,
          name: 'Test Project',
          status: 'Active',
          startDate: Date.now(),
          managerId: pmId,
          createdAt: Date.now(),
        })

        // Pause project
        await db.updateProject(ctx.db, projectId, { status: 'OnHold' })

        return await db.getProject(ctx.db, projectId)
      })

      expect(result?.status).toBe('OnHold')
    })

    it('resumes a paused project', async () => {
      const result = await t.run(async (ctx) => {
        const orgId = await db.insertOrganization(ctx.db, {
          name: 'Test Org',
          settings: {},
          createdAt: Date.now(),
        })

        const companyId = await db.insertCompany(ctx.db, {
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

        const pmId = await db.insertUser(ctx.db, {
          organizationId: orgId,
          email: 'pm@test.com',
          name: 'Project Manager',
          role: 'project_manager',
          costRate: 7500,
          billRate: 15000,
          skills: [],
          department: 'Operations',
          location: 'Remote',
          isActive: true,
        })

        const projectId = await db.insertProject(ctx.db, {
          organizationId: orgId,
          companyId,
          name: 'Test Project',
          status: 'OnHold',
          startDate: Date.now(),
          managerId: pmId,
          createdAt: Date.now(),
        })

        // Resume project
        await db.updateProject(ctx.db, projectId, { status: 'Active' })

        return await db.getProject(ctx.db, projectId)
      })

      expect(result?.status).toBe('Active')
    })
  })

  // ============================================================================
  // BUDGET MONITORING TESTS
  // ============================================================================

  describe('Budget Monitoring', () => {
    it('detects budget threshold exceeded', async () => {
      const result = await t.run(async (ctx) => {
        const orgId = await db.insertOrganization(ctx.db, {
          name: 'Test Org',
          settings: {},
          createdAt: Date.now(),
        })

        const companyId = await db.insertCompany(ctx.db, {
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

        const userId = await db.insertUser(ctx.db, {
          organizationId: orgId,
          email: 'dev@test.com',
          name: 'Developer',
          role: 'team_member',
          costRate: 10000, // $100/hr (high to exceed budget quickly)
          billRate: 20000,
          skills: [],
          department: 'Engineering',
          location: 'Remote',
          isActive: true,
        })

        const projectId = await db.insertProject(ctx.db, {
          organizationId: orgId,
          companyId,
          name: 'Test Project',
          status: 'Active',
          startDate: Date.now(),
          managerId: userId,
          createdAt: Date.now(),
        })

        // Small budget: $1,000
        const budgetId = await db.insertBudget(ctx.db, {
          projectId,
          organizationId: orgId,
          type: 'TimeAndMaterials',
          totalAmount: 100000, // $1,000
          createdAt: Date.now(),
        })

        await db.updateProject(ctx.db, projectId, { budgetId })

        // Log 9.5 hours ($950 cost = 95% of budget)
        await db.insertTimeEntry(ctx.db, {
          organizationId: orgId,
          userId,
          projectId,
          date: Date.now(),
          hours: 9.5,
          billable: true,
          status: 'Approved',
          createdAt: Date.now(),
        })

        const burnMetrics = await db.calculateProjectBudgetBurn(ctx.db, projectId)
        const threshold = 90

        return {
          burnRate: burnMetrics.burnRate,
          exceededThreshold: burnMetrics.burnRate >= threshold,
        }
      })

      expect(result.exceededThreshold).toBe(true)
      expect(result.burnRate).toBeGreaterThanOrEqual(90)
    })

    it('calculates budget burn with time and expenses', async () => {
      const result = await t.run(async (ctx) => {
        const orgId = await db.insertOrganization(ctx.db, {
          name: 'Test Org',
          settings: {},
          createdAt: Date.now(),
        })

        const companyId = await db.insertCompany(ctx.db, {
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

        const userId = await db.insertUser(ctx.db, {
          organizationId: orgId,
          email: 'dev@test.com',
          name: 'Developer',
          role: 'team_member',
          costRate: 5000, // $50/hr
          billRate: 10000,
          skills: [],
          department: 'Engineering',
          location: 'Remote',
          isActive: true,
        })

        const projectId = await db.insertProject(ctx.db, {
          organizationId: orgId,
          companyId,
          name: 'Test Project',
          status: 'Active',
          startDate: Date.now(),
          managerId: userId,
          createdAt: Date.now(),
        })

        // Budget: $10,000
        const budgetId = await db.insertBudget(ctx.db, {
          projectId,
          organizationId: orgId,
          type: 'TimeAndMaterials',
          totalAmount: 1000000, // $10,000
          createdAt: Date.now(),
        })

        await db.updateProject(ctx.db, projectId, { budgetId })

        // Time: 20 hours ($1,000)
        await db.insertTimeEntry(ctx.db, {
          organizationId: orgId,
          userId,
          projectId,
          date: Date.now(),
          hours: 20,
          billable: true,
          status: 'Approved',
          createdAt: Date.now(),
        })

        // Expenses: $500
        await db.insertExpense(ctx.db, {
          organizationId: orgId,
          userId,
          projectId,
          type: 'Software',
          amount: 50000, // $500
          currency: 'USD',
          billable: true,
          status: 'Approved',
          date: Date.now(),
          description: 'Software license',
          createdAt: Date.now(),
        })

        return await db.calculateProjectBudgetBurn(ctx.db, projectId)
      })

      // Time cost: 20hrs * $50 = $1,000 (100,000 cents)
      expect(result.timeCost).toBe(100000)
      // Expense cost: $500 (50,000 cents)
      expect(result.expenseCost).toBe(50000)
      // Total: $1,500 (150,000 cents)
      expect(result.totalCost).toBe(150000)
      // Budget: $10,000 (1,000,000 cents)
      expect(result.budgetAmount).toBe(1000000)
      // Burn rate: 15%
      expect(result.burnRate).toBeCloseTo(15, 10)
      // Remaining: $8,500 (850,000 cents)
      expect(result.remaining).toBe(850000)
    })
  })

  // ============================================================================
  // TASK DEPENDENCY TESTS
  // ============================================================================

  describe('Task Dependencies', () => {
    it('identifies tasks with satisfied dependencies', async () => {
      const result = await t.run(async (ctx) => {
        const orgId = await db.insertOrganization(ctx.db, {
          name: 'Test Org',
          settings: {},
          createdAt: Date.now(),
        })

        const companyId = await db.insertCompany(ctx.db, {
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

        const userId = await db.insertUser(ctx.db, {
          organizationId: orgId,
          email: 'dev@test.com',
          name: 'Developer',
          role: 'team_member',
          costRate: 5000,
          billRate: 10000,
          skills: [],
          department: 'Engineering',
          location: 'Remote',
          isActive: true,
        })

        const projectId = await db.insertProject(ctx.db, {
          organizationId: orgId,
          companyId,
          name: 'Test Project',
          status: 'Active',
          startDate: Date.now(),
          managerId: userId,
          createdAt: Date.now(),
        })

        // Task A: No dependencies, Done
        const taskA = await db.insertTask(ctx.db, {
          projectId,
          organizationId: orgId,
          name: 'Task A',
          description: '',
          status: 'Done',
          assigneeIds: [userId],
          priority: 'Medium',
          dependencies: [],
          sortOrder: 0,
          createdAt: Date.now(),
        })

        // Task B: Depends on A, Todo (ready to start)
        const taskB = await db.insertTask(ctx.db, {
          projectId,
          organizationId: orgId,
          name: 'Task B',
          description: '',
          status: 'Todo',
          assigneeIds: [userId],
          priority: 'Medium',
          dependencies: [taskA],
          sortOrder: 1,
          createdAt: Date.now(),
        })

        // Task C: Depends on B, Todo (not ready - B not done)
        const taskC = await db.insertTask(ctx.db, {
          projectId,
          organizationId: orgId,
          name: 'Task C',
          description: '',
          status: 'Todo',
          assigneeIds: [userId],
          priority: 'Medium',
          dependencies: [taskB],
          sortOrder: 2,
          createdAt: Date.now(),
        })

        // Get all tasks and filter for eligible ones
        const tasks = await db.listTasksByProject(ctx.db, projectId)
        const taskMap = new Map(tasks.map((t) => [t._id, t]))

        const eligibleTasks = tasks.filter((task) => {
          if (task.status !== 'Todo') return false
          for (const depId of task.dependencies) {
            const dep = taskMap.get(depId)
            if (dep && dep.status !== 'Done') return false
          }
          return true
        })

        return {
          eligibleTaskNames: eligibleTasks.map((t) => t.name),
          taskBId: taskB,
          taskCId: taskC,
        }
      })

      // Only Task B should be eligible (Task A is done, Task C depends on B which is not done)
      expect(result.eligibleTaskNames).toContain('Task B')
      expect(result.eligibleTaskNames).not.toContain('Task C')
      expect(result.eligibleTaskNames).toHaveLength(1)
    })
  })
})
