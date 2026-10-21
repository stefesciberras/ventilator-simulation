import type { ReactNode } from 'react'
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
  return (
    <section className={`simulation-console-shell ventilator-console ${className}`.trim()} aria-label={ariaLabel}>
      {header && <div className="simulation-console-header">{header}</div>}
      {hardwareControls && <div className="simulation-console-hardware">{hardwareControls}</div>}
      {status && <div className="simulation-console-status">{status}</div>}
      <div className="simulation-console-display">{display}</div>
      {footer && <div className="simulation-console-footer">{footer}</div>}
    </section>
  )
}
