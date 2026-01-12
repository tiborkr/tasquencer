import { Builder } from '../../../tasquencer'
import { z } from 'zod'
import { authService } from '../../../authorization'
import { CstabletopsWorkItemHelpers } from '../helpers'
import { authComponent } from '../../../auth'
import { isHumanClaim } from '@repo/tasquencer'
import invariant from 'tiny-invariant'
import { getParticipantForSession, markCardCompleted } from '../db'

const facilitatePolicy = authService.policies.requireScope('cstabletops:facilitate')

const presentCardActions = authService.builders.workItemActions
  .start(z.never(), facilitatePolicy, async ({ mutationCtx, workItem }) => {
    const authUser = await authComponent.getAuthUser(mutationCtx)
    const userId = authUser.userId
    invariant(userId, 'USER_NOT_AUTHENTICATED')
    const appUserId = userId as any

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
    if (!participant || participant.role !== 'facilitator') {
      throw new Error('USER_NOT_A_FACILITATOR_IN_SESSION')
    }

    await CstabletopsWorkItemHelpers.claimWorkItem(mutationCtx, workItem.id, userId)
    await workItem.start()
  })
  .complete(z.never(), facilitatePolicy, async ({ mutationCtx, workItem }) => {
    const authUser = await authComponent.getAuthUser(mutationCtx)
    const userId = authUser.userId
    invariant(userId, 'USER_NOT_AUTHENTICATED')
    const appUserId = userId as any

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
    if (!participant || participant.role !== 'facilitator') {
      throw new Error('USER_NOT_A_FACILITATOR_IN_SESSION')
    }

    const claimedBy = isHumanClaim(metadata?.claim) ? metadata.claim.userId : null
    if (!claimedBy || claimedBy !== userId) {
      throw new Error('WORK_ITEM_NOT_CLAIMED_BY_USER')
    }
    if (!metadata || metadata.payload.type !== 'presentCard') {
      throw new Error('WORK_ITEM_METADATA_NOT_FOUND')
    }

    await markCardCompleted(mutationCtx.db, metadata.payload.cardId)
  })

export const presentCardWorkItem = Builder.workItem('presentCard').withActions(
  presentCardActions.build(),
)
