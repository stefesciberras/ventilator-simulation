import { isActionToggleRunning } from '../edusim/actions/ActionRuntime'
import { EDUMON_MONITOR_DISPLAY_ACTION_IDS, isInstructorMonitorDisplayEnabled } from './monitorDisplayActions'
import type { EdumonAlarmLimits } from './alarmDefinitions'

export type EdumonAlarmDisplayParameter = 'invasiveBloodPressure' | 'bis' | 'capnography' | 'temperature'

interface NibpMeasurementSnapshot {
  mean: number
  sequence: number
}

interface NibpAlarmState {
  sequence: number
  low: boolean
  high: boolean
}

let latestNibpMeasurement: NibpMeasurementSnapshot | null = null
let nibpSequence = 0
let resolvedNibpAlarmState: NibpAlarmState = { sequence: 0, low: false, high: false }

/**
 * True only while the corresponding monitor capability is actually displayed.
 * The legacy invasive-BP visibility attribute is also honoured so either UI
 * control can suppress the alarm source.
 */
export function isEdumonAlarmParameterDisplayed(parameter: EdumonAlarmDisplayParameter): boolean {
  if (typeof document === 'undefined') return false

  const actionId = EDUMON_MONITOR_DISPLAY_ACTION_IDS[parameter]
  const capabilityEnabled = isActionToggleRunning(actionId) || isInstructorMonitorDisplayEnabled(actionId)
  if (!capabilityEnabled) return false

  if (parameter === 'invasiveBloodPressure') {
    return document.documentElement.getAttribute('data-edumon-invasive-bp-visible') !== 'false'
  }

  return true
}

/** Record a completed cuff reading. Merely starting a cycle never changes alarm state. */
export function recordNibpMeasurementForAlarms(mean: number): void {
  if (!Number.isFinite(mean)) return
  nibpSequence += 1
  latestNibpMeasurement = { mean, sequence: nibpSequence }
}

/**
 * Resolve NIBP against the limits that are current at the first alarm tick after
 * that measurement. Later alarm-limit edits do not retrospectively re-evaluate
 * the retained cuff value; only the next completed cuff reading can change it.
 */
export function resolveNibpAlarmState(limits: EdumonAlarmLimits): Readonly<NibpAlarmState> {
  const measurement = latestNibpMeasurement
  if (!measurement || measurement.sequence === resolvedNibpAlarmState.sequence) return resolvedNibpAlarmState

  resolvedNibpAlarmState = {
    sequence: measurement.sequence,
    low: measurement.mean < limits.mapLow,
    high: measurement.mean > limits.mapHigh,
  }
  return resolvedNibpAlarmState
}
