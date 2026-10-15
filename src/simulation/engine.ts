import type { Measurements, PatientSettings, Sample, VentilatorMode, VentilatorSettings } from './types'
import { calculateEffectiveDeadSpace } from '../patientMetrics'
import { applyExpiratoryFlowLimitation } from '../expiratoryFlowLimitation'

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

export interface SimulationOptions {
  inspiratoryHoldRequestTime?: number | null
  inspiratoryHoldReleaseTime?: number | null
  expiratoryHoldRequestTime?: number | null
  expiratoryHoldReleaseTime?: number | null
  pressureLimit?: number | null
}

type ActiveBreathType = 'vc' | 'pc' | 'ps' | 'vg-pc' | null

export interface SimulationState {
  lastMode: VentilatorMode | null
  modeStartTime: number
  volume: number
  breathStart: number
  lastAssistedBreath: number
  lastMandatoryBreath: number
  lastBreathEnd: number
  breathActive: boolean
  activeBreathType: ActiveBreathType
  inspiredThisBreath: number
  peakInspiratoryFlow: number
  peakExpiratoryFlowMagnitude: number
  expiratoryTriggerReady: boolean
  triggerDetectedAt: number | null
  inspiratoryHoldActive: boolean
  expiratoryHoldActive: boolean
  previousPmus: number
  effortCycleIndex: number
  breathsDuringEffort: number
  suppressEffortUntil: number
  vgPressureControl: number
  vgSettingPressure: number
  vgBreathNumber: number
  vgTestPlateauPressure: number
  bipapHigh: boolean
  bipapPhaseStart: number
  expirationStartTime: number
  previousPhase: 'inspiration' | 'expiration' | null
  lastInspirationStart: number
  expiredVolumeThisCycle: number
  lastExpiredTidalVolume: number
  lastExpiratoryDuration: number
  estimatedRespiratoryRate: number
  alveolarCo2: number
  airwayCo2: number
  lastExpiratoryFlowTime: number
  alveolarOxygenFraction: number
  spo2: number
}

export function createSimulationState(): SimulationState {
  return {
    lastMode: null,
    modeStartTime: 0,
    volume: 0,
    breathStart: -100,
    lastAssistedBreath: -100,
    lastMandatoryBreath: -100,
    lastBreathEnd: -100,
    breathActive: false,
    activeBreathType: null,
    inspiredThisBreath: 0,
    peakInspiratoryFlow: 0,
    peakExpiratoryFlowMagnitude: 0,
    expiratoryTriggerReady: true,
    triggerDetectedAt: null,
    inspiratoryHoldActive: false,
    expiratoryHoldActive: false,
    previousPmus: 0,
    effortCycleIndex: -1,
    breathsDuringEffort: 0,
    suppressEffortUntil: -100,
    vgPressureControl: 5,
    vgSettingPressure: 40,
    vgBreathNumber: 0,
    vgTestPlateauPressure: 5,
    bipapHigh: true,
    bipapPhaseStart: 0,
    expirationStartTime: -100,
    previousPhase: null,
    lastInspirationStart: -100,
    expiredVolumeThisCycle: 0,
    lastExpiredTidalVolume: 0,
    lastExpiratoryDuration: 2.5,
    estimatedRespiratoryRate: 12,
    alveolarCo2: 40,
    airwayCo2: 0,
    lastExpiratoryFlowTime: -100,
    alveolarOxygenFraction: 0.16,
    spo2: 98,
  }
}

function patientMusclePressure(t: number, patient: PatientSettings): number {
  if (patient.spontaneousRate <= 0 || patient.effort <= 0) return 0
  const cycle = 60 / patient.spontaneousRate
  const phase = ((t % cycle) + cycle) % cycle
  const neuralTi = Math.max(patient.neuralInspiratoryTime, 0.1)
  if (phase >= neuralTi) return 0

  // Active-breathing model: sinusoidal-family Pmus envelope with smooth
  // rise, optional hold, and smooth release. Equal 50% rise / 50% release with
  // zero hold is exactly sin^2(pi*t/Ti). Phase percentages scale with neural Ti.
  let riseTime = neuralTi * clamp(patient.effortRisePercent ?? 30, 1, 95) / 100
  let relaxationTime = neuralTi * clamp(patient.effortRelaxationPercent ?? 35, 1, 95) / 100
  const edgeTime = riseTime + relaxationTime
  if (edgeTime > neuralTi) {
    const scale = neuralTi / edgeTime
    riseTime *= scale
    relaxationTime *= scale
  }
  const relaxationStart = neuralTi - relaxationTime

  if (phase < riseTime) {
    const x = phase / Math.max(riseTime, 0.001)
    const shape = 0.5 - 0.5 * Math.cos(Math.PI * x)
    return patient.effort * shape
  }

  if (phase < relaxationStart) return patient.effort

  const x = (phase - relaxationStart) / Math.max(relaxationTime, 0.001)
  const shape = 0.5 + 0.5 * Math.cos(Math.PI * clamp(x, 0, 1))
  return patient.effort * shape
}

function effectiveRespiratoryRate(state: SimulationState, ventilator: VentilatorSettings, patient: PatientSettings, t: number): number {
  const mandatoryRate = ventilator.mode === 'PSV' ? 0 : Math.max(ventilator.rate, 0)
  const fallback = Math.max(patient.spontaneousRate > 0 ? patient.spontaneousRate : 0, mandatoryRate)
  if (state.lastInspirationStart < -50) return fallback

  const elapsedSinceInspiration = Math.max(0.01, t - state.lastInspirationStart)
  const referenceRate = Math.max(state.estimatedRespiratoryRate, fallback, 0.1)
  const expectedCycle = 60 / referenceRate

  // Once two expected cycles have passed with no inspiration, there is no
  // current alveolar ventilation. An old respiratory rate must not masquerade
  // as ventilation during prolonged apnoea.
  if (elapsedSinceInspiration > Math.max(3, expectedCycle * 2)) return 0

  const rateLimitedByMissedBreath = 60 / elapsedSinceInspiration
  return clamp(Math.min(Math.max(state.estimatedRespiratoryRate, fallback), rateLimitedByMissedBreath), 0, 80)
}

function calculateEffectiveAlveolarVentilation(
  state: SimulationState,
  ventilator: VentilatorSettings,
  patient: PatientSettings,
  t: number,
  _complianceL: number,
): number {
  const fallbackVt = Math.max(ventilator.tidalVolume / 1000, 0.3)
  const tidalVolumeL = state.lastExpiredTidalVolume > 0.02 ? state.lastExpiredTidalVolume : fallbackVt
  const deadSpaceL = calculateEffectiveDeadSpace(patient, tidalVolumeL * 1000).deadSpaceMl / 1000
  const alveolarVolumeL = Math.max(0, tidalVolumeL - deadSpaceL)
  const respiratoryRate = effectiveRespiratoryRate(state, ventilator, patient, t)
  return alveolarVolumeL * respiratoryRate
}

