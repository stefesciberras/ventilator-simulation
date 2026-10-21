import type { ReactNode } from 'react'
import type { SimulationDiagnosticAction } from './SimulationDiagnosticsMenu'

export interface SimulationAboutDialogProps {
  open: boolean
  productLabel: string
  title: string
  description: string
  version: string
  onClose: () => void
  diagnostics?: SimulationDiagnosticAction[]
  wakeLock?: {
    supported: boolean
    active: boolean
    enabled: boolean
    setEnabled: (enabled: boolean) => void
  }
  extraContent?: ReactNode
  disclaimer?: string
}

export function SimulationAboutDialog({ open, productLabel, title, description, version, onClose, diagnostics = [], wakeLock, extraContent, disclaimer = 'Educational simulation only — not a medical device and not for clinical decision-making.' }: SimulationAboutDialogProps) {
  if (!open) return null
  return (
    <div className="about-backdrop" onMouseDown={onClose}>
      <section className="about-dialog" role="dialog" aria-modal="true" aria-labelledby="about-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="about-dialog-heading">
          <div><span>{productLabel}</span><h2 id="about-title">{title}</h2></div>
          <button type="button" onClick={onClose} aria-label="Close About">×</button>
        </div>
        <p>{description}</p>
        <div className="about-version-row"><span>Version</span><strong>v{version}</strong></div>
        {wakeLock && (
          <label className="about-wake-row">
            <span><strong>Keep screen awake</strong><small>{wakeLock.supported ? (wakeLock.active ? 'Active' : 'Enabled when the browser permits it') : 'Not supported by this browser'}</small></span>
            <input type="checkbox" checked={wakeLock.enabled} disabled={!wakeLock.supported} onChange={(event) => wakeLock.setEnabled(event.target.checked)} />
          </label>
        )}
        {diagnostics.length > 0 && (
          <div className="about-diagnostics">
            <span className="about-section-label">Diagnostics</span>
            <div className="about-diagnostic-actions">
              {diagnostics.map((action) => <button key={action.id} type="button" onClick={() => void action.onSelect()}>{action.label}</button>)}
            </div>
          </div>
        )}
        {extraContent}
        <p className="about-disclaimer">{disclaimer}</p>
      </section>
    </div>
  )
}
