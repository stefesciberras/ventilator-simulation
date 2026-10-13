from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f'Missing patch anchor: {label}')
    if text.count(old) != 1:
        raise SystemExit(f'Patch anchor not unique ({text.count(old)}): {label}')
    return text.replace(old, new, 1)

# --- App.tsx ---------------------------------------------------------------
app_path = Path('src/App.tsx')
app = app_path.read_text()

app = replace_once(
    app,
    "import type { PatientSettings, Sample, VentilatorSettings } from './simulation/types'\nimport { useTeachingSession } from './session/useTeachingSession'\n",
    "import type { PatientSettings, Sample, VentilatorSettings } from './simulation/types'\nimport type { AlarmLimits, CandidateAlarmLevel } from './alarmTypes'\nimport { useTeachingSession } from './session/useTeachingSession'\n",
    'App alarm type import',
)

app = replace_once(
    app,
    "interface AlarmLimits {\n  apneaTime: number\n  peakPressure: number\n  co2Min: number\n  co2Max: number\n  minuteVentilationMin: number\n  minuteVentilationMax: number\n  tidalVolumeMin: number\n  tidalVolumeMax: number\n  respiratoryRateMin: number\n  respiratoryRateMax: number\n}\n\n",
    "",
    'remove local AlarmLimits',
)

app = replace_once(
    app,
    "  const [alarmSilenced, setAlarmSilenced] = useState(false)\n  const [frozen, setFrozen] = useState(false)\n",
    "  const [alarmSilenced, setAlarmSilenced] = useState(false)\n  const [alarmClock, setAlarmClock] = useState(() => Date.now())\n  const [alarmLifecycle, setAlarmLifecycle] = useState<Record<string, { activeSince: number | null; resolvedAt: number | null; acknowledged: boolean }>>({})\n  const [frozen, setFrozen] = useState(false)\n",
    'alarm lifecycle state',
)

app = replace_once(
    app,
    "  const teachingSession = useTeachingSession({\n    patient,\n    ventilator,\n    patientTransitionSeconds,\n    setPatient,\n    setVentilator,\n    setPatientTransitionSeconds,\n  })\n",
    "  const teachingSession = useTeachingSession({\n    patient,\n    ventilator,\n    alarmLimits,\n    patientTransitionSeconds,\n    setPatient,\n    setVentilator,\n    setAlarmLimits,\n    setPatientTransitionSeconds,\n    candidateAlarmLevel: null,\n  })\n",
    'teaching session args',
)

