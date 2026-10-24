import {
  DEFAULT_MONITOR_ANAESTHETIC_PHYSIOLOGY_SETTINGS,
  DEFAULT_MONITOR_RESPIRATORY_SETTINGS,
  type AnaestheticDepth,
  type AnaestheticResponseBaseline,
  type MonitorAnaestheticPhysiologySettings,
  type MonitorPatientState,
} from './types'

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

const DEPTH_EFFECTS: Record<AnaestheticDepth, { bp: number; hr: number; rr: number }> = {
  5: { bp: 0, hr: 0, rr: 0 },
  4: { bp: 0.04, hr: 0.015, rr: 0.03 },
  3: { bp: 0.10, hr: 0.04, rr: 0.08 },
  2: { bp: 0.18, hr: 0.07, rr: 0.14 },
  1: { bp: 0.25, hr: 0.10, rr: 0.20 },
}

export function resolvedAnaestheticPhysiology(state: MonitorPatientState): MonitorAnaestheticPhysiologySettings {
  return {
    ...DEFAULT_MONITOR_ANAESTHETIC_PHYSIOLOGY_SETTINGS,
    ...(state.anaestheticPhysiology ?? {}),
  }
}

export function effectiveMacForSensitivity(mac: number, sensitivity: number): number {
  const normalizedSensitivity = clamp(sensitivity, -1, 1)
  return Math.max(0, mac) * (1 + 0.5 * normalizedSensitivity)
}

export function depthFromMac(mac: number, sensitivity: number): AnaestheticDepth {
  const effectiveMac = effectiveMacForSensitivity(mac, sensitivity)
  return clamp(Math.round(5 - (2 * effectiveMac)), 1, 5) as AnaestheticDepth
}

function captureResponseBaseline(state: MonitorPatientState): AnaestheticResponseBaseline {
  const respiratory = {
    ...DEFAULT_MONITOR_RESPIRATORY_SETTINGS,
    ...(state.respiratory ?? {}),
  }
  return {
    heartRate: state.heartRate,
    systolicPressure: state.systolicPressure,
    diastolicPressure: state.diastolicPressure,
    spontaneousRespiratoryRate: respiratory.spontaneousRespiratoryRate,
  }
}

export function anaestheticResponseScale(response: number): number {
  return 1 + (0.4 * clamp(response, -1, 1))
}

export function applyAnaestheticDepthEffects(
  state: MonitorPatientState,
  depth: AnaestheticDepth,
  response: number,
): MonitorPatientState {
  const physiology = resolvedAnaestheticPhysiology(state)
  const respiratory = {
    ...DEFAULT_MONITOR_RESPIRATORY_SETTINGS,
    ...(state.respiratory ?? {}),
  }
  const baseline = physiology.responseBaseline ?? captureResponseBaseline(state)
  const normalizedResponse = clamp(response, -1, 1)

  if (depth === 5) {
    const { responseBaseline: _responseBaseline, ...restPhysiology } = physiology
    return {
      ...state,
      heartRate: baseline.heartRate,
      systolicPressure: baseline.systolicPressure,
      diastolicPressure: baseline.diastolicPressure,
      respiratory: {
        ...respiratory,
        spontaneousRespiratoryRate: baseline.spontaneousRespiratoryRate,
      },
      anaestheticPhysiology: {
        ...restPhysiology,
        anaestheticResponse: normalizedResponse,
        depthOfAnaesthesia: 5,
      },
    }
  }

  const effect = DEPTH_EFFECTS[depth]
  const scale = anaestheticResponseScale(normalizedResponse)
  const bpReduction = clamp(effect.bp * scale, 0, 0.45)
  const hrReduction = clamp(effect.hr * scale, 0, 0.25)
  const rrReduction = clamp(effect.rr * scale, 0, 0.40)

  return {
    ...state,
    heartRate: baseline.heartRate * (1 - hrReduction),
    systolicPressure: baseline.systolicPressure * (1 - bpReduction),
    diastolicPressure: baseline.diastolicPressure * (1 - bpReduction),
    respiratory: {
      ...respiratory,
      spontaneousRespiratoryRate: baseline.spontaneousRespiratoryRate * (1 - rrReduction),
    },
    anaestheticPhysiology: {
      ...physiology,
      anaestheticResponse: normalizedResponse,
      depthOfAnaesthesia: depth,
      responseBaseline: baseline,
    },
  }
}
