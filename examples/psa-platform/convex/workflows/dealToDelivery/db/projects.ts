/**
 * Database functions for projects
 */
import type {
  DatabaseReader,
  DatabaseWriter,
} from "../../../_generated/server";
import type { Doc, Id } from "../../../_generated/dataModel";
import { EntityNotFoundError } from "@repo/tasquencer";
import { helpers } from "../../../tasquencer";

export type ProjectStatus = Doc<"projects">["status"];

export async function insertProject(
  db: DatabaseWriter,
  project: Omit<Doc<"projects">, "_id" | "_creationTime">
): Promise<Id<"projects">> {
  return await db.insert("projects", project);
}

export async function getProject(
  db: DatabaseReader,
  projectId: Id<"projects">
): Promise<Doc<"projects"> | null> {
  return await db.get(projectId);
}

export async function getProjectByWorkflowId(
  db: DatabaseReader,
  workflowId: Id<"tasquencerWorkflows">
): Promise<Doc<"projects"> | null> {
  const rootWorkflowId = await helpers.getRootWorkflowId(db, workflowId);
  return await db
    .query("projects")
    .withIndex("by_workflow_id", (q) => q.eq("workflowId", rootWorkflowId))
    .unique();
}

export async function getProjectByDealId(
  db: DatabaseReader,
  dealId: Id<"deals">
): Promise<Doc<"projects"> | null> {
  // Projects might not have an index by dealId in all cases
  const projects = await db.query("projects").collect();
  return projects.find((p) => p.dealId === dealId) ?? null;
}

export async function updateProjectStatus(
  db: DatabaseWriter,
  projectId: Id<"projects">,
  status: ProjectStatus
): Promise<void> {
  const project = await db.get(projectId);
  if (!project) {
    throw new EntityNotFoundError("Project", { projectId });
  }
  await db.patch(projectId, { status });
}

export async function updateProject(
  db: DatabaseWriter,
  projectId: Id<"projects">,
  updates: Partial<Omit<Doc<"projects">, "_id" | "_creationTime" | "organizationId">>
): Promise<void> {
  const project = await db.get(projectId);
  if (!project) {
    throw new EntityNotFoundError("Project", { projectId });
  }
  await db.patch(projectId, updates);
}

export async function listProjectsByOrganization(
  db: DatabaseReader,
  organizationId: Id<"organizations">,
  limit = 50
): Promise<Array<Doc<"projects">>> {
  return await db
    .query("projects")
    .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
    .order("desc")
    .take(limit);
}

export async function listProjectsByStatus(
  db: DatabaseReader,
  organizationId: Id<"organizations">,
  status: ProjectStatus,
  limit = 50
): Promise<Array<Doc<"projects">>> {
  return await db
    .query("projects")
    .withIndex("by_status", (q) =>
      q.eq("organizationId", organizationId).eq("status", status)
    )
    .order("desc")
    .take(limit);
}

export async function listProjectsByManager(
  db: DatabaseReader,
  managerId: Id<"users">,
  limit = 50
): Promise<Array<Doc<"projects">>> {
  return await db
    .query("projects")
    .withIndex("by_manager", (q) => q.eq("managerId", managerId))
    .order("desc")
    .take(limit);
}

export async function listProjectsByCompany(
  db: DatabaseReader,
  companyId: Id<"companies">,
  limit = 50
): Promise<Array<Doc<"projects">>> {
  return await db
    .query("projects")
    .withIndex("by_company", (q) => q.eq("companyId", companyId))
    .order("desc")
    .take(limit);
}
