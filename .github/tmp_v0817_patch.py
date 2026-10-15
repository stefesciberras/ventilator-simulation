from pathlib import Path
import re


def replace(path: str, old: str, new: str, count: int = 1):
    p = Path(path)
    text = p.read_text()
    found = text.count(old)
    if found < count:
        raise SystemExit(f"{path}: expected at least {count} occurrence(s), found {found}: {old[:140]!r}")
    p.write_text(text.replace(old, new, count))

# Shared patient profiles live outside either Patient/Physio panel so the selector
# can remain visible under the main navigation regardless of active tab.
Path('src/patientProfiles.ts').write_text("""import type { PatientSettings } from './simulation/types'\nimport { calculatePredictedBodyWeight } from './patientMetrics'\n\nexport const PATIENT_PROFILE_NAMES = ['Normal', 'ARDS', 'COPD', 'Asthma', 'Paed'] as const\nexport type PatientProfileName = typeof PATIENT_PROFILE_NAMES[number]\n\nconst normalAdultFrc = Math.round(calculatePredictedBodyWeight('male', 170) * 30)\nconst normalPhysiology = {\n  sex: 'male' as const,\n  heightCm: 170,\n  oxygenConsumption: 250,\n  frc: normalAdultFrc,\n  maxSpO2: 100,\n  co2Production: 250,\n  vdVt: 0.4,\n}\n\nexport const PATIENT_PROFILES: Record<PatientProfileName, PatientSettings> = {\n  Normal: { ...normalPhysiology, shuntFraction: 0.03, compliance: 60, resistance: 6, expiratoryResistance: 8, spontaneousRate: 12, effort: 5, neuralInspiratoryTime: 1, effortRisePercent: 50, effortRelaxationPercent: 50, endExpiratoryOesophagealPressure: -5 },\n  ARDS: { ...normalPhysiology, vdVt: 0.6, shuntFraction: 0.25, compliance: 25, resistance: 8, expiratoryResistance: 10, spontaneousRate: 0, effort: 10, neuralInspiratoryTime: 0.8, effortRisePercent: 20, effortRelaxationPercent: 25, endExpiratoryOesophagealPressure: -5 },\n  COPD: { ...normalPhysiology, vdVt: 0.5, shuntFraction: 0.05, compliance: 80, resistance: 16, expiratoryResistance: 28, spontaneousRate: 18, effort: 8, neuralInspiratoryTime: 0.9, effortRisePercent: 30, effortRelaxationPercent: 40, endExpiratoryOesophagealPressure: -5 },\n  Asthma: { ...normalPhysiology, vdVt: 0.5, shuntFraction: 0.04, compliance: 70, resistance: 25, expiratoryResistance: 40, spontaneousRate: 24, effort: 11, neuralInspiratoryTime: 0.8, effortRisePercent: 20, effortRelaxationPercent: 30, endExpiratoryOesophagealPressure: -5 },\n  Paed: { sex: 'male', heightCm: 110, oxygenConsumption: 120, frc: 500, shuntFraction: 0.03, maxSpO2: 100, co2Production: 100, vdVt: 0.4, compliance: 20, resistance: 8, expiratoryResistance: 10, spontaneousRate: 22, effort: 5, neuralInspiratoryTime: 0.7, effortRisePercent: 40, effortRelaxationPercent: 40, endExpiratoryOesophagealPressure: -4 },\n}\n\nexport function patientMatchesProfile(settings: PatientSettings, profile: PatientSettings): boolean {\n  for (const key of Object.keys(profile) as Array<keyof PatientSettings>) {\n    const actual = settings[key]\n    const expected = profile[key]\n    if (typeof actual === 'number' && typeof expected === 'number') {\n      if (Math.abs(actual - expected) > 1e-6) return false\n    } else if (actual !== expected) {\n      return false\n    }\n  }\n  return true\n}\n""")

