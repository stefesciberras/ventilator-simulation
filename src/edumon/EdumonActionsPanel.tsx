import { useState, type ReactNode } from 'react'
import './edumon-actions.css'

export type EdumonActionSectionId = 'drugs' | 'events'

interface EdumonActionSectionProps {
  id: EdumonActionSectionId
  title: string
  children?: ReactNode
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

export function EdumonActionsPanel() {
  return (
    <div className="edumon-actions-panel" aria-label="Clinical actions">
      <EdumonActionSection id="drugs" title="Drugs" />
      <EdumonActionSection id="events" title="Events" />
    </div>
  )
}
