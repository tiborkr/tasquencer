import { Builder } from '../../../tasquencer'
import { z } from 'zod'
import { components } from '../../../_generated/api'
import { authComponent } from '../../../auth'
import { insertParticipant, insertSession, markSessionCompleted } from '../db'
import { getExerciseDefinition, type ExerciseKey } from '../exercises'
import invariant from 'tiny-invariant'
import type { Id } from '../../../_generated/dataModel'
import { quickFixWorkflow } from './quickFix.workflow'
import { quickFixWorkflowV1 } from './quickFix.v1.workflow'
import { malwareInfectionWorkflow } from './malwareInfection.workflow'
import { unplannedAttackWorkflow } from './unplannedAttack.workflow'
import { cloudCompromiseWorkflow } from './cloudCompromise.workflow'
import { financialBreakInWorkflow } from './financialBreakIn.workflow'
import { floodZoneWorkflow } from './floodZone.workflow'

function makeJoinCode(length = 8) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let result = ''
  for (let i = 0; i < length; i++) {
    result += alphabet[Math.floor(Math.random() * alphabet.length)]
  }
  return result
}

const cstabletopsWorkflowActions = Builder.workflowActions().initialize(
  z.object({
    title: z.string().min(1),
    exerciseKey: z.enum([
      'quick_fix',
      'malware_infection',
      'unplanned_attack',
      'cloud_compromise',
      'financial_break_in',
      'flood_zone',
    ]),
  }),
  async ({ mutationCtx, workflow }, payload) => {
    const authUser = await authComponent.getAuthUser(mutationCtx)
    const userId = authUser.userId
    invariant(userId, 'USER_NOT_AUTHENTICATED')
    const appUserId = userId as Id<'users'>

    const workflowId = await workflow.initialize()
    const exercise = getExerciseDefinition(payload.exerciseKey)

    const sessionId = await insertSession(mutationCtx.db, {
      workflowId,
      title: payload.title,
      exerciseKey: payload.exerciseKey,
      exerciseTitle: exercise.title,
      joinCode: makeJoinCode(),
      playerRoles: exercise.playerRoles,
      groups: {
        facilitatorsGroupId: 'pending',
        noteTakersGroupId: 'pending',
        playersGroupId: 'pending',
        observersGroupId: 'pending',
      },
      status: 'active',
      createdAt: Date.now(),
    })

    // Create per-session auth groups and wire roles
    const facilitatorRole = await mutationCtx.runQuery(
      components.tasquencerAuthorization.api.getRoleByName,
      { name: 'cstabletops_facilitator' },
    )
    const noteTakerRole = await mutationCtx.runQuery(
      components.tasquencerAuthorization.api.getRoleByName,
      { name: 'cstabletops_note_taker' },
    )
    const playerRole = await mutationCtx.runQuery(
      components.tasquencerAuthorization.api.getRoleByName,
      { name: 'cstabletops_player' },
    )
    const observerRole = await mutationCtx.runQuery(
      components.tasquencerAuthorization.api.getRoleByName,
      { name: 'cstabletops_observer' },
    )

    invariant(facilitatorRole, 'CSTABLETOPS_ROLE_MISSING: facilitator')
    invariant(noteTakerRole, 'CSTABLETOPS_ROLE_MISSING: note_taker')
    invariant(playerRole, 'CSTABLETOPS_ROLE_MISSING: player')
    invariant(observerRole, 'CSTABLETOPS_ROLE_MISSING: observer')

    const groupIds = await mutationCtx.runMutation(
      components.tasquencerAuthorization.api.insertAuthGroups,
      {
        groups: [
          {
            name: `cstabletops_session_${sessionId}_facilitators`,
            description: `Facilitators for session ${sessionId}`,
            isActive: true,
          },
          {
            name: `cstabletops_session_${sessionId}_note_takers`,
            description: `Note-takers for session ${sessionId}`,
            isActive: true,
          },
          {
            name: `cstabletops_session_${sessionId}_players`,
            description: `Players for session ${sessionId}`,
            isActive: true,
          },
          {
            name: `cstabletops_session_${sessionId}_observers`,
            description: `Observers for session ${sessionId}`,
            isActive: true,
          },
        ],
      },
    )

    const [
      facilitatorsGroupId,
      noteTakersGroupId,
      playersGroupId,
      observersGroupId,
    ] = groupIds

    invariant(facilitatorsGroupId, 'FAILED_TO_CREATE_GROUP: facilitators')
    invariant(noteTakersGroupId, 'FAILED_TO_CREATE_GROUP: note_takers')
    invariant(playersGroupId, 'FAILED_TO_CREATE_GROUP: players')
    invariant(observersGroupId, 'FAILED_TO_CREATE_GROUP: observers')

    await mutationCtx.runMutation(
      components.tasquencerAuthorization.api.insertAuthGroupRoleAssignments,
      {
        assignments: [
          { groupId: facilitatorsGroupId, roleId: facilitatorRole._id, assignedAt: Date.now() },
          { groupId: noteTakersGroupId, roleId: noteTakerRole._id, assignedAt: Date.now() },
          { groupId: playersGroupId, roleId: playerRole._id, assignedAt: Date.now() },
          { groupId: observersGroupId, roleId: observerRole._id, assignedAt: Date.now() },
        ],
      },
    )

    const playerRoleGroupIds = await mutationCtx.runMutation(
      components.tasquencerAuthorization.api.insertAuthGroups,
      {
        groups: exercise.playerRoles.map((role) => ({
          name: `cstabletops_session_${sessionId}_player_${role.key}`,
          description: `Players (${role.title}) for session ${sessionId}`,
          isActive: true,
        })),
      },
    )

    if (playerRoleGroupIds.length !== exercise.playerRoles.length) {
      throw new Error(
        `FAILED_TO_CREATE_GROUPS: player roles (expected ${exercise.playerRoles.length}, got ${playerRoleGroupIds.length})`,
      )
    }

    const assignments = exercise.playerRoles.map((_role, index) => ({
      groupId: playerRoleGroupIds[index]!,
      roleId: playerRole._id,
      assignedAt: Date.now(),
    }))

    await mutationCtx.runMutation(
      components.tasquencerAuthorization.api.insertAuthGroupRoleAssignments,
      { assignments },
    )

    // Default: creator is the facilitator for this session.
    await mutationCtx.runMutation(
      components.tasquencerAuthorization.api.addUserToAuthGroup,
      { userId, groupId: facilitatorsGroupId },
    )

    await insertParticipant(mutationCtx.db, {
      sessionId,
      userId: appUserId,
      role: 'facilitator',
      createdAt: Date.now(),
    })

    await mutationCtx.db.patch(sessionId, {
      groups: {
        facilitatorsGroupId,
        noteTakersGroupId,
        playersGroupId,
        observersGroupId,
        playerRoleGroups: exercise.playerRoles.map((role, index) => ({
          roleKey: role.key,
          groupId: playerRoleGroupIds[index]!,
        })),
      },
    })
  },
)