function updateAlveolarCo2(
  state: SimulationState,
  ventilator: VentilatorSettings,
  patient: PatientSettings,
  t: number,
  dt: number,
  complianceL: number,
) {
  const alveolarVentilation = calculateEffectiveAlveolarVentilation(state, ventilator, patient, t, complianceL)
  const vco2 = Math.max(patient.co2Production ?? 250, 0)
  const heightCm = patient.heightCm ?? 170
  const pbw = Math.max(20, (patient.sex === 'female' ? 45.5 : 50) + 0.91 * (heightCm - 152.4))

  // Effective whole-body CO2 capacitance. Dissolved CO2 plus bicarbonate/protein
  // buffering make the physiologic store much larger than the lung gas volume.
  // For teaching, use a deliberately smaller effective buffered store than a
  // full physiologic model: at VCO2 250 mL/min, 0.55 L/kg PBW gives an apnoeic
  // rise of about 6 mmHg/min in a typical adult. VCO2 scales the rise directly.
  const co2BufferCapacityL = Math.max(15, pbw * 0.55)

  // Rearranged alveolar-ventilation equation: at equilibrium,
  // PCO2 = 0.863 * VCO2 / VA. Away from equilibrium, current PCO2 and VA
  // determine CO2 elimination; the buffered store integrates the net balance.
  const eliminatedCo2MlMin = alveolarVentilation * state.alveolarCo2 / 0.863
  const netCo2MlMin = vco2 - eliminatedCo2MlMin
  const changeMmHgPerMinute = 0.863 * netCo2MlMin / co2BufferCapacityL
  state.alveolarCo2 = clamp(state.alveolarCo2 + (changeMmHgPerMinute / 60) * dt, 0, 150)
}

function saturationFromOxygenTension(po2MmHg: number): number {
  const p50 = 26.8
  const hillExponent = 2.7
  const po2 = Math.max(po2MmHg, 1)
  return 100 / (1 + Math.pow(p50 / po2, hillExponent))
}

function oxygenContentForSaturation(saturationPercent: number): number {
  const haemoglobin = 15
  const oxygenCapacity = 1.34 * haemoglobin
  const p50 = 26.8
  const hillExponent = 2.7
  const saturation = clamp(saturationPercent / 100, 0.5, 0.999)
  const po2 = clamp(p50 * Math.pow(saturation / Math.max(1 - saturation, 0.001), 1 / hillExponent), 20, 650)
  return oxygenCapacity * saturation + 0.003 * po2
}

function directSpO2FromAlveolarFraction(alveolarFraction: number, ventilator: VentilatorSettings, patient: PatientSettings): number {
  // Keep oxygenation independent from airway mechanics: shunt is an explicit
  // patient property. Obstruction retains a small V/Q-mismatch penalty, while
  // PEEP can recruit a fraction of shunt only when the lung is relatively
  // non-compliant.
  const obstructionPenalty = clamp((patient.expiratoryResistance - 8) / 32, 0, 1) * 0.018
  const effectiveFraction = clamp(alveolarFraction - obstructionPenalty, 0.01, 0.95)

  // Convert the alveolar oxygen reservoir to an approximate end-capillary PO2
  // and oxygen content. The shunt model then uses a Fick-style oxygen-content
  // balance rather than mixing fixed saturations. This matters when VO2 rises:
  // greater systemic extraction lowers mixed-venous oxygen content, so the same
  // shunt fraction produces a larger arterial oxygen-content penalty.
  const endCapillaryPo2 = clamp(effectiveFraction * 650, 20, 650)
  const ventilatedSaturation = clamp(saturationFromOxygenTension(endCapillaryPo2), 50, 100)

  const baselineShunt = clamp(patient.shuntFraction ?? 0.03, 0, 0.5)
  const recruitability = clamp((60 - patient.compliance) / 45, 0, 1)
  const peepRecruitment = 0.55 * recruitability * clamp((ventilator.peep - 5) / 10, 0, 1)
  const effectiveShunt = baselineShunt * (1 - peepRecruitment)

  const haemoglobin = 15
  const oxygenCapacity = 1.34 * haemoglobin
  const ventilatedContent = oxygenCapacity * (ventilatedSaturation / 100) + 0.003 * endCapillaryPo2

  // EDUVENT does not yet have a cardiovascular model, so use a teaching
  // reference cardiac output of 5 L/min. At VO2 250 mL/min this yields the
  // familiar ~5 mL/dL arteriovenous oxygen-content difference. Combining the
  // classic shunt equation with Fick gives:
  // CaO2 = CcO2 - Qs/(Qt-Qs) * (VO2/CO).
  const referenceCardiacOutputLMin = 5
  const oxygenExtractionMlDl = Math.max(patient.oxygenConsumption ?? 250, 0) / referenceCardiacOutputLMin / 10
  const shuntContentPenalty = effectiveShunt >= 0.999
    ? ventilatedContent
    : (effectiveShunt / Math.max(1 - effectiveShunt, 0.001)) * oxygenExtractionMlDl
  const arterialContent = clamp(ventilatedContent - shuntContentPenalty, oxygenContentForSaturation(50), ventilatedContent)

  // Invert oxygen content numerically to obtain the equivalent arterial
  // saturation, then apply the optional instructor-set SpO2 ceiling. The ceiling
  // is a scenario control, not part of the shunt calculation itself.
  let low = 50
  let high = 100
  for (let iteration = 0; iteration < 24; iteration += 1) {
    const mid = (low + high) / 2
    if (oxygenContentForSaturation(mid) < arterialContent) low = mid
    else high = mid
  }
  const physiologicalSaturation = clamp((low + high) / 2, 50, 100)
  const maxSpO2 = clamp(patient.maxSpO2 ?? 100, 80, 100)
  return Math.min(physiologicalSaturation, maxSpO2)
}

function updateOxygenation(
  state: SimulationState,
  ventilator: VentilatorSettings,
  patient: PatientSettings,
  t: number,
  dt: number,
  _complianceL: number,
) {
  const fallbackVt = Math.max(ventilator.tidalVolume / 1000, 0.3)
  const tidalVolumeL = state.lastExpiredTidalVolume > 0.02 ? state.lastExpiredTidalVolume : fallbackVt
  const deadSpaceL = calculateEffectiveDeadSpace(patient, tidalVolumeL * 1000).deadSpaceMl / 1000
  const alveolarVolumeL = Math.max(0, tidalVolumeL - deadSpaceL)
  const respiratoryRate = effectiveRespiratoryRate(state, ventilator, patient, t)
  const alveolarVentilationLmin = alveolarVolumeL * respiratoryRate

  const frcL = clamp(Math.max(patient.frc ?? 2500, 500) / 1000, 0.5, 8)
  const inspiredOxygenFraction = clamp(ventilator.fio2, 0.21, 1)
  const oxygenConsumptionLs = Math.max(patient.oxygenConsumption ?? 250, 0) / 1000 / 60
  const turnoverPerSecond = alveolarVentilationLmin / 60 / frcL
  const metabolicDepletionPerSecond = oxygenConsumptionLs / frcL

  // Well-mixed FRC reservoir: ventilation washes FAO2 toward FiO2 while VO2
  // continuously removes oxygen. During apnoea the wash-in term approaches zero,
  // so FRC and VO2 naturally determine the speed of desaturation.
  const derivative = turnoverPerSecond * (inspiredOxygenFraction - state.alveolarOxygenFraction) - metabolicDepletionPerSecond
  state.alveolarOxygenFraction = clamp(state.alveolarOxygenFraction + derivative * dt, 0.01, 0.95)

  const targetSpO2 = directSpO2FromAlveolarFraction(state.alveolarOxygenFraction, ventilator, patient)
  const pulseOximeterResponseSeconds = targetSpO2 < state.spo2 ? 2.5 : 4
  const responseFraction = 1 - Math.exp(-dt / pulseOximeterResponseSeconds)
  state.spo2 = clamp(state.spo2 + (targetSpO2 - state.spo2) * responseFraction, 50, 100)
}

