// Deal To Delivery Database Operations
// =====================================
// CRUD functions for all domain tables. All monetary values are in cents.

import type { DatabaseReader, DatabaseWriter } from '../../_generated/server'
import type { Doc, Id } from '../../_generated/dataModel'

// ============================================================================
// ORGANIZATIONS
// ============================================================================

export async function insertOrganization(
  db: DatabaseWriter,
  organization: Omit<Doc<'organizations'>, '_id' | '_creationTime'>,
): Promise<Id<'organizations'>> {
  return await db.insert('organizations', organization)
}

export async function getOrganization(
  db: DatabaseReader,
  organizationId: Id<'organizations'>,
): Promise<Doc<'organizations'> | null> {
  return await db.get(organizationId)
}

export async function updateOrganization(
  db: DatabaseWriter,
  organizationId: Id<'organizations'>,
  updates: Partial<Omit<Doc<'organizations'>, '_id' | '_creationTime'>>,
): Promise<void> {
  await db.patch(organizationId, updates)
}

// ============================================================================
// USERS
// ============================================================================

export async function insertUser(
  db: DatabaseWriter,
  user: Omit<Doc<'users'>, '_id' | '_creationTime'>,
): Promise<Id<'users'>> {
  return await db.insert('users', user)
}

export async function getUser(
  db: DatabaseReader,
  userId: Id<'users'>,
): Promise<Doc<'users'> | null> {
  return await db.get(userId)
}

export async function getUserByEmail(
  db: DatabaseReader,
  organizationId: Id<'organizations'>,
  email: string,
): Promise<Doc<'users'> | null> {
  return await db
    .query('users')
    .withIndex('by_email', (q) =>
      q.eq('organizationId', organizationId).eq('email', email)
    )
    .unique()
}

export async function listUsersByOrganization(
  db: DatabaseReader,
  organizationId: Id<'organizations'>,
): Promise<Doc<'users'>[]> {
  return await db
    .query('users')
    .withIndex('by_organization', (q) => q.eq('organizationId', organizationId))
    .collect()
}

export async function listActiveUsers(
  db: DatabaseReader,
  organizationId: Id<'organizations'>,
): Promise<Doc<'users'>[]> {
  const users = await listUsersByOrganization(db, organizationId)
  return users.filter((u) => u.isActive)
}

export async function updateUser(
  db: DatabaseWriter,
  userId: Id<'users'>,
  updates: Partial<Omit<Doc<'users'>, '_id' | '_creationTime'>>,
): Promise<void> {
  await db.patch(userId, updates)
}

// ============================================================================
// COMPANIES
// ============================================================================

export async function insertCompany(
  db: DatabaseWriter,
  company: Omit<Doc<'companies'>, '_id' | '_creationTime'>,
): Promise<Id<'companies'>> {
  return await db.insert('companies', company)
}

export async function getCompany(
  db: DatabaseReader,
  companyId: Id<'companies'>,
): Promise<Doc<'companies'> | null> {
  return await db.get(companyId)
}

export async function listCompaniesByOrganization(
  db: DatabaseReader,
  organizationId: Id<'organizations'>,
): Promise<Doc<'companies'>[]> {
  return await db
    .query('companies')
    .withIndex('by_organization', (q) => q.eq('organizationId', organizationId))
    .collect()
}

export async function updateCompany(
  db: DatabaseWriter,
  companyId: Id<'companies'>,
  updates: Partial<Omit<Doc<'companies'>, '_id' | '_creationTime'>>,
): Promise<void> {
  await db.patch(companyId, updates)
}

// ============================================================================
// CONTACTS
// ============================================================================

export async function insertContact(
  db: DatabaseWriter,
  contact: Omit<Doc<'contacts'>, '_id' | '_creationTime'>,
): Promise<Id<'contacts'>> {
  return await db.insert('contacts', contact)
}

export async function getContact(
  db: DatabaseReader,
  contactId: Id<'contacts'>,
): Promise<Doc<'contacts'> | null> {
  return await db.get(contactId)
}

export async function listContactsByCompany(
  db: DatabaseReader,
  companyId: Id<'companies'>,
): Promise<Doc<'contacts'>[]> {
  return await db
    .query('contacts')
    .withIndex('by_company', (q) => q.eq('companyId', companyId))
    .collect()
}

export async function getPrimaryContactByCompany(
  db: DatabaseReader,
  companyId: Id<'companies'>,
): Promise<Doc<'contacts'> | null> {
  const contacts = await listContactsByCompany(db, companyId)
  return contacts.find((c) => c.isPrimary) ?? null
}

