import { Authorization } from "../../tasquencer";

/**
 * Authorization helpers for ER workflow work items.
 * Provides type-safe access to work item metadata operations for the erWorkItems table.
 */
export const ErWorkItemHelpers =
  Authorization.workItemMetadataHelpersForTable("erWorkItems");
