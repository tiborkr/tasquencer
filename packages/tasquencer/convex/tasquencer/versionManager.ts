import invariant from "tiny-invariant";
import type { AnyWorkflowBuilder, GetWorkflowBuilderName } from "./builder";
import { apiFor } from "./util/apiFacade";
import type { AnyMigration, Migration } from "./versionManager/migration";
import type { LastArrayElement } from "type-fest";
import { Workflow } from "./elements/workflow";
import type { ComponentApi } from "../components/audit/src/component/_generated/component";
import { components } from "../_generated/api";

export type Version = { versionName: string; builder: AnyWorkflowBuilder };

/*type VersionNames<
  TVersions extends Version[],
  TAcc extends string[] = [],
> = TVersions['length'] extends TAcc['length']
  ? TAcc
  : VersionNames<
      TVersions,
      [...TAcc, `${TVersions[TAcc['length']]['versionName']}`]
    >

type MigrationVersionNamePairs<TWorkflowVersions extends Version[]> = Pairs<
  VersionNames<TWorkflowVersions>
>
type MigrationName<T extends [string, string]> = T extends T
  ? `${T[0]}->${T[1]}`
  : never*/

type GetWorkflowVersionName<TWorkflowVersions extends Version[]> =
  TWorkflowVersions[number]["versionName"];

type GetWorkflowBuilderForVersion<
  TWorkflowVersions extends Version[],
  TVersionName extends string,
> = Extract<
  TWorkflowVersions[number],
  { versionName: TVersionName }
>["builder"];

type AssertWorkflowBuilderName<
  TName extends string,
  TBuilder extends AnyWorkflowBuilder,
> = TName extends GetWorkflowBuilderName<TBuilder> ? TBuilder : never;

type GenerateValidMigration<
  TLastVersion extends Version,
  TNewVersion extends Version,
> = {
  name: `${TLastVersion["versionName"]}->${TNewVersion["versionName"]}`;
  migration: Migration<TLastVersion["builder"], TNewVersion["builder"]>;
};

export class VersionManagerInit<
  TWorkflowName extends string,
  TWorkflowVersions extends Version[],
  TValidMigrations extends { name: string; migration: AnyMigration } = never,
> {
  static make<TWorkflowName extends string>(
    workflowName: TWorkflowName,
    auditComponent: ComponentApi
  ) {
    return new VersionManagerInit<TWorkflowName, []>(
      workflowName,
      [],
      auditComponent
    );
  }

  private constructor(
    readonly workflowName: TWorkflowName,
    readonly versions: TWorkflowVersions,
    readonly auditComponent: ComponentApi,
    readonly versionToMigrationName: Record<string, string> = {},
    readonly migrations: Record<string, AnyMigration | undefined> = {}
  ) {}

  registerVersion<
    TVersionName extends string,
    TWorkflowBuilder extends AnyWorkflowBuilder,
  >(
    versionName: TVersionName,
    builder: AssertWorkflowBuilderName<TWorkflowName, TWorkflowBuilder>
  ) {
    invariant(
      !this.versions.some((version) => version.versionName === versionName),
      `Version ${versionName} is already registered for workflow ${this.workflowName}`
    );
    type LastVersion = LastArrayElement<TWorkflowVersions>;

    const lastVersion = this.versions[this.versions.length - 1];
    let versionToMigrationName = { ...this.versionToMigrationName };
    let migrations = { ...this.migrations };

    if (lastVersion) {
      const migrationName = `${lastVersion.versionName}->${versionName}`;
      versionToMigrationName[versionName] = migrationName;
      migrations[migrationName] = undefined;
    }

    return new VersionManagerInit<
      TWorkflowName,
      [
        ...TWorkflowVersions,
        { versionName: TVersionName; builder: TWorkflowBuilder },
      ],
      [LastVersion] extends [never]
        ? never
        :
            | TValidMigrations
            | GenerateValidMigration<
                LastVersion,
                { versionName: TVersionName; builder: TWorkflowBuilder }
              >
    >(
      this.workflowName,
      [...this.versions, { versionName: versionName, builder }],
      this.auditComponent,
      versionToMigrationName,
      migrations
    );
  }

  withMigration<TMigrationName extends TValidMigrations["name"]>(
    migrationName: TMigrationName,
    migration: Extract<TValidMigrations, { name: TMigrationName }>["migration"]
  ) {
    return new VersionManagerInit<
      TWorkflowName,
      TWorkflowVersions,
      TValidMigrations
    >(
      this.workflowName,
      this.versions,
      this.auditComponent,
      this.versionToMigrationName,
      {
        ...this.migrations,
        [migrationName]: migration,
      }
    );
  }

  build<
    TDeprecatedVersions extends GetWorkflowVersionName<TWorkflowVersions> =
      never,
  >(props?: { deprecatedVersions: TDeprecatedVersions[] }) {
    const deprecatedVersions: string[] = [...(props?.deprecatedVersions ?? [])];

    const activeVersions = this.versions
      .map((version) => version.versionName)
      .filter((version) => !deprecatedVersions?.includes(version));

    return new VersionManager(
      this.workflowName,
      this.versions,
      this.auditComponent,
      this.versionToMigrationName,
      this.migrations,
      {
        deprecatedVersions,
        activeVersions,
      }
    ) as VersionManager<
      TWorkflowName,
      TWorkflowVersions,
      Exclude<GetWorkflowVersionName<TWorkflowVersions>, TDeprecatedVersions>
    >;
  }
}

