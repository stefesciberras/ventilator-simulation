import { useRef, useState, type ReactNode, type TouchEvent } from 'react'

interface SimulationWorkspaceShellProps {
  display: ReactNode
  controls: ReactNode
  displayLabel?: string
  controlsLabel?: string
  ariaLabel?: string
  workspaceClassName?: string
  switcherClassName?: string
  displayPageClassName?: string
  controlsPageClassName?: string
  controlsVisible?: boolean
  allowSwipeFromCanvas?: boolean
}

const isGlobalLaserInteractionActive = () => (
  typeof document !== 'undefined' && (
    document.documentElement.getAttribute('data-edusim-simulator-laser-active') === 'true'
    || document.documentElement.getAttribute('data-edusim-media-laser-active') === 'true'
  )
)

const isLaserInteractionTarget = (target: EventTarget | null) => (
  target instanceof Element && Boolean(target.closest(
    '.teaching-laser-layer-active, .teaching-media-laser-stage, [data-edusim-block-workspace-swipe="true"]',
  ))
)

export function SimulationWorkspaceShell({
  display,
  controls,
  displayLabel = 'Display',
  controlsLabel = 'Controls',
  ariaLabel = 'Simulation workspace pages',
  workspaceClassName = '',
  switcherClassName = '',
  displayPageClassName = 'mobile-page-display',
  controlsPageClassName = 'mobile-page-controls',
  controlsVisible = true,
  allowSwipeFromCanvas = false,
}: SimulationWorkspaceShellProps) {
  const [page, setPage] = useState<'display' | 'controls'>('display')
  const swipeStart = useRef<{ x: number; y: number; blocked: boolean } | null>(null)

  const resetSwipe = () => {
    swipeStart.current = null
  }

  const onTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    resetSwipe()
    if (event.touches.length !== 1) return
    const touch = event.touches[0]
    const target = event.target as HTMLElement
    const laserOwnsGesture = page === 'display' && (isGlobalLaserInteractionActive() || isLaserInteractionTarget(event.target))
    swipeStart.current = {
      x: touch.clientX,
      y: touch.clientY,
      blocked: laserOwnsGesture || Boolean(target.closest(allowSwipeFromCanvas
        ? 'button, input, select, textarea, a, [role="slider"]'
        : 'button, input, select, textarea, a, [role="slider"], canvas')),
    }
  }

  const onTouchMove = (event: TouchEvent<HTMLDivElement>) => {
    const start = swipeStart.current
    if (!start || start.blocked) return
    if (page === 'display' && (isGlobalLaserInteractionActive() || isLaserInteractionTarget(event.target))) {
      start.blocked = true
    }
  }

  const onTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
    const start = swipeStart.current
    resetSwipe()
    if (!start || start.blocked || isGlobalLaserInteractionActive() || event.changedTouches.length !== 1 || !controlsVisible) return
    const touch = event.changedTouches[0]
    const dx = touch.clientX - start.x
    const dy = touch.clientY - start.y
    if (Math.abs(dx) < 55 || Math.abs(dx) <= Math.abs(dy) * 1.25) return
    setPage(dx > 0 ? 'display' : 'controls')
  }

  const effectivePage = controlsVisible ? page : 'display'
  return <>
    <nav className={`mobile-workspace-switcher ${switcherClassName}`.trim()} aria-label={ariaLabel}>
      <button type="button" className={effectivePage === 'display' ? 'active' : ''} onClick={() => setPage('display')}>{displayLabel}</button>
      {controlsVisible && <button type="button" className={effectivePage === 'controls' ? 'active' : ''} onClick={() => setPage('controls')}>{controlsLabel}</button>}
    </nav>
    <div
      className={`workspace ${workspaceClassName} ${effectivePage === 'display' ? displayPageClassName : controlsPageClassName}`.trim()}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={resetSwipe}
    >
      {display}
      {controlsVisible ? controls : null}
    </div>
  </>
}
