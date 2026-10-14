from pathlib import Path


def replace_once(path: str, old: str, new: str):
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f'Pattern not found in {path}: {old[:120]!r}')
    if text.count(old) != 1:
        raise SystemExit(f'Pattern not unique in {path}: found {text.count(old)}')
    p.write_text(text.replace(old, new, 1))

# Candidate invitation copy cleanup.
replace_once(
    'src/components/CandidateInvitation.tsx',
    '''      reportEmailResult(\n        'success',\n        `Invitation email sent to ${sent} candidate${sent === 1 ? '' : 's'}. Brevo accepted ${sent === 1 ? 'it' : 'them'} for delivery.`,\n      )''',
    '''      reportEmailResult(\n        'success',\n        `Invitation email sent to ${sent} candidate${sent === 1 ? '' : 's'}.`,\n      )''',
)
replace_once(
    'src/components/CandidateInvitation.tsx',
    '''              <strong>{joinUrl}</strong>\n              <small>Candidate enters their name after opening the link.</small>''',
    '''              <strong>{joinUrl}</strong>''',
)
replace_once(
    'src/components/CandidateInvitation.tsx',
    '''              <small className="candidate-invite-delivery-note">\n                Invitations are sent securely by the EDUVENT Supabase Edge Function through Brevo.\n              </small>\n''',
    '',
)

# Hoist simulator expansion state to App so the workspace rail itself is actionable.
replace_once(
    'src/components/SessionPanel.tsx',
    '''  role: SessionRole\n  connection: SessionConnection''',
    '''  role: SessionRole\n  simulatorExpanded: boolean\n  onSimulatorExpandedChange: (expanded: boolean) => void\n  connection: SessionConnection''',
)
replace_once(
    'src/components/SessionPanel.tsx',
    '''export function SessionPanel({\n  role,\n  connection,''',
    '''export function SessionPanel({\n  role,\n  simulatorExpanded,\n  onSimulatorExpandedChange,\n  connection,''',
)
replace_once(
    'src/components/SessionPanel.tsx',
    '''  const [displayName, setDisplayName] = useState('')\n  const [simulatorExpanded, setSimulatorExpanded] = useState(false)\n  const [sessionControlsExpanded, setSessionControlsExpanded] = useState(false)''',
    '''  const [displayName, setDisplayName] = useState('')\n  const [sessionControlsExpanded, setSessionControlsExpanded] = useState(false)''',
)
replace_once(
    'src/components/SessionPanel.tsx',
    '''  useEffect(() => {\n    if (role !== 'instructor') setSimulatorExpanded(false)\n  }, [role])''',
    '''  useEffect(() => {\n    if (role !== 'instructor' && simulatorExpanded) onSimulatorExpandedChange(false)\n  }, [role, simulatorExpanded, onSimulatorExpandedChange])''',
)
replace_once(
    'src/components/SessionPanel.tsx',
    '''        <div className="instructor-simulator-toggle-row">\n          <div>\n            <strong>Ventilator display</strong>\n            <span>{simulatorExpanded ? 'Waveforms and measured values are visible' : 'Hidden while you manage the teaching session'}</span>\n          </div>\n          <button type="button" className="session-secondary-button" onClick={() => setSimulatorExpanded((value) => !value)}>\n            {simulatorExpanded ? 'Hide ventilator display' : 'Show ventilator display'}\n          </button>\n        </div>\n\n''',
    '',
)

