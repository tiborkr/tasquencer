import {
  v,
  type VUnion,
  type VObject,
  type VLiteral,
  ConvexError,
} from 'convex/values'
import { query } from '../_generated/server'
import type { AnyVersionManager, Version } from '../tasquencer/versionManager'
import type { UnionToTuple } from 'type-fest'
import type { ExtractedWorkflow } from '../tasquencer/util/extractWorkflowStructure'

type WorkflowNameAndVersions<
  TName extends string,
  TVersions extends string,
> = TVersions extends TVersions
  ? {
      name: TName
      version: TVersions
    }
  : never

type WorkflowNamesAndVersions<T extends AnyVersionManager> = T extends T
  ? WorkflowNameAndVersions<
      T['workflowName'],
      T['versions'][number]['versionName']
    >
  : never

type ValidatorWorkflowNamesAndVersions<
  T extends { name: string; version: string },
> = VUnion<
  T,
  T extends T
    ? UnionToTuple<
        VObject<
          T,
          { name: VLiteral<T['name']>; version: VLiteral<T['version']> }
        >
      >
    : never
>

export function makeGetWorkflowStructureQuery<T extends AnyVersionManager>(
  versionManagers: T[],
) {
  const getWorkflowStructureRegistry: Record<string, () => ExtractedWorkflow> =
    {}

  for (const versionManager of versionManagers) {
    for (const version of versionManager.versions) {
      getWorkflowStructureRegistry[
        `${versionManager.workflowName}/${version.versionName}`
      ] = versionManager.apiForVersion(
        version.versionName,
      ).helpers.getWorkflowStructure
    }
  }

  const validator = v.union(
    ...versionManagers.flatMap((versionManager) => {
      return versionManager.versions.map((version: Version) =>
        v.object({
          name: v.literal(versionManager.workflowName),
          version: v.literal(version.versionName),
        }),
      )
    }),
  )

  const getWorkflowStructure = (workflowName: string, version: string) => {
    const getWorkflowStructureForWorkflowNameAndVersion =
      getWorkflowStructureRegistry[`${workflowName}/${version}`]
    if (!getWorkflowStructureForWorkflowNameAndVersion) {
      throw new ConvexError(
        `No getWorkflowStructure found for ${workflowName}/${version}`,
      )
    }
    return getWorkflowStructureForWorkflowNameAndVersion()
  }

  return {
    getWorkflowStructure: query({
      args: {
        workflow: validator as ValidatorWorkflowNamesAndVersions<
          WorkflowNamesAndVersions<T>
        >,
      },
      handler: async (_ctx, args) => {
        return getWorkflowStructure(args.workflow.name, args.workflow.version)
      },
    }),
    genericGetWorkflowStructure: query({
      args: {
        workflow: validator as unknown as VObject<
          { name: string; version: string },
          { name: VLiteral<string>; version: VLiteral<string> }
        >,
      },
      handler: async (_ctx, args) => {
        return getWorkflowStructure(args.workflow.name, args.workflow.version)
      },
    }),
  }
}
