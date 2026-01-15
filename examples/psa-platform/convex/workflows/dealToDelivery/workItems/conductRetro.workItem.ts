import { Builder } from '../../../tasquencer'
import { z } from 'zod'
import { authService } from '../../../authorization'
import { authComponent } from '../../../auth'
import { isHumanClaim } from '@repo/tasquencer'
import invariant from 'tiny-invariant'
import { getProject, getBudget, updateProject } from '../db'
import { initializeHumanWorkItemAuth } from './authHelpers'
import { DealToDeliveryWorkItemHelpers } from '../helpers'
import type { Id } from '../../../_generated/dataModel'

// Policy: requires dealToDelivery:projects:view:own scope
const conductRetroPolicy = authService.policies.requireScope(
  'dealToDelivery:projects:view:own'
)

// Schema for retrospective categories
const retroCategory = z.enum([
  'timeline',
  'budget',
  'quality',
  'communication',
  'process',
  'other',
])

const impactLevel = z.enum(['high', 'medium', 'low'])

// Schema for conducting a retrospective
const conductRetroPayloadSchema = z.object({
  projectId: z.string(),
  successes: z
    .array(
      z.object({
        category: retroCategory,
        description: z.string(),
        impact: impactLevel,
      })
    )
    .optional(),
  improvements: z
    .array(
      z.object({
        category: retroCategory,
        description: z.string(),
        impact: impactLevel,
        recommendation: z.string().optional(),
      })
    )
    .optional(),
  keyLearnings: z.array(z.string()).optional(),
  recommendations: z.array(z.string()).optional(),
  clientSatisfaction: z
    .object({
      rating: z.number().min(1).max(5),
      feedback: z.string().optional(),
      wouldRecommend: z.boolean().optional(),
    })
    .optional(),
})

const conductRetroActions = authService.builders.workItemActions
  // Start action - claim the work item
  .start(z.never(), conductRetroPolicy, async ({ mutationCtx, workItem }) => {
    const authUser = await authComponent.getAuthUser(mutationCtx)
    const userId = authUser.userId
    invariant(userId, 'USER_DOES_NOT_EXIST')

    await DealToDeliveryWorkItemHelpers.claimWorkItem(
      mutationCtx,
      workItem.id,
      userId
    )
    await workItem.start()
  })
  // Complete action - record retrospective
  .complete(
    conductRetroPayloadSchema,
    conductRetroPolicy,
    async ({ mutationCtx, workItem }, payload) => {
      const authUser = await authComponent.getAuthUser(mutationCtx)
      const userId = authUser.userId
      invariant(userId, 'USER_DOES_NOT_EXIST')

      // Verify the user has claimed this work item
      const metadata = await DealToDeliveryWorkItemHelpers.getWorkItemMetadata(
        mutationCtx.db,
        workItem.id
      )
      invariant(metadata, 'WORK_ITEM_METADATA_NOT_FOUND')

      const claimedBy = isHumanClaim(metadata?.claim)
        ? metadata.claim.userId
        : null
      if (!claimedBy || claimedBy !== userId) {
        throw new Error('WORK_ITEM_NOT_CLAIMED_BY_USER')
      }

      const projectId = payload.projectId as Id<'projects'>
      const project = await getProject(mutationCtx.db, projectId)
      invariant(project, 'PROJECT_NOT_FOUND')

      // Get budget for scorecard calculations
      const budget = project.budgetId
        ? await getBudget(mutationCtx.db, project.budgetId)
        : null

      // Calculate scorecard based on project data
      // On time: if project has an end date and it was on/before planned end
      // (Since we don't track planned end date, use startDate + 90 days as default)
      const plannedEndDate = project.startDate + 90 * 24 * 60 * 60 * 1000
      const actualEndDate = project.endDate || Date.now()
      const onTime = actualEndDate <= plannedEndDate

      // On budget: check if we're within budget
      // (We'd need actual cost tracking - approximating based on existence of budget)
      const onBudget = budget !== null // Simplified - just checking if budget exists

      // Client satisfied: based on satisfaction rating if provided
      const clientSatisfied =
        payload.clientSatisfaction !== undefined &&
        payload.clientSatisfaction.rating >= 4

      // Profitable: would need metrics from closeProject - default to true
      const profitable = true

      const scorecard = {
        onTime,
        onBudget,
        clientSatisfied,
        profitable,
      }

      // Transform client satisfaction rating to literal type
      const clientSatisfactionData = payload.clientSatisfaction
        ? {
            rating: payload.clientSatisfaction.rating as 1 | 2 | 3 | 4 | 5,
            feedback: payload.clientSatisfaction.feedback,
            wouldRecommend: payload.clientSatisfaction.wouldRecommend,
          }
        : undefined

      // Update work item metadata with retrospective details
      await mutationCtx.db.patch(metadata._id, {
        payload: {
          ...metadata.payload,
          retroDate: Date.now(),
          conductedBy: userId as Id<'users'>,
          successes: payload.successes,
          improvements: payload.improvements,
          keyLearnings: payload.keyLearnings,
          recommendations: payload.recommendations,
          clientSatisfaction: clientSatisfactionData,
          scorecard,
        } as typeof metadata.payload,
      })

      // Archive project if retro is complete
      await updateProject(mutationCtx.db, projectId, {
        status: 'Archived',
      })
    }
  )

export const conductRetroWorkItem = Builder.workItem('conductRetro')
  .withActions(conductRetroActions.build())

export const conductRetroTask = Builder.task(conductRetroWorkItem).withActivities(
  {
    onEnabled: async ({ workItem, mutationCtx }) => {
      const workItemId = await workItem.initialize()

      await initializeHumanWorkItemAuth(mutationCtx, workItemId, {
        scope: 'dealToDelivery:projects:view:own',
        payload: {
          type: 'conductRetro',
          taskName: 'Conduct Retrospective',
          projectId: '' as Id<'projects'>,
        },
      })
    },
  }
)
