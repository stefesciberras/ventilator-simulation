from pathlib import Path


def rep(path, old, new, count=-1):
    p = Path(path)
    t = p.read_text()
    if old not in t:
        raise SystemExit(f'pattern not found: {path}: {old[:120]!r}')
    p.write_text(t.replace(old, new, count))

rep('src/teaching/scenario/runtimeCore.ts',
"  snapshot: TSnapshot\n  /** Default transition for numeric values when this stage is entered. */",
"  snapshot: TSnapshot\n  /** Product variable IDs explicitly applied on entry. Missing means legacy/full snapshot. */\n  appliedVariableIds?: string[]\n  /** Default transition for numeric values when this stage is entered. */")

rep('src/teaching/scenario/authoringTypes.ts',
"  | { id: string; type: 'question-correct' }\n",
"  | { id: string; type: 'question-correct' }\n  | { id: string; type: 'media-ended' }\n  | { id: string; type: 'media-acknowledged' }\n")

rep('src/scenario-builder/SharedScenarioEditorFramework.tsx',
"  if (trigger.type === 'question-any') return 'Any answer submitted'\n  return 'Correct answer submitted'\n",
"  if (trigger.type === 'question-any') return 'Any answer submitted'\n  if (trigger.type === 'question-correct') return 'Correct answer submitted'\n  if (trigger.type === 'media-ended') return 'Video finished'\n  return 'Media acknowledged'\n")
rep('src/scenario-builder/SharedScenarioEditorFramework.tsx',
"      <option value=\"question-correct\">Correct question answer</option>\n",
"      <option value=\"question-correct\">Correct question answer</option>\n      <option value=\"media-ended\">Video finished</option>\n      <option value=\"media-acknowledged\">Media acknowledged</option>\n")

rep('src/teaching/scenario/SharedScenarioRuntimePanel.tsx',
"  onQuestionResult?: (answered: boolean, correct: boolean) => void\n  onClose?: () => void\n",
"  onQuestionResult?: (answered: boolean, correct: boolean) => void\n  onMediaEvent?: (event: 'ended' | 'acknowledged') => void\n  onClose?: () => void\n")
rep('src/teaching/scenario/SharedScenarioRuntimePanel.tsx',
"  onQuestionResult,\n  onClose,\n",
"  onQuestionResult,\n  onMediaEvent,\n  onClose,\n")
rep('src/teaching/scenario/SharedScenarioRuntimePanel.tsx',
"  const [resolvedMediaUrl, setResolvedMediaUrl] = useState<string | null>(null)\n",
"  const [resolvedMediaUrl, setResolvedMediaUrl] = useState<string | null>(null)\n  const [mediaAcknowledged, setMediaAcknowledged] = useState(false)\n")
rep('src/teaching/scenario/SharedScenarioRuntimePanel.tsx',
"    setSubmitted(false)\n    onQuestionResult?.(false, false)\n",
"    setSubmitted(false)\n    setMediaAcknowledged(false)\n    onQuestionResult?.(false, false)\n")
rep('src/teaching/scenario/SharedScenarioRuntimePanel.tsx',
"          ? <video controls playsInline src={resolvedMediaUrl} />\n          : <img src={resolvedMediaUrl} alt={media.title || 'Scenario media'} />\n",
"          ? <video controls playsInline src={resolvedMediaUrl} onEnded={() => onMediaEvent?.('ended')} />\n          : <img src={resolvedMediaUrl} alt={media.title || 'Scenario media'} />\n")
rep('src/teaching/scenario/SharedScenarioRuntimePanel.tsx',
"      ) : <small>{media.mediaId ? 'Loading scenario media…' : `Teaching media reference: ${media.storagePath || 'not selected'}`}</small>}\n    </div>}\n",
"      ) : <small>{media.mediaId ? 'Loading scenario media…' : `Teaching media reference: ${media.storagePath || 'not selected'}`}</small>}\n      {!mediaAcknowledged && <button type=\"button\" className=\"scenario-builder-primary\" onClick={() => { setMediaAcknowledged(true); onMediaEvent?.('acknowledged') }}>Acknowledge media</button>}\n      {mediaAcknowledged && <small>Media acknowledged.</small>}\n    </div>}\n")

