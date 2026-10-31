import { useEffect, type ReactNode } from 'react'
import { LOPPJUSIM_OPEN_SCENARIOS_EVENT } from '../core/platformEvents'
import { SimulationModal, type SimulationModalSize } from './SimulationModal'

interface SecondaryMonitorSurfaceProps {
  open?: boolean
  title: string
  eyebrow?: string
  children: ReactNode
  navigation?: ReactNode
  onClose: () => void
  size?: SimulationModalSize
  className?: string
  stageClassName?: string
  ariaModal?: boolean
}

export function SecondaryMonitorSurface({
  open = true,
  title,
  eyebrow = 'LoppjuSIM secondary display',
  children,
  navigation,
  onClose,
  size = 'monitor',
  className = '',
  stageClassName = '',
  ariaModal = false,
}: SecondaryMonitorSurfaceProps) {
  const sessionSurface = title === 'Scenarios and sessions' || title === 'Sessions'
  const displayTitle = title === 'Scenarios and sessions' ? 'Sessions' : title

  useEffect(() => {
    if (!open || !sessionSurface) return
    const closeForScenarioLibrary = () => onClose()
    window.addEventListener(LOPPJUSIM_OPEN_SCENARIOS_EVENT, closeForScenarioLibrary)
    return () => window.removeEventListener(LOPPJUSIM_OPEN_SCENARIOS_EVENT, closeForScenarioLibrary)
  }, [open, sessionSurface, onClose])

  return (
    <SimulationModal
      open={open}
      title={displayTitle}
      eyebrow={eyebrow}
      onClose={onClose}
      size={size}
      ariaModal={ariaModal}
      className={`secondary-monitor-surface ${className}`.trim()}
      stageClassName={`secondary-monitor-stage ${stageClassName}`.trim()}
    >
      {navigation && <div className="secondary-monitor-navigation">{navigation}</div>}
      <div className="secondary-monitor-content">{children}</div>
    </SimulationModal>
  )
}