export async function updateContact(
  db: DatabaseWriter,
  contactId: Id<'contacts'>,
  updates: Partial<Omit<Doc<'contacts'>, '_id' | '_creationTime'>>,
): Promise<void> {
  await db.patch(contactId, updates)
}

// ============================================================================
// DEALS
// ============================================================================

export async function insertDeal(
  db: DatabaseWriter,
  deal: Omit<Doc<'deals'>, '_id' | '_creationTime'>,
): Promise<Id<'deals'>> {
  return await db.insert('deals', deal)
}

export async function getDeal(
  db: DatabaseReader,
  dealId: Id<'deals'>,
): Promise<Doc<'deals'> | null> {
  return await db.get(dealId)
}

export async function getDealByWorkflowId(
  db: DatabaseReader,
  workflowId: Id<'tasquencerWorkflows'>,
): Promise<Doc<'deals'> | null> {
  return await db
    .query('deals')
    .withIndex('by_workflow_id', (q) => q.eq('workflowId', workflowId))
    .unique()
}

export async function listDealsByOrganization(
  db: DatabaseReader,
  organizationId: Id<'organizations'>,
): Promise<Doc<'deals'>[]> {
  return await db
    .query('deals')
    .withIndex('by_organization', (q) => q.eq('organizationId', organizationId))
    .collect()
}

export async function listDealsByStage(
  db: DatabaseReader,
  organizationId: Id<'organizations'>,
  stage: Doc<'deals'>['stage'],
): Promise<Doc<'deals'>[]> {
  return await db
    .query('deals')
    .withIndex('by_stage', (q) =>
      q.eq('organizationId', organizationId).eq('stage', stage)
    )
    .collect()
}

export async function listDealsByOwner(
  db: DatabaseReader,
  ownerId: Id<'users'>,
): Promise<Doc<'deals'>[]> {
  return await db
    .query('deals')
    .withIndex('by_owner', (q) => q.eq('ownerId', ownerId))
    .collect()
}

export async function updateDeal(
  db: DatabaseWriter,
  dealId: Id<'deals'>,
  updates: Partial<Omit<Doc<'deals'>, '_id' | '_creationTime'>>,
): Promise<void> {
  await db.patch(dealId, updates)
}

// ============================================================================
// ESTIMATES
// ============================================================================

export async function insertEstimate(
  db: DatabaseWriter,
  estimate: Omit<Doc<'estimates'>, '_id' | '_creationTime'>,
): Promise<Id<'estimates'>> {
  return await db.insert('estimates', estimate)
}

export async function getEstimate(
  db: DatabaseReader,
  estimateId: Id<'estimates'>,
): Promise<Doc<'estimates'> | null> {
  return await db.get(estimateId)
}

export async function getEstimateByDeal(
  db: DatabaseReader,
  dealId: Id<'deals'>,
): Promise<Doc<'estimates'> | null> {
  return await db
    .query('estimates')
    .withIndex('by_deal', (q) => q.eq('dealId', dealId))
    .first()
}

export async function updateEstimate(
  db: DatabaseWriter,
  estimateId: Id<'estimates'>,
  updates: Partial<Omit<Doc<'estimates'>, '_id' | '_creationTime'>>,
): Promise<void> {
  await db.patch(estimateId, updates)
}

// ============================================================================
// ESTIMATE SERVICES
// ============================================================================

export async function insertEstimateService(
  db: DatabaseWriter,
  service: Omit<Doc<'estimateServices'>, '_id' | '_creationTime'>,
): Promise<Id<'estimateServices'>> {
  return await db.insert('estimateServices', service)
}

export async function listEstimateServicesByEstimate(
  db: DatabaseReader,
  estimateId: Id<'estimates'>,
): Promise<Doc<'estimateServices'>[]> {
  return await db
    .query('estimateServices')
    .withIndex('by_estimate', (q) => q.eq('estimateId', estimateId))
    .collect()
}

export async function updateEstimateService(
  db: DatabaseWriter,
  serviceId: Id<'estimateServices'>,
  updates: Partial<Omit<Doc<'estimateServices'>, '_id' | '_creationTime'>>,
): Promise<void> {
  await db.patch(serviceId, updates)
}

export async function deleteEstimateService(
  db: DatabaseWriter,
  serviceId: Id<'estimateServices'>,
): Promise<void> {
  await db.delete(serviceId)
}

// ============================================================================
// PROPOSALS
// ============================================================================

export async function insertProposal(
  db: DatabaseWriter,
  proposal: Omit<Doc<'proposals'>, '_id' | '_creationTime'>,
): Promise<Id<'proposals'>> {
  return await db.insert('proposals', proposal)
}

export async function getProposal(
  db: DatabaseReader,
  proposalId: Id<'proposals'>,
): Promise<Doc<'proposals'> | null> {
  return await db.get(proposalId)
}

