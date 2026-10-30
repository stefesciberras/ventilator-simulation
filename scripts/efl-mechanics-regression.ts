import { generateWaveforms } from '../src/simulation/engine'
import { PATIENT_PROFILES } from '../src/patientProfiles'
import type { PatientSettings, Sample, VentilatorSettings } from '../src/simulation/types'

const assert = (condition: boolean, message: string) => {
  if (!condition) throw new Error(`EFL mechanics regression: ${message}`)
}

const levels = [0, 0.25, 0.5, 0.75, 1] as const
const dt = 0.01

const ventilator: VentilatorSettings = {
  mode: 'VC-AC',
  fio2: 0.21,
  peep: 5,
  rate: 20,
  tidalVolume: 500,
  inspiratoryTime: 0.5,
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

const sweep = levels.map(measure)

assert(sweep.length === 5, 'five discrete EFL levels must be measured')
assert(sweep[0].peakExpiratoryFlowLMin < -20, 'EFL 0 must allow substantial passive expiratory flow')
assert(sweep[0].residualVolumeMl < 25, `EFL 0 residual volume ${sweep[0].residualVolumeMl.toFixed(0)} mL should approach zero before the next breath`)

console.log('EFL baseline calibration sweep completed')
console.log(JSON.stringify(sweep.map((metrics) => ({
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
})), null, 2))