# App: alarm-highlight-aware measured value cells.
replace_once(
    'src/App.tsx',
    '''function Metric({ label, value, unit }: { label: string; value: string; unit: string }) {\n  return <div className="metric"><span>{label}</span><strong>{value}</strong><small>{unit}</small></div>\n}\n\nfunction GasMetric({ etco2, spo2 }: { etco2: string; spo2: string }) {\n  return (\n    <div className="metric gas-metric" aria-label={`EtCO₂ ${etco2} millimetres of mercury, SpO₂ ${spo2} percent`}>\n      <div className="gas-metric-item co2">\n        <span>EtCO₂</span>\n        <div><strong>{etco2}</strong><small>mmHg</small></div>\n      </div>\n      <div className="gas-metric-item spo2">\n        <span>SpO₂</span>\n        <div><strong>{spo2}</strong><small>%</small></div>\n      </div>\n    </div>\n  )\n}''',
    '''type MetricAlarmLevel = 'yellow' | 'red' | null\n\nfunction Metric({ label, value, unit, alarmLevel = null }: { label: string; value: string; unit: string; alarmLevel?: MetricAlarmLevel }) {\n  return <div className={`metric ${alarmLevel ? `metric-alarm-${alarmLevel}` : ''}`}><span>{label}</span><strong>{value}</strong><small>{unit}</small></div>\n}\n\nfunction GasMetric({ etco2, spo2, spo2AlarmLevel = null }: { etco2: string; spo2: string; spo2AlarmLevel?: MetricAlarmLevel }) {\n  return (\n    <div className="metric gas-metric" aria-label={`EtCO₂ ${etco2} millimetres of mercury, SpO₂ ${spo2} percent`}>\n      <div className="gas-metric-item co2">\n        <span>EtCO₂</span>\n        <div><strong>{etco2}</strong><small>mmHg</small></div>\n      </div>\n      <div className={`gas-metric-item spo2 ${spo2AlarmLevel ? `metric-alarm-${spo2AlarmLevel}` : ''}`}>\n        <span>SpO₂</span>\n        <div><strong>{spo2}</strong><small>%</small></div>\n      </div>\n    </div>\n  )\n}''',
)
replace_once(
    'src/App.tsx',
    '''  const [candidateAlarmLevelForSession, setCandidateAlarmLevelForSession] = useState<CandidateAlarmLevel>(null)\n  const scenarioClockOriginRef = useRef(WINDOW_SAMPLES * DT)''',
    '''  const [candidateAlarmLevelForSession, setCandidateAlarmLevelForSession] = useState<CandidateAlarmLevel>(null)\n  const [instructorSimulatorExpanded, setInstructorSimulatorExpanded] = useState(false)\n  const scenarioClockOriginRef = useRef(WINDOW_SAMPLES * DT)''',
)
replace_once(
    'src/App.tsx',
    '''  const visibleAlarmKeys = new Set([...activeAlarmKeys, ...resolvedYellowKeys, ...greyAlarmKeys])\n  const alarmLabels = [''',
    '''  const visibleAlarmKeys = new Set([...activeAlarmKeys, ...resolvedYellowKeys, ...greyAlarmKeys])\n  const measurementAlarmNeedsAttention = (...keys: string[]) => keys.some((key) => {\n    const entry = alarmLifecycle[key]\n    if (entry?.acknowledged) return false\n    if (alarmConditions[key as keyof typeof alarmConditions]) return true\n    return entry?.resolvedAt != null && alarmClock - entry.resolvedAt < 120000\n  })\n  const ppeakMetricAlarm: MetricAlarmLevel = measurementAlarmNeedsAttention('pressureLimit', 'pressure') ? 'yellow' : null\n  const tidalVolumeMetricAlarm: MetricAlarmLevel = measurementAlarmNeedsAttention('tidalVolumeLow', 'tidalVolumeHigh') ? 'yellow' : null\n  const minuteVentilationMetricAlarm: MetricAlarmLevel = measurementAlarmNeedsAttention('minuteVentilationLow', 'minuteVentilationHigh') ? 'yellow' : null\n  const respiratoryRateMetricAlarm: MetricAlarmLevel = apneaAlarmActive && !alarmLifecycle.apnea?.acknowledged\n    ? 'red'\n    : measurementAlarmNeedsAttention('respiratoryRateLow', 'respiratoryRateHigh') ? 'yellow' : null\n  const spo2MetricAlarm: MetricAlarmLevel = latestSample?.spo2 != null && latestSample.spo2 < 85 ? 'red' : null\n  const alarmLabels = [''',
)
replace_once(
    'src/App.tsx',
    '''      <div className="workspace">\n        <section className="ventilator-console">''',
    '''      <div className="workspace">\n        {teachingSession.role === 'instructor' && (\n          <button\n            type="button"\n            className={`instructor-ventilator-toggle ${instructorSimulatorExpanded ? 'expanded' : 'collapsed'}`}\n            onClick={() => setInstructorSimulatorExpanded((current) => !current)}\n            aria-expanded={instructorSimulatorExpanded}\n            title={instructorSimulatorExpanded ? 'Hide ventilator display' : 'Show ventilator display'}\n          >\n            <span>VENTILATOR</span>\n            <small>{instructorSimulatorExpanded ? 'HIDE' : 'SHOW'}</small>\n          </button>\n        )}\n        <section className="ventilator-console">''',
)
replace_once(
    'src/App.tsx',
    '''              <Metric label="Ppeak" value={eventMeasures.peakPressure.toFixed(0)} unit="cmH₂O" />\n              <Metric label="VTe" value={tidalVolumeDisplayAvailable ? eventMeasures.tidalVolume.toFixed(0) : '-'} unit={tidalVolumeDisplayAvailable ? 'mL' : ''} />\n              <Metric label="RR" value={eventMeasures.respiratoryRate.toFixed(0)} unit="/min" />\n              <Metric label="MV" value={measures.minuteVentilation.toFixed(1)} unit="L/min" />''',
    '''              <Metric label="Ppeak" value={eventMeasures.peakPressure.toFixed(0)} unit="cmH₂O" alarmLevel={ppeakMetricAlarm} />\n              <Metric label="VTe" value={tidalVolumeDisplayAvailable ? eventMeasures.tidalVolume.toFixed(0) : '-'} unit={tidalVolumeDisplayAvailable ? 'mL' : ''} alarmLevel={tidalVolumeMetricAlarm} />\n              <Metric label="RR" value={eventMeasures.respiratoryRate.toFixed(0)} unit="/min" alarmLevel={respiratoryRateMetricAlarm} />\n              <Metric label="MV" value={measures.minuteVentilation.toFixed(1)} unit="L/min" alarmLevel={minuteVentilationMetricAlarm} />''',
)
replace_once(
    'src/App.tsx',
    '''              <GasMetric\n                etco2={endTidalCO2 == null ? '-' : endTidalCO2.toFixed(0)}\n                spo2={latestSample?.spo2 == null ? '—' : latestSample.spo2.toFixed(0)}\n              />''',
    '''              <GasMetric\n                etco2={endTidalCO2 == null ? '-' : endTidalCO2.toFixed(0)}\n                spo2={latestSample?.spo2 == null ? '—' : latestSample.spo2.toFixed(0)}\n                spo2AlarmLevel={spo2MetricAlarm}\n              />''',
)
replace_once(
    'src/App.tsx',
    '''          <SessionPanel\n            role={teachingSession.role}\n            connection={teachingSession.connection}''',
    '''          <SessionPanel\n            role={teachingSession.role}\n            simulatorExpanded={instructorSimulatorExpanded}\n            onSimulatorExpandedChange={setInstructorSimulatorExpanded}\n            connection={teachingSession.connection}''',
)

