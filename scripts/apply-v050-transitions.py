from pathlib import Path


def rep(path: str, old: str, new: str, label: str, count: int = 1) -> None:
    p = Path(path)
    s = p.read_text()
    if old not in s:
        raise SystemExit(f"{label}: anchor not found")
    p.write_text(s.replace(old, new, count))


# Model: stage-level default + per-variable overrides.
p = Path('src/instructorAccount.ts')
s = p.read_text()
s = s.replace(
    "export type DynamicScenarioStageType = 'controls' | 'media' | 'question'\n",
    "export type DynamicScenarioStageType = 'controls' | 'media' | 'question'\n\n"
    "export type DynamicScenarioTransition =\n"
    "  | { mode: 'immediate' }\n"
    "  | { mode: 'linear'; durationSeconds: number }\n\n"
    "export interface DynamicScenarioTransitionOverrides {\n"
    "  ventilator?: Partial<Record<keyof VentilatorSettings, DynamicScenarioTransition>>\n"
    "  patient?: Partial<Record<keyof PatientSettings, DynamicScenarioTransition>>\n"
    "}\n",
)
s = s.replace(
    "  question?: DynamicScenarioStageQuestion\n  snapshot: InstructorScenarioSnapshot\n",
    "  question?: DynamicScenarioStageQuestion\n"
    "  /** Default transition inherited by numeric controls in this stage. */\n"
    "  transition?: DynamicScenarioTransition\n"
    "  /** Optional per-variable overrides. Discrete values always apply immediately. */\n"
    "  transitionOverrides?: DynamicScenarioTransitionOverrides\n"
    "  snapshot: InstructorScenarioSnapshot\n",
)
s = s.replace("    schemaVersion: 5,", "    schemaVersion: 7,")
s = s.replace(
    "stages: [{ name: 'Stage 1', comment: '', stageType: 'controls', snapshot:",
    "stages: [{ name: 'Stage 1', comment: '', stageType: 'controls', transition: { mode: 'immediate' }, transitionOverrides: {}, snapshot:",
)
s = s.replace(
    "        question: stage.question,\n        snapshot:",
    "        question: stage.question,\n"
    "        transition: stage.transition ?? { mode: 'immediate' },\n"
    "        transitionOverrides: stage.transitionOverrides ?? {},\n"
    "        snapshot:",
)
p.write_text(s)

# Runtime: pass stage transition plan into App.
p = Path('src/components/InstructorAccountControls.tsx')
s = p.read_text()
s = s.replace(
    "  type DynamicScenarioTrigger,\n",
    "  type DynamicScenarioTrigger,\n  type DynamicScenarioStage,\n",
)
s = s.replace(
    "onLoadScenario: (scenario: InstructorScenarioSnapshot, options?: { pauseSimulation?: boolean; resetScenarioClock?: boolean }) => void",
    "onLoadScenario: (scenario: InstructorScenarioSnapshot, options?: { pauseSimulation?: boolean; resetScenarioClock?: boolean; stageTransition?: DynamicScenarioStage }) => void",
)
old = "onLoadScenario(nextScenario, { pauseSimulation: false, resetScenarioClock: false })"
if old not in s:
    raise SystemExit('runtime stage load anchor not found')
s = s.replace(
    old,
    "onLoadScenario(nextScenario, { pauseSimulation: false, resetScenarioClock: false, stageTransition: nextIndex > 0 ? stages[nextIndex] : undefined })",
    1,
)
p.write_text(s)

