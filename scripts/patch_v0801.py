from pathlib import Path


def replace_once(path: str, old: str, new: str):
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f'Pattern not found in {path}: {old[:160]!r}')
    if text.count(old) != 1:
        raise SystemExit(f'Pattern not unique in {path}: {text.count(old)}')
    p.write_text(text.replace(old, new, 1))

# Version
replace_once('src/appVersion.ts', "export const APP_VERSION = '0.80.0'", "export const APP_VERSION = '0.80.1'")

# Candidate session: mobile collapse state and body wrapper.
replace_once(
    'src/components/SessionPanel.tsx',
    "  const [sessionControlsExpanded, setSessionControlsExpanded] = useState(false)\n  const [dashboardCollapsed, setDashboardCollapsed] = useState(() => loadPanelCollapsed('instructor-dashboard'))",
    "  const [sessionControlsExpanded, setSessionControlsExpanded] = useState(false)\n  const [candidateCollapsed, setCandidateCollapsed] = useState(true)\n  const [dashboardCollapsed, setDashboardCollapsed] = useState(() => loadPanelCollapsed('instructor-dashboard'))",
)
replace_once(
    'src/components/SessionPanel.tsx',
    "  useEffect(() => {\n    if (!recoverableCandidate) return\n    setSessionKey(recoverableCandidate.sessionKey)\n    setDisplayName(recoverableCandidate.displayName)\n  }, [recoverableCandidate])",
    "  useEffect(() => {\n    if (!recoverableCandidate) return\n    setSessionKey(recoverableCandidate.sessionKey)\n    setDisplayName(recoverableCandidate.displayName)\n  }, [recoverableCandidate])\n\n  useEffect(() => {\n    if (role === 'candidate') setCandidateCollapsed(true)\n  }, [role, session?.id])",
)
old_candidate = '''  return (\n    <section className="session-panel candidate-session-panel">\n      <div className="session-panel-heading">\n        <div><span className="session-kicker">Teaching</span><h2>Candidate session</h2></div>\n        <div className="session-transport-badges">\n          <ConnectionBadge connection={connection} />\n          <RuntimeTransportBadge connection={localRuntimeConnection} url={localRuntimeUrl} kind={runtimeTransportKind} />\n        </div>\n      </div>\n      <div className="candidate-session-summary">\n        <span>Session <strong>{session?.session_key ?? '———'}</strong></span>\n        <div className="candidate-control-status">\n          <span className={session?.sync_patient && !session?.candidate_can_edit_patient ? 'locked' : 'available'}>\n            Patient: {session?.sync_patient ? (session.candidate_can_edit_patient ? 'shared / editable' : 'instructor controlled') : 'candidate local'}\n          </span>\n          <span className={session?.sync_ventilator && !session?.candidate_can_edit_ventilator ? 'locked' : 'available'}>\n            Ventilator: {session?.sync_ventilator ? (session.candidate_can_edit_ventilator ? 'shared / editable' : 'instructor controlled') : 'candidate local'}\n          </span>\n          <span className={!session?.candidate_can_edit_waveforms ? 'locked' : 'available'}>\n            Waveforms: {session?.candidate_can_edit_waveforms ? 'editable' : 'instructor locked'} • Oesophageal pressure: {session?.allow_oesophageal_pressure ? 'available' : 'hidden'}\n          </span>\n          <span className={session?.sync_alarms && !session?.candidate_can_edit_alarms ? 'locked' : 'available'}>\n            Alarms: {session?.sync_alarms ? (session.candidate_can_edit_alarms ? 'shared / editable' : 'instructor controlled') : 'candidate local'}{session?.sync_alarms && session?.alarms_silent ? ' / silent' : ''}\n          </span>\n        </div>\n      </div>\n      {session?.simulation_paused && <div className="session-warning">Simulation paused by instructor. The instructor controls when it resumes.</div>}\n      {connection === 'reconnecting' && <div className="session-warning">Connection lost. Simulation continues with the last received settings while EDUVENT reconnects.</div>}\n      {error && <div className="session-error" role="alert">{error}</div>}\n      <button type="button" className="session-secondary-button" onClick={() => void onLeaveSession()}>Leave session</button>\n    </section>\n  )'''
new_candidate = '''  return (\n    <section className={`session-panel candidate-session-panel ${candidateCollapsed ? 'candidate-mobile-collapsed' : ''}`}>\n      <div className="session-panel-heading">\n        <div><span className="session-kicker">Teaching</span><h2>Candidate session</h2></div>\n        <div className="candidate-session-heading-actions">\n          <div className="session-transport-badges">\n            <ConnectionBadge connection={connection} />\n            <RuntimeTransportBadge connection={localRuntimeConnection} url={localRuntimeUrl} kind={runtimeTransportKind} />\n          </div>\n          <button\n            className="panel-collapse-button candidate-session-collapse-button"\n            type="button"\n            onClick={() => setCandidateCollapsed((value) => !value)}\n            aria-expanded={!candidateCollapsed}\n            aria-label={candidateCollapsed ? 'Expand candidate session' : 'Collapse candidate session'}\n            title={candidateCollapsed ? 'Expand candidate session' : 'Collapse candidate session'}\n          >{candidateCollapsed ? '▾' : '▴'}</button>\n        </div>\n      </div>\n      <div className="candidate-session-body">\n        <div className="candidate-session-summary">\n          <span>Session <strong>{session?.session_key ?? '———'}</strong></span>\n          <div className="candidate-control-status">\n            <span className={session?.sync_patient && !session?.candidate_can_edit_patient ? 'locked' : 'available'}>\n              Patient: {session?.sync_patient ? (session.candidate_can_edit_patient ? 'shared / editable' : 'instructor controlled') : 'candidate local'}\n            </span>\n            <span className={session?.sync_ventilator && !session?.candidate_can_edit_ventilator ? 'locked' : 'available'}>\n              Ventilator: {session?.sync_ventilator ? (session.candidate_can_edit_ventilator ? 'shared / editable' : 'instructor controlled') : 'candidate local'}\n            </span>\n            <span className={!session?.candidate_can_edit_waveforms ? 'locked' : 'available'}>\n              Waveforms: {session?.candidate_can_edit_waveforms ? 'editable' : 'instructor locked'} • Oesophageal pressure: {session?.allow_oesophageal_pressure ? 'available' : 'hidden'}\n            </span>\n            <span className={session?.sync_alarms && !session?.candidate_can_edit_alarms ? 'locked' : 'available'}>\n              Alarms: {session?.sync_alarms ? (session.candidate_can_edit_alarms ? 'shared / editable' : 'instructor controlled') : 'candidate local'}{session?.sync_alarms && session?.alarms_silent ? ' / silent' : ''}\n            </span>\n          </div>\n        </div>\n        {session?.simulation_paused && <div className="session-warning">Simulation paused by instructor. The instructor controls when it resumes.</div>}\n        {connection === 'reconnecting' && <div className="session-warning">Connection lost. Simulation continues with the last received settings while EDUVENT reconnects.</div>}\n        {error && <div className="session-error" role="alert">{error}</div>}\n        <button type="button" className="session-secondary-button" onClick={() => void onLeaveSession()}>Leave session</button>\n      </div>\n    </section>\n  )'''
replace_once('src/components/SessionPanel.tsx', old_candidate, new_candidate)

