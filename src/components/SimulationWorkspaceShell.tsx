import { useEffect, useRef, useState, type ReactNode, type TouchEvent } from 'react'
import { readParticipantAccessContextFromDocument } from '../core/sessionAccessPolicy'
import './InstructorConsoleView.css'

export type SimulationViewMode = 'monitor' | 'instructor'

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
  instructorVisible?: boolean
  instructorLabel?: string
  instructorControlsLabel?: string
  instructorStateLabel?: string
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

const initialSimulationView = (): SimulationViewMode => {
  if (typeof window === 'undefined') return 'monitor'
  return new URLSearchParams(window.location.search).get('view') === 'instructor' ? 'instructor' : 'monitor'
}

const persistSimulationViewInUrl = (view: SimulationViewMode) => {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  if (view === 'instructor') url.searchParams.set('view', 'instructor')
  else url.searchParams.delete('view')
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`)
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
  instructorVisible = controlsVisible,
  instructorLabel = 'Instructor',
  instructorControlsLabel = 'Instructor controls',
  instructorStateLabel = 'Live state',
}: SimulationWorkspaceShellProps) {
  const [page, setPage] = useState<'display' | 'controls'>('display')
  const [view, setView] = useState<SimulationViewMode>(initialSimulationView)
  const swipeStart = useRef<WorkspaceSwipeStart | null>(null)

  const accessContext = readParticipantAccessContextFromDocument()
  const instructorAuthenticated = typeof document !== 'undefined'
    && document.documentElement.dataset.loppjusimInstructorAuthenticated === 'true'
  const effectiveInstructorVisible = Boolean(
    instructorVisible
    && instructorAuthenticated
    && accessContext.role !== 'candidate'
    && accessContext.policy.instructorView,
  )

  const resetSwipe = () => {
    swipeStart.current = null
  }

  const selectView = (nextView: SimulationViewMode) => {
    const effectiveView = nextView === 'instructor' && !effectiveInstructorVisible ? 'monitor' : nextView
    setView(effectiveView)
    persistSimulationViewInUrl(effectiveView)
  }

  useEffect(() => {
    if (view === 'instructor' && !effectiveInstructorVisible) selectView('monitor')
  }, [effectiveInstructorVisible, view])

  const onTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    if (event.touches.length !== 2) {
      if (event.touches.length < 2) resetSwipe()
      return
    }
    swipeStart.current = centroidFromTouches(event.touches)
  }

  const onTouchMove = (event: TouchEvent<HTMLDivElement>) => {
    if (swipeStart.current && event.touches.length !== 2) resetSwipe()
  }

  const onTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
    const start = swipeStart.current
    if (!start || !controlsVisible) {
      if (event.touches.length < 2) resetSwipe()
      return
    }

    const end = twoTouchCentroidAtEnd(event)
    resetSwipe()
    if (!end) return

    const dx = end.x - start.x
    const dy = end.y - start.y
    if (Math.abs(dx) < 55 || Math.abs(dx) <= Math.abs(dy) * 1.25) return
    setPage(dx > 0 ? 'display' : 'controls')
  }

  const effectivePage = controlsVisible ? page : 'display'
  const effectiveView = view === 'instructor' && effectiveInstructorVisible ? 'instructor' : 'monitor'

  return <>
    {effectiveInstructorVisible && (
      <nav className="simulation-view-switcher" aria-label="Simulation view">
        <button type="button" className={effectiveView === 'monitor' ? 'active' : ''} onClick={() => selectView('monitor')} aria-pressed={effectiveView === 'monitor'}>Monitor</button>
        <button type="button" className={effectiveView === 'instructor' ? 'active' : ''} onClick={() => selectView('instructor')} aria-pressed={effectiveView === 'instructor'}>{instructorLabel}</button>
      </nav>
    )}

    {effectiveView === 'instructor' ? (
      <section className="shared-instructor-console" aria-label="Instructor console">
        <section className="shared-instructor-console-main" aria-label={instructorControlsLabel}>
          <header className="shared-instructor-console-heading">
            <strong>{instructorControlsLabel}</strong>
            <span>Same active simulation runtime</span>
          </header>
          <div className="shared-instructor-console-controls">{controls}</div>
        </section>

        <aside className="shared-instructor-console-state" aria-label={instructorStateLabel}>
          <header className="shared-instructor-console-heading">
            <strong>{instructorStateLabel}</strong>
            <span>Current monitored values</span>
          </header>
          <div className="shared-instructor-console-state-display">{display}</div>
        </aside>
      </section>
    ) : (
      <>
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
    )}
  </>
}