# Replace alarm state / lifecycle block.
old_alarm_block = """  const alarmConditions = {\n    apnea: apneaAlarmActive,\n    pressure: pressureAlarmActive,\n    minuteVentilationLow: minuteVentilationLowAlarmActive,\n    minuteVentilationHigh: minuteVentilationHighAlarmActive,\n    tidalVolumeLow: tidalVolumeLowAlarmActive,\n    tidalVolumeHigh: tidalVolumeHighAlarmActive,\n    respiratoryRateLow: respiratoryRateLowAlarmActive,\n    respiratoryRateHigh: respiratoryRateHighAlarmActive,\n    oxygenFailure: oxygenFailureActive,\n  }\n\n  useEffect(() => {\n    setAlarmOnsets((current) => {\n      let changed = false\n      const next = { ...current }\n      for (const [key, active] of Object.entries(alarmConditions)) {\n        if (active && next[key] == null) {\n          next[key] = currentSimulationTime\n          changed = true\n          const previousHistory = alarmHistoryRef.current[key]\n          alarmHistoryRef.current[key] = {\n            everTriggered: true,\n            triggerCount: (previousHistory?.triggerCount ?? 0) + 1,\n            firstTriggeredAt: previousHistory?.firstTriggeredAt ?? currentSimulationTime,\n            lastTriggeredAt: currentSimulationTime,\n          }\n        }\n        if (!active && next[key] != null) { next[key] = null; changed = true }\n      }\n      return changed ? next : current\n    })\n  }, [\n    apneaAlarmActive,\n    pressureAlarmActive,\n    minuteVentilationLowAlarmActive,\n    minuteVentilationHighAlarmActive,\n    tidalVolumeLowAlarmActive,\n    tidalVolumeHighAlarmActive,\n    respiratoryRateLowAlarmActive,\n    respiratoryRateHighAlarmActive,\n    oxygenFailureActive,\n    currentSimulationTime,\n  ])\n\n  const anyAlarmActive = Object.values(alarmConditions).some(Boolean)\n  const criticalAlarmKeys = ['pressure', 'apnea', 'oxygenFailure'] as const\n  const criticalEscalated = criticalAlarmKeys.some((key) => {\n    if (!alarmConditions[key]) return false\n    const onset = alarmOnsets[key]\n    return onset != null && currentSimulationTime - onset >= 15\n  })\n  const alarmLevel = anyAlarmActive ? (criticalEscalated ? 'red' : 'yellow') : null\n"""
new_alarm_block = """  const alarmConditions = {\n    apnea: apneaAlarmActive,\n    pressure: pressureAlarmActive,\n    minuteVentilationLow: minuteVentilationLowAlarmActive,\n    minuteVentilationHigh: minuteVentilationHighAlarmActive,\n    tidalVolumeLow: tidalVolumeLowAlarmActive,\n    tidalVolumeHigh: tidalVolumeHighAlarmActive,\n    respiratoryRateLow: respiratoryRateLowAlarmActive,\n    respiratoryRateHigh: respiratoryRateHighAlarmActive,\n    oxygenFailure: oxygenFailureActive,\n  }\n\n  useEffect(() => {\n    const timer = window.setInterval(() => setAlarmClock(Date.now()), 500)\n    return () => window.clearInterval(timer)\n  }, [])\n\n  useEffect(() => {\n    const now = Date.now()\n    setAlarmOnsets((current) => {\n      let changed = false\n      const next = { ...current }\n      for (const [key, active] of Object.entries(alarmConditions)) {\n        if (active && next[key] == null) {\n          next[key] = currentSimulationTime\n          changed = true\n          const previousHistory = alarmHistoryRef.current[key]\n          alarmHistoryRef.current[key] = {\n            everTriggered: true,\n            triggerCount: (previousHistory?.triggerCount ?? 0) + 1,\n            firstTriggeredAt: previousHistory?.firstTriggeredAt ?? currentSimulationTime,\n            lastTriggeredAt: currentSimulationTime,\n          }\n        }\n        if (!active && next[key] != null) { next[key] = null; changed = true }\n      }\n      return changed ? next : current\n    })\n\n    setAlarmLifecycle((current) => {\n      let changed = false\n      const next = { ...current }\n      for (const [key, active] of Object.entries(alarmConditions)) {\n        const entry = current[key] ?? { activeSince: null, resolvedAt: null, acknowledged: false }\n        if (active) {\n          if (entry.activeSince == null || entry.resolvedAt != null) {\n            next[key] = { activeSince: now, resolvedAt: null, acknowledged: false }\n            changed = true\n          }\n        } else if (entry.activeSince != null && entry.resolvedAt == null) {\n          next[key] = { ...entry, resolvedAt: now }\n          changed = true\n        }\n      }\n      return changed ? next : current\n    })\n  }, [\n    apneaAlarmActive,\n    pressureAlarmActive,\n    minuteVentilationLowAlarmActive,\n    minuteVentilationHighAlarmActive,\n    tidalVolumeLowAlarmActive,\n    tidalVolumeHighAlarmActive,\n    respiratoryRateLowAlarmActive,\n    respiratoryRateHighAlarmActive,\n    oxygenFailureActive,\n    currentSimulationTime,\n  ])\n\n  useEffect(() => {\n    setAlarmLifecycle((current) => {\n      let changed = false\n      const next = { ...current }\n      for (const [key, entry] of Object.entries(current)) {\n        if (entry.resolvedAt != null && alarmClock - entry.resolvedAt >= 120000) {\n          delete next[key]\n          changed = true\n        }\n      }\n      return changed ? next : current\n    })\n  }, [alarmClock])\n\n  const criticalAlarmKeys = ['pressure', 'apnea', 'oxygenFailure'] as const\n  const activeAlarmKeys = Object.entries(alarmConditions).filter(([, active]) => active).map(([key]) => key)\n  const resolvedYellowKeys = Object.entries(alarmLifecycle)\n    .filter(([, entry]) => entry.resolvedAt != null && alarmClock - entry.resolvedAt < 10000)\n    .map(([key]) => key)\n  const greyAlarmKeys = Object.entries(alarmLifecycle)\n    .filter(([, entry]) => entry.resolvedAt != null && alarmClock - entry.resolvedAt >= 10000 && alarmClock - entry.resolvedAt < 120000 && !entry.acknowledged)\n    .map(([key]) => key)\n  const criticalEscalated = criticalAlarmKeys.some((key) => {\n    const entry = alarmLifecycle[key]\n    return Boolean(alarmConditions[key] && entry?.activeSince != null && alarmClock - entry.activeSince >= 15000)\n  })\n  const audibleAlarmLevel: CandidateAlarmLevel = activeAlarmKeys.length || resolvedYellowKeys.length\n    ? (criticalEscalated ? 'red' : 'yellow')\n    : null\n  const alarmLevel: 'red' | 'yellow' | 'grey' | null = audibleAlarmLevel ?? (greyAlarmKeys.length ? 'grey' : null)\n"""
app = replace_once(app, old_alarm_block, new_alarm_block, 'alarm lifecycle block')

# Use all visible alarm labels, including latched ones, while preserving existing label text.
app = replace_once(
    app,
    "  const alarmLabels = [\n",
    "  const visibleAlarmKeys = new Set([...activeAlarmKeys, ...resolvedYellowKeys, ...greyAlarmKeys])\n  const alarmLabels = [\n",
    'visible alarm keys',
)
for key, label in [
    ('pressureAlarmActive', "visibleAlarmKeys.has('pressure')"),
    ('apneaAlarmActive', "visibleAlarmKeys.has('apnea')"),
    ('minuteVentilationLowAlarmActive', "visibleAlarmKeys.has('minuteVentilationLow')"),
    ('minuteVentilationHighAlarmActive', "visibleAlarmKeys.has('minuteVentilationHigh')"),
    ('tidalVolumeLowAlarmActive', "visibleAlarmKeys.has('tidalVolumeLow')"),
    ('tidalVolumeHighAlarmActive', "visibleAlarmKeys.has('tidalVolumeHigh')"),
    ('respiratoryRateLowAlarmActive', "visibleAlarmKeys.has('respiratoryRateLow')"),
    ('respiratoryRateHighAlarmActive', "visibleAlarmKeys.has('respiratoryRateHigh')"),
    ('oxygenFailureActive', "visibleAlarmKeys.has('oxygenFailure')"),
]:
    app = app.replace(f"    {key} ?", f"    {label} ?", 1)