# Replace the old instructor simulator layout with an explicit actionable left rail / divider.
instructor = Path('src/instructor.css')
text = instructor.read_text()
start = text.index('body.eduvent-instructor-mode:not(.eduvent-instructor-simulator-open) .workspace {')
end = text.index('.instructor-pause-banner {')
new_layout = '''.instructor-ventilator-toggle { display: none; }\n\nbody.eduvent-instructor-mode:not(.eduvent-instructor-simulator-open) .workspace {\n  grid-template-columns: 86px minmax(0, 1fr);\n}\n\nbody.eduvent-instructor-mode:not(.eduvent-instructor-simulator-open) .ventilator-console {\n  display: none;\n}\n\nbody.eduvent-instructor-mode:not(.eduvent-instructor-simulator-open) .instructor-ventilator-toggle {\n  display: flex;\n  grid-column: 1;\n  grid-row: 1;\n  position: sticky;\n  top: 18px;\n  min-height: calc(100vh - 112px);\n  max-height: calc(100vh - 112px);\n  align-items: center;\n  justify-content: center;\n  gap: 18px;\n  padding: 12px 8px;\n  border-color: rgba(126, 199, 231, .3);\n  border-radius: 15px;\n  background: linear-gradient(180deg, #111d24, #0b1419);\n  color: #9fc5d5;\n}\nbody.eduvent-instructor-mode:not(.eduvent-instructor-simulator-open) .instructor-ventilator-toggle span,\nbody.eduvent-instructor-mode:not(.eduvent-instructor-simulator-open) .instructor-ventilator-toggle small {\n  writing-mode: vertical-rl;\n  transform: rotate(180deg);\n}\nbody.eduvent-instructor-mode .instructor-ventilator-toggle span {\n  font-size: 10px;\n  font-weight: 900;\n  letter-spacing: .18em;\n}\nbody.eduvent-instructor-mode .instructor-ventilator-toggle small {\n  color: #63b9da;\n  font-size: 8px;\n  font-weight: 900;\n  letter-spacing: .12em;\n}\nbody.eduvent-instructor-mode .instructor-ventilator-toggle:hover:not(:disabled) {\n  border-color: #61bedd;\n  background: linear-gradient(180deg, #17303b, #0e2028);\n}\n\nbody.eduvent-instructor-mode:not(.eduvent-instructor-simulator-open) .control-panel {\n  grid-column: 2;\n  grid-row: 1;\n  max-height: none;\n  overflow: visible;\n  display: grid;\n  grid-template-columns: repeat(2, minmax(0, 1fr));\n  gap: 14px;\n  align-items: start;\n}\n\nbody.eduvent-instructor-mode:not(.eduvent-instructor-simulator-open) .control-panel > .session-panel,\nbody.eduvent-instructor-mode:not(.eduvent-instructor-simulator-open) .control-panel > .disclaimer {\n  grid-column: 1 / -1;\n}\n\nbody.eduvent-instructor-mode:not(.eduvent-instructor-simulator-open) .control-panel > .session-lock-fieldset {\n  min-width: 0;\n}\n\nbody.eduvent-instructor-mode.eduvent-instructor-simulator-open .workspace {\n  grid-template-columns: minmax(0, 1fr) 34px 430px;\n}\nbody.eduvent-instructor-mode.eduvent-instructor-simulator-open .ventilator-console { grid-column: 1; grid-row: 1; }\nbody.eduvent-instructor-mode.eduvent-instructor-simulator-open .instructor-ventilator-toggle {\n  display: flex;\n  grid-column: 2;\n  grid-row: 1;\n  align-self: stretch;\n  min-width: 0;\n  padding: 7px 3px;\n  flex-direction: column;\n  align-items: center;\n  justify-content: center;\n  gap: 12px;\n  border-radius: 10px;\n  border-color: rgba(126, 199, 231, .25);\n  background: #101a20;\n  color: #91b8c8;\n}\nbody.eduvent-instructor-mode.eduvent-instructor-simulator-open .instructor-ventilator-toggle span,\nbody.eduvent-instructor-mode.eduvent-instructor-simulator-open .instructor-ventilator-toggle small {\n  writing-mode: vertical-rl;\n  transform: rotate(180deg);\n}\nbody.eduvent-instructor-mode.eduvent-instructor-simulator-open .control-panel {\n  grid-column: 3;\n  grid-row: 1;\n  display: block;\n  max-height: calc(100vh - 92px);\n  overflow-y: auto;\n}\n\n'''
instructor.write_text(text[:start] + new_layout + text[end:])

