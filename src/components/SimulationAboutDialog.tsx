import type { ReactNode } from 'react'
import type { SimulationDiagnosticAction } from './SimulationDiagnosticsMenu'

export interface SimulationAboutDialogProps {
  open: boolean
  productLabel: string
  title: string
  description: string
  version?: string
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
  legalContext?: 'simulation' | 'authoring'
}

const DEFAULT_SIMULATION_DISCLAIMER = 'For education and simulation training only. LoppjuSIM is educational simulation software and is not intended for use as a medical device, for diagnosis, patient monitoring, treatment, clinical decision-making, or in the care of real patients. Simulated values, waveforms, physiological responses, drug effects, events, scenarios and other outputs are simplified educational representations and may differ from real patients, devices, drugs and clinical environments. Do not rely on LoppjuSIM as a substitute for professional judgement, local protocols, manufacturer instructions, or validated clinical equipment.'

const AUTHORING_DISCLAIMER = 'Content created or edited with this tool is educational simulation content. Authors and instructors are responsible for reviewing its clinical accuracy, educational suitability and local applicability before use. User-authored scenarios, actions and other library content must not be relied upon for real-patient clinical decisions or patient care.'

const PUBLIC_PRODUCT_LABELS: Record<string, string> = {
  EDUSIM: 'LoppjuSIM',
  EDUVENT: 'LoppjuSIM-MV',
  'EDUMON-Ana': 'LoppjuSIM-Anaesth',
  'EDUMON-ICU': 'LoppjuSIM-ICU',
}

export function SimulationAboutDialog({
  open,
  productLabel,
  title,
  description,
  version,
  onClose,
  diagnostics = [],
  wakeLock,
  extraContent,
  disclaimer = DEFAULT_SIMULATION_DISCLAIMER,
  legalContext = 'simulation',
}: SimulationAboutDialogProps) {
  if (!open) return null
  const publicProductLabel = PUBLIC_PRODUCT_LABELS[productLabel] ?? productLabel
  const publicDescription = description.replaceAll('EDUSIM', 'LoppjuSIM').replaceAll('EDUVENT', 'LoppjuSIM-MV').replaceAll('EDUMON-Ana', 'LoppjuSIM-Anaesth').replaceAll('EDUMON-ICU', 'LoppjuSIM-ICU')

  return (
    <div className="about-backdrop" onMouseDown={onClose}>
      <section className="about-dialog" role="dialog" aria-modal="true" aria-labelledby="about-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="about-dialog-heading">
          <div><span>{publicProductLabel}</span><h2 id="about-title">{title}</h2></div>
          <button type="button" onClick={onClose} aria-label="Close About">×</button>
        </div>
        <p>{publicDescription}</p>
        {version && <div className="about-version-row"><span>Version</span><strong>v{version}</strong></div>}
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
        <div className="about-legal" aria-label="Legal and safety information">
          <span className="about-section-label">Important safety information</span>
          <p className="about-disclaimer">{disclaimer}</p>
          {legalContext === 'authoring' && <p className="about-disclaimer">{AUTHORING_DISCLAIMER}</p>}
          <p className="about-copyright">© 2026 Stephen Sciberras. LoppjuSIM. All rights reserved.</p>
        </div>
      </section>
    </div>
  )
}
