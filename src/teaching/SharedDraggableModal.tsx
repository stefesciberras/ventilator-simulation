import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import './teaching.css'
import './TeachingMediaPresentation.css'
import './SharedDraggableModal.css'

interface SharedDraggableModalProps {
  ariaLabel: string
  eyebrow?: string
  title: string
  children: ReactNode
  onClose?: () => void
  closeLabel?: string
  className?: string
  collapsible?: boolean
  reopenLabel?: string
}

export function SharedDraggableModal({ ariaLabel, eyebrow, title, children, onClose, closeLabel = 'Close', className = '', collapsible = true, reopenLabel = 'Show' }: SharedDraggableModalProps) {
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [collapsed, setCollapsed] = useState(false)
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number; baseLeft: number; baseTop: number; width: number; height: number } | null>(null)

  useEffect(() => {
    setCollapsed(false)
    setPosition({ x: 0, y: 0 })
  }, [title])

  const startDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if (window.innerWidth < 900 || (event.target as HTMLElement).closest('button, input, select, textarea, video, a')) return
    const panel = event.currentTarget.closest('.shared-draggable-modal') as HTMLElement | null
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
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture?.(event.pointerId)
  }

  if (collapsed) {
    return <button type="button" className="teaching-prompt-reopen teaching-media-reopen shared-draggable-modal-reopen" onClick={() => setCollapsed(false)}>
      <span>{title}</span><strong>{reopenLabel}</strong>
    </button>
  }

  return (
    <div className="teaching-media-overlay shared-draggable-modal-overlay" role="presentation">
      <section className={`teaching-media-modal shared-draggable-modal ${className}`.trim()} role="dialog" aria-modal="false" aria-label={ariaLabel} style={{ transform: `translate(${position.x}px, ${position.y}px)` }}>
        <div className="teaching-media-header shared-draggable-modal-header" onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag} title="Drag to move on wide screens">
          <div>{eyebrow && <span>{eyebrow}</span>}<strong>{title}</strong></div>
          <div className="shared-draggable-modal-header-actions">
            {collapsible && <button type="button" onClick={() => setCollapsed(true)}>Hide</button>}
            {onClose && <button type="button" onClick={onClose} aria-label={closeLabel}>×</button>}
          </div>
        </div>
        <div className="shared-draggable-modal-body">{children}</div>
      </section>
    </div>
  )
}
