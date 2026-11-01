import type { EdumonSimulationSpeed } from './EdumonTopBar'
import type { EdumonScenarioSnapshot } from './scenarioTypes'
import {
  DEFAULT_MONITOR_RESPIRATORY_SETTINGS,
  type AnaestheticDepth,
  type MonitorPatientState,
  type MonitorRespiratorySettings,
} from './types'
import { applyAnaestheticDepthEffects, resolvedAnaestheticPhysiology } from './anaestheticPhysiology'
import { ANAESTH_SCENARIO_MONITORING_CONTROLS, applyEdumonScenarioMonitoringControl } from './scenarioMonitoring'
import type { ScenarioProductId } from '../teaching/scenario/products'
import {
  getEdumonScenarioModule,
  readScenarioSnapshotValue,
  transitionScenarioVariables,
  writableScenarioVariables,
  writeScenarioSnapshotValue,
} from '../scenario-builder/modules/edumon/definition'

interface EdumonTransitionPolicy {
  mode: 'immediate' | 'linear'
  durationSeconds?: number
}

export interface EdumonTransitionPatientVariable {
  id: string
  policyId?: string
  patientPath: string
  defaultValue?: number
}

export interface EdumonScenarioPatientTransition {
  from: MonitorPatientState
  to: MonitorPatientState
  start: number
  defaultPolicy: EdumonTransitionPolicy
  overrides: Record<string, EdumonTransitionPolicy>
  variables: EdumonTransitionPatientVariable[]
}

