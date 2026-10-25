import type { EdumonSimulationSpeed } from './EdumonTopBar'
import type { EdumonScenarioSnapshot } from './scenarioTypes'
import type { MonitorPatientState } from './types'
import type { ScenarioProductId } from '../teaching/scenario/products'
import {
  getEdumonScenarioModule,
  readScenarioSnapshotValue,
  transitionScenarioVariables,
  writableScenarioVariables,
  writeScenarioSnapshotValue,
} from '../scenario-builder/modules/edumon/definition'

export type EdumonTransitionPatientKey = keyof Pick<MonitorPatientState, 'heartRate' | 'systolicPressure' | 'diastolicPressure' | 'spo2' | 'peripheralPerfusion'>

export interface EdumonScenarioStageTarget {
  patient: MonitorPatientState
  simulationPaused: boolean
  simulationSpeed: EdumonSimulationSpeed
  transitionPatientKeys: EdumonTransitionPatientKey[]
}

export function buildEdumonScenarioStageTarget(
  product: Exclude<ScenarioProductId, 'eduvent'>,
  current: EdumonScenarioSnapshot,
  desired: EdumonScenarioSnapshot,
  appliedVariableIds?: readonly string[],
): EdumonScenarioStageTarget {
  const module = getEdumonScenarioModule(product)
  const applied = appliedVariableIds ? new Set(appliedVariableIds) : null
  let target: EdumonScenarioSnapshot = {
    patient: { ...current.patient },
    simulationPaused: current.simulationPaused,
    simulationSpeed: current.simulationSpeed,
  }

  for (const variable of writableScenarioVariables(module)) {
    if (applied && !applied.has(variable.id)) continue
    target = writeScenarioSnapshotValue(target, variable, readScenarioSnapshotValue(desired, variable))
  }

  const transitionPatientKeys = transitionScenarioVariables(module)
    .filter((variable) => !applied || applied.has(variable.id))
    .filter((variable) => variable.snapshotPath?.startsWith('patient.'))
    .map((variable) => variable.snapshotPath!.slice('patient.'.length))
    .filter((key): key is EdumonTransitionPatientKey => ['heartRate', 'systolicPressure', 'diastolicPressure', 'spo2', 'peripheralPerfusion'].includes(key))

  return {
    patient: target.patient,
    simulationPaused: target.simulationPaused,
    simulationSpeed: target.simulationSpeed,
    transitionPatientKeys,
  }
}
