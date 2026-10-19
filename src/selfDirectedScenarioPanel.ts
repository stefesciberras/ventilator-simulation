type DragState = {
  pointerId: number
  header: HTMLElement
  panel: HTMLElement
  lastX: number
  lastY: number
}

let dragState: DragState | null = null
let installed = false

function clampPanel(panel: HTMLElement) {
  const rect = panel.getBoundingClientRect()
  const margin = 8
  let left = rect.left
  let top = rect.top

  if (rect.right > window.innerWidth - margin) left -= rect.right - (window.innerWidth - margin)
  if (rect.bottom > window.innerHeight - margin) top -= rect.bottom - (window.innerHeight - margin)
  if (left < margin) left = margin
  if (top < margin) top = margin

  if (Math.abs(left - rect.left) > 0.5 || Math.abs(top - rect.top) > 0.5) {
    panel.style.left = `${left}px`
    panel.style.top = `${top}px`
    panel.style.right = 'auto'
    panel.style.bottom = 'auto'
    panel.style.transform = 'none'
  }
}

export function installSelfDirectedScenarioPanelDrag() {
  if (installed || typeof document === 'undefined') return
  installed = true

  document.addEventListener('pointerdown', (event) => {
    const target = event.target as HTMLElement | null
    const header = target?.closest('.self-directed-scenario-header') as HTMLElement | null
    if (!header || target?.closest('button, a, input, select, textarea')) return
    const panel = header.closest('.self-directed-scenario-modal') as HTMLElement | null
    if (!panel) return

    dragState = {
      pointerId: event.pointerId,
      header,
      panel,
      lastX: event.clientX,
      lastY: event.clientY,
    }
    header.setPointerCapture?.(event.pointerId)
    event.preventDefault()
  }, { passive: false })

  document.addEventListener('pointermove', (event) => {
    const drag = dragState
    if (!drag || drag.pointerId !== event.pointerId) return

    const rect = drag.panel.getBoundingClientRect()
    const dx = event.clientX - drag.lastX
    const dy = event.clientY - drag.lastY
    const margin = 8
    const maxLeft = Math.max(margin, window.innerWidth - rect.width - margin)
    const maxTop = Math.max(margin, window.innerHeight - rect.height - margin)
    const left = Math.min(maxLeft, Math.max(margin, rect.left + dx))
    const top = Math.min(maxTop, Math.max(margin, rect.top + dy))

    drag.panel.style.left = `${left}px`
    drag.panel.style.top = `${top}px`
    drag.panel.style.right = 'auto'
    drag.panel.style.bottom = 'auto'
    drag.panel.style.transform = 'none'
    drag.lastX = event.clientX
    drag.lastY = event.clientY
    event.preventDefault()
  }, { passive: false })

  const endDrag = (event: PointerEvent) => {
    const drag = dragState
    if (!drag || drag.pointerId !== event.pointerId) return
    if (drag.header.hasPointerCapture?.(event.pointerId)) drag.header.releasePointerCapture?.(event.pointerId)
    dragState = null
  }

  document.addEventListener('pointerup', endDrag)
  document.addEventListener('pointercancel', endDrag)
  window.addEventListener('resize', () => {
    const panel = document.querySelector('.self-directed-scenario-modal') as HTMLElement | null
    if (panel) clampPanel(panel)
  })
}
