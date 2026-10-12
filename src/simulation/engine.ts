import type { Measurements, PatientSettings, Sample, VentilatorSettings } from './types'

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

export interface SimulationOptions {
  inspiratoryHoldRequestTime?: number | null
  inspiratoryHoldReleaseTime?: number | null
  expiratoryHoldRequestTime?: number | null
  expiratoryHoldReleaseTime?: number | null
}

export interface SimulationState {
  volume: number
  breathStart: number
  lastAssistedBreath: number
  lastBreathEnd: number
  breathActive: boolean
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
}

export function createSimulationState(): SimulationState {
  return {
    volume: 0,
    breathStart: -100,
    lastAssistedBreath: -100,
    lastBreathEnd: -100,
    breathActive: false,
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

export function stepSimulation(
  state: SimulationState,
  ventilator: VentilatorSettings,
  patient: PatientSettings,
  t: number,
  dt = 0.01,
  options: SimulationOptions = {},
): Sample {
  const complianceL = Math.max(patient.compliance / 1000, 0.001)
  const spontaneousCycle = patient.spontaneousRate > 0 ? 60 / patient.spontaneousRate : Number.POSITIVE_INFINITY
  const triggerRefractoryPeriod = 0.12
  const postCycleReleaseGuard = 0.06
  const expiratoryTriggerFraction = 0.25
  const pmus = patientMusclePressure(t, patient)
  const spontaneousCycleIndex = Number.isFinite(spontaneousCycle) ? Math.floor((t + dt * 0.1) / spontaneousCycle) : -1

  if (spontaneousCycleIndex !== state.effortCycleIndex) {
    state.effortCycleIndex = spontaneousCycleIndex
    state.breathsDuringEffort = 0
  }

  const mandatoryCycle = 60 / Math.max(ventilator.rate, 1)
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

  const mandatoryMode = ventilator.mode !== 'PSV'
  const patientTriggerAllowed = !mandatoryMode || state.expiratoryTriggerReady
  const ongoingEffortAfterGate = mandatoryMode && state.expiratoryTriggerReady && pmus >= triggerThreshold
  const patientTrigger =
    !state.breathActive &&
    !state.inspiratoryHoldActive &&
    !state.expiratoryHoldActive &&
    patientTriggerAllowed &&
    (thresholdCrossing || persistentEffortRetrigger || ongoingEffortAfterGate)

  const mandatoryDue = mandatoryMode && t - state.lastAssistedBreath >= mandatoryCycle - dt / 2
  const breathDue = mandatoryDue || patientTrigger
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

    if (patientTrigger) {
      breathTrigger = 'patient'
      state.breathsDuringEffort += 1
    } else {
      breathTrigger = 'mandatory'
      if (pmus > 0) state.breathsDuringEffort = Math.max(state.breathsDuringEffort, 1)
    }

    if (mandatoryMode) state.lastAssistedBreath = t
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
      // During a true expiratory occlusion an active inspiratory effort is still
      // transmitted to airway pressure, just as it is during an inspiratory hold.
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
      state.breathActive = false
      inspiration = false
      state.lastBreathEnd = t
      state.suppressEffortUntil = t + postCycleReleaseGuard
    }
  } else if (state.breathActive && ventilator.mode === 'VC-AC') {
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
        state.breathActive = false
        inspiration = false
        state.lastBreathEnd = t
        state.suppressEffortUntil = t + postCycleReleaseGuard
      }
    } else if (flowPhaseComplete) {
      // Automatic end-inspiratory plateau. Total Ti (and therefore I:E) is unchanged;
      // only the flow-delivery portion of inspiration is shortened.
      flowLs = 0
      pressure = ventilator.peep + state.volume / complianceL - pmus
    } else {
      flowLs = targetFlow
      const elasticPressure = state.volume / complianceL
      const resistivePressure = patient.resistance * flowLs
      pressure = ventilator.peep + elasticPressure + resistivePressure - pmus
    }
  } else if (state.breathActive && ventilator.mode === 'PC-AC') {
    if (elapsed >= ventilator.inspiratoryTime) {
      if (inspiratoryHoldRequested) {
        state.inspiratoryHoldActive = true
        inspiration = true
        flowLs = 0
        pressure = ventilator.peep + state.volume / complianceL - pmus
      } else {
        state.breathActive = false
        inspiration = false
        state.lastBreathEnd = t
        state.suppressEffortUntil = t + postCycleReleaseGuard
      }
    } else {
      pressure = ventilator.peep + ventilator.pressureControl
      const elasticPressure = state.volume / complianceL
      const availableDrivingPressure = ventilator.pressureControl - elasticPressure + pmus
      flowLs = Math.max(0, availableDrivingPressure / Math.max(patient.resistance, 0.5))
    }
  } else if (state.breathActive && ventilator.mode === 'PSV') {
    pressure = ventilator.peep + ventilator.pressureSupport
    const elasticPressure = state.volume / complianceL
    const availableDrivingPressure = ventilator.pressureSupport - elasticPressure + pmus
    flowLs = Math.max(0, availableDrivingPressure / Math.max(patient.resistance, 0.5))
    state.peakInspiratoryFlow = Math.max(state.peakInspiratoryFlow, flowLs)
    const terminationFraction = clamp(ventilator.terminationSensitivity, 5, 80) / 100
    const cycleOff = elapsed > 0.2 && state.peakInspiratoryFlow > 0.01 && flowLs <= state.peakInspiratoryFlow * terminationFraction
    const timeLimit = elapsed >= Math.max(patient.neuralInspiratoryTime * 1.5, 1.5)
    if (cycleOff || timeLimit) {
      state.breathActive = false
      inspiration = false
      state.lastBreathEnd = t
      state.suppressEffortUntil = t + postCycleReleaseGuard
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
    breathTrigger,
    expiratoryHold: state.expiratoryHoldActive,
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
  if (samples.length === 0) {
    return {
      respiratoryRate: 0,
      tidalVolume: 0,
      minuteVentilation: 0,
      peakPressure: 0,
      meanPressure: 0,
      peep: ventilator.peep,
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

  const intervals = starts.slice(1).map((t, index) => t - starts[index]).filter((value) => value > 0.2)
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

  const expiratoryHoldSamples = minuteSamples.filter((sample) => sample.expiratoryHold)
  const lastExpiratoryHoldSample = expiratoryHoldSamples[expiratoryHoldSamples.length - 1]
  const totalPeep = lastExpiratoryHoldSample ? lastExpiratoryHoldSample.pressure : null
  const autoPeep = totalPeep == null ? null : Math.max(0, totalPeep - ventilator.peep)

  return {
    respiratoryRate: rr,
    tidalVolume: vt,
    minuteVentilation,
    peakPressure,
    meanPressure,
    peep: ventilator.peep,
    totalPeep,
    autoPeep,
  }
}
