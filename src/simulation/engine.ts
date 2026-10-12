import type { Measurements, PatientSettings, Sample, VentilatorMode, VentilatorSettings } from './types'

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

export interface SimulationOptions {
  inspiratoryHoldRequestTime?: number | null
  inspiratoryHoldReleaseTime?: number | null
  expiratoryHoldRequestTime?: number | null
  expiratoryHoldReleaseTime?: number | null
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
  inspiratoryHoldActive: boolean
  expiratoryHoldActive: boolean
  previousPmus: number
  effortCycleIndex: number
  breathsDuringEffort: number
  suppressEffortUntil: number
  vgPressureControl: number
  vgSettingPressure: number
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
    inspiratoryHoldActive: false,
    expiratoryHoldActive: false,
    previousPmus: 0,
    effortCycleIndex: -1,
    breathsDuringEffort: 0,
    suppressEffortUntil: -100,
    vgPressureControl: 15,
    vgSettingPressure: 15,
  }
}

function patientMusclePressure(t: number, patient: PatientSettings): number {
  if (patient.spontaneousRate <= 0 || patient.effort <= 0) return 0
  const cycle = 60 / patient.spontaneousRate
  const phase = ((t % cycle) + cycle) % cycle
  const neuralTi = Math.max(patient.neuralInspiratoryTime, 0.1)
  if (phase >= neuralTi) return 0
  const x = phase / neuralTi
  return patient.effort * Math.sin(Math.PI * x) ** 2
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
  state.suppressEffortUntil = t + postCycleReleaseGuard
}

