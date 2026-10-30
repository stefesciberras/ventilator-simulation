import { generateWaveforms } from '../src/simulation/engine'
import { PATIENT_PROFILES } from '../src/patientProfiles'
import { applyExpiratoryFlowLimitation } from '../src/expiratoryFlowLimitation'
import type { PatientSettings, Sample, VentilatorSettings } from '../src/simulation/types'

const assert = (condition: boolean, message: string) => {
  if (!condition) throw new Error(`EFL mechanics regression: ${message}`)
}

const levels = [0, 0.25, 0.5, 0.75, 1] as const
const dt = 0.01

const ventilator: VentilatorSettings = {
  mode: 'VC-AC', fio2: 0.21, peep: 5, rate: 20, tidalVolume: 500,
  inspiratoryTime: 0.5, inspiratoryFlow: 60, plateauPercent: 0,
  pressureControl: 12, volumeGuaranteePressureLimit: 40, pressureSupport: 10,
  triggerType: 'flow', triggerSensitivity: 1, flowTriggerSensitivity: 2,
  terminationSensitivity: 25, simvSyncWindowPercent: 25, showSimvSyncWindow: false,
  pHigh: 24, pLow: 5, tHigh: 4, tLow: 0.6,
}

interface EflMetrics {
  level: number
  peakExpiratoryFlowLMin: number
  flow250msLMin: number
  flow500msLMin: number
  flow1000msLMin: number
  expiredVtMl: number
  endExpiratoryFlowLMin: number
  residualVolumeMl: number
  intrinsicElasticPressureCmH2O: number
  timeTo90PercentEmptyingS: number | null
}

function valueAtOffset(expiration: Sample[], offset: number): number {
  const start = expiration[0].time
  let best = expiration[0]
  let bestDistance = Number.POSITIVE_INFINITY
  for (const sample of expiration) {
    const distance = Math.abs((sample.time - start) - offset)
    if (distance < bestDistance) {
      bestDistance = distance
      best = sample
    }
  }
  return best.flow
}

function steadyExpiration(samples: Sample[]): Sample[] {
  for (let start = 1; start < samples.length; start += 1) {
    if (samples[start].time < 20) continue
    if (samples[start].phase !== 'expiration' || samples[start - 1].phase === 'expiration') continue
    let end = start + 1
    while (end < samples.length && samples[end].phase === 'expiration') end += 1
    if (end < samples.length && end - start > 20) return samples.slice(start, end)
  }
  throw new Error('EFL mechanics regression: no complete steady-state expiration found after 20 s')
}

function measure(level: number): EflMetrics {
  const patient: PatientSettings = {
    ...PATIENT_PROFILES.Normal,
    spontaneousRate: 0,
    effort: 0,
    expiratoryFlowLimitation: level,
  }
  const samples = generateWaveforms(ventilator, patient, 30, dt)
  const expiration = steadyExpiration(samples)
  const startVolumeMl = expiration[0].volume
  const endVolumeMl = expiration[expiration.length - 1].volume
  const target90VolumeMl = startVolumeMl * 0.1
  const t90Sample = expiration.find((sample) => sample.volume <= target90VolumeMl)
  const complianceL = patient.compliance / 1000

  return {
    level,
    peakExpiratoryFlowLMin: Math.min(...expiration.map((sample) => sample.flow)),
    flow250msLMin: valueAtOffset(expiration, 0.25),
    flow500msLMin: valueAtOffset(expiration, 0.5),
    flow1000msLMin: valueAtOffset(expiration, 1),
    expiredVtMl: Math.max(0, startVolumeMl - endVolumeMl),
    endExpiratoryFlowLMin: expiration[expiration.length - 1].flow,
    residualVolumeMl: endVolumeMl,
    intrinsicElasticPressureCmH2O: (endVolumeMl / 1000) / complianceL,
    timeTo90PercentEmptyingS: t90Sample ? t90Sample.time - expiration[0].time : null,
  }
}

function referenceDiseaseEfl(profileName: 'COPD' | 'Asthma') {
  const patient = PATIENT_PROFILES[profileName]
  const complianceL = patient.compliance / 1000
  const referenceVolumeL = 0.5
  const requestedFlowLs = -referenceVolumeL / Math.max(patient.expiratoryResistance * complianceL, 0.05)
  const result = applyExpiratoryFlowLimitation(requestedFlowLs, referenceVolumeL, patient)
  return {
    requestedFlowLMin: requestedFlowLs * 60,
    limitedFlowLMin: result.flowLs * 60,
    limited: result.limited,
  }
}

const sweep = levels.map(measure)

assert(sweep.length === 5, 'five discrete EFL levels must be measured')
assert(sweep[0].peakExpiratoryFlowLMin < -20, 'EFL 0 must allow substantial passive expiratory flow')
assert(sweep[0].residualVolumeMl < 25, `EFL 0 residual volume ${sweep[0].residualVolumeMl.toFixed(0)} mL should approach zero before the next breath`)

