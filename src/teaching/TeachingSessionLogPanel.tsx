import { useEffect, useMemo, useState } from 'react'
import {
  closeSessionLogChannel,
  diffSessionState,
  fetchSessionLogEntries,
  fetchStandaloneSessionLogEntries,
  filterSessionStateChanges,
  getStandaloneSessionLogRunId,
  subscribeToSessionLogEntries,
  subscribeToStandaloneSessionLogEntries,
  type SessionLogEntry,
  type SessionLogStateChange,
} from './session/sessionLog'
import './TeachingSessionLogPanel.css'

interface TeachingSessionLogPanelProps { productId: string; sessionId: string | null }
interface DisplayRow { key: string; entry: SessionLogEntry; subject: string; message: string }

const FRIENDLY_SETTING_NAMES: Record<string, string> = {
  fio2: 'FiO₂',
  peep: 'PEEP',
  rate: 'rate',
  tidalVolume: 'tidal volume',
  inspiratoryTime: 'inspiratory time',
  inspiratoryFlow: 'inspiratory flow',
  pressureControl: 'pressure control',
  pressureSupport: 'pressure support',
  mode: 'mode',
  heartRate: 'heart rate',
  systolicPressure: 'systolic pressure',
  diastolicPressure: 'diastolic pressure',
  spo2: 'SpO₂',
  temperatureC: 'temperature',
  simulationPaused: 'simulation pause',
  simulationSpeed: 'simulation speed',
}

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
function shortValue(value: unknown): string {
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100)
  if (typeof value === 'boolean') return value ? 'on' : 'off'
  if (value == null) return '—'
  if (typeof value === 'string') return value
  try { return JSON.stringify(value) } catch { return String(value) }
}
function settingName(change: SessionLogStateChange): string {
  const leaf = change.path.split('.').pop() ?? change.path
  return FRIENDLY_SETTING_NAMES[leaf] ?? leaf.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()
}
function subjectFor(entry: SessionLogEntry): string {
  if (entry.actor_role === 'standalone') return 'Standalone'
  if (entry.actor_role === 'instructor') return 'All candidates'
  return entry.actor_name || 'Candidate'
}
function actorFor(entry: SessionLogEntry): string {
  if (entry.actor_role === 'standalone') return 'Standalone'
  if (entry.actor_role === 'instructor') return 'Instructor'
  return entry.actor_name || 'Candidate'
}
function humanSettingMessage(entry: SessionLogEntry, change: SessionLogStateChange): string {
  const name = settingName(change)
  const values = `${shortValue(change.from)} → ${shortValue(change.to)}`
  return entry.actor_role === 'standalone'
    ? `${name} ${values}`
    : `${name} ${values}, changed by ${actorFor(entry)}`
}
function humanEventMessage(entry: SessionLogEntry): string {
  if (entry.actor_role === 'standalone') return entry.label
  return `${entry.label} by ${actorFor(entry)}`
}
function displayRows(entries: SessionLogEntry[]): DisplayRow[] {
  const rows: DisplayRow[] = []
  for (const entry of entries) {
    if (entry.category === 'settings') {
      const before = entry.details?.before
      const after = entry.details?.after
      if (before != null && after != null) {
        const changes = filterSessionStateChanges(before, after, diffSessionState(before, after))
        if (!changes.length) continue
        changes.forEach((change, index) => rows.push({
          key: `${entry.id}:setting:${index}`,
          entry,
          subject: subjectFor(entry),
          message: humanSettingMessage(entry, change),
        }))
        continue
      }
    }
    rows.push({ key: `${entry.id}:event`, entry, subject: subjectFor(entry), message: humanEventMessage(entry) })
  }
  return rows
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

  const rows = useMemo(() => displayRows(entries), [entries])
  const csv = useMemo(() => {
    const csvRows = [
      ['time', 'subject', 'event', 'actor', 'role', 'category', 'details'],
      ...rows.map((row) => [
        row.entry.client_occurred_at || row.entry.created_at,
        row.subject,
        row.message,
        actorFor(row.entry),
        row.entry.actor_role,
        row.entry.category,
        row.entry.details,
      ]),
    ]
    return `${csvRows.map((row) => row.map(csvCell).join(',')).join('\n')}\n`
  }, [rows])

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
          ) : rows.length === 0 ? (
            <div className="teaching-session-log-empty">{standalone ? 'Standalone logging is active. Actions will appear here as they occur.' : 'No session log entries yet.'}</div>
          ) : (
            <div className="teaching-session-log-list" role="log" aria-live="polite">
              {rows.map((row) => (
                <div className={`teaching-session-log-entry category-${row.entry.category}`} key={row.key}>
                  <time dateTime={row.entry.client_occurred_at || row.entry.created_at}>{displayTime(row.entry)}</time>
                  <strong><span className="teaching-session-log-subject">{row.subject}:</span> {row.message}</strong>
                </div>
              ))}
            </div>
          )}
          {error && <div className="teaching-session-log-error">{error}</div>}
          <div className="teaching-session-log-actions">
            <button type="button" className="teaching-library-save" onClick={saveLog} disabled={!rows.length}>Save log</button>
            <small>{rows.length} {rows.length === 1 ? 'entry' : 'entries'} · {sessionId ? `Session ${sessionId.slice(0, 8)}…` : `Standalone ${standaloneRunId?.slice(0, 8)}… · local only`}</small>
          </div>
        </div>
      )}
    </section>
  )
}