export async function listProposalsByDeal(
  db: DatabaseReader,
  dealId: Id<'deals'>,
): Promise<Doc<'proposals'>[]> {
  return await db
    .query('proposals')
    .withIndex('by_deal', (q) => q.eq('dealId', dealId))
    .collect()
}

export async function getLatestProposalByDeal(
  db: DatabaseReader,
  dealId: Id<'deals'>,
): Promise<Doc<'proposals'> | null> {
  const proposals = await listProposalsByDeal(db, dealId)
  if (proposals.length === 0) return null
  return proposals.sort((a, b) => b.version - a.version)[0]
}

export async function updateProposal(
  db: DatabaseWriter,
  proposalId: Id<'proposals'>,
  updates: Partial<Omit<Doc<'proposals'>, '_id' | '_creationTime'>>,
): Promise<void> {
  await db.patch(proposalId, updates)
}

// ============================================================================
// PROJECTS
// ============================================================================

export async function insertProject(
  db: DatabaseWriter,
  project: Omit<Doc<'projects'>, '_id' | '_creationTime'>,
): Promise<Id<'projects'>> {
  return await db.insert('projects', project)
}

export async function getProject(
  db: DatabaseReader,
  projectId: Id<'projects'>,
): Promise<Doc<'projects'> | null> {
  return await db.get(projectId)
}

export async function getProjectByWorkflowId(
  db: DatabaseReader,
  workflowId: Id<'tasquencerWorkflows'>,
): Promise<Doc<'projects'> | null> {
  return await db
    .query('projects')
    .withIndex('by_workflow_id', (q) => q.eq('workflowId', workflowId))
    .unique()
}

export async function listProjectsByOrganization(
  db: DatabaseReader,
  organizationId: Id<'organizations'>,
): Promise<Doc<'projects'>[]> {
  return await db
    .query('projects')
    .withIndex('by_organization', (q) => q.eq('organizationId', organizationId))
    .collect()
}

export async function listProjectsByStatus(
  db: DatabaseReader,
  organizationId: Id<'organizations'>,
  status: Doc<'projects'>['status'],
): Promise<Doc<'projects'>[]> {
  return await db
    .query('projects')
    .withIndex('by_status', (q) =>
      q.eq('organizationId', organizationId).eq('status', status)
    )
    .collect()
}

export async function listProjectsByManager(
  db: DatabaseReader,
  managerId: Id<'users'>,
): Promise<Doc<'projects'>[]> {
  return await db
    .query('projects')
    .withIndex('by_manager', (q) => q.eq('managerId', managerId))
    .collect()
}

export async function updateProject(
  db: DatabaseWriter,
  projectId: Id<'projects'>,
  updates: Partial<Omit<Doc<'projects'>, '_id' | '_creationTime'>>,
): Promise<void> {
  await db.patch(projectId, updates)
}

// ============================================================================
// BUDGETS
// ============================================================================

export async function insertBudget(
  db: DatabaseWriter,
  budget: Omit<Doc<'budgets'>, '_id' | '_creationTime'>,
): Promise<Id<'budgets'>> {
  return await db.insert('budgets', budget)
}

export async function getBudget(
  db: DatabaseReader,
  budgetId: Id<'budgets'>,
): Promise<Doc<'budgets'> | null> {
  return await db.get(budgetId)
}

export async function getBudgetByProject(
  db: DatabaseReader,
  projectId: Id<'projects'>,
): Promise<Doc<'budgets'> | null> {
  return await db
    .query('budgets')
    .withIndex('by_project', (q) => q.eq('projectId', projectId))
    .unique()
}

export async function updateBudget(
  db: DatabaseWriter,
  budgetId: Id<'budgets'>,
  updates: Partial<Omit<Doc<'budgets'>, '_id' | '_creationTime'>>,
): Promise<void> {
  await db.patch(budgetId, updates)
}

// ============================================================================
// SERVICES (Budget Line Items)
// ============================================================================

export async function insertService(
  db: DatabaseWriter,
  service: Omit<Doc<'services'>, '_id' | '_creationTime'>,
): Promise<Id<'services'>> {
  return await db.insert('services', service)
}

export async function getService(
  db: DatabaseReader,
  serviceId: Id<'services'>,
): Promise<Doc<'services'> | null> {
  return await db.get(serviceId)
}

export async function listServicesByBudget(
  db: DatabaseReader,
  budgetId: Id<'budgets'>,
): Promise<Doc<'services'>[]> {
  return await db
    .query('services')
    .withIndex('by_budget', (q) => q.eq('budgetId', budgetId))
    .collect()
}

