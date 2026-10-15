import type { PatientSettings } from './simulation/types'
import { calculatePredictedBodyWeight } from './patientMetrics'

export const PATIENT_PROFILE_NAMES = ['Normal', 'ARDS', 'COPD', 'Asthma', 'Paed'] as const
export type PatientProfileName = typeof PATIENT_PROFILE_NAMES[number]

const normalAdultFrc = Math.round(calculatePredictedBodyWeight('male', 170) * 30)
const normalPhysiology = {
  sex: 'male' as const,
  heightCm: 170,
  oxygenConsumption: 250,
  frc: normalAdultFrc,
  maxSpO2: 100,
  co2Production: 250,
  vdVt: 0.4,
}

export const PATIENT_PROFILES: Record<PatientProfileName, PatientSettings> = {
  Normal: { ...normalPhysiology, shuntFraction: 0.03, compliance: 60, resistance: 6, expiratoryResistance: 8, expiratoryFlowLimitation: 0, spontaneousRate: 12, effort: 5, neuralInspiratoryTime: 1, effortRisePercent: 50, effortRelaxationPercent: 50, endExpiratoryOesophagealPressure: -5 },
  ARDS: { ...normalPhysiology, vdVt: 0.6, shuntFraction: 0.25, compliance: 25, resistance: 8, expiratoryResistance: 10, expiratoryFlowLimitation: 0, spontaneousRate: 0, effort: 10, neuralInspiratoryTime: 0.8, effortRisePercent: 20, effortRelaxationPercent: 25, endExpiratoryOesophagealPressure: -5 },
  COPD: { ...normalPhysiology, vdVt: 0.5, shuntFraction: 0.05, compliance: 80, resistance: 16, expiratoryResistance: 28, expiratoryFlowLimitation: 0.8, spontaneousRate: 18, effort: 8, neuralInspiratoryTime: 0.9, effortRisePercent: 30, effortRelaxationPercent: 40, endExpiratoryOesophagealPressure: -5 },
  Asthma: { ...normalPhysiology, vdVt: 0.5, shuntFraction: 0.04, compliance: 70, resistance: 25, expiratoryResistance: 40, expiratoryFlowLimitation: 0.95, spontaneousRate: 24, effort: 11, neuralInspiratoryTime: 0.8, effortRisePercent: 20, effortRelaxationPercent: 30, endExpiratoryOesophagealPressure: -5 },
  Paed: { sex: 'male', heightCm: 110, oxygenConsumption: 120, frc: 500, shuntFraction: 0.03, maxSpO2: 100, co2Production: 100, vdVt: 0.4, compliance: 20, resistance: 8, expiratoryResistance: 10, expiratoryFlowLimitation: 0, spontaneousRate: 22, effort: 5, neuralInspiratoryTime: 0.7, effortRisePercent: 40, effortRelaxationPercent: 40, endExpiratoryOesophagealPressure: -4 },
}

export function patientMatchesProfile(settings: PatientSettings, profile: PatientSettings): boolean {
  for (const key of Object.keys(profile) as Array<keyof PatientSettings>) {
    const actual = settings[key]
    const expected = profile[key]
    if (typeof actual === 'number' && typeof expected === 'number') {
      if (Math.abs(actual - expected) > 1e-6) return false
    } else if (actual !== expected) {
      return false
    }
  }
  return true
}
