import { isValidElement, type ReactNode } from 'react'
import { SharedAlarmLimitsButton } from '../alarms/SharedAlarmLimitsControl'
import './SimulationConsoleShell.css'

interface SimulationConsoleShellProps {
  ariaLabel: string
  className?: string
  header?: ReactNode
  hardwareControls?: ReactNode
  status?: ReactNode
  display: ReactNode
  footer?: ReactNode
}

interface LegacyAlarmLimitsAction {
  disabled: boolean
  title?: string
  onOpen: () => void
}

function findLegacyAlarmLimitsAction(node: ReactNode): LegacyAlarmLimitsAction | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findLegacyAlarmLimitsAction(child)
      if (found) return found
    }
    return null
  }
  if (!isValidElement(node)) return null
  const props = node.props as { className?: string; disabled?: boolean; title?: string; onClick?: () => void; children?: ReactNode }
  const classes = typeof props.className === 'string' ? props.className.split(/\s+/) : []
  if (classes.includes('mobile-alarm-limits-button') && typeof props.onClick === 'function') {
    return { disabled: Boolean(props.disabled), title: props.title, onOpen: props.onClick }
  }
  return findLegacyAlarmLimitsAction(props.children)
}

/**
 * Shared EDUSIM device-console geometry. Product code supplies the clinical
 * display and device-specific controls; core owns the stable vertical layout so
 * mobile/tablet pages cannot clip persistent bottom controls.
 */
export function SimulationConsoleShell({
  ariaLabel,
  className = '',
  header,
  hardwareControls,
  status,
  display,
  footer,
}: SimulationConsoleShellProps) {
  const legacyAlarmLimitsAction = status ? findLegacyAlarmLimitsAction(status) : null

  return (
    <section className={`simulation-console-shell ventilator-console ${className}`.trim()} aria-label={ariaLabel}>
      {header && <div className="simulation-console-header">{header}</div>}
      {hardwareControls && <div className="simulation-console-hardware">{hardwareControls}</div>}
      {status && (
        <div className="simulation-console-status">
          <div className="simulation-console-status-content">{status}</div>
          <div className="simulation-console-status-actions">
            {legacyAlarmLimitsAction && (
              <SharedAlarmLimitsButton
                disabled={legacyAlarmLimitsAction.disabled}
                disabledTitle={legacyAlarmLimitsAction.title}
                onOpen={legacyAlarmLimitsAction.onOpen}
              />
            )}
          </div>
        </div>
      )}
      <div className="simulation-console-display">{display}</div>
      {footer && <div className="simulation-console-footer">{footer}</div>}
    </section>
  )
}
