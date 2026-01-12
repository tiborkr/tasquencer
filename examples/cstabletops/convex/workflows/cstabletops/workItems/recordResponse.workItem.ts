import { Builder } from '../../../tasquencer'
import { z } from 'zod'
import { authService } from '../../../authorization'
import { CstabletopsWorkItemHelpers } from '../helpers'
import { authComponent } from '../../../auth'
import { isHumanClaim } from '@repo/tasquencer'
import invariant from 'tiny-invariant'
import type { Id } from '../../../_generated/dataModel'
import { getParticipantForSession, insertCardResponse, markCardCompleted } from '../db'

const respondPolicy = authService.policies.requireScope('cstabletops:respond')

const recordResponseActions = authService.builders.workItemActions
  .start(z.never(), respondPolicy, async ({ mutationCtx, workItem }) => {
    const authUser = await authComponent.getAuthUser(mutationCtx)
    const userId = authUser.userId
    invariant(userId, 'USER_NOT_AUTHENTICATED')
    const responderUserId = userId as Id<'users'>

    const metadata = await CstabletopsWorkItemHelpers.getWorkItemMetadata(
      mutationCtx.db,
      workItem.id,
    )
    if (!metadata || metadata.payload.type !== 'recordResponse') {
      throw new Error('WORK_ITEM_METADATA_NOT_FOUND')
    }

    const participant = await getParticipantForSession(
      mutationCtx.db,
      metadata.aggregateTableId,
      responderUserId,
    )
    if (!participant || participant.role !== 'player') {
      throw new Error('USER_NOT_A_PLAYER_IN_SESSION')
    }

    if (
      metadata.payload.assignedPlayerRoleKey &&
      participant.playerRoleKey !== metadata.payload.assignedPlayerRoleKey
    ) {
      throw new Error('USER_NOT_ASSIGNED_TO_THIS_PLAYER_ROLE')
    }

    await CstabletopsWorkItemHelpers.claimWorkItem(mutationCtx, workItem.id, userId)
    await workItem.start()
  })
  .complete(
    z.object({
      response: z.string().min(1, 'Response is required'),
    }),
    respondPolicy,
    async ({ mutationCtx, workItem }, payload) => {
      const authUser = await authComponent.getAuthUser(mutationCtx)
      const userId = authUser.userId
      invariant(userId, 'USER_NOT_AUTHENTICATED')
      const responderUserId = userId as Id<'users'>

      const metadata = await CstabletopsWorkItemHelpers.getWorkItemMetadata(
        mutationCtx.db,
        workItem.id,
      )
      const claimedBy = isHumanClaim(metadata?.claim) ? metadata.claim.userId : null
      if (!claimedBy || claimedBy !== userId) {
        throw new Error('WORK_ITEM_NOT_CLAIMED_BY_USER')
      }
      if (!metadata || metadata.payload.type !== 'recordResponse') {
        throw new Error('WORK_ITEM_METADATA_NOT_FOUND')
      }

      const sessionId = metadata.aggregateTableId
      const cardId = metadata.payload.cardId

      const participant = await getParticipantForSession(
        mutationCtx.db,
        sessionId,
        responderUserId,
      )
      if (!participant || participant.role !== 'player') {
        throw new Error('USER_NOT_A_PLAYER_IN_SESSION')
      }

      if (
        metadata.payload.assignedPlayerRoleKey &&
        participant.playerRoleKey !== metadata.payload.assignedPlayerRoleKey
      ) {
        throw new Error('USER_NOT_ASSIGNED_TO_THIS_PLAYER_ROLE')
      }

      await insertCardResponse(mutationCtx.db, {
        sessionId,
        cardId,
        responderUserId,
        playerRoleKey: participant.playerRoleKey,
        response: payload.response,
        createdAt: Date.now(),
      })

      await markCardCompleted(mutationCtx.db, cardId)
    },
  )

export const recordResponseWorkItem = Builder.workItem('recordResponse').withActions(
  recordResponseActions.build(),
)
