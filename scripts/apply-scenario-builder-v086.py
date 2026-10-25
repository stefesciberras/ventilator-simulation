from pathlib import Path


def rep(path, old, new, count=-1):
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f'pattern not found in {path}: {old[:160]!r}')
    p.write_text(text.replace(old, new, count))

# Shared authoring vocabulary: first-class EDUSIM action trigger + dynamic action choices.
rep('src/teaching/scenario/authoringTypes.ts',
"  | { id: string; type: 'action'; parameter: string; actor: SharedScenarioActor }\n  | { id: string; type: 'question-any' }",
"  | { id: string; type: 'action'; parameter: string; actor: SharedScenarioActor }\n  | { id: string; type: 'edusim-action'; actionId: string; actor: SharedScenarioActor }\n  | { id: string; type: 'question-any' }")
rep('src/teaching/scenario/authoringTypes.ts',
"export interface SharedScenarioTriggerChoice {\n  id: string\n  label: string\n}\n",
"export interface SharedScenarioTriggerChoice {\n  id: string\n  label: string\n}\n\nexport interface SharedScenarioActionChoice extends SharedScenarioTriggerChoice {\n  kind: 'drug' | 'event'\n}\n")
rep('src/teaching/scenario/authoringTypes.ts',
"  actionParameters: readonly SharedScenarioTriggerChoice[]\n}",
"  actionParameters: readonly SharedScenarioTriggerChoice[]\n  /** Dynamically load the shared Drugs & Events library for products that support EDUSIM actions. */\n  loadEdusimActionChoices?: () => Promise<readonly SharedScenarioActionChoice[]>\n}")

