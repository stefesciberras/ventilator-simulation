import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

export function SharedAlarmLimitsButton({
  disabled = false,
  disabledTitle = 'Alarm limits controlled by instructor',
  onOpen,
}: {
  disabled?: boolean
  disabledTitle?: string
  onOpen: () => void
}) {
  return (
    <button
      className="shared-alarm-limits-button"
      type="button"
      disabled={disabled}
      onClick={onOpen}
      title={disabled ? disabledTitle : 'Set alarm limits'}
    >
      Alarm limits
    </button>
  )
}

export function SharedAlarmLimitsControl({
  disabled = false,
  disabledTitle = 'Alarm limits controlled by instructor',
  onOpen,
}: {
  disabled?: boolean
  disabledTitle?: string
  onOpen: () => void
}) {
  const [target, setTarget] = useState<Element | null>(null)

  useEffect(() => {
    const resolveTarget = () => setTarget(document.querySelector('.simulation-console-status-actions'))
    resolveTarget()
    const frame = requestAnimationFrame(resolveTarget)
    return () => cancelAnimationFrame(frame)
  }, [])

  if (!target) return null

  return createPortal(
    <SharedAlarmLimitsButton disabled={disabled} disabledTitle={disabledTitle} onOpen={onOpen} />,
    target,
  )
}
