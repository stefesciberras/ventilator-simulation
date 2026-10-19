from pathlib import Path
p=Path('src/components/InstructorAccountControls.tsx')
s=p.read_text()
anchor="""function settingChanged(a: unknown, b: unknown) {
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) > 1e-6
  return a !== b
}
"""
insert="""function settingChanged(a: unknown, b: unknown) {
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) > 1e-6
  return a !== b
}

function stageTransitionDuration(stage: DynamicScenarioStage, group: 'ventilator' | 'patient', parameter: string): number {
  const overrides = stage.transitionOverrides?.[group] as Record<string, { mode: 'immediate' } | { mode: 'linear'; durationSeconds: number }> | undefined
  const policy = overrides?.[parameter] ?? stage.transition ?? { mode: 'immediate' as const }
  return policy.mode === 'linear' ? Math.max(0, policy.durationSeconds) : 0
}
"""
if anchor not in s: raise SystemExit('settingChanged anchor missing')
s=s.replace(anchor,insert,1)
old="""      } else if (trigger.type === 'patient-change') {
        if (selfDirectedRun) {
"""
new="""      } else if (trigger.type === 'patient-change') {
        const transitionDuration = stageTransitionDuration(stages[activeDynamicStage], 'patient', String(trigger.parameter))
        if (scenarioElapsedSeconds - activeDynamicStageStartedAt < transitionDuration) continue
        if (selfDirectedRun) {
"""
if old not in s: raise SystemExit('patient trigger anchor missing')
s=s.replace(old,new,1)
old="""      } else if (trigger.type === 'action') {
        if (selfDirectedRun) {
"""
new="""      } else if (trigger.type === 'action') {
        const transitionDuration = stageTransitionDuration(stages[activeDynamicStage], 'ventilator', String(trigger.parameter))
        if (scenarioElapsedSeconds - activeDynamicStageStartedAt < transitionDuration) continue
        if (selfDirectedRun) {
"""
if old not in s: raise SystemExit('vent trigger anchor missing')
s=s.replace(old,new,1)
p.write_text(s)