# Builder UI: load shared action library and expose a Drug / event action path condition.
rep('src/scenario-builder/SharedScenarioEditorFramework.tsx',
"  type SharedScenarioAuthoringBranch,\n",
"  type SharedScenarioActionChoice,\n  type SharedScenarioAuthoringBranch,\n")
rep('src/scenario-builder/SharedScenarioEditorFramework.tsx',
"  if (trigger.type === 'action') return `${trigger.actor}: ${trigger.parameter || 'action'}`\n  if (trigger.type === 'question-any')",
"  if (trigger.type === 'action') return `${trigger.actor}: ${trigger.parameter || 'action'}`\n  if (trigger.type === 'edusim-action') return `${trigger.actor}: ${trigger.actionId || 'drug / event'}`\n  if (trigger.type === 'question-any')")
rep('src/scenario-builder/SharedScenarioEditorFramework.tsx',
"  adapter,\n  onChange,\n  onDelete,\n}: {\n  trigger: SharedScenarioAuthoringTrigger\n  adapter: SharedScenarioEditorAdapter<unknown, unknown>\n  onChange: (trigger: SharedScenarioAuthoringTrigger) => void\n  onDelete?: () => void\n}) {",
"  adapter,\n  edusimActionChoices,\n  onChange,\n  onDelete,\n}: {\n  trigger: SharedScenarioAuthoringTrigger\n  adapter: SharedScenarioEditorAdapter<unknown, unknown>\n  edusimActionChoices: readonly SharedScenarioActionChoice[]\n  onChange: (trigger: SharedScenarioAuthoringTrigger) => void\n  onDelete?: () => void\n}) {")
rep('src/scenario-builder/SharedScenarioEditorFramework.tsx',
"    else if (type === 'action') onChange({ id: trigger.id, type, parameter: adapter.actionParameters[0]?.id ?? '', actor: 'candidate' })\n    else onChange({ id: trigger.id, type })",
"    else if (type === 'action') onChange({ id: trigger.id, type, parameter: adapter.actionParameters[0]?.id ?? '', actor: 'candidate' })\n    else if (type === 'edusim-action') onChange({ id: trigger.id, type, actionId: edusimActionChoices[0]?.id ?? '', actor: 'candidate' })\n    else onChange({ id: trigger.id, type })")
rep('src/scenario-builder/SharedScenarioEditorFramework.tsx',
"      <option value=\"action\">Candidate / instructor action</option>\n      <option value=\"question-any\">",
"      <option value=\"action\">Candidate / instructor action</option>\n      {!!adapter.loadEdusimActionChoices && <option value=\"edusim-action\">Drug / event action</option>}\n      <option value=\"question-any\">")
rep('src/scenario-builder/SharedScenarioEditorFramework.tsx',
"    {trigger.type === 'action' && <>\n      <select value={trigger.parameter} onChange={(event) => onChange({ ...trigger, parameter: event.target.value })}>{adapter.actionParameters.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select>\n      <select value={trigger.actor} onChange={(event) => onChange({ ...trigger, actor: event.target.value as 'candidate' | 'instructor' | 'either' })}><option value=\"candidate\">Candidate</option><option value=\"instructor\">Instructor</option><option value=\"either\">Either</option></select>\n    </>}\n",
"    {trigger.type === 'action' && <>\n      <select value={trigger.parameter} onChange={(event) => onChange({ ...trigger, parameter: event.target.value })}>{adapter.actionParameters.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select>\n      <select value={trigger.actor} onChange={(event) => onChange({ ...trigger, actor: event.target.value as 'candidate' | 'instructor' | 'either' })}><option value=\"candidate\">Candidate</option><option value=\"instructor\">Instructor</option><option value=\"either\">Either</option></select>\n    </>}\n    {trigger.type === 'edusim-action' && <>\n      <select value={trigger.actionId} onChange={(event) => onChange({ ...trigger, actionId: event.target.value })}>\n        <optgroup label=\"Drugs\">{edusimActionChoices.filter((item) => item.kind === 'drug').map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</optgroup>\n        <optgroup label=\"Events\">{edusimActionChoices.filter((item) => item.kind === 'event').map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</optgroup>\n      </select>\n      <select value={trigger.actor} onChange={(event) => onChange({ ...trigger, actor: event.target.value as 'candidate' | 'instructor' | 'either' })}><option value=\"candidate\">Candidate</option><option value=\"instructor\">Instructor</option><option value=\"either\">Either</option></select>\n    </>}\n")
rep('src/scenario-builder/SharedScenarioEditorFramework.tsx',
"  const [selectedId, setSelectedId] = useState('')\n",
"  const [selectedId, setSelectedId] = useState('')\n  const [edusimActionChoices, setEdusimActionChoices] = useState<readonly SharedScenarioActionChoice[]>([])\n  const [edusimActionLoadError, setEdusimActionLoadError] = useState<string | null>(null)\n")
# Insert loader after selectedStage initialization, before existing effects.
rep('src/scenario-builder/SharedScenarioEditorFramework.tsx',
"  const selectedRow = library.items.find((row) => row.id === selectedId) ?? null\n  const selectedStage = document.stages.find((stage) => stage.id === selectedStageId) ?? document.stages[0]\n\n  useEffect(() => {",
"  const selectedRow = library.items.find((row) => row.id === selectedId) ?? null\n  const selectedStage = document.stages.find((stage) => stage.id === selectedStageId) ?? document.stages[0]\n\n  useEffect(() => {\n    let active = true\n    setEdusimActionLoadError(null)\n    if (!adapter.loadEdusimActionChoices) { setEdusimActionChoices([]); return () => { active = false } }\n    void adapter.loadEdusimActionChoices()\n      .then((items) => { if (active) setEdusimActionChoices(items) })\n      .catch((cause) => {\n        if (!active) return\n        setEdusimActionChoices([])\n        setEdusimActionLoadError(cause instanceof Error ? cause.message : 'Unable to load Drugs & Events.')\n      })\n    return () => { active = false }\n  }, [adapter.product])\n\n  useEffect(() => {")
# Pass choices to TriggerEditor and show a concise load warning by the path heading.
rep('src/scenario-builder/SharedScenarioEditorFramework.tsx',
"<TriggerEditor trigger={trigger} adapter={adapter as SharedScenarioEditorAdapter<unknown, unknown>} onChange={(next) => updatePathCondition(branch, trigger.id, next)}",
"<TriggerEditor trigger={trigger} adapter={adapter as SharedScenarioEditorAdapter<unknown, unknown>} edusimActionChoices={edusimActionChoices} onChange={(next) => updatePathCondition(branch, trigger.id, next)}")
rep('src/scenario-builder/SharedScenarioEditorFramework.tsx',
"<div className=\"shared-scenario-section-heading\"><div><span>Scenario flow</span><strong>Paths from this stage</strong><small>Each path has a destination and one or more conditions.</small></div><button type=\"button\" disabled={document.stages.length < 2} onClick={addBranch}>+ Path</button></div>",
"<div className=\"shared-scenario-section-heading\"><div><span>Scenario flow</span><strong>Paths from this stage</strong><small>Each path has a destination and one or more conditions.</small>{edusimActionLoadError && <small>Drugs & Events unavailable: {edusimActionLoadError}</small>}</div><button type=\"button\" disabled={document.stages.length < 2} onClick={addBranch}>+ Path</button></div>")

