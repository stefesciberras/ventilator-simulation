import fs from 'node:fs'

function replaceRequired(text, from, to, label) {
  if (!text.includes(from)) throw new Error(`Missing ${label}`)
  return text.replace(from, to)
}

const path = 'src/components/InstructorAccountControls.tsx'
let text = fs.readFileSync(path, 'utf8')
text = replaceRequired(
  text,
  "import { eduventTeachingHost, useTeachingPrompts } from '../teaching'\n",
  "import { eduventTeachingHost, useTeachingPrompts } from '../teaching'\nimport { resolveTeachingScenarioTransition } from '../teaching/scenario/runtimeCore'\n",
  'scenario runtime resolver import',
)

const startMarker = "  useEffect(() => {\n    if (role !== 'candidate' || !activeDynamicId) return\n"
const start = text.indexOf(startMarker)
const evaluationStart = text.indexOf("  useEffect(() => {\n    if (role === 'candidate' || !activeRuntimePreset", start)
const nextEffect = text.indexOf("\n  useEffect(() => {\n    const stages = activeRuntimePreset?.scenario.stages", evaluationStart)
if (start < 0 || evaluationStart < 0 || nextEffect < 0) throw new Error('Unable to locate dynamic runtime effects')

const prefix = text.slice(start, evaluationStart)
const replacement = `  useEffect(() => {
    if (role === 'candidate' || !activeRuntimePreset || automaticAdvanceLockRef.current || Date.now() < triggerArmedAfterRef.current) return
    const stages = activeRuntimePreset.scenario.stages ?? []
    if (activeDynamicStage < 0 || activeDynamicStage >= stages.length - 1) return
    const activeStage = stages[activeDynamicStage]

    const triggerMatches = (trigger: DynamicScenarioTrigger) => {
      if (trigger.type === 'manual') return false
      if (trigger.type === 'time') return scenarioElapsedSeconds - activeDynamicStageStartedAt >= Math.max(1, trigger.seconds)
      if (trigger.type === 'condition') {
        const actual = conditionMetricValue(physiologyMeasurements, trigger.metric)
        return actual != null && conditionMatches(actual, trigger.operator, trigger.value)
      }
      if (trigger.type === 'question-any') return selfDirectedRun ? selfDirectedQuestionAnswer != null : scenarioPromptRuntime.responses.length > 0
      if (trigger.type === 'question-correct') {
        const correct = activeStage?.question?.correctOptionId ?? null
        return Boolean(correct && (selfDirectedRun ? selfDirectedQuestionAnswer === correct : scenarioPromptRuntime.responses.some((response) => response.option_id === correct)))
      }
      if (trigger.type === 'device-action') {
        if (selfDirectedRun) return (trigger.actor === 'candidate' || trigger.actor === 'either') && Boolean(scenarioActionEvent && scenarioActionEvent.sequence > localScenarioActionBaselineRef.current && scenarioActionEvent.action === trigger.action)
        if ((trigger.actor === 'instructor' || trigger.actor === 'either') && scenarioActionEvent && scenarioActionEvent.sequence > localScenarioActionBaselineRef.current && scenarioActionEvent.action === trigger.action) return true
        if (trigger.actor === 'candidate' || trigger.actor === 'either') return sessionMembers.some((member) => member.role === 'candidate' && (member.scenario_action_revision ?? 0) > (candidateScenarioActionBaselineRef.current.get(member.id) ?? 0) && member.last_scenario_action === trigger.action)
        return false
      }
      if (trigger.type === 'patient-change') {
        const duration = stageTransitionDuration(activeStage, 'patient', String(trigger.parameter))
        if (scenarioElapsedSeconds - activeDynamicStageStartedAt < duration) return false
        if (selfDirectedRun) {
          const baseline = patientBaselineInstructorRef.current
          return (trigger.actor === 'candidate' || trigger.actor === 'either') && Boolean(baseline && settingChanged(currentScenario.patient[trigger.parameter], baseline[trigger.parameter]))
        }
        if (trigger.actor === 'instructor' || trigger.actor === 'either') {
          const baseline = patientBaselineInstructorRef.current
          if (baseline && settingChanged(currentScenario.patient[trigger.parameter], baseline[trigger.parameter])) return true
        }
        if (trigger.actor === 'candidate' || trigger.actor === 'either') return sessionMembers.some((member) => {
          if (member.role !== 'candidate') return false
          const baseline = patientBaselineCandidatesRef.current.get(member.id)
          const settings = member.patient_settings as Partial<PatientSettings>
          return Boolean(baseline && settings && (trigger.parameter in settings) && settingChanged(settings[trigger.parameter], baseline[trigger.parameter]))
        })
        return false
      }
      const duration = stageTransitionDuration(activeStage, 'ventilator', String(trigger.parameter))
      if (scenarioElapsedSeconds - activeDynamicStageStartedAt < duration) return false
      if (selfDirectedRun) {
        const baseline = actionBaselineInstructorRef.current
        return (trigger.actor === 'candidate' || trigger.actor === 'either') && Boolean(baseline && settingChanged(currentScenario.ventilator[trigger.parameter], baseline[trigger.parameter]))
      }
      if (trigger.actor === 'instructor' || trigger.actor === 'either') {
        const baseline = actionBaselineInstructorRef.current
        if (baseline && settingChanged(currentScenario.ventilator[trigger.parameter], baseline[trigger.parameter])) return true
      }
      if (trigger.actor === 'candidate' || trigger.actor === 'either') return sessionMembers.some((member) => {
        if (member.role !== 'candidate') return false
        const baseline = actionBaselineCandidatesRef.current.get(member.id)
        const settings = member.ventilator_settings as Partial<VentilatorSettings>
        return Boolean(baseline && settings && (trigger.parameter in settings) && settingChanged(settings[trigger.parameter], baseline[trigger.parameter]))
      })
      return false
    }

    const resolution = resolveTeachingScenarioTransition({
      stageTriggers: dynamicStageTriggers(activeStage).filter((trigger) => trigger.type !== 'manual'),
      branches: (activeRuntimePreset.scenario.branches ?? []).filter((branch) => branch.fromStageId === activeStage?.id),
      triggerMatches,
    })
    if (!resolution) return
    automaticAdvanceLockRef.current = true
    if (resolution.kind === 'branch') {
      const target = stages.findIndex((stage) => stage.id === resolution.toStageId)
      if (target >= 0) loadDynamicStage(activeRuntimePreset, target, 'automatic')
      else automaticAdvanceLockRef.current = false
      return
    }
    loadDynamicStage(activeRuntimePreset, activeDynamicStage + 1, 'automatic')
  }, [role, activeRuntimePreset, activeDynamicStage, activeDynamicStageStartedAt, scenarioElapsedSeconds, physiologyMeasurements, currentScenario.ventilator, currentScenario.patient, sessionMembers, selfDirectedRun, selfDirectedQuestionAnswer, scenarioPromptRuntime.responses, scenarioActionEvent])
`

text = text.slice(0, start) + prefix + replacement + text.slice(nextEffect)
fs.writeFileSync(path, text)
console.log('EDUVENT scenario transition orchestration moved to shared resolver')
