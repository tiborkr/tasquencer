export const ER_ROLES = {
  TRIAGE_NURSE: 'er_triage_nurse',
  FLOOR_NURSE: 'er_floor_nurse',
  SENIOR_DOCTOR: 'er_senior_doctor',
  CARDIOLOGIST: 'er_cardiologist',
  NEUROLOGIST: 'er_neurologist',
  SURGEON: 'er_surgeon',
  RADIOLOGIST: 'er_radiologist',
  LAB_TECHNICIAN: 'er_lab_technician',
  ADMISSIONS_CLERK: 'er_admissions_clerk',
  DISCHARGE_COORDINATOR: 'er_discharge_coordinator',
} as const

export const ER_GROUPS = {
  ALL_STAFF: 'er_all_staff',
  NURSING: 'er_nursing',
  PHYSICIANS: 'er_physicians',
  SPECIALISTS: 'er_specialists',
  SUPPORT: 'er_support',
  DIAGNOSTICS: 'er_diagnostics',
} as const

export type ErRole = (typeof ER_ROLES)[keyof typeof ER_ROLES]
export type ErGroup = (typeof ER_GROUPS)[keyof typeof ER_GROUPS]
