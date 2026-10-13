from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f'Missing patch anchor: {label}')
    return text.replace(old, new, 1)

# supabase.ts
p = Path('src/session/supabase.ts')
s = p.read_text()
s = replace_once(
    s,
    "  alarm_revision: number\n  instructor_client_id: string | null\n",
    "  alarm_revision: number\n  alarms_silent: boolean\n  instructor_client_id: string | null\n",
    'TeachingSessionRow alarms_silent',
)
p.write_text(s)

# useTeachingSession.ts
p = Path('src/session/useTeachingSession.ts')
s = p.read_text()
s = replace_once(
    s,
    "  syncAlarms?: boolean\n  candidateCanEditAlarms?: boolean\n}",
    "  syncAlarms?: boolean\n  candidateCanEditAlarms?: boolean\n  alarmsSilent?: boolean\n}",
    'PolicyPatch alarmsSilent',
)
s = replace_once(
    s,
    "    if (patch.syncAlarms != null) databasePatch.sync_alarms = patch.syncAlarms\n    if (patch.candidateCanEditAlarms != null) databasePatch.candidate_can_edit_alarms = patch.candidateCanEditAlarms\n",
    "    if (patch.syncAlarms != null) databasePatch.sync_alarms = patch.syncAlarms\n    if (patch.candidateCanEditAlarms != null) databasePatch.candidate_can_edit_alarms = patch.candidateCanEditAlarms\n    if (patch.alarmsSilent != null) databasePatch.alarms_silent = patch.alarmsSilent\n",
    'updatePolicy alarmsSilent',
)
s = replace_once(
    s,
    "  const candidateAlarmsLocked = role === 'candidate' && Boolean(session?.sync_alarms) && !Boolean(session?.candidate_can_edit_alarms)\n\n  return {",
    "  const candidateAlarmsLocked = role === 'candidate' && Boolean(session?.sync_alarms) && !Boolean(session?.candidate_can_edit_alarms)\n  const candidateAlarmsSilent = role === 'candidate' && Boolean(session?.sync_alarms) && Boolean(session?.alarms_silent)\n\n  return {",
    'candidateAlarmsSilent const',
)
s = replace_once(
    s,
    "    candidateAlarmsLocked,\n    recoverableInstructor,",
    "    candidateAlarmsLocked,\n    candidateAlarmsSilent,\n    recoverableInstructor,",
    'candidateAlarmsSilent return',
)
p.write_text(s)

# SessionPanel.tsx
p = Path('src/components/SessionPanel.tsx')
s = p.read_text()
s = replace_once(
    s,
    "    syncAlarms?: boolean\n    candidateCanEditAlarms?: boolean\n  }) => Promise<void>",
    "    syncAlarms?: boolean\n    candidateCanEditAlarms?: boolean\n    alarmsSilent?: boolean\n  }) => Promise<void>",
    'SessionPanel policy type',
)
s = replace_once(
    s,
    "  const [simulatorExpanded, setSimulatorExpanded] = useState(false)\n  const [dashboardMembers, setDashboardMembers] = useState<SessionMemberRow[]>([])",
    "  const [simulatorExpanded, setSimulatorExpanded] = useState(false)\n  const [sessionControlsExpanded, setSessionControlsExpanded] = useState(false)\n  const [dashboardMembers, setDashboardMembers] = useState<SessionMemberRow[]>([])",
    'sessionControlsExpanded state',
)
s = s.replace("version.textContent = 'v0.48'", "version.textContent = 'v0.49'", 1)

