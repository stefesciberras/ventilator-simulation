import { createSimulationState, stepSimulation } from '../src/simulation/engine'
import { PATIENT_PROFILES } from '../src/patientProfiles'
import type { PatientSettings, Sample, VentilatorSettings } from '../src/simulation/types'

const assert = (condition: boolean, message: string) => {
  if (!condition) throw new Error(`Two-level mechanics regression: ${message}`)
}

const passivePatient: PatientSettings = {
  ...PATIENT_PROFILES.Normal,
  spontaneousRate: 0,
  effort: 0,
}

const activePatient: PatientSettings = { ...PATIENT_PROFILES.Normal }

const baseVentilator: VentilatorSettings = {
  mode: 'APRV',
  fio2: 0.21,
  peep: 5,
  rate: 12,
  tidalVolume: 500,
  inspiratoryTime: 1,
  inspiratoryFlow: 60,
  plateauPercent: 0,
  pressureControl: 12,
  volumeGuaranteePressureLimit: 40,
  pressureSupport: 10,
  triggerType: 'flow',
  triggerSensitivity: 1,
  flowTriggerSensitivity: 2,
  terminationSensitivity: 25,
  simvSyncWindowPercent: 25,
  showSimvSyncWindow: false,
  pHigh: 24,
  pLow: 5,
  tHigh: 4,
  tLow: 0.6,
}

interface TwoLevelMetrics {
  trackedVtMl: number
  integratedExpiredVtMl: number
  relativeError: number
  peakInspiratoryFlowLMin: number
  peakExpiratoryFlowLMin: number
  highPressureMeanCmH2O: number
  lowPressureMeanCmH2O: number
}

function measureMode(ventilator: VentilatorSettings, duration: number): TwoLevelMetrics {
  const state = createSimulationState()
  const dt = 0.01
  let previousPhase: 'inspiration' | 'expiration' | null = null
  let integratedExpirationL = 0
  let completedExpirationL: number | null = null
  let peakInspiratoryFlow = 0
  let peakExpiratoryFlow = 0
  let highPressureSum = 0
  let highPressureCount = 0
  let lowPressureSum = 0
  let lowPressureCount = 0

  for (let index = 0; index <= Math.floor(duration / dt); index += 1) {
    const t = index * dt
    const sample = stepSimulation(state, ventilator, passivePatient, t, dt)

    if (sample.phase === 'inspiration') {
      peakInspiratoryFlow = Math.max(peakInspiratoryFlow, sample.flow)
      if (sample.flow >= 0) {
        highPressureSum += sample.pressure
        highPressureCount += 1
      }
    } else {
      peakExpiratoryFlow = Math.min(peakExpiratoryFlow, sample.flow)
      integratedExpirationL += Math.max(0, -sample.flow / 60) * dt
      if (sample.flow <= 0) {
        lowPressureSum += sample.pressure
        lowPressureCount += 1
      }
    }

    if (sample.phase === 'inspiration' && previousPhase === 'expiration' && completedExpirationL == null) {
      completedExpirationL = integratedExpirationL
      // The transition sample has already caused the engine tracker to commit
      // the preceding expired volume into lastExpiredTidalVolume.
      break
    }
    previousPhase = sample.phase
  }

  assert(completedExpirationL != null, `${ventilator.mode} must complete an expiratory phase`)
  assert(state.lastExpiredTidalVolume > 0, `${ventilator.mode} must track a non-zero expired VT`)

  const integratedExpiredVtMl = completedExpirationL * 1000
  const trackedVtMl = state.lastExpiredTidalVolume * 1000
  const relativeError = Math.abs(trackedVtMl - integratedExpiredVtMl) / Math.max(integratedExpiredVtMl, 1)

  return {
    trackedVtMl,
    integratedExpiredVtMl,
    relativeError,
    peakInspiratoryFlowLMin: peakInspiratoryFlow,
    peakExpiratoryFlowLMin: peakExpiratoryFlow,
    highPressureMeanCmH2O: highPressureSum / Math.max(highPressureCount, 1),
    lowPressureMeanCmH2O: lowPressureSum / Math.max(lowPressureCount, 1),
  }
}

