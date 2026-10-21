import type { SharedAlarmEvaluation } from '../alarms/useSharedAlarmController'
import type { MonitorPatientState } from './types'

export interface EdumonAlarmLimits {
  heartRateLow: number
  heartRateHigh: number
  mapLow: number
  mapHigh: number
  spo2Low: number
  spo2High: number
}

export const DEFAULT_EDUMON_ALARM_LIMITS: EdumonAlarmLimits = {
  heartRateLow: 50,
  heartRateHigh: 120,
  mapLow: 60,
  mapHigh: 110,
  spo2Low: 90,
  spo2High: 100,
}

/** EDUMON owns threshold meaning; shared core owns what happens after activation. */
export function evaluateEdumonAlarms(
  patient: MonitorPatientState,
  meanPressure: number | null,
  limits: EdumonAlarmLimits = DEFAULT_EDUMON_ALARM_LIMITS,
): SharedAlarmEvaluation[] {
  const organisedRhythm = patient.rhythm !== 'ventricular-fibrillation' && patient.rhythm !== 'asystole'
  return [
    { key: 'heartRateLow', label: 'LOW HEART RATE', active: organisedRhythm && patient.heartRate < limits.heartRateLow, priority: 'warning' },
    { key: 'heartRateHigh', label: 'HIGH HEART RATE', active: organisedRhythm && patient.heartRate > limits.heartRateHigh, priority: 'warning' },
    { key: 'mapLow', label: 'LOW ARTERIAL PRESSURE', active: meanPressure != null && meanPressure < limits.mapLow, priority: 'critical' },
    { key: 'mapHigh', label: 'HIGH ARTERIAL PRESSURE', active: meanPressure != null && meanPressure > limits.mapHigh, priority: 'warning' },
    { key: 'spo2Low', label: 'LOW SpO₂', active: patient.spo2 < limits.spo2Low, priority: 'critical' },
    { key: 'spo2High', label: 'HIGH SpO₂', active: patient.spo2 > limits.spo2High, priority: 'warning' },
    { key: 'vf', label: 'VENTRICULAR FIBRILLATION', active: patient.rhythm === 'ventricular-fibrillation', priority: 'critical', immediateCritical: true },
    { key: 'asystole', label: 'ASYSTOLE', active: patient.rhythm === 'asystole', priority: 'critical', immediateCritical: true },
  ]
}
