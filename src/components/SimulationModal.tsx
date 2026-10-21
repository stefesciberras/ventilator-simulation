import { useEffect, useRef, useState, type ReactNode, type PointerEvent as ReactPointerEvent } from 'react'

export type SimulationModalSize = 'compact' | 'standard' | 'wide' | 'monitor'

interface SimulationModalProps {
  title: string
  eyebrow?: string
  children: ReactNode
  onClose: () => void
  open?: boolean
  className?: string
  stageClassName?: string
  size?: SimulationModalSize
  ariaModal?: boolean
  closeOnBackdrop?: boolean
  draggable?: boolean
}

export function SimulationModal({
  title,
  eyebrow = 'EDUSIM',
  children,
  onClose,
  open = true,
  className = '',
  stageClassName = '',
  size = 'standard',
  ariaModal = false,
  closeOnBackdrop = true,
  draggable = true,
}: SimulationModalProps) {
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const dragRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    originX: number
    originY: number
    baseLeft: number
    baseTop: number
    width: number
    height: number
  } | null>(null)

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  useEffect(() => {
    if (!open) setPosition({ x: 0, y: 0 })
  }, [open])

  if (!open) return null

  const startDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!draggable || window.innerWidth < 900 || (event.target as HTMLElement).closest('button, input, select, textarea, video')) return
    const panel = event.currentTarget.closest('.teaching-media-modal') as HTMLElement | null
    if (!panel) return
    const rect = panel.getBoundingClientRect()
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: position.x,
      originY: position.y,
      baseLeft: rect.left - position.x,
      baseTop: rect.top - position.y,
      width: rect.width,
      height: rect.height,
    }
    event.currentTarget.setPointerCapture?.(event.pointerId)
    event.preventDefault()
  }

  const moveDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId || window.innerWidth < 900) return
    const margin = 12
    const x = drag.originX + event.clientX - drag.startX
    const y = drag.originY + event.clientY - drag.startY
    setPosition({
      x: Math.max(margin - drag.baseLeft, Math.min(window.innerWidth - margin - drag.baseLeft - drag.width, x)),
      y: Math.max(margin - drag.baseTop, Math.min(window.innerHeight - margin - drag.baseTop - drag.height, y)),
    })
  }

  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture?.(event.pointerId)
  }

  return (
    <div className="teaching-media-overlay edusim-modal-overlay" role="presentation" onPointerDown={(event) => {
      if (closeOnBackdrop && event.target === event.currentTarget) onClose()
    }}>
      <section
        className={`teaching-media-modal edusim-modal edusim-modal-${size} ${className}`.trim()}
        role="dialog"
        aria-modal={ariaModal}
        aria-label={title}
        style={{ transform: `translate(${position.x}px, ${position.y}px)` }}
      >
        <div className="teaching-media-header edusim-modal-header" onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag} title={draggable ? 'Drag to move on wide screens' : undefined}>
          <div><span>{eyebrow}</span><strong>{title}</strong></div>
          <button type="button" onClick={onClose}>Close</button>
        </div>
        <div className={`teaching-media-stage edusim-modal-stage ${stageClassName}`.trim()}>{children}</div>
      </section>
    </div>
  )
}
