import { useState, type ReactNode } from 'react'
import './edumon-actions.css'

export type EdumonActionSectionId = 'drugs' | 'events'
export type EdumonDrugActionId = 'propofol' | 'fentanyl' | 'relaxant' | 'tiva'
export type EdumonEventActionId = 'induction' | 'maintenance' | 'awakening'

interface EdumonActionSectionProps {
  id: EdumonActionSectionId
  title: string
  children?: ReactNode
}

interface EdumonActionButtonProps<T extends string> {
  id: T
  label: string
  active: boolean
  onSelect: (id: T) => void
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

function EdumonActionButton<T extends string>({ id, label, active, onSelect }: EdumonActionButtonProps<T>) {
  return (
    <button
      type="button"
      className={`edumon-action-button ${active ? 'active' : ''}`.trim()}
      aria-pressed={active}
      onClick={() => onSelect(id)}
    >
      {label}
    </button>
  )
}

export function EdumonActionsPanel() {
  const [selectedDrug, setSelectedDrug] = useState<EdumonDrugActionId | null>(null)
  const [selectedEvent, setSelectedEvent] = useState<EdumonEventActionId | null>(null)

  const selectDrug = (id: EdumonDrugActionId) => setSelectedDrug((current) => current === id ? null : id)
  const selectEvent = (id: EdumonEventActionId) => setSelectedEvent((current) => current === id ? null : id)

  return (
    <div className="edumon-actions-panel" aria-label="Clinical actions">
      <EdumonActionSection id="drugs" title="Drugs">
        <div className="edumon-action-grid" role="group" aria-label="Drug actions">
          <EdumonActionButton id="propofol" label="Propofol" active={selectedDrug === 'propofol'} onSelect={selectDrug} />
          <EdumonActionButton id="fentanyl" label="Fentanyl" active={selectedDrug === 'fentanyl'} onSelect={selectDrug} />
          <EdumonActionButton id="relaxant" label="Relaxant" active={selectedDrug === 'relaxant'} onSelect={selectDrug} />
          <EdumonActionButton id="tiva" label="TIVA" active={selectedDrug === 'tiva'} onSelect={selectDrug} />
        </div>
      </EdumonActionSection>

      <EdumonActionSection id="events" title="Events">
        <div className="edumon-action-grid" role="group" aria-label="Event actions">
          <EdumonActionButton id="induction" label="Induction" active={selectedEvent === 'induction'} onSelect={selectEvent} />
          <EdumonActionButton id="maintenance" label="Maintenance" active={selectedEvent === 'maintenance'} onSelect={selectEvent} />
          <EdumonActionButton id="awakening" label="Awakening" active={selectedEvent === 'awakening'} onSelect={selectEvent} />
        </div>
      </EdumonActionSection>
    </div>
  )
}