export async function updateService(
  db: DatabaseWriter,
  serviceId: Id<'services'>,
  updates: Partial<Omit<Doc<'services'>, '_id' | '_creationTime'>>,
): Promise<void> {
  await db.patch(serviceId, updates)
}

export async function deleteService(
  db: DatabaseWriter,
  serviceId: Id<'services'>,
): Promise<void> {
  await db.delete(serviceId)
}

// ============================================================================
// MILESTONES
// ============================================================================

export async function insertMilestone(
  db: DatabaseWriter,
  milestone: Omit<Doc<'milestones'>, '_id' | '_creationTime'>,
): Promise<Id<'milestones'>> {
  return await db.insert('milestones', milestone)
}

export async function getMilestone(
  db: DatabaseReader,
  milestoneId: Id<'milestones'>,
): Promise<Doc<'milestones'> | null> {
  return await db.get(milestoneId)
}

export async function listMilestonesByProject(
  db: DatabaseReader,
  projectId: Id<'projects'>,
): Promise<Doc<'milestones'>[]> {
  const milestones = await db
    .query('milestones')
    .withIndex('by_project', (q) => q.eq('projectId', projectId))
    .collect()
  return milestones.sort((a, b) => a.sortOrder - b.sortOrder)
}

export async function updateMilestone(
  db: DatabaseWriter,
  milestoneId: Id<'milestones'>,
  updates: Partial<Omit<Doc<'milestones'>, '_id' | '_creationTime'>>,
): Promise<void> {
  await db.patch(milestoneId, updates)
}

export async function deleteMilestone(
  db: DatabaseWriter,
  milestoneId: Id<'milestones'>,
): Promise<void> {
  await db.delete(milestoneId)
}

// ============================================================================
// TASKS
// ============================================================================

export async function insertTask(
  db: DatabaseWriter,
  task: Omit<Doc<'tasks'>, '_id' | '_creationTime'>,
): Promise<Id<'tasks'>> {
  return await db.insert('tasks', task)
}

export async function getTask(
  db: DatabaseReader,
  taskId: Id<'tasks'>,
): Promise<Doc<'tasks'> | null> {
  return await db.get(taskId)
}

export async function listTasksByProject(
  db: DatabaseReader,
  projectId: Id<'projects'>,
): Promise<Doc<'tasks'>[]> {
  const tasks = await db
    .query('tasks')
    .withIndex('by_project', (q) => q.eq('projectId', projectId))
    .collect()
  return tasks.sort((a, b) => a.sortOrder - b.sortOrder)
}

export async function listTasksByParent(
  db: DatabaseReader,
  parentTaskId: Id<'tasks'>,
): Promise<Doc<'tasks'>[]> {
  const tasks = await db
    .query('tasks')
    .withIndex('by_parent', (q) => q.eq('parentTaskId', parentTaskId))
    .collect()
  return tasks.sort((a, b) => a.sortOrder - b.sortOrder)
}

export async function listRootTasks(
  db: DatabaseReader,
  projectId: Id<'projects'>,
): Promise<Doc<'tasks'>[]> {
  const tasks = await listTasksByProject(db, projectId)
  return tasks.filter((t) => !t.parentTaskId)
}

export async function updateTask(
  db: DatabaseWriter,
  taskId: Id<'tasks'>,
  updates: Partial<Omit<Doc<'tasks'>, '_id' | '_creationTime'>>,
): Promise<void> {
  await db.patch(taskId, updates)
}

export async function deleteTask(
  db: DatabaseWriter,
  taskId: Id<'tasks'>,
): Promise<void> {
  await db.delete(taskId)
}

// ============================================================================
// BOOKINGS
// ============================================================================

export async function insertBooking(
  db: DatabaseWriter,
  booking: Omit<Doc<'bookings'>, '_id' | '_creationTime'>,
): Promise<Id<'bookings'>> {
  return await db.insert('bookings', booking)
}

export async function getBooking(
  db: DatabaseReader,
  bookingId: Id<'bookings'>,
): Promise<Doc<'bookings'> | null> {
  return await db.get(bookingId)
}

export async function listBookingsByUser(
  db: DatabaseReader,
  userId: Id<'users'>,
): Promise<Doc<'bookings'>[]> {
  return await db
    .query('bookings')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .collect()
}

export async function listBookingsByProject(
  db: DatabaseReader,
  projectId: Id<'projects'>,
): Promise<Doc<'bookings'>[]> {
  return await db
    .query('bookings')
    .withIndex('by_project', (q) => q.eq('projectId', projectId))
    .collect()
}

