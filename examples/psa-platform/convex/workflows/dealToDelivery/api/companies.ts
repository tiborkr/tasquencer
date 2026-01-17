/**
 * Companies API
 *
 * Query endpoints for companies and contacts.
 *
 * TENET-AUTHZ: All queries are protected by scope-based authorization.
 * TENET-DOMAIN-BOUNDARY: All data access goes through domain functions (db.ts).
 *
 * Reference: .review/recipes/psa-platform/specs/26-api-endpoints.md
 */
import { v } from 'convex/values'
import { query } from '../../../_generated/server'
import { requirePsaStaffMember } from '../domain/services/authorizationService'
import {
  getCompany as getCompanyFromDb,
  listCompaniesByOrganization,
  listContactsByCompany,
  listContactsByOrganization,
} from '../db'
import { getUser } from '../db/users'

/**
 * Lists companies for the current user's organization.
 * Authorization: Requires dealToDelivery:staff scope.
 *
 * @returns Array of companies (limited to 50)
 */
export const listCompanies = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requirePsaStaffMember(ctx)

    // Get current user to determine their organization
    const user = await getUser(ctx.db, userId)
    if (!user) {
      return []
    }

    // Use domain function for data access
    return await listCompaniesByOrganization(ctx.db, user.organizationId)
  },
})

/**
 * Gets a company by ID with its contacts.
 * Authorization: Requires dealToDelivery:staff scope.
 *
 * @param args.companyId - The company ID
 * @returns The company document with contacts, or null if not found
 */
export const getCompany = query({
  args: { companyId: v.id('companies') },
  handler: async (ctx, args) => {
    await requirePsaStaffMember(ctx)

    // Use Promise.all for parallel loading of company and contacts
    const [company, contacts] = await Promise.all([
      getCompanyFromDb(ctx.db, args.companyId),
      listContactsByCompany(ctx.db, args.companyId),
    ])

    if (!company) {
      return null
    }

    return {
      ...company,
      contacts,
    }
  },
})

/**
 * Lists contacts, optionally filtered by company.
 * Authorization: Requires dealToDelivery:staff scope.
 *
 * @param args.companyId - Optional company ID to filter by
 * @returns Array of contacts
 */
export const listContacts = query({
  args: { companyId: v.optional(v.id('companies')) },
  handler: async (ctx, args) => {
    const userId = await requirePsaStaffMember(ctx)

    // If companyId provided, filter by company
    if (args.companyId) {
      return await listContactsByCompany(ctx.db, args.companyId)
    }

    // Otherwise, list all contacts for the user's organization
    const user = await getUser(ctx.db, userId)
    if (!user) {
      return []
    }

    return await listContactsByOrganization(ctx.db, user.organizationId)
  },
})
