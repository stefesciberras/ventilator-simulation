import type { Measurements, PatientSettings, Sample, VentilatorSettings } from './types'

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

function patientMusclePressure(t: number, patient: PatientSettings): number {
  if (patient.spontaneousRate <= 0 || patient.effort <= 0) return 0
  const cycle = 60 / patient.spontaneousRate
  const phase = t % cycle
  if (phase >= patient.inspiratoryTime) return 0
  const x = phase / patient.inspiratoryTime
  return patient.effort * Math.sin(Math.PI * x) ** 2
}

function isPatientTrigger(t: number, dt: number, patient: PatientSettings): boolean {
  if (patient.spontaneousRate <= 0 || patient.effort <= 0) return false
  const cycle = 60 / patient.spontaneousRate
  return (t % cycle) < dt
}

export function generateWaveforms(
  ventilator: VentilatorSettings,
  patient: PatientSettings,
  duration = 30,
  dt = 0.01,
): Sample[] {
  const samples: Sample[] = []
  const complianceL = patient.compliance / 1000
  let volume = 0
  let breathStart = -100
  let lastMandatory = -100
  let breathActive = false
  let inspiredThisBreath = 0

  for (let t = 0; t <= duration; t += dt) {
    const pmus = patientMusclePressure(t, patient)
    const mandatoryCycle = 60 / Math.max(ventilator.rate, 1)
    const mandatoryDue = ventilator.mode !== 'PSV' && t - lastMandatory >= mandatoryCycle - dt / 2
    const patientTrigger = isPatientTrigger(t, dt, patient)
    const triggerAllowed = patient.effort >= ventilator.triggerSensitivity

    if (!breathActive && (mandatoryDue || (patientTrigger && triggerAllowed))) {
      breathActive = true
      breathStart = t
      inspiredThisBreath = 0
      if (mandatoryDue) lastMandatory = t
    }

    const elapsed = t - breathStart
    let inspiration = breathActive
    let flowLs = 0
    let pressure = ventilator.peep

    if (breathActive && ventilator.mode === 'VC-AC') {
      const targetFlow = ventilator.tidalVolume / 1000 / Math.max(ventilator.inspiratoryTime, 0.2)
      if (elapsed >= ventilator.inspiratoryTime || inspiredThisBreath >= ventilator.tidalVolume / 1000) {
        breathActive = false
        inspiration = false
      } else {
        flowLs = targetFlow
        pressure = ventilator.peep + volume / complianceL + patient.resistance * flowLs - pmus
      }
    } else if (breathActive && ventilator.mode === 'PC-AC') {
      if (elapsed >= ventilator.inspiratoryTime) {
        breathActive = false
        inspiration = false
      } else {
        pressure = ventilator.peep + ventilator.pressureControl
        flowLs = (ventilator.pressureControl - volume / complianceL + pmus) / Math.max(patient.resistance, 0.5)
        flowLs = Math.max(0, flowLs)
      }
    } else if (breathActive && ventilator.mode === 'PSV') {
      pressure = ventilator.peep + ventilator.pressureSupport
      flowLs = (ventilator.pressureSupport - volume / complianceL + pmus) / Math.max(patient.resistance, 0.5)
      flowLs = Math.max(0, flowLs)
      const theoreticalPeak = (ventilator.pressureSupport + Math.max(pmus, 0.1)) / Math.max(patient.resistance, 0.5)
      const cycleOff = elapsed > 0.25 && flowLs < theoreticalPeak * 0.25
      const timeLimit = elapsed >= Math.max(patient.inspiratoryTime * 1.5, 1.5)
      if (cycleOff || timeLimit) {
        breathActive = false
        inspiration = false
      }
    }

    if (!inspiration) {
      const tau = Math.max(patient.expiratoryResistance * complianceL, 0.05)
      flowLs = volume > 0 ? -volume / tau : 0
      pressure = ventilator.peep
    }

    const dv = flowLs * dt
    volume = clamp(volume + dv, 0, 2.5)
    if (inspiration) inspiredThisBreath += Math.max(dv, 0)

    samples.push({
      time: Number(t.toFixed(4)),
      pressure: clamp(pressure, -5, 80),
      flow: flowLs * 60,
      volume: volume * 1000,
      musclePressure: pmus,
      phase: inspiration ? 'inspiration' : 'expiration',
    })
  }

  return samples
}

export function calculateMeasurements(samples: Sample[], ventilator: VentilatorSettings): Measurements {
  if (samples.length === 0) {
    return { respiratoryRate: 0, tidalVolume: 0, minuteVentilation: 0, peakPressure: 0, meanPressure: 0, peep: ventilator.peep }
  }

  const starts: number[] = []
  const breathVolumes: number[] = []
  let inBreath = false
  let maxVolume = 0

  for (const sample of samples) {
    if (sample.phase === 'inspiration' && !inBreath) {
      inBreath = true
      starts.push(sample.time)
      maxVolume = sample.volume
    }
    if (inBreath) maxVolume = Math.max(maxVolume, sample.volume)
    if (sample.phase === 'expiration' && inBreath) {
      breathVolumes.push(maxVolume)
      inBreath = false
    }
  }

  const intervals = starts.slice(1).map((t, index) => t - starts[index]).filter((v) => v > 0.2)
  const avgInterval = intervals.length ? intervals.reduce((a, b) => a + b, 0) / intervals.length : 0
  const rr = avgInterval > 0 ? 60 / avgInterval : 0
  const recentVolumes = breathVolumes.slice(-4)
  const vt = recentVolumes.length ? recentVolumes.reduce((a, b) => a + b, 0) / recentVolumes.length : 0
  const peakPressure = Math.max(...samples.map((s) => s.pressure))
  const meanPressure = samples.reduce((sum, s) => sum + s.pressure, 0) / samples.length

  return {
    respiratoryRate: rr,
    tidalVolume: vt,
    minuteVentilation: (rr * vt) / 1000,
    peakPressure,
    meanPressure,
    peep: ventilator.peep,
  }
}