# App icons and compact hold labels.
replace_once(
    'src/App.tsx',
    '''function NebuliserIcon() {''',
    '''function FreezeWaveformIcon() {\n  return (\n    <svg viewBox="0 0 24 24" aria-hidden="true">\n      <path d="M2 9h4V5l5 7-5 7v-4H2zm20 0h-4V5l-5 7 5 7v-4h4zM11 3h2v18h-2z" fill="currentColor" />\n    </svg>\n  )\n}\n\nfunction NebuliserIcon() {''',
)
replace_once(
    'src/App.tsx',
    '''<button className={`hardware-button icon-button freeze-button ${frozen ? 'active' : ''}`} onClick={toggleFreeze} disabled={teachingSession.candidatePauseLocked} title={teachingSession.candidatePauseLocked ? 'Simulation paused by instructor' : (frozen ? 'Resume simulation' : 'Pause and freeze waveforms')} aria-label={teachingSession.candidatePauseLocked ? 'Simulation paused by instructor' : (frozen ? 'Resume simulation' : 'Pause simulation')}><PauseIcon paused={frozen} /></button>''',
    '''<button className={`hardware-button icon-button freeze-button ${frozen ? 'active' : ''}`} onClick={toggleFreeze} disabled={teachingSession.candidatePauseLocked} title={teachingSession.candidatePauseLocked ? 'Simulation paused by instructor' : (frozen ? 'Resume simulation' : 'Freeze waveforms')} aria-label={teachingSession.candidatePauseLocked ? 'Simulation paused by instructor' : (frozen ? 'Resume simulation' : 'Freeze waveforms')}><FreezeWaveformIcon /></button>''',
)
replace_once(
    'src/App.tsx',
    '''              className={`hardware-button ${inspiratoryHoldPressed ? 'active' : ''}`}
''',
    '''              className={`hardware-button hold-button ${inspiratoryHoldPressed ? 'active' : ''}`}
''',
)
replace_once(
    'src/App.tsx',
    '''            >Insp Hold</button>''',
    '''            ><span className="hold-label-desktop">Insp Hold</span><span className="hold-label-mobile">Insp <PauseIcon paused={false} /></span></button>''',
)
replace_once(
    'src/App.tsx',
    '''              className={`hardware-button ${expiratoryHoldPressed ? 'active' : ''}`}
''',
    '''              className={`hardware-button hold-button ${expiratoryHoldPressed ? 'active' : ''}`}
''',
)
replace_once(
    'src/App.tsx',
    '''            >Exp Hold</button>''',
    '''            ><span className="hold-label-desktop">Exp Hold</span><span className="hold-label-mobile">Exp <PauseIcon paused={false} /></span></button>''',
)