function aprvSpontaneousInteraction(ventilator: VentilatorSettings) {
  const passiveState = createSimulationState()
  const activeState = createSimulationState()
  const dt = 0.01
  let maximumFlowIncrease = Number.NEGATIVE_INFINITY
  let maximumPawDrop = Number.NEGATIVE_INFINITY
  let interactionSamples = 0

  for (let index = 0; index <= Math.floor(6.2 / dt); index += 1) {
    const t = index * dt
    const passive = stepSimulation(passiveState, ventilator, passivePatient, t, dt)
    const active = stepSimulation(activeState, ventilator, activePatient, t, dt)

    // After the first APRV release, the Normal patient's next neural effort
    // begins at 5 s while the ventilator is back on PHigh. This is a clean
    // check that spontaneous effort can modulate flow without changing phase.
    if (
      t >= 5 &&
      t <= 5.9 &&
      active.phase === 'inspiration' &&
      passive.phase === 'inspiration' &&
      active.musclePressure > 1
    ) {
      interactionSamples += 1
      maximumFlowIncrease = Math.max(maximumFlowIncrease, active.flow - passive.flow)
      maximumPawDrop = Math.max(maximumPawDrop, passive.pressure - active.pressure)
    }
  }

  assert(interactionSamples > 10, 'APRV active-patient calibration must sample spontaneous effort during PHigh')
  return { maximumFlowIncrease, maximumPawDrop, interactionSamples }
}

function firstBipapSynchronizedTransition(ventilator: VentilatorSettings): Sample | null {
  const state = createSimulationState()
  const dt = 0.01
  let previousPhase: Sample['phase'] | null = null

  for (let index = 0; index <= Math.floor(7 / dt); index += 1) {
    const t = index * dt
    const sample = stepSimulation(state, ventilator, activePatient, t, dt)
    const entersHigh = sample.phase === 'inspiration' && previousPhase === 'expiration'
    if (entersHigh && sample.breathTrigger === 'patient') return sample
    previousPhase = sample.phase
  }
  return null
}

const aprv = measureMode({ ...baseVentilator, mode: 'APRV' }, 10)
const bipap = measureMode({ ...baseVentilator, mode: 'BIPAP', inspiratoryTime: 1 }, 10)

for (const [mode, metrics] of [['APRV', aprv], ['BIPAP', bipap]] as const) {
  assert(metrics.integratedExpiredVtMl > 50, `${mode} release must produce measurable expired volume`)
  assert(metrics.trackedVtMl > 50, `${mode} tracked VT must remain measurable`)
  assert(metrics.relativeError <= 0.03, `${mode} tracked VT ${metrics.trackedVtMl.toFixed(0)} mL must match waveform-integrated expiration ${metrics.integratedExpiredVtMl.toFixed(0)} mL; relative error ${(metrics.relativeError * 100).toFixed(1)}%`)
  assert(metrics.peakInspiratoryFlowLMin > 5, `${mode} must produce inspiratory flow during pressure rise`)
  assert(metrics.peakExpiratoryFlowLMin < -5, `${mode} must produce expiratory release flow`)
}

assert(aprv.highPressureMeanCmH2O > aprv.lowPressureMeanCmH2O + 5, 'APRV must preserve distinct high/low pressure phases')
assert(bipap.highPressureMeanCmH2O > bipap.lowPressureMeanCmH2O + 5, 'BIPAP must preserve distinct high/low pressure phases')

