import type { PatientSettings, Sample, VentilatorSettings } from './simulation/types'
import { calculateEffectiveDeadSpace } from './patientMetrics'

export interface PhysiologicalMeasurements {
  setMinuteVentilation: number | null
  actualMinuteVentilation: number
  totalRespiratoryRate: number
  setRespiratoryRate: number | null
  triggeredRespiratoryRate: number
  inspiratoryResistance: number | null
  expiratoryResistance: number | null
  inspiratoryCompliance: number | null
  expiratoryCompliance: number | null
  inspiratoryTimeConstant: number | null
  expiratoryTimeConstant: number | null
  inspiratoryTime: number | null
  expiratoryTime: number | null
  peakPressure: number | null
  plateauPressure: number | null
  drivingPressure: number | null
  meanPressure: number | null
  measuredPeep: number | null
  autoPeep: number | null
  inspiratoryFlow: number | null
  expiratoryFlow: number | null
  expiratoryFlowLimited: boolean
  inspiredTidalVolume: number | null
  expiredTidalVolume: number | null
  alveolarTidalVolume: number | null
  alveolarMinuteVentilation: number
  totalDeadSpaceVolume: number
  vdVt: number
  endTidalCO2: number | null
  oxygenPercent: number
  oxygenSaturation: number | null
  pesMax: number | null
  pesPlateau: number | null
  pesMin: number | null
  transpulmonaryInspiratory: number | null
  transpulmonaryExpiratory: number | null
}

const mean = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

const median = (values: number[]) => {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

function recentWindow(samples: Sample[], seconds = 60) {
  if (!samples.length) return []
  const latest = samples[samples.length - 1].time
  return samples.filter((sample) => sample.time >= latest - seconds)
}

function measuredTiming(samples: Sample[]) {
  const completed: Array<{ ti: number; te: number }> = []
  let inspirationStart: number | null = null
  let expirationStart: number | null = null

  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1]
    const current = samples[index]
    if (previous.phase === 'expiration' && current.phase === 'inspiration') {
      if (inspirationStart != null && expirationStart != null) {
        const ti = expirationStart - inspirationStart
        const te = current.time - expirationStart
        if (ti > 0.05 && te > 0.05) completed.push({ ti, te })
      }
      inspirationStart = current.time
      expirationStart = null
    } else if (previous.phase === 'inspiration' && current.phase === 'expiration' && inspirationStart != null) {
      expirationStart = current.time
    }
  }

  const recent = completed.slice(-4)
  return {
    inspiratoryTime: mean(recent.map((cycle) => cycle.ti)),
    expiratoryTime: mean(recent.map((cycle) => cycle.te)),
  }
}

function measuredRatesAndVentilation(samples: Sample[]) {
  if (samples.length < 2) return { totalRate: 0, triggeredRate: 0, minuteVentilation: 0 }
  const latest = samples[samples.length - 1].time
  const start = samples[0].time
  const duration = Math.max(1, latest - start)
  let inspirations = 0
  let patientTriggers = 0
  let expiredVolumeLitres = 0

  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1]
    const current = samples[index]
    const dt = Math.max(0, current.time - previous.time)
    if (previous.phase === 'expiration' && current.phase === 'inspiration') inspirations += 1
    if (current.breathTrigger === 'patient') patientTriggers += 1
    const previousExpiredFlow = Math.max(0, -previous.flow) / 60
    const currentExpiredFlow = Math.max(0, -current.flow) / 60
    expiredVolumeLitres += ((previousExpiredFlow + currentExpiredFlow) / 2) * dt
  }

  return {
    totalRate: inspirations * 60 / duration,
    triggeredRate: patientTriggers * 60 / duration,
    minuteVentilation: expiredVolumeLitres * 60 / duration,
  }
}

