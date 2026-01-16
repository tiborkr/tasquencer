import { Builder } from '../../../tasquencer'
import { createDealTask } from '../workItems/createDeal.workItem'
import { qualifyLeadTask } from '../workItems/qualifyLead.workItem'
import { disqualifyLeadTask } from '../workItems/disqualifyLead.workItem'
import { createEstimateTask } from '../workItems/createEstimate.workItem'
import { createProposalTask } from '../workItems/createProposal.workItem'
import { sendProposalTask } from '../workItems/sendProposal.workItem'
import { negotiateTermsTask } from '../workItems/negotiateTerms.workItem'
import { reviseProposalTask } from '../workItems/reviseProposal.workItem'
import { getProposalSignedTask } from '../workItems/getProposalSigned.workItem'
import { archiveDealTask } from '../workItems/archiveDeal.workItem'
const completeSalesTask = Builder.dummyTask()
export const salesPhaseWorkflow = Builder.workflow('salesPhase')
  .startCondition('start')
  .endCondition('end')
  .task('createDeal', createDealTask)
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
      .route(async ({ route }) => {
      const routes = [route.toTask('createEstimate'), route.toTask('disqualifyLead')]
      return routes[Math.floor(Math.random() * routes.length)]!
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
      .route(async ({ route }) => {
      const routes = [route.toTask('getProposalSigned'), route.toTask('reviseProposal'), route.toTask('archiveDeal')]
      return routes[Math.floor(Math.random() * routes.length)]!
    })
  )
  .connectTask('reviseProposal', (to) => to.task('sendProposal'))
  .connectTask('getProposalSigned', (to) =>
    to
      .task('completeSales')
      .task('archiveDeal')
      .route(async ({ route }) => {
      const routes = [route.toTask('completeSales'), route.toTask('archiveDeal')]
      return routes[Math.floor(Math.random() * routes.length)]!
    })
  )
  .connectTask('archiveDeal', (to) => to.condition('end'))
  .connectTask('completeSales', (to) => to.condition('end'))