export async function listBookingsByDateRange(
  db: DatabaseReader,
  organizationId: Id<'organizations'>,
  startDate: number,
  endDate: number,
): Promise<Doc<'bookings'>[]> {
  return await db
    .query('bookings')
    .withIndex('by_date_range', (q) =>
      q
        .eq('organizationId', organizationId)
        .gte('startDate', startDate)
        .lte('startDate', endDate)
    )
    .collect()
}

export async function updateBooking(
  db: DatabaseWriter,
  bookingId: Id<'bookings'>,
  updates: Partial<Omit<Doc<'bookings'>, '_id' | '_creationTime'>>,
): Promise<void> {
  await db.patch(bookingId, updates)
}

export async function deleteBooking(
  db: DatabaseWriter,
  bookingId: Id<'bookings'>,
): Promise<void> {
  await db.delete(bookingId)
}

// ============================================================================
// TIME ENTRIES
// ============================================================================

export async function insertTimeEntry(
  db: DatabaseWriter,
  entry: Omit<Doc<'timeEntries'>, '_id' | '_creationTime'>,
): Promise<Id<'timeEntries'>> {
  return await db.insert('timeEntries', entry)
}

export async function getTimeEntry(
  db: DatabaseReader,
  entryId: Id<'timeEntries'>,
): Promise<Doc<'timeEntries'> | null> {
  return await db.get(entryId)
}

export async function listTimeEntriesByUser(
  db: DatabaseReader,
  userId: Id<'users'>,
): Promise<Doc<'timeEntries'>[]> {
  return await db
    .query('timeEntries')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .collect()
}

export async function listTimeEntriesByProject(
  db: DatabaseReader,
  projectId: Id<'projects'>,
): Promise<Doc<'timeEntries'>[]> {
  return await db
    .query('timeEntries')
    .withIndex('by_project', (q) => q.eq('projectId', projectId))
    .collect()
}

export async function listTimeEntriesByUserAndDate(
  db: DatabaseReader,
  userId: Id<'users'>,
  date: number,
): Promise<Doc<'timeEntries'>[]> {
  return await db
    .query('timeEntries')
    .withIndex('by_user_date', (q) => q.eq('userId', userId).eq('date', date))
    .collect()
}

/**
 * List time entries for a user within a date range (inclusive)
 * Uses in-memory filtering since there's no compound range index
 */
export async function listTimeEntriesByUserAndDateRange(
  db: DatabaseReader,
  userId: Id<'users'>,
  startDate: number,
  endDate: number,
): Promise<Doc<'timeEntries'>[]> {
  const allEntries = await listTimeEntriesByUser(db, userId)
  return allEntries.filter(
    (entry) => entry.date >= startDate && entry.date <= endDate
  )
}

export async function listTimeEntriesByStatus(
  db: DatabaseReader,
  organizationId: Id<'organizations'>,
  status: Doc<'timeEntries'>['status'],
): Promise<Doc<'timeEntries'>[]> {
  return await db
    .query('timeEntries')
    .withIndex('by_status', (q) =>
      q.eq('organizationId', organizationId).eq('status', status)
    )
    .collect()
}

export async function listApprovedBillableTimeEntriesForInvoicing(
  db: DatabaseReader,
  projectId: Id<'projects'>,
): Promise<Doc<'timeEntries'>[]> {
  const entries = await listTimeEntriesByProject(db, projectId)
  return entries.filter(
    (e) => e.status === 'Approved' && e.billable && !e.invoiceId
  )
}

export async function updateTimeEntry(
  db: DatabaseWriter,
  entryId: Id<'timeEntries'>,
  updates: Partial<Omit<Doc<'timeEntries'>, '_id' | '_creationTime'>>,
): Promise<void> {
  await db.patch(entryId, updates)
}

export async function deleteTimeEntry(
  db: DatabaseWriter,
  entryId: Id<'timeEntries'>,
): Promise<void> {
  await db.delete(entryId)
}

// ============================================================================
// EXPENSES
// ============================================================================

export async function insertExpense(
  db: DatabaseWriter,
  expense: Omit<Doc<'expenses'>, '_id' | '_creationTime'>,
): Promise<Id<'expenses'>> {
  return await db.insert('expenses', expense)
}

export async function getExpense(
  db: DatabaseReader,
  expenseId: Id<'expenses'>,
): Promise<Doc<'expenses'> | null> {
  return await db.get(expenseId)
}

export async function listExpensesByUser(
  db: DatabaseReader,
  userId: Id<'users'>,
): Promise<Doc<'expenses'>[]> {
  return await db
    .query('expenses')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .collect()
}

export async function listExpensesByProject(
  db: DatabaseReader,
  projectId: Id<'projects'>,
): Promise<Doc<'expenses'>[]> {
  return await db
    .query('expenses')
    .withIndex('by_project', (q) => q.eq('projectId', projectId))
    .collect()
}

