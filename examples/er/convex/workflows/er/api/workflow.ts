import { erPatientJourneyVersionManager } from '../definition'

export const {
  initializeRootWorkflow,
  cancelRootWorkflow,
  initializeWorkflow,
  cancelWorkflow,
  initializeWorkItem,
  startWorkItem,
  completeWorkItem,
  failWorkItem,
  cancelWorkItem,
  internalInitializeRootWorkflow,
  internalCancelRootWorkflow,
  internalInitializeWorkflow,
  internalCancelWorkflow,
  internalInitializeWorkItem,
  internalStartWorkItem,
  internalCompleteWorkItem,
  internalFailWorkItem,
  internalCancelWorkItem,
  helpers: {
    getWorkflowTaskStates,
  },
} = erPatientJourneyVersionManager.apiForVersion('v1')

