import type { PatientSettings } from './simulation/types'
import { calculatePredictedBodyWeight } from './patientMetrics'

export const PATIENT_PROFILE_NAMES = ['Normal', 'ARDS', 'COPD', 'Asthma', 'Paed'] as const
export type PatientProfileName = typeof PATIENT_PROFILE_NAMES[number]
export const ARDS_SEVERITIES = ['mild', 'moderate', 'severe'] as const
export type ArdsSeverity = typeof ARDS_SEVERITIES[number]

const normalAdultPbw = calculatePredictedBodyWeight('male', 170)
const normalAdultChestWallCompliance = Math.round(normalAdultPbw * 3)
const paediatricChestWallCompliance = Math.round(calculatePredictedBodyWeight('male', 110) * 3)

/** Canonical adult reference physiology before disease-specific mechanics are applied. */
const normalPhysiology = {
  sex: 'male' as const,
  heightCm: 170,
  oxygenConsumption: 250,
  frc: 2300,
  maxSpO2: 100,
  co2Production: 200,
  vdVt: 0.3,
}

/**
 * ARDS teaching defaults represent disease physiology rather than sedation state.
 * Severity progressively reduces aerated lung volume/compliance and increases
 * shunt/dead-space burden. Sedation or paralysis should be modelled separately.
 */
const ardsBase = {
  ...normalPhysiology,
  resistance: 8,
  expiratoryResistance: 8,
  expiratoryFlowLimitation: 0,
  spontaneousRate: 24,
  neuralInspiratoryTime: 0.8,
  effortRisePercent: 35,
  effortRelaxationPercent: 50,
  endExpiratoryOesophagealPressure: -5,
  chestWallCompliance: normalAdultChestWallCompliance,
}

export const ARDS_PROFILES: Record<ArdsSeverity, PatientSettings> = {
  mild: {
    ...ardsBase,
    frc: 1800,
    vdVt: 0.4,
    shuntFraction: 0.12,
    compliance: 40,
    spontaneousRate: 22,
    effort: 7,
  },
  moderate: {
    ...ardsBase,
    frc: 1400,
    vdVt: 0.5,
    shuntFraction: 0.25,
    compliance: 25,
    spontaneousRate: 26,
    effort: 10,
  },
  severe: {
    ...ardsBase,
    frc: 1000,
    vdVt: 0.6,
    shuntFraction: 0.35,
    compliance: 15,
    resistance: 10,
    expiratoryResistance: 10,
    spontaneousRate: 30,
    effort: 12,
  },
}

export const PATIENT_PROFILES: Record<PatientProfileName, PatientSettings> = {
  Normal: {
    ...normalPhysiology,
    shuntFraction: 0.03,
    compliance: 65,
    chestWallCompliance: normalAdultChestWallCompliance,
    resistance: 6,
    expiratoryResistance: 6,
    expiratoryFlowLimitation: 0,
    spontaneousRate: 12,
    effort: 5,
    neuralInspiratoryTime: 1,
    effortRisePercent: 50,
    effortRelaxationPercent: 50,
    endExpiratoryOesophagealPressure: -5,
  },
  // Moderate remains the compatibility value for code/scenarios that refer to the generic ARDS profile.
  ARDS: { ...ARDS_PROFILES.moderate },
  COPD: {
    ...normalPhysiology,
    frc: 3500,
    vdVt: 0.45,
    shuntFraction: 0.05,
    compliance: 80,
    chestWallCompliance: normalAdultChestWallCompliance,
    resistance: 16,
    expiratoryResistance: 24,
    expiratoryFlowLimitation: 0.8,
    spontaneousRate: 18,
    effort: 7,
    neuralInspiratoryTime: 0.8,
    effortRisePercent: 40,
    effortRelaxationPercent: 50,
    endExpiratoryOesophagealPressure: -5,
  },
  Asthma: {
    ...normalPhysiology,
    frc: 3000,
    vdVt: 0.4,
    shuntFraction: 0.05,
    compliance: 70,
    chestWallCompliance: normalAdultChestWallCompliance,
    resistance: 20,
    expiratoryResistance: 30,
    expiratoryFlowLimitation: 0.9,
    spontaneousRate: 24,
    effort: 10,
    neuralInspiratoryTime: 0.75,
    effortRisePercent: 30,
    effortRelaxationPercent: 40,
    endExpiratoryOesophagealPressure: -5,
  },
  Paed: {
    sex: 'male',
    heightCm: 110,
    oxygenConsumption: 120,
    frc: 500,
    shuntFraction: 0.03,
    maxSpO2: 100,
    co2Production: 100,
    vdVt: 0.3,
    compliance: 20,
    chestWallCompliance: paediatricChestWallCompliance,
    resistance: 10,
    expiratoryResistance: 12,
    expiratoryFlowLimitation: 0,
    spontaneousRate: 22,
    effort: 4,
    neuralInspiratoryTime: 0.7,
    effortRisePercent: 40,
    effortRelaxationPercent: 50,
    endExpiratoryOesophagealPressure: -4,
  },
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