function capnogramSourceValue(
  expiratory: boolean,
  elapsedExpiration: number,
  patient: PatientSettings,
  complianceL: number,
  etco2: number,
  deadSpaceVolumeMl: number,
): number {
  if (!expiratory || elapsedExpiration < 0) return 0

  const tau = Math.max(patient.expiratoryResistance * complianceL, 0.05)
  const obstruction = clamp((tau - 0.45) / 1.8, 0, 1)
  const deadSpaceDelay = 0.03 + deadSpaceVolumeMl / 5000 + 0.05 * obstruction
  if (elapsedExpiration <= deadSpaceDelay) return 0

  // The same expiratory time constant that limits CO2 clearance also shapes
  // phase II. A long tau produces the progressively sloping shark-fin pattern.
  const riseTime = clamp(0.14 + 0.42 * tau, 0.16, 1.6)
  const riseProgress = clamp((elapsedExpiration - deadSpaceDelay) / riseTime, 0, 1)
  const normalRise = 1 - Math.pow(1 - riseProgress, 4)
  const obstructedRise = Math.pow(riseProgress, 1.35)
  const riseShape = normalRise * (1 - obstruction) + obstructedRise * obstruction
  const phaseIIEndFraction = 0.88 - 0.12 * obstruction

  if (riseProgress < 1) return clamp(etco2 * phaseIIEndFraction * riseShape, 0, 150)

  const plateauElapsed = elapsedExpiration - deadSpaceDelay - riseTime
  const plateauRise = plateauElapsed * (0.05 + 0.08 * obstruction)
  return clamp(etco2 * Math.min(1, phaseIIEndFraction + plateauRise), 0, 150)
}

function updateAirwayCo2(
  state: SimulationState,
  expiratory: boolean,
  flowLmin: number,
  elapsedExpiration: number,
  patient: PatientSettings,
  complianceL: number,
  t: number,
  dt: number,
  deadSpaceVolumeMl: number,
): number {
  const activeExpiratoryFlow = expiratory && flowLmin < -0.5
  if (activeExpiratoryFlow) state.lastExpiratoryFlowTime = t

  // During an ordinary expiration, do not wash the sampled airway CO2 away just
  // because expiratory flow has fallen below the terminal-flow threshold. Hold
  // the last sampled value for the first 8 seconds of expiration. Only a truly
  // prolonged expiration/apnoeic interval starts the slow no-flow washout.
  if (!activeExpiratoryFlow && expiratory && elapsedExpiration < 8) return state.airwayCo2

  const target = activeExpiratoryFlow
    ? capnogramSourceValue(true, elapsedExpiration, patient, complianceL, state.alveolarCo2, deadSpaceVolumeMl)
    : 0
  const sensorResponseSeconds = activeExpiratoryFlow ? 0.10 : expiratory ? 4.0 : 0.15
  const fraction = 1 - Math.exp(-dt / sensorResponseSeconds)
  state.airwayCo2 = clamp(state.airwayCo2 + (target - state.airwayCo2) * fraction, 0, 150)
  return state.airwayCo2
}

function updateVentilationTracking(state: SimulationState, sample: Sample, t: number, dt: number) {
  const enteringInspiration = sample.phase === 'inspiration' && state.previousPhase !== 'inspiration'
  if (enteringInspiration) {
    if (state.lastInspirationStart > -50) {
      const cycleLength = t - state.lastInspirationStart
      if (cycleLength > 0.2) state.estimatedRespiratoryRate = clamp(60 / cycleLength, 0, 80)
      if (state.expiredVolumeThisCycle > 0.005) state.lastExpiredTidalVolume = state.expiredVolumeThisCycle
      if (state.expirationStartTime > -50) state.lastExpiratoryDuration = Math.max(0.05, t - state.expirationStartTime)
    }
    state.lastInspirationStart = t
    state.expiredVolumeThisCycle = 0
  }

  if (sample.phase === 'expiration') {
    state.expiredVolumeThisCycle += Math.max(0, -sample.flow / 60) * dt
  }
  state.previousPhase = sample.phase
}

function oesophagealPressureValue(
  t: number,
  pmus: number,
  patient: PatientSettings,
  lungVolumeL: number,
): number {
  const heartRate = 80
  const cardiacPhase = 2 * Math.PI * (heartRate / 60) * t
  const cardiacOscillation = 0.45 * Math.sin(cardiacPhase) + 0.18 * Math.sin(2 * cardiacPhase + 0.7)
  const baseline = patient.endExpiratoryOesophagealPressure ?? -5

  // Pes approximates pleural pressure. Positive-pressure ventilation raises Pes
  // as the chest wall is displaced even when the patient makes no inspiratory
  // effort. Keep that passive component separate from Pmus: active inspiratory
  // effort lowers Pes, whereas tidal inflation raises it.
  //
  // Chest-wall compliance is now an explicit patient/scenario property. Keep
  // a PBW-scaled fallback so older saved patients and scenarios remain valid.
  const heightCm = patient.heightCm ?? 170
  const predictedBodyWeightKg = Math.max(
    20,
    (patient.sex === 'female' ? 45.5 : 50) + 0.91 * (heightCm - 152.4),
  )
  const fallbackChestWallCompliance = clamp(predictedBodyWeightKg * 3, 40, 250)
  const chestWallComplianceMlPerCmH2O = clamp(
    patient.chestWallCompliance ?? fallbackChestWallCompliance,
    40,
    400,
  )
  const passiveChestWallPressure = Math.max(0, lungVolumeL * 1000) / chestWallComplianceMlPerCmH2O

  return baseline + passiveChestWallPressure - pmus + cardiacOscillation
}

function isRequestHeld(t: number, requestTime?: number | null, releaseTime?: number | null): boolean {
  if (requestTime == null || t < requestTime) return false
  return releaseTime == null || t < releaseTime
}

function isSimv(mode: VentilatorMode): boolean {
  return mode === 'SIMV-VC' || mode === 'SIMV-PC'
}

function isAssistControl(mode: VentilatorMode): boolean {
  return mode === 'VC-AC' || mode === 'PC-AC' || mode === 'VG-PC'
}

function finishBreath(state: SimulationState, t: number, postCycleReleaseGuard: number) {
  state.breathActive = false
  state.activeBreathType = null
  state.lastBreathEnd = t
  state.expirationStartTime = t
  state.suppressEffortUntil = t + postCycleReleaseGuard
}

function twoLevelPhaseHigh(state: SimulationState, ventilator: VentilatorSettings, t: number): boolean {
  if (state.lastMode === 'BIPAP') return state.bipapHigh
  const tHigh = Math.max(ventilator.tHigh, 0.1)
  const tLow = Math.max(ventilator.tLow, 0.05)
  const cycle = tHigh + tLow
  const elapsed = t - state.modeStartTime
  const phase = ((elapsed % cycle) + cycle) % cycle
  return phase < tHigh
}

