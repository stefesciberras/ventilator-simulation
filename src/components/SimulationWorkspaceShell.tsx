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
  /** Retained for backwards compatibility. Two-finger workspace navigation no longer needs canvas exceptions. */
  allowSwipeFromCanvas?: boolean
}

interface WorkspaceSwipeStart {
  x: number
  y: number
}

interface WorkspaceTouchPoint {
  clientX: number
  clientY: number
}

const centroidFromTouches = (touches: ArrayLike<WorkspaceTouchPoint>) => {
  if (touches.length < 1) return null
  let x = 0
  let y = 0
  for (let index = 0; index < touches.length; index += 1) {
    x += touches[index].clientX
    y += touches[index].clientY
  }
  return { x: x / touches.length, y: y / touches.length }
}

const twoTouchCentroidAtEnd = (event: TouchEvent<HTMLDivElement>) => {
  const contacts: WorkspaceTouchPoint[] = []
  for (let index = 0; index < event.touches.length; index += 1) contacts.push(event.touches[index])
  for (let index = 0; index < event.changedTouches.length; index += 1) contacts.push(event.changedTouches[index])
  return contacts.length >= 2 ? centroidFromTouches(contacts.slice(0, 2)) : null
}

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
}: SimulationWorkspaceShellProps) {
  const [page, setPage] = useState<'display' | 'controls'>('display')
  const swipeStart = useRef<WorkspaceSwipeStart | null>(null)

  const resetSwipe = () => {
    swipeStart.current = null
  }

  const onTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    // A first finger must never arm workspace navigation. The gesture starts
    // only when a second simultaneous contact is present, so ordinary sliders,
    // scrolling, waveform interaction and the teaching laser remain one-finger gestures.
    if (event.touches.length !== 2) {
      if (event.touches.length < 2) resetSwipe()
      return
    }
    swipeStart.current = centroidFromTouches(event.touches)
  }

  const onTouchMove = (event: TouchEvent<HTMLDivElement>) => {
    // If a third contact is added, cancel rather than interpreting a pinch or
    // other multi-touch interaction as workspace navigation.
    if (swipeStart.current && event.touches.length !== 2) resetSwipe()
  }

  const onTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
    const start = swipeStart.current
    if (!start || !controlsVisible) {
      if (event.touches.length < 2) resetSwipe()
      return
    }

    // touchend normally contains one remaining finger plus the finger that
    // just lifted. Recombine those contacts so the final position remains the
    // centre of the same two-finger gesture.
    const end = twoTouchCentroidAtEnd(event)
    resetSwipe()
    if (!end) return

    const dx = end.x - start.x
    const dy = end.y - start.y
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
