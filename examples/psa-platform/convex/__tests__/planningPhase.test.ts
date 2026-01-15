/// <reference types="vite/client" />
/**
 * Planning Phase unit tests for PSA Platform
 * Tests the planning phase work items including project creation and budget setup
 *
 * Contract-based tests derived from: recipes/psa-platform/specs/04-workflow-planning-phase.md
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setup, type TestContext } from './helpers.test'
import * as db from '../workflows/dealToDelivery/db'

describe('PSA Platform Planning Phase', () => {
  let t: TestContext

  beforeEach(() => {
    vi.useFakeTimers()
    t = setup()
  })

  // ============================================================================
  // PROJECT CREATION TESTS
  // ============================================================================

  describe('Project Creation', () => {
    it('creates a project from a won deal', async () => {
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

        const managerId = await db.insertUser(ctx.db, {
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

        const projectId = await db.insertProject(ctx.db, {
          organizationId: orgId,
          companyId,
          name: 'Website Redesign',
          status: 'Planning',
          startDate: Date.now(),
          managerId,
          createdAt: Date.now(),
        })

        return await db.getProject(ctx.db, projectId)
      })

      expect(result).not.toBeNull()
      expect(result?.status).toBe('Planning')
      expect(result?.name).toBe('Website Redesign')
    })

    it('links project to source deal', async () => {
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

        const contactId = await db.insertContact(ctx.db, {
          organizationId: orgId,
          companyId,
          name: 'John Client',
          email: 'john@client.com',
          phone: '+1-555-123-4567',
          isPrimary: true,
        })

        const ownerId = await db.insertUser(ctx.db, {
          organizationId: orgId,
          email: 'sales@test.com',
          name: 'Sales Rep',
          role: 'sales_rep',
          costRate: 5000,
          billRate: 10000,
          skills: [],
          department: 'Sales',
          location: 'NYC',
          isActive: true,
        })

        // Create a won deal
        const dealId = await db.insertDeal(ctx.db, {
          organizationId: orgId,
          companyId,
          contactId,
          name: 'Website Redesign',
          value: 5000000,
          ownerId,
          stage: 'Won',
          probability: 100,
          createdAt: Date.now(),
        })

        // Create project and link to deal
        const projectId = await db.insertProject(ctx.db, {
          organizationId: orgId,
          companyId,
          dealId,
          name: 'Website Redesign',
          status: 'Planning',
          startDate: Date.now(),
          managerId: ownerId,
          createdAt: Date.now(),
        })

        const deal = await db.getDeal(ctx.db, dealId)
        const project = await db.getProject(ctx.db, projectId)

        return { deal, project }
      })

      // The project links back to the deal (project.dealId -> deal._id)
      expect(result.project?.dealId).toBe(result.deal?._id)
    })

    it('creates project with initial Planning status', async () => {
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

        const managerId = await db.insertUser(ctx.db, {
          organizationId: orgId,
          email: 'pm@test.com',
          name: 'Project Manager',
          role: 'project_manager',
          costRate: 7500,
          billRate: 15000,
          skills: [],
          department: 'Operations',
          location: 'NYC',
          isActive: true,
        })

        const projectId = await db.insertProject(ctx.db, {
          organizationId: orgId,
          companyId,
          name: 'New Project',
          status: 'Planning',
          startDate: Date.now(),
          managerId,
          createdAt: Date.now(),
        })

        return await db.getProject(ctx.db, projectId)
      })

      expect(result?.status).toBe('Planning')
    })

    it('lists projects by status', async () => {
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

        const managerId = await db.insertUser(ctx.db, {
          organizationId: orgId,
          email: 'pm@test.com',
          name: 'Project Manager',
          role: 'project_manager',
          costRate: 7500,
          billRate: 15000,
          skills: [],
          department: 'Operations',
          location: 'NYC',
          isActive: true,
        })

        // Create projects with different statuses
        await db.insertProject(ctx.db, {
          organizationId: orgId,
          companyId,
          name: 'Planning Project',
          status: 'Planning',
          startDate: Date.now(),
          managerId,
          createdAt: Date.now(),
        })

        await db.insertProject(ctx.db, {
          organizationId: orgId,
          companyId,
          name: 'Active Project',
          status: 'Active',
          startDate: Date.now(),
          managerId,
          createdAt: Date.now(),
        })

        await db.insertProject(ctx.db, {
          organizationId: orgId,
          companyId,
          name: 'Completed Project',
          status: 'Completed',
          startDate: Date.now(),
          managerId,
          createdAt: Date.now(),
        })

        const planningProjects = await db.listProjectsByStatus(
          ctx.db,
          orgId,
          'Planning'
        )
        const activeProjects = await db.listProjectsByStatus(
          ctx.db,
          orgId,
          'Active'
        )
        const completedProjects = await db.listProjectsByStatus(
          ctx.db,
          orgId,
          'Completed'
        )

        return { planningProjects, activeProjects, completedProjects }
      })

      expect(result.planningProjects).toHaveLength(1)
      expect(result.activeProjects).toHaveLength(1)
      expect(result.completedProjects).toHaveLength(1)
    })
  })

  // ============================================================================
  // BUDGET MANAGEMENT TESTS
  // ============================================================================

  describe('Budget Management', () => {
    it('creates budget for a project', async () => {
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

        const managerId = await db.insertUser(ctx.db, {
          organizationId: orgId,
          email: 'pm@test.com',
          name: 'Project Manager',
          role: 'project_manager',
          costRate: 7500,
          billRate: 15000,
          skills: [],
          department: 'Operations',
          location: 'NYC',
          isActive: true,
        })

        const projectId = await db.insertProject(ctx.db, {
          organizationId: orgId,
          companyId,
          name: 'Website Redesign',
          status: 'Planning',
          startDate: Date.now(),
          managerId,
          createdAt: Date.now(),
        })

        const budgetId = await db.insertBudget(ctx.db, {
          projectId,
          organizationId: orgId,
          type: 'TimeAndMaterials',
          totalAmount: 5000000, // $50,000
          createdAt: Date.now(),
        })

        await db.updateProject(ctx.db, projectId, { budgetId })

        const project = await db.getProject(ctx.db, projectId)
        const budget = await db.getBudget(ctx.db, budgetId)

        return { project, budget }
      })

      expect(result.budget).not.toBeNull()
      expect(result.budget?.type).toBe('TimeAndMaterials')
      expect(result.budget?.totalAmount).toBe(5000000)
      expect(result.project?.budgetId).toBe(result.budget?._id)
    })

    it('supports Time & Materials budget type', async () => {
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

        const managerId = await db.insertUser(ctx.db, {
          organizationId: orgId,
          email: 'pm@test.com',
          name: 'Project Manager',
          role: 'project_manager',
          costRate: 7500,
          billRate: 15000,
          skills: [],
          department: 'Operations',
          location: 'NYC',
          isActive: true,
        })

        const projectId = await db.insertProject(ctx.db, {
          organizationId: orgId,
          companyId,
          name: 'T&M Project',
          status: 'Planning',
          startDate: Date.now(),
          managerId,
          createdAt: Date.now(),
        })

        const budgetId = await db.insertBudget(ctx.db, {
          projectId,
          organizationId: orgId,
          type: 'TimeAndMaterials',
          totalAmount: 5000000,
          createdAt: Date.now(),
        })

        return await db.getBudget(ctx.db, budgetId)
      })

      expect(result?.type).toBe('TimeAndMaterials')
    })

    it('supports Fixed Fee budget type', async () => {
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

        const managerId = await db.insertUser(ctx.db, {
          organizationId: orgId,
          email: 'pm@test.com',
          name: 'Project Manager',
          role: 'project_manager',
          costRate: 7500,
          billRate: 15000,
          skills: [],
          department: 'Operations',
          location: 'NYC',
          isActive: true,
        })

        const projectId = await db.insertProject(ctx.db, {
          organizationId: orgId,
          companyId,
          name: 'Fixed Fee Project',
          status: 'Planning',
          startDate: Date.now(),
          managerId,
          createdAt: Date.now(),
        })

        const budgetId = await db.insertBudget(ctx.db, {
          projectId,
          organizationId: orgId,
          type: 'FixedFee',
          totalAmount: 7500000, // $75,000 fixed fee
          createdAt: Date.now(),
        })

        return await db.getBudget(ctx.db, budgetId)
      })

      expect(result?.type).toBe('FixedFee')
      expect(result?.totalAmount).toBe(7500000)
    })

    it('supports Retainer budget type', async () => {
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

        const managerId = await db.insertUser(ctx.db, {
          organizationId: orgId,
          email: 'pm@test.com',
          name: 'Project Manager',
          role: 'project_manager',
          costRate: 7500,
          billRate: 15000,
          skills: [],
          department: 'Operations',
          location: 'NYC',
          isActive: true,
        })

        const projectId = await db.insertProject(ctx.db, {
          organizationId: orgId,
          companyId,
          name: 'Retainer Project',
          status: 'Planning',
          startDate: Date.now(),
          managerId,
          createdAt: Date.now(),
        })

        const budgetId = await db.insertBudget(ctx.db, {
          projectId,
          organizationId: orgId,
          type: 'Retainer',
          totalAmount: 1000000, // $10,000/month retainer
          createdAt: Date.now(),
        })

        return await db.getBudget(ctx.db, budgetId)
      })

      expect(result?.type).toBe('Retainer')
    })

    it('retrieves budget by project', async () => {
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

        const managerId = await db.insertUser(ctx.db, {
          organizationId: orgId,
          email: 'pm@test.com',
          name: 'Project Manager',
          role: 'project_manager',
          costRate: 7500,
          billRate: 15000,
          skills: [],
          department: 'Operations',
          location: 'NYC',
          isActive: true,
        })

        const projectId = await db.insertProject(ctx.db, {
          organizationId: orgId,
          companyId,
          name: 'Test Project',
          status: 'Planning',
          startDate: Date.now(),
          managerId,
          createdAt: Date.now(),
        })

        const budgetId = await db.insertBudget(ctx.db, {
          projectId,
          organizationId: orgId,
          type: 'TimeAndMaterials',
          totalAmount: 5000000,
          createdAt: Date.now(),
        })

        await db.updateProject(ctx.db, projectId, { budgetId })

        const budget = await db.getBudgetByProject(ctx.db, projectId)

        return { budgetId, budget }
      })

      expect(result.budget).not.toBeNull()
      expect(result.budget?._id).toBe(result.budgetId)
    })

    it('updates budget total', async () => {
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

        const managerId = await db.insertUser(ctx.db, {
          organizationId: orgId,
          email: 'pm@test.com',
          name: 'Project Manager',
          role: 'project_manager',
          costRate: 7500,
          billRate: 15000,
          skills: [],
          department: 'Operations',
          location: 'NYC',
          isActive: true,
        })

        const projectId = await db.insertProject(ctx.db, {
          organizationId: orgId,
          companyId,
          name: 'Test Project',
          status: 'Planning',
          startDate: Date.now(),
          managerId,
          createdAt: Date.now(),
        })

        const budgetId = await db.insertBudget(ctx.db, {
          projectId,
          organizationId: orgId,
          type: 'TimeAndMaterials',
          totalAmount: 5000000, // Initial: $50,000
          createdAt: Date.now(),
        })

        const beforeUpdate = await db.getBudget(ctx.db, budgetId)

        // Update budget total
        await db.updateBudget(ctx.db, budgetId, {
          totalAmount: 7500000, // New: $75,000
        })

        const afterUpdate = await db.getBudget(ctx.db, budgetId)

        return { beforeUpdate, afterUpdate }
      })

      expect(result.beforeUpdate?.totalAmount).toBe(5000000)
      expect(result.afterUpdate?.totalAmount).toBe(7500000)
    })
  })

  // ============================================================================
  // SERVICE MANAGEMENT TESTS
  // ============================================================================

  describe('Service Management', () => {
    it('creates services for a budget', async () => {
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

        const managerId = await db.insertUser(ctx.db, {
          organizationId: orgId,
          email: 'pm@test.com',
          name: 'Project Manager',
          role: 'project_manager',
          costRate: 7500,
          billRate: 15000,
          skills: [],
          department: 'Operations',
          location: 'NYC',
          isActive: true,
        })

        const projectId = await db.insertProject(ctx.db, {
          organizationId: orgId,
          companyId,
          name: 'Test Project',
          status: 'Planning',
          startDate: Date.now(),
          managerId,
          createdAt: Date.now(),
        })

        const budgetId = await db.insertBudget(ctx.db, {
          projectId,
          organizationId: orgId,
          type: 'TimeAndMaterials',
          totalAmount: 5000000,
          createdAt: Date.now(),
        })

        // Create services (totalAmount = rate * estimatedHours)
        await db.insertService(ctx.db, {
          budgetId,
          organizationId: orgId,
          name: 'Design',
          rate: 15000, // $150/hr
          estimatedHours: 20,
          totalAmount: 300000, // $3,000
        })

        await db.insertService(ctx.db, {
          budgetId,
          organizationId: orgId,
          name: 'Development',
          rate: 12500, // $125/hr
          estimatedHours: 100,
          totalAmount: 1250000, // $12,500
        })

        await db.insertService(ctx.db, {
          budgetId,
          organizationId: orgId,
          name: 'Testing',
          rate: 10000, // $100/hr
          estimatedHours: 40,
          totalAmount: 400000, // $4,000
        })

        const services = await db.listServicesByBudget(ctx.db, budgetId)
        return services
      })

      expect(result).toHaveLength(3)
      expect(result[0].name).toBe('Design')
      expect(result[1].name).toBe('Development')
      expect(result[2].name).toBe('Testing')
    })

    it('calculates service total from rate and hours', async () => {
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

        const managerId = await db.insertUser(ctx.db, {
          organizationId: orgId,
          email: 'pm@test.com',
          name: 'Project Manager',
          role: 'project_manager',
          costRate: 7500,
          billRate: 15000,
          skills: [],
          department: 'Operations',
          location: 'NYC',
          isActive: true,
        })

        const projectId = await db.insertProject(ctx.db, {
          organizationId: orgId,
          companyId,
          name: 'Test Project',
          status: 'Planning',
          startDate: Date.now(),
          managerId,
          createdAt: Date.now(),
        })

        const budgetId = await db.insertBudget(ctx.db, {
          projectId,
          organizationId: orgId,
          type: 'TimeAndMaterials',
          totalAmount: 5000000,
          createdAt: Date.now(),
        })

        // Create service with rate and hours
        // $125/hr * 80 hours = $10,000
        const serviceId = await db.insertService(ctx.db, {
          budgetId,
          organizationId: orgId,
          name: 'Development',
          rate: 12500, // $125/hr in cents
          estimatedHours: 80,
          totalAmount: 1000000, // $10,000 (rate * hours)
        })

        const service = await db.getService(ctx.db, serviceId)

        return { service }
      })

      expect(result.service?.rate).toBe(12500)
      expect(result.service?.estimatedHours).toBe(80)
      expect(result.service?.totalAmount).toBe(1000000) // $10,000
    })
  })

  // ============================================================================
  // PROJECT STATUS TRANSITIONS
  // ============================================================================

  describe('Project Status Transitions', () => {
    it('transitions project from Planning to Active', async () => {
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

        const managerId = await db.insertUser(ctx.db, {
          organizationId: orgId,
          email: 'pm@test.com',
          name: 'Project Manager',
          role: 'project_manager',
          costRate: 7500,
          billRate: 15000,
          skills: [],
          department: 'Operations',
          location: 'NYC',
          isActive: true,
        })

        const projectId = await db.insertProject(ctx.db, {
          organizationId: orgId,
          companyId,
          name: 'Test Project',
          status: 'Planning',
          startDate: Date.now(),
          managerId,
          createdAt: Date.now(),
        })

        const beforeTransition = await db.getProject(ctx.db, projectId)

        // Transition to Active after budget and resources are set
        await db.updateProject(ctx.db, projectId, { status: 'Active' })

        const afterTransition = await db.getProject(ctx.db, projectId)

        return { beforeTransition, afterTransition }
      })

      expect(result.beforeTransition?.status).toBe('Planning')
      expect(result.afterTransition?.status).toBe('Active')
    })

    it('lists projects by manager', async () => {
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

        const manager1 = await db.insertUser(ctx.db, {
          organizationId: orgId,
          email: 'pm1@test.com',
          name: 'PM One',
          role: 'project_manager',
          costRate: 7500,
          billRate: 15000,
          skills: [],
          department: 'Operations',
          location: 'NYC',
          isActive: true,
        })

        const manager2 = await db.insertUser(ctx.db, {
          organizationId: orgId,
          email: 'pm2@test.com',
          name: 'PM Two',
          role: 'project_manager',
          costRate: 7500,
          billRate: 15000,
          skills: [],
          department: 'Operations',
          location: 'SF',
          isActive: true,
        })

        // Create projects for manager1
        await db.insertProject(ctx.db, {
          organizationId: orgId,
          companyId,
          name: 'Project A',
          status: 'Active',
          startDate: Date.now(),
          managerId: manager1,
          createdAt: Date.now(),
        })

        await db.insertProject(ctx.db, {
          organizationId: orgId,
          companyId,
          name: 'Project B',
          status: 'Planning',
          startDate: Date.now(),
          managerId: manager1,
          createdAt: Date.now(),
        })

        // Create project for manager2
        await db.insertProject(ctx.db, {
          organizationId: orgId,
          companyId,
          name: 'Project C',
          status: 'Active',
          startDate: Date.now(),
          managerId: manager2,
          createdAt: Date.now(),
        })

        const manager1Projects = await db.listProjectsByManager(ctx.db, manager1)
        const manager2Projects = await db.listProjectsByManager(ctx.db, manager2)

        return { manager1Projects, manager2Projects }
      })

      expect(result.manager1Projects).toHaveLength(2)
      expect(result.manager2Projects).toHaveLength(1)
    })
  })
})