// Opening peak alone is not a severity metric: classic EFL can retain a sharp
// initial spike before the choke-flow limb. Adjacent settings must nevertheless
// remain distinguishable across the early/post-elbow waveform as a whole.
for (let index = 1; index < sweep.length; index += 1) {
  const previous = sweep[index - 1]
  const current = sweep[index]
  const waveformSeparation = Math.max(
    Math.abs(current.peakExpiratoryFlowLMin - previous.peakExpiratoryFlowLMin),
    Math.abs(current.flow250msLMin - previous.flow250msLMin),
    Math.abs(current.flow500msLMin - previous.flow500msLMin),
  )
  assert(
    waveformSeparation >= 2,
    `EFL ${current.level} waveform must remain mechanically distinct from EFL ${previous.level}; largest peak/250/500 ms separation was ${waveformSeparation.toFixed(1)} L/min`,
  )
  assert(
    current.residualVolumeMl + 2 >= previous.residualVolumeMl,
    `EFL ${current.level} must not empty to less residual volume than EFL ${previous.level}`,
  )
}

assert(sweep[1].peakExpiratoryFlowLMin < -50, `EFL 0.25 peak ${sweep[1].peakExpiratoryFlowLMin.toFixed(1)} L/min should remain a mild limitation rather than severe clipping`)
assert(sweep[2].timeTo90PercentEmptyingS != null && sweep[0].timeTo90PercentEmptyingS != null && sweep[2].timeTo90PercentEmptyingS >= sweep[0].timeTo90PercentEmptyingS + 0.05, 'EFL 0.5 must measurably prolong expiratory emptying')
assert(sweep[3].timeTo90PercentEmptyingS != null && sweep[2].timeTo90PercentEmptyingS != null && sweep[3].timeTo90PercentEmptyingS >= sweep[2].timeTo90PercentEmptyingS + 0.2, 'EFL 0.75 must further prolong expiratory emptying')

// Grade marked/severe limitation on the post-elbow limb plus trapped-volume
// phenotype rather than demanding an arbitrary difference in the opening spike.
assert(
  sweep[3].flow250msLMin > sweep[2].flow250msLMin + 5,
  `EFL 0.75 post-elbow flow ${sweep[3].flow250msLMin.toFixed(1)} L/min should be at least 5 L/min less negative than EFL 0.5 (${sweep[2].flow250msLMin.toFixed(1)} L/min)`,
)
assert(
  sweep[4].flow250msLMin > sweep[3].flow250msLMin + 1,
  `EFL 1.0 post-elbow flow ${sweep[4].flow250msLMin.toFixed(1)} L/min should be at least 1 L/min less negative than EFL 0.75 (${sweep[3].flow250msLMin.toFixed(1)} L/min)`,
)

assert(sweep[4].timeTo90PercentEmptyingS == null, 'EFL 1.0 should fail to reach 90% emptying before the next breath in the calibration scenario')
assert(sweep[4].residualVolumeMl > 200, `EFL 1.0 residual volume ${sweep[4].residualVolumeMl.toFixed(0)} mL should demonstrate dynamic hyperinflation`)
assert(sweep[4].intrinsicElasticPressureCmH2O > 3, `EFL 1.0 intrinsic elastic pressure ${sweep[4].intrinsicElasticPressureCmH2O.toFixed(1)} cmH2O should demonstrate auto-PEEP`)
assert(sweep[4].endExpiratoryFlowLMin < -3, `EFL 1.0 end-expiratory flow ${sweep[4].endExpiratoryFlowLMin.toFixed(1)} L/min should remain active at the next breath`)

const copdReference = referenceDiseaseEfl('COPD')
const asthmaReference = referenceDiseaseEfl('Asthma')
for (const [profile, reference] of [['COPD', copdReference], ['Asthma', asthmaReference]] as const) {
  assert(reference.limited, `${profile} default EFL must actively constrain the 500 mL reference expiration`)
  assert(
    Math.abs(reference.limitedFlowLMin) < Math.abs(reference.requestedFlowLMin) * 0.98,
    `${profile} EFL must reduce reference expiratory flow independently of linear Rexp`,
  )
}

console.log('EFL five-level calibration regression checks passed')
console.log(JSON.stringify({
  sweep: sweep.map((metrics) => ({
    level: metrics.level,
    peakExpiratoryFlowLMin: Number(metrics.peakExpiratoryFlowLMin.toFixed(1)),
    flow250msLMin: Number(metrics.flow250msLMin.toFixed(1)),
    flow500msLMin: Number(metrics.flow500msLMin.toFixed(1)),
    flow1000msLMin: Number(metrics.flow1000msLMin.toFixed(1)),
    expiredVtMl: Number(metrics.expiredVtMl.toFixed(0)),
    endExpiratoryFlowLMin: Number(metrics.endExpiratoryFlowLMin.toFixed(1)),
    residualVolumeMl: Number(metrics.residualVolumeMl.toFixed(0)),
    intrinsicElasticPressureCmH2O: Number(metrics.intrinsicElasticPressureCmH2O.toFixed(2)),
    timeTo90PercentEmptyingS: metrics.timeTo90PercentEmptyingS == null ? null : Number(metrics.timeTo90PercentEmptyingS.toFixed(2)),
  })),
  diseaseReferences: {
    copd: { requestedFlowLMin: Number(copdReference.requestedFlowLMin.toFixed(1)), limitedFlowLMin: Number(copdReference.limitedFlowLMin.toFixed(1)) },
    asthma: { requestedFlowLMin: Number(asthmaReference.requestedFlowLMin.toFixed(1)), limitedFlowLMin: Number(asthmaReference.limitedFlowLMin.toFixed(1)) },
  },
}, null, 2))
