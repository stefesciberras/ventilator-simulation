from pathlib import Path


def replace_once(path: str, old: str, new: str):
    p = Path(path)
    text = p.read_text()
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{path}: expected one match, found {count}: {old[:90]!r}')
    p.write_text(text.replace(old, new, 1))

# App imports and styling.
replace_once('src/App.tsx',
"import { InstructorAccountControls } from './components/InstructorAccountControls'\nimport { Waveform } from './components/Waveform'",
"import { InstructorAccountControls } from './components/InstructorAccountControls'\nimport { PhysiologyMeasurementsDialog } from './components/PhysiologyMeasurementsDialog'\nimport { Waveform } from './components/Waveform'")
replace_once('src/App.tsx',
"import type { InstructorScenarioSnapshot } from './instructorAccount'\nimport './session.css'",
"import type { InstructorScenarioSnapshot } from './instructorAccount'\nimport { calculatePhysiologicalMeasurements } from './physiologyMeasurements'\nimport './session.css'\nimport './physiology.css'")
replace_once('src/App.tsx',
"const PATIENT_TRANSITION_STORAGE_KEY = 'eduvent.patient-transition-seconds'",
"const PATIENT_TRANSITION_STORAGE_KEY = 'eduvent.patient-transition-seconds'\nconst SHOW_PATIENT_EFFORT_STORAGE_KEY = 'eduvent.show-patient-effort'")

# App icons.
replace_once('src/App.tsx',
"function AlarmSilenceIcon() {\n  return (\n    <svg viewBox=\"0 0 24 24\" aria-hidden=\"true\">\n      <path d=\"M6.5 9a5.5 5.5 0 0 1 9.7-3.6M17.5 9v5l2 2H8.5M10 19h4\" fill=\"none\" stroke=\"currentColor\" strokeWidth=\"1.8\" strokeLinecap=\"round\" strokeLinejoin=\"round\" />\n      <path d=\"M3 3l18 18\" stroke=\"currentColor\" strokeWidth=\"2\" strokeLinecap=\"round\" />\n    </svg>\n  )\n}\n",
"function LungEffortIcon() {\n  return (\n    <svg viewBox=\"0 0 32 32\" aria-hidden=\"true\">\n      <path d=\"M15.2 5.5v8.8M16.8 5.5v8.8\" fill=\"none\" stroke=\"currentColor\" strokeWidth=\"1.7\" strokeLinecap=\"round\" />\n      <path d=\"M14.9 13.2c-2.1-3.7-4.9-6.3-6.8-5.2-2.4 1.4-3.6 7.1-3 12.1.4 3.4 2.4 5.7 5.1 5.8 2.3.1 3.8-1.3 4.7-3.5V13.2Zm2.2 0c2.1-3.7 4.9-6.3 6.8-5.2 2.4 1.4 3.6 7.1 3 12.1-.4 3.4-2.4 5.7-5.1 5.8-2.3.1-3.8-1.3-4.7-3.5V13.2Z\" fill=\"none\" stroke=\"currentColor\" strokeWidth=\"1.7\" strokeLinejoin=\"round\" />\n    </svg>\n  )\n}\n\nfunction MeasurementsInfoIcon() {\n  return (\n    <svg viewBox=\"0 0 24 24\" aria-hidden=\"true\">\n      <circle cx=\"12\" cy=\"12\" r=\"8.2\" fill=\"none\" stroke=\"currentColor\" strokeWidth=\"1.8\" />\n      <path d=\"M12 10.7v6M12 7.2h.01\" fill=\"none\" stroke=\"currentColor\" strokeWidth=\"2.2\" strokeLinecap=\"round\" />\n    </svg>\n  )\n}\n\nfunction AlarmSilenceIcon() {\n  return (\n    <svg viewBox=\"0 0 24 24\" aria-hidden=\"true\">\n      <path d=\"M6.5 9a5.5 5.5 0 0 1 9.7-3.6M17.5 9v5l2 2H8.5M10 19h4\" fill=\"none\" stroke=\"currentColor\" strokeWidth=\"1.8\" strokeLinecap=\"round\" strokeLinejoin=\"round\" />\n      <path d=\"M3 3l18 18\" stroke=\"currentColor\" strokeWidth=\"2\" strokeLinecap=\"round\" />\n    </svg>\n  )\n}\n")

# App state.
replace_once('src/App.tsx',
"  const [alarmDialogOpen, setAlarmDialogOpen] = useState(false)\n  const [oxygenBoost, setOxygenBoost] = useState(false)",
"  const [alarmDialogOpen, setAlarmDialogOpen] = useState(false)\n  const [measurementsOpen, setMeasurementsOpen] = useState(false)\n  const [showPatientEffort, setShowPatientEffort] = useState(() => typeof window !== 'undefined' && window.localStorage.getItem(SHOW_PATIENT_EFFORT_STORAGE_KEY) === 'true')\n  const [oxygenBoost, setOxygenBoost] = useState(false)")
replace_once('src/App.tsx',
"  useEffect(() => {\n    window.localStorage.setItem(WAVEFORM_STORAGE_KEY, JSON.stringify(waveformDisplay))\n  }, [waveformDisplay])\n",
"  useEffect(() => {\n    window.localStorage.setItem(WAVEFORM_STORAGE_KEY, JSON.stringify(waveformDisplay))\n  }, [waveformDisplay])\n\n  useEffect(() => {\n    window.localStorage.setItem(SHOW_PATIENT_EFFORT_STORAGE_KEY, String(showPatientEffort))\n  }, [showPatientEffort])\n")