# Add mobile candidate session at the very top of the workspace; keep the existing desktop instance.
session_panel = '''          <SessionPanel
            role={teachingSession.role}
            simulatorExpanded={instructorSimulatorExpanded}
            onSimulatorExpandedChange={setInstructorSimulatorExpanded}
            connection={teachingSession.connection}
            localRuntimeConnection={teachingSession.localRuntimeConnection}
            localRuntimeUrl={teachingSession.localRuntimeUrl}
            runtimeTransportKind={teachingSession.runtimeTransportKind}
            session={teachingSession.session}
            members={teachingSession.members}
            error={teachingSession.error}
            recoverableInstructor={teachingSession.recoverableInstructor}
            recoverableCandidate={teachingSession.recoverableCandidate}
            currentScenario={currentInstructorScenario}
            onLoadScenario={loadInstructorScenario}
            onStartInstructor={startInstructorSession}
            onResumeInstructor={teachingSession.resumeInstructor}
            onJoinCandidate={teachingSession.joinCandidate}
            onResumeCandidate={teachingSession.resumeCandidate}
            onLeaveSession={teachingSession.leaveSession}
            onEndInstructorSession={teachingSession.endInstructorSession}
            onUpdatePolicy={teachingSession.updatePolicy}
            onBroadcastNow={teachingSession.broadcastNow}
          />'''
mobile_panel = '''        {teachingSession.role === 'candidate' && (
          <div className="mobile-candidate-session-slot">
''' + session_panel.replace('          ', '            ', 1) + '''
          </div>
        )}
'''
replace_once('src/App.tsx', '''      <div className="workspace">\n        {teachingSession.role === 'instructor' && (''', '''      <div className="workspace">\n''' + mobile_panel + '''        {teachingSession.role === 'instructor' && (''')

