import { makeGetWorkflowStructureQuery } from '@repo/tasquencer'

import { dealToDeliveryVersionManager } from "./dealToDelivery/definition";

// Import version managers here after scaffolding:
// import { workflowVersionManager } from './<name>/definition'

export const { getWorkflowStructure, genericGetWorkflowStructure } =
  makeGetWorkflowStructureQuery([dealToDeliveryVersionManager])
