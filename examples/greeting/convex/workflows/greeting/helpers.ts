import { Authorization } from '../../tasquencer'

/**
 * Work item metadata helpers for greeting workflow
 * Provides functions for claiming, querying, and managing work items
 */
export const GreetingWorkItemHelpers =
  Authorization.workItemMetadataHelpersForTable('greetingWorkItems')
