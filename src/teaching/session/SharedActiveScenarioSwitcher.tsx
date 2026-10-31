import { useEffect, useMemo, useState } from 'react'
import type { SharedInstructorStartConfig } from './SharedSessionModePanel'

interface SharedActiveScenarioSwitcherProps {
  config: SharedInstructorStartConfig
  open: boolean
  onClose: () => void
}

export function SharedActiveScenarioSwitcher({ config, open, onClose }: SharedActiveScenarioSwitcherProps) {
  const options = config.savedOptions ?? []
  const kindsAvailable = options.some((option) => option.kind != null)
  const staticCount = options.filter((option) => (option.kind ?? 'static') === 'static').length
  const dynamicCount = options.filter((option) => option.kind === 'dynamic').length
  const [kind, setKind] = useState<'static' | 'dynamic'>(() => staticCount > 0 ? 'static' : 'dynamic')
  const selectedId = config.selectedSavedId ?? options[0]?.id ?? ''
  const visibleOptions = useMemo(
    () => kindsAvailable ? options.filter((option) => (option.kind ?? 'static') === kind) : options,
    [kind, kindsAvailable, options],
  )
  const selected = visibleOptions.find((option) => option.id === selectedId) ?? visibleOptions[0] ?? null

  useEffect(() => {
    if (!open || !kindsAvailable) return
    if (kind === 'static' && staticCount === 0 && dynamicCount > 0) setKind('dynamic')
    if (kind === 'dynamic' && dynamicCount === 0 && staticCount > 0) setKind('static')
  }, [open, kindsAvailable, kind, staticCount, dynamicCount])

  useEffect(() => {
    if (selected && selected.id !== selectedId) config.onSelectedSavedIdChange?.(selected.id)
  }, [config, selected?.id, selectedId])

  if (!open) return null

  const switchScenario = async () => {
    if (!selected || !config.onLoadSaved) return
    await config.onLoadSaved(selected.id)
    onClose()
  }

  return <div className="session-scenario-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose() }}>
    <section className="session-scenario-modal" role="dialog" aria-modal="true" aria-label="Switch scenario">
      <div className="session-scenario-modal-heading"><div><span>Active session</span><strong>Switch scenario</strong></div><button type="button" className="session-start-close" onClick={onClose} aria-label="Close scenarios">×</button></div>
      <p className="session-start-note">The current session key and connected participants will be retained. The selected scenario starts at Stage 1.</p>
      {kindsAvailable && <div className="session-scenario-kind-tabs">
        <button type="button" className={kind === 'static' ? 'selected' : ''} disabled={staticCount === 0} onClick={() => setKind('static')}>Static ({staticCount})</button>
        <button type="button" className={kind === 'dynamic' ? 'selected' : ''} disabled={dynamicCount === 0} onClick={() => setKind('dynamic')}>Dynamic ({dynamicCount})</button>
      </div>}
      <div className="session-scenario-modal-list">
        {visibleOptions.length ? visibleOptions.map((option) => <button type="button" key={option.id} className={`session-scenario-modal-option ${selected?.id === option.id ? 'selected' : ''}`} onClick={() => config.onSelectedSavedIdChange?.(option.id)}>
          <div><strong>{option.title}</strong>{option.summary && <small>{option.summary}</small>}{option.chips?.length ? <div className="session-start-summary-chips">{option.chips.map((chip) => <em key={chip}>{chip}</em>)}</div> : null}</div>
          {option.kind && <span className="session-scenario-kind-badge">{option.kind}</span>}
        </button>) : <div className="session-scenario-modal-empty">No {kindsAvailable ? `${kind} ` : ''}scenarios available.</div>}
      </div>
      <div className="session-scenario-modal-actions">
        <button type="button" className="session-secondary-button" onClick={onClose}>Cancel</button>
        <button type="button" className="session-primary-button" disabled={!selected || !config.onLoadSaved || config.savedBusy} onClick={() => void switchScenario()}>Switch scenario</button>
      </div>
      {config.savedMessage && <div className="account-message">{config.savedMessage}</div>}
    </section>
  </div>
}