Path('src/simulationSpeed.ts').write_text("""export const SIMULATION_SPEEDS = [1, 1.5, 2, 4] as const\nexport type SimulationSpeed = typeof SIMULATION_SPEEDS[number]\n\nexport function isSimulationSpeed(value: unknown): value is SimulationSpeed {\n  return value === 1 || value === 1.5 || value === 2 || value === 4\n}\n""")

# Remove profile ownership/rendering from PatientControls; transition remains linked
# in Patient and Physio, while profiles move to the persistent tab navigation strip.
p = Path('src/components/Controls.tsx')
text = p.read_text()
old = """  const [selectedPreset, setSelectedPreset] = useState<string | null>(() => {\n    if (typeof window === 'undefined') return null\n    return window.localStorage.getItem('eduvent.patient-preset')\n  })\n"""
if old not in text:
    raise SystemExit('Controls selectedPreset block not found')
text = text.replace(old, '', 1)
start = text.find("  const normalAdultFrc = Math.round(calculatePredictedBodyWeight('male', 170) * 30)\n")
end_marker = "  return (\n    <section className={`control-section patient-section"
end = text.find(end_marker, start)
if start < 0 or end < 0:
    raise SystemExit('Controls preset block boundaries not found')
text = text[:start] + text[end:]
text = text.replace(
"""        <div className=\"preset-row\">{Object.keys(presets).map((name) => <button type=\"button\" key={name} className={selectedPreset === name ? 'selected-preset' : ''} onClick={() => applyPreset(name)}>{name}</button>)}</div>\n""",
'',
1,
)
p.write_text(text)

# App: shared profile selector, 10 s display sampling, and simulation speed control.
p = Path('src/App.tsx')
text = p.read_text()
text = text.replace(
"import { calculatePhysiologicalMeasurements } from './physiologyMeasurements'\n",
"import { calculatePhysiologicalMeasurements } from './physiologyMeasurements'\nimport { PATIENT_PROFILES, PATIENT_PROFILE_NAMES, patientMatchesProfile, type PatientProfileName } from './patientProfiles'\nimport { SIMULATION_SPEEDS, type SimulationSpeed } from './simulationSpeed'\n",
1,
)
text = text.replace(
"""const initialPatient: PatientSettings = {\n  sex: 'male', heightCm: 170, oxygenConsumption: 250, frc: 1980, shuntFraction: 0.03, maxSpO2: 100,\n  compliance: 60, resistance: 6, expiratoryResistance: 8, spontaneousRate: 12, effort: 5, neuralInspiratoryTime: 1, effortRisePercent: 50, effortRelaxationPercent: 50, endExpiratoryOesophagealPressure: -5, co2Production: 250, vdVt: 0.4,\n}\n""",
"const initialPatient: PatientSettings = { ...PATIENT_PROFILES.Normal }\n",
1,
)
text = text.replace(
"const SCENARIO_MEDIA_STORAGE_KEY = 'eduvent.scenario-media-ids'\n",
"const SCENARIO_MEDIA_STORAGE_KEY = 'eduvent.scenario-media-ids'\nconst PATIENT_PROFILE_STORAGE_KEY = 'eduvent.patient-preset'\n",
1,
)

# Selected profile is remembered, but its visual state is derived from the current
# target settings: green when exact, amber after any Patient/Physio modification.
marker = """  const [patientTransitionSeconds, setPatientTransitionSeconds] = useState<number>(() => {\n"""
insert = """  const [selectedPatientProfile, setSelectedPatientProfile] = useState<PatientProfileName | null>(() => {\n    if (typeof window === 'undefined') return null\n    const stored = window.localStorage.getItem(PATIENT_PROFILE_STORAGE_KEY)\n    return PATIENT_PROFILE_NAMES.includes(stored as PatientProfileName) ? stored as PatientProfileName : null\n  })\n"""
if marker not in text:
    raise SystemExit('App patient transition state marker not found')
text = text.replace(marker, insert + marker, 1)

