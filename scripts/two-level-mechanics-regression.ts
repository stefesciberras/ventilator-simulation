import { createSimulationState, stepSimulation } from '../src/simulation/engine'
import { PATIENT_PROFILES } from '../src/patientProfiles'
import type { PatientSettings, VentilatorSettings } from '../src/simulation/types'

const assert = (condition: boolean, message: string) => {
  if (!condition) throw new Error(`Two-level mechanics regression: ${message}`)
}

const patient: PatientSettings = {
  ...PATIENT_PROFILES.Normal,
  spontaneousRate: 0,
  effort: 0,
}

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
    const sample = stepSimulation(state, ventilator, patient, t, dt)

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

console.log('Two-level mechanics regression checks passed')
console.log(JSON.stringify({
  aprv: {
    trackedVtMl: Number(aprv.trackedVtMl.toFixed(0)),
    integratedExpiredVtMl: Number(aprv.integratedExpiredVtMl.toFixed(0)),
    relativeErrorPercent: Number((aprv.relativeError * 100).toFixed(1)),
    peakInspiratoryFlowLMin: Number(aprv.peakInspiratoryFlowLMin.toFixed(1)),
    peakExpiratoryFlowLMin: Number(aprv.peakExpiratoryFlowLMin.toFixed(1)),
  },
  bipap: {
    trackedVtMl: Number(bipap.trackedVtMl.toFixed(0)),
    integratedExpiredVtMl: Number(bipap.integratedExpiredVtMl.toFixed(0)),
    relativeErrorPercent: Number((bipap.relativeError * 100).toFixed(1)),
    peakInspiratoryFlowLMin: Number(bipap.peakInspiratoryFlowLMin.toFixed(1)),
    peakExpiratoryFlowLMin: Number(bipap.peakExpiratoryFlowLMin.toFixed(1)),
  },
}, null, 2))
