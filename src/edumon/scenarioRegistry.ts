import type { EdumonSimulationSpeed } from './EdumonTopBar'
import type { EdumonScenarioSnapshot } from './scenarioTypes'
import {
  DEFAULT_MONITOR_RESPIRATORY_SETTINGS,
  type AnaestheticDepth,
  type MonitorPatientState,
  type MonitorRespiratorySettings,
} from './types'
import { applyAnaestheticDepthEffects, resolvedAnaestheticPhysiology } from './anaestheticPhysiology'
import { EDUMON_MONITOR_DISPLAY_ACTION_IDS } from './monitorDisplayActions'
import { activateAction, deactivateAction, isActionToggleRunning, type EdusimActionRuntimeDefinition } from '../edusim/actions/ActionRuntime'
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

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

const MONITORING_ACTIONS: Record<string, EdusimActionRuntimeDefinition> = {
  monitorInvasiveBloodPressure: {
    id: EDUMON_MONITOR_DISPLAY_ACTION_IDS.invasiveBloodPressure,
    name: 'Inv BP',
    kind: 'event',
    short_press_action: 'toggle',
    effects: [],
  },
  monitorBis: {
    id: EDUMON_MONITOR_DISPLAY_ACTION_IDS.bis,
    name: 'BIS',
    kind: 'event',
    short_press_action: 'toggle',
    effects: [],
  },
  monitorCapnography: {
    id: EDUMON_MONITOR_DISPLAY_ACTION_IDS.capnography,
    name: 'EtCO₂',
    kind: 'event',
    short_press_action: 'toggle',
    effects: [],
  },
  monitorTemperature: {
    id: EDUMON_MONITOR_DISPLAY_ACTION_IDS.temperature,
    name: 'Temp',
    kind: 'event',
    short_press_action: 'toggle',
    effects: [],
  },
}

function applyScenarioMonitoring(variableId: string, enabled: boolean): void {
  const definition = MONITORING_ACTIONS[variableId]
  if (!definition) return
  const running = isActionToggleRunning(definition.id)
  if (running === enabled) return
  if (enabled) activateAction(definition)
  else deactivateAction(definition.id)
}

function applyScenarioVentilation(patient: MonitorPatientState): MonitorPatientState {
  const respiratory: MonitorRespiratorySettings = {
    ...DEFAULT_MONITOR_RESPIRATORY_SETTINGS,
    ...(patient.respiratory ?? {}),
  }
  const mode = respiratory.ventilatorMode ?? 'MANUAL'
  const setRate = Math.max(5, Math.round(respiratory.ventilatorSetRate ?? respiratory.respiratoryRate ?? 12))
  const setTidalVolume = Math.max(250, Math.round(respiratory.ventilatorSetTidalVolumeMl ?? respiratory.tidalVolumeMl ?? 500))
  const spontaneousRate = clamp(respiratory.spontaneousRespiratoryRate, 0, 40)
  const spontaneousTidalVolume = clamp(respiratory.spontaneousTidalVolumeMl, 0, 1000)
  const compliance = Math.max(20, respiratory.complianceMlPerCmH2O)

  let respiratoryRate = spontaneousRate
  let tidalVolumeMl = spontaneousTidalVolume

  if (mode === 'PSV') {
    tidalVolumeMl = clamp((respiratory.ventilatorPressureSupportCmH2O ?? 10) * compliance * 0.7, 100, 1000)
  } else if (mode !== 'MANUAL') {
    respiratoryRate = Math.max(setRate, spontaneousRate)
    if (mode === 'PC-AC' || mode === 'SIMV-PC') {
      tidalVolumeMl = clamp((respiratory.ventilatorPressureControlCmH2O ?? 15) * compliance * 0.7, 100, 1000)
    } else {
      tidalVolumeMl = setTidalVolume
    }
  }

  return {
    ...patient,
    respiratory: {
      ...respiratory,
      respiratoryRate,
      tidalVolumeMl,
    },
  }
}

export function buildEdumonScenarioStageTarget(
  product: Extract<ScenarioProductId, 'anaesth' | 'icu'>,
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
    monitoring: { ...(current.monitoring ?? {}) },
  }

  const desiredValueFor = (variable: Parameters<typeof readScenarioSnapshotValue>[1]) => readScenarioSnapshotValue(desired, variable)
  const shouldApply = (variable: Parameters<typeof readScenarioSnapshotValue>[1]) => {
    if (applied && !applied.has(variable.id)) return false
    return desiredValueFor(variable) !== undefined
  }

  const writableVariables = writableScenarioVariables(module)
  for (const variable of writableVariables) {
    if (!shouldApply(variable)) continue
    target = writeScenarioSnapshotValue(target, variable, desiredValueFor(variable))
  }

  if (product === 'anaesth') {
    for (const variable of writableVariables.filter((candidate) => candidate.group === 'Monitoring' && shouldApply(candidate))) {
      applyScenarioMonitoring(variable.id, Boolean(desiredValueFor(variable)))
    }

    const depthVariable = module.variables.find((variable) => variable.id === 'depthOfAnaesthesia')
    const responseVariable = module.variables.find((variable) => variable.id === 'anaestheticResponse')
    const applyDepthPhysiology = Boolean(
      (depthVariable && shouldApply(depthVariable))
      || (responseVariable && shouldApply(responseVariable)),
    )

    if (applyDepthPhysiology) {
      const explicitBaselineApplied = ['heartRate', 'systolicPressure', 'diastolicPressure', 'spontaneousRespiratoryRate']
        .some((id) => {
          const variable = module.variables.find((candidate) => candidate.id === id)
          return Boolean(variable && shouldApply(variable))
        })

      let patientForDepth = target.patient
      if (explicitBaselineApplied) {
        const physiology = resolvedAnaestheticPhysiology(patientForDepth)
        const { responseBaseline: _responseBaseline, ...withoutBaseline } = physiology
        patientForDepth = {
          ...patientForDepth,
          anaestheticPhysiology: withoutBaseline,
        }
      }

      const physiology = resolvedAnaestheticPhysiology(patientForDepth)
      target = {
        ...target,
        patient: applyAnaestheticDepthEffects(
          patientForDepth,
          physiology.depthOfAnaesthesia as AnaestheticDepth,
          physiology.anaestheticResponse,
        ),
      }
    }

    const ventilationApplied = writableVariables.some((variable) => variable.group === 'Ventilation' && shouldApply(variable))
    if (ventilationApplied) {
      target = {
        ...target,
        patient: applyScenarioVentilation(target.patient),
      }
    }
  }

  const transitionPatientKeys = transitionScenarioVariables(module)
    .filter(shouldApply)
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
