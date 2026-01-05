import { internalMutation } from "../../_generated/server";
import { components } from "../../_generated/api";

// Auth Group Names
export const AUTH_ER_GROUPS = {
  NURSING: "er_nursing",
  PHYSICIANS: "er_physicians",
  SPECIALISTS: "er_specialists",
  DIAGNOSTICS: "er_diagnostics",
  SUPPORT: "er_support",
} as const;

// Auth Role Names
export const AUTH_ER_ROLES = {
  TRIAGE_NURSE: "er_triage_nurse",
  FLOOR_NURSE: "er_floor_nurse",
  SENIOR_DOCTOR: "er_senior_doctor",
  CARDIOLOGIST: "er_cardiologist",
  NEUROLOGIST: "er_neurologist",
  SURGEON: "er_surgeon",
  RADIOLOGIST: "er_radiologist",
  LAB_TECHNICIAN: "er_lab_technician",
  ADMISSIONS_CLERK: "er_admissions_clerk",
  DISCHARGE_COORDINATOR: "er_discharge_coordinator",
} as const;

/**
 * Auth Groups Configuration
 */
const authGroups = [
  {
    name: AUTH_ER_GROUPS.NURSING,
    description: "ER Nursing Staff - Triage and Floor Nurses",
  },
  {
    name: AUTH_ER_GROUPS.PHYSICIANS,
    description: "ER Physicians - Senior Doctors",
  },
  {
    name: AUTH_ER_GROUPS.SPECIALISTS,
    description: "Medical Specialists - Cardiologists, Neurologists, Surgeons",
  },
  {
    name: AUTH_ER_GROUPS.DIAGNOSTICS,
    description: "Diagnostic Staff - Radiologists and Lab Technicians",
  },
  {
    name: AUTH_ER_GROUPS.SUPPORT,
    description: "Support Staff - Admissions and Discharge Coordinators",
  },
];

/**
 * Auth Roles Configuration with Scope Bundles
 */
const authRoles = [
  {
    name: AUTH_ER_ROLES.TRIAGE_NURSE,
    description: "Triage Nurse - Initial patient assessment",
    scopes: [
      "er:staff",
      "er:triage:read",
      "er:triage:write",
      "er:nursing:read",
    ],
  },
  {
    name: AUTH_ER_ROLES.FLOOR_NURSE,
    description: "Floor Nurse - Patient care and medication administration",
    scopes: ["er:staff", "er:nursing:read", "er:nursing:write"],
  },
  {
    name: AUTH_ER_ROLES.SENIOR_DOCTOR,
    description: "Senior Doctor - Diagnostic review and treatment decisions",
    scopes: ["er:staff", "er:physician:read", "er:physician:write"],
  },
  {
    name: AUTH_ER_ROLES.CARDIOLOGIST,
    description: "Cardiologist - Cardiology consultations",
    scopes: ["er:staff", "er:specialist:consult", "er:specialist:cardiology"],
  },
  {
    name: AUTH_ER_ROLES.NEUROLOGIST,
    description: "Neurologist - Neurology consultations",
    scopes: ["er:staff", "er:specialist:consult", "er:specialist:neurology"],
  },
  {
    name: AUTH_ER_ROLES.SURGEON,
    description: "Surgeon - Surgical procedures",
    scopes: ["er:staff", "er:specialist:consult", "er:specialist:surgery"],
  },
  {
    name: AUTH_ER_ROLES.RADIOLOGIST,
    description: "Radiologist - X-ray imaging",
    scopes: ["er:staff", "er:diagnostics:xray"],
  },
  {
    name: AUTH_ER_ROLES.LAB_TECHNICIAN,
    description: "Lab Technician - Blood sample analysis",
    scopes: ["er:staff", "er:diagnostics:lab"],
  },
  {
    name: AUTH_ER_ROLES.ADMISSIONS_CLERK,
    description: "Admissions Clerk - Patient admission",
    scopes: ["er:staff", "er:support:admission"],
  },
  {
    name: AUTH_ER_ROLES.DISCHARGE_COORDINATOR,
    description: "Discharge Coordinator - Patient discharge",
    scopes: ["er:staff", "er:support:discharge"],
  },
];

