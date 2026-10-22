import type { EdumonAlarmLimits } from './alarmDefinitions'
import type { EdumonSimulationSpeed } from './EdumonTopBar'
import type { MonitorPatientState } from './types'

export interface EdumonTeachingState {
  patient: MonitorPatientState
  patientTransitionSeconds: number
  simulationPaused: boolean
  simulationSpeed: EdumonSimulationSpeed
  alarmLimits: EdumonAlarmLimits
}
