import type { PatientSettings } from './simulation/types'

export function calculatePredictedBodyWeight(sex: PatientSettings['sex'], heightCm: number): number {
  const base = sex === 'female' ? 45.5 : 50
  return Math.max(20, base + 0.91 * (heightCm - 152.4))
}