# EDUMON persisted trigger model.
rep('src/edumon/scenarioTypes.ts',
"  | { type: 'patient-change'; parameter: keyof MonitorPatientState; actor?: SharedScenarioActor }\n  | { type: 'question-any' }",
"  | { type: 'patient-change'; parameter: keyof MonitorPatientState; actor?: SharedScenarioActor }\n  | { type: 'edusim-action'; actionId: string; actor?: SharedScenarioActor }\n  | { type: 'question-any' }")
rep('src/edumon/scenarioTypes.ts', "  schemaVersion: 1 | 2\n", "  schemaVersion: 1 | 2 | 3\n")

# EDUMON builder adapter loads action choices dynamically and round-trips the trigger.
rep('src/scenario-builder/modules/edumon/authoringAdapter.tsx',
"import { RHYTHM_LABELS } from '../../../edumon/monitorEngine'\n",
"import { RHYTHM_LABELS } from '../../../edumon/monitorEngine'\nimport { listEdusimActions } from '../../../edumon/actionLibrary'\n")
rep('src/scenario-builder/modules/edumon/authoringAdapter.tsx',
"  if (trigger.type === 'condition') return { id, type: 'condition', metric: trigger.metric, operator: trigger.operator, value: trigger.value }\n  return { id, type: 'action', parameter: String(trigger.parameter), actor: trigger.actor ?? 'candidate' }",
"  if (trigger.type === 'condition') return { id, type: 'condition', metric: trigger.metric, operator: trigger.operator, value: trigger.value }\n  if (trigger.type === 'edusim-action') return { id, type: 'edusim-action', actionId: trigger.actionId, actor: trigger.actor ?? 'candidate' }\n  return { id, type: 'action', parameter: String(trigger.parameter), actor: trigger.actor ?? 'candidate' }")
rep('src/scenario-builder/modules/edumon/authoringAdapter.tsx',
"  if (trigger.type === 'condition') return { type: 'condition', metric: trigger.metric as EdumonScenarioMetric, operator: trigger.operator, value: trigger.value }\n  return { type: 'patient-change', parameter: trigger.parameter as keyof EdumonScenarioSnapshot['patient'], actor: trigger.actor }",
"  if (trigger.type === 'condition') return { type: 'condition', metric: trigger.metric as EdumonScenarioMetric, operator: trigger.operator, value: trigger.value }\n  if (trigger.type === 'edusim-action') return { type: 'edusim-action', actionId: trigger.actionId, actor: trigger.actor }\n  return { type: 'patient-change', parameter: trigger.parameter as keyof EdumonScenarioSnapshot['patient'], actor: trigger.actor }")
rep('src/scenario-builder/modules/edumon/authoringAdapter.tsx',
"    actionParameters: [\n",
"    loadEdusimActionChoices: async () => {\n      const environment = product === 'icu' ? 'edumon-icu' : 'edumon-ana'\n      return (await listEdusimActions(environment)).map((action) => ({ id: action.id, label: action.name, kind: action.kind }))\n    },\n    actionParameters: [\n")
rep('src/scenario-builder/modules/edumon/authoringAdapter.tsx', "      schemaVersion: 2,\n", "      schemaVersion: 3,\n", 1)

# EDUVENT does not expose the Drugs & Events library yet; keep conversion exhaustive for imported shared docs.
rep('src/scenario-builder/modules/ventilator/authoringAdapter.tsx',
"  if (trigger.type === 'condition') return { type: 'condition', metric: trigger.metric as DynamicScenarioMetric, operator: trigger.operator, value: trigger.value }\n",
"  if (trigger.type === 'condition') return { type: 'condition', metric: trigger.metric as DynamicScenarioMetric, operator: trigger.operator, value: trigger.value }\n  if (trigger.type === 'edusim-action') return { type: 'manual' }\n")

