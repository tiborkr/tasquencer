/**
 * Integration tests for cstabletops workflow
 *
 * Test Coverage:
 * - Happy path: initialize, start, complete workflow
 * - Work item lifecycle
 * - Authorization setup + mocked auth user
 * - Work queue query
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api, components } from '../../../_generated/api'
import { CstabletopsWorkItemHelpers } from '../helpers'
import {
  createAuthSpies,
  createUser,
  setup,
  setupCstabletopsAuthorization,
  waitForFlush,
} from '../../../__tests__/helpers.test'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('Cstabletops Workflow', () => {
  it('completes full flow from initialize to completion', async () => {
    const t = setup()

    await setupCstabletopsAuthorization(t)
    const auth = createAuthSpies()

    const facilitatorUserId = await createUser(t)
    auth.setUser(facilitatorUserId)

    await t.mutation(api.workflows.cstabletops.api.initializeRootWorkflow, {
      payload: {
        title: 'Test session',
        exerciseKey: 'quick_fix',
      },
    })

    await waitForFlush(t)

    const sessions = await t.query(api.workflows.cstabletops.api.getSessions, {})
    expect(sessions.length).toBe(1)
    const session = sessions[0]!
    const joinCode = session.joinCode
    expect(joinCode).toBeTruthy()
    const joinCodeString = joinCode!

    const itLeadUserId = await createUser(t)
    auth.setUser(itLeadUserId)
    await t.mutation(api.workflows.cstabletops.api.joinSession, {
      joinCode: joinCodeString,
      role: 'player',
      playerRoleKey: 'it_lead',
    })

    const commsUserId = await createUser(t)
    auth.setUser(commsUserId)
    await t.mutation(api.workflows.cstabletops.api.joinSession, {
      joinCode: joinCodeString,
      role: 'player',
      playerRoleKey: 'comms',
    })

    const noteTakerUserId = await createUser(t)
    auth.setUser(noteTakerUserId)
    await t.mutation(api.workflows.cstabletops.api.joinSession, {
      joinCode: joinCodeString,
      role: 'noteTaker',
    })

    const allMetadata = await t.run(async (ctx) => {
      return await ctx.db.query('cstabletopsWorkItems').collect()
    })
    expect(allMetadata.length).toBeGreaterThan(0)
    expect(allMetadata[0]!.workflowName).toBe('cstabletops')

    auth.setUser(facilitatorUserId)

    const firstOffer = allMetadata[0]!.offer
    if (firstOffer.type === 'human') {
      const facilitatorGroups = await t.query(
        components.tasquencerAuthorization.api.getUserAuthGroups,
        { userId: facilitatorUserId },
      )
      const facilitatorScopes = await t.query(
        components.tasquencerAuthorization.api.getUserScopes,
        { userId: facilitatorUserId },
      )
      if (firstOffer.requiredScope) {
        expect(facilitatorScopes).toContain(firstOffer.requiredScope)
      }
      if (firstOffer.requiredGroupId) {
        expect(facilitatorGroups.map((g) => g._id)).toContain(firstOffer.requiredGroupId)
      }
    }

    const rawAvailable = await t.run(async (ctx) => {
      return await CstabletopsWorkItemHelpers.getAvailableWorkItemsByWorkflow(
        ctx as any,
        facilitatorUserId,
        'cstabletops',
      )
    })
    expect(rawAvailable.length).toBeGreaterThan(0)

    // 1) Present scenario
    auth.setUser(facilitatorUserId)
    const queue1 = await t.query(api.workflows.cstabletops.api.getCstabletopsWorkQueue, {})
    expect(queue1.length).toBe(1)
    expect(queue1[0]!.taskType).toBe('presentCard')
    const presentWorkItemId = queue1[0]!.workItemId

    await t.mutation(api.workflows.cstabletops.api.startWorkItemV2, {
      workItemId: presentWorkItemId,
      args: { name: 'presentCard' },
    })
    await t.mutation(api.workflows.cstabletops.api.completeWorkItemV2, {
      workItemId: presentWorkItemId,
      args: { name: 'presentCard' },
    })
    await waitForFlush(t)

    // 2) Record response
    auth.setUser(itLeadUserId)
    const queue2 = await t.query(api.workflows.cstabletops.api.getCstabletopsWorkQueue, {})
    expect(queue2.length).toBe(1)
    expect(queue2[0]!.taskType).toBe('recordResponse')
    const responseWorkItemId = queue2[0]!.workItemId

    await t.mutation(api.workflows.cstabletops.api.startWorkItemV2, {
      workItemId: responseWorkItemId,
      args: { name: 'recordResponse' },
    })
    await t.mutation(api.workflows.cstabletops.api.completeWorkItemV2, {
      workItemId: responseWorkItemId,
      args: { name: 'recordResponse', payload: { response: 'Triage and contain.' } },
    })
    await waitForFlush(t)

    // 3) Record comms response (assigned to comms role)
    auth.setUser(commsUserId)
    const queue3 = await t.query(api.workflows.cstabletops.api.getCstabletopsWorkQueue, {})
    expect(queue3.length).toBe(1)
    expect(queue3[0]!.taskType).toBe('recordResponse')
    const commsWorkItemId = queue3[0]!.workItemId

    await t.mutation(api.workflows.cstabletops.api.startWorkItemV2, {
      workItemId: commsWorkItemId,
      args: { name: 'recordResponse' },
    })
    await t.mutation(api.workflows.cstabletops.api.completeWorkItemV2, {
      workItemId: commsWorkItemId,
      args: {
        name: 'recordResponse',
        payload: { response: 'Acknowledge impact; provide ETA; route to status page.' },
      },
    })
    await waitForFlush(t)

    // 4) Record notes
    auth.setUser(noteTakerUserId)
    const queue4 = await t.query(api.workflows.cstabletops.api.getCstabletopsWorkQueue, {})
    expect(queue4.length).toBe(1)
    expect(queue4[0]!.taskType).toBe('recordNotes')
    const notesWorkItemId = queue4[0]!.workItemId

    await t.mutation(api.workflows.cstabletops.api.startWorkItemV2, {
      workItemId: notesWorkItemId,
      args: { name: 'recordNotes' },
    })
    await t.mutation(api.workflows.cstabletops.api.completeWorkItemV2, {
      workItemId: notesWorkItemId,
      args: { name: 'recordNotes', payload: { notes: 'We need rollback and change control.' } },
    })
    await waitForFlush(t)

    auth.setUser(facilitatorUserId)
    const updated = await t.query(api.workflows.cstabletops.api.getSessions, {})
    expect(updated[0]!.status).toBe('completed')
  })
})
