import type { AnyVersionManager } from "../../versionManager";
import { internalVersionManagerRegistry } from "../../../testing/tasquencer";
import { versionManagerFor } from "../../versionManager";
import type { AnyWorkflowBuilder } from "../../builder";

export async function withVersionManagers<T>(
  managers: AnyVersionManager | AnyVersionManager[],
  fn: () => Promise<T>
): Promise<T> {
  const list = Array.isArray(managers) ? managers : [managers];
  list.forEach((manager) =>
    internalVersionManagerRegistry.registerVersionManager(manager)
  );
  try {
    return await fn();
  } finally {
    list
      .slice()
      .reverse()
      .forEach((manager) =>
        internalVersionManagerRegistry.unregisterVersionManager(manager)
      );
  }
}

type VersionManagerBuilder = {
  workflowName: string;
  versionName: string;
  builder: AnyWorkflowBuilder;
};

export function versionManagerFromBuilder({
  workflowName,
  versionName,
  builder,
}: VersionManagerBuilder) {
  return versionManagerFor(workflowName)
    .registerVersion(versionName, builder)
    .build();
}

export async function withVersionManagerBuilders<T>(
  builders: VersionManagerBuilder | VersionManagerBuilder[],
  fn: () => Promise<T>
): Promise<T> {
  const configs = Array.isArray(builders) ? builders : [builders];
  const managers = configs.map((config) => versionManagerFromBuilder(config));
  return await withVersionManagers(managers, fn);
}

export function registerVersionManagersForTesting(
  builders: VersionManagerBuilder | VersionManagerBuilder[]
) {
  const configs = Array.isArray(builders) ? builders : [builders];
  const managers = configs.map((config) => versionManagerFromBuilder(config));
  managers.forEach((manager) =>
    internalVersionManagerRegistry.registerVersionManager(manager)
  );
  return () => {
    managers
      .slice()
      .reverse()
      .forEach((manager) =>
        internalVersionManagerRegistry.unregisterVersionManager(manager)
      );
  };
}