function adoptMode(
  state: SimulationState,
  mode: VentilatorMode,
  ventilator: VentilatorSettings,
  t: number,
  mandatoryCycle: number,
  initial = false,
) {
  state.lastMode = mode
  state.modeStartTime = t
  state.expiratoryTriggerReady = true
  state.triggerDetectedAt = null
  state.peakExpiratoryFlowMagnitude = 0
  if (mode === 'BIPAP') {
    state.bipapHigh = true
    state.bipapPhaseStart = t
    state.breathStart = t
  }

  if (initial) {
    state.lastAssistedBreath = t - mandatoryCycle
    state.lastMandatoryBreath = t - mandatoryCycle
  } else {
    const anchor = state.breathStart > -50 ? state.breathStart : t
    if (isAssistControl(mode)) state.lastAssistedBreath = anchor
    if (isSimv(mode)) state.lastMandatoryBreath = anchor
  }

  if (mode === 'VG-PC') {
    state.vgPressureControl = 5
    state.vgSettingPressure = ventilator.volumeGuaranteePressureLimit ?? 40
    state.vgBreathNumber = 0
    state.vgTestPlateauPressure = 5
  }
}

function twoLevelSample(
  state: SimulationState,
  ventilator: VentilatorSettings,
  patient: PatientSettings,
  t: number,
  dt: number,
  pmus: number,
  complianceL: number,
  mode: 'APRV' | 'BIPAP',
): Sample {
  let high: boolean
  let previousHigh: boolean
  let pHigh: number
  let pLow: number
  let breathTrigger: Sample['breathTrigger']
  let ventilatorTriggerDetected = false
  const patientEffortStart = pmus > 0.1 && state.previousPmus <= 0.1

  if (mode === 'BIPAP') {
    previousHigh = state.bipapHigh
    const nominalCycle = 60 / Math.max(ventilator.rate, 1)
    const nominalTi = clamp(
      ventilator.inspiratoryTime,
      0.2,
      Math.max(0.25, nominalCycle - 0.2),
    )
    const nominalTe = Math.max(0.2, nominalCycle - nominalTi)
    const phaseElapsed = Math.max(0, t - state.bipapPhaseStart)
    const elasticPressure = state.volume / complianceL
    const netPatientDrivingPressure = pmus - elasticPressure
    const effortResistance = netPatientDrivingPressure >= 0
      ? Math.max(patient.resistance, 0.5)
      : Math.max(patient.expiratoryResistance, 0.5)
    const patientFlowLmin = (netPatientDrivingPressure / effortResistance) * 60
    const patientAirwayPressure = ventilator.peep - Math.max(0, netPatientDrivingPressure)
    const pressureTriggerLevel = ventilator.peep - Math.max(0.1, ventilator.triggerSensitivity)
    const triggerSignalMet = ventilator.triggerType === 'flow'
      ? patientFlowLmin >= Math.max(0.1, ventilator.flowTriggerSensitivity ?? 2)
      : patientAirwayPressure <= pressureTriggerLevel
    const effortActive = pmus > 0.1
    const effortEnding = !effortActive && state.previousPmus > 0.1

    if (state.bipapHigh) {
      const syncWindow = clamp(nominalTi * 0.25, 0.12, 0.6)
      const syncStart = Math.max(0.2, nominalTi - syncWindow)
      const maximumTi = nominalTi + syncWindow
      const synchronizedCycleOff = phaseElapsed >= syncStart && effortEnding
      const nominalCycleOff = phaseElapsed >= nominalTi && !effortActive
      const forcedCycleOff = phaseElapsed >= maximumTi

      if (synchronizedCycleOff || nominalCycleOff || forcedCycleOff) {
        state.bipapHigh = false
        state.bipapPhaseStart = t
        state.expirationStartTime = t
      }
    } else {
      const syncWindow = clamp(nominalTe * 0.25, 0.12, 0.8)
      const syncStart = Math.max(0.2, nominalTe - syncWindow)
      const synchronizedCycleOn = phaseElapsed >= syncStart && triggerSignalMet
      const mandatoryCycleOn = phaseElapsed >= nominalTe

      if (synchronizedCycleOn || mandatoryCycleOn) {
        ventilatorTriggerDetected = synchronizedCycleOn
        state.bipapHigh = true
        state.bipapPhaseStart = t
        state.breathStart = t
        breathTrigger = synchronizedCycleOn ? 'patient' : 'mandatory'
      }
    }

    high = state.bipapHigh
    pLow = ventilator.peep
    pHigh = ventilator.peep + Math.max(ventilator.pressureControl, 1)
  } else {
    const tHigh = Math.max(ventilator.tHigh, 0.1)
    const tLow = Math.max(ventilator.tLow, 0.05)
    const cycle = tHigh + tLow
    const elapsed = t - state.modeStartTime
    const phase = ((elapsed % cycle) + cycle) % cycle
    const previousPhase = ((((elapsed - dt) % cycle) + cycle) % cycle)
    high = phase < tHigh
    previousHigh = previousPhase < tHigh
    pHigh = Math.max(ventilator.pHigh, ventilator.pLow + 1)
    pLow = Math.min(ventilator.pLow, pHigh - 1)

    if (high && !previousHigh) {
      state.breathStart = t
      breathTrigger = 'mandatory'
    } else if (!high && previousHigh) {
      state.expirationStartTime = t
    }
  }

  const targetPressure = high ? pHigh : pLow
  const elasticPressure = state.volume / complianceL
  const spontaneousPressureDeflection = mode === 'BIPAP'
    ? high
      ? clamp(pmus * 0.35, 0, 6)
      : Math.max(0, pmus - elasticPressure)
    : high
      ? clamp(pmus * 0.35, 0, 6)
      : 0

  const distendingPressure = high ? pHigh - pLow : 0
  const drivingPressure = distendingPressure - elasticPressure + pmus
  const resistance = drivingPressure >= 0
    ? Math.max(patient.resistance, 0.5)
    : Math.max(patient.expiratoryResistance, 0.5)
  const flowLs = drivingPressure / resistance

  state.volume = clamp(state.volume + flowLs * dt, 0, 2.5)

  const flowLmin = flowLs * 60
  const deadSpaceReferenceVtMl = Math.max(state.lastExpiredTidalVolume * 1000, ventilator.tidalVolume, 1)
  const totalDeadSpaceVolumeMl = calculateEffectiveDeadSpace(patient, deadSpaceReferenceVtMl).deadSpaceMl
  const airwayCo2 = updateAirwayCo2(
    state,
    !high,
    flowLmin,
    t - state.expirationStartTime,
    patient,
    complianceL,
    t,
    dt,
    totalDeadSpaceVolumeMl,
  )

  const sample: Sample = {
    time: Number(t.toFixed(4)),
    pressure: clamp(targetPressure - spontaneousPressureDeflection, -5, 80),
    flow: flowLmin,
    volume: state.volume * 1000,
    musclePressure: pmus,
    co2: airwayCo2,
    spo2: state.spo2,
    oesophagealPressure: oesophagealPressureValue(t, pmus, patient, state.volume),
    phase: high ? 'inspiration' : 'expiration',
    mode,
    breathTrigger,
    ventilatorTriggerDetected,
    ventilatorTriggerBaseline: ventilatorTriggerDetected ? pLow : undefined,
    patientEffortStart,
    expiratoryHold: false,
    simvSyncWindow: false,
  }

  state.previousPmus = pmus
  updateVentilationTracking(state, sample, t, dt)
  return sample
}