/**
 * Role-to-Group Assignments
 */
const roleGroupAssignments = [
  { role: AUTH_ER_ROLES.TRIAGE_NURSE, group: AUTH_ER_GROUPS.NURSING },
  { role: AUTH_ER_ROLES.FLOOR_NURSE, group: AUTH_ER_GROUPS.NURSING },
  { role: AUTH_ER_ROLES.SENIOR_DOCTOR, group: AUTH_ER_GROUPS.PHYSICIANS },
  { role: AUTH_ER_ROLES.CARDIOLOGIST, group: AUTH_ER_GROUPS.SPECIALISTS },
  { role: AUTH_ER_ROLES.NEUROLOGIST, group: AUTH_ER_GROUPS.SPECIALISTS },
  { role: AUTH_ER_ROLES.SURGEON, group: AUTH_ER_GROUPS.SPECIALISTS },
  { role: AUTH_ER_ROLES.RADIOLOGIST, group: AUTH_ER_GROUPS.DIAGNOSTICS },
  { role: AUTH_ER_ROLES.LAB_TECHNICIAN, group: AUTH_ER_GROUPS.DIAGNOSTICS },
  { role: AUTH_ER_ROLES.ADMISSIONS_CLERK, group: AUTH_ER_GROUPS.SUPPORT },
  {
    role: AUTH_ER_ROLES.DISCHARGE_COORDINATOR,
    group: AUTH_ER_GROUPS.SUPPORT,
  },
];

/**
 * Setup Auth ER Workflow Authorization
 * Creates groups, roles, and assigns roles to groups
 */
export const setupAuthErAuthorization = internalMutation({
  handler: async (ctx) => {
    const groupMap: Record<string, string> = {};
    const roleMap: Record<string, string> = {};

    // Create groups
    for (const groupDef of authGroups) {
      try {
        // Check if group already exists
        const existing = await ctx.runQuery(
          components.tasquencerAuthorization.api.getAuthGroupByName,
          { name: groupDef.name }
        );

        if (existing) {
          groupMap[groupDef.name] = existing._id;
        } else {
          const groupId = await ctx.runMutation(
            components.tasquencerAuthorization.api.createAuthGroup,
            {
              name: groupDef.name,
              description: groupDef.description,
            }
          );
          groupMap[groupDef.name] = groupId;
        }
      } catch (error: any) {
        console.error(`Error creating group ${groupDef.name}:`, error);
      }
    }

    // Create roles
    for (const roleDef of authRoles) {
      try {
        // Check if role already exists
        const existing = await ctx.runQuery(
          components.tasquencerAuthorization.api.getAuthRoleByName,
          { name: roleDef.name }
        );

        if (existing) {
          roleMap[roleDef.name] = existing._id;
          // Update scopes if they've changed
          await ctx.runMutation(
            components.tasquencerAuthorization.api.updateAuthRole,
            {
              roleId: existing._id,
              scopes: roleDef.scopes,
            }
          );
        } else {
          const roleId = await ctx.runMutation(
            components.tasquencerAuthorization.api.createAuthRole,
            {
              name: roleDef.name,
              description: roleDef.description,
              scopes: roleDef.scopes,
            }
          );
          roleMap[roleDef.name] = roleId;
        }
      } catch (error: any) {
        console.error(`Error creating role ${roleDef.name}:`, error);
      }
    }

    // Assign roles to groups
    let assignmentCount = 0;
    for (const assignment of roleGroupAssignments) {
      const groupId = groupMap[assignment.group];
      const roleId = roleMap[assignment.role];

      if (!groupId || !roleId) continue;

      try {
        await ctx.runMutation(
          components.tasquencerAuthorization.api.assignAuthRoleToGroup,
          {
            groupId,
            roleId,
          }
        );
        assignmentCount++;
      } catch (error: any) {
        // Skip if already assigned
        if (!error.message.includes("already assigned")) {
          console.error(
            `Error assigning role ${assignment.role} to group ${assignment.group}:`,
            error
          );
        }
      }
    }

    return {
      groups: Object.keys(groupMap).length,
      roles: Object.keys(roleMap).length,
      assignments: assignmentCount,
      groupMap,
      roleMap,
    };
  },
});