# Derived physiology and effort state.
replace_once('src/App.tsx',
"  const measures = useMemo(() => calculateMeasurements(measurementSamples, effectiveVentilator), [measurementSamples, effectiveVentilator])\n  const measuredIERatio = useMemo(() => calculateMeasuredIERatio(measurementSamples), [measurementSamples])",
"  const measures = useMemo(() => calculateMeasurements(measurementSamples, effectiveVentilator), [measurementSamples, effectiveVentilator])\n  const physiologyMeasurements = useMemo(() => calculatePhysiologicalMeasurements(measurementSamples, effectiveVentilator), [measurementSamples, effectiveVentilator])\n  const measuredIERatio = useMemo(() => calculateMeasuredIERatio(measurementSamples), [measurementSamples])")
replace_once('src/App.tsx',
"  const latestSample = movingSamples[movingSamples.length - 1]\n  const activeMode = latestSample?.mode ?? ventilator.mode",
"  const latestSample = movingSamples[movingSamples.length - 1]\n  const patientEffortVisible = teachingSession.role === 'candidate' ? teachingSession.candidatePatientEffortVisible : showPatientEffort\n  const patientEffortActive = Boolean(patientEffortVisible && latestSample && latestSample.musclePressure > 0.1)\n  const activeMode = latestSample?.mode ?? ventilator.mode")

# Main dialog and account settings props/version.
replace_once('src/App.tsx',
"  return (\n    <main className=\"app-shell\">\n      <header className=\"topbar\">",
"  return (\n    <main className=\"app-shell\">\n      <PhysiologyMeasurementsDialog open={measurementsOpen} measurements={physiologyMeasurements} onClose={() => setMeasurementsOpen(false)} />\n      <header className=\"topbar\">")
replace_once('src/App.tsx',
"          <InstructorAccountControls\n            role={teachingSession.role}\n            currentScenario={currentInstructorScenario}\n            onLoadScenario={loadInstructorScenario}\n          />",
"          <InstructorAccountControls\n            role={teachingSession.role}\n            currentScenario={currentInstructorScenario}\n            onLoadScenario={loadInstructorScenario}\n            showPatientEffort={showPatientEffort}\n            onShowPatientEffortChange={setShowPatientEffort}\n            patientEffortSettingLocked={teachingSession.role === 'candidate'}\n          />")
replace_once('src/App.tsx', '<span className="version">v0.53</span>', '<span className="version">v0.54</span>')

# Effort row above Paw.
replace_once('src/App.tsx',
"            <div className={`waveforms ${waveformDisplay.fourth ? 'four-traces' : ''}`}>\n              <Waveform samples={samples} signal=\"pressure\"",
"            <div className={`waveforms ${waveformDisplay.fourth ? 'four-traces' : ''}`}>\n              {patientEffortVisible && (\n                <div className={`patient-effort-strip ${patientEffortActive ? 'active' : ''}`} title={patientEffortActive ? 'Patient neural inspiratory effort is active' : 'No current patient inspiratory effort'}>\n                  <LungEffortIcon />\n                  <span>{patientEffortActive ? 'Patient effort' : 'Patient effort monitor'}</span>\n                </div>\n              )}\n              <Waveform samples={samples} signal=\"pressure\"")

# Measurements button immediately left of alarm silence.
replace_once('src/App.tsx',
"            >Exp Hold</button>\n            <button className={`hardware-button icon-button alarm-button alarm-silence-bottom ${alarmSilenced ? 'active' : ''}`}",
"            >Exp Hold</button>\n            <button className=\"hardware-button icon-button measurements-button\" type=\"button\" onClick={() => setMeasurementsOpen(true)} title=\"Physiological measurements\" aria-label=\"Open physiological measurements\"><MeasurementsInfoIcon /></button>\n            <button className={`hardware-button icon-button alarm-button alarm-silence-bottom ${alarmSilenced ? 'active' : ''}`}")

# Supabase teaching-session type.
replace_once('src/session/supabase.ts',
"  allow_oesophageal_pressure: boolean\n  instructor_client_id: string | null",
"  allow_oesophageal_pressure: boolean\n  show_patient_effort: boolean\n  instructor_client_id: string | null")

