from pathlib import Path


def rep(path, old, new):
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f'pattern not found in {path}: {old[:180]!r}')
    p.write_text(text.replace(old, new, 1))

rep('src/edumon/EdumonApp.tsx',
"import { getActionRuntimeLog, subscribeToActionRuntime } from '../edusim/actions/ActionRuntime'\n",
"import { getActionRuntimeLog, subscribeToActionRuntime } from '../edusim/actions/ActionRuntime'\nimport { buildEdumonScenarioStageTarget, type EdumonTransitionPatientKey } from './scenarioRegistry'\n")

rep('src/edumon/EdumonApp.tsx',
"  const scenarioTransitionRef = useRef<{ from: MonitorPatientState; to: MonitorPatientState; start: number; defaultPolicy: TeachingScenarioTransition; overrides: Record<string, TeachingScenarioTransition> } | null>(null)",
"  const scenarioTransitionRef = useRef<{ from: MonitorPatientState; to: MonitorPatientState; start: number; defaultPolicy: TeachingScenarioTransition; overrides: Record<string, TeachingScenarioTransition>; keys: EdumonTransitionPatientKey[] } | null>(null)")

rep('src/edumon/EdumonApp.tsx',
"      const keys: Array<keyof Pick<MonitorPatientState, 'heartRate' | 'systolicPressure' | 'diastolicPressure' | 'spo2' | 'peripheralPerfusion'>> = ['heartRate', 'systolicPressure', 'diastolicPressure', 'spo2', 'peripheralPerfusion']\n      const next: MonitorPatientState = { ...scenarioTransition.to, rhythm: scenarioTransition.to.rhythm }",
"      const keys = scenarioTransition.keys\n      const next: MonitorPatientState = { ...scenarioTransition.to, rhythm: scenarioTransition.to.rhythm }")

old = """  const edumonScenarioAdapter = useMemo(() => createEdumonScenarioRuntimeAdapter((snapshot, stageContext) => {
    const stage = stageContext.stage
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
    const overrides = stage.transitionOverrides ?? {}
    const hasLinear = ['heartRate', 'systolicPressure', 'diastolicPressure', 'spo2', 'peripheralPerfusion'].some((key) => {
      if (!applies(key)) return false
      const policy = overrides[key] ?? transition
      return policy.mode === 'linear' && policy.durationSeconds > 0
    })
    patientTransitionRef.current = null
    if (hasLinear) {
      scenarioTransitionRef.current = {
        from: { ...effectivePatientRef.current },
        to: targetPatient,
        start: stageContext.stageStartedSimulationTime,
        defaultPolicy: transition,
        overrides,
      }
    } else {
      scenarioTransitionRef.current = null
      effectivePatientRef.current = { ...targetPatient }
    }
    setPatientState(targetPatient)
    setSimulationPaused(applies('simulationPaused') ? snapshot.simulationPaused : simulationPausedRef.current)
    setSimulationSpeed(applies('simulationSpeed') ? snapshot.simulationSpeed : simulationSpeedRef.current)
  }), [])
"""
new = """  const edumonScenarioAdapter = useMemo(() => createEdumonScenarioRuntimeAdapter((snapshot, stageContext) => {
    const stage = stageContext.stage
    const target = buildEdumonScenarioStageTarget(
      module.id === 'icu' ? 'icu' : 'anaesth',
      {
        patient: { ...effectivePatientRef.current },
        simulationPaused: simulationPausedRef.current,
        simulationSpeed: simulationSpeedRef.current,
      },
      snapshot,
      stage.appliedVariableIds,
    )
    const targetPatient = target.patient
    scenarioPatientBaselineRef.current = { ...targetPatient }
    const transition = stage.transition ?? { mode: 'immediate' as const }
    const overrides = stage.transitionOverrides ?? {}
    const hasLinear = target.transitionPatientKeys.some((key) => {
      const policy = overrides[key] ?? transition
      return policy.mode === 'linear' && policy.durationSeconds > 0
    })
    patientTransitionRef.current = null
    if (hasLinear) {
      scenarioTransitionRef.current = {
        from: { ...effectivePatientRef.current },
        to: targetPatient,
        start: stageContext.stageStartedSimulationTime,
        defaultPolicy: transition,
        overrides,
        keys: target.transitionPatientKeys,
      }
    } else {
      scenarioTransitionRef.current = null
      effectivePatientRef.current = { ...targetPatient }
    }
    setPatientState(targetPatient)
    setSimulationPaused(target.simulationPaused)
    setSimulationSpeed(target.simulationSpeed)
  }), [module.id])
"""
rep('src/edumon/EdumonApp.tsx', old, new)

rep('src/scenario-builder/version.ts',
"export const SCENARIO_BUILDER_VERSION = '0.8.7'",
"export const SCENARIO_BUILDER_VERSION = '0.9.0'")