export function stepSimulation(
  state: SimulationState,
  ventilator: VentilatorSettings,
  patient: PatientSettings,
  t: number,
  dt = 0.01,
  options: SimulationOptions = {},
): Sample {
  const complianceL = Math.max(patient.compliance / 1000, 0.001)
  const mandatoryCycle = 60 / Math.max(ventilator.rate, 1)
  const postCycleReleaseGuard = 0.06

  if (state.lastMode == null) {
    adoptMode(state, ventilator.mode, ventilator, t, mandatoryCycle, true)
  } else if (state.lastMode !== ventilator.mode) {
    let canAdoptMode = !state.breathActive && !state.inspiratoryHoldActive && !state.expiratoryHoldActive
    if (state.lastMode === 'APRV' || state.lastMode === 'BIPAP') canAdoptMode = canAdoptMode && !twoLevelPhaseHigh(state, ventilator, t)
    if (canAdoptMode) adoptMode(state, ventilator.mode, ventilator, t, mandatoryCycle)
  }

  const mode = state.lastMode ?? ventilator.mode

  if (mode === 'VG-PC') {
    const pressureLimit = ventilator.volumeGuaranteePressureLimit ?? 40
    const maximumDrivingPressure = Math.max(0.1, pressureLimit - ventilator.peep)
    const minimumDrivingPressure = Math.min(5, maximumDrivingPressure)
    // Re-clamp continuously so a PEEP or Pmax change cannot transiently push
    // AutoFlow above its pressure ceiling during the current breath.
    state.vgPressureControl = clamp(state.vgPressureControl, minimumDrivingPressure, maximumDrivingPressure)
    state.vgSettingPressure = pressureLimit
  }

  const pmus = patientMusclePressure(t, patient)
  updateAlveolarCo2(state, ventilator, patient, t, dt, complianceL)
  updateOxygenation(state, ventilator, patient, t, dt, complianceL)

  if (mode === 'APRV' || mode === 'BIPAP') {
    const sample = twoLevelSample(state, ventilator, patient, t, dt, pmus, complianceL, mode)
    const pressureLimit = options.pressureLimit == null ? null : clamp(options.pressureLimit, 5, 60)
    if (pressureLimit != null && sample.phase === 'inspiration' && sample.pressure >= pressureLimit) {
      sample.pressure = pressureLimit
      sample.flow = 0
      sample.pressureLimitHit = true
      state.expirationStartTime = t
      if (mode === 'BIPAP') {
        state.bipapHigh = false
        state.bipapPhaseStart = t
      } else {
        // Force APRV into its low-pressure phase on the next simulation step.
        state.modeStartTime = t - Math.max(ventilator.tHigh, 0.1)
      }
    }
    updateVentilationTracking(state, sample, t, dt)
    return sample
  }

  const patientEffortStart = pmus > 0.1 && state.previousPmus <= 0.1
  const spontaneousCycle = patient.spontaneousRate > 0 ? 60 / patient.spontaneousRate : Number.POSITIVE_INFINITY
  const triggerRefractoryPeriod = 0.12
  const triggerResponseDelay = 0.15
  const expiratoryTriggerFraction = 0.25
  const spontaneousCycleIndex = Number.isFinite(spontaneousCycle) ? Math.floor((t + dt * 0.1) / spontaneousCycle) : -1

  if (spontaneousCycleIndex !== state.effortCycleIndex) {
    state.effortCycleIndex = spontaneousCycleIndex
    state.breathsDuringEffort = 0
  }

  const pressureTriggerSensitivity = Math.max(0.1, ventilator.triggerSensitivity)
  const flowTriggerSensitivity = Math.max(0.1, ventilator.flowTriggerSensitivity ?? 2)

  // Predict the patient-generated signal during expiration. Trapped elastic
  // pressure (auto-PEEP) must be overcome before Paw can fall below set PEEP
  // or inspiratory flow can become positive. Pressure sensitivity is therefore
  // explicitly a gradient from set PEEP, not an absolute airway pressure.
  const triggerElasticPressure = state.volume / complianceL
  const triggerNetDrivingPressure = pmus - triggerElasticPressure
  const triggerEffortResistance = triggerNetDrivingPressure >= 0
    ? Math.max(patient.resistance, 0.5)
    : Math.max(patient.expiratoryResistance, 0.5)
  const predictedPatientFlowLs = triggerNetDrivingPressure / triggerEffortResistance
  const predictedPatientFlowLmin = predictedPatientFlowLs * 60
  const predictedAirwayPressure = ventilator.peep - Math.max(0, triggerNetDrivingPressure)
  const pressureTriggerLevel = ventilator.peep - pressureTriggerSensitivity
  const supportTriggeringDisabled =
    (mode === 'PSV' || isSimv(mode)) && ventilator.pressureSupport <= 0.001
  const mandatoryMode = mode !== 'PSV'
  const patientTriggerAllowed =
    !mandatoryMode ||
    state.expiratoryTriggerReady ||
    t - state.lastBreathEnd >= triggerRefractoryPeriod
  const rawTriggerSignalMet = !supportTriggeringDisabled && (ventilator.triggerType === 'flow'
    ? predictedPatientFlowLmin >= flowTriggerSensitivity
    : predictedAirwayPressure <= pressureTriggerLevel)
  const triggerDetectionEligible =
    !state.breathActive &&
    !state.inspiratoryHoldActive &&
    !state.expiratoryHoldActive &&
    patientTriggerAllowed
  let triggerSignalMet = false
  let ventilatorTriggerDetected = false

  if (!triggerDetectionEligible || supportTriggeringDisabled) {
    state.triggerDetectedAt = null
  } else {
    if (rawTriggerSignalMet && state.triggerDetectedAt == null) {
      state.triggerDetectedAt = t
      ventilatorTriggerDetected = true
    }
    triggerSignalMet = state.triggerDetectedAt != null && t - state.triggerDetectedAt >= triggerResponseDelay
  }

  if ((state.breathActive || state.inspiratoryHoldActive) && pmus > 0.1 && state.breathsDuringEffort === 0) {
    state.breathsDuringEffort = 1
  }

  const firstEffortTrigger = triggerSignalMet && state.breathsDuringEffort === 0
  const persistentEffortRetrigger =
    triggerSignalMet &&
    state.breathsDuringEffort > 0 &&
    state.breathsDuringEffort < 2 &&
    t - state.lastBreathEnd >= triggerRefractoryPeriod
  const ongoingEffortAfterGate =
    mandatoryMode &&
    patientTriggerAllowed &&
    triggerSignalMet
  const patientTrigger =
    !state.breathActive &&
    !state.inspiratoryHoldActive &&
    !state.expiratoryHoldActive &&
    patientTriggerAllowed &&
    (firstEffortTrigger || persistentEffortRetrigger || ongoingEffortAfterGate)

  const simvMode = isSimv(mode)
  const assistControlMode = isAssistControl(mode)
  const mandatoryDue = assistControlMode
    ? t - state.lastAssistedBreath >= mandatoryCycle - dt / 2
    : simvMode
      ? t - state.lastMandatoryBreath >= mandatoryCycle - dt / 2
      : false

  const timeToNextSimvBreath = mandatoryCycle - (t - state.lastMandatoryBreath)
  const syncWindowDuration = mandatoryCycle * (clamp(ventilator.simvSyncWindowPercent ?? 25, 5, 75) / 100)
  const simvSyncWindowActive =
    simvMode &&
    !state.breathActive &&
    !state.inspiratoryHoldActive &&
    !state.expiratoryHoldActive &&
    !mandatoryDue &&
    timeToNextSimvBreath >= 0 &&
    timeToNextSimvBreath <= syncWindowDuration

  const synchronizedSimvTrigger = simvSyncWindowActive && patientTrigger
  const mandatoryEvent = mandatoryDue || synchronizedSimvTrigger
  const breathDue = mandatoryEvent || patientTrigger
  const expiratoryHoldRequested = isRequestHeld(t, options.expiratoryHoldRequestTime, options.expiratoryHoldReleaseTime)
  let breathTrigger: Sample['breathTrigger']

  if (
    !state.breathActive &&
    !state.inspiratoryHoldActive &&
    !state.expiratoryHoldActive &&
    expiratoryHoldRequested &&
    breathDue
  ) {
    state.expiratoryHoldActive = true
  } else if (!state.breathActive && !state.inspiratoryHoldActive && !state.expiratoryHoldActive && breathDue) {
    state.breathActive = true
    state.breathStart = t
    state.inspiredThisBreath = 0
    state.peakInspiratoryFlow = 0
    state.peakExpiratoryFlowMagnitude = 0
    state.expiratoryTriggerReady = false
    state.triggerDetectedAt = null

    if (mode === 'VC-AC') state.activeBreathType = 'vc'
    else if (mode === 'PC-AC') state.activeBreathType = 'pc'
    else if (mode === 'VG-PC') state.activeBreathType = 'vg-pc'
    else if (mode === 'SIMV-VC') state.activeBreathType = mandatoryEvent ? 'vc' : 'ps'
    else if (mode === 'SIMV-PC') state.activeBreathType = mandatoryEvent ? 'pc' : 'ps'
    else state.activeBreathType = 'ps'

    if (patientTrigger) {
      breathTrigger = 'patient'
      state.breathsDuringEffort += 1
    } else {
      breathTrigger = 'mandatory'
      if (pmus > 0) state.breathsDuringEffort = Math.max(state.breathsDuringEffort, 1)
    }

    if (assistControlMode) state.lastAssistedBreath = t
    if (simvMode && mandatoryEvent) state.lastMandatoryBreath = t
  }

  const elapsed = t - state.breathStart
  let inspiration = state.breathActive || state.inspiratoryHoldActive
  let flowLs = 0
  let pressure = ventilator.peep
  const inspiratoryHoldRequested = isRequestHeld(t, options.inspiratoryHoldRequestTime, options.inspiratoryHoldReleaseTime)

  if (state.expiratoryHoldActive) {
    inspiration = false
    if (expiratoryHoldRequested) {
      flowLs = 0
      pressure = ventilator.peep + state.volume / complianceL - pmus
    } else {
      state.expiratoryHoldActive = false
    }
  } else if (state.inspiratoryHoldActive) {
    if (inspiratoryHoldRequested) {
      inspiration = true
      flowLs = 0
      pressure = ventilator.peep + state.volume / complianceL - pmus
    } else {
      state.inspiratoryHoldActive = false
      finishBreath(state, t, postCycleReleaseGuard)
      inspiration = false
    }
  } else if (state.breathActive && state.activeBreathType === 'vc') {
    const plateauFraction = clamp(ventilator.plateauPercent ?? 0, 0, 20) / 100
    const targetFlow = Math.max(ventilator.inspiratoryFlow, 1) / 60
    const targetVolume = Math.max(ventilator.tidalVolume / 1000, 0.01)
    // Conventional VC: VT and constant inspiratory flow define flow time.
    // The plateau is added after volume delivery, so Ti cannot independently
    // truncate a volume-controlled breath.
    const flowTime = targetVolume / targetFlow
    const totalInspiratoryTime = flowTime / Math.max(1 - plateauFraction, 0.8)
    const flowPhaseComplete = elapsed >= flowTime || state.inspiredThisBreath >= targetVolume - 1e-6
    const totalInspirationComplete = elapsed >= totalInspiratoryTime

    if (totalInspirationComplete) {
      if (inspiratoryHoldRequested) {
        state.inspiratoryHoldActive = true
        inspiration = true
        flowLs = 0
        pressure = ventilator.peep + state.volume / complianceL - pmus
      } else {
        finishBreath(state, t, postCycleReleaseGuard)
        inspiration = false
      }
    } else if (flowPhaseComplete) {
      flowLs = 0
      pressure = ventilator.peep + state.volume / complianceL - pmus
    } else {
      const remainingVolume = Math.max(0, targetVolume - state.inspiredThisBreath)
      flowLs = Math.min(targetFlow, remainingVolume / Math.max(dt, 0.001))
      const elasticPressure = state.volume / complianceL
      const resistivePressure = patient.resistance * flowLs
      const estimatedPatientFlowDemand = pmus / Math.max(patient.resistance, 0.5)
      const excessDemand = Math.max(0, estimatedPatientFlowDemand - flowLs)
      const starvationFraction = estimatedPatientFlowDemand > 0
        ? clamp(excessDemand / estimatedPatientFlowDemand, 0, 1)
        : 0
      const flowStarvationPressure = pmus * starvationFraction
      pressure = ventilator.peep + elasticPressure + resistivePressure - flowStarvationPressure
    }
  } else if (state.breathActive && state.activeBreathType === 'pc') {
    if (elapsed >= ventilator.inspiratoryTime) {
      if (inspiratoryHoldRequested) {
        state.inspiratoryHoldActive = true
        inspiration = true
        flowLs = 0
        pressure = ventilator.peep + state.volume / complianceL - pmus
      } else {
        finishBreath(state, t, postCycleReleaseGuard)
        inspiration = false
      }
    } else {
      pressure = ventilator.peep + ventilator.pressureControl
      const elasticPressure = state.volume / complianceL
      const availableDrivingPressure = ventilator.pressureControl - elasticPressure + pmus
      flowLs = Math.max(0, availableDrivingPressure / Math.max(patient.resistance, 0.5))
    }
  } else if (state.breathActive && state.activeBreathType === 'vg-pc') {
    const targetVolume = Math.max(ventilator.tidalVolume / 1000, 0.05)
    const pressureLimit = ventilator.volumeGuaranteePressureLimit ?? 40
    const maximumDrivingPressure = Math.max(0.1, pressureLimit - ventilator.peep)
    const minimumDrivingPressure = Math.min(5, maximumDrivingPressure)

    if (state.vgBreathNumber === 0) {
      // Dräger AutoFlow test breath 1: conventional VC with a small plateau.
      // The measured plateau seeds the pressure-controlled test breath.
      const testPlateauFraction = 0.1
      const testFlowTime = Math.max(ventilator.inspiratoryTime * (1 - testPlateauFraction), 0.05)
      const testFlow = targetVolume / testFlowTime
      const flowComplete = elapsed >= testFlowTime || state.inspiredThisBreath >= targetVolume - 1e-6

      if (elapsed >= ventilator.inspiratoryTime) {
        const measuredPlateauDrivingPressure = Math.max(0.1, state.volume / complianceL - pmus)
        state.vgTestPlateauPressure = measuredPlateauDrivingPressure
        state.vgPressureControl = clamp(measuredPlateauDrivingPressure * 0.8, minimumDrivingPressure, Math.min(maximumDrivingPressure, 15))
        state.vgBreathNumber = 1
        finishBreath(state, t, postCycleReleaseGuard)
        inspiration = false
      } else if (flowComplete) {
        flowLs = 0
        pressure = ventilator.peep + state.volume / complianceL - pmus
      } else {
        const remainingVolume = Math.max(0, targetVolume - state.inspiredThisBreath)
        flowLs = Math.min(testFlow, remainingVolume / Math.max(dt, 0.001))
        const elasticPressure = state.volume / complianceL
        const resistivePressure = patient.resistance * flowLs
        pressure = ventilator.peep + elasticPressure + resistivePressure - pmus
      }
    } else {
      // Subsequent breaths are pressure controlled, therefore inspiratory flow
      // decelerates naturally as elastic recoil approaches the pressure target.
      pressure = ventilator.peep + state.vgPressureControl
      const elasticPressure = state.volume / complianceL
      const availableDrivingPressure = state.vgPressureControl - elasticPressure + pmus
      flowLs = Math.max(0, availableDrivingPressure / Math.max(patient.resistance, 0.5))

      const excessiveVolume = state.inspiredThisBreath >= targetVolume * 1.3
      if (excessiveVolume) {
        // AutoFlow volume safeguard: terminate above 130% VT and reduce the
        // next pressure to 75% of the current pressure.
        state.vgPressureControl = clamp(state.vgPressureControl * 0.75, minimumDrivingPressure, Math.min(maximumDrivingPressure, 15))
        state.vgBreathNumber += 1
        finishBreath(state, t, postCycleReleaseGuard)
        inspiration = false
        flowLs = 0
      } else if (elapsed >= ventilator.inspiratoryTime) {
        if (inspiratoryHoldRequested) {
          state.inspiratoryHoldActive = true
          inspiration = true
          flowLs = 0
          pressure = ventilator.peep + state.volume / complianceL - pmus
        } else {
          // Compare delivered inspiratory VT with the set VT. Estimate the
          // pressure needed for the next breath and limit change to +/-3.
          const deliveredVolume = Math.max(state.inspiredThisBreath, 0.001)
          const estimatedTargetPressure = state.vgPressureControl * targetVolume / deliveredVolume
          const pressureAdjustment = clamp(estimatedTargetPressure - state.vgPressureControl, -3, 3)
          state.vgPressureControl = clamp(state.vgPressureControl + pressureAdjustment, minimumDrivingPressure, maximumDrivingPressure)
          state.vgBreathNumber += 1
          finishBreath(state, t, postCycleReleaseGuard)
          inspiration = false
        }
      }
    }
  } else if (state.breathActive && state.activeBreathType === 'ps') {
    pressure = ventilator.peep + ventilator.pressureSupport
    const elasticPressure = state.volume / complianceL
    const availableDrivingPressure = ventilator.pressureSupport - elasticPressure + pmus
    flowLs = Math.max(0, availableDrivingPressure / Math.max(patient.resistance, 0.5))
    state.peakInspiratoryFlow = Math.max(state.peakInspiratoryFlow, flowLs)
    const terminationFraction = clamp(ventilator.terminationSensitivity, 5, 80) / 100
    // At PS = 0 there is no elevated pressure-support level to cycle off.
    // Treat the breath as CPAP after triggering and keep the demand valve at
    // PEEP until inspiratory flow has effectively ended. Applying ETS to the
    // patient's own decelerating flow caused a false early cycle and a second
    // Paw notch while neural inspiration was still active.
    const zeroSupport = ventilator.pressureSupport <= 0.001
    const cycleOff = zeroSupport
      ? elapsed > 0.2 && state.peakInspiratoryFlow > 0.01 && flowLs <= 0.01
      : elapsed > 0.2 && state.peakInspiratoryFlow > 0.01 && flowLs <= state.peakInspiratoryFlow * terminationFraction
    const timeLimit = elapsed >= Math.max(patient.neuralInspiratoryTime * 1.5, 1.5)
    if (cycleOff || timeLimit) {
      // In SIMV, a patient-triggered breath may be pressure supported rather
      // than mandatory. An inspiratory-hold request should still occlude that
      // assisted breath at cycle-off, just as it does for VC/PC mandatory and
      // assist-control breaths. Pure PSV remains excluded by the UI.
      if (inspiratoryHoldRequested && isSimv(mode)) {
        state.inspiratoryHoldActive = true
        inspiration = true
        flowLs = 0
        pressure = ventilator.peep + state.volume / complianceL - pmus
      } else {
        finishBreath(state, t, postCycleReleaseGuard)
        inspiration = false
      }
    }
  }

  let expiratoryFlowLimited = false
  if (!inspiration && !state.expiratoryHoldActive) {
    const tau = Math.max(patient.expiratoryResistance * complianceL, 0.05)
    const requestedPassiveExpiratoryFlow = state.volume > 0 ? -state.volume / tau : 0
    const passiveLimit = applyExpiratoryFlowLimitation(requestedPassiveExpiratoryFlow, state.volume, patient)
    const passiveExpiratoryFlow = passiveLimit.flowLs
    expiratoryFlowLimited = passiveLimit.limited
    const passiveExpiratoryMagnitude = Math.max(0, -passiveExpiratoryFlow)

    if (mandatoryMode) {
      state.peakExpiratoryFlowMagnitude = Math.max(state.peakExpiratoryFlowMagnitude, passiveExpiratoryMagnitude)
      if (
        state.peakExpiratoryFlowMagnitude > 0.005 &&
        passiveExpiratoryMagnitude <= state.peakExpiratoryFlowMagnitude * expiratoryTriggerFraction
      ) {
        state.expiratoryTriggerReady = true
      }
      if (state.volume <= 0.0001) state.expiratoryTriggerReady = true
    }

    const exposePatientEffort = pmus > 0

    if (exposePatientEffort) {
      const elasticPressure = state.volume / complianceL
      const netPatientDrivingPressure = pmus - elasticPressure
      const effortResistance = netPatientDrivingPressure >= 0
        ? Math.max(patient.resistance, 0.5)
        : Math.max(patient.expiratoryResistance, 0.5)

      // Before intrinsic PEEP is overcome, inspiratory effort merely slows
      // expiration. Once it is overcome, flow reverses and Paw falls below
      // set PEEP. Those actual simulated signals are what the selected trigger
      // detector sees.
      const requestedFlow = netPatientDrivingPressure / effortResistance
      const effortLimitedFlow = applyExpiratoryFlowLimitation(requestedFlow, state.volume, patient)
      flowLs = effortLimitedFlow.flowLs
      expiratoryFlowLimited = expiratoryFlowLimited || effortLimitedFlow.limited
      pressure = ventilator.peep - Math.max(0, netPatientDrivingPressure)
    } else {
      flowLs = passiveExpiratoryFlow
      pressure = ventilator.peep
    }
  }

  let pressureLimitHit = false
  const pressureLimit = options.pressureLimit == null ? null : clamp(options.pressureLimit, 5, 60)
  if (pressureLimit != null && inspiration && pressure >= pressureLimit) {
    pressureLimitHit = true
    pressure = pressureLimit
    flowLs = 0
    const activeOrHeldBreath = state.breathActive || state.inspiratoryHoldActive
    state.inspiratoryHoldActive = false
    if (activeOrHeldBreath) finishBreath(state, t, postCycleReleaseGuard)
  }

  const dv = flowLs * dt
  state.volume = clamp(state.volume + dv, 0, 2.5)
  if (inspiration && !state.inspiratoryHoldActive) state.inspiredThisBreath += Math.max(dv, 0)

  // With PS = 0, PSV becomes CPAP (and SIMV has unassisted spontaneous
  // breaths between mandatory breaths): the patient's neural inspiration is
  // still a real respiratory phase, but it must not create a ventilator
  // trigger event or a pressure-supported breath.
  const unassistedSpontaneousInspiration =
    supportTriggeringDisabled &&
    !inspiration &&
    !state.expiratoryHoldActive &&
    pmus > 0.1
  const sampleInspiration = inspiration || unassistedSpontaneousInspiration
  if (supportTriggeringDisabled && pmus <= 0.1 && state.previousPmus > 0.1) {
    state.expirationStartTime = t
  }

  const flowLmin = flowLs * 60
  const deadSpaceReferenceVtMl = Math.max(state.lastExpiredTidalVolume * 1000, ventilator.tidalVolume, 1)
  const totalDeadSpaceVolumeMl = calculateEffectiveDeadSpace(patient, deadSpaceReferenceVtMl).deadSpaceMl
  const airwayCo2 = updateAirwayCo2(
    state,
    !sampleInspiration,
    flowLmin,
    t - state.expirationStartTime,
    patient,
    complianceL,
    t,
    dt,
    totalDeadSpaceVolumeMl,
  )

  const sample: Sample = {
    time: Number(t.toFixed(4)),
    pressure: clamp(pressure, -5, 80),
    flow: flowLmin,
    volume: state.volume * 1000,
    musclePressure: pmus,
    co2: airwayCo2,
    spo2: state.spo2,
    oesophagealPressure: oesophagealPressureValue(t, pmus, patient, state.volume),
    phase: sampleInspiration ? 'inspiration' : 'expiration',
    mode,
    breathTrigger,
    ventilatorTriggerDetected,
    ventilatorTriggerBaseline: ventilatorTriggerDetected ? ventilator.peep : undefined,
    patientEffortStart,
    expiratoryHold: state.expiratoryHoldActive,
    simvSyncWindow: simvSyncWindowActive,
    pressureLimitHit,
    expiratoryFlowLimited,
  }

  state.previousPmus = pmus
  return sample
}