# EDUMON runtime context matches action activations since stage entry and actor source.
rep('src/edumon/scenarioAdapter.ts',
"  stageBaselinePatient?: EdumonScenarioSnapshot['patient']\n}",
"  stageBaselinePatient?: EdumonScenarioSnapshot['patient']\n  actionEvents?: Array<{ sourceId: string; actor: 'candidate' | 'instructor'; actionId: string; sequence: number }>\n  actionBaselines?: Record<string, number>\n}")
rep('src/edumon/scenarioAdapter.ts',
"      if (trigger.type === 'condition') {\n        const actual = numericMetric(context, trigger.metric)\n        return actual != null && Number.isFinite(actual) && conditionMatches(actual, trigger.operator, trigger.value)\n      }\n      const baseline = context.stageBaselinePatient ?? stage.stage.snapshot.patient",
"      if (trigger.type === 'condition') {\n        const actual = numericMetric(context, trigger.metric)\n        return actual != null && Number.isFinite(actual) && conditionMatches(actual, trigger.operator, trigger.value)\n      }\n      if (trigger.type === 'edusim-action') {\n        const actor = trigger.actor ?? 'either'\n        return (context.actionEvents ?? []).some((event) =>\n          event.actionId === trigger.actionId\n          && event.sequence > (context.actionBaselines?.[event.sourceId] ?? 0)\n          && (actor === 'either' || event.actor === actor),\n        )\n      }\n      const baseline = context.stageBaselinePatient ?? stage.stage.snapshot.patient")

# Share the latest local action activation through EDUMON teaching state.
rep('src/edumon/teachingState.ts',
"  alarmLimits: EdumonAlarmLimits\n}",
"  alarmLimits: EdumonAlarmLimits\n  /** Latest local Drugs & Events activation, used by scenario triggers across a teaching session. */\n  lastActionId?: string | null\n  actionSequence?: number\n  actionSimulationTime?: number | null\n}")

