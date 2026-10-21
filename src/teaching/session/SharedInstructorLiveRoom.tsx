import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { loadPanelCollapsed, savePanelCollapsed } from '../../panelCollapse'
import type { SharedTeachingMemberRow, SharedTeachingRole } from './types'
import '../../instructor.css'

export interface SharedInstructorLiveRoomProps<TMember extends SharedTeachingMemberRow = SharedTeachingMemberRow> {
  role: SharedTeachingRole
  members: TMember[]
  renderTelemetry?: (member: TMember) => ReactNode
  title?: string
  storageKey?: string
}

function presence(member: SharedTeachingMemberRow, now: number) {
  const lastSeen = new Date(member.last_seen).getTime()
  const ageSeconds = Number.isFinite(lastSeen) ? Math.max(0, Math.round((now - lastSeen) / 1000)) : Number.POSITIVE_INFINITY
  return { ageSeconds, online: ageSeconds <= 30 }
}

export function SharedInstructorLiveRoom<TMember extends SharedTeachingMemberRow>({ role, members, renderTelemetry, title = 'Candidates', storageKey = 'edusim-instructor-live-room' }: SharedInstructorLiveRoomProps<TMember>) {
  const [now, setNow] = useState(() => Date.now())
  const [collapsed, setCollapsed] = useState(() => loadPanelCollapsed(storageKey))

  useEffect(() => {
    if (role !== 'instructor') return
    const timer = window.setInterval(() => setNow(Date.now()), 5000)
    return () => window.clearInterval(timer)
  }, [role])

  const candidates = useMemo(() => members.filter((member) => member.role === 'candidate'), [members])
  const onlineCandidates = candidates.filter((member) => presence(member, now).online).length
  if (role !== 'instructor') return null

  const toggle = () => setCollapsed((current) => { const next = !current; savePanelCollapsed(storageKey, next); return next })

  return <section className={`candidate-roster instructor-live-room ${collapsed ? 'panel-collapsed' : ''}`} aria-label={title}>
    <div className="candidate-roster-heading">
      <div><span className="session-kicker">Live room</span><h3>{title}</h3></div>
      <div className="collapsible-heading-actions"><span>{onlineCandidates}/{candidates.length} online</span><button className="panel-collapse-button" type="button" onClick={toggle} aria-expanded={!collapsed}>{collapsed ? '▾' : '▴'}</button></div>
    </div>
    {candidates.length ? <div className="candidate-card-list">
      {candidates.map((member) => {
        const state = presence(member, now)
        return <article className={`candidate-card ${state.online ? 'online' : 'offline'}`} key={member.id}>
          <div className="candidate-card-heading">
            <div><strong>{member.display_name?.trim() || 'Candidate'}</strong><small>{state.online ? 'Online' : `Last seen ${Number.isFinite(state.ageSeconds) ? `${state.ageSeconds}s ago` : '—'}`}</small></div>
            <span className={`candidate-presence ${state.online ? 'online' : 'offline'}`}><i />{state.online ? 'LIVE' : 'OFFLINE'}</span>
          </div>
          {renderTelemetry ? renderTelemetry(member) : null}
        </article>
      })}
    </div> : <div className="candidate-empty-state">No candidates have joined yet. Keep this dashboard open while candidates enter the session key.</div>}
  </section>
}