# Replace old responsive block in instructor.css.
replace_once(
    'src/instructor.css',
    '''@media (max-width: 1100px) {\n  body.eduvent-instructor-mode:not(.eduvent-instructor-simulator-open) .control-panel {\n    grid-template-columns: 1fr;\n  }\n\n  body.eduvent-instructor-mode:not(.eduvent-instructor-simulator-open) .control-panel > .session-panel,\n  body.eduvent-instructor-mode:not(.eduvent-instructor-simulator-open) .control-panel > .disclaimer {\n    grid-column: 1;\n  }\n}\n''',
    '''@media (max-width: 1100px) {\n  body.eduvent-instructor-mode:not(.eduvent-instructor-simulator-open) .workspace,\n  body.eduvent-instructor-mode.eduvent-instructor-simulator-open .workspace {\n    grid-template-columns: 1fr;\n  }\n  body.eduvent-instructor-mode:not(.eduvent-instructor-simulator-open) .instructor-ventilator-toggle {\n    grid-column: 1;\n    grid-row: 1;\n    position: static;\n    min-height: 42px;\n    max-height: 42px;\n    flex-direction: row;\n  }\n  body.eduvent-instructor-mode.eduvent-instructor-simulator-open .ventilator-console { grid-column: 1; grid-row: 1; }\n  body.eduvent-instructor-mode.eduvent-instructor-simulator-open .instructor-ventilator-toggle {\n    grid-column: 1;\n    grid-row: 2;\n    min-height: 36px;\n    flex-direction: row;\n  }\n  body.eduvent-instructor-mode:not(.eduvent-instructor-simulator-open) .instructor-ventilator-toggle span,\n  body.eduvent-instructor-mode:not(.eduvent-instructor-simulator-open) .instructor-ventilator-toggle small,\n  body.eduvent-instructor-mode.eduvent-instructor-simulator-open .instructor-ventilator-toggle span,\n  body.eduvent-instructor-mode.eduvent-instructor-simulator-open .instructor-ventilator-toggle small {\n    writing-mode: horizontal-tb;\n    transform: none;\n  }\n  body.eduvent-instructor-mode:not(.eduvent-instructor-simulator-open) .control-panel {\n    grid-column: 1;\n    grid-row: 2;\n    grid-template-columns: 1fr;\n  }\n  body.eduvent-instructor-mode.eduvent-instructor-simulator-open .control-panel {\n    grid-column: 1;\n    grid-row: 3;\n    max-height: none;\n  }\n  body.eduvent-instructor-mode:not(.eduvent-instructor-simulator-open) .control-panel > .session-panel,\n  body.eduvent-instructor-mode:not(.eduvent-instructor-simulator-open) .control-panel > .disclaimer {\n    grid-column: 1;\n  }\n}\n''',
)

