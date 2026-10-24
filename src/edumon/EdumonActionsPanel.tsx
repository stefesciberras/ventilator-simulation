import { useEffect, useRef, useState, type ReactNode } from 'react'
import './edumon-actions.css'

export type EdumonActionSectionId = 'drugs' | 'events'
export type EdumonDrugActionId = 'propofol' | 'fentanyl' | 'relaxant' | 'tiva'
export type EdumonEventActionId = 'induction' | 'maintenance' | 'awakening'
export type EdumonActionMode = 'momentary' | 'toggle'

interface EdumonActionSectionProps {
  id: EdumonActionSectionId
  title: string
  children?: ReactNode
}

interface EdumonActionButtonProps<T extends string> {
  id: T
  label: string
  mode: EdumonActionMode
  active: boolean
  onSelect: (id: T, mode: EdumonActionMode) => void
}

function EdumonActionSection({ id, title, children }: EdumonActionSectionProps) {
  const [collapsed, setCollapsed] = useState(true)

  return (
    <section className="edumon-action-section" aria-label={title} data-action-section={id}>
      <div className="edumon-action-section-heading">
        <div><h3>{title}</h3></div>
        <button
          type="button"
          className={`edumon-action-collapse ${collapsed ? 'collapsed' : 'expanded'}`}
          onClick={() => setCollapsed((value) => !value)}
          aria-expanded={!collapsed}
          aria-label={collapsed ? `Expand ${title}` : `Collapse ${title}`}
        >
          <span className="edumon-action-collapse-caret" aria-hidden="true" />
        </button>
      </div>

      {!collapsed && (
        <div className="edumon-action-section-body">
          {children ?? <div className="edumon-action-empty">Controls will be added here.</div>}
        </div>
      )}
    </section>
  )
}

function EdumonActionButton<T extends string>({ id, label, mode, active, onSelect }: EdumonActionButtonProps<T>) {
  return (
    <button
      type="button"
      className={`edumon-action-button ${mode} ${active ? 'active' : ''}`.trim()}
      aria-pressed={mode === 'toggle' ? active : undefined}
      onClick={() => onSelect(id, mode)}
    >
      {label}
    </button>
  )
}

export function EdumonActionsPanel() {
  const [tivaActive, setTivaActive] = useState(false)
  const [flashingDrug, setFlashingDrug] = useState<Exclude<EdumonDrugActionId, 'tiva'> | null>(null)
  const [flashingEvent, setFlashingEvent] = useState<EdumonEventActionId | null>(null)
  const drugTimerRef = useRef<number | null>(null)
  const eventTimerRef = useRef<number | null>(null)

  useEffect(() => () => {
    if (drugTimerRef.current != null) window.clearTimeout(drugTimerRef.current)
    if (eventTimerRef.current != null) window.clearTimeout(eventTimerRef.current)
  }, [])

  const triggerDrug = (id: EdumonDrugActionId, mode: EdumonActionMode) => {
    if (mode === 'toggle' && id === 'tiva') {
      setTivaActive((current) => !current)
      return
    }

    if (id === 'tiva') return
    setFlashingDrug(id)
    if (drugTimerRef.current != null) window.clearTimeout(drugTimerRef.current)
    drugTimerRef.current = window.setTimeout(() => {
      drugTimerRef.current = null
      setFlashingDrug(null)
    }, 1000)
  }

  const triggerEvent = (id: EdumonEventActionId) => {
    setFlashingEvent(id)
    if (eventTimerRef.current != null) window.clearTimeout(eventTimerRef.current)
    eventTimerRef.current = window.setTimeout(() => {
      eventTimerRef.current = null
      setFlashingEvent(null)
    }, 1000)
  }

  return (
    <div className="edumon-actions-panel" aria-label="Clinical actions">
      <EdumonActionSection id="drugs" title="Drugs">
        <div className="edumon-action-grid" role="group" aria-label="Drug actions">
          <EdumonActionButton id="propofol" label="Propofol" mode="momentary" active={flashingDrug === 'propofol'} onSelect={triggerDrug} />
          <EdumonActionButton id="fentanyl" label="Fentanyl" mode="momentary" active={flashingDrug === 'fentanyl'} onSelect={triggerDrug} />
          <EdumonActionButton id="relaxant" label="Relaxant" mode="momentary" active={flashingDrug === 'relaxant'} onSelect={triggerDrug} />
          <EdumonActionButton id="tiva" label="TIVA" mode="toggle" active={tivaActive} onSelect={triggerDrug} />
        </div>
      </EdumonActionSection>

      <EdumonActionSection id="events" title="Events">
        <div className="edumon-action-grid" role="group" aria-label="Event actions">
          <EdumonActionButton id="induction" label="Induction" mode="momentary" active={flashingEvent === 'induction'} onSelect={(id) => triggerEvent(id)} />
          <EdumonActionButton id="maintenance" label="Maintenance" mode="momentary" active={flashingEvent === 'maintenance'} onSelect={(id) => triggerEvent(id)} />
          <EdumonActionButton id="awakening" label="Awakening" mode="momentary" active={flashingEvent === 'awakening'} onSelect={(id) => triggerEvent(id)} />
        </div>
      </EdumonActionSection>
    </div>
  )
}