rep('src/edumon/scenarioTypes.ts',
"  | { type: 'question-correct' }\n",
"  | { type: 'question-correct' }\n  | { type: 'media-ended' }\n  | { type: 'media-acknowledged' }\n")

p = Path('src/scenario-builder/modules/edumon/authoringAdapter.tsx')
t = p.read_text()
start = t.index('function EdumonSlider(')
end = t.index('function toSharedTrigger(')
new_block = r'''const EDUMON_APPLY_IDS = ['rhythm', 'heartRate', 'systolicPressure', 'diastolicPressure', 'spo2', 'peripheralPerfusion', 'simulationPaused', 'simulationSpeed'] as const

function EdumonSlider({ label, id, value, min, max, step = 1, displayValue, applied, onAppliedChange, onChange }: { label: string; id: string; value: number; min: number; max: number; step?: number; displayValue?: string; applied: boolean; onAppliedChange: (id: string, applied: boolean) => void; onChange: (value: number) => void }) {
  return <div className={`shared-scenario-variable-row slider ${applied ? 'applied' : 'not-applied'}`}>
    <div className="shared-scenario-variable-heading">
      <label className="shared-scenario-apply-toggle"><input type="checkbox" checked={applied} onChange={(event) => onAppliedChange(id, event.target.checked)} /><span>Apply</span></label>
      <span className="shared-scenario-variable-label">{label}</span><strong>{displayValue ?? value}</strong>
    </div>
    <input disabled={!applied} className="shared-scenario-control-slider" type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
  </div>
}

function EdumonSelect({ label, id, value, applied, children, onAppliedChange, onChange }: { label: string; id: string; value: string | number; applied: boolean; children: ReactNode; onAppliedChange: (id: string, applied: boolean) => void; onChange: (value: string) => void }) {
  return <div className={`shared-scenario-variable-row ${applied ? 'applied' : 'not-applied'}`}><div className="shared-scenario-variable-heading"><label className="shared-scenario-apply-toggle"><input type="checkbox" checked={applied} onChange={(event) => onAppliedChange(id, event.target.checked)} /><span>Apply</span></label><span className="shared-scenario-variable-label">{label}</span></div><select disabled={!applied} value={value} onChange={(event) => onChange(event.target.value)}>{children}</select></div>
}

function SnapshotEditor({ snapshot, onChange, appliedVariableIds, onAppliedVariableIdsChange }: { snapshot: EdumonScenarioSnapshot; onChange: (snapshot: EdumonScenarioSnapshot) => void; appliedVariableIds?: string[]; onAppliedVariableIdsChange?: (ids: string[]) => void }) {
  const patient = snapshot.patient
  const selected = new Set(appliedVariableIds ?? EDUMON_APPLY_IDS)
  const setApplied = (id: string, enabled: boolean) => { const next = new Set(selected); if (enabled) next.add(id); else next.delete(id); onAppliedVariableIdsChange?.([...next]) }
  const setPatient = (patch: Partial<typeof patient>) => onChange({ ...snapshot, patient: { ...patient, ...patch } })
  const isApplied = (id: string) => selected.has(id)
  return <div className="shared-scenario-eduvent-snapshot shared-scenario-edumon-snapshot">
    <section className="shared-scenario-control-group monitor">
      <h3>Monitor patient state</h3>
      <div className="shared-scenario-slider-grid">
        <EdumonSelect id="rhythm" label="Rhythm" applied={isApplied('rhythm')} onAppliedChange={setApplied} value={patient.rhythm} onChange={(value) => setPatient({ rhythm: value as CardiacRhythm })}>{RHYTHMS.map((rhythm) => <option key={rhythm} value={rhythm}>{RHYTHM_LABELS[rhythm]}</option>)}</EdumonSelect>
        <EdumonSlider id="heartRate" label="Heart rate" applied={isApplied('heartRate')} onAppliedChange={setApplied} value={patient.heartRate} min={0} max={250} displayValue={`${patient.heartRate} /min`} onChange={(heartRate) => setPatient({ heartRate })} />
        <EdumonSlider id="systolicPressure" label="Systolic pressure" applied={isApplied('systolicPressure')} onAppliedChange={setApplied} value={patient.systolicPressure} min={0} max={260} displayValue={`${patient.systolicPressure} mmHg`} onChange={(systolicPressure) => setPatient({ systolicPressure })} />
        <EdumonSlider id="diastolicPressure" label="Diastolic pressure" applied={isApplied('diastolicPressure')} onAppliedChange={setApplied} value={patient.diastolicPressure} min={0} max={180} displayValue={`${patient.diastolicPressure} mmHg`} onChange={(diastolicPressure) => setPatient({ diastolicPressure })} />
        <EdumonSlider id="spo2" label="SpO₂" applied={isApplied('spo2')} onAppliedChange={setApplied} value={patient.spo2} min={0} max={100} displayValue={`${patient.spo2}%`} onChange={(spo2) => setPatient({ spo2 })} />
        <EdumonSlider id="peripheralPerfusion" label="Peripheral perfusion" applied={isApplied('peripheralPerfusion')} onAppliedChange={setApplied} value={patient.peripheralPerfusion} min={0} max={2} step={0.05} displayValue={patient.peripheralPerfusion.toFixed(2)} onChange={(peripheralPerfusion) => setPatient({ peripheralPerfusion })} />
        <EdumonSelect id="simulationPaused" label="Simulation" applied={isApplied('simulationPaused')} onAppliedChange={setApplied} value={snapshot.simulationPaused ? 'paused' : 'running'} onChange={(value) => onChange({ ...snapshot, simulationPaused: value === 'paused' })}><option value="running">Running</option><option value="paused">Paused</option></EdumonSelect>
        <EdumonSelect id="simulationSpeed" label="Speed" applied={isApplied('simulationSpeed')} onAppliedChange={setApplied} value={snapshot.simulationSpeed} onChange={(value) => onChange({ ...snapshot, simulationSpeed: Number(value) as EdumonScenarioSnapshot['simulationSpeed'] })}><option value={0.5}>×0.5</option><option value={1}>×1</option><option value={1.5}>×1.5</option><option value={2}>×2</option><option value={4}>×4</option></EdumonSelect>
      </div>
    </section>
  </div>
}
'''
t = t[:start] + new_block + t[end:]
t = t.replace("  if (trigger.type === 'manual' || trigger.type === 'question-any' || trigger.type === 'question-correct') return { id, type: trigger.type }", "  if (trigger.type === 'manual' || trigger.type === 'question-any' || trigger.type === 'question-correct' || trigger.type === 'media-ended' || trigger.type === 'media-acknowledged') return { id, type: trigger.type }")
t = t.replace("  if (trigger.type === 'manual' || trigger.type === 'question-any' || trigger.type === 'question-correct') return { type: trigger.type }", "  if (trigger.type === 'manual' || trigger.type === 'question-any' || trigger.type === 'question-correct' || trigger.type === 'media-ended' || trigger.type === 'media-acknowledged') return { type: trigger.type }")
t = t.replace("    emptySnapshot: () => ({ patient: { ...DEFAULT_MONITOR_STATE }, simulationPaused: false, simulationSpeed: 1 }),", "    emptySnapshot: () => ({ patient: { ...DEFAULT_MONITOR_STATE }, simulationPaused: false, simulationSpeed: 1 }),\n    defaultAppliedVariableIds: () => [...EDUMON_APPLY_IDS],")
t = t.replace("    renderSnapshotEditor: (snapshot, onChange): ReactNode => <SnapshotEditor snapshot={snapshot} onChange={onChange} />", "    renderSnapshotEditor: (snapshot, onChange, options): ReactNode => <SnapshotEditor snapshot={snapshot} onChange={onChange} appliedVariableIds={options?.appliedVariableIds} onAppliedVariableIdsChange={options?.onAppliedVariableIdsChange} />")
t = t.replace("        snapshot: stage.snapshot,\n        transition: stage.transition", "        snapshot: stage.snapshot,\n        appliedVariableIds: stage.appliedVariableIds ?? [...EDUMON_APPLY_IDS],\n        transition: stage.transition")
t = t.replace("          snapshot: stage.snapshot,\n          transition: stage.transition", "          snapshot: stage.snapshot,\n          appliedVariableIds: stage.appliedVariableIds,\n          transition: stage.transition")
p.write_text(t)