app = replace_once(
    app,
    "  useEffect(() => {\n    if (!alarmLevel || alarmSilenced) return\n",
    "  useEffect(() => {\n    if (!audibleAlarmLevel || alarmSilenced) return\n",
    'audio audible level gate',
)
app = app.replace("alarmLevel === 'red' ? 1040 : 820", "audibleAlarmLevel === 'red' ? 1040 : 820", 1)
app = app.replace("alarmLevel === 'red' ? 700 : 1300", "audibleAlarmLevel === 'red' ? 700 : 1300", 1)
app = app.replace("  }, [alarmLevel, alarmSilenced])", "  }, [audibleAlarmLevel, alarmSilenced])", 1)

app = replace_once(
    app,
    "  const silenceAlarm = () => {\n    setAlarmSilenced(true)\n",
    "  const silenceAlarm = () => {\n    setAlarmLifecycle((current) => {\n      const next = { ...current }\n      for (const [key, entry] of Object.entries(current)) {\n        if (entry.resolvedAt != null) delete next[key]\n        else if (alarmConditions[key]) next[key] = { ...entry, acknowledged: true }\n      }\n      return next\n    })\n    setAlarmSilenced(true)\n",
    'silence clears resolved alarms',
)

# Replace teachingSession call a second time now that candidate alarm level exists later: split into state callback using ref-style update.
app = replace_once(
    app,
    "    candidateAlarmLevel: null,\n  })\n",
    "    candidateAlarmLevel: audibleAlarmLevel,\n  })\n",
    'candidate alarm telemetry arg',
)

# Teaching session call currently occurs before audibleAlarmLevel declaration. Move candidateAlarmLevel through state variable instead.
app = replace_once(
    app,
    "  const [diagnosticCopied, setDiagnosticCopied] = useState(false)\n\n  const teachingSession = useTeachingSession({\n",
    "  const [diagnosticCopied, setDiagnosticCopied] = useState(false)\n  const [candidateAlarmLevelForSession, setCandidateAlarmLevelForSession] = useState<CandidateAlarmLevel>(null)\n\n  const teachingSession = useTeachingSession({\n",
    'candidate alarm bridge state',
)
app = app.replace("    candidateAlarmLevel: audibleAlarmLevel,", "    candidateAlarmLevel: candidateAlarmLevelForSession,", 1)
app = replace_once(
    app,
    "  const alarmLevel: 'red' | 'yellow' | 'grey' | null = audibleAlarmLevel ?? (greyAlarmKeys.length ? 'grey' : null)\n",
    "  const alarmLevel: 'red' | 'yellow' | 'grey' | null = audibleAlarmLevel ?? (greyAlarmKeys.length ? 'grey' : null)\n\n  useEffect(() => {\n    setCandidateAlarmLevelForSession(audibleAlarmLevel)\n  }, [audibleAlarmLevel])\n",
    'bridge alarm level to teaching session',
)

# Close/lock alarm dialog when instructor owns alarm settings.
app = replace_once(
    app,
    "  useEffect(() => {\n    window.localStorage.setItem(ALARM_STORAGE_KEY, JSON.stringify(alarmLimits))\n  }, [alarmLimits])\n",
    "  useEffect(() => {\n    window.localStorage.setItem(ALARM_STORAGE_KEY, JSON.stringify(alarmLimits))\n  }, [alarmLimits])\n\n  useEffect(() => {\n    if (teachingSession.candidateAlarmsLocked) setAlarmDialogOpen(false)\n  }, [teachingSession.candidateAlarmsLocked])\n",
    'close locked alarm dialog',
)

# Dedicated alarm space.
old_banner = """          {alarmLevel && (\n            <div className={`alarm-banner ${alarmLevel}`} role=\"alert\">\n              <strong>{alarmLabels.join(' • ')}</strong>\n              {alarmSilenced && <span>ALARM SILENCED</span>}\n            </div>\n          )}\n\n          <div className=\"screen-body\">\n"""
new_banner = """          <div className=\"alarm-slot\" aria-live=\"polite\">\n            {alarmLevel && (\n              <div className={`alarm-banner ${alarmLevel}`} role=\"alert\">\n                <strong>{alarmLabels.join(' • ')}</strong>\n                {alarmSilenced && audibleAlarmLevel && <span>ALARM SILENCED</span>}\n              </div>\n            )}\n          </div>\n\n          <div className=\"screen-body\">\n"""
app = replace_once(app, old_banner, new_banner, 'dedicated alarm slot')

app = app.replace(
    '<button className="metrics-alarm-limits" type="button" onClick={() => setAlarmDialogOpen(true)} title="Set alarm limits">Alarm limits</button>',
    '<button className="metrics-alarm-limits" type="button" disabled={teachingSession.candidateAlarmsLocked} onClick={() => setAlarmDialogOpen(true)} title={teachingSession.candidateAlarmsLocked ? \'Alarm limits controlled by instructor\' : \'Set alarm limits\'}>Alarm limits</button>',
    1,
)

# Version and diagnostics.
app = app.replace("appVersion: '0.45'", "appVersion: '0.48'", 1)
app = app.replace('<span className="version">v0.45</span>', '<span className="version">v0.48</span>', 1)

app_path.write_text(app)

# --- supabase.ts ----------------------------------------------------------
sup_path = Path('src/session/supabase.ts')
sup = sup_path.read_text()
sup = replace_once(
    sup,
    "import type { PatientSettings, VentilatorSettings } from '../simulation/types'\n",
    "import type { PatientSettings, VentilatorSettings } from '../simulation/types'\nimport type { AlarmLimits, CandidateAlarmLevel } from '../alarmTypes'\n",
    'supabase alarm imports',
)

