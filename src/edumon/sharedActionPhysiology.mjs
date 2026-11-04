/**
 * Shared EDUMON (Anaesth / ITU) action-driven physiology.
 * Pure: state and numeric effect resolver are the only inputs. This is also
 * safe to import into a Cloudflare Durable Object; it never touches the
 * browser-global v1 ActionRuntime or any transport.
 *
 * Preserve the v1 calculation order and bounds. Effect definitions are NOT
 * part of this module: caller-supplied resolver owns ActionRuntime state.
 */
export const DEFAULT_RESPIRATORY_STATE = Object.freeze({
  respiratoryRate: 12, tidalVolumeMl: 500, spontaneousRespiratoryRate: 12,
  spontaneousTidalVolumeMl: 500, vdVt: 0.4, deadSpaceMl: 150,
  fio2: 0.21, peepCmH2O: 0, complianceMlPerCmH2O: 70,
  expiratoryResistanceCmH2OLs: 8, frcMl: 2500, shuntFraction: 0.03,
  maxSpO2: 100, oxygenConsumptionMlMin: 250, co2ProductionMlMin: 250,
  sex: 'male', heightCm: 170,
})
const clamp = (n, min, max) => Math.max(min, Math.min(max, n))
const DEPTH_RESPONSE = Object.freeze({ 1: 0.15, 2: 0.35, 3: 0.60, 4: 0.85, 5: 1 })
export const saturatingSympatheticResponse = response => {
  const input = Math.max(0, response)
  return (2.5 * input) / (1 + 1.5 * input)
}
export function sharedAnaestheticDepth(state, resolve) {
  const base = state.anaestheticPhysiology?.depthOfAnaesthesia ?? 5
  const hypnotic = clamp(resolve('anaesthesia.hypnoticEffect', 0), 0, 1)
  return clamp(Math.round(base - 4 * hypnotic), 1, 5)
}
export function applySharedEdumonBounds(state) {
  const diastolicPressure = clamp(state.diastolicPressure, 10, 200)
  const systolicPressure = Math.max(diastolicPressure + 1, clamp(state.systolicPressure, 20, 300))
  const bounded = {
    ...state,
    heartRate: clamp(state.heartRate, 0, 240),
    systolicPressure, diastolicPressure,
    spo2: clamp(state.spo2, 0, 100),
    peripheralPerfusion: clamp(state.peripheralPerfusion, 0, 1),
  }
  if (state.respiratory) {
    const r = { ...DEFAULT_RESPIRATORY_STATE, ...state.respiratory }
    const respiratoryRate = clamp(r.respiratoryRate, 0, 80)
    const spontaneousRespiratoryRate = clamp(r.spontaneousRespiratoryRate, 0, 80)
    const tidalVolumeMl = clamp(r.tidalVolumeMl, 0, 1000)
    const spontaneousTidalVolumeMl = clamp(r.spontaneousTidalVolumeMl, 0, 1000)
    bounded.respiratory = {
      ...r,
      respiratoryRate, spontaneousRespiratoryRate, tidalVolumeMl, spontaneousTidalVolumeMl,
      expiratoryResistanceCmH2OLs: clamp(r.expiratoryResistanceCmH2OLs, 0.1, 200),
      deadSpaceMl: clamp(r.deadSpaceMl, 0, Math.max(0, tidalVolumeMl)),
      fio2: clamp(r.fio2, 0.21, 1),
      shuntFraction: clamp(r.shuntFraction, 0, 1),
      maxSpO2: clamp(r.maxSpO2, 0, 100),
    }
  }
  return bounded
}
export function applySharedEdumonActionPhysiology(state, resolve) {
  const depth = sharedAnaestheticDepth(state, resolve)
  const stimulus = Math.max(0, resolve('stimulus.sympathetic', 0))
  const nociceptiveResponse = Math.max(0, resolve('anaesthesia.nociceptiveResponse', 1))
  const sympathetic = saturatingSympatheticResponse(stimulus * nociceptiveResponse * DEPTH_RESPONSE[depth])
  const heartRateOffset = 25 * sympathetic
  const mapOffset = 30 * sympathetic
  const baselineMean = state.diastolicPressure + (state.systolicPressure - state.diastolicPressure) / 3
  const shift = resolve('haemodynamics.meanArterialPressure', baselineMean) + mapOffset - baselineMean
  const baselineRespiratory = { ...DEFAULT_RESPIRATORY_STATE, ...(state.respiratory ?? {}) }
  const drive = clamp(resolve('respiration.drive', 1), 0, 3)
  const block = clamp(resolve('neuromuscular.block', 0), 0, 1)
  const airwayObstruction = clamp(resolve('respiration.airwayObstruction', 0), 0, 1)
  const muscleFraction = 1 - block
  const ventilationMode = baselineRespiratory.ventilatorMode ?? 'MANUAL'
  const effectiveDependsOnSpontaneousDrive = ventilationMode === 'MANUAL' || ventilationMode === 'PSV'
  // Preserve v1 mechanics: NMB suppresses mechanically visible spontaneous
  // breaths but must NOT suppress mandatory controlled ventilation.
  const spontaneousRespiratoryRate = baselineRespiratory.spontaneousRespiratoryRate * drive * muscleFraction
  const spontaneousTidalVolumeMl = baselineRespiratory.spontaneousTidalVolumeMl * drive * muscleFraction
  const respiratory = {
    ...baselineRespiratory, spontaneousRespiratoryRate, spontaneousTidalVolumeMl,
    expiratoryResistanceCmH2OLs: baselineRespiratory.expiratoryResistanceCmH2OLs * (1 + 4 * airwayObstruction),
    ...(effectiveDependsOnSpontaneousDrive ? {
      respiratoryRate: spontaneousRespiratoryRate,
      tidalVolumeMl: ventilationMode === 'PSV' && spontaneousRespiratoryRate > 0
        ? baselineRespiratory.tidalVolumeMl * muscleFraction : spontaneousTidalVolumeMl,
    } : {}),
  }
  return applySharedEdumonBounds({
    ...state,
    heartRate: resolve('haemodynamics.heartRate', state.heartRate) + heartRateOffset,
    systolicPressure: state.systolicPressure + shift,
    diastolicPressure: state.diastolicPressure + shift,
    respiratory,
  })
}
