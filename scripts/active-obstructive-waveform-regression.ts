import { generateWaveforms } from '../src/simulation/engine'
import { PATIENT_PROFILES } from '../src/patientProfiles'
import type { PatientSettings, Sample, VentilatorSettings } from '../src/simulation/types'

const assert = (condition: boolean, message: string) => {
  if (!condition) throw new Error(`Active obstructive waveform regression: ${message}`)
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

function nearest(samples: Sample[], startTime: number, offset: number): Sample {
  let best = samples[0]
  let distance = Number.POSITIVE_INFINITY
  for (const sample of samples) {
    const d = Math.abs((sample.time - startTime) - offset)
    if (d < distance) {
      best = sample
      distance = d
    }
  }
  return best
}

function completeExpirationAfter(samples: Sample[], afterTime: number): Sample[] {
  for (let start = 1; start < samples.length; start += 1) {
    if (samples[start].time <= afterTime) continue
    if (samples[start].phase !== 'expiration' || samples[start - 1].phase === 'expiration') continue
    let end = start + 1
    while (end < samples.length && samples[end].phase === 'expiration') end += 1
    if (end < samples.length && end - start > 30) return samples.slice(start, end)
  }
  throw new Error('Active obstructive waveform regression: no complete expiration found')
}

function run(expiratoryResistance: number) {
  const patient: PatientSettings = {
    ...PATIENT_PROFILES.Asthma,
    expiratoryResistance,
    expiratoryFlowLimitation: 0.75,
    spontaneousRate: 24,
    effort: 10,
    neuralInspiratoryTime: 0.75,
    effortRisePercent: 30,
    effortRelaxationPercent: 40,
  }

  const samples = generateWaveforms(ventilator, patient, 30, 0.01)
  const triggerIndex = samples.findIndex((sample) => sample.time > 20 && sample.breathTrigger === 'patient')
  assert(triggerIndex > 6, `Rexp ${expiratoryResistance}: no patient-triggered PC breath after 20 s`)

  const trigger = samples[triggerIndex]
  const preTrigger = samples.slice(Math.max(0, triggerIndex - 8), triggerIndex)
  const minimumPreTriggerPaw = Math.min(...preTrigger.map((sample) => sample.pressure))
  const p50 = nearest(samples.slice(triggerIndex), trigger.time, 0.05)
  const p100 = nearest(samples.slice(triggerIndex), trigger.time, 0.10)

  const expiration = completeExpirationAfter(samples, trigger.time)
  const expirationStart = expiration[0].time
  const initialFlow = expiration[0].flow
  const flow50 = nearest(expiration, expirationStart, 0.05).flow
  const flow100 = nearest(expiration, expirationStart, 0.10).flow
  const flow250 = nearest(expiration, expirationStart, 0.25).flow
  const flow500 = nearest(expiration, expirationStart, 0.50).flow

  return {
    expiratoryResistance,
    triggerTime: trigger.time,
    minimumPreTriggerPaw,
    triggerPaw: trigger.pressure,
    paw50ms: p50.pressure,
    paw100ms: p100.pressure,
    initialExpiratoryFlow: initialFlow,
    flow50ms: flow50,
    flow100ms: flow100,
    flow250ms: flow250,
    flow500ms: flow500,
    earlyExpiratoryRecovery: flow100 - initialFlow,
    lateExpiratoryRecovery: flow500 - flow250,
  }
}

const lowRexp = run(6)
const highRexp = run(PATIENT_PROFILES.Asthma.expiratoryResistance)

console.log('Active obstructive trigger/EFL morphology metrics')
console.log(JSON.stringify({ lowRexp, highRexp }, null, 2))

for (const metrics of [lowRexp, highRexp]) {
  assert(
    metrics.minimumPreTriggerPaw < ventilator.peep - 0.5,
    `Rexp ${metrics.expiratoryResistance}: patient effort must create a visible pre-trigger Paw notch`,
  )
  assert(
    Math.abs(metrics.triggerPaw - ventilator.peep) <= 0.25,
    `Rexp ${metrics.expiratoryResistance}: triggered PC breath must return to PEEP at breath onset; got ${metrics.triggerPaw.toFixed(2)} cmH2O`,
  )
  assert(
    metrics.paw50ms > metrics.triggerPaw + 2,
    `Rexp ${metrics.expiratoryResistance}: PC Paw must show a smooth finite rise after trigger`,
  )
  assert(
    metrics.paw100ms > metrics.paw50ms + 2,
    `Rexp ${metrics.expiratoryResistance}: PC Paw must continue rising through the first 100 ms`,
  )
  assert(
    metrics.initialExpiratoryFlow < metrics.flow100ms - 3,
    `Rexp ${metrics.expiratoryResistance}: EFL must retain an opening expiratory spike/elbow; initial ${metrics.initialExpiratoryFlow.toFixed(1)}, 100 ms ${metrics.flow100ms.toFixed(1)} L/min`,
  )
  assert(
    metrics.flow250ms > metrics.flow100ms,
    `Rexp ${metrics.expiratoryResistance}: post-elbow expiratory flow must continue toward zero`,
  )
  assert(
    metrics.flow500ms > metrics.flow250ms,
    `Rexp ${metrics.expiratoryResistance}: flow-limited limb must remain monotone without a secondary hump`,
  )
}

assert(
  Math.abs(highRexp.flow250ms) < Math.abs(lowRexp.flow250ms),
  `high Rexp asthma must have a tighter post-elbow expiratory limb than Rexp 6`,
)

console.log('Active obstructive waveform regression checks passed')
