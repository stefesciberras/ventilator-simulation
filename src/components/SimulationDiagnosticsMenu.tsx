import { useEffect, useRef, useState } from 'react'
import { captureSimulationDiagnostics } from '../core/SimulationDiagnostics'
import { publishSimulationDiagnostics } from '../teaching/diagnostics/PublishedDiagnostics'

export interface SimulationDiagnosticAction {
  id: string
  label: string
  description?: string
  onSelect: () => void | Promise<void>
}

function DiagnosticIcon({ completed }: { completed: boolean }) {
  return completed ? (
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6.5 12.5 3.2 3.2 7.8-8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
  ) : (
    <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4.5" width="16" height="15" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="M6.5 13h2.2l1.4-4 2.1 7 1.6-4h3.7" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
  )
}

export function SimulationDiagnosticsMenu({ actions, title = 'Diagnostics' }: { actions: SimulationDiagnosticAction[]; title?: string }) {
  const [open, setOpen] = useState(false)
  const [completed, setCompleted] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [publishing, setPublishing] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const closeOutside = (event: PointerEvent) => {
      const target = event.target as Node | null
      if (target && menuRef.current?.contains(target)) return
      setOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', closeOutside, true)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOutside, true)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  const markCompleted = (id: string) => {
    setCompleted(id)
    window.setTimeout(() => setCompleted((current) => current === id ? null : current), 1800)
  }

  const run = async (action: SimulationDiagnosticAction) => {
    setError(null)
    try {
      await action.onSelect()
      markCompleted(action.id)
      setOpen(false)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    }
  }

  const publish = async () => {
    if (publishing || actions.length === 0) return
    setPublishing(true)
    setError(null)
    try {
      const diagnostics = await captureSimulationDiagnostics(async () => {
        for (const action of actions) await action.onSelect()
      })
      const reference = await publishSimulationDiagnostics(diagnostics)
      markCompleted('publish')
      setOpen(false)
      console.info(`Published EDUSIM diagnostics ${reference.id}`)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setPublishing(false)
    }
  }

  const completedTitle = completed === 'publish' ? 'Diagnostics published' : 'Diagnostics copied'

  return (
    <div ref={menuRef} className="top-diagnostic-menu">
      <button
        className={`top-diagnostic-button ${open ? 'active' : ''} ${completed ? 'copied' : ''}`}
        type="button"
        onClick={() => { setOpen((value) => !value); setError(null) }}
        title={completed ? completedTitle : title}
        aria-label={`Open ${title.toLowerCase()} menu`}
        aria-haspopup="menu"
        aria-expanded={open}
      ><DiagnosticIcon completed={Boolean(completed)} /></button>
      {open && (
        <div className="top-diagnostic-dropdown" role="menu" aria-label={title}>
          {actions.map((action) => (
            <button key={action.id} type="button" role="menuitem" onClick={() => void run(action)}>
              <strong>{action.label}</strong>
              {action.description && <small>{action.description}</small>}
            </button>
          ))}
          <button type="button" role="menuitem" disabled={publishing || actions.length === 0} onClick={() => void publish()}>
            <strong>{publishing ? 'Publishing…' : 'Publish diagnostics'}</strong>
            <small>Save the current diagnostic set for direct support and debugging from ChatGPT</small>
          </button>
          {error && <small role="alert">{error}</small>}
        </div>
      )}
    </div>
  )
}
