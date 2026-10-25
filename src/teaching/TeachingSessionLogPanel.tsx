import { useEffect, useMemo, useState } from 'react'
import {
  closeSessionLogChannel,
  diffSessionState,
  fetchSessionLogEntries,
  fetchStandaloneSessionLogEntries,
  getStandaloneSessionLogRunId,
  settingChangesLabel,
  subscribeToSessionLogEntries,
  subscribeToStandaloneSessionLogEntries,
  type SessionLogEntry,
} from './session/sessionLog'
import './TeachingSessionLogPanel.css'

interface TeachingSessionLogPanelProps { productId: string; sessionId: string | null }

function safeFilePart(value: string) { return value.replace(/[^a-z0-9-_]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'edusim' }
function csvCell(value: unknown): string {
  const text = typeof value === 'string' ? value : JSON.stringify(value ?? '')
  return `"${text.replace(/"/g, '""')}"`
}
function mergeEntries(current: SessionLogEntry[], incoming: SessionLogEntry[]): SessionLogEntry[] {
  const byId = new Map<number, SessionLogEntry>()
  for (const entry of current) byId.set(entry.id, entry)
  for (const entry of incoming) byId.set(entry.id, entry)
  return [...byId.values()].sort((a, b) => a.id - b.id)
}
function displayTime(entry: SessionLogEntry): string {
  const date = new Date(entry.client_occurred_at || entry.created_at)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
}
function displayLabel(entry: SessionLogEntry): string {
  if (entry.category !== 'settings') return entry.label
  const before = entry.details?.before
  const after = entry.details?.after
  if (before == null || after == null) return entry.label
  const changes = diffSessionState(before, after)
  return changes.length ? settingChangesLabel(entry.label.replace(/ changed$/i, ''), changes) : entry.label
}

export function TeachingSessionLogPanel({ productId, sessionId }: TeachingSessionLogPanelProps) {
  const [collapsed, setCollapsed] = useState(true)
  const [entries, setEntries] = useState<SessionLogEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const standalone = !sessionId
  const standaloneRunId = standalone ? getStandaloneSessionLogRunId(productId) : null

  useEffect(() => {
    setEntries([])
    setError(null)
    if (!sessionId) {
      setEntries(fetchStandaloneSessionLogEntries(productId))
      return subscribeToStandaloneSessionLogEntries(productId, (entry) => setEntries((current) => mergeEntries(current, [entry])))
    }

    let active = true
    setLoading(true)
    const channel = subscribeToSessionLogEntries(sessionId, (entry) => { if (active) setEntries((current) => mergeEntries(current, [entry])) })
    void fetchSessionLogEntries(sessionId)
      .then((rows) => { if (active) setEntries((current) => mergeEntries(current, rows)) })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : 'Unable to load session log.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false; void closeSessionLogChannel(channel) }
  }, [productId, sessionId])

  const csv = useMemo(() => {
    const rows = [
      ['time', 'actor', 'role', 'category', 'event', 'details'],
      ...entries.map((entry) => [entry.client_occurred_at || entry.created_at, entry.actor_name, entry.actor_role, entry.category, displayLabel(entry), entry.details]),
    ]
    return `${rows.map((row) => row.map(csvCell).join(',')).join('\n')}\n`
  }, [entries])

  const saveLog = () => {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').replace('Z', '')
    anchor.href = url
    anchor.download = `${safeFilePart(productId)}-session-log-${stamp}.csv`
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
  }

  return (
    <section className="teaching-prompt-instructor teaching-session-log" aria-label="Session log">
      <div className="teaching-prompt-section-heading teaching-session-log-heading" onClick={() => setCollapsed((value) => !value)}>
        <div><h3>Session Log</h3></div>
        <div className="teaching-prompt-heading-actions">
          <button type="button" className={`teaching-workspace-collapse ${collapsed ? 'collapsed' : 'expanded'}`} onClick={(event) => { event.stopPropagation(); setCollapsed((value) => !value) }} aria-expanded={!collapsed} aria-label={collapsed ? 'Expand Session Log' : 'Collapse Session Log'}><span className="teaching-collapse-caret" aria-hidden="true" /></button>
        </div>
      </div>
      {!collapsed && (
        <div className="teaching-session-log-body">
          {loading && entries.length === 0 ? (
            <div className="teaching-session-log-empty">Loading session log…</div>
          ) : entries.length === 0 ? (
            <div className="teaching-session-log-empty">{standalone ? 'Standalone logging is active. Actions will appear here as they occur.' : 'No session log entries yet.'}</div>
          ) : (
            <div className="teaching-session-log-list" role="log" aria-live="polite">
              {entries.map((entry) => (
                <div className={`teaching-session-log-entry category-${entry.category}`} key={entry.id}>
                  <time dateTime={entry.client_occurred_at || entry.created_at}>{displayTime(entry)}</time>
                  <div className="teaching-session-log-entry-main"><span className="teaching-session-log-actor">{entry.actor_name}</span><strong>{displayLabel(entry)}</strong></div>
                  <small>{entry.category}</small>
                </div>
              ))}
            </div>
          )}
          {error && <div className="teaching-session-log-error">{error}</div>}
          <div className="teaching-session-log-actions">
            <button type="button" className="teaching-library-save" onClick={saveLog} disabled={!entries.length}>Save log</button>
            <small>{entries.length} {entries.length === 1 ? 'entry' : 'entries'} · {sessionId ? `Session ${sessionId.slice(0, 8)}…` : `Standalone ${standaloneRunId?.slice(0, 8)}… · local only`}</small>
          </div>
        </div>
      )}
    </section>
  )
}
