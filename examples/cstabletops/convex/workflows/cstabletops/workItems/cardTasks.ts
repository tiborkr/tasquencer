import { Builder } from '../../../tasquencer'
import invariant from 'tiny-invariant'
import {
  getCardByOrder,
  getSessionByWorkflowId,
  markCardActive,
} from '../db'
import { initializeCstabletopsWorkItemAuth } from './authHelpers'
import { presentCardWorkItem } from './presentCard.workItem'
import { recordResponseWorkItem } from './recordResponse.workItem'
import { recordNotesWorkItem } from './recordNotes.workItem'
import { chooseOptionalCardWorkItem } from './chooseOptionalCard.workItem'

export function makePresentCardTask(props: {
  taskName: string
  cardOrder: number
}) {
  return Builder.task(presentCardWorkItem).withActivities({
    onEnabled: async ({ workItem, mutationCtx, parent }) => {
      const session = await getSessionByWorkflowId(mutationCtx.db, parent.workflow.id)
      invariant(session, 'SESSION_NOT_FOUND')

      const card = await getCardByOrder(mutationCtx.db, session._id, props.cardOrder)
      invariant(card, 'CARD_NOT_FOUND')
      invariant(card.kind === 'scenario' || card.kind === 'inject', 'CARD_KIND_NOT_PRESENTABLE')

      await markCardActive(mutationCtx.db, card._id)

      const workItemId = await workItem.initialize()

      await initializeCstabletopsWorkItemAuth(mutationCtx, workItemId, {
        scope: 'cstabletops:facilitate',
        groupId: session.groups.facilitatorsGroupId,
        sessionId: session._id,
        payload: {
          type: 'presentCard',
          taskName: props.taskName,
          cardId: card._id,
          cardOrder: card.order,
          cardKind: card.kind,
          cardTitle: card.title,
          cardBody: card.body,
        },
      })
    },
  })
}

export function makeRecordResponseTask(props: {
  taskName: string
  cardOrder: number
}) {
  return Builder.task(recordResponseWorkItem).withActivities({
    onEnabled: async ({ workItem, mutationCtx, parent }) => {
      const session = await getSessionByWorkflowId(mutationCtx.db, parent.workflow.id)
      invariant(session, 'SESSION_NOT_FOUND')

      const card = await getCardByOrder(mutationCtx.db, session._id, props.cardOrder)
      invariant(card, 'CARD_NOT_FOUND')
      invariant(card.kind === 'prompt', 'CARD_KIND_NOT_PROMPT')
      invariant(card.prompt, 'CARD_PROMPT_MISSING')

      await markCardActive(mutationCtx.db, card._id)

      const workItemId = await workItem.initialize()

      const assignedPlayerRoleKey = card.assignedPlayerRoleKey ?? undefined
      const assignedPlayerRoleTitle =
        assignedPlayerRoleKey
          ? (session.playerRoles ?? []).find((r) => r.key === assignedPlayerRoleKey)
              ?.title
          : undefined

      const playerRoleGroupId =
        assignedPlayerRoleKey
          ? session.groups.playerRoleGroups?.find(
              (g) => g.roleKey === assignedPlayerRoleKey,
            )?.groupId
          : undefined

      await initializeCstabletopsWorkItemAuth(mutationCtx, workItemId, {
        scope: 'cstabletops:respond',
        groupId: playerRoleGroupId ?? session.groups.playersGroupId,
        sessionId: session._id,
        payload: {
          type: 'recordResponse',
          taskName: props.taskName,
          cardId: card._id,
          cardOrder: card.order,
          cardTitle: card.title,
          prompt: card.prompt,
          assignedPlayerRoleKey,
          assignedPlayerRoleTitle,
        },
      })
    },
  })
}

export function makeRecordNotesTask(props: {
  taskName: string
  cardOrder: number
}) {
  return Builder.task(recordNotesWorkItem).withActivities({
    onEnabled: async ({ workItem, mutationCtx, parent }) => {
      const session = await getSessionByWorkflowId(mutationCtx.db, parent.workflow.id)
      invariant(session, 'SESSION_NOT_FOUND')

      const card = await getCardByOrder(mutationCtx.db, session._id, props.cardOrder)
      invariant(card, 'CARD_NOT_FOUND')
      invariant(card.kind === 'discussion', 'CARD_KIND_NOT_DISCUSSION')
      invariant(card.questions && card.questions.length > 0, 'CARD_QUESTIONS_MISSING')

      await markCardActive(mutationCtx.db, card._id)

      const workItemId = await workItem.initialize()

      await initializeCstabletopsWorkItemAuth(mutationCtx, workItemId, {
        // Allow note-takers or facilitators to claim; policy enforces participant role.
        scope: undefined,
        groupId: undefined,
        sessionId: session._id,
        payload: {
          type: 'recordNotes',
          taskName: props.taskName,
          cardId: card._id,
          cardOrder: card.order,
          cardTitle: card.title,
          questions: card.questions,
        },
      })
    },
  })
}

export function makeChooseOptionalCardTask(props: {
  taskName: string
  optionalCardOrder: number
}) {
  return Builder.task(chooseOptionalCardWorkItem).withActivities({
    onEnabled: async ({ workItem, mutationCtx, parent }) => {
      const session = await getSessionByWorkflowId(mutationCtx.db, parent.workflow.id)
      invariant(session, 'SESSION_NOT_FOUND')

      const card = await getCardByOrder(
        mutationCtx.db,
        session._id,
        props.optionalCardOrder,
      )
      invariant(card, 'OPTIONAL_CARD_NOT_FOUND')
      invariant(card.isOptional === true, 'CARD_NOT_OPTIONAL')

      const workItemId = await workItem.initialize()

      await initializeCstabletopsWorkItemAuth(mutationCtx, workItemId, {
        scope: 'cstabletops:facilitate',
        groupId: session.groups.facilitatorsGroupId,
        sessionId: session._id,
        payload: {
          type: 'chooseOptionalCard',
          taskName: props.taskName,
          optionalCardId: card._id,
          optionalCardTitle: card.title,
        },
      })
    },
  })
}