# App: execute numeric transitions on simulation time, while discrete values switch immediately.
p = Path('src/App.tsx')
s = p.read_text()
s = s.replace(
    "import type { DynamicScenarioActionId, InstructorScenarioSnapshot } from './instructorAccount'",
    "import type { DynamicScenarioActionId, DynamicScenarioStage, DynamicScenarioTransition, InstructorScenarioSnapshot } from './instructorAccount'",
)
s = s.replace(
    "  const patientTransitionRef = useRef<{ from: PatientSettings; to: PatientSettings; start: number; duration: number } | null>(null)\n",
    "  const patientTransitionRef = useRef<{ from: PatientSettings; to: PatientSettings; start: number; duration: number } | null>(null)\n"
    "  const scenarioStageTransitionTimerRef = useRef<number | null>(null)\n"
    "  const scenarioStageTransitionRunningRef = useRef(false)\n",
)
s = s.replace(
    "  useEffect(() => {\n    if (patientTransitionSeconds <= 0) {\n",
    "  useEffect(() => {\n"
    "    if (scenarioStageTransitionRunningRef.current) {\n"
    "      effectivePatientRef.current = { ...patient }\n"
    "      patientTransitionRef.current = null\n"
    "      return\n"
    "    }\n"
    "    if (patientTransitionSeconds <= 0) {\n",
    1,
)
s = s.replace(
    "    options?: { pauseSimulation?: boolean; resetScenarioClock?: boolean },\n",
    "    options?: { pauseSimulation?: boolean; resetScenarioClock?: boolean; stageTransition?: DynamicScenarioStage },\n",
    1,
)
anchor = """    setVentilator({ ...scenario.ventilator })
    setPatient({ ...initialPatient, ...scenario.patient, vdVt: scenario.patient.vdVt ?? 0.4 })
    setAlarmLimits({ ...scenario.alarmLimits })
    setPatientTransitionSeconds(scenario.patientTransitionSeconds)
    setWaveformDisplay({ ...scenario.waveformDisplay })
    setScenarioMediaIds([...(scenario.mediaIds ?? [])])
"""
replacement = """    if (scenarioStageTransitionTimerRef.current != null) {
      window.clearInterval(scenarioStageTransitionTimerRef.current)
      scenarioStageTransitionTimerRef.current = null
    }
    scenarioStageTransitionRunningRef.current = false

    const transitionStage = options?.stageTransition
    const transitionDefault = transitionStage?.transition ?? { mode: 'immediate' as const }
    const transitionOverrides = transitionStage?.transitionOverrides ?? {}
    const selectedVentilator = new Set((transitionStage?.apply?.ventilator ?? Object.keys(scenario.ventilator)).map(String))
    const selectedPatient = new Set((transitionStage?.apply?.patient ?? Object.keys(scenario.patient)).map(String))
    const fromVentilator = { ...ventilator }
    const fromPatient = { ...effectivePatientRef.current }
    const targetVentilator = { ...scenario.ventilator }
    const targetPatient = { ...initialPatient, ...scenario.patient, vdVt: scenario.patient.vdVt ?? 0.4 }

    const policyFor = (group: 'ventilator' | 'patient', key: string): DynamicScenarioTransition => {
      const overrides = transitionOverrides[group] as Record<string, DynamicScenarioTransition> | undefined
      return overrides?.[key] ?? transitionDefault
    }
    const canLinear = (from: unknown, to: unknown, policy: DynamicScenarioTransition) =>
      policy.mode === 'linear' && policy.durationSeconds > 0 && typeof from === 'number' && typeof to === 'number' && Number.isFinite(from) && Number.isFinite(to)

    const linearVentilatorKeys = Object.keys(targetVentilator).filter((key) => selectedVentilator.has(key) && canLinear((fromVentilator as unknown as Record<string, unknown>)[key], (targetVentilator as unknown as Record<string, unknown>)[key], policyFor('ventilator', key)))
    const linearPatientKeys = Object.keys(targetPatient).filter((key) => selectedPatient.has(key) && canLinear((fromPatient as unknown as Record<string, unknown>)[key], (targetPatient as unknown as Record<string, unknown>)[key], policyFor('patient', key)))

    if (!transitionStage || (!linearVentilatorKeys.length && !linearPatientKeys.length)) {
      setVentilator(targetVentilator)
      setPatient(targetPatient)
    } else {
      scenarioStageTransitionRunningRef.current = true
      const initialVentilatorState = { ...targetVentilator } as unknown as Record<string, unknown>
      const initialPatientState = { ...targetPatient } as unknown as Record<string, unknown>
      for (const key of linearVentilatorKeys) initialVentilatorState[key] = (fromVentilator as unknown as Record<string, unknown>)[key]
      for (const key of linearPatientKeys) initialPatientState[key] = (fromPatient as unknown as Record<string, unknown>)[key]
      setVentilator(initialVentilatorState as unknown as VentilatorSettings)
      setPatient(initialPatientState as unknown as PatientSettings)
      const startedAt = simulationTimeRef.current

      scenarioStageTransitionTimerRef.current = window.setInterval(() => {
        const elapsed = Math.max(0, simulationTimeRef.current - startedAt)
        let complete = true
        const nextVentilator = { ...targetVentilator } as unknown as Record<string, unknown>
        const nextPatient = { ...targetPatient } as unknown as Record<string, unknown>
        for (const key of linearVentilatorKeys) {
          const policy = policyFor('ventilator', key)
          const duration = policy.mode === 'linear' ? Math.max(0.001, policy.durationSeconds) : 0.001
          const fraction = Math.min(1, elapsed / duration)
          const from = Number((fromVentilator as unknown as Record<string, unknown>)[key])
          const to = Number((targetVentilator as unknown as Record<string, unknown>)[key])
          nextVentilator[key] = from + (to - from) * fraction
          if (fraction < 1) complete = false
        }
        for (const key of linearPatientKeys) {
          const policy = policyFor('patient', key)
          const duration = policy.mode === 'linear' ? Math.max(0.001, policy.durationSeconds) : 0.001
          const fraction = Math.min(1, elapsed / duration)
          const from = Number((fromPatient as unknown as Record<string, unknown>)[key])
          const to = Number((targetPatient as unknown as Record<string, unknown>)[key])
          nextPatient[key] = from + (to - from) * fraction
          if (fraction < 1) complete = false
        }
        setVentilator(nextVentilator as unknown as VentilatorSettings)
        setPatient(nextPatient as unknown as PatientSettings)
        if (complete) {
          if (scenarioStageTransitionTimerRef.current != null) window.clearInterval(scenarioStageTransitionTimerRef.current)
          scenarioStageTransitionTimerRef.current = null
          window.setTimeout(() => { scenarioStageTransitionRunningRef.current = false }, 0)
        }
      }, 200)
    }
    setAlarmLimits({ ...scenario.alarmLimits })
    setPatientTransitionSeconds(scenario.patientTransitionSeconds)
    setWaveformDisplay({ ...scenario.waveformDisplay })
    setScenarioMediaIds([...(scenario.mediaIds ?? [])])
"""
if anchor not in s:
    raise SystemExit('App load state anchor not found')