# Interactive ventilator values split from units and kept to one row.
replace_once(
    'src/components/InteractiveVentilatorStrip.tsx',
    '''  display: string\n  min: number''',
    '''  display: string\n  unit: string\n  min: number''',
)
replacements = {
"{ key: 'fio2', label: 'FiO₂', value: displayedFio2, display: `${displayedFio2}%`, min: 21, max: 100, step: 1 }": "{ key: 'fio2', label: 'FiO₂', value: displayedFio2, display: `${displayedFio2}`, unit: '%', min: 21, max: 100, step: 1 }",
"{ key: 'pHigh', label: 'Phigh', value: settings.pHigh, display: `${settings.pHigh} cmH₂O`, min: 10, max: 40, step: 1 }": "{ key: 'pHigh', label: 'Phigh', value: settings.pHigh, display: `${settings.pHigh}`, unit: 'cmH₂O', min: 10, max: 40, step: 1 }",
"{ key: 'pLow', label: 'Plow', value: settings.pLow, display: `${settings.pLow} cmH₂O`, min: 0, max: 15, step: 1 }": "{ key: 'pLow', label: 'Plow', value: settings.pLow, display: `${settings.pLow}`, unit: 'cmH₂O', min: 0, max: 15, step: 1 }",
"{ key: 'tHigh', label: 'Thigh', value: settings.tHigh, display: `${settings.tHigh.toFixed(1)} s`, min: 0.5, max: 10, step: 0.1 }": "{ key: 'tHigh', label: 'Thigh', value: settings.tHigh, display: `${settings.tHigh.toFixed(1)}`, unit: 's', min: 0.5, max: 10, step: 0.1 }",
"{ key: 'tLow', label: 'Tlow', value: settings.tLow, display: `${settings.tLow.toFixed(2)} s`, min: 0.2, max: 2, step: 0.05 }": "{ key: 'tLow', label: 'Tlow', value: settings.tLow, display: `${settings.tLow.toFixed(2)}`, unit: 's', min: 0.2, max: 2, step: 0.05 }",
"{ key: 'peep', label: 'PEEP', value: settings.peep, display: `${settings.peep} cmH₂O`, min: 0, max: 20, step: 1 }": "{ key: 'peep', label: 'PEEP', value: settings.peep, display: `${settings.peep}`, unit: 'cmH₂O', min: 0, max: 20, step: 1 }",
"{ key: 'pressureControl', label: 'Pinsp', value: settings.pressureControl, display: `${settings.pressureControl} cmH₂O`, min: 5, max: 30, step: 1 }": "{ key: 'pressureControl', label: 'Pinsp', value: settings.pressureControl, display: `${settings.pressureControl}`, unit: 'cmH₂O', min: 5, max: 30, step: 1 }",
"{ key: 'rate', label: 'RR', value: settings.rate, display: `${settings.rate}/min`, min: 5, max: 35, step: 1 }": "{ key: 'rate', label: 'RR', value: settings.rate, display: `${settings.rate}`, unit: '/min', min: 5, max: 35, step: 1 }",
"{ key: 'ieRatio', label: 'I:E', value: Number(currentIeRatio.toFixed(1)), display: `1:${currentIeRatio.toFixed(1)}`, min: MIN_IE, max: MAX_IE, step: 0.1 }": "{ key: 'ieRatio', label: 'I:E', value: Number(currentIeRatio.toFixed(1)), display: `1:${currentIeRatio.toFixed(1)}`, unit: '', min: MIN_IE, max: MAX_IE, step: 0.1 }",
"{ key: 'rate', label: isSimvMode(settings.mode) ? 'SIMV RR' : 'RR', value: settings.rate, display: `${settings.rate}/min`, min: 5, max: 35, step: 1 }": "{ key: 'rate', label: isSimvMode(settings.mode) ? 'SIMV RR' : 'RR', value: settings.rate, display: `${settings.rate}`, unit: '/min', min: 5, max: 35, step: 1 }",
"{ key: 'tidalVolume', label: settings.mode === 'VG-PC' ? 'VT target' : 'VT', value: settings.tidalVolume, display: `${settings.tidalVolume} mL`, min: 250, max: 800, step: 10 }": "{ key: 'tidalVolume', label: settings.mode === 'VG-PC' ? 'VT target' : 'VT', value: settings.tidalVolume, display: `${settings.tidalVolume}`, unit: 'mL', min: 250, max: 800, step: 10 }",
"{ key: 'inspiratoryFlow', label: 'Flow', value: Number(settings.inspiratoryFlow.toFixed(0)), display: `${settings.inspiratoryFlow.toFixed(0)} L/min`, min: 10, max: 140, step: 1 }": "{ key: 'inspiratoryFlow', label: 'Flow', value: Number(settings.inspiratoryFlow.toFixed(0)), display: `${settings.inspiratoryFlow.toFixed(0)}`, unit: 'L/min', min: 10, max: 140, step: 1 }",
"{ key: 'plateauPercent', label: 'Plateau', value: settings.plateauPercent ?? 0, display: `${settings.plateauPercent ?? 0}% Ti`, min: 0, max: 20, step: 1 }": "{ key: 'plateauPercent', label: 'Plateau', value: settings.plateauPercent ?? 0, display: `${settings.plateauPercent ?? 0}`, unit: '% Ti', min: 0, max: 20, step: 1 }",
"{ key: 'volumeGuaranteePressureLimit', label: 'Pmax', value: settings.volumeGuaranteePressureLimit ?? 40, display: `${settings.volumeGuaranteePressureLimit ?? 40} cmH₂O`, min: 20, max: 60, step: 1 }": "{ key: 'volumeGuaranteePressureLimit', label: 'Pmax', value: settings.volumeGuaranteePressureLimit ?? 40, display: `${settings.volumeGuaranteePressureLimit ?? 40}`, unit: 'cmH₂O', min: 20, max: 60, step: 1 }",
"{ key: 'pressureSupport', label: 'PS', value: settings.pressureSupport, display: `${settings.pressureSupport} cmH₂O`, min: 0, max: 25, step: 1 }": "{ key: 'pressureSupport', label: 'PS', value: settings.pressureSupport, display: `${settings.pressureSupport}`, unit: 'cmH₂O', min: 0, max: 25, step: 1 }",
"{ key: 'terminationSensitivity', label: 'ETS', value: settings.terminationSensitivity, display: `${settings.terminationSensitivity}%`, min: 5, max: 80, step: 5 }": "{ key: 'terminationSensitivity', label: 'ETS', value: settings.terminationSensitivity, display: `${settings.terminationSensitivity}`, unit: '%', min: 5, max: 80, step: 5 }",
"{ key: 'simvSyncWindowPercent', label: 'Sync', value: settings.simvSyncWindowPercent ?? 25, display: `${settings.simvSyncWindowPercent ?? 25}%`, min: 5, max: 75, step: 5 }": "{ key: 'simvSyncWindowPercent', label: 'Sync', value: settings.simvSyncWindowPercent ?? 25, display: `${settings.simvSyncWindowPercent ?? 25}`, unit: '%', min: 5, max: 75, step: 5 }",
}
p = Path('src/components/InteractiveVentilatorStrip.tsx')
text = p.read_text()
for old, new in replacements.items():
    if old not in text:
        raise SystemExit(f'Interactive control pattern not found: {old}')
    text = text.replace(old, new)