text = text.replace(
"  const [simulationPaused, setSimulationPaused] = useState(false)\n",
"  const [simulationPaused, setSimulationPaused] = useState(false)\n  const [simulationSpeed, setSimulationSpeed] = useState<SimulationSpeed>(1)\n",
1,
)

text = text.replace(
"""    simulationPaused,\n    setSimulationPaused,\n  })\n""",
"""    simulationPaused,\n    setSimulationPaused,\n    simulationSpeed,\n    setSimulationSpeed,\n  })\n""",
1,
)

# Run a fixed 100 ms wall-clock tick while varying the amount of simulated time
# advanced each tick. This keeps waveform sampling at 10 ms and preserves engine math.
old = """      const nextSamples = advanceSimulation(\n        simulationStateRef.current,\n        effectiveVentilator,\n        simulationPatient,\n        startTime,\n        TICK_STEPS,\n        DT,\n        holdOptions,\n      )\n      simulationTimeRef.current = startTime + TICK_STEPS * DT\n"""
new = """      const tickSteps = Math.max(1, Math.round(TICK_STEPS * simulationSpeed))\n      const nextSamples = advanceSimulation(\n        simulationStateRef.current,\n        effectiveVentilator,\n        simulationPatient,\n        startTime,\n        tickSteps,\n        DT,\n        holdOptions,\n      )\n      simulationTimeRef.current = startTime + tickSteps * DT\n"""
if old not in text:
    raise SystemExit('App simulation advance block not found')
text = text.replace(old, new, 1)
text = text.replace(
"  }, [effectiveVentilator, patient, simulationPaused, holdOptions])\n",
"  }, [effectiveVentilator, patient, simulationPaused, holdOptions, simulationSpeed])\n",
1,
)

# Hold the two visually noisy slow metrics for ten wall-clock seconds without
# changing the underlying physiology calculations, alarms, gas exchange, or logs.
marker = """  const measuredIERatio = useMemo(() => calculateMeasuredIERatio(measurementSamples), [measurementSamples])\n"""
insert = """  const latestSlowMeasurementsRef = useRef({\n    meanPressure: physiologyMeasurements.meanPressure,\n    alveolarMinuteVentilation: physiologyMeasurements.alveolarMinuteVentilation,\n  })\n  const [slowDisplayMeasurements, setSlowDisplayMeasurements] = useState(() => ({\n    meanPressure: physiologyMeasurements.meanPressure,\n    alveolarMinuteVentilation: physiologyMeasurements.alveolarMinuteVentilation,\n  }))\n  useEffect(() => {\n    latestSlowMeasurementsRef.current = {\n      meanPressure: physiologyMeasurements.meanPressure,\n      alveolarMinuteVentilation: physiologyMeasurements.alveolarMinuteVentilation,\n    }\n  }, [physiologyMeasurements.meanPressure, physiologyMeasurements.alveolarMinuteVentilation])\n  useEffect(() => {\n    const update = () => setSlowDisplayMeasurements({ ...latestSlowMeasurementsRef.current })\n    update()\n    const timer = window.setInterval(update, 10_000)\n    return () => window.clearInterval(timer)\n  }, [])\n  const displayedPhysiologyMeasurements = useMemo(() => ({\n    ...physiologyMeasurements,\n    meanPressure: slowDisplayMeasurements.meanPressure,\n    alveolarMinuteVentilation: slowDisplayMeasurements.alveolarMinuteVentilation,\n  }), [physiologyMeasurements, slowDisplayMeasurements])\n"""
if marker not in text:
    raise SystemExit('App measurement marker not found')
text = text.replace(marker, insert + marker, 1)

