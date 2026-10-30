import { generateWaveforms } from '../src/simulation/engine'
import type { PatientSettings, Sample, VentilatorSettings } from '../src/simulation/types'

const assert = (condition: boolean, message: string) => {
  if (!condition) throw new Error(`SIMV mechanics regression: ${message}`)
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
  spontaneousRate: 18,
  effort: 8,
  neuralInspiratoryTime: 1,
  effortRisePercent: 30,
  effortRelaxationPercent: 35,
  endExpiratoryOesophagealPressure: -5,
  co2Production: 250,
  vdVt: 0.4,
}

const baseVentilator: VentilatorSettings = {
  mode: 'SIMV-VC',
  fio2: 0.21,
  peep: 5,
  rate: 10,
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

interface BreathWindow {
  startIndex: number
  endIndex: number
  startTime: number
  endTime: number
  samples: Sample[]
  trigger: Sample['breathTrigger']
  syncWindow: boolean
  peakFlow: number
  tidalVolume: number
  mechanicalTi: number
  peakPaw: number
}

function breathStarts(samples: Sample[]): number[] {
  const starts: number[] = []
  for (let index = 0; index < samples.length; index += 1) {
    const current = samples[index]
    const previous = samples[index - 1]
    if (current.phase === 'inspiration' && (index === 0 || previous?.phase !== 'inspiration')) starts.push(index)
  }
  return starts
}

function breathAt(samples: Sample[], startIndex: number): BreathWindow {
  let endIndex = startIndex + 1
  while (endIndex < samples.length && samples[endIndex].phase === 'inspiration') endIndex += 1
  assert(endIndex < samples.length, `breath beginning at ${samples[startIndex].time.toFixed(2)} s must end`)
  const breath = samples.slice(startIndex, endIndex)
  const baselineVolume = samples[Math.max(0, startIndex - 1)].volume
  return {
    startIndex,
    endIndex,
    startTime: samples[startIndex].time,
    endTime: samples[endIndex].time,
    samples: breath,
    trigger: samples[startIndex].breathTrigger,
    syncWindow: Boolean(samples[startIndex].simvSyncWindow),
    peakFlow: Math.max(...breath.map((sample) => sample.flow)),
    tidalVolume: Math.max(...breath.map((sample) => sample.volume)) - baselineVolume,
    mechanicalTi: samples[endIndex].time - samples[startIndex].time,
    peakPaw: Math.max(...breath.map((sample) => sample.pressure)),
  }
}

function findBreathInWindow(samples: Sample[], from: number, to: number): BreathWindow {
  const startIndex = breathStarts(samples).find((index) => samples[index].time >= from && samples[index].time <= to)
  assert(startIndex != null, `expected an inspiration between ${from.toFixed(2)} and ${to.toFixed(2)} s`)
  return breathAt(samples, startIndex!)
}

function countBreathsInWindow(samples: Sample[], from: number, to: number): number {
  return breathStarts(samples).filter((index) => samples[index].time >= from && samples[index].time <= to).length
}

function assertDeceleratingPressureBreath(breath: BreathWindow, label: string) {
  const positiveFlows = breath.samples.map((sample) => sample.flow).filter((flow) => flow > 1)
  assert(positiveFlows.length >= 8, `${label} must contain enough positive-flow samples`)
  const peakIndex = positiveFlows.indexOf(Math.max(...positiveFlows))
  const tail = positiveFlows.slice(Math.max(peakIndex + 1, Math.floor(positiveFlows.length * 0.65)))
  assert(tail.length > 0, `${label} must contain a post-peak flow tail`)
  const tailMean = tail.reduce((sum, value) => sum + value, 0) / tail.length
  assert(tailMean < Math.max(...positiveFlows) * 0.8, `${label} must show decelerating pressure-controlled flow`)
}

interface ModeSummary {
  outsidePsStart: number
  outsidePsTi: number
  outsidePsPeakFlow: number
  nextMandatoryStart: number
  synchronizedStart: number
  synchronizedTi: number
  synchronizedPeakFlow: number
}

function runSimvMode(mode: 'SIMV-VC' | 'SIMV-PC'): ModeSummary {
  const ventilator: VentilatorSettings = { ...baseVentilator, mode }

  // RR 10 -> 6 s mandatory cycle and a 25% sync window -> final 1.5 s.
  // Patient RR 18 -> effort every 3.33 s, so the second effort occurs outside
  // the sync window and must produce a pressure-supported spontaneous breath.
  const outsidePatient = { ...basePatient, spontaneousRate: 18 }
  const outside = generateWaveforms(ventilator, outsidePatient, 7.5, 0.01)
  const psBreath = findBreathInWindow(outside, 3.15, 3.75)
  assert(psBreath.trigger === 'patient', `${mode} spontaneous breath outside sync window must be patient-triggered`)
  assert(!psBreath.syncWindow, `${mode} spontaneous breath at ~3.3 s must be outside the SIMV sync window`)
  assert(psBreath.mechanicalTi >= 0.35 && psBreath.mechanicalTi <= 1.2, `${mode} pressure-supported breath Ti ${psBreath.mechanicalTi.toFixed(2)} s is implausible`)
  assert(psBreath.peakFlow > 15 && psBreath.peakFlow < 100, `${mode} pressure-supported peak flow ${psBreath.peakFlow.toFixed(1)} L/min is implausible`)
  assert(countBreathsInWindow(outside, 3.0, 4.5) === 1, `${mode} one neural effort outside the sync window must not double-trigger`)

  const nextMandatory = findBreathInWindow(outside, 5.85, 6.15)
  assert(nextMandatory.trigger === 'mandatory', `${mode} scheduled breath at 6 s must remain mandatory after an earlier PS breath`)
  assert(!nextMandatory.syncWindow, `${mode} time-triggered mandatory breath must not be labelled as a sync-window breath`)

  if (mode === 'SIMV-VC') {
    assert(approx(nextMandatory.peakFlow, 60, 1.5), `SIMV-VC mandatory flow ${nextMandatory.peakFlow.toFixed(1)} L/min must follow the 60 L/min command`)
    assert(approx(nextMandatory.tidalVolume, 500, 25), `SIMV-VC mandatory VT ${nextMandatory.tidalVolume.toFixed(0)} mL must remain near 500 mL`)
    assert(Math.abs(psBreath.peakFlow - 60) > 5, 'SIMV-VC spontaneous PS breath must not be constrained to the mandatory 60 L/min flow')
  } else {
    assert(nextMandatory.mechanicalTi >= 0.95 && nextMandatory.mechanicalTi <= 1.05, `SIMV-PC mandatory Ti ${nextMandatory.mechanicalTi.toFixed(2)} s must follow the 1.0 s setting`)
    assertDeceleratingPressureBreath(nextMandatory, 'SIMV-PC mandatory breath')
  }

  // Patient RR 12 -> effort every 5 s. The second effort occurs at 5 s,
  // within the final 1.5 s of the 6 s mandatory interval. It must synchronize
  // the mandatory breath early rather than create an extra PS breath.
  const syncPatient = { ...basePatient, spontaneousRate: 12 }
  const synchronized = generateWaveforms(ventilator, syncPatient, 7.2, 0.01)
  const syncBreath = findBreathInWindow(synchronized, 5.0, 5.55)
  assert(syncBreath.trigger === 'patient', `${mode} synchronized mandatory breath should retain patient trigger attribution`)
  assert(syncBreath.syncWindow, `${mode} patient-triggered breath at ~5 s must be marked inside the SIMV sync window`)
  assert(countBreathsInWindow(synchronized, 4.8, 6.3) === 1, `${mode} synchronization must replace, not duplicate, the scheduled 6 s mandatory breath`)

  if (mode === 'SIMV-VC') {
    assert(approx(syncBreath.peakFlow, 60, 1.5), `synchronized SIMV-VC flow ${syncBreath.peakFlow.toFixed(1)} L/min must use mandatory VC mechanics`)
    assert(approx(syncBreath.tidalVolume, 500, 25), `synchronized SIMV-VC VT ${syncBreath.tidalVolume.toFixed(0)} mL must remain near 500 mL`)
  } else {
    assert(syncBreath.mechanicalTi >= 0.95 && syncBreath.mechanicalTi <= 1.05, `synchronized SIMV-PC Ti ${syncBreath.mechanicalTi.toFixed(2)} s must use mandatory PC timing`)
    assertDeceleratingPressureBreath(syncBreath, 'synchronized SIMV-PC breath')
  }

  return {
    outsidePsStart: Number(psBreath.startTime.toFixed(2)),
    outsidePsTi: Number(psBreath.mechanicalTi.toFixed(2)),
    outsidePsPeakFlow: Number(psBreath.peakFlow.toFixed(1)),
    nextMandatoryStart: Number(nextMandatory.startTime.toFixed(2)),
    synchronizedStart: Number(syncBreath.startTime.toFixed(2)),
    synchronizedTi: Number(syncBreath.mechanicalTi.toFixed(2)),
    synchronizedPeakFlow: Number(syncBreath.peakFlow.toFixed(1)),
  }
}

const simvVc = runSimvMode('SIMV-VC')
const simvPc = runSimvMode('SIMV-PC')

console.log('SIMV mechanics regression checks passed')
console.log(JSON.stringify({ simvVc, simvPc }, null, 2))
