/**
 * Phase 5: Technical Setup Work Items
 *
 * Parallel tasks for infrastructure, analytics, and media setup,
 * followed by QA testing with fix issues loop.
 */

export { buildInfraTask, buildInfraWorkItem } from './buildInfra.workItem'
export {
  configAnalyticsTask,
  configAnalyticsWorkItem,
} from './configAnalytics.workItem'
export { setupMediaTask, setupMediaWorkItem } from './setupMedia.workItem'
export { qaTestTask, qaTestWorkItem } from './qaTest.workItem'
export { fixIssuesTask, fixIssuesWorkItem } from './fixIssues.workItem'
