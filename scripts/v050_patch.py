from pathlib import Path
import re


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f'Missing patch anchor: {label}')
    return text.replace(old, new, 1)


def regex_once(text: str, pattern: str, repl: str, label: str) -> str:
    next_text, count = re.subn(pattern, repl, text, count=1, flags=re.S)
    if count != 1:
        raise SystemExit(f'Missing or ambiguous regex anchor: {label} ({count})')
    return next_text

# Supabase row type
p = Path('src/session/supabase.ts')
s = p.read_text()
s = replace_once(
    s,
    "  alarms_silent: boolean\n  instructor_client_id: string | null\n",
    "  alarms_silent: boolean\n  candidate_can_edit_waveforms: boolean\n  allow_oesophageal_pressure: boolean\n  instructor_client_id: string | null\n",
    'supabase waveform permission fields',
)
p.write_text(s)

# Teaching session hook
p = Path('src/session/useTeachingSession.ts')
s = p.read_text()
s = replace_once(
    s,
    "  alarmsSilent?: boolean\n}",
    "  alarmsSilent?: boolean\n  candidateCanEditWaveforms?: boolean\n  allowOesophagealPressure?: boolean\n}",
    'policy waveform fields',
)
s = replace_once(
    s,
    "    if (patch.alarmsSilent != null) databasePatch.alarms_silent = patch.alarmsSilent\n",
    "    if (patch.alarmsSilent != null) databasePatch.alarms_silent = patch.alarmsSilent\n    if (patch.candidateCanEditWaveforms != null) databasePatch.candidate_can_edit_waveforms = patch.candidateCanEditWaveforms\n    if (patch.allowOesophagealPressure != null) databasePatch.allow_oesophageal_pressure = patch.allowOesophagealPressure\n",
    'update policy waveform mappings',
)
s = replace_once(
    s,
    "  const candidateAlarmsSilent = role === 'candidate' && Boolean(session?.sync_alarms) && Boolean(session?.alarms_silent)\n\n  return {",
    "  const candidateAlarmsSilent = role === 'candidate' && Boolean(session?.sync_alarms) && Boolean(session?.alarms_silent)\n  const candidateWaveformsLocked = role === 'candidate' && !Boolean(session?.candidate_can_edit_waveforms)\n  const candidateOesophagealPressureAllowed = role !== 'candidate' || Boolean(session?.allow_oesophageal_pressure)\n\n  return {",
    'derived waveform permissions',
)
s = replace_once(
    s,
    "    candidateAlarmsSilent,\n    recoverableInstructor,",
    "    candidateAlarmsSilent,\n    candidateWaveformsLocked,\n    candidateOesophagealPressureAllowed,\n    recoverableInstructor,",
    'return waveform permissions',
)
p.write_text(s)

# Session panel and separate Live Room
p = Path('src/components/SessionPanel.tsx')
s = p.read_text()
s = replace_once(
    s,
    "import {\n  closeTeachingSessionChannel,\n  fetchSessionMembers,\n  subscribeToSessionMembers,\n  type SessionMemberRow,\n  type TeachingSessionRow,\n} from '../session/supabase'",
    "import type { SessionMemberRow, TeachingSessionRow } from '../session/supabase'",
    'SessionPanel imports',
)
s = replace_once(
    s,
    "  session: TeachingSessionRow | null\n  error: string | null\n",
    "  session: TeachingSessionRow | null\n  members: SessionMemberRow[]\n  error: string | null\n",
    'SessionPanel members prop',
)
s = replace_once(
    s,
    "    alarmsSilent?: boolean\n  }) => Promise<void>",
    "    alarmsSilent?: boolean\n    candidateCanEditWaveforms?: boolean\n    allowOesophagealPressure?: boolean\n  }) => Promise<void>",
    'SessionPanel waveform policy props',
)
s = replace_once(
    s,
    "export function SessionPanel({\n  role,\n  connection,\n  session,\n  error,",
    "export function SessionPanel({\n  role,\n  connection,\n  session,\n  members,\n  error,",
    'SessionPanel destructuring members',
)
s = replace_once(s, "  const [dashboardMembers, setDashboardMembers] = useState<SessionMemberRow[]>([])\n", "", 'remove dashboard members state')
s = replace_once(s, "  const [rosterError, setRosterError] = useState<string | null>(null)\n", "", 'remove roster error state')
s = regex_once(
    s,
    r"\n  useEffect\(\(\) => \{\n    if \(role !== 'instructor' \|\| !session\?\.id\) \{.*?\n  \}, \[role, session\?\.id\]\)\n",
    "\n",
    'remove duplicate roster subscription effect',
)
s = s.replace("version.textContent = 'v0.49'", "version.textContent = 'v0.50'", 1)
s = replace_once(
    s,
    "  const candidates = useMemo(() => dashboardMembers.filter((member) => member.role === 'candidate'), [dashboardMembers])",
    "  const candidates = useMemo(() => members.filter((member) => member.role === 'candidate'), [members])",
    'candidate count uses hook members',
)

