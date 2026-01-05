import { createScopeModule } from "@repo/tasquencer";

/**
 * ER Workflow Scope Module
 * Defines all scopes (permissions) available in the ER workflow
 */

const triageScopeModule = createScopeModule("triage")
  .withScope("read", {
    description: "View triage work items and patient triage information",
    tags: ["triage", "read"],
  })
  .withScope("write", {
    description: "Complete triage assessments and assign priority levels",
    tags: ["triage", "write"],
  });

const nursingScopeModule = createScopeModule("nursing")
  .withScope("read", {
    description: "View nursing tasks and patient care information",
    tags: ["nursing", "read"],
  })
  .withScope("write", {
    description: "Administer medications and complete nursing tasks",
    tags: ["nursing", "write"],
  });

const physicianScopeModule = createScopeModule("physician")
  .withScope("read", {
    description: "View patient diagnostic results and medical records",
    tags: ["physician", "read"],
  })
  .withScope("write", {
    description: "Review diagnostics and make treatment decisions",
    tags: ["physician", "write"],
  });

const specialistScopeModule = createScopeModule("specialist")
  .withScope("consult", {
    description: "Accept and complete specialist consultation requests",
    tags: ["specialist", "consult"],
  })
  .withScope("cardiology", {
    description: "Perform cardiology consultations and procedures",
    tags: ["specialist", "cardiology"],
  })
  .withScope("neurology", {
    description: "Perform neurology consultations and assessments",
    tags: ["specialist", "neurology"],
  })
  .withScope("surgery", {
    description: "Perform surgical procedures",
    tags: ["specialist", "surgery"],
  });

const diagnosticsScopeModule = createScopeModule("diagnostics")
  .withScope("xray", {
    description: "Conduct X-ray imaging procedures",
    tags: ["diagnostics", "xray"],
  })
  .withScope("lab", {
    description: "Analyze blood samples and laboratory tests",
    tags: ["diagnostics", "lab"],
  });

const supportScopeModule = createScopeModule("support")
  .withScope("admission", {
    description: "Admit patients to the hospital",
    tags: ["support", "admission"],
  })
  .withScope("discharge", {
    description: "Prepare patients for discharge from the hospital",
    tags: ["support", "discharge"],
  });

export const erScopeModule = createScopeModule("er")
  .withScope("staff", {
    description: "Base scope for ER staff members",
    tags: ["er", "staff"],
  })
  .withNestedModule(triageScopeModule)
  .withNestedModule(nursingScopeModule)
  .withNestedModule(physicianScopeModule)
  .withNestedModule(specialistScopeModule)
  .withNestedModule(diagnosticsScopeModule)
  .withNestedModule(supportScopeModule);
