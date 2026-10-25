import { resolveNumericActionEffect } from '../edusim/actions/ActionRuntime'
import { anaestheticStimulusResponseScale, effectiveAnaestheticDepth } from './anaestheticPhysiology'
import { applyEdumonPhysiologicalBounds } from './physiologicalBounds'
import { DEFAULT_MONITOR_RESPIRATORY_SETTINGS, type MonitorPatientState } from './types'

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

const SYMPATHETIC_SATURATION_SHAPE = 1.5

export function saturatingSympatheticResponse(response: number): number {
  const input = Math.max(0, response)
  return ((1 + SYMPATHETIC_SATURATION_SHAPE) * input) / (1 + SYMPATHETIC_SATURATION_SHAPE * input)
}

function sympatheticResponse(state: MonitorPatientState, simulationTime: number): { heartRateOffset: number; mapOffset: number } {
  const stimulus = Math.max(0, resolveNumericActionEffect('stimulus.sympathetic', 0, simulationTime))
  const nociceptiveResponse = Math.max(0, resolveNumericActionEffect('anaesthesia.nociceptiveResponse', 1, simulationTime))
  const depthResponse = anaestheticStimulusResponseScale(effectiveAnaestheticDepth(state, simulationTime))
  const composedResponse = stimulus * nociceptiveResponse * depthResponse
  const response = saturatingSympatheticResponse(composedResponse)
  return { heartRateOffset: 25 * response, mapOffset: 30 * response }
}

function applyMeanPressureEffect(state: MonitorPatientState, simulationTime: number, sympatheticMapOffset: number): Pick<MonitorPatientState, 'systolicPressure' | 'diastolicPressure'> {
  const baselineMean = state.diastolicPressure + (state.systolicPressure - state.diastolicPressure) / 3
  const actionMean = resolveNumericActionEffect('haemodynamics.meanArterialPressure', baselineMean, simulationTime)
  const shift = actionMean + sympatheticMapOffset - baselineMean
  return {
    systolicPressure: state.systolicPressure + shift,
    diastolicPressure: state.diastolicPressure + shift,
  }
}

export function applyEdumonActionPhysiology(state: MonitorPatientState, simulationTime: number): MonitorPatientState {
  const sympathetic = sympatheticResponse(state, simulationTime)
  const pressure = applyMeanPressureEffect(state, simulationTime, sympathetic.mapOffset)
  const baselineRespiratory = { ...DEFAULT_MONITOR_RESPIRATORY_SETTINGS, ...(state.respiratory ?? {}) }
  const drive = clamp(resolveNumericActionEffect('respiration.drive', 1, simulationTime), 0, 3)
  const block = clamp(resolveNumericActionEffect('neuromuscular.block', 0, simulationTime), 0, 1)
  const airwayObstruction = clamp(resolveNumericActionEffect('respiration.airwayObstruction', 0, simulationTime), 0, 1)
  const muscleFraction = 1 - block
  const ventilationMode = baselineRespiratory.ventilatorMode ?? 'MANUAL'
  const effectiveDependsOnSpontaneousDrive = ventilationMode === 'MANUAL' || ventilationMode === 'PSV'

  const spontaneousRespiratoryRate = baselineRespiratory.spontaneousRespiratoryRate * drive
  const spontaneousTidalVolumeMl = baselineRespiratory.spontaneousTidalVolumeMl * drive * muscleFraction
  const respiratory = {
    ...baselineRespiratory,
    spontaneousRespiratoryRate,
    spontaneousTidalVolumeMl,
    expiratoryResistanceCmH2OLs: baselineRespiratory.expiratoryResistanceCmH2OLs * (1 + 4 * airwayObstruction),
    ...(effectiveDependsOnSpontaneousDrive ? {
      respiratoryRate: spontaneousRespiratoryRate,
      tidalVolumeMl: ventilationMode === 'PSV' && spontaneousRespiratoryRate > 0
        ? baselineRespiratory.tidalVolumeMl * muscleFraction
        : spontaneousTidalVolumeMl,
    } : {}),
  }

  const actionHeartRate = resolveNumericActionEffect('haemodynamics.heartRate', state.heartRate, simulationTime)
  return applyEdumonPhysiologicalBounds({
    ...state,
    heartRate: actionHeartRate + sympathetic.heartRateOffset,
    ...pressure,
    respiratory,
  })
}

export function currentNeuromuscularBlock(simulationTime: number): number {
  return clamp(resolveNumericActionEffect('neuromuscular.block', 0, simulationTime), 0, 1)
}

export function currentTofMinimumCount(simulationTime: number): number {
  return clamp(resolveNumericActionEffect('neuromuscular.tofMinimumCount', 0, simulationTime), 0, 4)
}

export function currentAirwayObstruction(simulationTime: number): number {
  return clamp(resolveNumericActionEffect('respiration.airwayObstruction', 0, simulationTime), 0, 1)
}

export function currentNociceptiveResponse(simulationTime: number): number {
  return Math.max(0, resolveNumericActionEffect('anaesthesia.nociceptiveResponse', 1, simulationTime))
}

export function currentSympatheticStimulus(simulationTime: number): number {
  return Math.max(0, resolveNumericActionEffect('stimulus.sympathetic', 0, simulationTime))
}
