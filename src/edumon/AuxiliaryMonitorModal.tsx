import type { ReactNode } from 'react'
import { SimulationModal } from '../components/SimulationModal'

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
    <SimulationModal
      title={title}
      eyebrow={eyebrow}
      onClose={onClose}
      className="edumon-aux-modal"
      stageClassName="edumon-aux-stage"
    >
      {children}
    </SimulationModal>
  )
}