export async function listExpensesByStatus(
  db: DatabaseReader,
  organizationId: Id<'organizations'>,
  status: Doc<'expenses'>['status'],
): Promise<Doc<'expenses'>[]> {
  return await db
    .query('expenses')
    .withIndex('by_status', (q) =>
      q.eq('organizationId', organizationId).eq('status', status)
    )
    .collect()
}

export async function listApprovedBillableExpensesForInvoicing(
  db: DatabaseReader,
  projectId: Id<'projects'>,
): Promise<Doc<'expenses'>[]> {
  const expenses = await listExpensesByProject(db, projectId)
  return expenses.filter(
    (e) => e.status === 'Approved' && e.billable && !e.invoiceId
  )
}

export async function updateExpense(
  db: DatabaseWriter,
  expenseId: Id<'expenses'>,
  updates: Partial<Omit<Doc<'expenses'>, '_id' | '_creationTime'>>,
): Promise<void> {
  await db.patch(expenseId, updates)
}

export async function deleteExpense(
  db: DatabaseWriter,
  expenseId: Id<'expenses'>,
): Promise<void> {
  await db.delete(expenseId)
}

// ============================================================================
// INVOICES
// ============================================================================

export async function insertInvoice(
  db: DatabaseWriter,
  invoice: Omit<Doc<'invoices'>, '_id' | '_creationTime'>,
): Promise<Id<'invoices'>> {
  return await db.insert('invoices', invoice)
}

export async function getInvoice(
  db: DatabaseReader,
  invoiceId: Id<'invoices'>,
): Promise<Doc<'invoices'> | null> {
  return await db.get(invoiceId)
}

export async function listInvoicesByProject(
  db: DatabaseReader,
  projectId: Id<'projects'>,
): Promise<Doc<'invoices'>[]> {
  return await db
    .query('invoices')
    .withIndex('by_project', (q) => q.eq('projectId', projectId))
    .collect()
}

export async function listInvoicesByCompany(
  db: DatabaseReader,
  companyId: Id<'companies'>,
): Promise<Doc<'invoices'>[]> {
  return await db
    .query('invoices')
    .withIndex('by_company', (q) => q.eq('companyId', companyId))
    .collect()
}

export async function listInvoicesByStatus(
  db: DatabaseReader,
  organizationId: Id<'organizations'>,
  status: Doc<'invoices'>['status'],
): Promise<Doc<'invoices'>[]> {
  return await db
    .query('invoices')
    .withIndex('by_status', (q) =>
      q.eq('organizationId', organizationId).eq('status', status)
    )
    .collect()
}

export async function getNextInvoiceNumber(
  db: DatabaseReader,
  organizationId: Id<'organizations'>,
): Promise<string> {
  const year = new Date().getFullYear()
  const invoices = await db
    .query('invoices')
    .withIndex('by_status', (q) => q.eq('organizationId', organizationId))
    .collect()

  const thisYearInvoices = invoices.filter(
    (i) => i.number && i.number.startsWith(`INV-${year}-`)
  )
  const nextNum = thisYearInvoices.length + 1
  return `INV-${year}-${String(nextNum).padStart(5, '0')}`
}

export async function updateInvoice(
  db: DatabaseWriter,
  invoiceId: Id<'invoices'>,
  updates: Partial<Omit<Doc<'invoices'>, '_id' | '_creationTime'>>,
): Promise<void> {
  await db.patch(invoiceId, updates)
}

// ============================================================================
// INVOICE LINE ITEMS
// ============================================================================

export async function insertInvoiceLineItem(
  db: DatabaseWriter,
  item: Omit<Doc<'invoiceLineItems'>, '_id' | '_creationTime'>,
): Promise<Id<'invoiceLineItems'>> {
  return await db.insert('invoiceLineItems', item)
}

export async function listInvoiceLineItemsByInvoice(
  db: DatabaseReader,
  invoiceId: Id<'invoices'>,
): Promise<Doc<'invoiceLineItems'>[]> {
  const items = await db
    .query('invoiceLineItems')
    .withIndex('by_invoice', (q) => q.eq('invoiceId', invoiceId))
    .collect()
  return items.sort((a, b) => a.sortOrder - b.sortOrder)
}

export async function updateInvoiceLineItem(
  db: DatabaseWriter,
  itemId: Id<'invoiceLineItems'>,
  updates: Partial<Omit<Doc<'invoiceLineItems'>, '_id' | '_creationTime'>>,
): Promise<void> {
  await db.patch(itemId, updates)
}

export async function deleteInvoiceLineItem(
  db: DatabaseWriter,
  itemId: Id<'invoiceLineItems'>,
): Promise<void> {
  await db.delete(itemId)
}

