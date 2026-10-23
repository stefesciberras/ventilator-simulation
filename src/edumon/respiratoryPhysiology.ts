import {
  createRespiratoryPhysiologyState,
  stepRespiratoryPhysiology,
  type RespiratoryPhysiologyInput,
  type RespiratoryPhysiologyOutput,
  type RespiratoryPhysiologyState,
} from '../core/physiology/respiratory'
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
  return {
    ...DEFAULT_MONITOR_RESPIRATORY_SETTINGS,
    ...(state.respiratory ?? {}),
  }
}

export function monitorRespiratoryInput(state: MonitorPatientState): RespiratoryPhysiologyInput {
  const respiratory = resolvedMonitorRespiratorySettings(state)
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
    // The legacy SpO2 control is now an instructor ceiling, equivalent to
    // EDUVENT maxSpO2. Gas exchange determines the actual saturation below it.
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
  // Seed from the configured ceiling so existing scenarios start without an
  // artificial jump; subsequent samples are driven by shared gas exchange.
  const initialState = createRespiratoryPhysiologyState({ spo2Percent: patientState.spo2 })
  const { state, output } = stepRespiratoryPhysiology(initialState, monitorRespiratoryInput(patientState), 0)
  latestRespiratoryOutput = output
  return { state, output, simulationTime }
}

export function stepEdumonRespiratoryRuntime(
  runtime: EdumonRespiratoryRuntime,
  patientState: MonitorPatientState,
  simulationTime: number,
): EdumonRespiratoryRuntime {
  if (simulationTime < runtime.simulationTime) return createEdumonRespiratoryRuntime(patientState, simulationTime)
  const deltaTime = Math.max(0, simulationTime - runtime.simulationTime)
  const next = stepRespiratoryPhysiology(runtime.state, monitorRespiratoryInput(patientState), deltaTime)
  latestRespiratoryOutput = next.output
  return {
    state: next.state,
    output: next.output,
    simulationTime,
  }
}