sup = replace_once(
    sup,
    "  simulation_paused: boolean\n  pause_revision: number\n}",
    "  simulation_paused: boolean\n  pause_revision: number\n  sync_alarms: boolean\n  candidate_can_edit_alarms: boolean\n  alarm_settings: AlarmLimits\n  alarm_revision: number\n  instructor_client_id: string | null\n  instructor_last_seen: string | null\n}",
    'TeachingSessionRow alarm fields',
)
sup = replace_once(
    sup,
    "  state_updated_at: string | null\n}",
    "  state_updated_at: string | null\n  alarm_level: CandidateAlarmLevel\n}",
    'member alarm level',
)

sup = replace_once(
    sup,
    "export async function createTeachingSession(patient: PatientSettings, ventilator: VentilatorSettings) {\n",
    "export async function createTeachingSession(patient: PatientSettings, ventilator: VentilatorSettings, alarmSettings: AlarmLimits) {\n",
    'create session signature',
)
sup = replace_once(
    sup,
    "    p_patient_settings: patient,\n    p_ventilator_settings: ventilator,\n",
    "    p_patient_settings: patient,\n    p_ventilator_settings: ventilator,\n    p_alarm_settings: alarmSettings,\n",
    'create alarm settings arg',
)

sup = replace_once(
    sup,
    "export async function touchSessionMember(\n  sessionId: string,\n  patient: PatientSettings,\n  ventilator: VentilatorSettings,\n) {\n",
    "export async function touchSessionMember(\n  sessionId: string,\n  patient: PatientSettings,\n  ventilator: VentilatorSettings,\n  alarmLevel: CandidateAlarmLevel = null,\n) {\n",
    'touch member signature',
)
sup = replace_once(
    sup,
    "    p_patient_settings: patient,\n    p_ventilator_settings: ventilator,\n  })\n",
    "    p_patient_settings: patient,\n    p_ventilator_settings: ventilator,\n    p_alarm_level: alarmLevel,\n  })\n",
    'touch alarm arg',
)

insert_before = "export function subscribeToTeachingSession(\n"
helpers = """export async function findActiveInstructorSession() {\n  await ensureAnonymousSession()\n  const { data, error } = await supabase.rpc('find_active_instructor_session')\n  if (error) throw error\n  const result = Array.isArray(data) ? data[0] : data\n  if (!result?.session_id) return null\n  return { sessionId: String(result.session_id), sessionKey: String(result.session_key) }\n}\n\nexport async function claimInstructorSession(sessionId: string, clientId: string) {\n  const { error } = await supabase.rpc('claim_instructor_session', { p_session_id: sessionId, p_client_id: clientId })\n  if (error) throw error\n}\n\nexport async function touchInstructorSession(sessionId: string, clientId: string) {\n  const { error } = await supabase.rpc('touch_instructor_session', { p_session_id: sessionId, p_client_id: clientId })\n  if (error) throw error\n}\n\n"""
sup = replace_once(sup, insert_before, helpers + insert_before, 'instructor lease helpers')
sup_path.write_text(sup)

# --- useTeachingSession.ts -----------------------------------------------
hook_path = Path('src/session/useTeachingSession.ts')
hook = hook_path.read_text()
hook = replace_once(
    hook,
    "import type { PatientSettings, VentilatorSettings } from '../simulation/types'\n",
    "import type { PatientSettings, VentilatorSettings } from '../simulation/types'\nimport type { AlarmLimits, CandidateAlarmLevel } from '../alarmTypes'\n",
    'hook alarm imports',
)

hook = replace_once(
    hook,
    "  closeTeachingSessionChannel,\n  createTeachingSession,\n",
    "  claimInstructorSession,\n  closeTeachingSessionChannel,\n  createTeachingSession,\n  findActiveInstructorSession,\n",
    'hook lease imports A',
)
hook = replace_once(
    hook,
    "  touchSessionMember,\n",
    "  touchInstructorSession,\n  touchSessionMember,\n",
    'hook lease imports B',
)

hook = replace_once(
    hook,
    "  ventilator: VentilatorSettings\n  patientTransitionSeconds: number\n  setPatient: (next: PatientSettings) => void\n  setVentilator: (next: VentilatorSettings) => void\n  setPatientTransitionSeconds: (seconds: number) => void\n",
    "  ventilator: VentilatorSettings\n  alarmLimits: AlarmLimits\n  patientTransitionSeconds: number\n  setPatient: (next: PatientSettings) => void\n  setVentilator: (next: VentilatorSettings) => void\n  setAlarmLimits: (next: AlarmLimits) => void\n  setPatientTransitionSeconds: (seconds: number) => void\n  candidateAlarmLevel: CandidateAlarmLevel\n",
    'hook args interface',
)
hook = replace_once(
    hook,
    "  candidateCanEditVentilator?: boolean\n}",
    "  candidateCanEditVentilator?: boolean\n  syncAlarms?: boolean\n  candidateCanEditAlarms?: boolean\n}",
    'policy alarm fields',
)

hook = replace_once(
    hook,
    "  ventilator,\n  patientTransitionSeconds,\n  setPatient,\n  setVentilator,\n  setPatientTransitionSeconds,\n}: UseTeachingSessionArgs) {\n",
    "  ventilator,\n  alarmLimits,\n  patientTransitionSeconds,\n  setPatient,\n  setVentilator,\n  setAlarmLimits,\n  setPatientTransitionSeconds,\n  candidateAlarmLevel,\n}: UseTeachingSessionArgs) {\n",
    'hook destructure args',
)