// ============================================================================
// PAYMENTS
// ============================================================================

export async function insertPayment(
  db: DatabaseWriter,
  payment: Omit<Doc<'payments'>, '_id' | '_creationTime'>,
): Promise<Id<'payments'>> {
  return await db.insert('payments', payment)
}

export async function getPayment(
  db: DatabaseReader,
  paymentId: Id<'payments'>,
): Promise<Doc<'payments'> | null> {
  return await db.get(paymentId)
}

export async function listPaymentsByInvoice(
  db: DatabaseReader,
  invoiceId: Id<'invoices'>,
): Promise<Doc<'payments'>[]> {
  return await db
    .query('payments')
    .withIndex('by_invoice', (q) => q.eq('invoiceId', invoiceId))
    .collect()
}

export async function getTotalPaymentsForInvoice(
  db: DatabaseReader,
  invoiceId: Id<'invoices'>,
): Promise<number> {
  const payments = await listPaymentsByInvoice(db, invoiceId)
  return payments.reduce((sum, p) => sum + p.amount, 0)
}

export async function updatePayment(
  db: DatabaseWriter,
  paymentId: Id<'payments'>,
  updates: Partial<Omit<Doc<'payments'>, '_id' | '_creationTime'>>,
): Promise<void> {
  await db.patch(paymentId, updates)
}

// ============================================================================
// RATE CARDS
// ============================================================================

export async function insertRateCard(
  db: DatabaseWriter,
  rateCard: Omit<Doc<'rateCards'>, '_id' | '_creationTime'>,
): Promise<Id<'rateCards'>> {
  return await db.insert('rateCards', rateCard)
}

export async function getRateCard(
  db: DatabaseReader,
  rateCardId: Id<'rateCards'>,
): Promise<Doc<'rateCards'> | null> {
  return await db.get(rateCardId)
}

export async function listRateCardsByOrganization(
  db: DatabaseReader,
  organizationId: Id<'organizations'>,
): Promise<Doc<'rateCards'>[]> {
  return await db
    .query('rateCards')
    .withIndex('by_organization', (q) => q.eq('organizationId', organizationId))
    .collect()
}

export async function getDefaultRateCard(
  db: DatabaseReader,
  organizationId: Id<'organizations'>,
): Promise<Doc<'rateCards'> | null> {
  const cards = await listRateCardsByOrganization(db, organizationId)
  return cards.find((c) => c.isDefault) ?? null
}

export async function updateRateCard(
  db: DatabaseWriter,
  rateCardId: Id<'rateCards'>,
  updates: Partial<Omit<Doc<'rateCards'>, '_id' | '_creationTime'>>,
): Promise<void> {
  await db.patch(rateCardId, updates)
}

export async function deleteRateCard(
  db: DatabaseWriter,
  rateCardId: Id<'rateCards'>,
): Promise<void> {
  await db.delete(rateCardId)
}

// ============================================================================
// RATE CARD ITEMS
// ============================================================================

export async function insertRateCardItem(
  db: DatabaseWriter,
  item: Omit<Doc<'rateCardItems'>, '_id' | '_creationTime'>,
): Promise<Id<'rateCardItems'>> {
  return await db.insert('rateCardItems', item)
}

export async function listRateCardItemsByRateCard(
  db: DatabaseReader,
  rateCardId: Id<'rateCards'>,
): Promise<Doc<'rateCardItems'>[]> {
  return await db
    .query('rateCardItems')
    .withIndex('by_rate_card', (q) => q.eq('rateCardId', rateCardId))
    .collect()
}

export async function updateRateCardItem(
  db: DatabaseWriter,
  itemId: Id<'rateCardItems'>,
  updates: Partial<Omit<Doc<'rateCardItems'>, '_id' | '_creationTime'>>,
): Promise<void> {
  await db.patch(itemId, updates)
}

export async function deleteRateCardItem(
  db: DatabaseWriter,
  itemId: Id<'rateCardItems'>,
): Promise<void> {
  await db.delete(itemId)
}

// ============================================================================
// CHANGE ORDERS
// ============================================================================

export async function insertChangeOrder(
  db: DatabaseWriter,
  changeOrder: Omit<Doc<'changeOrders'>, '_id' | '_creationTime'>,
): Promise<Id<'changeOrders'>> {
  return await db.insert('changeOrders', changeOrder)
}

export async function getChangeOrder(
  db: DatabaseReader,
  changeOrderId: Id<'changeOrders'>,
): Promise<Doc<'changeOrders'> | null> {
  return await db.get(changeOrderId)
}