live_room = '''\nexport function InstructorLiveRoom({ role, members }: { role: SessionRole; members: SessionMemberRow[] }) {\n  const [now, setNow] = useState(() => Date.now())\n  useEffect(() => {\n    if (role !== 'instructor') return\n    const timer = window.setInterval(() => setNow(Date.now()), 5000)\n    return () => window.clearInterval(timer)\n  }, [role])\n\n  const candidates = useMemo(() => members.filter((member) => member.role === 'candidate'), [members])\n  const onlineCandidates = candidates.filter((member) => {\n    const lastSeen = new Date(member.last_seen).getTime()\n    return Number.isFinite(lastSeen) && now - lastSeen <= 30000\n  }).length\n\n  if (role !== 'instructor') return null\n\n  return (\n    <section className="candidate-roster instructor-live-room" aria-label="Candidates">\n      <div className="candidate-roster-heading">\n        <div><span className="session-kicker">Live room</span><h3>Candidates</h3></div>\n        <span>{onlineCandidates}/{candidates.length} online</span>\n      </div>\n      {candidates.length ? (\n        <div className="candidate-card-list">\n          {candidates.map((member) => <CandidateCard key={member.id} member={member} now={now} />)}\n        </div>\n      ) : (\n        <div className="candidate-empty-state">No candidates have joined yet. Keep this dashboard open while candidates enter the session key.</div>\n      )}\n    </section>\n  )\n}\n\n'''
s = replace_once(s, "export function SessionPanel({\n", live_room + "export function SessionPanel({\n", 'insert InstructorLiveRoom')

vent_anchor = '''                <label className="session-switch-row">\n                  <span>Candidate may change</span>\n                  <input type="checkbox" checked={Boolean(session?.candidate_can_edit_ventilator)} disabled={!session?.sync_ventilator} onChange={(event) => void onUpdatePolicy({ candidateCanEditVentilator: event.target.checked })} />\n                </label>\n'''
vent_extra = vent_anchor + '''                <label className="session-switch-row">\n                  <span>Candidate may change waveforms</span>\n                  <input type="checkbox" checked={Boolean(session?.candidate_can_edit_waveforms)} onChange={(event) => void onUpdatePolicy({ candidateCanEditWaveforms: event.target.checked })} />\n                </label>\n                <label className="session-switch-row">\n                  <span>Allow oesophageal pressure</span>\n                  <input type="checkbox" checked={Boolean(session?.allow_oesophageal_pressure)} onChange={(event) => void onUpdatePolicy({ allowOesophagealPressure: event.target.checked })} />\n                </label>\n'''
s = replace_once(s, vent_anchor, vent_extra, 'ventilator waveform permission toggles')

s = regex_once(
    s,
    r"\n        <section className=\"candidate-roster\" aria-label=\"Candidates\">.*?\n        </section>\n\n        <div className=\"session-action-row\">",
    "\n        <div className=\"session-action-row\">",
    'remove inline Live Room',
)

candidate_vent_status = '''          <span className={session?.sync_ventilator && !session?.candidate_can_edit_ventilator ? 'locked' : 'available'}>\n            Ventilator: {session?.sync_ventilator ? (session.candidate_can_edit_ventilator ? 'shared / editable' : 'instructor controlled') : 'candidate local'}\n          </span>\n'''
candidate_wave_status = candidate_vent_status + '''          <span className={!session?.candidate_can_edit_waveforms ? 'locked' : 'available'}>\n            Waveforms: {session?.candidate_can_edit_waveforms ? 'editable' : 'instructor locked'} • Oesophageal pressure: {session?.allow_oesophageal_pressure ? 'available' : 'hidden'}\n          </span>\n'''
s = replace_once(s, candidate_vent_status, candidate_wave_status, 'candidate waveform status')
p.write_text(s)

# App integration
p = Path('src/App.tsx')
s = p.read_text()
s = replace_once(s, "import { SessionPanel } from './components/SessionPanel'", "import { InstructorLiveRoom, SessionPanel } from './components/SessionPanel'", 'App SessionPanel import')
s = s.replace("appVersion: '0.49'", "appVersion: '0.50'", 1)
s = s.replace('<span className="version">v0.49</span>', '<span className="version">v0.50</span>', 1)