hook = replace_once(
    hook,
    "  const [error, setError] = useState<string | null>(null)\n",
    "  const [error, setError] = useState<string | null>(null)\n  const [recoverableInstructor, setRecoverableInstructor] = useState<{ sessionId: string; sessionKey: string } | null>(null)\n",
    'recoverable instructor state',
)
hook = replace_once(
    hook,
    "  const ventilatorRef = useRef(ventilator)\n  const patientRevisionRef = useRef(0)\n",
    "  const ventilatorRef = useRef(ventilator)\n  const alarmLimitsRef = useRef(alarmLimits)\n  const alarmLevelRef = useRef<CandidateAlarmLevel>(candidateAlarmLevel)\n  const patientRevisionRef = useRef(0)\n",
    'alarm refs',
)
hook = replace_once(
    hook,
    "  const ventilatorRevisionRef = useRef(0)\n  const pauseRevisionRef = useRef(0)\n",
    "  const ventilatorRevisionRef = useRef(0)\n  const alarmRevisionRef = useRef(0)\n  const pauseRevisionRef = useRef(0)\n",
    'alarm revision ref',
)
hook = replace_once(
    hook,
    "  const telemetryTimerRef = useRef<number | null>(null)\n",
    "  const telemetryTimerRef = useRef<number | null>(null)\n  const instructorHeartbeatRef = useRef<number | null>(null)\n  const instructorClientIdRef = useRef<string | null>(null)\n",
    'instructor heartbeat refs',
)

hook = replace_once(
    hook,
    "  useEffect(() => { ventilatorRef.current = ventilator }, [ventilator])\n",
    "  useEffect(() => { ventilatorRef.current = ventilator }, [ventilator])\n  useEffect(() => { alarmLimitsRef.current = alarmLimits }, [alarmLimits])\n  useEffect(() => { alarmLevelRef.current = candidateAlarmLevel }, [candidateAlarmLevel])\n",
    'alarm ref effects',
)

# Alarm apply by revision.
hook = replace_once(
    hook,
    "    const nextVentilatorRevision = Number(next.ventilator_revision ?? 0)\n    const nextPauseRevision = Number(next.pause_revision ?? 0)\n    const patientChanged = force || nextPatientRevision > patientRevisionRef.current\n    const ventilatorChanged = force || nextVentilatorRevision > ventilatorRevisionRef.current\n    const pauseChanged = force || nextPauseRevision > pauseRevisionRef.current\n",
    "    const nextVentilatorRevision = Number(next.ventilator_revision ?? 0)\n    const nextAlarmRevision = Number(next.alarm_revision ?? 0)\n    const nextPauseRevision = Number(next.pause_revision ?? 0)\n    const patientChanged = force || nextPatientRevision > patientRevisionRef.current\n    const ventilatorChanged = force || nextVentilatorRevision > ventilatorRevisionRef.current\n    const alarmChanged = force || nextAlarmRevision > alarmRevisionRef.current\n    const pauseChanged = force || nextPauseRevision > pauseRevisionRef.current\n",
    'alarm revision apply setup',
)
hook = replace_once(
    hook,
    "    if (pauseChanged) setSimulationPausedInDom(Boolean(next.simulation_paused))\n\n    patientRevisionRef.current = Math.max(patientRevisionRef.current, nextPatientRevision)\n    ventilatorRevisionRef.current = Math.max(ventilatorRevisionRef.current, nextVentilatorRevision)\n    pauseRevisionRef.current = Math.max(pauseRevisionRef.current, nextPauseRevision)\n",
    "    if (next.sync_alarms && next.alarm_settings && alarmChanged) {\n      setAlarmLimits(next.alarm_settings)\n    }\n\n    if (pauseChanged) setSimulationPausedInDom(Boolean(next.simulation_paused))\n\n    patientRevisionRef.current = Math.max(patientRevisionRef.current, nextPatientRevision)\n    ventilatorRevisionRef.current = Math.max(ventilatorRevisionRef.current, nextVentilatorRevision)\n    alarmRevisionRef.current = Math.max(alarmRevisionRef.current, nextAlarmRevision)\n    pauseRevisionRef.current = Math.max(pauseRevisionRef.current, nextPauseRevision)\n",
    'apply alarm settings',
)

# Create session with alarms and claim lease.
hook = hook.replace("const created = await createTeachingSession(patient, ventilator)", "const created = await createTeachingSession(patient, ventilator, alarmLimits)", 1)
hook = replace_once(
    hook,
    "      let row = await fetchTeachingSession(created.sessionId)\n      patientRevisionRef.current = Number(row.patient_revision ?? 0)\n      ventilatorRevisionRef.current = Number(row.ventilator_revision ?? 0)\n      pauseRevisionRef.current = Number(row.pause_revision ?? 0)\n",
    "      let row = await fetchTeachingSession(created.sessionId)\n      const clientId = instructorClientIdRef.current ?? crypto.randomUUID()\n      instructorClientIdRef.current = clientId\n      sessionStorage.setItem('eduvent.instructor-session-id', created.sessionId)\n      sessionStorage.setItem('eduvent.instructor-client-id', clientId)\n      await claimInstructorSession(created.sessionId, clientId)\n      patientRevisionRef.current = Number(row.patient_revision ?? 0)\n      ventilatorRevisionRef.current = Number(row.ventilator_revision ?? 0)\n      alarmRevisionRef.current = Number(row.alarm_revision ?? 0)\n      pauseRevisionRef.current = Number(row.pause_revision ?? 0)\n",
    'claim instructor on start',
)

# Candidate alarm revision reset.
hook = replace_once(
    hook,
    "      ventilatorRevisionRef.current = 0\n      pauseRevisionRef.current = 0\n",
    "      ventilatorRevisionRef.current = 0\n      alarmRevisionRef.current = 0\n      pauseRevisionRef.current = 0\n",
    'candidate alarm revision reset',
)

