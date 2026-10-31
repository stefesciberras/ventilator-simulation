import type { SharedAlarmEvaluation } from '../alarms/useSharedAlarmController'
import { getActionRuntimeSimulationTime } from '../edusim/actions/ActionRuntime'
import { applyEdumonActionPhysiology } from './actionPhysiology'
import { isEdumonAlarmParameterDisplayed, resolveNibpAlarmState } from './alarmSources'
import { currentEdumonRespiratorySpO2 } from './respiratoryPhysiology'
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
  const effectivePatient = applyEdumonActionPhysiology(patient, getActionRuntimeSimulationTime())
  const organisedRhythm = effectivePatient.rhythm !== 'ventricular-fibrillation' && effectivePatient.rhythm !== 'asystole'
  const physiologicalSpo2 = currentEdumonRespiratorySpO2(effectivePatient.spo2)
  const invasiveBloodPressureDisplayed = () => isEdumonAlarmParameterDisplayed('invasiveBloodPressure')
  const nibpLow = () => resolveNibpAlarmState(limits).low
  const nibpHigh = () => resolveNibpAlarmState(limits).high

  return [
    { key: 'heartRateLow', label: 'LOW HEART RATE', active: organisedRhythm && effectivePatient.heartRate < limits.heartRateLow, priority: 'warning' },
    { key: 'heartRateHigh', label: 'HIGH HEART RATE', active: organisedRhythm && effectivePatient.heartRate > limits.heartRateHigh, priority: 'warning' },
    { key: 'mapLow', label: 'LOW ARTERIAL PRESSURE', active: meanPressure != null && meanPressure < limits.mapLow, eligible: invasiveBloodPressureDisplayed, priority: 'critical' },
    { key: 'mapHigh', label: 'HIGH ARTERIAL PRESSURE', active: meanPressure != null && meanPressure > limits.mapHigh, eligible: invasiveBloodPressureDisplayed, priority: 'warning' },
    { key: 'nibpMapLow', label: 'LOW NIBP', active: nibpLow, priority: 'critical' },
    { key: 'nibpMapHigh', label: 'HIGH NIBP', active: nibpHigh, priority: 'warning' },
    { key: 'spo2Low', label: 'LOW SpO₂', active: physiologicalSpo2 < limits.spo2Low, priority: 'critical' },
    { key: 'spo2High', label: 'HIGH SpO₂', active: physiologicalSpo2 > limits.spo2High, priority: 'warning' },
    { key: 'vf', label: 'VENTRICULAR FIBRILLATION', active: effectivePatient.rhythm === 'ventricular-fibrillation', priority: 'critical', immediateCritical: true },
    { key: 'asystole', label: 'ASYSTOLE', active: effectivePatient.rhythm === 'asystole', priority: 'critical', immediateCritical: true },
  ]
}
