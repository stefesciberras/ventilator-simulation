import {
  createRespiratoryPhysiologyState,
  stepRespiratoryPhysiology,
  type RespiratoryPhysiologyInput,
  type RespiratoryPhysiologyOutput,
  type RespiratoryPhysiologyState,
} from '../core/physiology/respiratory'
import { setActionRuntimeSimulationTime } from '../edusim/actions/ActionRuntime'
import { calculateConfiguredVdVtFromValues, calculateEffectiveDeadSpaceFromVdVt } from '../patientMetrics'
import { applyEdumonActionPhysiology } from './actionPhysiology'
import {
  DEFAULT_MONITOR_RESPIRATORY_SETTINGS,
  type MonitorPatientState,
  type MonitorRespiratorySettings,
} from './types'

export interface EdumonRespiratoryRuntime {
  state: RespiratoryPhysiologyState
  output: RespiratoryPhysiologyOutput
  simulationTime: number
}

let latestRespiratoryOutput: RespiratoryPhysiologyOutput | null = null

export function latestEdumonRespiratoryOutput(): RespiratoryPhysiologyOutput | null {
  return latestRespiratoryOutput
}

export function currentEdumonRespiratorySpO2(fallback: number): number {
  return latestRespiratoryOutput?.spo2Percent ?? fallback
}

export function resolvedMonitorRespiratorySettings(state: MonitorPatientState): MonitorRespiratorySettings {
  const configured = state.respiratory ?? {}
  const merged = {
    ...DEFAULT_MONITOR_RESPIRATORY_SETTINGS,
    ...configured,
  }
  const configuredVdVt = calculateConfiguredVdVtFromValues(
    configured.vdVt,
    configured.vdVt == null ? configured.deadSpaceMl : undefined,
    merged.tidalVolumeMl,
  )
  const effectiveDeadSpace = calculateEffectiveDeadSpaceFromVdVt(
    { sex: merged.sex, heightCm: merged.heightCm, vdVt: configuredVdVt },
    merged.tidalVolumeMl,
  )
  return { ...merged, vdVt: configuredVdVt, deadSpaceMl: effectiveDeadSpace.deadSpaceMl }
}

export function monitorRespiratoryInput(state: MonitorPatientState, simulationTime = 0): RespiratoryPhysiologyInput {
  setActionRuntimeSimulationTime(simulationTime)
  const effectiveState = applyEdumonActionPhysiology(state, simulationTime)
  const respiratory = resolvedMonitorRespiratorySettings(effectiveState)
  return {
    sex: respiratory.sex,
    heightCm: respiratory.heightCm,
    respiratoryRate: respiratory.respiratoryRate,
    tidalVolumeMl: respiratory.tidalVolumeMl,
    deadSpaceMl: respiratory.deadSpaceMl,
    fio2: respiratory.fio2,
    peepCmH2O: respiratory.peepCmH2O,
    complianceMlPerCmH2O: respiratory.complianceMlPerCmH2O,
    expiratoryResistanceCmH2OLs: respiratory.expiratoryResistanceCmH2OLs,
    frcMl: respiratory.frcMl,
    shuntFraction: respiratory.shuntFraction,
    // The configured SpO2 remains an instructor ceiling. Current action effects
    // modify respiratory physiology, not that ceiling itself.
    maxSpO2: Math.min(respiratory.maxSpO2, state.spo2),
    oxygenConsumptionMlMin: respiratory.oxygenConsumptionMlMin,
    co2ProductionMlMin: respiratory.co2ProductionMlMin,
    referenceCardiacOutputLMin: 5,
  }
}

export function createEdumonRespiratoryRuntime(
  patientState: MonitorPatientState,
  simulationTime = 0,
): EdumonRespiratoryRuntime {
  setActionRuntimeSimulationTime(simulationTime)
  const initialState = createRespiratoryPhysiologyState({ spo2Percent: patientState.spo2 })
  const { state, output } = stepRespiratoryPhysiology(initialState, monitorRespiratoryInput(patientState, simulationTime), 0)
  latestRespiratoryOutput = output
  return { state, output, simulationTime }
}

export function stepEdumonRespiratoryRuntime(
  runtime: EdumonRespiratoryRuntime,
  patientState: MonitorPatientState,
  simulationTime: number,
): EdumonRespiratoryRuntime {
  if (simulationTime < runtime.simulationTime) return createEdumonRespiratoryRuntime(patientState, simulationTime)
  setActionRuntimeSimulationTime(simulationTime)
  const deltaTime = Math.max(0, simulationTime - runtime.simulationTime)
  const next = stepRespiratoryPhysiology(runtime.state, monitorRespiratoryInput(patientState, simulationTime), deltaTime)
  latestRespiratoryOutput = next.output
  return {
    state: next.state,
    output: next.output,
    simulationTime,
  }
}