function measuredInspiratoryMechanics(samples: Sample[]) {
  const passiveExpirationPressures = samples
    .filter((sample) => sample.phase === 'expiration' && sample.musclePressure < 0.1 && Math.abs(sample.flow) < 5)
    .map((sample) => sample.pressure)
  const baselinePressure = median(passiveExpirationPressures)
  if (baselinePressure == null) return { resistance: null, compliance: null }

  const rows: Array<{ volume: number; flow: number; pressure: number }> = []
  let inspirationBaselineVolume: number | null = null
  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1]
    const current = samples[index]
    if (previous.phase === 'expiration' && current.phase === 'inspiration') inspirationBaselineVolume = previous.volume
    if (current.phase !== 'inspiration' || inspirationBaselineVolume == null) continue
    const flow = current.flow / 60
    if (flow <= 0.03) continue
    const volume = Math.max(0, (current.volume - inspirationBaselineVolume) / 1000)
    const pressure = current.pressure - baselinePressure + current.musclePressure
    if (volume < 0.005 || pressure <= 0) continue
    rows.push({ volume, flow, pressure })
  }

  const recentRows = rows.slice(-1200)
  if (recentRows.length < 20) return { resistance: null, compliance: null }

  let vv = 0
  let vf = 0
  let ff = 0
  let vy = 0
  let fy = 0
  for (const row of recentRows) {
    vv += row.volume * row.volume
    vf += row.volume * row.flow
    ff += row.flow * row.flow
    vy += row.volume * row.pressure
    fy += row.flow * row.pressure
  }
  const determinant = vv * ff - vf * vf
  if (Math.abs(determinant) < 1e-8) return { resistance: null, compliance: null }

  const elastance = (vy * ff - fy * vf) / determinant
  const resistance = (fy * vv - vy * vf) / determinant
  if (!Number.isFinite(elastance) || !Number.isFinite(resistance) || elastance <= 0 || resistance <= 0) return { resistance: null, compliance: null }

  const compliance = 1000 / elastance
  return {
    resistance: resistance >= 0.1 && resistance <= 150 ? resistance : null,
    compliance: compliance >= 1 && compliance <= 500 ? compliance : null,
  }
}

function measuredExpiratoryTimeConstant(samples: Sample[]) {
  const estimates = samples
    .filter((sample) => sample.phase === 'expiration' && sample.musclePressure < 0.1 && sample.flow < -1.2 && sample.volume > 20)
    .map((sample) => {
      const volumeLitres = sample.volume / 1000
      const expiratoryFlowLs = -sample.flow / 60
      return volumeLitres / expiratoryFlowLs
    })
    .filter((value) => Number.isFinite(value) && value >= 0.03 && value <= 10)
  return median(estimates.slice(-1000))
}

function expiratoryComplianceFromHold(samples: Sample[], baselinePressure: number | null) {
  if (baselinePressure == null) return null
  const estimates = samples
    .filter((sample) => sample.expiratoryHold && sample.volume > 20)
    .map((sample) => {
      const recoilPressure = sample.pressure - baselinePressure + sample.musclePressure
      return recoilPressure > 0.2 ? sample.volume / recoilPressure : Number.NaN
    })
    .filter((value) => Number.isFinite(value) && value >= 1 && value <= 500)
  return median(estimates)
}

function latestEndExpiratoryVolume(samples: Sample[]): number | null {
  let latest: number | null = null
  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1]
    const current = samples[index]
    if (previous.phase === 'expiration' && current.phase === 'inspiration') {
      latest = Math.max(0, previous.volume)
    }
  }
  return latest
}

function latestCompletedInspiratoryVolume(samples: Sample[]) {
  let startVolume: number | null = null
  let latest: number | null = null
  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1]
    const current = samples[index]
    if (previous.phase === 'expiration' && current.phase === 'inspiration') startVolume = previous.volume
    if (previous.phase === 'inspiration' && current.phase === 'expiration' && startVolume != null) {
      latest = Math.max(0, previous.volume - startVolume)
      startVolume = null
    }
  }
  return latest
}

function latestCompletedExpiredVolume(samples: Sample[]) {
  let startVolume: number | null = null
  let latest: number | null = null
  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1]
    const current = samples[index]
    if (previous.phase === 'inspiration' && current.phase === 'expiration') startVolume = previous.volume
    if (previous.phase === 'expiration' && current.phase === 'inspiration' && startVolume != null) {
      latest = Math.max(0, startVolume - previous.volume)
      startVolume = null
    }
  }
  return latest
}

