import type { Id } from "../../_generated/dataModel";
import {
  ConfigurationError,
  ConstraintViolationError,
  DataIntegrityError,
  EntityNotFoundError,
} from "@repo/tasquencer";

export function assertAuthenticatedUser<T>(
  authUser: T | null | undefined,
  context: Record<string, unknown> = {}
): asserts authUser is T {
  if (!authUser) {
    throw new ConstraintViolationError("AUTHENTICATION_REQUIRED", {
      workflow: "erPatientJourney",
      ...context,
    });
  }
}

export function assertErGroupConfiguration(
  groupMap: Record<string, string>,
  groupNames: ReadonlyArray<string>
): void {
  const missingGroupNames = groupNames.filter((name) => !groupMap[name]);
  if (missingGroupNames.length > 0) {
    throw new ConfigurationError("ER staff groups not configured", {
      expectedGroupNames: groupNames,
      missingGroupNames,
    });
  }
}

export function assertPatientMatches(
  actualPatientId: Id<"erPatients">,
  expectedPatientId: Id<"erPatients">,
  context: Record<string, unknown> & { stage?: string }
): void {
  if (actualPatientId !== expectedPatientId) {
    const { stage, ...rest } = context;
    const stageSuffix =
      stage && stage.trim().length > 0 ? ` in ${stage} task` : "";
    throw new DataIntegrityError(`Patient mismatch${stageSuffix}`, {
      actualPatientId,
      expectedPatientId,
      ...(stage ? { stage } : {}),
      ...rest,
    });
  }
}

export function assertSpecialistConsultationExists(
  consultation: unknown,
  identifier: Record<string, unknown>
): asserts consultation is NonNullable<typeof consultation> {
  if (!consultation) {
    throw new EntityNotFoundError("SpecialistConsultation", identifier);
  }
}

export function assertSpecialistConsultationPending(
  consultation: { state: { status: string } },
  context: Record<string, unknown>
): void {
  if (consultation.state.status === "completed") {
    throw new ConstraintViolationError(
      "SPECIALIST_CONSULTATION_ALREADY_COMPLETED",
      context
    );
  }
}

/**
 * Assert that a patient exists, throwing an EntityNotFoundError if not.
 * @param patient - The patient record to check
 * @param workflowId - The workflow ID for context
 */
export function assertPatientExists(
  patient: unknown,
  workflowId: Id<"tasquencerWorkflows">
): asserts patient is NonNullable<typeof patient> {
  if (!patient) {
    throw new EntityNotFoundError("Patient", { workflowId });
  }
}

/**
 * Assert that a diagnostics record exists, throwing an EntityNotFoundError if not.
 * @param diagnostics - The diagnostics record to check
 * @param workflowId - The workflow ID for context
 */
export function assertDiagnosticsExists(
  diagnostics: unknown,
  workflowId: Id<"tasquencerWorkflows">
): asserts diagnostics is NonNullable<typeof diagnostics> {
  if (!diagnostics) {
    throw new EntityNotFoundError("Diagnostics", { workflowId });
  }
}

/**
 * Assert that a hospital stay record exists, throwing an EntityNotFoundError if not.
 * @param hospitalStay - The hospital stay record to check
 * @param workflowId - The workflow ID for context
 */
export function assertHospitalStayExists(
  hospitalStay: unknown,
  workflowId: Id<"tasquencerWorkflows">
): asserts hospitalStay is NonNullable<typeof hospitalStay> {
  if (!hospitalStay) {
    throw new EntityNotFoundError("HospitalStay", { workflowId });
  }
}

/**
 * Assert that a diagnostic review exists, throwing an EntityNotFoundError if not.
 * @param review - The diagnostic review record to check
 * @param patientId - The patient ID for context
 */
export function assertDiagnosticReviewExists(
  review: unknown,
  patientId: Id<"erPatients">
): asserts review is NonNullable<typeof review> {
  if (!review) {
    throw new EntityNotFoundError("DiagnosticReview", { patientId });
  }
}
