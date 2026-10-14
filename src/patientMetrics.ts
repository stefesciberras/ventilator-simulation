import type { PatientSettings } from './simulation/types'

export function calculatePredictedBodyWeight(sex: PatientSettings['sex'], heightCm: number): number {
  const base = sex === 'female' ? 45.5 : 50
  return Math.max(20, base + 0.91 * (heightCm - 152.4))
}


const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

export function calculateAnatomicDeadSpaceMl(patient: Pick<PatientSettings, 'sex' | 'heightCm'>): number {
  return calculatePredictedBodyWeight(patient.sex ?? 'male', patient.heightCm ?? 170) * 2
}

export function calculateConfiguredVdVt(patient: PatientSettings, referenceTidalVolumeMl?: number): number {
  if (Number.isFinite(patient.vdVt)) return clamp(patient.vdVt, 0.05, 0.95)
  const legacyDeadSpace = patient.deadSpaceVolume
  if (legacyDeadSpace != null && Number.isFinite(legacyDeadSpace) && referenceTidalVolumeMl != null && referenceTidalVolumeMl > 0) {
    return clamp(legacyDeadSpace / referenceTidalVolumeMl, 0.05, 0.95)
  }
  return 0.4
}

export function calculateEffectiveDeadSpace(patient: PatientSettings, tidalVolumeMl: number): { deadSpaceMl: number; vdVt: number; anatomicDeadSpaceMl: number } {
  const referenceTidalVolumeMl = Math.max(0, tidalVolumeMl)
  const configuredVdVt = calculateConfiguredVdVt(patient, referenceTidalVolumeMl)
  const anatomicDeadSpaceMl = calculateAnatomicDeadSpaceMl(patient)
  const deadSpaceMl = Math.max(anatomicDeadSpaceMl, referenceTidalVolumeMl * configuredVdVt)
  const vdVt = referenceTidalVolumeMl > 0 ? deadSpaceMl / referenceTidalVolumeMl : configuredVdVt
  return { deadSpaceMl, vdVt, anatomicDeadSpaceMl }
}
