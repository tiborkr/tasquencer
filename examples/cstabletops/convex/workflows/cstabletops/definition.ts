import { versionManagerFor } from '../../tasquencer'
import { cstabletopsWorkflowV1, cstabletopsWorkflowV2 } from './workflows/cstabletops.workflow'

export const cstabletopsVersionManager = versionManagerFor('cstabletops')
  .registerVersion('v1', cstabletopsWorkflowV1)
  .registerVersion('v2', cstabletopsWorkflowV2)
  .build()