p = Path('src/edumon/scenarioAdapter.ts')
t = p.read_text()
t = t.replace("  questionCorrect?: boolean\n", "  questionCorrect?: boolean\n  mediaEnded?: boolean\n  mediaAcknowledged?: boolean\n  stageBaselinePatient?: EdumonScenarioSnapshot['patient']\n")
t = t.replace("      if (trigger.type === 'question-correct') return context.questionAnswered === true && context.questionCorrect === true\n", "      if (trigger.type === 'question-correct') return context.questionAnswered === true && context.questionCorrect === true\n      if (trigger.type === 'media-ended') return context.mediaEnded === true\n      if (trigger.type === 'media-acknowledged') return context.mediaAcknowledged === true\n")
t = t.replace("      return changed(context.state.patient[trigger.parameter], stage.stage.snapshot.patient[trigger.parameter])\n", "      const baseline = context.stageBaselinePatient ?? stage.stage.snapshot.patient\n      return changed(context.state.patient[trigger.parameter], baseline[trigger.parameter])\n")
p.write_text(t)

p = Path('src/edumon/EdumonApp.tsx')
t = p.read_text()
t = t.replace("  const scenarioTransitionRef = useRef<", "  const scenarioPatientBaselineRef = useRef<MonitorPatientState>({ ...DEFAULT_MONITOR_STATE })\n  const simulationPausedRef = useRef(simulationPaused)\n  const simulationSpeedRef = useRef(simulationSpeed)\n  simulationPausedRef.current = simulationPaused\n  simulationSpeedRef.current = simulationSpeed\n  const scenarioTransitionRef = useRef<")
t = t.replace("  const [scenarioQuestionState, setScenarioQuestionState] = useState({ answered: false, correct: false })\n", "  const [scenarioQuestionState, setScenarioQuestionState] = useState({ answered: false, correct: false })\n  const [scenarioMediaState, setScenarioMediaState] = useState({ ended: false, acknowledged: false })\n")
old = """    const stage = stageContext.stage
    const targetPatient = { ...snapshot.patient }
    const transition = stage.transition ?? { mode: 'immediate' as const }
"""
new = """    const stage = stageContext.stage
    const applied = stage.appliedVariableIds ? new Set(stage.appliedVariableIds) : null
    const applies = (id: string) => !applied || applied.has(id)
    const targetPatient: MonitorPatientState = { ...effectivePatientRef.current }
    if (applies('rhythm')) targetPatient.rhythm = snapshot.patient.rhythm
    if (applies('heartRate')) targetPatient.heartRate = snapshot.patient.heartRate
    if (applies('systolicPressure')) targetPatient.systolicPressure = snapshot.patient.systolicPressure
    if (applies('diastolicPressure')) targetPatient.diastolicPressure = snapshot.patient.diastolicPressure
    if (applies('spo2')) targetPatient.spo2 = snapshot.patient.spo2
    if (applies('peripheralPerfusion')) targetPatient.peripheralPerfusion = snapshot.patient.peripheralPerfusion
    scenarioPatientBaselineRef.current = { ...targetPatient }
    const transition = stage.transition ?? { mode: 'immediate' as const }
"""
if old not in t:
    raise SystemExit('EDUMON apply block not found')
