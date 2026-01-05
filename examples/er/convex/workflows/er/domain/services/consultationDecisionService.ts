export type SpecialtyType = 'cardiologist' | 'neurologist'

export function determineRequiredConsultations(consultationsNeeded: string[]): {
  needsCardiologist: boolean
  needsNeurologist: boolean
  hasConsultations: boolean
  specialties: SpecialtyType[]
} {
  const needsCardiologist = consultationsNeeded.includes('cardiologist')
  const needsNeurologist = consultationsNeeded.includes('neurologist')

  const specialties: SpecialtyType[] = []
  if (needsCardiologist) specialties.push('cardiologist')
  if (needsNeurologist) specialties.push('neurologist')

  return {
    needsCardiologist,
    needsNeurologist,
    hasConsultations: specialties.length > 0,
    specialties,
  }
}
