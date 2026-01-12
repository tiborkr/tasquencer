import { makeGetWorkflowStructureQuery } from '@repo/tasquencer'

import { cstabletopsVersionManager } from './cstabletops/definition'

export const { getWorkflowStructure, genericGetWorkflowStructure } =
  makeGetWorkflowStructureQuery([cstabletopsVersionManager])