# Policy and broadcast alarm settings.
hook = replace_once(
    hook,
    "    if (patch.candidateCanEditVentilator != null) databasePatch.candidate_can_edit_ventilator = patch.candidateCanEditVentilator\n",
    "    if (patch.candidateCanEditVentilator != null) databasePatch.candidate_can_edit_ventilator = patch.candidateCanEditVentilator\n    if (patch.syncAlarms != null) databasePatch.sync_alarms = patch.syncAlarms\n    if (patch.candidateCanEditAlarms != null) databasePatch.candidate_can_edit_alarms = patch.candidateCanEditAlarms\n",
    'policy alarm patch',
)
hook = replace_once(
    hook,
    "    if (patch.syncVentilator === true && !current.sync_ventilator) {\n      ventilatorRevisionRef.current += 1\n      databasePatch.ventilator_settings = ventilator\n      databasePatch.ventilator_revision = ventilatorRevisionRef.current\n    }\n",
    "    if (patch.syncVentilator === true && !current.sync_ventilator) {\n      ventilatorRevisionRef.current += 1\n      databasePatch.ventilator_settings = ventilator\n      databasePatch.ventilator_revision = ventilatorRevisionRef.current\n    }\n    if (patch.syncAlarms === true && !current.sync_alarms) {\n      alarmRevisionRef.current += 1\n      databasePatch.alarm_settings = alarmLimits\n      databasePatch.alarm_revision = alarmRevisionRef.current\n    }\n",
    'enable alarm sync push',
)
hook = replace_once(
    hook,
    "    if (!Object.keys(patch).length) return\n",
    "    if (current.sync_alarms) {\n      alarmRevisionRef.current += 1\n      patch.alarm_settings = alarmLimits\n      patch.alarm_revision = alarmRevisionRef.current\n    }\n    if (!Object.keys(patch).length) return\n",
    'broadcast alarms',
)

# Auto-broadcast alarm settings changes when shared.
anchor = "  useEffect(() => {\n    if (role !== 'instructor' || !session?.id) return\n    const button = getPauseButton()\n"
alarm_effect = """  useEffect(() => {\n    const current = sessionRef.current\n    if (role !== 'instructor' || !current?.sync_alarms) return\n    const timer = window.setTimeout(async () => {\n      const latest = sessionRef.current\n      if (!latest || roleRef.current !== 'instructor' || !latest.sync_alarms) return\n      alarmRevisionRef.current += 1\n      try {\n        const next = await updateTeachingSession(latest.id, {\n          alarm_settings: alarmLimits,\n          alarm_revision: alarmRevisionRef.current,\n        })\n        storeSession(next)\n        setError(null)\n      } catch (cause) {\n        setError(cause instanceof Error ? cause.message : 'Unable to broadcast alarm settings.')\n      }\n    }, 180)\n    return () => window.clearTimeout(timer)\n  }, [alarmLimits, role])\n\n"""
hook = replace_once(hook, anchor, alarm_effect + anchor, 'alarm broadcast effect')

# Candidate telemetry alarm level.
hook = hook.replace("touchSessionMember(joined.sessionId, patientRef.current, ventilatorRef.current)", "touchSessionMember(joined.sessionId, patientRef.current, ventilatorRef.current, alarmLevelRef.current)", 1)
hook = hook.replace("touchSessionMember(session.id, patientRef.current, ventilatorRef.current)", "touchSessionMember(session.id, patientRef.current, ventilatorRef.current, alarmLevelRef.current)")
hook = hook.replace("touchSessionMember(session.id, patient, ventilator)", "touchSessionMember(session.id, patient, ventilator, candidateAlarmLevel)")
hook = hook.replace("  }, [patient, ventilator, role, session?.id])", "  }, [patient, ventilator, candidateAlarmLevel, role, session?.id])", 1)

# Instructor lease/rejoin helpers.
insert_before_leave = "  const leaveSession = async () => {\n"
rejoin_code = """  const attachInstructorLease = (sessionId: string, clientId: string) => {\n    if (instructorHeartbeatRef.current != null) window.clearInterval(instructorHeartbeatRef.current)\n    const heartbeat = () => {\n      void touchInstructorSession(sessionId, clientId).catch((cause) => {\n        setConnection('error')\n        setError(cause instanceof Error ? cause.message : 'Instructor control lease was lost.')\n      })\n    }\n    heartbeat()\n    instructorHeartbeatRef.current = window.setInterval(heartbeat, 10000)\n  }\n\n  const resumeInstructor = async (sessionId?: string) => {\n    setConnection('connecting')\n    setError(null)\n    try {\n      await ensureAnonymousSession()\n      const found = sessionId ? { sessionId, sessionKey: '' } : await findActiveInstructorSession()\n      if (!found) {\n        setRecoverableInstructor(null)\n        setConnection('idle')\n        return\n      }\n      const clientId = sessionStorage.getItem('eduvent.instructor-client-id') ?? crypto.randomUUID()\n      instructorClientIdRef.current = clientId\n      await claimInstructorSession(found.sessionId, clientId)\n      const row = await fetchTeachingSession(found.sessionId)\n      roleRef.current = 'instructor'\n      setRole('instructor')\n      patientRevisionRef.current = Number(row.patient_revision ?? 0)\n      ventilatorRevisionRef.current = Number(row.ventilator_revision ?? 0)\n      alarmRevisionRef.current = Number(row.alarm_revision ?? 0)\n      pauseRevisionRef.current = Number(row.pause_revision ?? 0)\n      sessionStorage.setItem('eduvent.instructor-session-id', found.sessionId)\n      sessionStorage.setItem('eduvent.instructor-client-id', clientId)\n      storeSession(row)\n      setRecoverableInstructor(null)\n      await attachSubscription(found.sessionId)\n      await attachMemberSubscription(found.sessionId)\n      attachInstructorLease(found.sessionId, clientId)\n    } catch (cause) {\n      setConnection('error')\n      setError(cause instanceof Error ? cause.message : 'Unable to rejoin instructor session.')\n    }\n  }\n\n  useEffect(() => {\n    const storedSessionId = sessionStorage.getItem('eduvent.instructor-session-id')\n    if (storedSessionId) {\n      void resumeInstructor(storedSessionId)\n      return\n    }\n    void (async () => {\n      try {\n        const found = await findActiveInstructorSession()\n        if (found && roleRef.current === 'standalone') setRecoverableInstructor(found)\n      } catch {\n        // No recoverable instructor session is a normal standalone state.\n      }\n    })()\n  }, [])\n\n"""
# ensureAnonymousSession import
hook = replace_once(hook, "  createTeachingSession,\n", "  createTeachingSession,\n  ensureAnonymousSession,\n", 'ensure auth import')
hook = replace_once(hook, insert_before_leave, rejoin_code + insert_before_leave, 'instructor rejoin code')