p.write_text(text)
replace_once(
    'src/components/InteractiveVentilatorStrip.tsx',
    '''            <span>{control.label}</span>\n            <strong>{control.display}</strong>''',
    '''            <span>{control.label}</span>\n            <strong><b>{control.display}</b>{control.unit && <small>{control.unit}</small>}</strong>''',
)
replace_once(
    'src/components/InteractiveVentilatorStrip.tsx',
    '''          <strong>{activeControl.display}</strong>''',
    '''          <strong>{activeControl.display}{activeControl.unit ? ` ${activeControl.unit}` : ''}</strong>''',
)

# CSS: mobile candidate placement/collapse.
p = Path('src/session.css')
text = p.read_text()
text += '''\n\n/* v0.80.1 mobile candidate session */\n.mobile-candidate-session-slot { display: none; }\n.candidate-session-heading-actions { display: flex; align-items: center; gap: 7px; }\n.candidate-session-collapse-button { display: none; }\n@media (max-width: 680px) {\n  .mobile-candidate-session-slot { display: block; grid-column: 1 / -1; }\n  .mobile-candidate-session-slot .session-panel { margin-bottom: 0; }\n  .control-panel > .candidate-session-panel { display: none; }\n  .candidate-session-collapse-button { display: inline-grid; }\n  .candidate-session-panel.candidate-mobile-collapsed .session-panel-heading { margin-bottom: 0; }\n  .candidate-session-panel.candidate-mobile-collapsed .candidate-session-body { display: none; }\n  .candidate-session-heading-actions { min-width: 0; }\n  .candidate-session-heading-actions .session-transport-badges { min-width: 0; display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 5px; }\n}\n'''
p.write_text(text)