// Normal-patient calibration for the two-level pressure source. The circuit has
// finite impedance in both directions; release should remain brisk, but an
// instantaneous 19 cmH2O pressure drop must not behave as though the expiratory
// limb has zero circuit resistance.
assert(aprv.peakExpiratoryFlowLMin <= -100 && aprv.peakExpiratoryFlowLMin >= -160, `APRV Normal release peak ${aprv.peakExpiratoryFlowLMin.toFixed(1)} L/min must remain within the calibrated -160 to -100 L/min envelope`)
assert(bipap.peakExpiratoryFlowLMin <= -40 && bipap.peakExpiratoryFlowLMin >= -100, `BIPAP Normal expiratory peak ${bipap.peakExpiratoryFlowLMin.toFixed(1)} L/min must remain within the calibrated -100 to -40 L/min envelope`)
assert(aprv.peakInspiratoryFlowLMin < 150, `APRV Normal inspiratory peak ${aprv.peakInspiratoryFlowLMin.toFixed(1)} L/min must remain below 150 L/min`)
assert(bipap.peakInspiratoryFlowLMin < 120, `BIPAP Normal inspiratory peak ${bipap.peakInspiratoryFlowLMin.toFixed(1)} L/min must remain below 120 L/min`)

const aprvInteraction = aprvSpontaneousInteraction({ ...baseVentilator, mode: 'APRV' })
assert(aprvInteraction.maximumFlowIncrease > 5, `APRV spontaneous effort must increase inspiratory demand on PHigh by >5 L/min; observed ${aprvInteraction.maximumFlowIncrease.toFixed(1)} L/min`)
assert(aprvInteraction.maximumPawDrop > 0.1, `APRV finite-source interaction must show a measurable Paw droop during spontaneous demand; observed ${aprvInteraction.maximumPawDrop.toFixed(2)} cmH2O`)

// With a 10/min mandatory BIPAP rate, Ti 1 s and Te 5 s, the low-phase sync
// window opens late in expiration. The Normal patient's 12/min effort beginning
// at 5 s should synchronize the next high phase before the nominal 6 s cycle.
const bipapSyncVentilator: VentilatorSettings = {
  ...baseVentilator,
  mode: 'BIPAP',
  rate: 10,
  inspiratoryTime: 1,
}
const synchronizedBipap = firstBipapSynchronizedTransition(bipapSyncVentilator)
assert(synchronizedBipap != null, 'BIPAP must synchronize a late-expiratory patient effort into the next high-pressure phase')
assert(synchronizedBipap.time >= 5.15 && synchronizedBipap.time <= 5.4, `BIPAP synchronized transition ${synchronizedBipap.time.toFixed(2)} s must occur in the expected late-expiratory sync window`)
assert(synchronizedBipap.ventilatorTriggerDetected === true, 'BIPAP synchronized transition must expose ventilatorTriggerDetected')

console.log('Two-level mechanics regression checks passed')
console.log(JSON.stringify({
  aprv: {
    trackedVtMl: Number(aprv.trackedVtMl.toFixed(0)),
    integratedExpiredVtMl: Number(aprv.integratedExpiredVtMl.toFixed(0)),
    relativeErrorPercent: Number((aprv.relativeError * 100).toFixed(1)),
    peakInspiratoryFlowLMin: Number(aprv.peakInspiratoryFlowLMin.toFixed(1)),
    peakExpiratoryFlowLMin: Number(aprv.peakExpiratoryFlowLMin.toFixed(1)),
    spontaneousFlowIncreaseLMin: Number(aprvInteraction.maximumFlowIncrease.toFixed(1)),
    spontaneousPawDroopCmH2O: Number(aprvInteraction.maximumPawDrop.toFixed(2)),
  },
  bipap: {
    trackedVtMl: Number(bipap.trackedVtMl.toFixed(0)),
    integratedExpiredVtMl: Number(bipap.integratedExpiredVtMl.toFixed(0)),
    relativeErrorPercent: Number((bipap.relativeError * 100).toFixed(1)),
    peakInspiratoryFlowLMin: Number(bipap.peakInspiratoryFlowLMin.toFixed(1)),
    peakExpiratoryFlowLMin: Number(bipap.peakExpiratoryFlowLMin.toFixed(1)),
    synchronizedTransitionTime: Number(synchronizedBipap.time.toFixed(2)),
  },
}, null, 2))
