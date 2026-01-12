import { Builder } from '../../../tasquencer'
import { z } from 'zod'
import { zid } from 'convex-helpers/server/zod4'
import invariant from 'tiny-invariant'
import { insertCard } from '../db'
import {
  makePresentCardTask,
  makeRecordNotesTask,
  makeRecordResponseTask,
} from '../workItems/cardTasks'

const QUICK_FIX_V1_CARDS = [
  {
    order: 1,
    kind: 'scenario' as const,
    title: 'Scenario',
    body:
      'Joe, your network administrator, is overworked and underpaid. His bags are packed and ready for a family vacation when he is tasked with deploying a critical patch.\n\nIn order to make his flight, Joe quickly builds an installation file for the patch and deploys it before leaving. Next, Sue, the on-call service desk technician, begins receiving calls that nobody can log in.\n\nIt turns out that no testing was done for the recently-installed critical patch.',
  },
  {
    order: 2,
    kind: 'prompt' as const,
    assignedPlayerRoleKey: 'it_lead',
    title: 'What is your response?',
    body: 'Discuss immediate response steps and stabilization.',
    prompt: 'What is your response?',
  },
  {
    order: 3,
    kind: 'discussion' as const,
    title: 'Discussion Questions',
    body: 'Capture decisions, gaps, and follow-ups.',
    questions: [
      'What is Sue’s response in this scenario?',
      'Does your on-call technician have the expertise to handle this incident? If not, are there defined escalation processes?',
      'Does your organization have a formal change control policy?',
      'Are your employees trained on proper change control?',
      'Does your organization have disciplinary procedures in place for when an employee fails to follow established policies?',
      'Does your organization have the ability to roll back patches in the event of unanticipated negative impacts?',
    ],
  },
] as const

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

    for (const seed of QUICK_FIX_V1_CARDS) {
      await insertCard(mutationCtx.db, {
        sessionId: session._id,
        order: seed.order,
        kind: seed.kind,
        assignedPlayerRoleKey:
          'assignedPlayerRoleKey' in seed ? seed.assignedPlayerRoleKey : undefined,
        title: seed.title,
        body: seed.body,
        prompt: 'prompt' in seed ? seed.prompt : undefined,
        questions: 'questions' in seed ? [...seed.questions] : undefined,
        isOptional: undefined,
        status: 'pending',
        createdAt: Date.now(),
      })
    }
  },
)

export const quickFixWorkflowV1 = Builder.workflow('QuickFix')
  .withActions(actions)
  .startCondition('start')
  .task(
    'presentScenario',
    makePresentCardTask({ taskName: 'Present Scenario', cardOrder: 1 }),
  )
  .task(
    'recordResponse',
    makeRecordResponseTask({ taskName: 'What is your response?', cardOrder: 2 }),
  )
  .task(
    'recordNotes',
    makeRecordNotesTask({ taskName: 'Capture discussion notes', cardOrder: 3 }),
  )
  .endCondition('end')
  .connectCondition('start', (to) => to.task('presentScenario'))
  .connectTask('presentScenario', (to) => to.task('recordResponse'))
  .connectTask('recordResponse', (to) => to.task('recordNotes'))
  .connectTask('recordNotes', (to) => to.condition('end'))

