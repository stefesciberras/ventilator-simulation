from pathlib import Path


def replace(path: str, old: str, new: str):
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f'Pattern not found in {path}: {old[:180]!r}')
    p.write_text(text.replace(old, new))

replace('src/teaching/scenario/runtimeCore.ts',
"export interface TeachingScenarioStage<TSnapshot, TTrigger> {\n  id: string\n  name: string\n  snapshot: TSnapshot\n  triggers: TTrigger[]\n",
"export type TeachingScenarioTransition =\n  | { mode: 'immediate' }\n  | { mode: 'linear'; durationSeconds: number }\n\nexport interface TeachingScenarioStage<TSnapshot, TTrigger> {\n  id: string\n  name: string\n  snapshot: TSnapshot\n  /** Default transition for numeric values when this stage is entered. */\n  transition?: TeachingScenarioTransition\n  /** Optional per-variable transition overrides keyed by product variable ID. */\n  transitionOverrides?: Record<string, TeachingScenarioTransition>\n  triggers: TTrigger[]\n")

p = Path('src/scenario-builder/modules/edumon/authoringAdapter.tsx')
t = p.read_text()
t = t.replace(
"    conditionMetrics: [\n",
"    transitionVariables: () => [\n      { id: 'heartRate', label: 'Heart rate' },\n      { id: 'systolicPressure', label: 'Systolic pressure' },\n      { id: 'diastolicPressure', label: 'Diastolic pressure' },\n      { id: 'spo2', label: 'SpO₂' },\n      { id: 'peripheralPerfusion', label: 'Peripheral perfusion' },\n    ],\n    conditionMetrics: [\n")
t = t.replace(
"        snapshot: stage.snapshot,\n        triggers: [],\n",
"        snapshot: stage.snapshot,\n        transition: stage.transition ?? { mode: 'immediate' as const },\n        transitionOverrides: stage.transitionOverrides ?? {},\n        triggers: [],\n")
t = t.replace(
"          snapshot: stage.snapshot,\n          triggers: [{ type: 'manual' }],\n",
"          snapshot: stage.snapshot,\n          transition: stage.transition ?? { mode: 'immediate' },\n          transitionOverrides: stage.transitionOverrides ?? {},\n          triggers: [{ type: 'manual' }],\n")
p.write_text(t)

p = Path('src/edumon/EdumonApp.tsx')
t = p.read_text()
t = t.replace(
"import { useTeachingScenarioRuntime } from '../teaching/scenario/runtimeCore'\n",
"import { useTeachingScenarioRuntime, type TeachingScenarioTransition } from '../teaching/scenario/runtimeCore'\n")
old_ref = "  const patientTransitionRef = useRef<{ from: MonitorPatientState; to: MonitorPatientState; start: number; duration: number } | null>(null)\n"
t = t.replace(old_ref, old_ref + "  const scenarioTransitionRef = useRef<{ from: MonitorPatientState; to: MonitorPatientState; start: number; defaultPolicy: TeachingScenarioTransition; overrides: Record<string, TeachingScenarioTransition> } | null>(null)\n")
old_effective = '''  const effectivePatientState = (() => {\n    const transition = patientTransitionRef.current\n    if (!transition) { effectivePatientRef.current = { ...patientState }; return patientState }\n    const progress = (elapsed - transition.start) / Math.max(transition.duration, 0.001)\n    const next = interpolateMonitorPatientState(transition.from, transition.to, progress)\n    effectivePatientRef.current = next\n    if (progress >= 1) { effectivePatientRef.current = { ...transition.to }; patientTransitionRef.current = null; return transition.to }\n    return next\n  })()\n'''
new_effective = '''  const effectivePatientState = (() => {\n    const scenarioTransition = scenarioTransitionRef.current\n    if (scenarioTransition) {\n      const keys: Array<keyof Pick<MonitorPatientState, 'heartRate' | 'systolicPressure' | 'diastolicPressure' | 'spo2' | 'peripheralPerfusion'>> = ['heartRate', 'systolicPressure', 'diastolicPressure', 'spo2', 'peripheralPerfusion']\n      const next: MonitorPatientState = { ...scenarioTransition.to, rhythm: scenarioTransition.to.rhythm }\n      let running = false\n      for (const key of keys) {\n        const policy = scenarioTransition.overrides[key] ?? scenarioTransition.defaultPolicy\n        if (policy.mode !== 'linear' || policy.durationSeconds <= 0) { next[key] = scenarioTransition.to[key]; continue }\n        const progress = Math.max(0, Math.min(1, (elapsed - scenarioTransition.start) / Math.max(policy.durationSeconds, 0.001)))\n        next[key] = scenarioTransition.from[key] + (scenarioTransition.to[key] - scenarioTransition.from[key]) * progress\n        if (progress < 1) running = true\n      }\n      effectivePatientRef.current = next\n      if (!running) scenarioTransitionRef.current = null\n      return next\n    }\n    const transition = patientTransitionRef.current\n    if (!transition) { effectivePatientRef.current = { ...patientState }; return patientState }\n    const progress = (elapsed - transition.start) / Math.max(transition.duration, 0.001)\n    const next = interpolateMonitorPatientState(transition.from, transition.to, progress)\n    effectivePatientRef.current = next\n    if (progress >= 1) { effectivePatientRef.current = { ...transition.to }; patientTransitionRef.current = null; return transition.to }\n    return next\n  })()\n'''
if old_effective not in t:
    raise SystemExit('effective patient block not found')