t = t.replace(old, new)
t = t.replace("      const policy = overrides[key] ?? transition\n      return policy.mode === 'linear'", "      if (!applies(key)) return false\n      const policy = overrides[key] ?? transition\n      return policy.mode === 'linear'")
t = t.replace("    setSimulationPaused(snapshot.simulationPaused)\n    setSimulationSpeed(snapshot.simulationSpeed)\n", "    setSimulationPaused(applies('simulationPaused') ? snapshot.simulationPaused : simulationPausedRef.current)\n    setSimulationSpeed(applies('simulationSpeed') ? snapshot.simulationSpeed : simulationSpeedRef.current)\n")
t = t.replace("    setScenarioQuestionState({ answered: false, correct: false })\n  }, [scenarioRuntime.stageIndex])", "    setScenarioQuestionState({ answered: false, correct: false })\n    setScenarioMediaState({ ended: false, acknowledged: false })\n  }, [scenarioRuntime.stageIndex])")
t = t.replace("questionAnswered: scenarioQuestionState.answered, questionCorrect: scenarioQuestionState.correct }", "questionAnswered: scenarioQuestionState.answered, questionCorrect: scenarioQuestionState.correct, mediaEnded: scenarioMediaState.ended, mediaAcknowledged: scenarioMediaState.acknowledged, stageBaselinePatient: scenarioPatientBaselineRef.current }")
t = t.replace("  }, [scenarioRuntime, elapsed, sharedTeachingState, measurements, scenarioQuestionState])", "  }, [scenarioRuntime, elapsed, sharedTeachingState, measurements, scenarioQuestionState, scenarioMediaState])")
t = t.replace("          onQuestionResult={(answered, correct) => setScenarioQuestionState({ answered, correct })}\n", "          onQuestionResult={(answered, correct) => setScenarioQuestionState({ answered, correct })}\n          onMediaEvent={(event) => setScenarioMediaState((current) => event === 'ended' ? { ...current, ended: true } : { ...current, acknowledged: true })}\n")
p.write_text(t)

