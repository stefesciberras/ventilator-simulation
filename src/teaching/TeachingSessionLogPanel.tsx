import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  clearStandaloneSessionLog,
  closeSessionLogChannel,
  diffSessionState,
  fetchSessionLogEntries,
  fetchStandaloneSessionLogEntries,
  filterSessionStateChanges,
  getStandaloneSessionLogRunId,
  recordSessionLogEvent,
  subscribeToSessionLogEntries,
  subscribeToStandaloneSessionLogEntries,
  type SessionLogActorRole,
  type SessionLogEntry,
  type SessionLogStateChange,
} from './session/sessionLog'
import type { TeachingRole } from './types'
import './TeachingSessionLogPanel.css'

interface TeachingSessionLogPanelProps { productId: string; sessionId: string | null; role: TeachingRole }
interface DisplayRow { key: string; entry: SessionLogEntry; subject: string; message: string }
interface DragState { pointerId: number; startX: number; startY: number; originX: number; originY: number; baseLeft: number; baseTop: number; width: number; height: number }

const FRIENDLY_SETTING_NAMES: Record<string, string> = {
  fio2: 'FiO₂', peep: 'PEEP', rate: 'rate', tidalVolume: 'tidal volume', inspiratoryTime: 'inspiratory time', inspiratoryFlow: 'inspiratory flow', pressureControl: 'pressure control', pressureSupport: 'pressure support', mode: 'mode', heartRate: 'heart rate', systolicPressure: 'systolic pressure', diastolicPressure: 'diastolic pressure', spo2: 'SpO₂', temperatureC: 'temperature', simulationPaused: 'simulation pause', simulationSpeed: 'simulation speed', ventilatorMode: 'ventilator mode', ventilatorSetRate: 'ventilator rate', ventilatorSetTidalVolumeMl: 'tidal volume', peepCmH2O: 'PEEP',
}

function safeFilePart(value: string) { return value.replace(/[^a-z0-9-_]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'edusim' }
function csvCell(value: unknown): string { const text = typeof value === 'string' ? value : JSON.stringify(value ?? ''); return `"${text.replace(/"/g, '""')}"` }
function mergeEntries(current: SessionLogEntry[], incoming: SessionLogEntry[]): SessionLogEntry[] { const byId = new Map<number, SessionLogEntry>(); for (const entry of current) byId.set(entry.id, entry); for (const entry of incoming) byId.set(entry.id, entry); return [...byId.values()].sort((a, b) => a.id - b.id) }
function displayTime(entry: SessionLogEntry): string { const date = new Date(entry.client_occurred_at || entry.created_at); return Number.isNaN(date.getTime()) ? '—' : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) }
function shortValue(value: unknown): string { if (typeof value === 'number') return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100); if (typeof value === 'boolean') return value ? 'on' : 'off'; if (value == null) return '—'; if (typeof value === 'string') return value; try { return JSON.stringify(value) } catch { return String(value) } }
function settingName(change: SessionLogStateChange): string { const leaf = change.path.split('.').pop() ?? change.path; return FRIENDLY_SETTING_NAMES[leaf] ?? leaf.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase() }
function logicalActorRole(entry: SessionLogEntry): SessionLogActorRole {
  const explicit = entry.details?._originRole
  if (explicit === 'candidate' || explicit === 'instructor' || explicit === 'standalone') return explicit
  if (entry.event_type.startsWith('candidate.')) return 'candidate'
  if (entry.event_type.startsWith('instructor.')) return 'instructor'
  return entry.actor_role
}
function actorFor(entry: SessionLogEntry): string {
  const logicalRole = logicalActorRole(entry)
  if (logicalRole === 'standalone') return 'Standalone'
  if (logicalRole === 'instructor') return 'Instructor'
  return entry.actor_role === 'candidate' && entry.actor_name ? entry.actor_name : 'Candidate'
}
function subjectFor(entry: SessionLogEntry, simulationMode: boolean): string {
  if (simulationMode && logicalActorRole(entry) !== 'standalone') return 'Shared simulation'
  const logicalRole = logicalActorRole(entry)
  if (logicalRole === 'standalone') return 'Standalone'
  if (logicalRole === 'instructor') return 'All candidates'
  return entry.actor_role === 'candidate' && entry.actor_name ? entry.actor_name : 'Candidate'
}
function humanSettingMessage(entry: SessionLogEntry, change: SessionLogStateChange): string { const message = `${settingName(change)} ${shortValue(change.from)} → ${shortValue(change.to)}`; return logicalActorRole(entry) === 'standalone' ? message : `${message}, changed by ${actorFor(entry)}` }
function humanEventMessage(entry: SessionLogEntry): string {
  if (entry.event_type === 'candidate.joined' || entry.event_type === 'session.started' || entry.event_type === 'session.ended') return entry.label
  if (logicalActorRole(entry) === 'standalone') return entry.label
  return `${entry.label} by ${actorFor(entry)}`
}
function afterLatestClear(entries: SessionLogEntry[]): SessionLogEntry[] { let last = -1; entries.forEach((entry, index) => { if (entry.event_type === 'session.log.cleared') last = index }); return last >= 0 ? entries.slice(last + 1) : entries }
function actionDedupeKey(entry: SessionLogEntry): string | null {
  if (!entry.event_type.startsWith('action.')) return null
  const actionId = typeof entry.details?.actionId === 'string' ? entry.details.actionId : ''
  const simulationTime = typeof entry.simulation_time_seconds === 'number' ? Math.round(entry.simulation_time_seconds * 10) / 10 : null
  return `${entry.event_type}|${actionId}|${simulationTime ?? entry.label}`
}
function dedupeReplicatedActions(entries: SessionLogEntry[]): SessionLogEntry[] {
  const byKey = new Map<string, SessionLogEntry>()
  const passthrough: SessionLogEntry[] = []
  for (const entry of entries) {
    const key = actionDedupeKey(entry)
    if (!key) { passthrough.push(entry); continue }
    const existing = byKey.get(key)
    if (!existing || (logicalActorRole(existing) !== 'candidate' && logicalActorRole(entry) === 'candidate')) byKey.set(key, entry)
  }
  return [...passthrough, ...byKey.values()].sort((a, b) => a.id - b.id)
}
function displayRows(entries: SessionLogEntry[], simulationMode: boolean): DisplayRow[] {
  const rows: DisplayRow[] = []
  for (const entry of dedupeReplicatedActions(afterLatestClear(entries))) {
    if (entry.event_type === 'session.log.cleared') continue
    if (entry.category === 'settings') {
      const before = entry.details?.before
      const after = entry.details?.after
      if (before != null && after != null) {
        const changes = filterSessionStateChanges(before, after, diffSessionState(before, after))
        if (!changes.length) continue
        changes.forEach((change, index) => rows.push({ key: `${entry.id}:setting:${index}`, entry, subject: subjectFor(entry, simulationMode), message: humanSettingMessage(entry, change) }))
        continue
      }
    }
    rows.push({ key: `${entry.id}:event`, entry, subject: subjectFor(entry, simulationMode), message: humanEventMessage(entry) })
  }
  return rows.reverse()
}

