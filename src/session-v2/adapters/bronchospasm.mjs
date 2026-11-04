/**
 * Intrinsic bronchospasm Event (Session Engine v2 pilot).
 * Severity is a validated 0..100% input. A short simulated-time ramp
 * changes only the declarative respiration.airwayObstruction ActionEffect,
 * never the displayed pressure, ETCO2 or capnogram directly.
 */
const clamp = (v,lo,hi) => Math.max(lo,Math.min(hi,v))
export const BRONCHOSPASM_EVENT_ID = 'bronchospasm'
export const BRONCHOSPASM_EFFECT_ID = 'bronchospasm-airway-obstruction'
export const BRONCHOSPASM_RESPONSE_SECONDS = 2
const effect = intensity => ({
  instanceId: 'bronchospasm:severity:authoritative', actionId: BRONCHOSPASM_EVENT_ID,
  actionName: 'Bronchospasm', actionKind: 'event', mode: 'toggle',
  intensity, startedAtSimulationTime: 0,
  effect: { id: BRONCHOSPASM_EFFECT_ID, target: 'respiration.airwayObstruction',
    operation: 'target', value: 1, onsetSeconds: 0, durationSeconds: 0,
    recoverySeconds: 0, priority: 30 },
})
export function setBronchospasmSeverity(state, severityPercent) {
  if (typeof severityPercent !== 'number' || !Number.isFinite(severityPercent) ||
    severityPercent < 0 || severityPercent > 100) throw Error('invalid-bronchospasm-severity')
  const current = clamp(state.bronchospasmRuntime?.effectiveSeverityPercent ?? 0, 0, 100)
  return { ...state, bronchospasmRuntime: {
    targetSeverityPercent: severityPercent, effectiveSeverityPercent: current,
  } }
}
export function advanceBronchospasm(state, deltaSeconds) {
  if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0 || deltaSeconds > 60)
    throw Error('invalid-bronchospasm-delta')
  const current = clamp(state.bronchospasmRuntime?.effectiveSeverityPercent ?? 0, 0, 100)
  const target = clamp(state.bronchospasmRuntime?.targetSeverityPercent ?? 0, 0, 100)
  const nextSeverity = current + (target - current) *
    (1 - Math.exp(-deltaSeconds / BRONCHOSPASM_RESPONSE_SECONDS))
  const kept = (state.actionRuntime.activeEffects ?? []).filter(
    item => item.actionId !== BRONCHOSPASM_EVENT_ID)
  // One canonical effect; repeated slider changes must never stack.
  if (nextSeverity > 0.000001) kept.push(effect(nextSeverity / 100))
  return { ...state, bronchospasmRuntime: {
      targetSeverityPercent: target, effectiveSeverityPercent: nextSeverity,
    },
    actionRuntime: { ...state.actionRuntime, activeEffects: kept },
  }
}
/** Mode-aware single-compartment educational equation-of-motion projection.
 * Not the full mechanical-breath solver from loppjuSIM-Vent. */
export function projectBronchospasmVentilation(respiratory) {
  const r = clamp(respiratory.expiratoryResistanceCmH2OLs ?? 8, .1, 200)
  const c = clamp(respiratory.complianceMlPerCmH2O ?? 70, 10, 250) / 1000
  const mode = respiratory.ventilatorMode ?? 'MANUAL'
  const peep = clamp(respiratory.peepCmH2O ?? 0, 0, 35)
  const ti = clamp(respiratory.ventilatorInspiratoryTimeSeconds ?? 1, .1, 10)
  const vt = clamp(['VC-AC','SIMV-VC','VG-PC'].includes(mode)
    ? (respiratory.ventilatorSetTidalVolumeMl ?? respiratory.tidalVolumeMl ?? 500)
    : (respiratory.tidalVolumeMl ?? 500), 0, 1000)
  const defaultFlow = vt / 1000 / ti
  const flow = (respiratory.ventilatorInspiratoryFlowLMin ?? defaultFlow * 60) / 60
  const pc = Math.max(0, respiratory.ventilatorPressureControlCmH2O ?? 15)
  const ps = Math.max(0, respiratory.ventilatorPressureSupportCmH2O ?? 10)
  let deliveredVtMl = vt
  let peakAirwayPressureCmH2O = peep + vt / 1000 / c + r * Math.max(0,flow)
  if (mode === 'PC-AC' || mode === 'SIMV-PC' || mode === 'PSV') {
    const setPressure = mode === 'PSV' ? ps : pc
    const baselineResponse = 1 - Math.exp(-ti / (8 * c))
    const obstructedResponse = 1 - Math.exp(-ti / (r * c))
    const referenceVt = setPressure * c * 1000 * 0.7
    deliveredVtMl = clamp(referenceVt * obstructedResponse / Math.max(baselineResponse, .01), 0, 1000)
    peakAirwayPressureCmH2O = peep + setPressure
  }
  if (mode === 'VG-PC') {
    const limit = Math.max(peep, respiratory.ventilatorVolumeGuaranteePressureLimitCmH2O ?? 40)
    peakAirwayPressureCmH2O = Math.min(limit, peakAirwayPressureCmH2O)
  }
  return { peakAirwayPressureCmH2O: Math.max(0,peakAirwayPressureCmH2O),
    tidalVolumeMl: deliveredVtMl, airwayResistanceCmH2OLs: r,
    expiratoryTimeConstantSeconds: r * c }
}
