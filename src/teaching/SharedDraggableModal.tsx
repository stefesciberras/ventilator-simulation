import { useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import './SharedDraggableModal.css'

interface SharedDraggableModalProps {
  ariaLabel: string
  eyebrow?: string
  title: string
  children: ReactNode
  onClose?: () => void
  closeLabel?: string
  className?: string
}

export function SharedDraggableModal({ ariaLabel, eyebrow, title, children, onClose, closeLabel = 'Close', className = '' }: SharedDraggableModalProps) {
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number; baseLeft: number; baseTop: number; width: number; height: number } | null>(null)

  const startDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if (window.innerWidth < 900 || (event.target as HTMLElement).closest('button, input, select, textarea, video, audio, a, label')) return
    const panel = event.currentTarget as HTMLElement
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
    panel.setPointerCapture?.(event.pointerId)
    panel.classList.add('dragging')
    event.preventDefault()
  }

  const moveDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId || window.innerWidth < 900) return
    const margin = 12
    const x = drag.originX + event.clientX - drag.startX
    const y = drag.originY + event.clientY - drag.startY
    setPosition({
      x: Math.max(margin - drag.baseLeft, Math.min(window.innerWidth - margin - drag.baseLeft - drag.width, x)),
      y: Math.max(margin - drag.baseTop, Math.min(window.innerHeight - margin - drag.baseTop - drag.height, y)),
    })
    event.preventDefault()
  }

  const endDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null
    event.currentTarget.classList.remove('dragging')
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture?.(event.pointerId)
  }

  return (
    <div className="shared-draggable-modal-overlay" role="presentation">
      <section
        className={`shared-draggable-modal ${className}`.trim()}
        role="dialog"
        aria-modal="false"
        aria-label={ariaLabel}
        style={{ transform: `translate(${position.x}px, ${position.y}px)` }}
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        title="Drag to move on wide screens"
      >
        <header className="shared-draggable-modal-header">
          <div>{eyebrow && <span>{eyebrow}</span>}<strong>{title}</strong></div>
          {onClose && <button type="button" onClick={onClose} aria-label={closeLabel}>×</button>}
        </header>
        <div className="shared-draggable-modal-body">{children}</div>
      </section>
    </div>
  )
}