text = text.replace(
"""  const displayedScenarioElapsedTime = teachingSession.role === 'candidate' && scenarioClockSync\n    ? Math.max(0, scenarioClockSync.elapsedMs / 1000 + (scenarioClockSync.paused ? 0 : (Date.now() - scenarioClockSync.receivedAt) / 1000))\n    : scenarioElapsedTime\n""",
"""  const displayedScenarioElapsedTime = teachingSession.role === 'candidate' && scenarioClockSync\n    ? Math.max(0, scenarioClockSync.elapsedMs / 1000 + (scenarioClockSync.paused ? 0 : ((Date.now() - scenarioClockSync.receivedAt) / 1000) * scenarioClockSync.speed))\n    : scenarioElapsedTime\n""",
1,
)

# Add speed to copied diagnostics.
text = text.replace(
"""      simulation: {\n        time: currentSimulationTime,\n        paused: simulationPaused,\n""",
"""      simulation: {\n        time: currentSimulationTime,\n        speed: simulationSpeed,\n        paused: simulationPaused,\n""",
1,
)
text = text.replace(
"""      scenarioElapsedSeconds: displayedScenarioElapsedTime,\n      simulationPaused,\n""",
"""      scenarioElapsedSeconds: displayedScenarioElapsedTime,\n      simulationPaused,\n      simulationSpeed,\n""",
1,
)

# Shared profile action and dirty state.
marker = "  const oxygenBoostTimer = `0:${String(oxygenBoostSecondsRemaining).padStart(2, '0')}`\n"
insert = """  const selectedPatientProfileModified = selectedPatientProfile != null\n    ? !patientMatchesProfile(patient, PATIENT_PROFILES[selectedPatientProfile])\n    : false\n  const applyPatientProfile = (profile: PatientProfileName) => {\n    setSelectedPatientProfile(profile)\n    try { window.localStorage.setItem(PATIENT_PROFILE_STORAGE_KEY, profile) } catch { /* optional UI preference */ }\n    setPatient({ ...PATIENT_PROFILES[profile] })\n  }\n"""
if marker not in text:
    raise SystemExit('App oxygen timer marker not found')
text = text.replace(marker, marker + insert, 1)

text = text.replace(
"<PhysiologyMeasurementsDialog open={measurementsOpen} measurements={physiologyMeasurements}",
"<PhysiologyMeasurementsDialog open={measurementsOpen} measurements={displayedPhysiologyMeasurements}",
1,
)

# Speed selector next to the timer. Candidate value is instructor controlled when
# the runtime fast path is available, so candidates cannot change it locally.
old = """          <div className={`simulation-clock ${simulationPaused ? 'paused' : ''}`} aria-label={`Simulation time ${formatSimulationClock(displayedScenarioElapsedTime)}`}>\n            <span>TIME</span>\n            <strong>{formatSimulationClock(displayedScenarioElapsedTime)}</strong>\n          </div>\n"""
new = old + """          <label className={`simulation-speed-control ${simulationPaused ? 'paused' : ''}`}>\n            <span>SPEED</span>\n            <select\n              value={simulationSpeed}\n              disabled={teachingSession.role === 'candidate'}\n              onChange={(event) => setSimulationSpeed(Number(event.target.value) as SimulationSpeed)}\n              aria-label=\"Simulation speed\"\n              title={teachingSession.role === 'candidate' ? 'Simulation speed controlled by instructor' : 'Simulation speed'}\n            >\n              {SIMULATION_SPEEDS.map((speed) => <option key={speed} value={speed}>×{speed}</option>)}\n            </select>\n          </label>\n"""
if old not in text:
    raise SystemExit('App simulation clock block not found')
text = text.replace(old, new, 1)

# Main ventilator Pmean uses the same 10-second held display value as the popup.
text = text.replace(
"<Metric label=\"Pmean\" value={measures.meanPressure.toFixed(1)} unit=\"cmH₂O\" />",
"<Metric label=\"Pmean\" value={slowDisplayMeasurements.meanPressure == null ? '—' : slowDisplayMeasurements.meanPressure.toFixed(1)} unit=\"cmH₂O\" />",
1,
)

