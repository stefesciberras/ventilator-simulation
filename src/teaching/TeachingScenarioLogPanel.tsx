import { useState } from 'react'
import './TeachingScenarioLogPanel.css'

interface TeachingScenarioLogPanelProps {
  productId: string
  sessionId: string | null
}

function safeFilePart(value: string) {
  return value.replace(/[^a-z0-9-_]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'edusim'
}

export function TeachingScenarioLogPanel({ productId, sessionId }: TeachingScenarioLogPanelProps) {
  const [collapsed, setCollapsed] = useState(true)

  const saveLog = () => {
    const csv = 'time,event,details\n'
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').replace('Z', '')
    anchor.href = url
    anchor.download = `${safeFilePart(productId)}-scenario-log-${stamp}.csv`
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
  }

  return (
    <section className="teaching-prompt-instructor teaching-scenario-log" aria-label="Scenario log">
      <div className="teaching-prompt-section-heading teaching-scenario-log-heading" onClick={() => setCollapsed((value) => !value)}>
        <div><h3>Scenario Log</h3></div>
        <div className="teaching-prompt-heading-actions">
          <button
            type="button"
            className={`teaching-workspace-collapse ${collapsed ? 'collapsed' : 'expanded'}`}
            onClick={(event) => { event.stopPropagation(); setCollapsed((value) => !value) }}
            aria-expanded={!collapsed}
            aria-label={collapsed ? 'Expand Scenario Log' : 'Collapse Scenario Log'}
          ><span className="teaching-collapse-caret" aria-hidden="true" /></button>
        </div>
      </div>
      {!collapsed && (
        <div className="teaching-scenario-log-body">
          <div className="teaching-scenario-log-empty">No scenario log entries yet.</div>
          <div className="teaching-scenario-log-actions">
            <button type="button" className="teaching-library-save" onClick={saveLog}>Save log</button>
            {sessionId && <small>Session {sessionId.slice(0, 8)}…</small>}
          </div>
        </div>
      )}
    </section>
  )
}