old_controls = '''        {session?.simulation_paused && <div className="instructor-pause-banner">All candidate simulations are paused by the instructor.</div>}

        <div className="session-domain-grid">
          <div className={`session-domain-card ${session?.sync_patient ? 'shared' : ''}`}>
            <div className="session-domain-title"><strong>Patient</strong><span>{session?.sync_patient ? 'Shared' : 'Local'}</span></div>
            <label className="session-switch-row">
              <span>Share patient settings</span>
              <input type="checkbox" checked={Boolean(session?.sync_patient)} onChange={(event) => void onUpdatePolicy({ syncPatient: event.target.checked })} />
            </label>
            <label className="session-switch-row">
              <span>Candidate may change</span>
              <input type="checkbox" checked={Boolean(session?.candidate_can_edit_patient)} disabled={!session?.sync_patient} onChange={(event) => void onUpdatePolicy({ candidateCanEditPatient: event.target.checked })} />
            </label>
          </div>

          <div className={`session-domain-card ${session?.sync_ventilator ? 'shared' : ''}`}>
            <div className="session-domain-title"><strong>Ventilator</strong><span>{session?.sync_ventilator ? 'Shared' : 'Local'}</span></div>
            <label className="session-switch-row">
              <span>Share ventilator settings</span>
              <input type="checkbox" checked={Boolean(session?.sync_ventilator)} onChange={(event) => void onUpdatePolicy({ syncVentilator: event.target.checked })} />
            </label>
            <label className="session-switch-row">
              <span>Candidate may change</span>
              <input type="checkbox" checked={Boolean(session?.candidate_can_edit_ventilator)} disabled={!session?.sync_ventilator} onChange={(event) => void onUpdatePolicy({ candidateCanEditVentilator: event.target.checked })} />
            </label>
          </div>

          <div className={`session-domain-card ${session?.sync_alarms ? 'shared' : ''}`}>
            <div className="session-domain-title"><strong>Alarms</strong><span>{session?.sync_alarms ? 'Shared' : 'Local'}</span></div>
            <label className="session-switch-row">
              <span>Share alarm settings</span>
              <input type="checkbox" checked={Boolean(session?.sync_alarms)} onChange={(event) => void onUpdatePolicy({ syncAlarms: event.target.checked })} />
            </label>
            <label className="session-switch-row">
              <span>Candidate may change</span>
              <input type="checkbox" checked={Boolean(session?.candidate_can_edit_alarms)} disabled={!session?.sync_alarms} onChange={(event) => void onUpdatePolicy({ candidateCanEditAlarms: event.target.checked })} />
            </label>
          </div>
        </div>
'''
new_controls = '''        {session?.simulation_paused && <div className="instructor-pause-banner">All candidate simulations are paused by the instructor.</div>}

        <div className="instructor-session-controls">
          <button
            type="button"
            className="instructor-session-controls-toggle"
            onClick={() => setSessionControlsExpanded((value) => !value)}
            aria-expanded={sessionControlsExpanded}
          >
            <span>
              <strong>Sharing & alarm controls</strong>
              <small>Patient • Ventilator • Alarms</small>
            </span>
            <b>{sessionControlsExpanded ? 'Collapse' : 'Configure'}</b>
          </button>

          {sessionControlsExpanded && (
            <div className="session-domain-grid instructor-domain-grid">
              <div className={`session-domain-card ${session?.sync_patient ? 'shared' : ''}`}>
                <div className="session-domain-title"><strong>Patient</strong><span>{session?.sync_patient ? 'Shared' : 'Local'}</span></div>
                <label className="session-switch-row">
                  <span>Share patient settings</span>
                  <input type="checkbox" checked={Boolean(session?.sync_patient)} onChange={(event) => void onUpdatePolicy({ syncPatient: event.target.checked })} />
                </label>
                <label className="session-switch-row">
                  <span>Candidate may change</span>
                  <input type="checkbox" checked={Boolean(session?.candidate_can_edit_patient)} disabled={!session?.sync_patient} onChange={(event) => void onUpdatePolicy({ candidateCanEditPatient: event.target.checked })} />
                </label>
              </div>

              <div className={`session-domain-card ${session?.sync_ventilator ? 'shared' : ''}`}>
                <div className="session-domain-title"><strong>Ventilator</strong><span>{session?.sync_ventilator ? 'Shared' : 'Local'}</span></div>
                <label className="session-switch-row">
                  <span>Share ventilator settings</span>
                  <input type="checkbox" checked={Boolean(session?.sync_ventilator)} onChange={(event) => void onUpdatePolicy({ syncVentilator: event.target.checked })} />
                </label>
                <label className="session-switch-row">
                  <span>Candidate may change</span>
                  <input type="checkbox" checked={Boolean(session?.candidate_can_edit_ventilator)} disabled={!session?.sync_ventilator} onChange={(event) => void onUpdatePolicy({ candidateCanEditVentilator: event.target.checked })} />
                </label>
              </div>

              <div className={`session-domain-card ${session?.sync_alarms ? 'shared' : ''}`}>
                <div className="session-domain-title"><strong>Alarms</strong><span>{session?.sync_alarms ? 'Shared' : 'Local'}</span></div>
                <label className="session-switch-row">
                  <span>Share alarm settings</span>
                  <input type="checkbox" checked={Boolean(session?.sync_alarms)} onChange={(event) => void onUpdatePolicy({ syncAlarms: event.target.checked })} />
                </label>
                <label className="session-switch-row">
                  <span>Candidate may change</span>
                  <input type="checkbox" checked={Boolean(session?.candidate_can_edit_alarms)} disabled={!session?.sync_alarms} onChange={(event) => void onUpdatePolicy({ candidateCanEditAlarms: event.target.checked })} />
                </label>
                <label className="session-switch-row session-switch-row-emphasis">
                  <span>Keep candidate alarms silent</span>
                  <input type="checkbox" checked={Boolean(session?.alarms_silent)} disabled={!session?.sync_alarms} onChange={(event) => void onUpdatePolicy({ alarmsSilent: event.target.checked })} />
                </label>
              </div>
            </div>
          )}
        </div>
'''
s = replace_once(s, old_controls, new_controls, 'instructor controls block')
s = replace_once(
    s,
    "            Alarms: {session?.sync_alarms ? (session.candidate_can_edit_alarms ? 'shared / editable' : 'instructor controlled') : 'candidate local'}\n",
    "            Alarms: {session?.sync_alarms ? (session.candidate_can_edit_alarms ? 'shared / editable' : 'instructor controlled') : 'candidate local'}{session?.sync_alarms && session?.alarms_silent ? ' / silent' : ''}\n",
    'candidate alarm status silent',
)
p.write_text(s)