# Persistent profile strip directly under the four main tabs.
old = """        <aside className=\"control-panel tabbed-control-panel\">\n          <nav className=\"control-tabs\" role=\"tablist\" aria-label=\"Simulator controls\">\n            {(['vent', 'patient', 'physio', 'teaching'] as const).map((tab) => (\n              <button\n                key={tab}\n                type=\"button\"\n                role=\"tab\"\n                aria-selected={controlTab === tab}\n                className={controlTab === tab ? 'active' : ''}\n                onClick={() => setControlTab(tab)}\n              >{tab === 'teaching' ? 'Teaching' : tab === 'vent' ? 'Vent' : tab === 'patient' ? 'Patient' : 'Physio'}</button>\n            ))}\n          </nav>\n          <div className=\"control-tab-content\">\n"""
new = """        <aside className=\"control-panel tabbed-control-panel\">\n          <div className=\"control-navigation-stack\">\n            <nav className=\"control-tabs\" role=\"tablist\" aria-label=\"Simulator controls\">\n              {(['vent', 'patient', 'physio', 'teaching'] as const).map((tab) => (\n                <button\n                  key={tab}\n                  type=\"button\"\n                  role=\"tab\"\n                  aria-selected={controlTab === tab}\n                  className={controlTab === tab ? 'active' : ''}\n                  onClick={() => setControlTab(tab)}\n                >{tab === 'teaching' ? 'Teaching' : tab === 'vent' ? 'Vent' : tab === 'patient' ? 'Patient' : 'Physio'}</button>\n              ))}\n            </nav>\n            <div className=\"patient-profile-strip\" role=\"group\" aria-label=\"Patient profiles\">\n              {PATIENT_PROFILE_NAMES.map((profile) => {\n                const selected = selectedPatientProfile === profile\n                const stateClass = selected ? (selectedPatientProfileModified ? 'profile-modified' : 'profile-selected') : ''\n                return (\n                  <button\n                    key={profile}\n                    type=\"button\"\n                    className={stateClass}\n                    disabled={teachingSession.candidatePatientLocked}\n                    aria-pressed={selected}\n                    title={selected && selectedPatientProfileModified ? `${profile} selected · settings modified` : `Apply ${profile} profile`}\n                    onClick={() => applyPatientProfile(profile)}\n                  >{profile}</button>\n                )\n              })}\n            </div>\n          </div>\n          <div className=\"control-tab-content\">\n"""
if old not in text:
    raise SystemExit('App control tabs block not found')
text = text.replace(old, new, 1)
p.write_text(text)

# Runtime snapshot carries speed so instructor/candidate local simulation engines and
# the interpolated candidate clock stay aligned on WebRTC/LAN/appliance fast paths.
p = Path('src/session/localRuntimeTransport.ts')
text = p.read_text()
text = text.replace(
"import type { AlarmLimits } from '../alarmTypes'\n",
"import type { AlarmLimits } from '../alarmTypes'\nimport type { SimulationSpeed } from '../simulationSpeed'\n",
1,
)
text = text.replace(
"  scenarioElapsedMs?: number\n",
"  scenarioElapsedMs?: number\n  simulationSpeed?: SimulationSpeed\n",
1,
)
p.write_text(text)