function measuredEndTidalCO2(samples: Sample[]): number | null {
  if (samples.length < 2) return null
  const terminalFlowThreshold = 0.5
  const latestTime = samples[samples.length - 1].time
  let lastExpiratoryFlowTime: number | null = null
  let terminalCandidate: number | null = null
  let lastCompleted: number | null = null

  for (let index = 0; index < samples.length; index += 1) {
    const current = samples[index]
    const previous = index > 0 ? samples[index - 1] : null
    if (current.phase === 'expiration' && current.flow < -terminalFlowThreshold) {
      lastExpiratoryFlowTime = current.time
      terminalCandidate = current.co2
    }
    if (
      previous && previous.phase === 'expiration' && current.phase === 'expiration' &&
      previous.flow < -terminalFlowThreshold && current.flow >= -terminalFlowThreshold &&
      terminalCandidate != null
    ) lastCompleted = terminalCandidate
    if (previous && previous.phase === 'expiration' && current.phase === 'inspiration' && terminalCandidate != null) {
      lastCompleted = terminalCandidate
      terminalCandidate = null
    }
    if (previous && previous.phase === 'inspiration' && current.phase === 'expiration') terminalCandidate = null
  }

  if (lastExpiratoryFlowTime == null || latestTime - lastExpiratoryFlowTime > 20) return null
  return lastCompleted
}

function waveformMonitorValues(samples: Sample[], ventilator: VentilatorSettings, patient: PatientSettings) {
  const recent = recentWindow(samples, 20)
  const passiveEndExpiration = recent
    .filter((sample) => sample.phase === 'expiration' && Math.abs(sample.flow) < 2 && sample.musclePressure < 0.5)
  const endExpiratoryVolume = latestEndExpiratoryVolume(recent)
  // state.volume is volume above the relaxed volume at set PEEP. Any residual
  // volume carried into the next inspiration therefore represents dynamic
  // hyperinflation. Converting that volume through compliance gives intrinsic
  // PEEP continuously, without depending on a potentially stale prior hold.
  const autoPeep = endExpiratoryVolume == null
    ? null
    : Math.max(0, endExpiratoryVolume / Math.max(patient.compliance, 1))
  const totalPeep = autoPeep == null ? ventilator.peep : ventilator.peep + autoPeep
  const plateauPressure = median(recent
    .filter((sample) => sample.phase === 'inspiration' && Math.abs(sample.flow) < 1 && sample.musclePressure < 0.5)
    .slice(-80)
    .map((sample) => sample.pressure))
  const pesPlateau = median(recent
    .filter((sample) => sample.phase === 'inspiration' && Math.abs(sample.flow) < 1)
    .slice(-80)
    .map((sample) => sample.oesophagealPressure))
  const endExpPes = median(passiveEndExpiration.map((sample) => sample.oesophagealPressure))
  const endTidalCO2 = measuredEndTidalCO2(samples)
  const expiredTidalVolume = latestCompletedExpiredVolume(recent)
  const pesValues = recent.map((sample) => sample.oesophagealPressure)
  const positiveFlows = recent.map((sample) => sample.flow).filter((flow) => flow > 0)
  const negativeFlows = recent.map((sample) => Math.abs(Math.min(0, sample.flow))).filter((flow) => flow > 0)

  return {
    peakPressure: recent.length ? Math.max(...recent.map((sample) => sample.pressure)) : null,
    plateauPressure,
    // Prefer an actual zero-flow plateau when available. Pressure-controlled
    // breaths often have no plateau, so fall back to the elastic VT/C term.
    // In both cases driving pressure is referenced to current total PEEP.
    drivingPressure: plateauPressure != null
      ? plateauPressure - totalPeep
      : expiredTidalVolume != null
        ? expiredTidalVolume / Math.max(patient.compliance, 1)
        : null,
    meanPressure: mean(recent.map((sample) => sample.pressure)),
    measuredPeep: totalPeep,
    autoPeep,
    inspiratoryFlow: positiveFlows.length ? Math.max(...positiveFlows) : null,
    expiratoryFlow: negativeFlows.length ? Math.max(...negativeFlows) : null,
    expiratoryFlowLimited: recent.slice(-500).some((sample) => sample.expiratoryFlowLimited),
    inspiredTidalVolume: latestCompletedInspiratoryVolume(recent),
    expiredTidalVolume,
    endTidalCO2,
    pesMax: pesValues.length ? Math.max(...pesValues) : null,
    pesPlateau,
    pesMin: pesValues.length ? Math.min(...pesValues) : null,
    transpulmonaryInspiratory: plateauPressure != null && pesPlateau != null ? plateauPressure - pesPlateau : null,
    transpulmonaryExpiratory: endExpPes != null ? totalPeep - endExpPes : null,
  }
}