type QuickFixWorkflowBuilder = typeof quickFixWorkflow

function buildCstabletopsWorkflow(quickFix: QuickFixWorkflowBuilder) {
  return Builder.workflow('cstabletops')
    .withActions(cstabletopsWorkflowActions)
    .startCondition('start')
    .dynamicCompositeTask(
      'exercise',
      Builder.dynamicCompositeTask([
        quickFix,
        malwareInfectionWorkflow,
        unplannedAttackWorkflow,
        cloudCompromiseWorkflow,
        financialBreakInWorkflow,
        floodZoneWorkflow,
      ]).withActivities({
        onEnabled: async ({ workflow, mutationCtx, parent }) => {
          // Dynamic composite task activity contexts currently type `mutationCtx.db`
          // with a reduced data model; use `any` to access this example's tables.
          const session = await (mutationCtx.db as any)
            .query('ttxSessions')
            .withIndex('by_workflow_id', (q: any) =>
              q.eq('workflowId', parent.workflow.id),
            )
            .unique()
          invariant(session, 'SESSION_NOT_FOUND')

          switch (session.exerciseKey as ExerciseKey) {
            case 'quick_fix':
              await workflow.initialize.QuickFix({ sessionId: session._id })
              break
            case 'malware_infection':
              await workflow.initialize.MalwareInfection({ sessionId: session._id })
              break
            case 'unplanned_attack':
              await workflow.initialize.UnplannedAttack({ sessionId: session._id })
              break
            case 'cloud_compromise':
              await workflow.initialize.CloudCompromise({ sessionId: session._id })
              break
            case 'financial_break_in':
              await workflow.initialize.FinancialBreakIn({ sessionId: session._id })
              break
            case 'flood_zone':
              await workflow.initialize.FloodZone({ sessionId: session._id })
              break
            default:
              throw new Error(`Unknown exerciseKey: ${session.exerciseKey}`)
          }
        },
      }),
    )
    .endCondition('end')
    .connectCondition('start', (to) => to.task('exercise'))
    .connectTask('exercise', (to) => to.condition('end'))
}

export const cstabletopsWorkflowV1 = buildCstabletopsWorkflow(
  quickFixWorkflowV1 as unknown as QuickFixWorkflowBuilder,
)
export const cstabletopsWorkflowV2 = buildCstabletopsWorkflow(quickFixWorkflow)
  .withActivities({
    onCompleted: async ({ mutationCtx, workflow }) => {
      const session = await (mutationCtx.db as any)
        .query('ttxSessions')
        .withIndex('by_workflow_id', (q: any) => q.eq('workflowId', workflow.id))
        .unique()
      if (!session) return
      if (session.status !== 'completed') {
        await markSessionCompleted(mutationCtx.db as any, session._id)
      }
    },
  })
