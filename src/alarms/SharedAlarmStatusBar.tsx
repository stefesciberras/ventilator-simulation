import type { SharedAlarmDisplayLevel } from './useSharedAlarmController'
import { SharedAlarmBanner } from './SharedAlarmBanner'

export function SharedAlarmStatusBar({
  level,
  labels,
  silenced,
  limitsDisabled = false,
  limitsDisabledTitle = 'Alarm limits controlled by instructor',
  onOpenLimits,
}: {
  level: SharedAlarmDisplayLevel
  labels: readonly string[]
  silenced: boolean
  limitsDisabled?: boolean
  limitsDisabledTitle?: string
  onOpenLimits: () => void
}) {
  return (
    <div className="alarm-row shared-alarm-status-bar">
      <div className="alarm-slot" aria-live="polite">
        <SharedAlarmBanner level={level} labels={labels} silenced={silenced} />
      </div>
      <button
        className="mobile-alarm-limits-button shared-alarm-limits-button"
        type="button"
        disabled={limitsDisabled}
        onClick={onOpenLimits}
        title={limitsDisabled ? limitsDisabledTitle : 'Set alarm limits'}
      >
        Alarm limits
      </button>
    </div>
  )
}
