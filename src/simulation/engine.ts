import type { Measurements, PatientSettings, Sample, VentilatorSettings } from './types'

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

interface SimulationOptions {
  inspiratoryHoldRequestTime?: number | null
  inspiratoryHoldDuration?: number
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

export function generateWaveforms(
  ventilator: VentilatorSettings,
  patient: PatientSettings,
  duration = 30,
  dt = 0.01,
  options: SimulationOptions = {},
): Sample[] {
  const samples: Sample[] = []
  const complianceL = patient.compliance / 1000
  const holdDuration = Math.max(0.2, options.inspiratoryHoldDuration ?? 2)
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
  let holdActive = false
  let holdUntil = -1
  let holdUsed = false
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
    const mandatoryDue = ventilator.mode !== 'PSV' && t - lastAssistedBreath >= mandatoryCycle - dt / 2
    const triggerThreshold = Math.max(0.1, ventilator.triggerSensitivity)

    if ((breathActive || holdActive) && pmus >= triggerThreshold && breathsDuringEffort === 0) {
      breathsDuringEffort = 1
    }

    const thresholdCrossing = pmus >= triggerThreshold && previousPmus < triggerThreshold
    const persistentEffortRetrigger =
      pmus >= triggerThreshold &&
      breathsDuringEffort > 0 &&
      breathsDuringEffort < 2 &&
      t - lastBreathEnd >= triggerRefractoryPeriod
    const patientTrigger = thresholdCrossing || persistentEffortRetrigger
    let breathTrigger: Sample['breathTrigger']

    if (!breathActive && !holdActive && (mandatoryDue || patientTrigger)) {
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
    let inspiration = breathActive || holdActive
    let flowLs = 0
    let pressure = ventilator.peep
    const holdRequested = options.inspiratoryHoldRequestTime != null && !holdUsed && t >= options.inspiratoryHoldRequestTime

    if (holdActive) {
      if (t < holdUntil) {
        inspiration = true
        flowLs = 0
        pressure = ventilator.peep + volume / complianceL - pmus
      } else {
        holdActive = false
        breathActive = false
        inspiration = false
        lastBreathEnd = t
        suppressEffortUntil = t + postCycleReleaseGuard
      }
    } else if (breathActive && ventilator.mode === 'VC-AC') {
      const targetFlow = Math.max(ventilator.inspiratoryFlow, 1) / 60
      if (elapsed >= ventilator.inspiratoryTime || inspiredThisBreath >= ventilator.tidalVolume / 1000) {
        if (holdRequested) {
          holdActive = true
          holdUsed = true
          holdUntil = t + holdDuration
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
        pressure = ventilator.peep + volume / complianceL + patient.resistance * flowLs - pmus
      }
    } else if (breathActive && ventilator.mode === 'PC-AC') {
      if (elapsed >= ventilator.inspiratoryTime) {
        if (holdRequested) {
          holdActive = true
          holdUsed = true
          holdUntil = t + holdDuration
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
        flowLs = (ventilator.pressureControl - volume / complianceL + pmus) / Math.max(patient.resistance, 0.5)
        flowLs = Math.max(0, flowLs)
      }
    } else if (breathActive && ventilator.mode === 'PSV') {
      pressure = ventilator.peep + ventilator.pressureSupport
      flowLs = (ventilator.pressureSupport - volume / complianceL + pmus) / Math.max(patient.resistance, 0.5)
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

    if (!inspiration) {
      const tau = Math.max(patient.expiratoryResistance * complianceL, 0.05)
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
    if (inspiration && !holdActive) inspiredThisBreath += Math.max(dv, 0)

    samples.push({
      time: Number(t.toFixed(4)),
      pressure: clamp(pressure, -5, 80),
      flow: flowLs * 60,
      volume: volume * 1000,
      musclePressure: pmus,
      phase: inspiration ? 'inspiration' : 'expiration',
      breathTrigger,
    })

    previousPmus = pmus
  }

  return samples
}

export function calculateMeasurements(samples: Sample[], ventilator: VentilatorSettings): Measurements {
  if (samples.length === 0) {
    return { respiratoryRate: 0, tidalVolume: 0, minuteVentilation: 0, peakPressure: 0, meanPressure: 0, peep: ventilator.peep }
  }

  const latestTime = samples[samples.length - 1].time
  const minuteSamples = samples.filter((sample) => sample.time >= latestTime - 60)
  const pressureSamples = samples.filter((sample) => sample.time >= latestTime - 20)

  const starts: number[] = []
  const completedBreaths: Array<{ endTime: number; volume: number }> = []
  let inBreath = false
  let maxVolume = 0

  for (const sample of minuteSamples) {
    if (sample.phase === 'inspiration' && !inBreath) {
      inBreath = true
      starts.push(sample.time)
      maxVolume = sample.volume
    }
    if (inBreath) maxVolume = Math.max(maxVolume, sample.volume)
    if (sample.phase === 'expiration' && inBreath) {
      completedBreaths.push({ endTime: sample.time, volume: maxVolume })
      inBreath = false
    }
  }

  const intervals = starts.slice(1).map((t, index) => t - starts[index]).filter((value) => value > 0.2)
  const avgInterval = intervals.length ? intervals.reduce((a, b) => a + b, 0) / intervals.length : 0
  const rr = avgInterval > 0 ? 60 / avgInterval : 0
  const recentVolumes = completedBreaths.slice(-4).map((breath) => breath.volume)
  const vt = recentVolumes.length ? recentVolumes.reduce((a, b) => a + b, 0) / recentVolumes.length : 0

  const minuteStart = Math.max(minuteSamples[0]?.time ?? latestTime, latestTime - 60)
  const minuteDuration = Math.max(0.01, latestTime - minuteStart)
  const expiredVolumeLitres = completedBreaths
    .filter((breath) => breath.endTime >= minuteStart)
    .reduce((sum, breath) => sum + breath.volume / 1000, 0)
  const minuteVentilation = expiredVolumeLitres * (60 / minuteDuration)

  const peakPressure = Math.max(...pressureSamples.map((sample) => sample.pressure))
  const meanPressure = pressureSamples.reduce((sum, sample) => sum + sample.pressure, 0) / Math.max(1, pressureSamples.length)

  return {
    respiratoryRate: rr,
    tidalVolume: vt,
    minuteVentilation,
    peakPressure,
    meanPressure,
    peep: ventilator.peep,
  }
}