function twoLevelPhaseHigh(state: SimulationState, ventilator: VentilatorSettings, t: number): boolean {
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
  state.peakExpiratoryFlowMagnitude = 0

  if (initial) {
    state.lastAssistedBreath = t - mandatoryCycle
    state.lastMandatoryBreath = t - mandatoryCycle
  } else {
    const anchor = state.breathStart > -50 ? state.breathStart : t
    if (isAssistControl(mode)) state.lastAssistedBreath = anchor
    if (isSimv(mode)) state.lastMandatoryBreath = anchor
  }

  if (mode === 'VG-PC') {
    state.vgPressureControl = clamp(ventilator.pressureControl, 5, 40)
    state.vgSettingPressure = ventilator.pressureControl
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
  const tHigh = Math.max(ventilator.tHigh, 0.1)
  const tLow = Math.max(ventilator.tLow, 0.05)
  const cycle = tHigh + tLow
  const elapsed = t - state.modeStartTime
  const phase = ((elapsed % cycle) + cycle) % cycle
  const previousPhase = ((((elapsed - dt) % cycle) + cycle) % cycle)
  const high = phase < tHigh
  const previousHigh = previousPhase < tHigh
  const pHigh = Math.max(ventilator.pHigh, ventilator.pLow + 1)
  const pLow = Math.min(ventilator.pLow, pHigh - 1)
  const targetPressure = high ? pHigh : pLow
  const spontaneousPressureDeflection = high ? clamp(pmus * 0.35, 0, 6) : 0

  if (high && !previousHigh) state.breathStart = t

  const distendingPressure = high ? pHigh - pLow : 0
  const elasticPressure = state.volume / complianceL
  const drivingPressure = distendingPressure - elasticPressure + pmus
  const resistance = drivingPressure >= 0 ? Math.max(patient.resistance, 0.5) : Math.max(patient.expiratoryResistance, 0.5)
  const flowLs = drivingPressure / resistance

  state.volume = clamp(state.volume + flowLs * dt, 0, 2.5)
  state.previousPmus = pmus

  return {
    time: Number(t.toFixed(4)),
    pressure: clamp(targetPressure - spontaneousPressureDeflection, -5, 80),
    flow: flowLs * 60,
    volume: state.volume * 1000,
    musclePressure: pmus,
    phase: high ? 'inspiration' : 'expiration',
    mode,
    breathTrigger: high && !previousHigh ? 'mandatory' : undefined,
    expiratoryHold: false,
    simvSyncWindow: false,
  }
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

  if (mode === 'VG-PC' && Math.abs(state.vgSettingPressure - ventilator.pressureControl) > 0.001) {
    state.vgPressureControl = clamp(ventilator.pressureControl, 5, 40)
    state.vgSettingPressure = ventilator.pressureControl
  }

  const pmus = patientMusclePressure(t, patient)

  if (mode === 'APRV' || mode === 'BIPAP') {
    return twoLevelSample(state, ventilator, patient, t, dt, pmus, complianceL, mode)
  }

  const spontaneousCycle = patient.spontaneousRate > 0 ? 60 / patient.spontaneousRate : Number.POSITIVE_INFINITY
  const triggerRefractoryPeriod = 0.12
  const expiratoryTriggerFraction = 0.25
  const spontaneousCycleIndex = Number.isFinite(spontaneousCycle) ? Math.floor((t + dt * 0.1) / spontaneousCycle) : -1

  if (spontaneousCycleIndex !== state.effortCycleIndex) {
    state.effortCycleIndex = spontaneousCycleIndex
    state.breathsDuringEffort = 0
  }

  const triggerThreshold = Math.max(0.1, ventilator.triggerSensitivity)

  if ((state.breathActive || state.inspiratoryHoldActive) && pmus >= triggerThreshold && state.breathsDuringEffort === 0) {
    state.breathsDuringEffort = 1
  }

  const thresholdCrossing = pmus >= triggerThreshold && state.previousPmus < triggerThreshold
  const persistentEffortRetrigger =
    pmus >= triggerThreshold &&
    state.breathsDuringEffort > 0 &&
    state.breathsDuringEffort < 2 &&
    t - state.lastBreathEnd >= triggerRefractoryPeriod

  const mandatoryMode = mode !== 'PSV'
  const patientTriggerAllowed = !mandatoryMode || state.expiratoryTriggerReady
  const ongoingEffortAfterGate = mandatoryMode && state.expiratoryTriggerReady && pmus >= triggerThreshold
  const patientTrigger =
    !state.breathActive &&
    !state.inspiratoryHoldActive &&
    !state.expiratoryHoldActive &&
    patientTriggerAllowed &&
    (thresholdCrossing || persistentEffortRetrigger || ongoingEffortAfterGate)

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
    const flowTime = Math.max(ventilator.inspiratoryTime * (1 - plateauFraction), 0.05)
    const targetFlow = Math.max(ventilator.inspiratoryFlow, 1) / 60
    const targetVolume = ventilator.tidalVolume / 1000
    const flowPhaseComplete = elapsed >= flowTime || state.inspiredThisBreath >= targetVolume
    const totalInspirationComplete = elapsed >= ventilator.inspiratoryTime

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
      flowLs = targetFlow
      const elasticPressure = state.volume / complianceL
      const resistivePressure = patient.resistance * flowLs
      const estimatedPatientFlowDemand = pmus / Math.max(patient.resistance, 0.5)
      const excessDemand = Math.max(0, estimatedPatientFlowDemand - targetFlow)
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
    if (elapsed >= ventilator.inspiratoryTime) {
      if (inspiratoryHoldRequested) {
        state.inspiratoryHoldActive = true
        inspiration = true
        flowLs = 0
        pressure = ventilator.peep + state.volume / complianceL - pmus
      } else {
        const targetVolume = Math.max(ventilator.tidalVolume / 1000, 0.05)
        const volumeErrorFraction = (targetVolume - state.inspiredThisBreath) / targetVolume
        const deadband = 0.03
        let pressureAdjustment = 0
        if (Math.abs(volumeErrorFraction) > deadband) {
          const adjustmentMagnitude = clamp(Math.abs(volumeErrorFraction) * 10, 1, 3)
          pressureAdjustment = Math.sign(volumeErrorFraction) * adjustmentMagnitude
        }
        state.vgPressureControl = clamp(state.vgPressureControl + pressureAdjustment, 5, 40)
        finishBreath(state, t, postCycleReleaseGuard)
        inspiration = false
      }
    } else {
      pressure = ventilator.peep + state.vgPressureControl
      const elasticPressure = state.volume / complianceL
      const availableDrivingPressure = state.vgPressureControl - elasticPressure + pmus
      flowLs = Math.max(0, availableDrivingPressure / Math.max(patient.resistance, 0.5))
    }
  } else if (state.breathActive && state.activeBreathType === 'ps') {
    pressure = ventilator.peep + ventilator.pressureSupport
    const elasticPressure = state.volume / complianceL
    const availableDrivingPressure = ventilator.pressureSupport - elasticPressure + pmus
    flowLs = Math.max(0, availableDrivingPressure / Math.max(patient.resistance, 0.5))
    state.peakInspiratoryFlow = Math.max(state.peakInspiratoryFlow, flowLs)
    const terminationFraction = clamp(ventilator.terminationSensitivity, 5, 80) / 100
    const cycleOff = elapsed > 0.2 && state.peakInspiratoryFlow > 0.01 && flowLs <= state.peakInspiratoryFlow * terminationFraction
    const timeLimit = elapsed >= Math.max(patient.neuralInspiratoryTime * 1.5, 1.5)
    if (cycleOff || timeLimit) {
      finishBreath(state, t, postCycleReleaseGuard)
      inspiration = false
    }
  }

  if (!inspiration && !state.expiratoryHoldActive) {
    const tau = Math.max(patient.expiratoryResistance * complianceL, 0.05)
    const passiveExpiratoryFlow = state.volume > 0 ? -state.volume / tau : 0
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

    const exposePatientEffort =
      pmus > 0 &&
      t >= state.suppressEffortUntil &&
      (!mandatoryMode || state.expiratoryTriggerReady)

    if (exposePatientEffort) {
      const effortFlow = pmus / Math.max(patient.resistance, 0.5)
      flowLs = passiveExpiratoryFlow + effortFlow
      pressure = ventilator.peep - Math.min(pmus, triggerThreshold)
    } else {
      flowLs = passiveExpiratoryFlow
      pressure = ventilator.peep
    }
  }

  const dv = flowLs * dt
  state.volume = clamp(state.volume + dv, 0, 2.5)
  if (inspiration && !state.inspiratoryHoldActive) state.inspiredThisBreath += Math.max(dv, 0)

  const sample: Sample = {
    time: Number(t.toFixed(4)),
    pressure: clamp(pressure, -5, 80),
    flow: flowLs * 60,
    volume: state.volume * 1000,
    musclePressure: pmus,
    phase: inspiration ? 'inspiration' : 'expiration',
    mode,
    breathTrigger,
    expiratoryHold: state.expiratoryHoldActive,
    simvSyncWindow: simvSyncWindowActive,
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
  const displayedPeep = (latestMode === 'APRV' || latestMode === 'BIPAP') ? ventilator.pLow : ventilator.peep

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
  const expiredVolumeLitres = completedBreaths
    .filter((breath) => breath.endTime >= minuteStart)
    .reduce((sum, breath) => sum + breath.tidalVolume / 1000, 0)
  const minuteVentilation = expiredVolumeLitres * (60 / minuteDuration)

  const peakPressure = Math.max(...pressureSamples.map((sample) => sample.pressure))
  const meanPressure = pressureSamples.reduce((sum, sample) => sum + sample.pressure, 0) / Math.max(1, pressureSamples.length)

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
