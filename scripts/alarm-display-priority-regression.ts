import { selectDisplayedAlarmKey } from '../src/alarms/alarmDisplayPriority'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Alarm display priority regression: ${message}`)
}

const evaluations = [
  { key: 'spo2Low', active: true, priority: 'critical' as const },
  { key: 'tidalVolumeHigh', active: true, priority: 'warning' as const },
]

const lowSpo2ThenHighVt = {
  spo2Low: { activeSince: 1_000, resolvedAt: null },
  tidalVolumeHigh: { activeSince: 2_000, resolvedAt: null },
}

assert(
  selectDisplayedAlarmKey(evaluations, lowSpo2ThenHighVt, new Set(['spo2Low', 'tidalVolumeHigh'])) === 'spo2Low',
  'a newer HIGH TIDAL VOLUME warning must not overwrite an active critical LOW SpO2 alarm',
)

const warningsOnly = [
  { key: 'minuteVentilationHigh', active: true, priority: 'warning' as const },
  { key: 'tidalVolumeHigh', active: true, priority: 'warning' as const },
]
assert(
  selectDisplayedAlarmKey(
    warningsOnly,
    {
      minuteVentilationHigh: { activeSince: 1_000, resolvedAt: null },
      tidalVolumeHigh: { activeSince: 2_000, resolvedAt: null },
    },
    new Set(['minuteVentilationHigh', 'tidalVolumeHigh']),
  ) === 'tidalVolumeHigh',
  'without a critical alarm, the latest active warning must be shown',
)

const twoCritical = [
  { key: 'spo2Low', active: true, priority: 'critical' as const },
  { key: 'pressureLimit', active: true, priority: 'critical' as const },
  { key: 'tidalVolumeHigh', active: true, priority: 'warning' as const },
]
assert(
  selectDisplayedAlarmKey(
    twoCritical,
    {
      spo2Low: { activeSince: 1_000, resolvedAt: null },
      pressureLimit: { activeSince: 3_000, resolvedAt: null },
      tidalVolumeHigh: { activeSince: 4_000, resolvedAt: null },
    },
    new Set(['spo2Low', 'pressureLimit', 'tidalVolumeHigh']),
  ) === 'pressureLimit',
  'when several critical alarms are active, the latest critical alarm must be shown',
)

const resolvedCritical = [
  { key: 'spo2Low', active: false, priority: 'critical' as const },
  { key: 'tidalVolumeHigh', active: true, priority: 'warning' as const },
]
assert(
  selectDisplayedAlarmKey(
    resolvedCritical,
    {
      spo2Low: { activeSince: 1_000, resolvedAt: 2_000 },
      tidalVolumeHigh: { activeSince: 3_000, resolvedAt: null },
    },
    new Set(['spo2Low', 'tidalVolumeHigh']),
  ) === 'tidalVolumeHigh',
  'a resolved critical alarm must not indefinitely block a newer active warning',
)

const latestResolved = [
  { key: 'first', active: false, priority: 'warning' as const },
  { key: 'second', active: false, priority: 'warning' as const },
]
assert(
  selectDisplayedAlarmKey(
    latestResolved,
    {
      first: { activeSince: 1_000, resolvedAt: 2_000 },
      second: { activeSince: 1_500, resolvedAt: 2_500 },
    },
    new Set(['first', 'second']),
  ) === 'second',
  'when only retained resolved alarms are visible, the latest resolved alarm must be shown',
)

console.log('Alarm display priority regression checks passed')
