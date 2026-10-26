import type { LoppjuSimRuntimeMode } from '../core/runtimeModes'
import type { ActionRuntimeSnapshot } from '../edusim/actions/ActionRuntime'
import type { EdumonAlarmLimits } from './alarmDefinitions'
import type { EdumonSimulationSpeed } from './EdumonTopBar'
import type { MonitorPatientState } from './types'

export interface EdumonActionCommandState {
  sequence: number
  type: 'activate' | 'deactivate' | 'intensity'
  actionId: string
  intensity?: number
  simulationTime: number
}

export interface EdumonTeachingState {
  patient: MonitorPatientState
  patientTransitionSeconds: number
  simulationPaused: boolean
  simulationSpeed: EdumonSimulationSpeed
  alarmLimits: EdumonAlarmLimits
  /** Runtime topology selected by the instructor. Legacy sessions default to teaching. */
  runtimeMode?: Extract<LoppjuSimRuntimeMode, 'simulation' | 'teaching'>
  /** Latest local Drugs & Events activation, used by scenario triggers across a teaching session. */
  lastActionId?: string | null
  actionSequence?: number
  actionSimulationTime?: number | null
  /** Latest candidate-originated Drugs/Events mutation, used for de-duplication. */
  actionCommand?: EdumonActionCommandState | null
  /** Complete declarative ActionRuntime state so Simulation mode remains LAN/offline capable. */
  actionRuntimeSnapshot?: ActionRuntimeSnapshot | null
}