rep('src/instructorAccount.ts', "  | { type: 'question-correct' }\n", "  | { type: 'question-correct' }\n  | { type: 'media-ended' }\n  | { type: 'media-acknowledged' }\n", 1)

p = Path('src/scenario-builder/modules/ventilator/authoringAdapter.tsx')
t = p.read_text()
t = t.replace("  if (trigger.type === 'manual' || trigger.type === 'question-any' || trigger.type === 'question-correct') return { id, type: trigger.type }", "  if (trigger.type === 'manual' || trigger.type === 'question-any' || trigger.type === 'question-correct' || trigger.type === 'media-ended' || trigger.type === 'media-acknowledged') return { id, type: trigger.type }")
t = t.replace("  if (trigger.type === 'manual' || trigger.type === 'question-any' || trigger.type === 'question-correct') return { type: trigger.type }", "  if (trigger.type === 'manual' || trigger.type === 'question-any' || trigger.type === 'question-correct' || trigger.type === 'media-ended' || trigger.type === 'media-acknowledged') return { type: trigger.type }")
p.write_text(t)

p = Path('src/eduvent/useEduventInstructorScenarioRuntime.tsx')
t = p.read_text()
t = t.replace("  questionCorrect: boolean\n}", "  questionCorrect: boolean\n  mediaEnded: boolean\n  mediaAcknowledged: boolean\n}")
t = t.replace("  const [questionState, setQuestionState] = useState({ answered: false, correct: false })\n", "  const [questionState, setQuestionState] = useState({ answered: false, correct: false })\n  const [mediaState, setMediaState] = useState({ ended: false, acknowledged: false })\n")
t = t.replace("      if (trigger.type === 'question-correct') {", "      if (trigger.type === 'media-ended') return ctx.mediaEnded\n      if (trigger.type === 'media-acknowledged') return ctx.mediaAcknowledged\n      if (trigger.type === 'question-correct') {")
t = t.replace("      questionCorrect: questionState.correct,\n", "      questionCorrect: questionState.correct,\n      mediaEnded: mediaState.ended,\n      mediaAcknowledged: mediaState.acknowledged,\n")
t = t.replace("options.scenarioActionEvent, questionState])", "options.scenarioActionEvent, questionState, mediaState])")
t = t.replace("    setQuestionState({ answered: false, correct: false })\n    if (!stage) return", "    setQuestionState({ answered: false, correct: false })\n    setMediaState({ ended: false, acknowledged: false })\n    if (!stage) return")
t = t.replace("    onQuestionResult={(answered, correct) => setQuestionState({ answered, correct })}\n    onClose={close}", "    onQuestionResult={(answered, correct) => setQuestionState({ answered, correct })\n    }\n    onMediaEvent={(event) => setMediaState((current) => event === 'ended' ? { ...current, ended: true } : { ...current, acknowledged: true })}\n    onClose={close}")
p.write_text(t)

rep('src/scenario-builder/version.ts', "export const SCENARIO_BUILDER_VERSION = '0.8.4'", "export const SCENARIO_BUILDER_VERSION = '0.8.5'")