# Remove obsolete SessionPanel toggle styles and old :has()-based pseudo rail layout.
session = Path('src/session.css')
stext = session.read_text()
old_toggle_css = '''.instructor-simulator-toggle-row {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 12px;\n  margin-bottom: 10px;\n  padding: 10px 11px;\n  border: 1px solid rgba(126, 199, 231, .18);\n  border-radius: 10px;\n  background: rgba(31, 93, 121, .07);\n}\n.instructor-simulator-toggle-row > div { display: grid; gap: 2px; }\n.instructor-simulator-toggle-row strong { color: #ddecf3; font-size: 12px; }\n.instructor-simulator-toggle-row span { color: #7f9ba8; font-size: 10px; }\n\n'''
if old_toggle_css not in stext:
    raise SystemExit('Old instructor toggle CSS not found')
stext = stext.replace(old_toggle_css, '', 1)
start = stext.index('/* Instructor mode uses the dashboard as the primary workspace.')
end = stext.index('@media (max-width: 820px) {', start)
stext = stext[:start] + stext[end:]
stext = stext.replace('  .instructor-simulator-toggle-row { align-items: stretch; flex-direction: column; }\n', '', 1)
session.write_text(stext)

# Alarm value highlighting.
styles = Path('src/styles.css')
styles.write_text(styles.read_text() + '''\n\n/* v0.78.4 measured-value alarm emphasis */\n.metric.metric-alarm-yellow,\n.gas-metric-item.metric-alarm-yellow {\n  background: rgba(232, 185, 78, .24);\n  box-shadow: inset 0 0 0 2px rgba(232, 185, 78, .8), inset 0 0 22px rgba(232, 185, 78, .12);\n}\n.metric.metric-alarm-yellow > span,\n.metric.metric-alarm-yellow > strong,\n.metric.metric-alarm-yellow > small,\n.gas-metric-item.metric-alarm-yellow span,\n.gas-metric-item.metric-alarm-yellow strong,\n.gas-metric-item.metric-alarm-yellow small { color: #ffe18a !important; }\n.metric.metric-alarm-red,\n.gas-metric-item.metric-alarm-red {\n  background: rgba(206, 65, 65, .3);\n  box-shadow: inset 0 0 0 2px rgba(239, 91, 91, .92), inset 0 0 24px rgba(239, 91, 91, .16);\n}\n.metric.metric-alarm-red > span,\n.metric.metric-alarm-red > strong,\n.metric.metric-alarm-red > small,\n.gas-metric-item.metric-alarm-red span,\n.gas-metric-item.metric-alarm-red strong,\n.gas-metric-item.metric-alarm-red small { color: #ff9a9a !important; }\n''')

# Version bump.
Path('src/appVersion.ts').write_text("export const APP_VERSION = '0.78.4'\n")

# Static assertions for requested behavior.
assert 'Candidate enters their name after opening the link.' not in Path('src/components/CandidateInvitation.tsx').read_text()
assert 'Invitations are sent securely by the EDUVENT Supabase Edge Function through Brevo.' not in Path('src/components/CandidateInvitation.tsx').read_text()
assert 'Brevo accepted' not in Path('src/components/CandidateInvitation.tsx').read_text()
assert 'instructor-simulator-toggle-row' not in Path('src/components/SessionPanel.tsx').read_text()
assert "spo2 < 85" in Path('src/App.tsx').read_text()
assert "? 'red'" in Path('src/App.tsx').read_text()
assert 'metric-alarm-yellow' in Path('src/styles.css').read_text()
assert "APP_VERSION = '0.78.4'" in Path('src/appVersion.ts').read_text()
print('v0.78.4 patch applied')
