import { Builder } from '../../../tasquencer'
import { z } from 'zod'
import { zid } from 'convex-helpers/server/zod4'
import invariant from 'tiny-invariant'
import { getExerciseDefinition } from '../exercises'
import { getSessionByWorkflowId, insertCard } from '../db'
import {
  makeChooseOptionalCardTask,
  makePresentCardTask,
  makeRecordNotesTask,
  makeRecordResponseTask,
} from '../workItems/cardTasks'

const actions = Builder.workflowActions().initialize(
  z.object({ sessionId: zid('ttxSessions') }),
  async ({ mutationCtx, workflow }, payload) => {
    await workflow.initialize()

    const session = await mutationCtx.db.get(payload.sessionId)
    invariant(session, 'SESSION_NOT_FOUND')

    const existing = await mutationCtx.db
      .query('ttxCards')
      .withIndex('by_session_id', (q) => q.eq('sessionId', session._id))
      .first()
    if (existing) return

    const def = getExerciseDefinition('financial_break_in')
    for (const seed of def.cards) {
      await insertCard(mutationCtx.db, {
        sessionId: session._id,
        order: seed.order,
        kind: seed.kind,
        assignedPlayerRoleKey: seed.assignedPlayerRoleKey,
        title: seed.title,
        body: seed.body,
        prompt: seed.prompt,
        questions: seed.questions,
        isOptional: seed.isOptional,
        status: 'pending',
        createdAt: Date.now(),
      })
    }
  },
)

export const financialBreakInWorkflow = Builder.workflow('FinancialBreakIn')
  .withActions(actions)
  .startCondition('start')
  .task('presentScenario', makePresentCardTask({ taskName: 'Present Scenario', cardOrder: 1 }))
  .task(
    'recordResponse1',
    makeRecordResponseTask({ taskName: 'What is your response?', cardOrder: 2 }),
  )
  .task('presentInject', makePresentCardTask({ taskName: 'Deliver inject', cardOrder: 3 }))
  .task(
    'chooseOptionalInject',
    makeChooseOptionalCardTask({
      taskName: 'Include optional inject?',
      optionalCardOrder: 4,
    }).withSplitType('xor'),
  )
  .task('presentOptionalInject', makePresentCardTask({ taskName: 'Deliver optional inject', cardOrder: 4 }))
  .task(
    'recordResponse2',
    makeRecordResponseTask({ taskName: 'How do you proceed?', cardOrder: 5 }).withJoinType('or'),
  )
  .task(
    'recordNotes',
    makeRecordNotesTask({ taskName: 'Capture discussion notes', cardOrder: 6 }),
  )
  .endCondition('end')
  .connectCondition('start', (to) => to.task('presentScenario'))
  .connectTask('presentScenario', (to) => to.task('recordResponse1'))
  .connectTask('recordResponse1', (to) => to.task('presentInject'))
  .connectTask('presentInject', (to) => to.task('chooseOptionalInject'))
  .connectTask('chooseOptionalInject', (to) =>
    to
      .task('presentOptionalInject')
      .task('recordResponse2')
      .route(async ({ mutationCtx, route, parent }) => {
        const session = await getSessionByWorkflowId(mutationCtx.db, parent.workflow.id)
        invariant(session, 'SESSION_NOT_FOUND')
        const includeOptional = (session.flags as any)?.includeOptionalCard === true
        return includeOptional
          ? route.toTask('presentOptionalInject')
          : route.toTask('recordResponse2')
      }),
  )
  .connectTask('presentOptionalInject', (to) => to.task('recordResponse2'))
  .connectTask('recordResponse2', (to) => to.task('recordNotes'))
  .connectTask('recordNotes', (to) => to.condition('end'))