s = s.replace(anchor, replacement, 1)
cleanup = "    if (freezeLongPressTimeoutRef.current != null) window.clearTimeout(freezeLongPressTimeoutRef.current)\n"
if cleanup in s:
    s = s.replace(cleanup, cleanup + "    if (scenarioStageTransitionTimerRef.current != null) window.clearInterval(scenarioStageTransitionTimerRef.current)\n", 1)
p.write_text(s)

# Builder: expose default transition plus advanced per-variable overrides.
p = Path('src/components/DynamicScenarioBuilder.tsx')
s = p.read_text()
s = s.replace(
    "  type DynamicScenarioStage,\n",
    "  type DynamicScenarioStage,\n  type DynamicScenarioTransition,\n",
)
s = s.replace(
    "const defaultAdvanceTrigger = (): DynamicScenarioTrigger => ({ type: 'manual' })\n",
    "const defaultAdvanceTrigger = (): DynamicScenarioTrigger => ({ type: 'manual' })\n"
    "const immediateTransition = (): DynamicScenarioTransition => ({ mode: 'immediate' })\n"
    "const linearTransition = (durationSeconds = 60): DynamicScenarioTransition => ({ mode: 'linear', durationSeconds })\n",
)
s = s.replace("schemaVersion: 6", "schemaVersion: 7")
normal_anchor = "    stageType: stage.stageType ?? 'controls',\n    media: stage.media,\n    question: stage.question,\n"
if normal_anchor in s:
    s = s.replace(
        normal_anchor,
        normal_anchor + "    transition: stage.transition ?? immediateTransition(),\n    transitionOverrides: stage.transitionOverrides ?? {},\n",
        1,
    )
s = s.replace(
    "stageType: 'controls', snapshot:",
    "stageType: 'controls', transition: immediateTransition(), transitionOverrides: {}, snapshot:",
)
locals_anchor = "            const stageType = stage.stageType ?? 'controls'\n            const triggers = dynamicStageTriggers(stage)\n"
if locals_anchor not in s:
    raise SystemExit('builder stage locals anchor not found')