export type AnyVersionManager = VersionManager<any, any, any>;

export class VersionManager<
  TWorkflowName extends string,
  TWorkflowVersions extends Version[],
  TActiveVersion extends GetWorkflowVersionName<TWorkflowVersions>,
> {
  private apiForVersionRegistry: Record<string, ReturnType<typeof apiFor>> = {};
  private buildForVersionRegistry: Record<string, Workflow> = {};
  constructor(
    readonly workflowName: TWorkflowName,
    readonly versions: TWorkflowVersions,
    readonly auditComponent: ComponentApi,
    readonly versionToMigrationName: Record<string, string>,
    readonly migrations: Record<string, AnyMigration | undefined>,
    readonly props: {
      deprecatedVersions: string[];
      activeVersions: string[];
    }
  ) {
    this.apiForVersionRegistry = this.versions.reduce<
      Record<string, ReturnType<typeof apiFor>>
    >((acc, version) => {
      const migrationName = this.versionToMigrationName[version.versionName];
      const migration = this.migrations[migrationName];
      acc[version.versionName] = apiFor(
        version.versionName,
        version.builder,
        this.auditComponent,
        {
          isVersionDeprecated: this.props.deprecatedVersions.includes(
            version.versionName
          ),
          migration,
        }
      );
      return acc;
    }, {});
    this.buildForVersionRegistry = this.versions.reduce<
      Record<string, Workflow>
    >((acc, version) => {
      const migrationName = this.versionToMigrationName[version.versionName];
      const migration = this.migrations[migrationName];
      acc[version.versionName] = version.builder.build(version.versionName, {
        isVersionDeprecated: this.props.deprecatedVersions.includes(
          version.versionName
        ),
        migration,
      });
      return acc;
    }, {});
  }

  apiForVersion<TVersion extends GetWorkflowVersionName<TWorkflowVersions>>(
    version: TVersion
  ): ReturnType<
    typeof apiFor<
      TVersion,
      GetWorkflowBuilderForVersion<TWorkflowVersions, TVersion>
    >
  > {
    const api = this.apiForVersionRegistry[version];
    invariant(api, `Version ${version} not found`);
    return api as ReturnType<
      typeof apiFor<
        TVersion,
        GetWorkflowBuilderForVersion<TWorkflowVersions, TVersion>
      >
    >;
  }
  buildForVersion<TVersion extends GetWorkflowVersionName<TWorkflowVersions>>(
    version: TVersion
  ) {
    const builtWorkflow = this.buildForVersionRegistry[version];
    invariant(builtWorkflow, `Version ${version} not found`);
    return builtWorkflow;
  }

  versionNamesAfter<TVersion extends GetWorkflowVersionName<TWorkflowVersions>>(
    version: TVersion
  ) {
    const index = this.versions.findIndex((v) => v.versionName === version);

    invariant(index !== -1, `Version ${version} not found`);

    return this.versions
      .slice(index + 1)
      .map((v) => v.versionName) as GetWorkflowVersionName<TWorkflowVersions>[];
  }

  deprecatedVersions() {
    return this.props.deprecatedVersions as Exclude<
      GetWorkflowVersionName<TWorkflowVersions>,
      TActiveVersion
    >[];
  }

  activeVersions() {
    return this.props.activeVersions as TActiveVersion[];
  }
}

export function makeVersionManagerFor(auditComponent: ComponentApi) {
  return function <TWorkflowName extends string>(workflowName: TWorkflowName) {
    return VersionManagerInit.make(workflowName, auditComponent);
  };
}

export const versionManagerFor = makeVersionManagerFor(
  components.tasquencerAudit
);
