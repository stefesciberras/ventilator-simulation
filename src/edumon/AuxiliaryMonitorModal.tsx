import type { ReactNode } from 'react'
import { SecondaryMonitorSurface } from '../components/SecondaryMonitorSurface'

export function AuxiliaryMonitorModal({
  title,
  eyebrow = 'EDUMON auxiliary monitor',
  children,
  onClose,
}: {
  title: string
  eyebrow?: string
  children: ReactNode
  onClose: () => void
}) {
  return (
    <SecondaryMonitorSurface
      title={title}
      eyebrow={eyebrow}
      onClose={onClose}
      className="edumon-aux-modal"
      stageClassName="edumon-aux-stage"
    >
      {children}
    </SecondaryMonitorSurface>
  )
}