s = s.replace(
    locals_anchor,
    locals_anchor
    + "            const transition = stage.transition ?? immediateTransition()\n"
    + "            const numericVentFields = ventFields.filter((field) => field.type !== 'select' && field.type !== 'boolean' && ventSelected.includes(field.key))\n"
    + "            const numericPatientFields = [...PATIENT_FIELDS, ...PHYSIO_FIELDS].filter((field) => field.type !== 'select' && field.type !== 'boolean' && patientSelected.includes(field.key))\n",
    1,
)
ui_anchor = "                  {stageType === 'controls' && <>\n                  <label className=\"dynamic-stage-source-row\">\n"
ui = """                  {stageType === 'controls' && <>
                  <section className="dynamic-stage-transition-card">
                    <div className="dynamic-stage-transition-main">
                      <span>Transition</span>
                      <div className="dynamic-stage-transition-toggle">
                        <button type="button" className={transition.mode === 'immediate' ? 'selected' : ''} onClick={() => updateStage(index, (current) => ({ ...current, transition: immediateTransition() }))}>Immediate</button>
                        <button type="button" disabled={index === 0} title={index === 0 ? 'The first stage establishes the starting state.' : undefined} className={transition.mode === 'linear' ? 'selected' : ''} onClick={() => updateStage(index, (current) => ({ ...current, transition: linearTransition(current.transition?.mode === 'linear' ? current.transition.durationSeconds : 60) }))}>Linear</button>
                      </div>
                      {transition.mode === 'linear' && index > 0 && <label><span>Duration</span><input type="number" min={1} max={3600} value={transition.durationSeconds} onChange={(event) => updateStage(index, (current) => ({ ...current, transition: linearTransition(Math.max(1, Number(event.target.value) || 1)) }))} /><em>s</em></label>}
                    </div>
                    {index > 0 && (numericVentFields.length > 0 || numericPatientFields.length > 0) && <details className="dynamic-stage-transition-advanced">
                      <summary>Advanced transitions <small>Optional per-parameter overrides</small></summary>
                      <div className="dynamic-stage-transition-overrides">
                        {[...numericVentFields.map((field) => ({ group: 'ventilator' as const, field })), ...numericPatientFields.map((field) => ({ group: 'patient' as const, field }))].map(({ group, field }) => {
                          const overrides = stage.transitionOverrides?.[group] as Record<string, DynamicScenarioTransition> | undefined
                          const override = overrides?.[field.key]
                          const value = override == null ? 'inherit' : override.mode
                          return <div className="dynamic-stage-transition-override" key={`${group}-${field.key}`}><span>{field.label}</span><select value={value} onChange={(event) => updateStage(index, (current) => {
                            const next = { ...(current.transitionOverrides ?? {}) }
                            const groupOverrides = { ...((next[group] ?? {}) as Record<string, DynamicScenarioTransition>) }
                            const choice = event.target.value
                            if (choice === 'inherit') delete groupOverrides[field.key]
                            else if (choice === 'immediate') groupOverrides[field.key] = immediateTransition()
                            else groupOverrides[field.key] = linearTransition(override?.mode === 'linear' ? override.durationSeconds : (current.transition?.mode === 'linear' ? current.transition.durationSeconds : 60))
                            next[group] = groupOverrides as never
                            return { ...current, transitionOverrides: next }
                          })}><option value="inherit">Inherit stage</option><option value="immediate">Immediate</option><option value="linear">Linear</option></select>{override?.mode === 'linear' && <label><input type="number" min={1} max={3600} value={override.durationSeconds} onChange={(event) => updateStage(index, (current) => { const next={ ...(current.transitionOverrides ?? {}) }; const groupOverrides={ ...((next[group] ?? {}) as Record<string, DynamicScenarioTransition>) }; groupOverrides[field.key]=linearTransition(Math.max(1,Number(event.target.value)||1)); next[group]=groupOverrides as never; return { ...current, transitionOverrides: next } })} /><em>s</em></label>}</div>
                        })}
                      </div>
                    </details>}
                  </section>
                  <label className="dynamic-stage-source-row">
"""
if ui_anchor not in s:
    raise SystemExit('builder controls UI anchor not found')
s = s.replace(ui_anchor, ui, 1)
p.write_text(s)

# Builder styling.
p = Path('src/components/DynamicScenarioBuilder.css')
s = p.read_text()
s += """

.dynamic-stage-transition-card { margin: 10px 0 12px; border: 1px solid rgba(112,144,156,.28); border-radius: 10px; background: rgba(11,22,28,.44); padding: 10px 12px; }
.dynamic-stage-transition-main { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
.dynamic-stage-transition-main > span { font-size:10px; font-weight:800; letter-spacing:.08em; text-transform:uppercase; color:#91a8b2; }
.dynamic-stage-transition-toggle { display:flex; gap:4px; }
.dynamic-stage-transition-toggle button { min-height:30px; padding:5px 10px; border-radius:7px; }
.dynamic-stage-transition-toggle button.selected { border-color:#e58b31; color:#ffb55e; background:rgba(229,139,49,.12); }
.dynamic-stage-transition-main label { display:flex; align-items:center; gap:6px; margin-left:auto; }
.dynamic-stage-transition-main input, .dynamic-stage-transition-override input { width:72px; }
.dynamic-stage-transition-main em, .dynamic-stage-transition-override em { font-style:normal; color:#91a8b2; font-size:11px; }
.dynamic-stage-transition-advanced { margin-top:9px; border-top:1px solid rgba(112,144,156,.18); padding-top:8px; }
.dynamic-stage-transition-advanced summary { cursor:pointer; font-size:11px; font-weight:700; color:#b8c8cf; }
.dynamic-stage-transition-advanced summary small { margin-left:8px; font-weight:400; color:#718792; }
.dynamic-stage-transition-overrides { display:grid; gap:6px; margin-top:8px; }
.dynamic-stage-transition-override { display:grid; grid-template-columns:minmax(150px,1fr) 150px 92px; gap:8px; align-items:center; font-size:11px; }
.dynamic-stage-transition-override > label { display:flex; align-items:center; gap:4px; }
@media (max-width: 900px) { .dynamic-stage-transition-override { grid-template-columns:minmax(120px,1fr) 132px; } .dynamic-stage-transition-override > label { grid-column:2; } }
"""
p.write_text(s)

Path('src/scenario-builder/version.ts').write_text("export const SCENARIO_BUILDER_VERSION = '0.5.0'\n")
