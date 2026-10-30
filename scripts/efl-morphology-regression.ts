import { generateWaveforms } from '../src/simulation/engine'
import { PATIENT_PROFILES } from '../src/patientProfiles'
import { applyExpiratoryFlowLimitation } from '../src/expiratoryFlowLimitation'
import type { PatientSettings, Sample, VentilatorSettings } from '../src/simulation/types'

const assert = (condition: boolean, message: string) => {
  if (!condition) throw new Error(`EFL morphology regression: ${message}`)
}

const mildPatient: PatientSettings = {
  ...PATIENT_PROFILES.Normal,
  expiratoryFlowLimitation: 0.25,
  spontaneousRate: 12,
  effort: 5,
  neuralInspiratoryTime: 1,
}

// A maximum-expiratory-flow envelope must be a monotone cap. Increasing the
// requested expiratory driving flow at a fixed lung volume may approach the
// choke-flow ceiling, but must never make delivered flow fall again. The old
// smoothstep blend violated this property inside its transition band and was
// the mathematical source of the visible secondary EFL shoulder.
const referenceVolumeL = 0.4
let previousDeliveredMagnitude = 0
for (let requestedMagnitude = 0.02; requestedMagnitude <= 2; requestedMagnitude += 0.002) {
  const result = applyExpiratoryFlowLimitation(-requestedMagnitude, referenceVolumeL, mildPatient)
  const deliveredMagnitude = -result.flowLs
  assert(
    deliveredMagnitude + 1e-8 >= previousDeliveredMagnitude,
    `delivered expiratory magnitude fell from ${previousDeliveredMagnitude.toFixed(4)} to ${deliveredMagnitude.toFixed(4)} L/s as requested flow increased`,
  )
  previousDeliveredMagnitude = deliveredMagnitude
}

const ventilator: VentilatorSettings = {
  mode: 'PSV',
  fio2: 0.35,
  peep: 5,
  rate: 18,
  tidalVolume: 500,
  inspiratoryTime: 1.3888888888888893,
  inspiratoryFlow: 30,
  plateauPercent: 0,
  pressureControl: 8,
  volumeGuaranteePressureLimit: 40,
  pressureSupport: 10,
  triggerType: 'flow',
  triggerSensitivity: 2,
  flowTriggerSensitivity: 2,
  terminationSensitivity: 10,
  simvSyncWindowPercent: 35,
  showSimvSyncWindow: false,
  pHigh: 24,
  pLow: 5,
  tHigh: 4,
  tLow: 0.5,
}

function representativePassiveExpiration(samples: Sample[]): Sample[] {
  for (let start = 1; start < samples.length; start += 1) {
    if (samples[start].time < 20) continue
    if (samples[start].phase !== 'expiration' || samples[start - 1].phase === 'expiration') continue

    let end = start + 1
    while (end < samples.length && samples[end].phase === 'expiration') end += 1
    const expiration = samples.slice(start, end)
    if (
      expiration.length > 50 &&
      expiration.some((sample) => sample.flow < -40) &&
      expiration.some((sample) => sample.musclePressure <= 0.001)
    ) return expiration
  }
  throw new Error('EFL morphology regression: no representative PSV expiration found')
}

const samples = generateWaveforms(ventilator, mildPatient, 30, 0.01)
const expiration = representativePassiveExpiration(samples)

// Inspect only the passive portion around the EFL shoulder. Flow should recover
// continuously toward zero. We report the local recovery-rate range as a
// morphology diagnostic so future EFL changes cannot silently restore the
// decelerate-then-reaccelerate bulge seen in v0.83.0.62.
const shoulder = expiration.filter((sample) =>
  sample.musclePressure <= 0.001 && sample.flow >= -60 && sample.flow <= -35,
)
const recoverySteps: number[] = []
for (let index = 1; index < shoulder.length; index += 1) {
  const previous = shoulder[index - 1]
  const current = shoulder[index]
  if (Math.abs(current.time - previous.time - 0.01) > 0.002) continue
  recoverySteps.push(current.flow - previous.flow)
}

assert(recoverySteps.length >= 8, 'mild-EFL PSV shoulder must contain enough passive samples for morphology analysis')
assert(recoverySteps.every((delta) => delta >= -0.01), 'passive mild-EFL expiratory flow must not re-accelerate away from zero')

const positiveRecovery = recoverySteps.filter((delta) => delta > 0.01).sort((a, b) => a - b)
const percentile = (values: number[], fraction: number) => values[Math.min(values.length - 1, Math.floor((values.length - 1) * fraction))]
const p10 = percentile(positiveRecovery, 0.1)
const p90 = percentile(positiveRecovery, 0.9)
const recoverySpread = p90 / Math.max(p10, 1e-6)

assert(positiveRecovery.length >= 8, 'mild-EFL PSV shoulder must show continuous recovery toward zero')
assert(recoverySpread < 5, `mild-EFL recovery-rate spread ${recoverySpread.toFixed(2)} should not contain an artificial flat shelf followed by rebound`)

console.log('EFL morphology regression checks passed')
console.log(JSON.stringify({
  shoulderStartFlowLMin: Number(shoulder[0].flow.toFixed(1)),
  shoulderEndFlowLMin: Number(shoulder[shoulder.length - 1].flow.toFixed(1)),
  recoveryStepP10LMinPer10ms: Number(p10.toFixed(3)),
  recoveryStepP90LMinPer10ms: Number(p90.toFixed(3)),
  recoverySpread: Number(recoverySpread.toFixed(2)),
}, null, 2))