# EDUMON app subscribes to ActionRuntime, publishes latest activation, preserves candidate-local action metadata,
# constructs actor-aware events, and snapshots per-source sequences at every scenario stage entry.
rep('src/edumon/EdumonApp.tsx',
"import type { EdumonTeachingState } from './teachingState'\n",
"import type { EdumonTeachingState } from './teachingState'\nimport { getActionRuntimeLog, subscribeToActionRuntime } from '../edusim/actions/ActionRuntime'\n")
rep('src/edumon/EdumonApp.tsx',
"  const scenarioPatientBaselineRef = useRef<MonitorPatientState>({ ...DEFAULT_MONITOR_STATE })\n",
"  const scenarioPatientBaselineRef = useRef<MonitorPatientState>({ ...DEFAULT_MONITOR_STATE })\n  const scenarioActionBaselineRef = useRef<Record<string, number>>({})\n")
rep('src/edumon/EdumonApp.tsx',
"  const [scenarioMediaState, setScenarioMediaState] = useState({ ended: false, acknowledged: false })\n",
"  const [scenarioMediaState, setScenarioMediaState] = useState({ ended: false, acknowledged: false })\n  const [scenarioActionEvent, setScenarioActionEvent] = useState<{ actionId: string; sequence: number; simulationTime: number } | null>(null)\n")
rep('src/edumon/EdumonApp.tsx',
"  const screenWakeLock = useScreenWakeLock()\n\n  useEffect(() => {\n    if (frozen || simulationPaused) return",
"  const screenWakeLock = useScreenWakeLock()\n\n  useEffect(() => {\n    const syncActionEvent = () => {\n      const latest = [...getActionRuntimeLog()].reverse().find((entry) => entry.type === 'activate' && Boolean(entry.actionId))\n      setScenarioActionEvent(latest?.actionId ? { actionId: latest.actionId, sequence: latest.sequence, simulationTime: latest.simulationTime } : null)\n    }\n    syncActionEvent()\n    return subscribeToActionRuntime(syncActionEvent)\n  }, [])\n\n  useEffect(() => {\n    if (frozen || simulationPaused) return")
rep('src/edumon/EdumonApp.tsx',
"  const sharedTeachingState = useMemo<EdumonTeachingState>(() => ({ patient: patientState, patientTransitionSeconds, simulationPaused, simulationSpeed, alarmLimits }), [patientState, patientTransitionSeconds, simulationPaused, simulationSpeed, alarmLimits])",
"  const sharedTeachingState = useMemo<EdumonTeachingState>(() => ({ patient: patientState, patientTransitionSeconds, simulationPaused, simulationSpeed, alarmLimits, lastActionId: scenarioActionEvent?.actionId ?? null, actionSequence: scenarioActionEvent?.sequence ?? 0, actionSimulationTime: scenarioActionEvent?.simulationTime ?? null }), [patientState, patientTransitionSeconds, simulationPaused, simulationSpeed, alarmLimits, scenarioActionEvent])")
rep('src/edumon/EdumonApp.tsx',
"      ...instructorState,\n      patient: {",
"      ...instructorState,\n      lastActionId: localState.lastActionId ?? null,\n      actionSequence: localState.actionSequence ?? 0,\n      actionSimulationTime: localState.actionSimulationTime ?? null,\n      patient: {")
# Insert action-event aggregation after self-directed state is available.
rep('src/edumon/EdumonApp.tsx',
"  useEffect(() => {\n    setScenarioQuestionState({ answered: false, correct: false })\n    setScenarioMediaState({ ended: false, acknowledged: false })\n  }, [scenarioRuntime.stageIndex])\n\n  const selectedAuxiliary",
"  const scenarioActionEvents = useMemo(() => {\n    const events: Array<{ sourceId: string; actor: 'candidate' | 'instructor'; actionId: string; sequence: number }> = []\n    if (scenarioActionEvent) {\n      events.push({\n        sourceId: 'local',\n        actor: selfDirected.active || teachingSession.role === 'candidate' ? 'candidate' : 'instructor',\n        actionId: scenarioActionEvent.actionId,\n        sequence: scenarioActionEvent.sequence,\n      })\n    }\n    if (teachingSession.role === 'instructor') {\n      for (const member of teachingSession.members) {\n        if (member.role !== 'candidate') continue\n        const state = member.product_state as Partial<EdumonTeachingState> | null\n        const actionId = state?.lastActionId\n        const sequence = Number(state?.actionSequence ?? 0)\n        if (actionId && Number.isFinite(sequence)) events.push({ sourceId: member.id, actor: 'candidate', actionId, sequence })\n      }\n    }\n    return events\n  }, [scenarioActionEvent, selfDirected.active, teachingSession.role, teachingSession.members])\n\n  useEffect(() => {\n    setScenarioQuestionState({ answered: false, correct: false })\n    setScenarioMediaState({ ended: false, acknowledged: false })\n    scenarioActionBaselineRef.current = Object.fromEntries(scenarioActionEvents.map((event) => [event.sourceId, event.sequence]))\n  }, [scenarioRuntime.scenario?.id, scenarioRuntime.stageIndex])\n\n  const selectedAuxiliary")
rep('src/edumon/EdumonApp.tsx',
"void scenarioRuntime.evaluate({ simulationTime: elapsed, state: sharedTeachingState, measurements, questionAnswered: scenarioQuestionState.answered, questionCorrect: scenarioQuestionState.correct, mediaEnded: scenarioMediaState.ended, mediaAcknowledged: scenarioMediaState.acknowledged, stageBaselinePatient: scenarioPatientBaselineRef.current }, elapsed)\n  }, [scenarioRuntime, elapsed, sharedTeachingState, measurements, scenarioQuestionState, scenarioMediaState])",
"void scenarioRuntime.evaluate({ simulationTime: elapsed, state: sharedTeachingState, measurements, questionAnswered: scenarioQuestionState.answered, questionCorrect: scenarioQuestionState.correct, mediaEnded: scenarioMediaState.ended, mediaAcknowledged: scenarioMediaState.acknowledged, stageBaselinePatient: scenarioPatientBaselineRef.current, actionEvents: scenarioActionEvents, actionBaselines: scenarioActionBaselineRef.current }, elapsed)\n  }, [scenarioRuntime, elapsed, sharedTeachingState, measurements, scenarioQuestionState, scenarioMediaState, scenarioActionEvents])")

# Builder version.
rep('src/scenario-builder/version.ts', "export const SCENARIO_BUILDER_VERSION = '0.8.5'", "export const SCENARIO_BUILDER_VERSION = '0.8.6'")