# Start heartbeat after new instructor setup.
hook = replace_once(
    hook,
    "      await attachSubscription(created.sessionId)\n      await attachMemberSubscription(created.sessionId)\n",
    "      await attachSubscription(created.sessionId)\n      await attachMemberSubscription(created.sessionId)\n      attachInstructorLease(created.sessionId, clientId)\n      setRecoverableInstructor(null)\n",
    'start instructor lease heartbeat',
)

# Cleanup lease timers and session storage on end only.
hook = replace_once(
    hook,
    "    if (telemetryTimerRef.current != null) window.clearTimeout(telemetryTimerRef.current)\n",
    "    if (telemetryTimerRef.current != null) window.clearTimeout(telemetryTimerRef.current)\n    if (instructorHeartbeatRef.current != null) window.clearInterval(instructorHeartbeatRef.current)\n",
    'lease cleanup',
)
hook = replace_once(
    hook,
    "    await leaveSession()\n  }\n\n  const updatePolicy",
    "    sessionStorage.removeItem('eduvent.instructor-session-id')\n    sessionStorage.removeItem('eduvent.instructor-client-id')\n    instructorClientIdRef.current = null\n    await leaveSession()\n  }\n\n  const updatePolicy",
    'clear instructor persistence on end',
)

# Candidate alarm lock and return values.
hook = replace_once(
    hook,
    "  const candidatePatientLocked = role === 'candidate' && Boolean(session?.sync_patient) && !Boolean(session?.candidate_can_edit_patient)\n\n  return {\n",
    "  const candidatePatientLocked = role === 'candidate' && Boolean(session?.sync_patient) && !Boolean(session?.candidate_can_edit_patient)\n  const candidateAlarmsLocked = role === 'candidate' && Boolean(session?.sync_alarms) && !Boolean(session?.candidate_can_edit_alarms)\n\n  return {\n",
    'alarm lock',
)
hook = replace_once(
    hook,
    "    candidatePatientLocked,\n    startInstructor,\n",
    "    candidatePatientLocked,\n    candidateAlarmsLocked,\n    recoverableInstructor,\n    startInstructor,\n    resumeInstructor,\n",
    'return rejoin/alarm lock',
)

hook_path.write_text(hook)

# --- SessionPanel.tsx -----------------------------------------------------
panel_path = Path('src/components/SessionPanel.tsx')
panel = panel_path.read_text()
panel = replace_once(
    panel,
    "  onStartInstructor: () => Promise<void>\n",
    "  recoverableInstructor?: { sessionId: string; sessionKey: string } | null\n  onStartInstructor: () => Promise<void>\n  onResumeInstructor?: (sessionId?: string) => Promise<void>\n",
    'panel resume props',
)
panel = replace_once(
    panel,
    "    candidateCanEditVentilator?: boolean\n  }) => Promise<void>\n",
    "    candidateCanEditVentilator?: boolean\n    syncAlarms?: boolean\n    candidateCanEditAlarms?: boolean\n  }) => Promise<void>\n",
    'panel alarm policy props',
)
panel = replace_once(
    panel,
    "  onStartInstructor,\n  onJoinCandidate,\n",
    "  recoverableInstructor,\n  onStartInstructor,\n  onResumeInstructor,\n  onJoinCandidate,\n",
    'panel destructure resume',
)

# Candidate alarm strip.
panel = replace_once(
    panel,
    "  return (\n    <article className={`candidate-card ${online ? 'online' : 'offline'}`}>\n",
    "  return (\n    <article className={`candidate-card ${online ? 'online' : 'offline'}`}>\n      {member.alarm_level && <div className={`candidate-alarm-strip ${member.alarm_level}`} aria-label={`${member.alarm_level} candidate alarm`} />}\n",
    'candidate alarm strip',
)

# Standalone recovery action.
panel = replace_once(
    panel,
    "            <button type=\"button\" className=\"session-secondary-button\" onClick={() => setJoinMode(true)}>Join as candidate</button>\n",
    "            <button type=\"button\" className=\"session-secondary-button\" onClick={() => setJoinMode(true)}>Join as candidate</button>\n            {recoverableInstructor && onResumeInstructor && (\n              <button type=\"button\" className=\"session-secondary-button\" onClick={() => void onResumeInstructor(recoverableInstructor.sessionId)}>Rejoin instructor {recoverableInstructor.sessionKey}</button>\n            )}\n",
    'rejoin button',
)