p = Path('src/session/useTeachingSession.ts')
text = p.read_text()
text = text.replace(
"import { appendScenarioLog } from '../diagnostics'\n",
"import { appendScenarioLog } from '../diagnostics'\nimport { isSimulationSpeed, type SimulationSpeed } from '../simulationSpeed'\n",
1,
)
text = text.replace(
"""  simulationPaused: boolean\n  setSimulationPaused: (paused: boolean) => void\n}\n""",
"""  simulationPaused: boolean\n  setSimulationPaused: (paused: boolean) => void\n  simulationSpeed: SimulationSpeed\n  setSimulationSpeed: (speed: SimulationSpeed) => void\n}\n""",
1,
)
text = text.replace(
"""  simulationPaused,\n  setSimulationPaused,\n}: UseTeachingSessionArgs) {\n""",
"""  simulationPaused,\n  setSimulationPaused,\n  simulationSpeed,\n  setSimulationSpeed,\n}: UseTeachingSessionArgs) {\n""",
1,
)
text = text.replace(
"  const [scenarioClockSync, setScenarioClockSync] = useState<{ elapsedMs: number; receivedAt: number; paused: boolean } | null>(null)\n",
"  const [scenarioClockSync, setScenarioClockSync] = useState<{ elapsedMs: number; receivedAt: number; paused: boolean; speed: SimulationSpeed } | null>(null)\n",
1,
)
text = text.replace(
"  const scenarioElapsedMsRef = useRef(0)\n",
"  const scenarioElapsedMsRef = useRef(0)\n  const simulationSpeedRef = useRef<SimulationSpeed>(simulationSpeed)\n",
1,
)
text = text.replace(
"  useEffect(() => { simulationPausedRef.current = simulationPaused }, [simulationPaused])\n",
"  useEffect(() => { simulationPausedRef.current = simulationPaused }, [simulationPaused])\n  useEffect(() => { simulationSpeedRef.current = simulationSpeed }, [simulationSpeed])\n",
1,
)
text = text.replace(
"""    simulationPausedRef.current = false\n    setSimulationPaused(false)\n    setScenarioClockSync(null)\n""",
"""    simulationPausedRef.current = false\n    setSimulationPaused(false)\n    setSimulationSpeed(1)\n    setScenarioClockSync(null)\n""",
1,
)
text = text.replace(
"      scenarioElapsedMs: Math.max(0, Math.round(scenarioElapsedMsRef.current)),\n",
"      scenarioElapsedMs: Math.max(0, Math.round(scenarioElapsedMsRef.current)),\n      simulationSpeed: simulationSpeedRef.current,\n",
1,
)
old = """    setSimulationPaused(snapshot.simulationPaused)\n    if (typeof snapshot.scenarioElapsedMs === 'number' && Number.isFinite(snapshot.scenarioElapsedMs)) {\n      setScenarioClockSync({\n        elapsedMs: Math.max(0, snapshot.scenarioElapsedMs),\n        receivedAt: Date.now(),\n        paused: snapshot.simulationPaused,\n      })\n    }\n"""
new = """    setSimulationPaused(snapshot.simulationPaused)\n    const runtimeSpeed = isSimulationSpeed(snapshot.simulationSpeed) ? snapshot.simulationSpeed : 1\n    setSimulationSpeed(runtimeSpeed)\n    if (typeof snapshot.scenarioElapsedMs === 'number' && Number.isFinite(snapshot.scenarioElapsedMs)) {\n      setScenarioClockSync({\n        elapsedMs: Math.max(0, snapshot.scenarioElapsedMs),\n        receivedAt: Date.now(),\n        paused: snapshot.simulationPaused,\n        speed: runtimeSpeed,\n      })\n    }\n"""
if old not in text:
    raise SystemExit('Teaching snapshot clock block not found')
text = text.replace(old, new, 1)
text = text.replace(
"""    simulationPaused,\n    localRuntimeConnection,\n  ])\n""",
"""    simulationPaused,\n    simulationSpeed,\n    localRuntimeConnection,\n  ])\n""",
1,
)
p.write_text(text)