hook_end = '''  const teachingSession = useTeachingSession({\n    patient,\n    ventilator,\n    alarmLimits,\n    patientTransitionSeconds,\n    setPatient,\n    setVentilator,\n    setAlarmLimits,\n    setPatientTransitionSeconds,\n    candidateAlarmLevel: candidateAlarmLevelForSession,\n  })\n'''
wave_logic = hook_end + '''\n  const candidateWaveformOptions = useMemo(\n    () => teachingSession.candidateOesophagealPressureAllowed\n      ? waveformOptions\n      : waveformOptions.filter((option) => option.value !== 'oesophagealPressure'),\n    [teachingSession.candidateOesophagealPressureAllowed],\n  )\n\n  useEffect(() => {\n    if (teachingSession.candidateOesophagealPressureAllowed) return\n    setWaveformDisplay((current) => {\n      const nextThird: OptionalWaveform = current.third === 'oesophagealPressure' ? 'volume' : current.third\n      let nextFourth = current.fourth === 'oesophagealPressure' ? null : current.fourth\n      if (nextFourth === nextThird) nextFourth = nextThird === 'volume' ? 'co2' : 'volume'\n      if (nextThird === current.third && nextFourth === current.fourth) return current\n      return { third: nextThird, fourth: nextFourth }\n    })\n  }, [teachingSession.candidateOesophagealPressureAllowed])\n'''
s = replace_once(s, hook_end, wave_logic, 'candidate waveform option logic')

s = s.replace('{waveformOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}', '{candidateWaveformOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}')
s = s.replace('<select value={waveformDisplay.third} onChange=', '<select value={waveformDisplay.third} disabled={teachingSession.candidateWaveformsLocked} onChange=', 1)
s = s.replace('<select value={waveformDisplay.fourth} onChange=', '<select value={waveformDisplay.fourth} disabled={teachingSession.candidateWaveformsLocked} onChange=', 1)
s = s.replace('<button type="button" onClick={() => setWaveformDisplay((current) => ({ ...current, fourth: null }))}>− 4th trace</button>', '<button type="button" disabled={teachingSession.candidateWaveformsLocked} onClick={() => setWaveformDisplay((current) => ({ ...current, fourth: null }))}>− 4th trace</button>', 1)
s = s.replace('<button type="button" onClick={() => setWaveformDisplay((current) => ({ ...current, fourth: current.third === \'volume\' ? \'co2\' : \'volume\' }))}>+ 4th trace</button>', '<button type="button" disabled={teachingSession.candidateWaveformsLocked} onClick={() => setWaveformDisplay((current) => ({ ...current, fourth: current.third === \'volume\' ? \'co2\' : \'volume\' }))}>+ 4th trace</button>', 1)

s = replace_once(
    s,
    "            session={teachingSession.session}\n            error={teachingSession.error}",
    "            session={teachingSession.session}\n            members={teachingSession.members}\n            error={teachingSession.error}",
    'SessionPanel members prop in App',
)
patient_fieldset_end = '''          <fieldset className={`session-lock-fieldset ${teachingSession.candidatePatientLocked ? 'locked' : ''}`} disabled={teachingSession.candidatePatientLocked}>\n            {teachingSession.candidatePatientLocked && <div className="session-control-lock-label">Instructor controlled</div>}\n            <PatientControls settings={patient} onChange={setPatient} onReset={resetPatient} transitionSeconds={patientTransitionSeconds} onTransitionSecondsChange={setPatientTransitionSeconds} />\n          </fieldset>\n'''
s = replace_once(
    s,
    patient_fieldset_end,
    patient_fieldset_end + '          <InstructorLiveRoom role={teachingSession.role} members={teachingSession.members} />\n',
    'Live Room after settings',
)
p.write_text(s)

# CSS additions
p = Path('src/instructor.css')
s = p.read_text()
s += '''\n\n/* v0.50 Live Room placement */\nbody.eduvent-instructor-mode:not(.eduvent-instructor-simulator-open) .control-panel > .instructor-live-room {\n  grid-column: 1 / -1;\n}\n.instructor-live-room {\n  width: auto;\n  margin-top: 2px;\n}\n.waveform-options-bar select:disabled,\n.waveform-options-bar button:disabled {\n  opacity: .45;\n  cursor: not-allowed;\n}\n'''
p.write_text(s)

# Repository migration mirrors live Supabase change
Path('supabase/migrations/20261013_add_waveform_permissions.sql').write_text('''alter table public.teaching_sessions\n  add column if not exists candidate_can_edit_waveforms boolean not null default true,\n  add column if not exists allow_oesophageal_pressure boolean not null default true;\n\ncomment on column public.teaching_sessions.candidate_can_edit_waveforms is\n  'Whether candidates may alter local waveform trace configuration.';\n\ncomment on column public.teaching_sessions.allow_oesophageal_pressure is\n  'Whether the oesophageal pressure waveform option is available on candidate displays.';\n''')

print('v0.50 patch applied')
