import { Builder } from '../../../tasquencer'
import { z } from 'zod'
import { authService } from '../../../authorization'
import { CstabletopsWorkItemHelpers } from '../helpers'
import { authComponent } from '../../../auth'
import { isHumanClaim } from '@repo/tasquencer'
import invariant from 'tiny-invariant'
import type { Id } from '../../../_generated/dataModel'
import { getParticipantForSession, insertCardNotes, markCardCompleted } from '../db'

const notePolicy = authService.policies.requireScope('cstabletops:notetake')
const facilitatorPolicy = authService.policies.requireScope('cstabletops:facilitate')
const noteOrFacilitate = authService.policies.anyPolicy(notePolicy, facilitatorPolicy)

const recordNotesActions = authService.builders.workItemActions
  .start(z.never(), noteOrFacilitate, async ({ mutationCtx, workItem }) => {
    const authUser = await authComponent.getAuthUser(mutationCtx)
    const userId = authUser.userId
    invariant(userId, 'USER_NOT_AUTHENTICATED')
    const appUserId = userId as Id<'users'>

    const metadata = await CstabletopsWorkItemHelpers.getWorkItemMetadata(
      mutationCtx.db,
      workItem.id,
    )
    if (!metadata) {
      throw new Error('WORK_ITEM_METADATA_NOT_FOUND')
    }

    const participant = await getParticipantForSession(
      mutationCtx.db,
      metadata.aggregateTableId,
      appUserId,
    )
    if (
      !participant ||
      (participant.role !== 'noteTaker' && participant.role !== 'facilitator')
    ) {
      throw new Error('USER_NOT_A_NOTE_TAKER_IN_SESSION')
    }

    await CstabletopsWorkItemHelpers.claimWorkItem(mutationCtx, workItem.id, userId)
    await workItem.start()
  })
  .complete(
    z.object({
      notes: z.string().min(1, 'Notes are required'),
    }),
    noteOrFacilitate,
    async ({ mutationCtx, workItem }, payload) => {
      const authUser = await authComponent.getAuthUser(mutationCtx)
      const userId = authUser.userId
      invariant(userId, 'USER_NOT_AUTHENTICATED')
      const authorUserId = userId as Id<'users'>

      const metadata = await CstabletopsWorkItemHelpers.getWorkItemMetadata(
        mutationCtx.db,
        workItem.id,
      )
      if (!metadata) {
        throw new Error('WORK_ITEM_METADATA_NOT_FOUND')
      }

      const participant = await getParticipantForSession(
        mutationCtx.db,
        metadata.aggregateTableId,
        authorUserId,
      )
      if (
        !participant ||
        (participant.role !== 'noteTaker' && participant.role !== 'facilitator')
      ) {
        throw new Error('USER_NOT_A_NOTE_TAKER_IN_SESSION')
      }

      const claimedBy = isHumanClaim(metadata?.claim) ? metadata.claim.userId : null
      if (!claimedBy || claimedBy !== userId) {
        throw new Error('WORK_ITEM_NOT_CLAIMED_BY_USER')
      }
      if (!metadata || metadata.payload.type !== 'recordNotes') {
        throw new Error('WORK_ITEM_METADATA_NOT_FOUND')
      }

      const sessionId = metadata.aggregateTableId
      const cardId = metadata.payload.cardId

      await insertCardNotes(mutationCtx.db, {
        sessionId,
        cardId,
        authorUserId,
        notes: payload.notes,
        createdAt: Date.now(),
      })

      await markCardCompleted(mutationCtx.db, cardId)
    },
  )

export const recordNotesWorkItem = Builder.workItem('recordNotes').withActions(
  recordNotesActions.build(),
)
