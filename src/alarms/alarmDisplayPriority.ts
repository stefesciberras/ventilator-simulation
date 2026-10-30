export type AlarmDisplayPriority = 'warning' | 'critical'

export interface AlarmDisplayEvaluation {
  key: string
  active: boolean
  priority?: AlarmDisplayPriority
  visible?: boolean
}

export interface AlarmDisplayLifecycleEntry {
  activeSince: number | null
  resolvedAt: number | null
}

/**
 * Select the single alarm shown in the shared alarm banner.
 *
 * Normally the most recently activated/resolved visible alarm wins. An active
 * critical alarm always takes precedence over warnings, even if a warning was
 * activated later. If several critical alarms are active, the most recent
 * critical alarm is shown.
 */
export function selectDisplayedAlarmKey(
  evaluations: readonly AlarmDisplayEvaluation[],
  lifecycle: Readonly<Record<string, AlarmDisplayLifecycleEntry | undefined>>,
  visibleKeys: ReadonlySet<string>,
): string | null {
  const candidates = evaluations
    .map((evaluation, index) => {
      const entry = lifecycle[evaluation.key]
      return {
        evaluation,
        index,
        eventTime: entry?.resolvedAt ?? entry?.activeSince ?? Number.NEGATIVE_INFINITY,
      }
    })
    .filter(({ evaluation }) => evaluation.visible !== false && visibleKeys.has(evaluation.key))

  if (!candidates.length) return null

  const activeCritical = candidates.filter(({ evaluation }) =>
    evaluation.active && evaluation.priority === 'critical',
  )
  const pool = activeCritical.length ? activeCritical : candidates

  let selected = pool[0]
  for (const candidate of pool.slice(1)) {
    if (
      candidate.eventTime > selected.eventTime ||
      (candidate.eventTime === selected.eventTime && candidate.index > selected.index)
    ) {
      selected = candidate
    }
  }

  return selected.evaluation.key
}
