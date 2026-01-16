import { Builder } from '../../../tasquencer'
import { qualifyLeadTask } from '../workItems/qualifyLead.workItem'
import { disqualifyLeadTask } from '../workItems/disqualifyLead.workItem'
import { createEstimateTask } from '../workItems/createEstimate.workItem'
import { createProposalTask } from '../workItems/createProposal.workItem'
import { sendProposalTask } from '../workItems/sendProposal.workItem'
import { negotiateTermsTask } from '../workItems/negotiateTerms.workItem'
import { reviseProposalTask } from '../workItems/reviseProposal.workItem'
import { getProposalSignedTask } from '../workItems/getProposalSigned.workItem'
import { archiveDealTask } from '../workItems/archiveDeal.workItem'
import { getDealByWorkflowId } from '../db'

// Deal is now created during workflow initialization (dealToDelivery.workflow.ts)
// This dummy task just confirms the deal exists and transitions to qualifyLead
const createDealDummyTask = Builder.dummyTask()
const completeSalesTask = Builder.dummyTask()

export const salesPhaseWorkflow = Builder.workflow('salesPhase')
  .startCondition('start')
  .endCondition('end')
  .dummyTask('createDeal', createDealDummyTask)
  .task('qualifyLead', qualifyLeadTask.withSplitType('xor'))
  .task('disqualifyLead', disqualifyLeadTask)
  .task('createEstimate', createEstimateTask)
  .task('createProposal', createProposalTask)
  .task('sendProposal', sendProposalTask.withJoinType('xor'))
  .task('negotiateTerms', negotiateTermsTask.withSplitType('xor'))
  .task('reviseProposal', reviseProposalTask)
  .task('getProposalSigned', getProposalSignedTask.withSplitType('xor'))
  .task('archiveDeal', archiveDealTask.withJoinType('xor'))
  .dummyTask('completeSales', completeSalesTask)
  .connectCondition('start', (to) => to.task('createDeal'))
  .connectTask('createDeal', (to) => to.task('qualifyLead'))
  .connectTask('qualifyLead', (to) =>
    to
      .task('createEstimate')
      .task('disqualifyLead')
      .route(async ({ mutationCtx, parent, route }) => {
        // Get deal state to determine routing based on qualification outcome
        const deal = await getDealByWorkflowId(mutationCtx.db, parent.workflow.id)
        if (!deal) {
          throw new Error('Deal not found for workflow')
        }

        // Route based on deal stage set by qualifyLead completion
        // Qualified → createEstimate, Disqualified → disqualifyLead
        return deal.stage === 'Qualified'
          ? route.toTask('createEstimate')
          : route.toTask('disqualifyLead')
      })
  )
  .connectTask('disqualifyLead', (to) => to.task('archiveDeal'))
  .connectTask('createEstimate', (to) => to.task('createProposal'))
  .connectTask('createProposal', (to) => to.task('sendProposal'))
  .connectTask('sendProposal', (to) => to.task('negotiateTerms'))
  .connectTask('negotiateTerms', (to) =>
    to
      .task('getProposalSigned')
      .task('reviseProposal')
      .task('archiveDeal')
      .route(async ({ mutationCtx, parent, route }) => {
        // Get deal state to determine routing based on negotiation outcome
        const deal = await getDealByWorkflowId(mutationCtx.db, parent.workflow.id)
        if (!deal) {
          throw new Error('Deal not found for workflow')
        }

        // Route based on negotiation outcome stored in deal state:
        // - Lost: probability = 0 AND lostReason set → archiveDeal
        // - Accepted: probability = 75 → getProposalSigned
        // - Revision: probability unchanged (typically 50) → reviseProposal
        if (deal.probability === 0 && deal.lostReason) {
          return route.toTask('archiveDeal')
        } else if (deal.probability >= 75) {
          return route.toTask('getProposalSigned')
        } else {
          return route.toTask('reviseProposal')
        }
      })
  )
  .connectTask('reviseProposal', (to) => to.task('sendProposal'))
  .connectTask('getProposalSigned', (to) =>
    to
      .task('completeSales')
      .task('archiveDeal')
      .route(async ({ mutationCtx, parent, route }) => {
        // Get deal state to determine routing based on signature outcome
        const deal = await getDealByWorkflowId(mutationCtx.db, parent.workflow.id)
        if (!deal) {
          throw new Error('Deal not found for workflow')
        }

        // Route based on deal stage set by getProposalSigned completion
        // Won → completeSales, Lost → archiveDeal
        return deal.stage === 'Won'
          ? route.toTask('completeSales')
          : route.toTask('archiveDeal')
      })
  )
  .connectTask('archiveDeal', (to) => to.condition('end'))
  .connectTask('completeSales', (to) => to.condition('end'))