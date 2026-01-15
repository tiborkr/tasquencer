import { versionManagerFor } from '../../tasquencer'
import { dealToDeliveryWorkflow } from './workflows/dealToDelivery.workflow'

export const dealToDeliveryVersionManager = versionManagerFor('dealToDelivery')
  .registerVersion('v1', dealToDeliveryWorkflow)
  .build()

// Export API for version v1
export const {
  initializeRootWorkflow,
  initializeWorkItem,
  startWorkItem,
  completeWorkItem,
  failWorkItem,
  cancelWorkItem,
  helpers: { getWorkflowTaskStates },
} = dealToDeliveryVersionManager.apiForVersion('v1')
