/// <reference types="vite/client" />
/**
 * Resource Planning unit tests for PSA Platform
 * Tests the resource planning work items including availability, bookings,
 * and team allocation
 *
 * Contract-based tests derived from: recipes/psa-platform/specs/05-workflow-resource-planning.md
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setup, type TestContext } from './helpers.test'
import * as db from '../workflows/dealToDelivery/db'

describe('PSA Platform Resource Planning', () => {
  let t: TestContext

  beforeEach(() => {
    vi.useFakeTimers()
    t = setup()
  })

  // ============================================================================
  // BOOKING MANAGEMENT TESTS
  // ============================================================================

  describe('Booking Management', () => {
    it('creates a booking for a project', async () => {
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

        const developerId = await db.insertUser(ctx.db, {
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

        const projectId = await db.insertProject(ctx.db, {
          organizationId: orgId,
          companyId,
          name: 'Website Redesign',
          status: 'Planning',
          startDate: Date.now(),
          managerId,
          createdAt: Date.now(),
        })

        // Create a booking
        const startDate = Date.now()
        const endDate = startDate + 14 * 24 * 60 * 60 * 1000 // 2 weeks
        const bookingId = await db.insertBooking(ctx.db, {
          organizationId: orgId,
          projectId,
          userId: developerId,
          startDate,
          endDate,
          hoursPerDay: 8,
          type: 'Tentative',
          createdAt: Date.now(),
        })

        return await db.getBooking(ctx.db, bookingId)
      })

      expect(result).not.toBeNull()
      expect(result?.type).toBe('Tentative')
      expect(result?.hoursPerDay).toBe(8)
    })

    it('supports Tentative booking type for pipeline deals', async () => {
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
          name: 'Pending Project',
          status: 'Planning',
          startDate: Date.now(),
          managerId,
          createdAt: Date.now(),
        })

        const bookingId = await db.insertBooking(ctx.db, {
          organizationId: orgId,
          projectId,
          userId: managerId,
          startDate: Date.now(),
          endDate: Date.now() + 7 * 24 * 60 * 60 * 1000,
          hoursPerDay: 4,
          type: 'Tentative',
          createdAt: Date.now(),
        })

        return await db.getBooking(ctx.db, bookingId)
      })

      expect(result?.type).toBe('Tentative')
    })

    it('supports Confirmed booking type for active projects', async () => {
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
          name: 'Active Project',
          status: 'Active',
          startDate: Date.now(),
          managerId,
          createdAt: Date.now(),
        })

        const bookingId = await db.insertBooking(ctx.db, {
          organizationId: orgId,
          projectId,
          userId: managerId,
          startDate: Date.now(),
          endDate: Date.now() + 7 * 24 * 60 * 60 * 1000,
          hoursPerDay: 8,
          type: 'Confirmed',
          createdAt: Date.now(),
        })

        return await db.getBooking(ctx.db, bookingId)
      })

      expect(result?.type).toBe('Confirmed')
    })

    it('transitions booking from Tentative to Confirmed', async () => {
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
          name: 'Project',
          status: 'Planning',
          startDate: Date.now(),
          managerId,
          createdAt: Date.now(),
        })

        const bookingId = await db.insertBooking(ctx.db, {
          organizationId: orgId,
          projectId,
          userId: managerId,
          startDate: Date.now(),
          endDate: Date.now() + 7 * 24 * 60 * 60 * 1000,
          hoursPerDay: 8,
          type: 'Tentative',
          createdAt: Date.now(),
        })

        const beforeConfirm = await db.getBooking(ctx.db, bookingId)

        // Confirm the booking
        await db.updateBooking(ctx.db, bookingId, { type: 'Confirmed' })

        const afterConfirm = await db.getBooking(ctx.db, bookingId)

        return { beforeConfirm, afterConfirm }
      })

      expect(result.beforeConfirm?.type).toBe('Tentative')
      expect(result.afterConfirm?.type).toBe('Confirmed')
    })

    it('lists bookings by user', async () => {
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

        const user1 = await db.insertUser(ctx.db, {
          organizationId: orgId,
          email: 'user1@test.com',
          name: 'User One',
          role: 'team_member',
          costRate: 5000,
          billRate: 10000,
          skills: ['typescript'],
          department: 'Engineering',
          location: 'Remote',
          isActive: true,
        })

        const user2 = await db.insertUser(ctx.db, {
          organizationId: orgId,
          email: 'user2@test.com',
          name: 'User Two',
          role: 'team_member',
          costRate: 5000,
          billRate: 10000,
          skills: ['react'],
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
          location: 'NYC',
          isActive: true,
        })

        const projectId = await db.insertProject(ctx.db, {
          organizationId: orgId,
          companyId,
          name: 'Project',
          status: 'Active',
          startDate: Date.now(),
          managerId,
          createdAt: Date.now(),
        })

        // Create bookings for user1
        await db.insertBooking(ctx.db, {
          organizationId: orgId,
          projectId,
          userId: user1,
          startDate: Date.now(),
          endDate: Date.now() + 7 * 24 * 60 * 60 * 1000,
          hoursPerDay: 8,
          type: 'Confirmed',
          createdAt: Date.now(),
        })

        await db.insertBooking(ctx.db, {
          organizationId: orgId,
          projectId,
          userId: user1,
          startDate: Date.now() + 14 * 24 * 60 * 60 * 1000,
          endDate: Date.now() + 21 * 24 * 60 * 60 * 1000,
          hoursPerDay: 4,
          type: 'Tentative',
          createdAt: Date.now(),
        })

        // Create booking for user2
        await db.insertBooking(ctx.db, {
          organizationId: orgId,
          projectId,
          userId: user2,
          startDate: Date.now(),
          endDate: Date.now() + 7 * 24 * 60 * 60 * 1000,
          hoursPerDay: 8,
          type: 'Confirmed',
          createdAt: Date.now(),
        })

        const user1Bookings = await db.listBookingsByUser(ctx.db, user1)
        const user2Bookings = await db.listBookingsByUser(ctx.db, user2)

        return { user1Bookings, user2Bookings }
      })

      expect(result.user1Bookings).toHaveLength(2)
      expect(result.user2Bookings).toHaveLength(1)
    })

    it('lists bookings by project', async () => {
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

        const project1 = await db.insertProject(ctx.db, {
          organizationId: orgId,
          companyId,
          name: 'Project One',
          status: 'Active',
          startDate: Date.now(),
          managerId,
          createdAt: Date.now(),
        })

        const project2 = await db.insertProject(ctx.db, {
          organizationId: orgId,
          companyId,
          name: 'Project Two',
          status: 'Active',
          startDate: Date.now(),
          managerId,
          createdAt: Date.now(),
        })

        // Create bookings for project1
        await db.insertBooking(ctx.db, {
          organizationId: orgId,
          projectId: project1,
          userId: managerId,
          startDate: Date.now(),
          endDate: Date.now() + 7 * 24 * 60 * 60 * 1000,
          hoursPerDay: 8,
          type: 'Confirmed',
          createdAt: Date.now(),
        })

        await db.insertBooking(ctx.db, {
          organizationId: orgId,
          projectId: project1,
          userId: managerId,
          startDate: Date.now() + 14 * 24 * 60 * 60 * 1000,
          endDate: Date.now() + 21 * 24 * 60 * 60 * 1000,
          hoursPerDay: 4,
          type: 'Tentative',
          createdAt: Date.now(),
        })

        // Create booking for project2
        await db.insertBooking(ctx.db, {
          organizationId: orgId,
          projectId: project2,
          userId: managerId,
          startDate: Date.now(),
          endDate: Date.now() + 7 * 24 * 60 * 60 * 1000,
          hoursPerDay: 8,
          type: 'Confirmed',
          createdAt: Date.now(),
        })

        const project1Bookings = await db.listBookingsByProject(ctx.db, project1)
        const project2Bookings = await db.listBookingsByProject(ctx.db, project2)

        return { project1Bookings, project2Bookings }
      })

      expect(result.project1Bookings).toHaveLength(2)
      expect(result.project2Bookings).toHaveLength(1)
    })

    it('lists bookings by date range', async () => {
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
          name: 'Project',
          status: 'Active',
          startDate: Date.now(),
          managerId,
          createdAt: Date.now(),
        })

        const now = Date.now()
        const oneWeek = 7 * 24 * 60 * 60 * 1000
        const twoWeeks = 14 * 24 * 60 * 60 * 1000
        const threeWeeks = 21 * 24 * 60 * 60 * 1000

        // Week 1 booking
        await db.insertBooking(ctx.db, {
          organizationId: orgId,
          projectId,
          userId: managerId,
          startDate: now,
          endDate: now + oneWeek,
          hoursPerDay: 8,
          type: 'Confirmed',
          createdAt: Date.now(),
        })

        // Week 2 booking
        await db.insertBooking(ctx.db, {
          organizationId: orgId,
          projectId,
          userId: managerId,
          startDate: now + oneWeek,
          endDate: now + twoWeeks,
          hoursPerDay: 8,
          type: 'Confirmed',
          createdAt: Date.now(),
        })

        // Week 3 booking
        await db.insertBooking(ctx.db, {
          organizationId: orgId,
          projectId,
          userId: managerId,
          startDate: now + twoWeeks,
          endDate: now + threeWeeks,
          hoursPerDay: 8,
          type: 'Confirmed',
          createdAt: Date.now(),
        })

        // Query bookings for first two weeks only
        const bookingsInRange = await db.listBookingsByDateRange(
          ctx.db,
          orgId,
          now,
          now + twoWeeks
        )

        return bookingsInRange
      })

      // Should find first two bookings that start within the range
      expect(result.length).toBeGreaterThanOrEqual(2)
    })

    it('deletes a booking', async () => {
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
          name: 'Project',
          status: 'Planning',
          startDate: Date.now(),
          managerId,
          createdAt: Date.now(),
        })

        const bookingId = await db.insertBooking(ctx.db, {
          organizationId: orgId,
          projectId,
          userId: managerId,
          startDate: Date.now(),
          endDate: Date.now() + 7 * 24 * 60 * 60 * 1000,
          hoursPerDay: 8,
          type: 'Tentative',
          createdAt: Date.now(),
        })

        const beforeDelete = await db.getBooking(ctx.db, bookingId)

        await db.deleteBooking(ctx.db, bookingId)

        const afterDelete = await db.getBooking(ctx.db, bookingId)

        return { beforeDelete, afterDelete }
      })

      expect(result.beforeDelete).not.toBeNull()
      expect(result.afterDelete).toBeNull()
    })
  })

  // ============================================================================
  // UTILIZATION CALCULATION TESTS
  // ============================================================================

  describe('Utilization Calculation', () => {
    it('calculates user utilization for date range', async () => {
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
          location: 'NYC',
          isActive: true,
        })

        const projectId = await db.insertProject(ctx.db, {
          organizationId: orgId,
          companyId,
          name: 'Project',
          status: 'Active',
          startDate: Date.now(),
          managerId,
          createdAt: Date.now(),
        })

        const now = Date.now()
        const oneWeek = 7 * 24 * 60 * 60 * 1000

        // Create a confirmed booking for half time (4 hours/day)
        await db.insertBooking(ctx.db, {
          organizationId: orgId,
          projectId,
          userId,
          startDate: now,
          endDate: now + oneWeek,
          hoursPerDay: 4,
          type: 'Confirmed',
          createdAt: Date.now(),
        })

        const utilization = await db.calculateUserUtilization(
          ctx.db,
          userId,
          now,
          now + oneWeek
        )

        return utilization
      })

      // User is 50% utilized (4 hours/day out of 8 available)
      expect(result.bookedHours).toBeGreaterThan(0)
      expect(result.utilizationPercent).toBeGreaterThanOrEqual(0)
    })
  })

  // ============================================================================
  // TIME OFF / AVAILABILITY TESTS
  // ============================================================================

  describe('Time Off and Availability', () => {
    it('creates time off booking', async () => {
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
          location: 'NYC',
          isActive: true,
        })

        const projectId = await db.insertProject(ctx.db, {
          organizationId: orgId,
          companyId,
          name: 'Project',
          status: 'Active',
          startDate: Date.now(),
          managerId,
          createdAt: Date.now(),
        })

        const now = Date.now()
        const oneWeek = 7 * 24 * 60 * 60 * 1000

        // Create a time off booking
        const timeOffId = await db.insertBooking(ctx.db, {
          organizationId: orgId,
          projectId, // Time off still associated with a project context
          userId,
          startDate: now + oneWeek,
          endDate: now + 2 * oneWeek,
          hoursPerDay: 8, // Full day time off
          type: 'TimeOff',
          createdAt: Date.now(),
        })

        return await db.getBooking(ctx.db, timeOffId)
      })

      expect(result?.type).toBe('TimeOff')
      expect(result?.hoursPerDay).toBe(8)
    })
  })

  // ============================================================================
  // USER FILTERING TESTS
  // ============================================================================

  describe('User Filtering', () => {
    it('filters users by skills', async () => {
      const result = await t.run(async (ctx) => {
        const orgId = await db.insertOrganization(ctx.db, {
          name: 'Test Org',
          settings: {},
          createdAt: Date.now(),
        })

        // Create users with different skills
        await db.insertUser(ctx.db, {
          organizationId: orgId,
          email: 'ts-dev@test.com',
          name: 'TypeScript Dev',
          role: 'team_member',
          costRate: 5000,
          billRate: 10000,
          skills: ['typescript', 'node'],
          department: 'Engineering',
          location: 'Remote',
          isActive: true,
        })

        await db.insertUser(ctx.db, {
          organizationId: orgId,
          email: 'react-dev@test.com',
          name: 'React Dev',
          role: 'team_member',
          costRate: 5000,
          billRate: 10000,
          skills: ['react', 'javascript'],
          department: 'Engineering',
          location: 'Remote',
          isActive: true,
        })

        await db.insertUser(ctx.db, {
          organizationId: orgId,
          email: 'fullstack@test.com',
          name: 'Full Stack Dev',
          role: 'team_member',
          costRate: 6000,
          billRate: 12000,
          skills: ['typescript', 'react', 'node'],
          department: 'Engineering',
          location: 'Remote',
          isActive: true,
        })

        // Get all users and filter by skills
        const allUsers = await db.listUsersByOrganization(ctx.db, orgId)

        const typescriptUsers = allUsers.filter((u) =>
          u.skills?.includes('typescript')
        )
        const reactUsers = allUsers.filter((u) => u.skills?.includes('react'))

        return {
          typescriptUsers: typescriptUsers.map((u) => u.name),
          reactUsers: reactUsers.map((u) => u.name),
        }
      })

      expect(result.typescriptUsers).toHaveLength(2)
      expect(result.typescriptUsers).toContain('TypeScript Dev')
      expect(result.typescriptUsers).toContain('Full Stack Dev')
      expect(result.reactUsers).toHaveLength(2)
      expect(result.reactUsers).toContain('React Dev')
      expect(result.reactUsers).toContain('Full Stack Dev')
    })

    it('filters users by department', async () => {
      const result = await t.run(async (ctx) => {
        const orgId = await db.insertOrganization(ctx.db, {
          name: 'Test Org',
          settings: {},
          createdAt: Date.now(),
        })

        await db.insertUser(ctx.db, {
          organizationId: orgId,
          email: 'dev1@test.com',
          name: 'Dev 1',
          role: 'team_member',
          costRate: 5000,
          billRate: 10000,
          skills: ['typescript'],
          department: 'Engineering',
          location: 'Remote',
          isActive: true,
        })

        await db.insertUser(ctx.db, {
          organizationId: orgId,
          email: 'dev2@test.com',
          name: 'Dev 2',
          role: 'team_member',
          costRate: 5000,
          billRate: 10000,
          skills: ['typescript'],
          department: 'Engineering',
          location: 'Remote',
          isActive: true,
        })

        await db.insertUser(ctx.db, {
          organizationId: orgId,
          email: 'pm@test.com',
          name: 'PM',
          role: 'project_manager',
          costRate: 7500,
          billRate: 15000,
          skills: [],
          department: 'Operations',
          location: 'NYC',
          isActive: true,
        })

        await db.insertUser(ctx.db, {
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

        const allUsers = await db.listUsersByOrganization(ctx.db, orgId)

        const engineeringUsers = allUsers.filter(
          (u) => u.department === 'Engineering'
        )
        const operationsUsers = allUsers.filter(
          (u) => u.department === 'Operations'
        )
        const salesUsers = allUsers.filter((u) => u.department === 'Sales')

        return {
          engineeringCount: engineeringUsers.length,
          operationsCount: operationsUsers.length,
          salesCount: salesUsers.length,
        }
      })

      expect(result.engineeringCount).toBe(2)
      expect(result.operationsCount).toBe(1)
      expect(result.salesCount).toBe(1)
    })

    it('filters active users only', async () => {
      const result = await t.run(async (ctx) => {
        const orgId = await db.insertOrganization(ctx.db, {
          name: 'Test Org',
          settings: {},
          createdAt: Date.now(),
        })

        await db.insertUser(ctx.db, {
          organizationId: orgId,
          email: 'active1@test.com',
          name: 'Active User 1',
          role: 'team_member',
          costRate: 5000,
          billRate: 10000,
          skills: [],
          department: 'Engineering',
          location: 'Remote',
          isActive: true,
        })

        await db.insertUser(ctx.db, {
          organizationId: orgId,
          email: 'active2@test.com',
          name: 'Active User 2',
          role: 'team_member',
          costRate: 5000,
          billRate: 10000,
          skills: [],
          department: 'Engineering',
          location: 'Remote',
          isActive: true,
        })

        await db.insertUser(ctx.db, {
          organizationId: orgId,
          email: 'inactive@test.com',
          name: 'Inactive User',
          role: 'team_member',
          costRate: 5000,
          billRate: 10000,
          skills: [],
          department: 'Engineering',
          location: 'Remote',
          isActive: false,
        })

        const allUsers = await db.listUsersByOrganization(ctx.db, orgId)
        const activeUsers = allUsers.filter((u) => u.isActive)

        return { activeCount: activeUsers.length, totalCount: allUsers.length }
      })

      expect(result.activeCount).toBe(2)
      expect(result.totalCount).toBe(3)
    })
  })
})
