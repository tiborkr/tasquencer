export const ER_SCOPE_SECTIONS = [
  { scope: 'er:triage:write', label: 'Triage Nurses' },
  { scope: 'er:diagnostics:xray', label: 'Radiologists' },
  { scope: 'er:diagnostics:lab', label: 'Lab Technicians' },
  { scope: 'er:specialist:surgery', label: 'Surgeons' },
  { scope: 'er:physician:write', label: 'Senior Doctors' },
  { scope: 'er:specialist:cardiology', label: 'Cardiologists' },
  { scope: 'er:specialist:neurology', label: 'Neurologists' },
  { scope: 'er:nursing:write', label: 'Floor Nurses' },
  { scope: 'er:support:admission', label: 'Admissions Clerks' },
  { scope: 'er:support:discharge', label: 'Discharge Coordinators' },
] as const

export type ErScopeName = (typeof ER_SCOPE_SECTIONS)[number]['scope']