function LogRows({ rows, viewer = false }: { rows: DisplayRow[]; viewer?: boolean }) {
  return <div className={`teaching-session-log-list${viewer ? ' teaching-session-log-viewer-list' : ''}`} role="log" aria-live="polite">
    {rows.map((row) => <div className={`teaching-session-log-entry category-${row.entry.category}`} key={row.key}>
      <time dateTime={row.entry.client_occurred_at || row.entry.created_at}>{displayTime(row.entry)}</time>
      <strong><span className="teaching-session-log-subject">{row.subject}:</span> {row.message}</strong>
    </div>)}
  </div>
}

export function TeachingSessionLogPanel({ productId, sessionId, role }: TeachingSessionLogPanelProps) {
  const [collapsed, setCollapsed] = useState(true)
  const [entries, setEntries] = useState<SessionLogEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [viewerOpen, setViewerOpen] = useState(false)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const dragRef = useRef<DragState | null>(null)
  const standalone = !sessionId
  const standaloneRunId = standalone ? getStandaloneSessionLogRunId(productId) : null
  const canClear = role === 'instructor' || role === 'standalone'
  const simulationMode = typeof document !== 'undefined' && document.documentElement.dataset.loppjusimRuntimeMode === 'simulation'

  useEffect(() => {
    setEntries([]); setError(null)
    if (!sessionId) { setEntries(fetchStandaloneSessionLogEntries(productId)); return subscribeToStandaloneSessionLogEntries(productId, (entry) => setEntries((current) => mergeEntries(current, [entry]))) }
    let active = true
    setLoading(true)
    const channel = subscribeToSessionLogEntries(sessionId, (entry) => { if (active) setEntries((current) => mergeEntries(current, [entry])) })
    void fetchSessionLogEntries(sessionId).then((rows) => { if (active) setEntries((current) => mergeEntries(current, rows)) }).catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : 'Unable to load session log.') }).finally(() => { if (active) setLoading(false) })
    return () => { active = false; void closeSessionLogChannel(channel) }
  }, [productId, sessionId])

  const rows = useMemo(() => displayRows(entries, simulationMode), [entries, simulationMode])
  const csv = useMemo(() => {
    const csvRows = [['time', 'subject', 'event', 'actor', 'role', 'category', 'details'], ...rows.map((row) => [row.entry.client_occurred_at || row.entry.created_at, row.subject, row.message, actorFor(row.entry), logicalActorRole(row.entry), row.entry.category, row.entry.details])]
    return `${csvRows.map((row) => row.map(csvCell).join(',')).join('\n')}\n`
  }, [rows])

  const saveLog = () => {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' }); const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); const stamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').replace('Z', ''); anchor.href = url; anchor.download = `${safeFilePart(productId)}-session-log-${stamp}.csv`; document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url)
  }

  const clearLog = async () => {
    if (!canClear) return
    if (!sessionId) { clearStandaloneSessionLog(productId); setEntries([]); return }
    try {
      await recordSessionLogEvent({ category: 'session', eventType: 'session.log.cleared', label: 'Session log cleared', sessionId })
      setEntries(await fetchSessionLogEntries(sessionId))
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to clear session log.') }
  }

  const openViewer = () => { setPosition({ x: 0, y: 0 }); setViewerOpen(true) }
  const startDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (window.innerWidth < 900 || (event.target as HTMLElement).closest('button, input')) return
    const panel = event.currentTarget.closest('.teaching-session-log-viewer') as HTMLElement | null
    if (!panel) return
    const rect = panel.getBoundingClientRect()
    dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, originX: position.x, originY: position.y, baseLeft: rect.left - position.x, baseTop: rect.top - position.y, width: rect.width, height: rect.height }
    event.currentTarget.setPointerCapture?.(event.pointerId); event.preventDefault()
  }
  const moveDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current; if (!drag || drag.pointerId !== event.pointerId || window.innerWidth < 900) return
    const margin = 12; const x = drag.originX + event.clientX - drag.startX; const y = drag.originY + event.clientY - drag.startY
    setPosition({ x: Math.max(margin - drag.baseLeft, Math.min(window.innerWidth - margin - drag.baseLeft - drag.width, x)), y: Math.max(margin - drag.baseTop, Math.min(window.innerHeight - margin - drag.baseTop - drag.height, y)) }); event.preventDefault()
  }
  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => { if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null; if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture?.(event.pointerId) }

  const panelActions = <div className="teaching-session-log-action-buttons">
    <button type="button" className="teaching-library-save" onClick={saveLog} disabled={!rows.length}>Save log</button>
    <button type="button" className="teaching-library-save" onClick={openViewer}>Open viewer</button>
    {canClear && <button type="button" className="teaching-library-save teaching-session-log-clear" onClick={() => void clearLog()} disabled={!rows.length}>Clear log</button>}
  </div>

  const viewerActions = <div className="teaching-session-log-action-buttons">
    <button type="button" className="teaching-library-save" onClick={saveLog} disabled={!rows.length}>Save log</button>
    {canClear && <button type="button" className="teaching-library-save teaching-session-log-clear" onClick={() => void clearLog()} disabled={!rows.length}>Clear log</button>}
  </div>

  return <>
    <section className="teaching-prompt-instructor teaching-session-log" aria-label="Session log">
      <div className="teaching-prompt-section-heading teaching-session-log-heading" onClick={() => setCollapsed((value) => !value)}><div><h3>Session Log</h3></div><div className="teaching-prompt-heading-actions"><button type="button" className={`teaching-workspace-collapse ${collapsed ? 'collapsed' : 'expanded'}`} onClick={(event) => { event.stopPropagation(); setCollapsed((value) => !value) }} aria-expanded={!collapsed} aria-label={collapsed ? 'Expand Session Log' : 'Collapse Session Log'}><span className="teaching-collapse-caret" aria-hidden="true" /></button></div></div>
      {!collapsed && <div className="teaching-session-log-body">
        {loading && entries.length === 0 ? <div className="teaching-session-log-empty">Loading session log…</div> : rows.length === 0 ? <div className="teaching-session-log-empty">{standalone ? 'Standalone logging is active. Actions will appear here as they occur.' : 'No session log entries yet.'}</div> : <LogRows rows={rows} />}
        {error && <div className="teaching-session-log-error">{error}</div>}
        <div className="teaching-session-log-actions">{panelActions}<small>{rows.length} {rows.length === 1 ? 'entry' : 'entries'} · {sessionId ? `Session ${sessionId.slice(0, 8)}…` : `Standalone ${standaloneRunId?.slice(0, 8)}… · local only`}</small></div>
      </div>}
    </section>
    {viewerOpen && createPortal(<div className="teaching-session-log-viewer-overlay" role="presentation">
      <section className="teaching-session-log-viewer" role="dialog" aria-modal="false" aria-label="Session Log viewer" style={{ transform: `translate(${position.x}px, ${position.y}px)` }}>
        <div className="teaching-session-log-viewer-header" onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag} title="Drag to move on wide screens"><div><span>Teaching</span><strong>Session Log</strong></div><button type="button" className="teaching-session-log-close" onClick={() => setViewerOpen(false)} aria-label="Close Session Log">×</button></div>
        <div className="teaching-session-log-viewer-stage">{rows.length ? <LogRows rows={rows} viewer /> : <div className="teaching-session-log-empty">No session log entries yet.</div>}</div>
        {error && <div className="teaching-session-log-error teaching-session-log-viewer-error">{error}</div>}
        <div className="teaching-session-log-viewer-footer">{viewerActions}<small>{rows.length} {rows.length === 1 ? 'entry' : 'entries'}</small></div>
      </section>
    </div>, document.body)}
  </>
}
