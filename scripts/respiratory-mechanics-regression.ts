import { generateWaveforms } from '../src/simulation/engine'
import type { PatientSettings, Sample, VentilatorSettings } from '../src/simulation/types'

const assert = (condition: boolean, message: string) => {
  if (!condition) throw new Error(`Respiratory mechanics regression: ${message}`)
}

const approx = (value: number, target: number, tolerance: number) => Math.abs(value - target) <= tolerance

const basePatient: PatientSettings = {
  sex: 'male',
  heightCm: 170,
  oxygenConsumption: 250,
  frc: 2500,
  shuntFraction: 0.03,
  maxSpO2: 100,
  compliance: 50,
  chestWallCompliance: 180,
  resistance: 8,
  expiratoryResistance: 10,
  expiratoryFlowLimitation: 0,
  spontaneousRate: 12,
  effort: 8,
  neuralInspiratoryTime: 1,
  effortRisePercent: 30,
  effortRelaxationPercent: 35,
  endExpiratoryOesophagealPressure: -5,
  co2Production: 250,
  vdVt: 0.4,
}

const baseVentilator: VentilatorSettings = {
  mode: 'PSV',
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
  triggerType: 'pressure',
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

interface BreathMetrics {
  effortStart: number
  triggerDetected: number
  inspirationStart: number
  inspirationEnd: number
  triggerDelay: number
  mechanicalTi: number
  neuralTi: number
  peakFlow: number
  tidalVolume: number
  minimumPreTriggerPaw: number
  peakAssistedPaw: number
}

function firstPatientBreathMetrics(samples: Sample[], neuralTiSetting: number, peep: number): BreathMetrics {
  const effortIndex = samples.findIndex((sample) => sample.patientEffortStart)
  assert(effortIndex >= 0, 'reference PSV scenario must contain a patient effort start')
  const effortStart = samples[effortIndex].time

  const triggerIndex = samples.findIndex((sample, index) => index >= effortIndex && sample.ventilatorTriggerDetected)
  assert(triggerIndex >= 0, 'reference PSV scenario must detect the patient trigger')
  const triggerDetected = samples[triggerIndex].time

  const inspirationIndex = samples.findIndex((sample, index) => index >= triggerIndex && sample.phase === 'inspiration' && sample.breathTrigger === 'patient')
  assert(inspirationIndex >= 0, 'reference PSV scenario must begin a patient-triggered mechanical inspiration')
  const inspirationStart = samples[inspirationIndex].time

  let endIndex = inspirationIndex + 1
  while (endIndex < samples.length && samples[endIndex].phase === 'inspiration') endIndex += 1
  assert(endIndex < samples.length, 'reference PSV breath must cycle back to expiration')
  const inspirationEnd = samples[endIndex].time

  const breath = samples.slice(inspirationIndex, endIndex)
  const baselineVolume = samples[Math.max(0, inspirationIndex - 1)].volume
  const maximumVolume = Math.max(...breath.map((sample) => sample.volume))
  const preTrigger = samples.slice(effortIndex, Math.max(triggerIndex + 1, effortIndex + 1))

  return {
    effortStart,
    triggerDetected,
    inspirationStart,
    inspirationEnd,
    triggerDelay: inspirationStart - effortStart,
    mechanicalTi: inspirationEnd - inspirationStart,
    neuralTi: neuralTiSetting,
    peakFlow: Math.max(...breath.map((sample) => sample.flow)),
    tidalVolume: maximumVolume - baselineVolume,
    minimumPreTriggerPaw: Math.min(...preTrigger.map((sample) => sample.pressure)),
    peakAssistedPaw: Math.max(...breath.map((sample) => sample.pressure)),
  }
}

function measureFirstMandatoryBreath(samples: Sample[]) {
  const start = samples.findIndex((sample) => sample.phase === 'inspiration')
  assert(start >= 0, 'mandatory reference scenario must contain inspiration')
  let end = start + 1
  while (end < samples.length && samples[end].phase === 'inspiration') end += 1
  assert(end < samples.length, 'mandatory reference breath must end')
  const breath = samples.slice(start, end)
  const baselineVolume = samples[Math.max(0, start - 1)].volume
  return {
    samples: breath,
    peakFlow: Math.max(...breath.map((sample) => sample.flow)),
    tidalVolume: Math.max(...breath.map((sample) => sample.volume)) - baselineVolume,
  }
}

// Normal calibration reference: PS 10 / PEEP 5, RR 12, neural Ti 1 s.
const psvSamples = generateWaveforms(baseVentilator, basePatient, 8, 0.01)
const psv = firstPatientBreathMetrics(psvSamples, basePatient.neuralInspiratoryTime, baseVentilator.peep)

assert(psv.triggerDelay >= 0.05 && psv.triggerDelay <= 0.4, `PSV trigger delay ${psv.triggerDelay.toFixed(3)} s is outside 0.05-0.40 s`)
assert(psv.peakFlow > 15 && psv.peakFlow < 100, `PSV peak flow ${psv.peakFlow.toFixed(1)} L/min must remain physiologic and below 100 L/min`)
assert(psv.mechanicalTi >= 0.5 && psv.mechanicalTi <= 1.5, `PSV mechanical Ti ${psv.mechanicalTi.toFixed(2)} s is implausible for neural Ti 1.0 s`)
assert(Math.abs(psv.mechanicalTi - psv.neuralTi) <= 0.6, `PSV mechanical Ti ${psv.mechanicalTi.toFixed(2)} s is too far from neural Ti ${psv.neuralTi.toFixed(2)} s`)
assert(psv.tidalVolume >= 250 && psv.tidalVolume <= 900, `PSV VT ${psv.tidalVolume.toFixed(0)} mL is outside the calibration envelope`)
assert(psv.minimumPreTriggerPaw < baseVentilator.peep - 0.15, 'Pmus must create a visible pre-trigger Paw deflection below PEEP')
assert(psv.peakAssistedPaw > baseVentilator.peep + 5, 'Paw must rise into the assisted pressure range after PSV triggering')

// VC authority regression: patient effort may alter Paw, but not commanded flow or VT.
const vcVentilator: VentilatorSettings = {
  ...baseVentilator,
  mode: 'VC-AC',
  tidalVolume: 500,
  inspiratoryFlow: 60,
  plateauPercent: 0,
  inspiratoryTime: 0.5,
}
const vcPassive = measureFirstMandatoryBreath(generateWaveforms(vcVentilator, { ...basePatient, spontaneousRate: 0, effort: 0 }, 3, 0.01))
const vcEffort = measureFirstMandatoryBreath(generateWaveforms(vcVentilator, basePatient, 3, 0.01))
assert(approx(vcPassive.peakFlow, 60, 1.5), `passive VC peak flow ${vcPassive.peakFlow.toFixed(1)} L/min must track the 60 L/min command`)
assert(approx(vcEffort.peakFlow, 60, 1.5), `effort VC peak flow ${vcEffort.peakFlow.toFixed(1)} L/min must remain flow-authoritative`)
assert(approx(vcPassive.tidalVolume, 500, 20), `passive VC VT ${vcPassive.tidalVolume.toFixed(0)} mL must remain near 500 mL`)
assert(approx(vcEffort.tidalVolume, 500, 20), `effort VC VT ${vcEffort.tidalVolume.toFixed(0)} mL must remain near 500 mL`)

const compareIndex = Math.min(vcPassive.samples.length - 1, vcEffort.samples.length - 1, 25)
assert(compareIndex > 5, 'VC comparison breath must contain enough inspiratory samples')
const passivePaw = vcPassive.samples[compareIndex].pressure
const effortPaw = vcEffort.samples[compareIndex].pressure
assert(effortPaw < passivePaw - 0.5, `VC patient effort must lower Paw at fixed flow (passive ${passivePaw.toFixed(1)}, effort ${effortPaw.toFixed(1)} cmH2O)`)

console.log('Respiratory mechanics regression checks passed')
console.log(JSON.stringify({
  psv: {
    triggerDelay: Number(psv.triggerDelay.toFixed(3)),
    peakFlowLMin: Number(psv.peakFlow.toFixed(1)),
    mechanicalTi: Number(psv.mechanicalTi.toFixed(2)),
    neuralTi: psv.neuralTi,
    tidalVolumeMl: Number(psv.tidalVolume.toFixed(0)),
    minimumPreTriggerPaw: Number(psv.minimumPreTriggerPaw.toFixed(1)),
    peakAssistedPaw: Number(psv.peakAssistedPaw.toFixed(1)),
  },
  vc: {
    passivePeakFlowLMin: Number(vcPassive.peakFlow.toFixed(1)),
    effortPeakFlowLMin: Number(vcEffort.peakFlow.toFixed(1)),
    passiveVtMl: Number(vcPassive.tidalVolume.toFixed(0)),
    effortVtMl: Number(vcEffort.tidalVolume.toFixed(0)),
    passivePawAt250ms: Number(passivePaw.toFixed(1)),
    effortPawAt250ms: Number(effortPaw.toFixed(1)),
  },
}, null, 2))