# Add alarm domain card after ventilator card.
vent_card_end = """          <div className={`session-domain-card ${session?.sync_ventilator ? 'shared' : ''}`}>\n            <div className=\"session-domain-title\"><strong>Ventilator</strong><span>{session?.sync_ventilator ? 'Shared' : 'Local'}</span></div>\n            <label className=\"session-switch-row\">\n              <span>Share ventilator settings</span>\n              <input type=\"checkbox\" checked={Boolean(session?.sync_ventilator)} onChange={(event) => void onUpdatePolicy({ syncVentilator: event.target.checked })} />\n            </label>\n            <label className=\"session-switch-row\">\n              <span>Candidate may change</span>\n              <input type=\"checkbox\" checked={Boolean(session?.candidate_can_edit_ventilator)} disabled={!session?.sync_ventilator} onChange={(event) => void onUpdatePolicy({ candidateCanEditVentilator: event.target.checked })} />\n            </label>\n          </div>\n"""
alarm_card = vent_card_end + """\n          <div className={`session-domain-card ${session?.sync_alarms ? 'shared' : ''}`}>\n            <div className=\"session-domain-title\"><strong>Alarms</strong><span>{session?.sync_alarms ? 'Shared' : 'Local'}</span></div>\n            <label className=\"session-switch-row\">\n              <span>Share alarm settings</span>\n              <input type=\"checkbox\" checked={Boolean(session?.sync_alarms)} onChange={(event) => void onUpdatePolicy({ syncAlarms: event.target.checked })} />\n            </label>\n            <label className=\"session-switch-row\">\n              <span>Candidate may change</span>\n              <input type=\"checkbox\" checked={Boolean(session?.candidate_can_edit_alarms)} disabled={!session?.sync_alarms} onChange={(event) => void onUpdatePolicy({ candidateCanEditAlarms: event.target.checked })} />\n            </label>\n          </div>\n"""
panel = replace_once(panel, vent_card_end, alarm_card, 'alarm domain card')

# Candidate status includes alarms.
panel = replace_once(
    panel,
    "          <span className={session?.sync_ventilator && !session?.candidate_can_edit_ventilator ? 'locked' : 'available'}>\n            Ventilator: {session?.sync_ventilator ? (session.candidate_can_edit_ventilator ? 'shared / editable' : 'instructor controlled') : 'candidate local'}\n          </span>\n",
    "          <span className={session?.sync_ventilator && !session?.candidate_can_edit_ventilator ? 'locked' : 'available'}>\n            Ventilator: {session?.sync_ventilator ? (session.candidate_can_edit_ventilator ? 'shared / editable' : 'instructor controlled') : 'candidate local'}\n          </span>\n          <span className={session?.sync_alarms && !session?.candidate_can_edit_alarms ? 'locked' : 'available'}>\n            Alarms: {session?.sync_alarms ? (session.candidate_can_edit_alarms ? 'shared / editable' : 'instructor controlled') : 'candidate local'}\n          </span>\n",
    'candidate alarm status',
)

panel = panel.replace("if (version) version.textContent = 'v0.47'", "if (version) version.textContent = 'v0.48'", 1)
panel_path.write_text(panel)

# --- App SessionPanel props -----------------------------------------------
app = app_path.read_text()
app = replace_once(
    app,
    "          role={teachingSession.role}\n          connection={teachingSession.connection}\n          session={teachingSession.session}\n          error={teachingSession.error}\n",
    "          role={teachingSession.role}\n          connection={teachingSession.connection}\n          session={teachingSession.session}\n          error={teachingSession.error}\n          recoverableInstructor={teachingSession.recoverableInstructor}\n",
    'App recoverable prop',
)
app = replace_once(
    app,
    "          onStartInstructor={teachingSession.startInstructor}\n",
    "          onStartInstructor={teachingSession.startInstructor}\n          onResumeInstructor={teachingSession.resumeInstructor}\n",
    'App resume prop',
)
app_path.write_text(app)

# --- CSS -----------------------------------------------------------------
css_path = Path('src/instructor.css')
css = css_path.read_text()
css += """\n\n/* v0.48 alarm lifecycle */\n.alarm-slot {\n  min-height: 42px;\n  height: 42px;\n  background: #0a1014;\n  border-bottom: 1px solid #253139;\n}\n.alarm-slot .alarm-banner {\n  min-height: 42px;\n  height: 42px;\n  margin: 0;\n  border-radius: 0;\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n}\n.alarm-banner.grey {\n  background: #343b3f !important;\n  border-color: #56636a !important;\n  color: #c4ced2 !important;\n  box-shadow: none !important;\n}\n.candidate-card { position: relative; overflow: hidden; }\n.candidate-alarm-strip { height: 5px; margin: -10px -10px 8px; }\n.candidate-alarm-strip.yellow { background: #e8b94e; }\n.candidate-alarm-strip.red { background: #e45f5f; }\n.session-domain-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }\n@media (max-width: 1180px) { .session-domain-grid { grid-template-columns: 1fr 1fr; } }\n@media (max-width: 760px) { .session-domain-grid { grid-template-columns: 1fr; } }\n"""
css_path.write_text(css)

# Remove this one-shot patch workflow/script from the resulting branch commit.
Path('.github/workflows/v048_patch.yml').unlink(missing_ok=True)
Path('scripts/v048_patch.py').unlink(missing_ok=True)