# CSS: timer-adjacent speed control and sticky navigation/profile strip.
p = Path('src/styles.css')
text = p.read_text()
text = text.replace(
""".simulation-clock.paused strong { color: #ffe39b; }\n""",
""".simulation-clock.paused strong { color: #ffe39b; }\n.simulation-speed-control { min-width: 72px; min-height: 56px; padding: 7px 8px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 5px; border: 1px solid #3b505c; border-radius: 10px; background: #111a20; box-shadow: inset 0 1px 0 rgba(255,255,255,.05); }\n.simulation-speed-control > span { font-size: 8px; line-height: 1; letter-spacing: .14em; color: #718791; font-weight: 800; }\n.simulation-speed-control select { width: 58px; padding: 2px 3px; border: 0; border-radius: 5px; background: #1b2931; color: #d8eef5; font-size: 13px; font-weight: 750; text-align: center; cursor: pointer; }\n.simulation-speed-control select:disabled { opacity: .65; cursor: default; }\n.simulation-speed-control.paused { border-color: #806a37; background: #211c12; }\n""",
1,
)
# Patient panel no longer owns preset buttons.
text = re.sub(r"\n\.patient-section \.preset-row button \{[^\n]*\}\n\.patient-section \.preset-row button:hover:not\(:disabled\) \{[^\n]*\}\n\.patient-section \.preset-row button\.selected-preset \{[^\n]*\}\n", "\n", text, count=1)
text = re.sub(r"\n\.patient-section\.physiology-view \.preset-row button \{[^\n]*\}\n\.patient-section\.physiology-view \.preset-row button:hover:not\(:disabled\) \{[^\n]*\}\n\.patient-section\.physiology-view \.preset-row button\.selected-preset \{[^\n]*\}\n", "\n", text, count=1)
old = """/* v0.80.3 tabbed settings navigation */\n.control-tabs { position: sticky; top: -15px; z-index: 20; display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 4px; margin: -15px -15px 12px; padding: 10px 10px 8px; background: rgba(14,20,25,.98); border-bottom: 1px solid #2d3d46; }\n"""
new = """/* v0.80.3 tabbed settings navigation; v0.81.7 keeps profiles with the sticky navigation */\n.control-navigation-stack { position: sticky; top: -15px; z-index: 20; margin: -15px -15px 12px; padding: 10px 10px 8px; background: rgba(14,20,25,.98); border-bottom: 1px solid #2d3d46; }\n.control-tabs { display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 4px; margin: 0; padding: 0; background: transparent; border-bottom: 0; }\n"""
if old not in text:
    raise SystemExit('styles control-tabs base not found')
text = text.replace(old, new, 1)
text = text.replace(
""".control-tabs button.active { color: #dff7ff; border-color: #69c8e8; background: #18313c; }\n.control-tab-content { min-width: 0; }\n""",
""".control-tabs button.active { color: #dff7ff; border-color: #69c8e8; background: #18313c; }\n.patient-profile-strip { display: grid; grid-template-columns: repeat(5, minmax(0,1fr)); gap: 5px; margin-top: 7px; }\n.patient-profile-strip button { min-width: 0; padding: 6px 3px; border-color: #4d585e; background: #242a2e; color: #aeb8bd; font-size: 9px; font-weight: 750; }\n.patient-profile-strip button:hover:not(:disabled) { border-color: #748188; background: #30383d; }\n.patient-profile-strip button.profile-selected { border-color: #8fd29a; background: #bce8c3; color: #18301d; box-shadow: inset 0 0 0 1px rgba(255,255,255,.22); }\n.patient-profile-strip button.profile-modified { border-color: #d4a74e; background: #e2b861; color: #352607; box-shadow: inset 0 0 0 1px rgba(255,255,255,.16); }\n.control-tab-content { min-width: 0; }\n""",
1,
)
text = text.replace(
"""@media (max-width: 680px) {\n  .control-panel { padding-top: 15px; }\n  .control-tabs { top: -15px; }\n}\n""",
"""@media (max-width: 680px) {\n  .control-panel { padding-top: 15px; }\n  .control-navigation-stack { top: -15px; }\n  .patient-profile-strip button { padding: 6px 2px; font-size: 8px; }\n}\n""",
1,
)
p.write_text(text)

replace('src/appVersion.ts', "export const APP_VERSION = '0.81.6'", "export const APP_VERSION = '0.81.7'")

print('Applied v0.81.7 profile strip, measurement sampling, and simulation speed changes')
