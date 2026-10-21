import type { SharedAlarmDisplayLevel } from './useSharedAlarmController'

export function SharedAlarmBanner({
  level,
  labels,
  silenced,
}: {
  level: SharedAlarmDisplayLevel
  labels: readonly string[]
  silenced: boolean
}) {
  if (!level || !labels.length) return null
  return <div className={`alarm-banner ${level}`} role="alert">
    <strong>{labels.join(' • ')}</strong>
    {silenced && <span>ALARM SILENT</span>}
  </div>
}
