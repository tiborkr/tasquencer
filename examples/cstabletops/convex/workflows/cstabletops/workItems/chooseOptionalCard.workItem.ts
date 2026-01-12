import { Builder } from '../../../tasquencer'
import { z } from 'zod'
import { authService } from '../../../authorization'
import { CstabletopsWorkItemHelpers } from '../helpers'
import { authComponent } from '../../../auth'
import { isHumanClaim } from '@repo/tasquencer'
import invariant from 'tiny-invariant'
import { getParticipantForSession, markCardSkipped } from '../db'

const facilitatePolicy = authService.policies.requireScope('cstabletops:facilitate')

const chooseOptionalCardActions = authService.builders.workItemActions
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
  .complete(
    z.object({
      include: z.boolean(),
    }),
    facilitatePolicy,
    async ({ mutationCtx, workItem }, payload) => {
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
      if (!metadata || metadata.payload.type !== 'chooseOptionalCard') {
        throw new Error('WORK_ITEM_METADATA_NOT_FOUND')
      }

      const sessionId = metadata.aggregateTableId

      const existingFlags = (await mutationCtx.db.get(sessionId))?.flags ?? {}
      await mutationCtx.db.patch(sessionId, {
        flags: { ...existingFlags, includeOptionalCard: payload.include },
      })

      if (!payload.include) {
        await markCardSkipped(mutationCtx.db, metadata.payload.optionalCardId)
      }
    },
  )

export const chooseOptionalCardWorkItem = Builder.workItem(
  'chooseOptionalCard',
).withActions(chooseOptionalCardActions.build())
