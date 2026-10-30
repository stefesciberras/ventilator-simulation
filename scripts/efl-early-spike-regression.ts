import { generateWaveforms } from '../src/simulation/engine'
import { PATIENT_PROFILES } from '../src/patientProfiles'
import type { PatientSettings, Sample, VentilatorSettings } from '../src/simulation/types'

const assert = (condition: boolean, message: string) => {
  if (!condition) throw new Error(`EFL early-spike regression: ${message}`)
}

const patient: PatientSettings = {
  ...PATIENT_PROFILES.Normal,
  expiratoryFlowLimitation: 1,
  spontaneousRate: 0,
  effort: 0,
}

const ventilator: VentilatorSettings = {
  mode: 'PC-AC',
  fio2: 0.35,
  peep: 5,
  rate: 14,
  tidalVolume: 500,
  inspiratoryTime: 1,
  inspiratoryFlow: 30,
  plateauPercent: 0,
  pressureControl: 10,
  volumeGuaranteePressureLimit: 40,
  pressureSupport: 10,
  triggerType: 'flow',
  triggerSensitivity: 2,
  flowTriggerSensitivity: 2,
  terminationSensitivity: 25,
  simvSyncWindowPercent: 25,
  showSimvSyncWindow: false,
  pHigh: 24,
  pLow: 5,
  tHigh: 4,
  tLow: 0.5,
}

function steadyExpiration(samples: Sample[]): Sample[] {
  for (let start = 1; start < samples.length; start += 1) {
    if (samples[start].time < 20) continue
    if (samples[start].phase !== 'expiration' || samples[start - 1].phase === 'expiration') continue
    let end = start + 1
    while (end < samples.length && samples[end].phase === 'expiration') end += 1
    if (end < samples.length && end - start > 30) return samples.slice(start, end)
  }
  throw new Error('EFL early-spike regression: no complete steady-state expiration found')
}

const samples = generateWaveforms(ventilator, patient, 30, 0.01)
const expiration = steadyExpiration(samples)
const start = expiration[0].time
const at = (offset: number) => {
  let best = expiration[0]
  let distance = Number.POSITIVE_INFINITY
  for (const sample of expiration) {
    const d = Math.abs((sample.time - start) - offset)
    if (d < distance) {
      best = sample
      distance = d
    }
  }
  return best.flow
}

const initial = expiration[0].flow
const flow50 = at(0.05)
const flow100 = at(0.1)
const flow250 = at(0.25)
const flow500 = at(0.5)
const earlyRecovery = flow100 - initial
const lateRecovery = flow500 - flow250

console.log('EFL early-spike morphology metrics')
console.log(JSON.stringify({
  initialFlowLMin: Number(initial.toFixed(1)),
  flow50msLMin: Number(flow50.toFixed(1)),
  flow100msLMin: Number(flow100.toFixed(1)),
  flow250msLMin: Number(flow250.toFixed(1)),
  flow500msLMin: Number(flow500.toFixed(1)),
  earlyRecoveryLMin: Number(earlyRecovery.toFixed(1)),
  lateRecoveryLMin: Number(lateRecovery.toFixed(1)),
}, null, 2))

assert(initial < -20, `severe EFL must retain a visible initial expiratory spike; got ${initial.toFixed(1)} L/min`)
assert(flow100 > initial + 5, `flow must recover rapidly during the first 100 ms; initial ${initial.toFixed(1)}, 100 ms ${flow100.toFixed(1)} L/min`)
assert(flow250 > flow100, `flow must continue recovering toward zero after the early elbow; 100 ms ${flow100.toFixed(1)}, 250 ms ${flow250.toFixed(1)}`)
assert(flow500 > flow250, `post-elbow flow-limited limb must continue toward zero without a secondary hump; 250 ms ${flow250.toFixed(1)}, 500 ms ${flow500.toFixed(1)}`)
assert(earlyRecovery > lateRecovery * 1.25, `early 0-100 ms recovery (${earlyRecovery.toFixed(1)} L/min) should be steeper than later 250-500 ms recovery (${lateRecovery.toFixed(1)} L/min)`)

console.log('EFL early-spike regression checks passed')
