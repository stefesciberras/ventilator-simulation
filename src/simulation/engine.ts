import type { Measurements, PatientSettings, Sample, VentilatorSettings } from './types'
import {
  advanceSimulation as legacyAdvanceSimulation,
  calculateMeasurements as legacyCalculateMeasurements,
  createSimulationState as createLegacySimulationState,
  generateWaveforms as legacyGenerateWaveforms,
  stepSimulation as legacyStepSimulation,
  type SimulationOptions as LegacySimulationOptions,
  type SimulationState as LegacySimulationState,
} from './engineLegacy'
import {
  createRespiratoryPhysiologyState,
  type RespiratoryPhysiologyState,
} from '../core/physiology/respiratory'
import { stepEduventRespiratoryPhysiology } from '../eduvent/respiratoryPhysiologyAdapter'

/**
 * EDUVENT simulation-engine facade.
 *
 * Ventilator mechanics, triggering and waveform morphology remain in the mature
 * EDUVENT engine (`engineLegacy.ts`). Product-neutral respiratory gas exchange
 * now advances through the shared EDUSIM respiratory physiology core. The
 * legacy gas fields are synchronized from that shared state after every step so
 * existing capnogram morphology, measurements and saved-state consumers keep
 * their current API while the physiology ownership moves into EDUSIM core.
 */
export type SimulationOptions = LegacySimulationOptions