# Session hook policy and candidate visibility.
replace_once('src/session/useTeachingSession.ts',
"  candidateCanEditWaveforms?: boolean\n  allowOesophagealPressure?: boolean\n}",
"  candidateCanEditWaveforms?: boolean\n  allowOesophagealPressure?: boolean\n  showPatientEffort?: boolean\n}")
replace_once('src/session/useTeachingSession.ts',
"    if (patch.allowOesophagealPressure != null) databasePatch.allow_oesophageal_pressure = patch.allowOesophagealPressure\n",
"    if (patch.allowOesophagealPressure != null) databasePatch.allow_oesophageal_pressure = patch.allowOesophagealPressure\n    if (patch.showPatientEffort != null) databasePatch.show_patient_effort = patch.showPatientEffort\n")
replace_once('src/session/useTeachingSession.ts',
"  const candidateOesophagealPressureAllowed = role !== 'candidate' || session == null || Boolean(session.allow_oesophageal_pressure)\n\n  return {",
"  const candidateOesophagealPressureAllowed = role !== 'candidate' || session == null || Boolean(session.allow_oesophageal_pressure)\n  const candidatePatientEffortVisible = role === 'candidate' && Boolean(session?.show_patient_effort)\n\n  return {")
replace_once('src/session/useTeachingSession.ts',
"    candidateWaveformsLocked,\n    candidateOesophagealPressureAllowed,",
"    candidateWaveformsLocked,\n    candidateOesophagealPressureAllowed,\n    candidatePatientEffortVisible,")

# Session panel policy interface, patient option and version.
replace_once('src/components/SessionPanel.tsx',
"    candidateCanEditWaveforms?: boolean\n    allowOesophagealPressure?: boolean\n  }) => Promise<void>",
"    candidateCanEditWaveforms?: boolean\n    allowOesophagealPressure?: boolean\n    showPatientEffort?: boolean\n  }) => Promise<void>")
replace_once('src/components/SessionPanel.tsx',
"                <label className=\"session-switch-row\">\n                  <span>Candidate may change</span>\n                  <input type=\"checkbox\" checked={Boolean(session?.candidate_can_edit_patient)} disabled={!session?.sync_patient} onChange={(event) => void onUpdatePolicy({ candidateCanEditPatient: event.target.checked })} />\n                </label>\n              </div>",
"                <label className=\"session-switch-row\">\n                  <span>Candidate may change</span>\n                  <input type=\"checkbox\" checked={Boolean(session?.candidate_can_edit_patient)} disabled={!session?.sync_patient} onChange={(event) => void onUpdatePolicy({ candidateCanEditPatient: event.target.checked })} />\n                </label>\n                <label className=\"session-switch-row\">\n                  <span>Show patient effort to candidate</span>\n                  <input type=\"checkbox\" checked={Boolean(session?.show_patient_effort)} onChange={(event) => void onUpdatePolicy({ showPatientEffort: event.target.checked })} />\n                </label>\n              </div>")
replace_once('src/components/SessionPanel.tsx', "version.textContent = 'v0.53'", "version.textContent = 'v0.54'")

# Account/settings display toggle and version.
replace_once('src/components/InstructorAccountControls.tsx',
"interface InstructorAccountControlsProps {\n  role: SessionRole\n  currentScenario: InstructorScenarioSnapshot\n  onLoadScenario: (scenario: InstructorScenarioSnapshot) => void\n}",
"interface InstructorAccountControlsProps {\n  role: SessionRole\n  currentScenario: InstructorScenarioSnapshot\n  onLoadScenario: (scenario: InstructorScenarioSnapshot) => void\n  showPatientEffort: boolean\n  onShowPatientEffortChange: (value: boolean) => void\n  patientEffortSettingLocked: boolean\n}")
replace_once('src/components/InstructorAccountControls.tsx',
"export function InstructorAccountControls({ role, currentScenario, onLoadScenario }: InstructorAccountControlsProps) {",
"export function InstructorAccountControls({ role, currentScenario, onLoadScenario, showPatientEffort, onShowPatientEffortChange, patientEffortSettingLocked }: InstructorAccountControlsProps) {")
replace_once('src/components/InstructorAccountControls.tsx', '<div><span>Version</span><strong>v0.53</strong></div>', '<div><span>Version</span><strong>v0.54</strong></div>')
replace_once('src/components/InstructorAccountControls.tsx',
"            <section className=\"scenario-settings-section\">\n              <div className=\"scenario-settings-heading\">\n                <div><span>Instructor presets</span><h3>Cloud scenarios</h3></div>",
"            <section className=\"scenario-settings-section\">\n              <div className=\"scenario-settings-heading\">\n                <div><span>Display</span><h3>Teaching aids</h3></div>\n              </div>\n              <label className=\"settings-toggle-row\">\n                <span><strong>Show patient effort</strong><small>Displays a lung indicator when the patient model has active neural inspiratory effort.</small></span>\n                <input type=\"checkbox\" checked={showPatientEffort} disabled={patientEffortSettingLocked} onChange={(event) => onShowPatientEffortChange(event.target.checked)} />\n              </label>\n              {patientEffortSettingLocked && <p className=\"account-hint\">In candidate mode this teaching aid is controlled by the instructor.</p>}\n            </section>\n\n            <section className=\"scenario-settings-section\">\n              <div className=\"scenario-settings-heading\">\n                <div><span>Instructor presets</span><h3>Cloud scenarios</h3></div>")

print('v0.54 patch applied')