export interface EdumonScenarioStageTarget {
  patient: MonitorPatientState
  simulationPaused: boolean
  simulationSpeed: EdumonSimulationSpeed
  transitionPatientVariables: EdumonTransitionPatientVariable[]
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

const SCENARIO_VENTILATION_DRIVER_IDS = new Set([
  'ventilatorMode',
  'ventilatorSetRate',
  'ventilatorSetTidalVolumeMl',
  'ventilatorPressureControlCmH2O',
  'ventilatorPressureSupportCmH2O',
  'spontaneousRespiratoryRate',
  'spontaneousTidalVolumeMl',
  'complianceMlPerCmH2O',
])

function readPatientPath(patient: MonitorPatientState, path: string): unknown {
  let current: unknown = patient
  for (const part of path.split('.')) {
    if (!current || typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[part]
  }
  return current
}

function writePatientPath(patient: MonitorPatientState, path: string, value: number): MonitorPatientState {
  const clone = structuredClone(patient) as unknown as Record<string, unknown>
  const parts = path.split('.')
  let current = clone
  for (let index = 0; index < parts.length - 1; index += 1) {
    const part = parts[index]
    const next = current[part]
    current[part] = next && typeof next === 'object' ? { ...(next as Record<string, unknown>) } : {}
    current = current[part] as Record<string, unknown>
  }
  current[parts[parts.length - 1]] = value
  return clone as unknown as MonitorPatientState
}

export function interpolateEdumonScenarioPatientTransition(
  transition: EdumonScenarioPatientTransition,
  simulationTime: number,
): { patient: MonitorPatientState; running: boolean } {
  let patient = structuredClone(transition.to)
  let running = false

  for (const variable of transition.variables) {
    const policy = transition.overrides[variable.policyId ?? variable.id] ?? transition.defaultPolicy
    const durationSeconds = policy.mode === 'linear' ? Math.max(0, policy.durationSeconds ?? 0) : 0
    if (durationSeconds <= 0) continue

    const toValue = readPatientPath(transition.to, variable.patientPath)
    const fromValueRaw = readPatientPath(transition.from, variable.patientPath)
    const fromValue = typeof fromValueRaw === 'number' && Number.isFinite(fromValueRaw)
      ? fromValueRaw
      : variable.defaultValue
    if (typeof toValue !== 'number' || !Number.isFinite(toValue) || typeof fromValue !== 'number' || !Number.isFinite(fromValue)) continue

    const progress = Math.max(0, Math.min(1, (simulationTime - transition.start) / Math.max(durationSeconds, 0.001)))
    patient = writePatientPath(patient, variable.patientPath, fromValue + (toValue - fromValue) * progress)
    if (progress < 1) running = true
  }

  return { patient, running }
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

function addTransitionVariable(
  variables: EdumonTransitionPatientVariable[],
  candidate: EdumonTransitionPatientVariable,
) {
  if (!variables.some((variable) => variable.patientPath === candidate.patientPath)) variables.push(candidate)
}

function firstAppliedTransitionId(
  transitionVariables: EdumonTransitionPatientVariable[],
  candidateIds: readonly string[],
) {
  return candidateIds.find((id) => transitionVariables.some((variable) => variable.id === id))
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

  let applyDepthPhysiology = false
  let depthApplied = false
  let responseApplied = false

  if (product === 'anaesth') {
    for (const control of ANAESTH_SCENARIO_MONITORING_CONTROLS) {
      if (applied && !applied.has(control.id)) continue
      const enabled = desired.monitoring?.[control.key]
      if (enabled == null) continue
      applyEdumonScenarioMonitoringControl(control, enabled)
      target.monitoring = { ...(target.monitoring ?? {}), [control.key]: enabled }
    }

    const depthVariable = module.variables.find((variable) => variable.id === 'depthOfAnaesthesia')
    const responseVariable = module.variables.find((variable) => variable.id === 'anaestheticResponse')
    depthApplied = Boolean(depthVariable && shouldApply(depthVariable))
    responseApplied = Boolean(responseVariable && shouldApply(responseVariable))
    applyDepthPhysiology = depthApplied || responseApplied

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

    const ventilationApplied = writableVariables.some((variable) => SCENARIO_VENTILATION_DRIVER_IDS.has(variable.id) && shouldApply(variable))
    if (ventilationApplied) {
      target = {
        ...target,
        patient: applyScenarioVentilation(target.patient),
      }
    }
  }

  const transitionPatientVariables = transitionScenarioVariables(module)
    .filter(shouldApply)
    .filter((variable) => variable.snapshotPath?.startsWith('patient.'))
    .map((variable) => ({
      id: variable.id,
      patientPath: variable.snapshotPath!.slice('patient.'.length),
      defaultValue: typeof variable.defaultValue === 'number' ? variable.id === 'fio2' ? variable.defaultValue / 100 : variable.defaultValue : undefined,
    }))

  if (product === 'anaesth' && applyDepthPhysiology) {
    const policyId = depthApplied ? 'depthOfAnaesthesia' : 'anaestheticResponse'
    addTransitionVariable(transitionPatientVariables, { id: 'depth-effect-heartRate', policyId, patientPath: 'heartRate' })
    addTransitionVariable(transitionPatientVariables, { id: 'depth-effect-systolicPressure', policyId, patientPath: 'systolicPressure' })
    addTransitionVariable(transitionPatientVariables, { id: 'depth-effect-diastolicPressure', policyId, patientPath: 'diastolicPressure' })
    addTransitionVariable(transitionPatientVariables, { id: 'depth-effect-spontaneousRespiratoryRate', policyId, patientPath: 'respiratory.spontaneousRespiratoryRate', defaultValue: DEFAULT_MONITOR_RESPIRATORY_SETTINGS.spontaneousRespiratoryRate })
  }

  if (product === 'anaesth') {
    const respiratoryRatePolicyId = firstAppliedTransitionId(transitionPatientVariables, [
      'ventilatorSetRate',
      'spontaneousRespiratoryRate',
    ])
    if (respiratoryRatePolicyId) {
      addTransitionVariable(transitionPatientVariables, {
        id: 'ventilation-effect-respiratoryRate',
        policyId: respiratoryRatePolicyId,
        patientPath: 'respiratory.respiratoryRate',
        defaultValue: DEFAULT_MONITOR_RESPIRATORY_SETTINGS.respiratoryRate,
      })
    }

    const tidalVolumePolicyId = firstAppliedTransitionId(transitionPatientVariables, [
      'ventilatorSetTidalVolumeMl',
      'ventilatorPressureControlCmH2O',
      'ventilatorPressureSupportCmH2O',
      'complianceMlPerCmH2O',
      'spontaneousTidalVolumeMl',
    ])
    if (tidalVolumePolicyId) {
      addTransitionVariable(transitionPatientVariables, {
        id: 'ventilation-effect-tidalVolumeMl',
        policyId: tidalVolumePolicyId,
        patientPath: 'respiratory.tidalVolumeMl',
        defaultValue: DEFAULT_MONITOR_RESPIRATORY_SETTINGS.tidalVolumeMl,
      })
    }
  }

  return {
    patient: target.patient,
    simulationPaused: target.simulationPaused,
    simulationSpeed: target.simulationSpeed,
    transitionPatientVariables,
  }
}