t = t.replace(old_effective, new_effective)
old_adapter = '''  const edumonScenarioAdapter = useMemo(() => createEdumonScenarioRuntimeAdapter((snapshot) => {\n    setPatientState(snapshot.patient)\n    setSimulationPaused(snapshot.simulationPaused)\n    setSimulationSpeed(snapshot.simulationSpeed)\n  }), [])\n'''
new_adapter = '''  const edumonScenarioAdapter = useMemo(() => createEdumonScenarioRuntimeAdapter((snapshot, stageContext) => {\n    const stage = stageContext.stage\n    const targetPatient = { ...snapshot.patient }\n    const transition = stage.transition ?? { mode: 'immediate' as const }\n    const overrides = stage.transitionOverrides ?? {}\n    const hasLinear = ['heartRate', 'systolicPressure', 'diastolicPressure', 'spo2', 'peripheralPerfusion'].some((key) => {\n      const policy = overrides[key] ?? transition\n      return policy.mode === 'linear' && policy.durationSeconds > 0\n    })\n    patientTransitionRef.current = null\n    if (hasLinear) {\n      scenarioTransitionRef.current = {\n        from: { ...effectivePatientRef.current },\n        to: targetPatient,\n        start: stageContext.stageStartedSimulationTime,\n        defaultPolicy: transition,\n        overrides,\n      }\n    } else {\n      scenarioTransitionRef.current = null\n      effectivePatientRef.current = { ...targetPatient }\n    }\n    setPatientState(targetPatient)\n    setSimulationPaused(snapshot.simulationPaused)\n    setSimulationSpeed(snapshot.simulationSpeed)\n  }), [])\n'''
if old_adapter not in t:
    raise SystemExit('scenario adapter block not found')
t = t.replace(old_adapter, new_adapter)
t = t.replace(
"  useEffect(() => {\n    if (patientTransitionSeconds <= 0) { effectivePatientRef.current = { ...patientState }; patientTransitionRef.current = null; return }\n    patientTransitionRef.current = { from: { ...effectivePatientRef.current }, to: { ...patientState }, start: elapsed, duration: patientTransitionSeconds }\n  }, [patientState, patientTransitionSeconds])\n",
"  useEffect(() => {\n    if (scenarioTransitionRef.current) return\n    if (patientTransitionSeconds <= 0) { effectivePatientRef.current = { ...patientState }; patientTransitionRef.current = null; return }\n    patientTransitionRef.current = { from: { ...effectivePatientRef.current }, to: { ...patientState }, start: elapsed, duration: patientTransitionSeconds }\n  }, [patientState, patientTransitionSeconds])\n")
p.write_text(t)

replace('src/scenario-builder/version.ts', "export const SCENARIO_BUILDER_VERSION = '0.8.3'\n", "export const SCENARIO_BUILDER_VERSION = '0.8.4'\n")