export async function listChangeOrdersByProject(
  db: DatabaseReader,
  projectId: Id<'projects'>,
): Promise<Doc<'changeOrders'>[]> {
  return await db
    .query('changeOrders')
    .withIndex('by_project', (q) => q.eq('projectId', projectId))
    .collect()
}

export async function listPendingChangeOrdersByProject(
  db: DatabaseReader,
  projectId: Id<'projects'>,
): Promise<Doc<'changeOrders'>[]> {
  const orders = await listChangeOrdersByProject(db, projectId)
  return orders.filter((o) => o.status === 'Pending')
}

export async function updateChangeOrder(
  db: DatabaseWriter,
  changeOrderId: Id<'changeOrders'>,
  updates: Partial<Omit<Doc<'changeOrders'>, '_id' | '_creationTime'>>,
): Promise<void> {
  await db.patch(changeOrderId, updates)
}

// ============================================================================
// BUDGET CALCULATIONS
// ============================================================================

export async function calculateProjectBudgetBurn(
  db: DatabaseReader,
  projectId: Id<'projects'>,
): Promise<{
  timeCost: number
  expenseCost: number
  totalCost: number
  budgetAmount: number
  burnRate: number
  remaining: number
}> {
  const budget = await getBudgetByProject(db, projectId)
  if (!budget) {
    return {
      timeCost: 0,
      expenseCost: 0,
      totalCost: 0,
      budgetAmount: 0,
      burnRate: 0,
      remaining: 0,
    }
  }

  const timeEntries = await listTimeEntriesByProject(db, projectId)
  const expenses = await listExpensesByProject(db, projectId)

  // Calculate time cost using user cost rates
  let timeCost = 0
  for (const entry of timeEntries) {
    if (entry.status === 'Approved' || entry.status === 'Locked') {
      const user = await getUser(db, entry.userId)
      if (user && user.costRate !== undefined) {
        timeCost += entry.hours * user.costRate
      }
    }
  }

  // Calculate expense cost
  const expenseCost = expenses
    .filter((e) => e.status === 'Approved')
    .reduce((sum, e) => sum + e.amount, 0)

  const totalCost = timeCost + expenseCost
  const burnRate =
    budget.totalAmount > 0 ? (totalCost / budget.totalAmount) * 100 : 0
  const remaining = budget.totalAmount - totalCost

  return {
    timeCost,
    expenseCost,
    totalCost,
    budgetAmount: budget.totalAmount,
    burnRate,
    remaining,
  }
}

// ============================================================================
// UTILIZATION CALCULATIONS
// ============================================================================

export async function calculateUserUtilization(
  db: DatabaseReader,
  userId: Id<'users'>,
  startDate: number,
  endDate: number,
  standardHoursPerDay: number = 8,
): Promise<{
  bookedHours: number
  availableHours: number
  utilizationPercent: number
}> {
  const bookings = await listBookingsByUser(db, userId)
  const relevantBookings = bookings.filter(
    (b) =>
      b.type !== 'TimeOff' &&
      b.startDate <= endDate &&
      b.endDate >= startDate
  )

  // Calculate business days in range
  const msPerDay = 24 * 60 * 60 * 1000
  const totalDays = Math.ceil((endDate - startDate) / msPerDay) + 1
  // Simplified: assume 5/7 are business days
  const businessDays = Math.floor(totalDays * (5 / 7))

  let bookedHours = 0
  for (const booking of relevantBookings) {
    const overlapStart = Math.max(booking.startDate, startDate)
    const overlapEnd = Math.min(booking.endDate, endDate)
    const overlapDays = Math.ceil((overlapEnd - overlapStart) / msPerDay) + 1
    const overlapBusinessDays = Math.floor(overlapDays * (5 / 7))
    bookedHours += overlapBusinessDays * booking.hoursPerDay
  }

  // Calculate time off
  const timeOffBookings = bookings.filter(
    (b) =>
      b.type === 'TimeOff' &&
      b.startDate <= endDate &&
      b.endDate >= startDate
  )
  let timeOffHours = 0
  for (const booking of timeOffBookings) {
    const overlapStart = Math.max(booking.startDate, startDate)
    const overlapEnd = Math.min(booking.endDate, endDate)
    const overlapDays = Math.ceil((overlapEnd - overlapStart) / msPerDay) + 1
    const overlapBusinessDays = Math.floor(overlapDays * (5 / 7))
    timeOffHours += overlapBusinessDays * booking.hoursPerDay
  }

  const totalAvailableHours = businessDays * standardHoursPerDay - timeOffHours
  const utilizationPercent =
    totalAvailableHours > 0 ? (bookedHours / totalAvailableHours) * 100 : 0

  return {
    bookedHours,
    availableHours: totalAvailableHours,
    utilizationPercent,
  }
}
