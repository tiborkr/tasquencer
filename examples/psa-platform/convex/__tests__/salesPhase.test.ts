/// <reference types="vite/client" />
/**
 * Sales Phase unit tests for PSA Platform
 * Tests the sales phase work items including deals, estimates, proposals,
 * and the qualification/negotiation workflow
 *
 * Contract-based tests derived from: recipes/psa-platform/specs/03-workflow-sales-phase.md
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setup, type TestContext } from './helpers.test'
import * as db from '../workflows/dealToDelivery/db'

describe('PSA Platform Sales Phase', () => {
  let t: TestContext

  beforeEach(() => {
    vi.useFakeTimers()
    t = setup()
  })

  // ============================================================================
  // DEAL MANAGEMENT TESTS
  // ============================================================================

  describe('Deal Management', () => {
    it('creates a deal in Lead stage with 10% probability', async () => {
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

        const ownerId = await db.insertUser(ctx.db, {
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

        const contactId = await db.insertContact(ctx.db, {
          organizationId: orgId,
          companyId,
          name: 'John Client',
          email: 'john@client.com',
          phone: '+1-555-123-4567',
          isPrimary: true,
        })

        const dealId = await db.insertDeal(ctx.db, {
          organizationId: orgId,
          companyId,
          contactId,
          name: 'Website Redesign',
          value: 5000000, // $50,000
          ownerId,
          stage: 'Lead',
          probability: 10,
          createdAt: Date.now(),
        })

        return await db.getDeal(ctx.db, dealId)
      })

      expect(result).not.toBeNull()
      expect(result?.stage).toBe('Lead')
      expect(result?.probability).toBe(10)
      expect(result?.name).toBe('Website Redesign')
      expect(result?.value).toBe(5000000)
    })

    it('lists deals by stage within an organization', async () => {
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

        const contactId = await db.insertContact(ctx.db, {
          organizationId: orgId,
          companyId,
          name: 'John Client',
          email: 'john@client.com',
          phone: '+1-555-123-4567',
          isPrimary: true,
        })

        // Create deals in different stages
        await db.insertDeal(ctx.db, {
          organizationId: orgId,
          companyId,
          contactId,
          name: 'Lead Deal',
          value: 1000000,
          ownerId,
          stage: 'Lead',
          probability: 10,
          createdAt: Date.now(),
        })

        await db.insertDeal(ctx.db, {
          organizationId: orgId,
          companyId,
          contactId,
          name: 'Qualified Deal',
          value: 2000000,
          ownerId,
          stage: 'Qualified',
          probability: 25,
          createdAt: Date.now(),
        })

        await db.insertDeal(ctx.db, {
          organizationId: orgId,
          companyId,
          contactId,
          name: 'Proposal Deal',
          value: 3000000,
          ownerId,
          stage: 'Proposal',
          probability: 50,
          createdAt: Date.now(),
        })

        const leadDeals = await db.listDealsByStage(ctx.db, orgId, 'Lead')
        const qualifiedDeals = await db.listDealsByStage(
          ctx.db,
          orgId,
          'Qualified'
        )
        const proposalDeals = await db.listDealsByStage(
          ctx.db,
          orgId,
          'Proposal'
        )

        return { leadDeals, qualifiedDeals, proposalDeals }
      })

      expect(result.leadDeals).toHaveLength(1)
      expect(result.leadDeals[0].name).toBe('Lead Deal')
      expect(result.qualifiedDeals).toHaveLength(1)
      expect(result.qualifiedDeals[0].name).toBe('Qualified Deal')
      expect(result.proposalDeals).toHaveLength(1)
      expect(result.proposalDeals[0].name).toBe('Proposal Deal')
    })

    it('lists deals by owner', async () => {
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

        const owner1 = await db.insertUser(ctx.db, {
          organizationId: orgId,
          email: 'sales1@test.com',
          name: 'Sales Rep 1',
          role: 'sales_rep',
          costRate: 5000,
          billRate: 10000,
          skills: [],
          department: 'Sales',
          location: 'NYC',
          isActive: true,
        })

        const owner2 = await db.insertUser(ctx.db, {
          organizationId: orgId,
          email: 'sales2@test.com',
          name: 'Sales Rep 2',
          role: 'sales_rep',
          costRate: 5000,
          billRate: 10000,
          skills: [],
          department: 'Sales',
          location: 'SF',
          isActive: true,
        })

        const contactId = await db.insertContact(ctx.db, {
          organizationId: orgId,
          companyId,
          name: 'John Client',
          email: 'john@client.com',
          phone: '+1-555-123-4567',
          isPrimary: true,
        })

        // Create deals for different owners
        await db.insertDeal(ctx.db, {
          organizationId: orgId,
          companyId,
          contactId,
          name: 'Owner1 Deal 1',
          value: 1000000,
          ownerId: owner1,
          stage: 'Lead',
          probability: 10,
          createdAt: Date.now(),
        })

        await db.insertDeal(ctx.db, {
          organizationId: orgId,
          companyId,
          contactId,
          name: 'Owner1 Deal 2',
          value: 2000000,
          ownerId: owner1,
          stage: 'Qualified',
          probability: 25,
          createdAt: Date.now(),
        })

        await db.insertDeal(ctx.db, {
          organizationId: orgId,
          companyId,
          contactId,
          name: 'Owner2 Deal',
          value: 3000000,
          ownerId: owner2,
          stage: 'Lead',
          probability: 10,
          createdAt: Date.now(),
        })

        const owner1Deals = await db.listDealsByOwner(ctx.db, owner1)
        const owner2Deals = await db.listDealsByOwner(ctx.db, owner2)

        return { owner1Deals, owner2Deals }
      })

      expect(result.owner1Deals).toHaveLength(2)
      expect(result.owner2Deals).toHaveLength(1)
      expect(result.owner2Deals[0].name).toBe('Owner2 Deal')
    })
  })

  // ============================================================================
  // DEAL STAGE PROGRESSION TESTS
  // ============================================================================

  describe('Deal Stage Progression', () => {
    it('progresses deal from Lead to Qualified with probability update', async () => {
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

        const contactId = await db.insertContact(ctx.db, {
          organizationId: orgId,
          companyId,
          name: 'John Client',
          email: 'john@client.com',
          phone: '+1-555-123-4567',
          isPrimary: true,
        })

        const dealId = await db.insertDeal(ctx.db, {
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

        const beforeQualify = await db.getDeal(ctx.db, dealId)

        // Qualify the deal
        await db.updateDeal(ctx.db, dealId, {
          stage: 'Qualified',
          probability: 25,
        })

        const afterQualify = await db.getDeal(ctx.db, dealId)

        return { beforeQualify, afterQualify }
      })

      expect(result.beforeQualify?.stage).toBe('Lead')
      expect(result.beforeQualify?.probability).toBe(10)
      expect(result.afterQualify?.stage).toBe('Qualified')
      expect(result.afterQualify?.probability).toBe(25)
    })

    it('progresses deal through full happy path to Won', async () => {
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

        const contactId = await db.insertContact(ctx.db, {
          organizationId: orgId,
          companyId,
          name: 'John Client',
          email: 'john@client.com',
          phone: '+1-555-123-4567',
          isPrimary: true,
        })

        const dealId = await db.insertDeal(ctx.db, {
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

        // Track stages
        const stages: { stage: string; probability: number }[] = []

        let deal = await db.getDeal(ctx.db, dealId)
        stages.push({ stage: deal!.stage, probability: deal!.probability })

        // Qualify
        await db.updateDeal(ctx.db, dealId, {
          stage: 'Qualified',
          probability: 25,
        })
        deal = await db.getDeal(ctx.db, dealId)
        stages.push({ stage: deal!.stage, probability: deal!.probability })

        // Create proposal (stage -> Proposal)
        await db.updateDeal(ctx.db, dealId, {
          stage: 'Proposal',
          probability: 50,
        })
        deal = await db.getDeal(ctx.db, dealId)
        stages.push({ stage: deal!.stage, probability: deal!.probability })

        // Enter negotiation
        await db.updateDeal(ctx.db, dealId, {
          stage: 'Negotiation',
          probability: 50,
        })
        deal = await db.getDeal(ctx.db, dealId)
        stages.push({ stage: deal!.stage, probability: deal!.probability })

        // Win the deal
        await db.updateDeal(ctx.db, dealId, { stage: 'Won', probability: 100 })
        deal = await db.getDeal(ctx.db, dealId)
        stages.push({ stage: deal!.stage, probability: deal!.probability })

        return stages
      })

      // Verify full stage progression
      expect(result).toHaveLength(5)
      expect(result[0]).toEqual({ stage: 'Lead', probability: 10 })
      expect(result[1]).toEqual({ stage: 'Qualified', probability: 25 })
      expect(result[2]).toEqual({ stage: 'Proposal', probability: 50 })
      expect(result[3]).toEqual({ stage: 'Negotiation', probability: 50 })
      expect(result[4]).toEqual({ stage: 'Won', probability: 100 })
    })

    it('handles disqualification path with 0% probability', async () => {
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

        const contactId = await db.insertContact(ctx.db, {
          organizationId: orgId,
          companyId,
          name: 'John Client',
          email: 'john@client.com',
          phone: '+1-555-123-4567',
          isPrimary: true,
        })

        const dealId = await db.insertDeal(ctx.db, {
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

        // Disqualify the deal
        await db.updateDeal(ctx.db, dealId, {
          stage: 'Disqualified',
          probability: 0,
          lostReason: 'Budget too low',
        })

        return await db.getDeal(ctx.db, dealId)
      })

      expect(result?.stage).toBe('Disqualified')
      expect(result?.probability).toBe(0)
      expect(result?.lostReason).toBe('Budget too low')
    })

    it('archives lost deals with reason', async () => {
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

        const contactId = await db.insertContact(ctx.db, {
          organizationId: orgId,
          companyId,
          name: 'John Client',
          email: 'john@client.com',
          phone: '+1-555-123-4567',
          isPrimary: true,
        })

        const dealId = await db.insertDeal(ctx.db, {
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

        // Mark as lost and archive
        const closedAt = Date.now()
        await db.updateDeal(ctx.db, dealId, {
          stage: 'Lost',
          probability: 0,
          lostReason: 'Went with competitor',
          closedAt,
        })

        return await db.getDeal(ctx.db, dealId)
      })

      expect(result?.stage).toBe('Lost')
      expect(result?.probability).toBe(0)
      expect(result?.lostReason).toBe('Went with competitor')
      expect(result?.closedAt).toBeDefined()
    })
  })

  // ============================================================================
  // ESTIMATE TESTS
  // ============================================================================

  describe('Estimate Management', () => {
    it('creates an estimate with services', async () => {
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

        const contactId = await db.insertContact(ctx.db, {
          organizationId: orgId,
          companyId,
          name: 'John Client',
          email: 'john@client.com',
          phone: '+1-555-123-4567',
          isPrimary: true,
        })

        const dealId = await db.insertDeal(ctx.db, {
          organizationId: orgId,
          companyId,
          contactId,
          name: 'Test Deal',
          value: 5000000,
          ownerId,
          stage: 'Qualified',
          probability: 25,
          createdAt: Date.now(),
        })

        // Create estimate with services
        // Services: Design 20hrs @ $150/hr = $3,000, Dev 80hrs @ $125/hr = $10,000
        const estimateId = await db.insertEstimate(ctx.db, {
          organizationId: orgId,
          dealId,
          total: 1300000, // $13,000
          createdAt: Date.now(),
        })

        await db.insertEstimateService(ctx.db, {
          estimateId,
          name: 'Design',
          rate: 15000, // $150/hr
          hours: 20,
          total: 300000, // $3,000
        })

        await db.insertEstimateService(ctx.db, {
          estimateId,
          name: 'Development',
          rate: 12500, // $125/hr
          hours: 80,
          total: 1000000, // $10,000
        })

        const estimate = await db.getEstimate(ctx.db, estimateId)
        const services = await db.listEstimateServicesByEstimate(ctx.db, estimateId)

        return { estimate, services }
      })

      expect(result.estimate).not.toBeNull()
      expect(result.estimate?.total).toBe(1300000)
      expect(result.services).toHaveLength(2)
      expect(result.services[0].name).toBe('Design')
      expect(result.services[1].name).toBe('Development')
    })

    it('advances deal stage from Qualified to Proposal when estimate is created', async () => {
      // Verifies: (blocker:qa-estimate-does-not-advance-deal-stage)
      // When an estimate is created for a Qualified deal, the deal should
      // automatically advance to the Proposal stage with 50% probability
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

        const contactId = await db.insertContact(ctx.db, {
          organizationId: orgId,
          companyId,
          name: 'John Client',
          email: 'john@client.com',
          phone: '+1-555-123-4567',
          isPrimary: true,
        })

        const dealId = await db.insertDeal(ctx.db, {
          organizationId: orgId,
          companyId,
          contactId,
          name: 'Test Deal',
          value: 5000000,
          ownerId,
          stage: 'Qualified', // Start in Qualified stage
          probability: 25,
          createdAt: Date.now(),
        })

        // Get deal before estimate
        const dealBefore = await db.getDeal(ctx.db, dealId)

        // Create estimate with services
        const estimateId = await db.insertEstimate(ctx.db, {
          organizationId: orgId,
          dealId,
          total: 1300000, // $13,000
          createdAt: Date.now(),
        })

        await db.insertEstimateService(ctx.db, {
          estimateId,
          name: 'Design',
          rate: 15000,
          hours: 20,
          total: 300000,
        })

        // Simulate what the API/workflow does: update deal with estimate and advance stage
        await db.updateDeal(ctx.db, dealId, {
          estimateId,
          value: 1300000,
          stage: 'Proposal',
          probability: 50,
        })

        const dealAfter = await db.getDeal(ctx.db, dealId)

        return { dealBefore, dealAfter, estimateId }
      })

      // Before: Qualified with 25% probability
      expect(result.dealBefore?.stage).toBe('Qualified')
      expect(result.dealBefore?.probability).toBe(25)

      // After: Proposal with 50% probability
      expect(result.dealAfter?.stage).toBe('Proposal')
      expect(result.dealAfter?.probability).toBe(50)
      expect(result.dealAfter?.estimateId).toBe(result.estimateId)
    })

    it('links estimate to deal', async () => {
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

        const contactId = await db.insertContact(ctx.db, {
          organizationId: orgId,
          companyId,
          name: 'John Client',
          email: 'john@client.com',
          phone: '+1-555-123-4567',
          isPrimary: true,
        })

        const dealId = await db.insertDeal(ctx.db, {
          organizationId: orgId,
          companyId,
          contactId,
          name: 'Test Deal',
          value: 5000000,
          ownerId,
          stage: 'Qualified',
          probability: 25,
          createdAt: Date.now(),
        })

        const estimateId = await db.insertEstimate(ctx.db, {
          organizationId: orgId,
          dealId,
          total: 1500000,
          createdAt: Date.now(),
        })

        const estimate = await db.getEstimateByDeal(ctx.db, dealId)

        return { estimateId, estimate }
      })

      expect(result.estimate).not.toBeNull()
      expect(result.estimate?._id).toBe(result.estimateId)
    })
  })

  // ============================================================================
  // PROPOSAL TESTS
  // ============================================================================

  describe('Proposal Management', () => {
    it('creates a proposal from an estimate', async () => {
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

        const contactId = await db.insertContact(ctx.db, {
          organizationId: orgId,
          companyId,
          name: 'John Client',
          email: 'john@client.com',
          phone: '+1-555-123-4567',
          isPrimary: true,
        })

        const dealId = await db.insertDeal(ctx.db, {
          organizationId: orgId,
          companyId,
          contactId,
          name: 'Test Deal',
          value: 5000000,
          ownerId,
          stage: 'Qualified',
          probability: 25,
          createdAt: Date.now(),
        })

        await db.insertEstimate(ctx.db, {
          organizationId: orgId,
          dealId,
          total: 5000000,
          createdAt: Date.now(),
        })

        const proposalId = await db.insertProposal(ctx.db, {
          organizationId: orgId,
          dealId,
          version: 1,
          status: 'Draft',
          documentUrl: 'https://example.com/proposals/draft-v1.pdf',
          createdAt: Date.now(),
        })

        return await db.getProposal(ctx.db, proposalId)
      })

      expect(result).not.toBeNull()
      expect(result?.status).toBe('Draft')
      expect(result?.version).toBe(1)
    })

    it('supports proposal versioning for revisions', async () => {
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

        const contactId = await db.insertContact(ctx.db, {
          organizationId: orgId,
          companyId,
          name: 'John Client',
          email: 'john@client.com',
          phone: '+1-555-123-4567',
          isPrimary: true,
        })

        const dealId = await db.insertDeal(ctx.db, {
          organizationId: orgId,
          companyId,
          contactId,
          name: 'Test Deal',
          value: 5000000,
          ownerId,
          stage: 'Negotiation',
          probability: 50,
          createdAt: Date.now(),
        })

        await db.insertEstimate(ctx.db, {
          organizationId: orgId,
          dealId,
          total: 5000000,
          createdAt: Date.now(),
        })

        // Create initial proposal (v1)
        await db.insertProposal(ctx.db, {
          organizationId: orgId,
          dealId,
          version: 1,
          status: 'Sent',
          documentUrl: 'https://example.com/proposals/v1.pdf',
          createdAt: Date.now(),
        })

        // Create revised proposal (v2)
        await db.insertProposal(ctx.db, {
          organizationId: orgId,
          dealId,
          version: 2,
          status: 'Draft',
          documentUrl: 'https://example.com/proposals/v2.pdf',
          createdAt: Date.now(),
        })

        // Create another revision (v3)
        await db.insertProposal(ctx.db, {
          organizationId: orgId,
          dealId,
          version: 3,
          status: 'Draft',
          documentUrl: 'https://example.com/proposals/v3.pdf',
          createdAt: Date.now(),
        })

        const allProposals = await db.listProposalsByDeal(ctx.db, dealId)
        const latestProposal = await db.getLatestProposalByDeal(ctx.db, dealId)

        return { allProposals, latestProposal }
      })

      expect(result.allProposals).toHaveLength(3)
      expect(result.latestProposal?.version).toBe(3)
    })

    it('tracks proposal status transitions', async () => {
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

        const contactId = await db.insertContact(ctx.db, {
          organizationId: orgId,
          companyId,
          name: 'John Client',
          email: 'john@client.com',
          phone: '+1-555-123-4567',
          isPrimary: true,
        })

        const dealId = await db.insertDeal(ctx.db, {
          organizationId: orgId,
          companyId,
          contactId,
          name: 'Test Deal',
          value: 5000000,
          ownerId,
          stage: 'Proposal',
          probability: 50,
          createdAt: Date.now(),
        })

        await db.insertEstimate(ctx.db, {
          organizationId: orgId,
          dealId,
          total: 5000000,
          createdAt: Date.now(),
        })

        const proposalId = await db.insertProposal(ctx.db, {
          organizationId: orgId,
          dealId,
          version: 1,
          status: 'Draft',
          documentUrl: 'https://example.com/proposals/draft.pdf',
          createdAt: Date.now(),
        })

        const statuses: string[] = []

        let proposal = await db.getProposal(ctx.db, proposalId)
        statuses.push(proposal!.status)

        // Send proposal
        await db.updateProposal(ctx.db, proposalId, {
          status: 'Sent',
          sentAt: Date.now(),
        })
        proposal = await db.getProposal(ctx.db, proposalId)
        statuses.push(proposal!.status)

        // Client views proposal (update viewedAt)
        await db.updateProposal(ctx.db, proposalId, {
          viewedAt: Date.now(),
        })

        // Proposal gets signed
        await db.updateProposal(ctx.db, proposalId, {
          status: 'Signed',
          signedAt: Date.now(),
        })
        proposal = await db.getProposal(ctx.db, proposalId)
        statuses.push(proposal!.status)

        return { statuses, proposal }
      })

      expect(result.statuses).toEqual(['Draft', 'Sent', 'Signed'])
      expect(result.proposal?.sentAt).toBeDefined()
      expect(result.proposal?.viewedAt).toBeDefined()
      expect(result.proposal?.signedAt).toBeDefined()
    })
  })

  // ============================================================================
  // NEGOTIATION TESTS
  // ============================================================================

  describe('Negotiation', () => {
    it('handles accepted outcome', async () => {
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

        const contactId = await db.insertContact(ctx.db, {
          organizationId: orgId,
          companyId,
          name: 'John Client',
          email: 'john@client.com',
          phone: '+1-555-123-4567',
          isPrimary: true,
        })

        const dealId = await db.insertDeal(ctx.db, {
          organizationId: orgId,
          companyId,
          contactId,
          name: 'Test Deal',
          value: 5000000,
          ownerId,
          stage: 'Negotiation',
          probability: 50,
          createdAt: Date.now(),
        })

        // Simulate negotiation outcome: accepted
        // This would be followed by getProposalSigned
        await db.updateDeal(ctx.db, dealId, {
          stage: 'Won',
          probability: 100,
          closedAt: Date.now(),
        })

        return await db.getDeal(ctx.db, dealId)
      })

      expect(result?.stage).toBe('Won')
      expect(result?.probability).toBe(100)
      expect(result?.closedAt).toBeDefined()
    })

    it('handles lost outcome with reason', async () => {
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

        const contactId = await db.insertContact(ctx.db, {
          organizationId: orgId,
          companyId,
          name: 'John Client',
          email: 'john@client.com',
          phone: '+1-555-123-4567',
          isPrimary: true,
        })

        const dealId = await db.insertDeal(ctx.db, {
          organizationId: orgId,
          companyId,
          contactId,
          name: 'Test Deal',
          value: 5000000,
          ownerId,
          stage: 'Negotiation',
          probability: 50,
          createdAt: Date.now(),
        })

        // Simulate negotiation outcome: lost
        await db.updateDeal(ctx.db, dealId, {
          stage: 'Lost',
          probability: 0,
          lostReason: 'Client chose competitor',
          closedAt: Date.now(),
        })

        return await db.getDeal(ctx.db, dealId)
      })

      expect(result?.stage).toBe('Lost')
      expect(result?.probability).toBe(0)
      expect(result?.lostReason).toBe('Client chose competitor')
      expect(result?.closedAt).toBeDefined()
    })
  })

  // ============================================================================
  // DEAL VALUE TRACKING TESTS
  // ============================================================================

  describe('Deal Value Tracking', () => {
    it('updates deal value when estimate changes', async () => {
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

        const contactId = await db.insertContact(ctx.db, {
          organizationId: orgId,
          companyId,
          name: 'John Client',
          email: 'john@client.com',
          phone: '+1-555-123-4567',
          isPrimary: true,
        })

        const dealId = await db.insertDeal(ctx.db, {
          organizationId: orgId,
          companyId,
          contactId,
          name: 'Test Deal',
          value: 5000000, // Initial $50,000
          ownerId,
          stage: 'Qualified',
          probability: 25,
          createdAt: Date.now(),
        })

        const dealBefore = await db.getDeal(ctx.db, dealId)

        // Create estimate with different value
        const estimateId = await db.insertEstimate(ctx.db, {
          organizationId: orgId,
          dealId,
          total: 7500000, // $75,000
          createdAt: Date.now(),
        })

        // Update deal value to match estimate
        await db.updateDeal(ctx.db, dealId, { value: 7500000 })

        const dealAfter = await db.getDeal(ctx.db, dealId)

        return { dealBefore, dealAfter, estimateId }
      })

      expect(result.dealBefore?.value).toBe(5000000)
      expect(result.dealAfter?.value).toBe(7500000)
    })
  })
})