export function advanceSimulation(
  state: SimulationState,
  ventilator: VentilatorSettings,
  patient: PatientSettings,
  startTime: number,
  steps: number,
  dt = 0.01,
  options: SimulationOptions = {},
): Sample[] {
  const samples: Sample[] = []
  for (let index = 0; index < steps; index += 1) {
    const t = startTime + index * dt
    samples.push(stepSimulation(state, ventilator, patient, t, dt, options))
  }
  return samples
}

export function generateWaveforms(
  ventilator: VentilatorSettings,
  patient: PatientSettings,
  duration = 30,
  dt = 0.01,
  options: SimulationOptions = {},
): Sample[] {
  const state = createSimulationState()
  return advanceSimulation(state, ventilator, patient, 0, Math.floor(duration / dt) + 1, dt, options)
}

export function calculateMeasurements(samples: Sample[], ventilator: VentilatorSettings): Measurements {
  const latestMode = samples[samples.length - 1]?.mode ?? ventilator.mode
  const displayedPeep = latestMode === 'APRV' ? ventilator.pLow : ventilator.peep

  if (samples.length === 0) {
    return {
      respiratoryRate: 0,
      tidalVolume: 0,
      minuteVentilation: 0,
      peakPressure: 0,
      meanPressure: 0,
      peep: displayedPeep,
      totalPeep: null,
      autoPeep: null,
    }
  }

  const latestTime = samples[samples.length - 1].time
  const minuteSamples = samples.filter((sample) => sample.time >= latestTime - 60)
  const pressureSamples = samples.filter((sample) => sample.time >= latestTime - 20)

  const starts: number[] = []
  const completedBreaths: Array<{ endTime: number; tidalVolume: number }> = []
  let inBreath = false
  let breathStartVolume = 0
  let maxVolume = 0
  let previousVolume = minuteSamples[0]?.volume ?? 0

  for (const sample of minuteSamples) {
    if (sample.phase === 'inspiration' && !inBreath) {
      inBreath = true
      starts.push(sample.time)
      breathStartVolume = previousVolume
      maxVolume = sample.volume
    }
    if (inBreath) maxVolume = Math.max(maxVolume, sample.volume)
    if (sample.phase === 'expiration' && inBreath) {
      completedBreaths.push({
        endTime: sample.time,
        tidalVolume: Math.max(0, maxVolume - breathStartVolume),
      })
      inBreath = false
    }
    previousVolume = sample.volume
  }

  const intervals = starts.slice(1).map((time, index) => time - starts[index]).filter((value) => value > 0.2)
  const avgInterval = intervals.length ? intervals.reduce((a, b) => a + b, 0) / intervals.length : 0
  const rr = avgInterval > 0 ? 60 / avgInterval : 0
  const recentVolumes = completedBreaths.slice(-4).map((breath) => breath.tidalVolume)
  const vt = recentVolumes.length ? recentVolumes.reduce((a, b) => a + b, 0) / recentVolumes.length : 0

  const minuteStart = Math.max(minuteSamples[0]?.time ?? latestTime, latestTime - 60)
  const minuteDuration = Math.max(0.01, latestTime - minuteStart)

  // Rolling 60-second expired minute ventilation. Integrating expiratory flow
  // rather than summing completed breaths makes the displayed value update
  // smoothly throughout expiration while retaining true expired-volume
  // semantics. Before a full minute of history exists, report the observed
  // expired ventilation normalized to L/min.
  let expiredVolumeLitres = 0
  let pressureTimeIntegral = 0
  for (let index = 1; index < minuteSamples.length; index += 1) {
    const previous = minuteSamples[index - 1]
    const current = minuteSamples[index]
    const sampleDt = Math.max(0, current.time - previous.time)
    const previousExpiredFlow = Math.max(0, -previous.flow) / 60
    const currentExpiredFlow = Math.max(0, -current.flow) / 60
    expiredVolumeLitres += ((previousExpiredFlow + currentExpiredFlow) / 2) * sampleDt
    pressureTimeIntegral += ((previous.pressure + current.pressure) / 2) * sampleDt
  }
  const minuteVentilation = expiredVolumeLitres * (60 / minuteDuration)

  const peakPressure = Math.max(...pressureSamples.map((sample) => sample.pressure))
  // Pmean is a rolling, time-weighted mean Paw over the preceding minute.
  // The long moving window also provides the requested display smoothing.
  const meanPressure = minuteSamples.length > 1
    ? pressureTimeIntegral / minuteDuration
    : (minuteSamples[0]?.pressure ?? 0)

  const expiratoryHoldSamples = (latestMode === 'APRV' || latestMode === 'BIPAP') ? [] : minuteSamples.filter((sample) => sample.expiratoryHold)
  const lastExpiratoryHoldSample = expiratoryHoldSamples[expiratoryHoldSamples.length - 1]
  const totalPeep = lastExpiratoryHoldSample ? lastExpiratoryHoldSample.pressure : null
  const autoPeep = totalPeep == null ? null : Math.max(0, totalPeep - displayedPeep)

  return {
    respiratoryRate: rr,
    tidalVolume: vt,
    minuteVentilation,
    peakPressure,
    meanPressure,
    peep: displayedPeep,
    totalPeep,
    autoPeep,
  }
}
