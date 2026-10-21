import { useEffect, useRef, useState } from 'react'

export interface SimulationDiagnosticAction {
  id: string
  label: string
  description?: string
  onSelect: () => void | Promise<void>
}

function DiagnosticIcon({ copied }: { copied: boolean }) {
  return copied ? (
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6.5 12.5 3.2 3.2 7.8-8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
  ) : (
    <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4.5" width="16" height="15" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="M6.5 13h2.2l1.4-4 2.1 7 1.6-4h3.7" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
  )
}

export function SimulationDiagnosticsMenu({ actions, title = 'Diagnostics' }: { actions: SimulationDiagnosticAction[]; title?: string }) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
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

  const run = async (action: SimulationDiagnosticAction) => {
    await action.onSelect()
    setCopied(action.id)
    setOpen(false)
    window.setTimeout(() => setCopied((current) => current === action.id ? null : current), 1800)
  }

  return (
    <div ref={menuRef} className="top-diagnostic-menu">
      <button
        className={`top-diagnostic-button ${open ? 'active' : ''} ${copied ? 'copied' : ''}`}
        type="button"
        onClick={() => setOpen((value) => !value)}
        title={copied ? 'Diagnostics copied' : title}
        aria-label={`Open ${title.toLowerCase()} menu`}
        aria-haspopup="menu"
        aria-expanded={open}
      ><DiagnosticIcon copied={Boolean(copied)} /></button>
      {open && (
        <div className="top-diagnostic-dropdown" role="menu" aria-label={title}>
          {actions.map((action) => (
            <button key={action.id} type="button" role="menuitem" onClick={() => void run(action)}>
              <strong>{action.label}</strong>
              {action.description && <small>{action.description}</small>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