# CSS: one-row toolbar, compact mobile holds, and freeze/hold SVG sizing.
p = Path('src/interactive-vent-controls.css')
text = p.read_text()
text = text.replace('''  flex-wrap: wrap;\n  gap: 8px;\n  align-items: stretch;''', '''  flex-wrap: nowrap;\n  gap: 6px;\n  align-items: stretch;\n  overflow-x: auto;\n  scrollbar-width: none;''', 1)
text = text.replace('''  min-height: 46px;\n  padding: 7px 10px;''', '''  flex: 1 1 0;\n  min-width: 0;\n  min-height: 50px;\n  padding: 6px 5px;''', 1)
text = text.replace('''  align-items: flex-start;\n  gap: 2px;''', '''  align-items: center;\n  gap: 2px;''', 1)
text = text.replace('''  text-align: left;''', '''  text-align: center;''', 1)
text = text.replace('''  text-transform: uppercase;\n}\n\n.interactive-setting-button > strong {\n  margin-top: 3px;\n  color: #eef6f8;\n  font-size: 14px;\n  line-height: 1.05;\n  white-space: nowrap;\n  font-variant-numeric: tabular-nums;\n}''', '''  text-transform: uppercase;\n  max-width: 100%;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.interactive-setting-button > strong {\n  margin-top: 2px;\n  display: flex;\n  flex-direction: column;\n  align-items: center;\n  color: #eef6f8;\n  line-height: 1;\n  white-space: nowrap;\n  font-variant-numeric: tabular-nums;\n}\n.interactive-setting-button > strong > b { font-size: 14px; font-weight: 700; }\n.interactive-setting-button > strong > small { margin-top: 2px; color: #788b94; font-size: 7px; font-weight: 650; line-height: 1; }''', 1)
text = text.replace('''.console-top-actions .oxygen-button {\n  min-width: 52px;\n  font-size: 18px;\n}\n''', '''.console-top-actions .oxygen-button {\n  min-width: 52px;\n  font-size: 18px;\n}\n\n.hold-label-mobile { display: none; }\n.hold-label-mobile svg { width: 15px; height: 15px; }\n''', 1)
text = text.replace('''  .console-top-actions {\n    flex-wrap: wrap;\n  }''', '''  .console-top-actions {\n    flex-wrap: nowrap;\n  }''', 1)
text = text.replace('''  .console-top-actions {\n    width: 100%;\n    margin-left: 0;\n    justify-content: flex-start;\n  }''', '''  .console-top-actions {\n    width: 100%;\n    margin-left: 0;\n    justify-content: flex-start;\n    flex-wrap: nowrap;\n    gap: 4px;\n    overflow-x: auto;\n    scrollbar-width: none;\n  }\n\n  .console-top-actions .hardware-button {\n    flex: 0 0 auto;\n    min-height: 38px;\n    height: 38px;\n    padding: 5px 6px;\n  }\n\n  .console-top-actions .icon-button { width: 38px; }\n  .console-top-actions .icon-button svg { width: 21px; height: 21px; }\n  .console-top-actions .oxygen-button { min-width: 42px; font-size: 16px; }\n  .console-top-actions .hold-button { min-width: 53px; font-size: 9px; }\n  .hold-label-desktop { display: none; }\n  .hold-label-mobile { display: inline-flex; align-items: center; gap: 2px; white-space: nowrap; }''', 1)
text = text.replace('''  .interactive-vent-summary {\n    gap: 6px;\n  }\n\n  .interactive-setting-button {\n    min-height: 44px;\n    padding: 7px 8px;\n  }''', '''  .interactive-vent-summary {\n    gap: 3px;\n    flex-wrap: nowrap;\n  }\n\n  .interactive-setting-button {\n    min-height: 46px;\n    padding: 5px 2px;\n  }\n  .interactive-setting-button > span { font-size: 7px; letter-spacing: .03em; }\n  .interactive-setting-button > strong > b { font-size: 12px; }\n  .interactive-setting-button > strong > small { font-size: 6.5px; }''', 1)
p.write_text(text)

# Keep mobile slot visually first in the workspace.
p = Path('src/styles.css')
text = p.read_text()
text += '''\n\n/* v0.80.1 compact mobile ventilator toolbar */\n@media (max-width: 680px) {\n  .workspace > .mobile-candidate-session-slot { order: -2; }\n}\n'''
p.write_text(text)
