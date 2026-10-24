import { resolveNumericActionEffect } from '../edusim/actions/ActionRuntime'
import { DEFAULT_MONITOR_RESPIRATORY_SETTINGS, type MonitorPatientState } from './types'

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

function sympatheticResponse(simulationTime: number): { heartRateOffset: number; mapOffset: number } {
  const stimulus = Math.max(0, resolveNumericActionEffect('stimulus.sympathetic', 0, simulationTime))
  const nociceptiveResponse = Math.max(0, resolveNumericActionEffect('anaesthesia.nociceptiveResponse', 1, simulationTime))
  const response = stimulus * nociceptiveResponse
  return {
    heartRateOffset: 25 * response,
    mapOffset: 30 * response,
  }
}

function applyMeanPressureEffect(state: MonitorPatientState, simulationTime: number, sympatheticMapOffset: number): Pick<MonitorPatientState, 'systolicPressure' | 'diastolicPressure'> {
  const baselineMean = state.diastolicPressure + (state.systolicPressure - state.diastolicPressure) / 3
  const actionMean = resolveNumericActionEffect('haemodynamics.meanArterialPressure', baselineMean, simulationTime)
  const targetMean = actionMean + sympatheticMapOffset
  const shift = targetMean - baselineMean
  return {
    systolicPressure: clamp(state.systolicPressure + shift, 20, 260),
    diastolicPressure: clamp(state.diastolicPressure + shift, 10, 180),
  }
}

export function applyEdumonActionPhysiology(state: MonitorPatientState, simulationTime: number): MonitorPatientState {
  const sympathetic = sympatheticResponse(simulationTime)
  const pressure = applyMeanPressureEffect(state, simulationTime, sympathetic.mapOffset)
  const baselineRespiratory = {
    ...DEFAULT_MONITOR_RESPIRATORY_SETTINGS,
    ...(state.respiratory ?? {}),
  }
  const drive = clamp(resolveNumericActionEffect('respiration.drive', 1, simulationTime), 0, 3)
  const block = clamp(resolveNumericActionEffect('neuromuscular.block', 0, simulationTime), 0, 1)
  const muscleFraction = 1 - block

  const spontaneousRate = baselineRespiratory.spontaneousRespiratoryRate
  const spontaneousTidalVolume = baselineRespiratory.spontaneousTidalVolumeMl
  const effectiveLooksSpontaneous = Math.abs(baselineRespiratory.respiratoryRate - spontaneousRate) < 0.01
    && Math.abs(baselineRespiratory.tidalVolumeMl - spontaneousTidalVolume) < 1

  const respiratory = {
    ...baselineRespiratory,
    spontaneousRespiratoryRate: spontaneousRate * drive,
    spontaneousTidalVolumeMl: spontaneousTidalVolume * drive * muscleFraction,
    ...(effectiveLooksSpontaneous ? {
      respiratoryRate: baselineRespiratory.respiratoryRate * drive,
      tidalVolumeMl: baselineRespiratory.tidalVolumeMl * drive * muscleFraction,
    } : {}),
  }

  const actionHeartRate = resolveNumericActionEffect('haemodynamics.heartRate', state.heartRate, simulationTime)

  return {
    ...state,
    heartRate: clamp(actionHeartRate + sympathetic.heartRateOffset, 0, 300),
    ...pressure,
    respiratory,
  }
}

export function currentNeuromuscularBlock(simulationTime: number): number {
  return clamp(resolveNumericActionEffect('neuromuscular.block', 0, simulationTime), 0, 1)
}

export function currentNociceptiveResponse(simulationTime: number): number {
  return Math.max(0, resolveNumericActionEffect('anaesthesia.nociceptiveResponse', 1, simulationTime))
}

export function currentSympatheticStimulus(simulationTime: number): number {
  return Math.max(0, resolveNumericActionEffect('stimulus.sympathetic', 0, simulationTime))
}
