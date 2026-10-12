import type { Measurements, PatientSettings, Sample, VentilatorSettings } from './types'

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

interface SimulationOptions {
  inspiratoryHoldRequestTime?: number | null
  inspiratoryHoldReleaseTime?: number | null
  expiratoryHoldRequestTime?: number | null
  expiratoryHoldReleaseTime?: number | null
}

function patientMusclePressure(t: number, patient: PatientSettings): number {
  if (patient.spontaneousRate <= 0 || patient.effort <= 0) return 0
  const cycle = 60 / patient.spontaneousRate
  const phase = t % cycle
  const neuralTi = Math.max(patient.neuralInspiratoryTime, 0.1)
  if (phase >= neuralTi) return 0
  const x = phase / neuralTi
  return patient.effort * Math.sin(Math.PI * x) ** 2
}

function isRequestHeld(t: number, requestTime?: number | null, releaseTime?: number | null): boolean {
  if (requestTime == null || t < requestTime) return false
  return releaseTime == null || t < releaseTime
}

export function generateWaveforms(
  ventilator: VentilatorSettings,
  patient: PatientSettings,
  duration = 30,
  dt = 0.01,
  options: SimulationOptions = {},
): Sample[] {
  const samples: Sample[] = []
  const complianceL = patient.compliance / 1000
  const spontaneousCycle = patient.spontaneousRate > 0 ? 60 / patient.spontaneousRate : Number.POSITIVE_INFINITY
  const triggerRefractoryPeriod = 0.12
  const postCycleReleaseGuard = 0.06
  let volume = 0
  let breathStart = -100
  let lastAssistedBreath = -100
  let lastBreathEnd = -100
  let breathActive = false
  let inspiredThisBreath = 0
  let peakInspiratoryFlow = 0
  let inspiratoryHoldActive = false
  let inspiratoryHoldUsed = false
  let expiratoryHoldActive = false
  let expiratoryHoldUsed = false
  let previousPmus = 0
  let effortCycleIndex = -1
  let breathsDuringEffort = 0
  let suppressEffortUntil = -100

  for (let t = 0; t <= duration; t += dt) {
    const pmus = patientMusclePressure(t, patient)
    const spontaneousCycleIndex = Number.isFinite(spontaneousCycle) ? Math.floor((t + dt * 0.1) / spontaneousCycle) : -1

    if (spontaneousCycleIndex !== effortCycleIndex) {
      effortCycleIndex = spontaneousCycleIndex
      breathsDuringEffort = 0
    }

    const mandatoryCycle = 60 / Math.max(ventilator.rate, 1)
    const triggerThreshold = Math.max(0.1, ventilator.triggerSensitivity)

    if ((breathActive || inspiratoryHoldActive) && pmus >= triggerThreshold && breathsDuringEffort === 0) {
      breathsDuringEffort = 1
    }

    const thresholdCrossing = pmus >= triggerThreshold && previousPmus < triggerThreshold
    const persistentEffortRetrigger =
      pmus >= triggerThreshold &&
      breathsDuringEffort > 0 &&
      breathsDuringEffort < 2 &&
      t - lastBreathEnd >= triggerRefractoryPeriod
    const patientTrigger = thresholdCrossing || persistentEffortRetrigger
    const mandatoryDue = ventilator.mode !== 'PSV' && t - lastAssistedBreath >= mandatoryCycle - dt / 2
    const breathDue = mandatoryDue || patientTrigger
    const expiratoryHoldRequested =
      !expiratoryHoldUsed &&
      isRequestHeld(t, options.expiratoryHoldRequestTime, options.expiratoryHoldReleaseTime)
    let breathTrigger: Sample['breathTrigger']

    // Expiratory hold is armed while the button is physically held. It starts at
    // the end of expiration, exactly when the next breath would otherwise begin.
    if (
      !breathActive &&
      !inspiratoryHoldActive &&
      !expiratoryHoldActive &&
      expiratoryHoldRequested &&
      breathDue
    ) {
      expiratoryHoldActive = true
      expiratoryHoldUsed = true
    } else if (!breathActive && !inspiratoryHoldActive && !expiratoryHoldActive && breathDue) {
      breathActive = true
      breathStart = t
      inspiredThisBreath = 0
      peakInspiratoryFlow = 0

      if (patientTrigger) {
        breathTrigger = 'patient'
        breathsDuringEffort += 1
      } else {
        breathTrigger = 'mandatory'
        if (pmus > 0) breathsDuringEffort = Math.max(breathsDuringEffort, 1)
      }

      if (ventilator.mode !== 'PSV') lastAssistedBreath = t
    }

    const elapsed = t - breathStart
    let inspiration = breathActive || inspiratoryHoldActive
    let flowLs = 0
    let pressure = ventilator.peep
    const inspiratoryHoldRequested =
      !inspiratoryHoldUsed &&
      isRequestHeld(t, options.inspiratoryHoldRequestTime, options.inspiratoryHoldReleaseTime)

    if (expiratoryHoldActive) {
      inspiration = false
      if (isRequestHeld(t, options.expiratoryHoldRequestTime, options.expiratoryHoldReleaseTime)) {
        flowLs = 0
        // With zero flow, resistive pressure disappears and Paw equilibrates with
        // alveolar pressure. Residual lung volume above FRC therefore reveals
        // total PEEP = set PEEP + intrinsic PEEP.
        pressure = ventilator.peep + volume / complianceL
      } else {
        expiratoryHoldActive = false
      }
    } else if (inspiratoryHoldActive) {
      if (isRequestHeld(t, options.inspiratoryHoldRequestTime, options.inspiratoryHoldReleaseTime)) {
        inspiration = true
        flowLs = 0
        pressure = ventilator.peep + volume / complianceL - pmus
      } else {
        inspiratoryHoldActive = false
        breathActive = false
        inspiration = false
        lastBreathEnd = t
        suppressEffortUntil = t + postCycleReleaseGuard
      }
    } else if (breathActive && ventilator.mode === 'VC-AC') {
      const targetFlow = Math.max(ventilator.inspiratoryFlow, 1) / 60
      if (elapsed >= ventilator.inspiratoryTime || inspiredThisBreath >= ventilator.tidalVolume / 1000) {
        if (inspiratoryHoldRequested) {
          inspiratoryHoldActive = true
          inspiratoryHoldUsed = true
          inspiration = true
          flowLs = 0
          pressure = ventilator.peep + volume / complianceL - pmus
        } else {
          breathActive = false
          inspiration = false
          lastBreathEnd = t
          suppressEffortUntil = t + postCycleReleaseGuard
        }
      } else {
        flowLs = targetFlow
        // VC must generate whatever airway pressure is required to overcome both
        // the existing elastic recoil (including trapped volume / auto-PEEP) and
        // the resistive pressure at the set flow. As hyperinflation accumulates,
        // peak and mean airway pressure therefore rise.
        const elasticPressure = volume / complianceL
        pressure = ventilator.peep + elasticPressure + patient.resistance * flowLs - pmus
      }
    } else if (breathActive && ventilator.mode === 'PC-AC') {
      if (elapsed >= ventilator.inspiratoryTime) {
        if (inspiratoryHoldRequested) {
          inspiratoryHoldActive = true
          inspiratoryHoldUsed = true
          inspiration = true
          flowLs = 0
          pressure = ventilator.peep + volume / complianceL - pmus
        } else {
          breathActive = false
          inspiration = false
          lastBreathEnd = t
          suppressEffortUntil = t + postCycleReleaseGuard
        }
      } else {
        pressure = ventilator.peep + ventilator.pressureControl
        // In pressure control the available driving pressure is reduced by the
        // elastic recoil already present at the start of the breath. Increasing
        // trapped volume / intrinsic PEEP therefore decreases inspiratory flow and
        // the delivered tidal-volume excursion over successive breaths.
        const elasticPressure = volume / complianceL
        flowLs = (ventilator.pressureControl - elasticPressure + pmus) / Math.max(patient.resistance, 0.5)
        flowLs = Math.max(0, flowLs)
      }
    } else if (breathActive && ventilator.mode === 'PSV') {
      pressure = ventilator.peep + ventilator.pressureSupport
      const elasticPressure = volume / complianceL
      flowLs = (ventilator.pressureSupport - elasticPressure + pmus) / Math.max(patient.resistance, 0.5)
      flowLs = Math.max(0, flowLs)
      peakInspiratoryFlow = Math.max(peakInspiratoryFlow, flowLs)
      const terminationFraction = clamp(ventilator.terminationSensitivity, 5, 80) / 100
      const cycleOff = elapsed > 0.2 && peakInspiratoryFlow > 0.01 && flowLs <= peakInspiratoryFlow * terminationFraction
      const timeLimit = elapsed >= Math.max(patient.neuralInspiratoryTime * 1.5, 1.5)
      if (cycleOff || timeLimit) {
        breathActive = false
        inspiration = false
        lastBreathEnd = t
        suppressEffortUntil = t + postCycleReleaseGuard
      }
    }

    if (!inspiration && !expiratoryHoldActive) {
      const tau = Math.max(patient.expiratoryResistance * complianceL, 0.05)
      // Passive single-compartment expiration. Volume is deliberately NOT reset:
      // inadequate expiratory time leaves trapped volume, so alveolar pressure at
      // end expiration is set PEEP + Vtrapped/C. This is the source of auto-PEEP.
      const passiveExpiratoryFlow = volume > 0 ? -volume / tau : 0
      const exposePatientEffort = pmus > 0 && t >= suppressEffortUntil

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
    volume = clamp(volume + dv, 0, 2.5)
    if (inspiration && !inspiratoryHoldActive) inspiredThisBreath += Math.max(dv, 0)

    samples.push({
      time: Number(t.toFixed(4)),
      pressure: clamp(pressure, -5, 80),
      flow: flowLs * 60,
      volume: volume * 1000,
      musclePressure: pmus,
      phase: inspiration ? 'inspiration' : 'expiration',
      breathTrigger,
      expiratoryHold: expiratoryHoldActive,
    })

    previousPmus = pmus
  }

  return samples
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
      // Tidal volume is the inspiratory excursion above that breath's own
      // end-expiratory lung volume, not the absolute lung volume. This is crucial
      // when dynamic hyperinflation is present.
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