export interface SimulationState extends LegacySimulationState {
  /** Optional so pre-extraction persisted/runtime state can still be resumed. */
  respiratoryPhysiology?: RespiratoryPhysiologyState
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

function effectiveRespiratoryRate(
  state: LegacySimulationState,
  ventilator: VentilatorSettings,
  patient: PatientSettings,
  t: number,
): number {
  const mandatoryRate = ventilator.mode === 'PSV' ? 0 : Math.max(ventilator.rate, 0)
  const fallback = Math.max(patient.spontaneousRate > 0 ? patient.spontaneousRate : 0, mandatoryRate)
  if (state.lastInspirationStart < -50) return fallback

  const elapsedSinceInspiration = Math.max(0.01, t - state.lastInspirationStart)
  const referenceRate = Math.max(state.estimatedRespiratoryRate, fallback, 0.1)
  const expectedCycle = 60 / referenceRate
  if (elapsedSinceInspiration > Math.max(3, expectedCycle * 2)) return 0

  const rateLimitedByMissedBreath = 60 / elapsedSinceInspiration
  return clamp(
    Math.min(Math.max(state.estimatedRespiratoryRate, fallback), rateLimitedByMissedBreath),
    0,
    80,
  )
}

function sharedStateFor(state: SimulationState): RespiratoryPhysiologyState {
  return state.respiratoryPhysiology ?? createRespiratoryPhysiologyState({
    alveolarCo2MmHg: state.alveolarCo2,
    alveolarOxygenFraction: state.alveolarOxygenFraction,
    spo2Percent: state.spo2,
  })
}

function requestHeld(
  t: number,
  requestTime: number | null | undefined,
  releaseTime: number | null | undefined,
): boolean {
  return requestTime != null && t >= requestTime && (releaseTime == null || t < releaseTime)
}

function wrapPhase(value: number, cycle: number): number {
  return ((value % cycle) + cycle) % cycle
}

/**
 * APRV uses a long PHigh phase followed by a short release to PLow. A manual
 * hold must therefore latch at the END of the relevant phase, not merely while
 * that pressure level happens to be active:
 *
 * - Inspiratory hold: PHigh -> PLow boundary, before release flow starts.
 * - Expiratory hold: PLow -> PHigh boundary, before reinflation starts.
 *
 * v0.83.0.47 allowed holds to start anywhere within the matching pressure
 * phase. In particular an expiratory-hold press could latch immediately after
 * the release began, trapping near-end-inspiratory volume and making the two
 * APRV hold buttons appear reversed. Queue the request until its proper phase
 * boundary and then preserve the legacy occlusion mechanics/phase-clock pause.
 */
function aprvBoundaryHoldOptions(
  state: SimulationState,
  ventilator: VentilatorSettings,
  t: number,
  dt: number,
  options: SimulationOptions,
): SimulationOptions {
  if (ventilator.mode !== 'APRV') return options

  const inspiratoryRequestHeld = requestHeld(
    t,
    options.inspiratoryHoldRequestTime,
    options.inspiratoryHoldReleaseTime,
  )
  const expiratoryRequestHeld = requestHeld(
    t,
    options.expiratoryHoldRequestTime,
    options.expiratoryHoldReleaseTime,
  )

  const tHigh = Math.max(ventilator.tHigh, 0.1)
  const tLow = Math.max(ventilator.tLow, 0.05)
  const cycle = tHigh + tLow
  const elapsed = t - state.modeStartTime
  const phase = wrapPhase(elapsed, cycle)
  const previousPhase = wrapPhase(elapsed - dt, cycle)
  const high = phase < tHigh
  const previousHigh = previousPhase < tHigh

  const noHoldActive = !state.inspiratoryHoldActive && !state.expiratoryHoldActive
  const startInspiratoryHold = noHoldActive && inspiratoryRequestHeld && previousHigh && !high
  const startExpiratoryHold = noHoldActive && expiratoryRequestHeld && !previousHigh && high

  // Keep the APRV clock on the just-completed phase for this first occluded
  // sample. The legacy engine will then pause modeStartTime on subsequent held
  // samples and will resume the correct next phase when the button is released.
  if (startInspiratoryHold || startExpiratoryHold) state.modeStartTime += dt

  const passInspiratoryRequest = inspiratoryRequestHeld && (state.inspiratoryHoldActive || startInspiratoryHold)
  const passExpiratoryRequest = expiratoryRequestHeld && (state.expiratoryHoldActive || startExpiratoryHold)

  return {
    ...options,
    inspiratoryHoldRequestTime: passInspiratoryRequest ? t : null,
    inspiratoryHoldReleaseTime: null,
    expiratoryHoldRequestTime: passExpiratoryRequest ? t : null,
    expiratoryHoldReleaseTime: null,
  }
}

export function createSimulationState(): SimulationState {
  const legacy = createLegacySimulationState()
  return {
    ...legacy,
    respiratoryPhysiology: createRespiratoryPhysiologyState({
      alveolarCo2MmHg: legacy.alveolarCo2,
      alveolarOxygenFraction: legacy.alveolarOxygenFraction,
      spo2Percent: legacy.spo2,
    }),
  }
}

export function stepSimulation(
  state: SimulationState,
  ventilator: VentilatorSettings,
  patient: PatientSettings,
  t: number,
  dt = 0.01,
  options: SimulationOptions = {},
): Sample {
  // Use the same pre-step ventilation estimate the original EDUVENT gas model
  // used. This preserves the mature simulator's timing while making the shared
  // physiology state authoritative between simulation steps.
  const respiratoryRate = effectiveRespiratoryRate(state, ventilator, patient, t)
  const expiredTidalVolumeL = state.lastExpiredTidalVolume
  const previousSharedState = sharedStateFor(state)
  const effectiveOptions = aprvBoundaryHoldOptions(state, ventilator, t, dt, options)

  const sample = legacyStepSimulation(state, ventilator, patient, t, dt, effectiveOptions)
  const shared = stepEduventRespiratoryPhysiology(
    previousSharedState,
    ventilator,
    patient,
    { respiratoryRate, expiredTidalVolumeL },
    dt,
  )

  state.respiratoryPhysiology = shared.state
  state.alveolarCo2 = shared.output.alveolarCo2MmHg
  state.alveolarOxygenFraction = shared.output.alveolarOxygenFraction
  state.spo2 = shared.output.spo2Percent

  // SpO2 is a gas-exchange output, so expose the shared value immediately. CO2
  // waveform morphology stays product-owned and is generated by the legacy
  // EDUVENT capnogram renderer using the synchronized alveolar state.
  sample.spo2 = shared.output.spo2Percent
  return sample
}

export function advanceSimulation(
  state: SimulationState,
  ventilator: VentilatorSettings,
  patient: PatientSettings,
  startTime: number,
  steps: number,
  dt = 0.01,
  options: SimulationOptions = {},
): Sample[] {
  const samples: Sample[] = []
  for (let index = 0; index < steps; index += 1) {
    const t = startTime + index * dt
    samples.push(stepSimulation(state, ventilator, patient, t, dt, options))
  }
  return samples
}

export function generateWaveforms(
  ventilator: VentilatorSettings,
  patient: PatientSettings,
  duration = 30,
  dt = 0.01,
  options: SimulationOptions = {},
): Sample[] {
  const state = createSimulationState()
  return advanceSimulation(state, ventilator, patient, 0, Math.floor(duration / dt) + 1, dt, options)
}

export function calculateMeasurements(samples: Sample[], ventilator: VentilatorSettings): Measurements {
  return legacyCalculateMeasurements(samples, ventilator)
}

// Keep these imports referenced while the compatibility facade is in place. They
// provide compile-time assertions that the mature engine continues to expose the
// same batch helpers during the migration.
void legacyAdvanceSimulation
void legacyGenerateWaveforms
