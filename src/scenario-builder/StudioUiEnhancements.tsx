import { useEffect } from 'react'

const PALETTE_OPEN_CLASS = 'studio-trigger-dialog-open'
const BACKDROP_CLASS = 'studio-trigger-dialog-backdrop'

function closeTriggerPalette() {
  document.querySelector('.shared-scenario-trigger-palette')?.classList.remove(PALETTE_OPEN_CLASS)
  document.querySelector(`.${BACKDROP_CLASS}`)?.remove()
}

function openTriggerPalette() {
  const palette = document.querySelector('.shared-scenario-trigger-palette')
  if (!palette) return

  palette.classList.add(PALETTE_OPEN_CLASS)
  if (!document.querySelector(`.${BACKDROP_CLASS}`)) {
    const backdrop = document.createElement('button')
    backdrop.type = 'button'
    backdrop.className = BACKDROP_CLASS
    backdrop.setAttribute('aria-label', 'Close trigger palette')
    backdrop.addEventListener('click', closeTriggerPalette)
    document.body.appendChild(backdrop)
  }

  window.setTimeout(() => {
    const search = palette.querySelector<HTMLInputElement>('.shared-scenario-trigger-palette-heading input')
    search?.focus()
  }, 0)
}

/**
 * Small Studio-only behaviour layer for UI affordances that sit above the
 * shared scenario authoring framework. It deliberately does not alter the
 * scenario document or runtime model.
 */
export function StudioUiEnhancements() {
  useEffect(() => {
    const captureClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null
      const button = target?.closest<HTMLButtonElement>('.shared-scenario-paths .shared-scenario-section-heading button')
      if (!button || button.disabled || button.textContent?.trim() !== '+ Path') return

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
      document.removeEventListener('click', captureClick, true)
      document.removeEventListener('click', bubbleClick)
      document.removeEventListener('keydown', keyDown)
      closeTriggerPalette()
    }
  }, [])

  return null
}
