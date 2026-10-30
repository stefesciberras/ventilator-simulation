import { useEffect } from 'react'

const PALETTE_OPEN_CLASS = 'studio-trigger-dialog-open'
const CLOSE_BUTTON_CLASS = 'studio-trigger-close-button'

function closeTriggerPalette() {
  document.querySelector<HTMLElement>('.shared-scenario-trigger-palette')?.classList.remove(PALETTE_OPEN_CLASS)
}

function placeTriggerPalette(palette: HTMLElement) {
  if (palette.dataset.studioPositioned === 'true') return
  const width = Math.min(460, Math.max(360, window.innerWidth * 0.34))
  const left = Math.max(16, window.innerWidth - width - 28)
  const top = Math.max(90, Math.min(150, window.innerHeight * 0.14))
  palette.style.left = `${left}px`
  palette.style.top = `${top}px`
  palette.style.right = 'auto'
  palette.style.transform = 'none'
  palette.dataset.studioPositioned = 'true'
}

function ensureCloseButton() {
  const heading = document.querySelector<HTMLElement>('.shared-scenario-trigger-palette-heading')
  if (!heading || heading.querySelector(`.${CLOSE_BUTTON_CLASS}`)) return

  const button = document.createElement('button')
  button.type = 'button'
  button.className = CLOSE_BUTTON_CLASS
  button.setAttribute('aria-label', 'Close trigger palette')
  button.setAttribute('title', 'Close')
  button.textContent = '×'
  button.addEventListener('click', closeTriggerPalette)
  heading.appendChild(button)
}

function openTriggerPalette() {
  const palette = document.querySelector<HTMLElement>('.shared-scenario-trigger-palette')
  if (!palette) return

  ensureCloseButton()
  palette.classList.add(PALETTE_OPEN_CLASS)
  placeTriggerPalette(palette)

  window.setTimeout(() => {
    const search = palette.querySelector<HTMLInputElement>('.shared-scenario-trigger-palette-heading input')
    search?.focus()
  }, 0)
}

function makeTriggerPaletteDraggable() {
  const palette = document.querySelector<HTMLElement>('.shared-scenario-trigger-palette')
  const handle = palette?.querySelector<HTMLElement>('.shared-scenario-trigger-palette-heading')
  if (!palette || !handle || handle.dataset.dragReady === 'true') return () => undefined

  handle.dataset.dragReady = 'true'
  let dragging = false
  let pointerId = -1
  let offsetX = 0
  let offsetY = 0

  const pointerDown = (event: PointerEvent) => {
    const target = event.target as HTMLElement | null
    if (target?.closest('input,button,select,textarea')) return
    const rect = palette.getBoundingClientRect()
    dragging = true
    pointerId = event.pointerId
    offsetX = event.clientX - rect.left
    offsetY = event.clientY - rect.top
    handle.setPointerCapture(event.pointerId)
    handle.classList.add('dragging')
    event.preventDefault()
  }

  const pointerMove = (event: PointerEvent) => {
    if (!dragging || event.pointerId !== pointerId) return
    const maxLeft = Math.max(8, window.innerWidth - palette.offsetWidth - 8)
    const maxTop = Math.max(8, window.innerHeight - 56)
    const left = Math.max(8, Math.min(maxLeft, event.clientX - offsetX))
    const top = Math.max(8, Math.min(maxTop, event.clientY - offsetY))
    palette.style.left = `${left}px`
    palette.style.top = `${top}px`
    palette.style.right = 'auto'
    palette.style.transform = 'none'
  }

  const endDrag = (event: PointerEvent) => {
    if (!dragging || event.pointerId !== pointerId) return
    dragging = false
    handle.classList.remove('dragging')
    if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId)
  }

  handle.addEventListener('pointerdown', pointerDown)
  handle.addEventListener('pointermove', pointerMove)
  handle.addEventListener('pointerup', endDrag)
  handle.addEventListener('pointercancel', endDrag)

  return () => {
    handle.removeEventListener('pointerdown', pointerDown)
    handle.removeEventListener('pointermove', pointerMove)
    handle.removeEventListener('pointerup', endDrag)
    handle.removeEventListener('pointercancel', endDrag)
    delete handle.dataset.dragReady
  }
}

function labelScenarioDeleteControl() {
  const button = document.querySelector<HTMLButtonElement>('.shared-scenario-authoring-header .scenario-builder-danger:not(.shared-scenario-trash-button)')
  if (!button) return
  button.setAttribute('aria-label', 'Delete scenario')
  button.setAttribute('title', 'Delete scenario')
  button.classList.add('studio-delete-scenario')
}

/**
 * Studio-only UI behaviour layered over the shared scenario authoring
 * framework. It changes presentation and interaction only, never scenario
 * document or runtime semantics.
 */
export function StudioUiEnhancements() {
  useEffect(() => {
    let releaseDrag = makeTriggerPaletteDraggable()

    const observer = new MutationObserver(() => {
      labelScenarioDeleteControl()
      ensureCloseButton()
      releaseDrag()
      releaseDrag = makeTriggerPaletteDraggable()
    })
    observer.observe(document.body, { childList: true, subtree: true })
    labelScenarioDeleteControl()
    ensureCloseButton()

    const captureClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null
      const button = target?.closest<HTMLButtonElement>('.shared-scenario-paths .shared-scenario-section-heading button')
      if (!button || button.disabled || button.textContent?.trim() !== '+ Path') return

      const palette = document.querySelector<HTMLElement>('.shared-scenario-trigger-palette')
      if (palette?.classList.contains(PALETTE_OPEN_CLASS)) {
        // Palette already visible: allow the framework's native + Path handler
        // to create another branch with the default trigger.
        return
      }

      event.preventDefault()
      event.stopPropagation()
      openTriggerPalette()
    }

    const bubbleClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null
      if (!target?.closest('.shared-scenario-trigger-chip')) return
      window.setTimeout(closeTriggerPalette, 0)
    }

    const keyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeTriggerPalette()
    }

    document.addEventListener('click', captureClick, true)
    document.addEventListener('click', bubbleClick)
    document.addEventListener('keydown', keyDown)

    return () => {
      observer.disconnect()
      releaseDrag()
      document.removeEventListener('click', captureClick, true)
      document.removeEventListener('click', bubbleClick)
      document.removeEventListener('keydown', keyDown)
      closeTriggerPalette()
    }
  }, [])

  return null
}
