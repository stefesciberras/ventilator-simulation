import type { ReactNode } from 'react'
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
  eyebrow = 'EDUSIM secondary display',
  children,
  navigation,
  onClose,
  size = 'monitor',
  className = '',
  stageClassName = '',
  ariaModal = false,
}: SecondaryMonitorSurfaceProps) {
  return (
    <SimulationModal
      open={open}
      title={title}
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
