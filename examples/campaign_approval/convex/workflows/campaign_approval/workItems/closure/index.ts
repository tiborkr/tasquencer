/**
 * Phase 8: Closure work items
 *
 * Sequential workflow:
 * endCampaign -> compileData -> conductAnalysis -> presentResults -> archiveMaterials -> end
 */

export {
  endCampaignWorkItem,
  endCampaignTask,
} from './endCampaign.workItem'

export {
  compileDataWorkItem,
  compileDataTask,
} from './compileData.workItem'

export {
  conductAnalysisWorkItem,
  conductAnalysisTask,
} from './conductAnalysis.workItem'

export {
  presentResultsWorkItem,
  presentResultsTask,
} from './presentResults.workItem'

export {
  archiveMaterialsWorkItem,
  archiveMaterialsTask,
} from './archiveMaterials.workItem'