export function calculatePhysiologicalMeasurements(samples: Sample[], ventilator: VentilatorSettings, patient: PatientSettings): PhysiologicalMeasurements {
  const window = recentWindow(samples, 60)
  const rates = measuredRatesAndVentilation(window)
  const timing = measuredTiming(window)
  const inspiratoryMechanics = measuredInspiratoryMechanics(window)
  const expiratoryTimeConstant = measuredExpiratoryTimeConstant(window)
  const baselinePressure = median(window
    .filter((sample) => sample.phase === 'expiration' && sample.musclePressure < 0.1 && Math.abs(sample.flow) < 5)
    .map((sample) => sample.pressure))
  const monitor = waveformMonitorValues(window, ventilator, patient)

  const holdCompliance = expiratoryComplianceFromHold(window, baselinePressure)
  const expiratoryCompliance = holdCompliance ?? inspiratoryMechanics.compliance
  const expiratoryResistance = expiratoryTimeConstant != null && expiratoryCompliance != null
    ? expiratoryTimeConstant / (expiratoryCompliance / 1000)
    : null
  const inspiratoryTimeConstant = inspiratoryMechanics.resistance != null && inspiratoryMechanics.compliance != null
    ? inspiratoryMechanics.resistance * inspiratoryMechanics.compliance / 1000
    : null

  const setRate = ventilator.mode === 'PSV' || ventilator.mode === 'APRV' ? null : ventilator.rate
  const volumeTargeted = ventilator.mode === 'VC-AC' || ventilator.mode === 'SIMV-VC' || ventilator.mode === 'VG-PC'
  const setMinuteVentilation = volumeTargeted && setRate != null ? ventilator.tidalVolume * setRate / 1000 : null
  const deadSpaceReferenceVt = monitor.expiredTidalVolume ?? ventilator.tidalVolume
  const effectiveDeadSpace = calculateEffectiveDeadSpace(patient, deadSpaceReferenceVt)
  const totalDeadSpaceVolume = effectiveDeadSpace.deadSpaceMl
  const alveolarTidalVolume = monitor.expiredTidalVolume == null ? null : Math.max(0, monitor.expiredTidalVolume - totalDeadSpaceVolume)

  // Expired VT already contains the mechanical consequence of interrupted
  // expiration/flow limitation. Applying an additional RC emptying fraction
  // here would count the same loss twice.
  const alveolarMinuteVentilation = alveolarTidalVolume == null
    ? 0
    : Math.max(0, (alveolarTidalVolume / 1000) * rates.totalRate)

  return {
    setMinuteVentilation,
    actualMinuteVentilation: rates.minuteVentilation,
    totalRespiratoryRate: rates.totalRate,
    setRespiratoryRate: setRate,
    triggeredRespiratoryRate: rates.triggeredRate,
    inspiratoryResistance: inspiratoryMechanics.resistance,
    expiratoryResistance,
    inspiratoryCompliance: inspiratoryMechanics.compliance,
    expiratoryCompliance,
    inspiratoryTimeConstant,
    expiratoryTimeConstant,
    inspiratoryTime: timing.inspiratoryTime,
    expiratoryTime: timing.expiratoryTime,
    peakPressure: monitor.peakPressure,
    plateauPressure: monitor.plateauPressure,
    drivingPressure: monitor.drivingPressure,
    meanPressure: monitor.meanPressure,
    measuredPeep: monitor.measuredPeep,
    autoPeep: monitor.autoPeep,
    inspiratoryFlow: monitor.inspiratoryFlow,
    expiratoryFlow: monitor.expiratoryFlow,
    expiratoryFlowLimited: monitor.expiratoryFlowLimited,
    inspiredTidalVolume: monitor.inspiredTidalVolume,
    expiredTidalVolume: monitor.expiredTidalVolume,
    alveolarTidalVolume,
    alveolarMinuteVentilation,
    totalDeadSpaceVolume,
    vdVt: effectiveDeadSpace.vdVt,
    endTidalCO2: monitor.endTidalCO2,
    oxygenPercent: ventilator.fio2 * 100,
    oxygenSaturation: window.length ? window[window.length - 1].spo2 : null,
    pesMax: monitor.pesMax,
    pesPlateau: monitor.pesPlateau,
    pesMin: monitor.pesMin,
    transpulmonaryInspiratory: monitor.transpulmonaryInspiratory,
    transpulmonaryExpiratory: monitor.transpulmonaryExpiratory,
  }
}
