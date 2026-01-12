import { Builder } from '../../../tasquencer'
import { z } from 'zod'
import { zid } from 'convex-helpers/server/zod4'
import invariant from 'tiny-invariant'
import { getExerciseDefinition } from '../exercises'
import { insertCard } from '../db'
import {
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

    const def = getExerciseDefinition('quick_fix')
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

export const quickFixWorkflow = Builder.workflow('QuickFix')
  .withActions(actions)
  .startCondition('start')
  .task(
    'presentScenario',
    makePresentCardTask({ taskName: 'Present Scenario', cardOrder: 1 }),
  )
  .task(
    'recordResponseItLead',
    makeRecordResponseTask({ taskName: 'What is your response?', cardOrder: 2 }),
  )
  .task(
    'recordResponseComms',
    makeRecordResponseTask({
      taskName: 'What do you tell stakeholders?',
      cardOrder: 3,
    }),
  )
  .task(
    'recordNotes',
    makeRecordNotesTask({ taskName: 'Capture discussion notes', cardOrder: 4 }),
  )
  .endCondition('end')
  .connectCondition('start', (to) => to.task('presentScenario'))
  .connectTask('presentScenario', (to) => to.task('recordResponseItLead'))
  .connectTask('recordResponseItLead', (to) => to.task('recordResponseComms'))
  .connectTask('recordResponseComms', (to) => to.task('recordNotes'))
  .connectTask('recordNotes', (to) => to.condition('end'))