# App.tsx
p = Path('src/App.tsx')
s = p.read_text()
s = replace_once(
    s,
    "    if (!audibleAlarmLevel || alarmSilenced) return\n",
    "    if (!audibleAlarmLevel || alarmSilenced || frozen || teachingSession.candidateAlarmsSilent) return\n",
    'alarm audio guard',
)
s = replace_once(
    s,
    "  }, [audibleAlarmLevel, alarmSilenced])\n",
    "  }, [audibleAlarmLevel, alarmSilenced, frozen, teachingSession.candidateAlarmsSilent])\n",
    'alarm audio deps',
)
s = s.replace("appVersion: '0.48'", "appVersion: '0.49'", 1)
s = s.replace('<span className="version">v0.48</span>', '<span className="version">v0.49</span>', 1)
s = replace_once(
    s,
    "              {alarmSilenced && <span>ALARM SILENCED</span>}\n",
    "              {(alarmSilenced || teachingSession.candidateAlarmsSilent) && <span>ALARM SILENT</span>}\n",
    'alarm silent banner',
)
p.write_text(s)

# instructor.css additions
p = Path('src/instructor.css')
s = p.read_text()
s += '''\n\n/* v0.49 compact instructor controls */\n.instructor-session-controls {\n  margin-bottom: 10px;\n}\n.instructor-session-controls-toggle {\n  width: 100%;\n  min-height: 46px;\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 12px;\n  padding: 8px 11px;\n  border: 1px solid rgba(126, 199, 231, .18);\n  border-radius: 10px;\n  background: rgba(31, 93, 121, .07);\n  text-align: left;\n}\n.instructor-session-controls-toggle > span { display: grid; gap: 2px; }\n.instructor-session-controls-toggle strong { color: #ddecf3; font-size: 12px; }\n.instructor-session-controls-toggle small { color: #7f9ba8; font-size: 10px; }\n.instructor-session-controls-toggle b { color: #93d8f2; font-size: 10px; text-transform: uppercase; letter-spacing: .05em; }\n.instructor-session-controls .session-domain-grid { margin: 8px 0 0; }\n.session-switch-row-emphasis {\n  margin-top: 4px;\n  padding-top: 5px;\n  border-top: 1px solid rgba(255,255,255,.07);\n  color: #f1d99c;\n}\n@media (min-width: 900px) {\n  .instructor-session-panel .instructor-domain-grid {\n    grid-template-columns: repeat(3, minmax(0, 1fr));\n  }\n}\n@media (max-width: 899px) and (min-width: 620px) {\n  .instructor-session-panel .instructor-domain-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }\n}\n@media (max-width: 619px) {\n  .instructor-session-panel .instructor-domain-grid { grid-template-columns: 1fr; }\n}\n'''
p.write_text(s)

# migration file
migration = Path('supabase/migrations/20261013_add_candidate_alarm_silence.sql')
migration.write_text("""alter table public.teaching_sessions\n  add column if not exists alarms_silent boolean not null default false;\n\ncomment on column public.teaching_sessions.alarms_silent is\n  'When alarm sharing is enabled, suppresses alarm audio on candidate displays while preserving visual alarms.';\n""")

print('v0.49 patch applied')
