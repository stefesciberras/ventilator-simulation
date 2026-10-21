import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { SessionRole } from '../session/useTeachingSession'
import type { SessionMemberRow } from '../session/supabase'
import type { PatientSettings, VentilatorSettings } from '../simulation/types'
import type { PhysiologicalMeasurements } from '../physiologyMeasurements'
import {
  applyDynamicStage,
  dynamicBranchTriggers,
  dynamicStageTriggers,
  type DynamicScenarioActionId,
  type DynamicScenarioMetric,
  type DynamicScenarioStage,
  type DynamicScenarioTrigger,
  type InstructorPresetRow,
  type InstructorScenarioSnapshot,
} from '../instructorAccount'
import { startSelfDirectedRun, updateSelfDirectedRun, type SelfDirectedRunStart } from '../selfDirectedAssignments'
import { createCaseMediaSignedUrl, listCaseMediaByIds, releaseSessionCaseMedia } from '../caseMedia'
import { eduventTeachingHost, useTeachingPrompts } from '../teaching'
import { useTeachingMediaPresentation } from '../teaching/TeachingMediaPresentation'
import { SharedScenarioRuntimePanel, type SharedScenarioBranchAction } from '../teaching/scenario/SharedScenarioRuntimePanel'
import {
  useTeachingScenarioRuntime,
  type TeachingScenarioDefinition,
  type TeachingScenarioRuntimeAdapter,
  type TeachingScenarioStageContent,
} from '../teaching/scenario/runtimeCore'

export interface EduventDynamicScenarioDiagnosticContext {
  scenarioId: string
  scenarioName: string
  description: string
  schemaVersion: number | null
  stageIndex: number
  stageName: string
  stageStartedAtSeconds: number
  triggers: DynamicScenarioTrigger[]
  scenario: InstructorScenarioSnapshot
}

interface RuntimeContext {
  current: InstructorScenarioSnapshot
  measurements: PhysiologicalMeasurements
  members: SessionMemberRow[]
  simulationTime: number
  localAction: { action: DynamicScenarioActionId; sequence: number } | null
  questionAnswered: boolean
  questionCorrect: boolean
}

function metricValue(measurements: PhysiologicalMeasurements, metric: DynamicScenarioMetric): number | null {
  const mapping: Record<DynamicScenarioMetric, number | null> = {
    peakPressure: measurements.peakPressure,
    plateauPressure: measurements.plateauPressure,
    meanPressure: measurements.meanPressure,
    totalPeep: measurements.measuredPeep,
    autoPeep: measurements.autoPeep,
    expiredTidalVolume: measurements.expiredTidalVolume,
    totalRespiratoryRate: measurements.totalRespiratoryRate,
    actualMinuteVentilation: measurements.actualMinuteVentilation,
    alveolarMinuteVentilation: measurements.alveolarMinuteVentilation,
    endTidalCO2: measurements.endTidalCO2,
    oxygenSaturation: measurements.oxygenSaturation,
    drivingPressure: measurements.drivingPressure,
  }
  const value = mapping[metric]
  return value != null && Number.isFinite(value) ? value : null
}

function conditionMatches(actual: number, operator: 'lt' | 'eq' | 'gt', target: number) {
  if (operator === 'lt') return actual < target
  if (operator === 'gt') return actual > target
  return Math.abs(actual - target) <= Math.max(0.1, Math.abs(target) * 0.005)
}

function settingChanged(a: unknown, b: unknown) {
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) > 1e-6
  return a !== b
}

function transitionDuration(stage: DynamicScenarioStage, group: 'ventilator' | 'patient', parameter: string) {
  const overrides = stage.transitionOverrides?.[group] as Record<string, { mode: 'immediate' } | { mode: 'linear'; durationSeconds: number }> | undefined
  const policy = overrides?.[parameter] ?? stage.transition ?? { mode: 'immediate' as const }
  return policy.mode === 'linear' ? Math.max(0, policy.durationSeconds) : 0
}

function contentFor(stage: DynamicScenarioStage, mediaUrl?: string | null): TeachingScenarioStageContent {
  const type = stage.stageType ?? 'controls'
  if (type === 'media' && stage.media) return { kind: 'media', media: { ...stage.media, storagePath: mediaUrl ?? stage.media.storagePath } }
  if (type === 'question' && stage.question) return { kind: 'question', question: stage.question }
  return { kind: 'state' }
}

function definitionFor(preset: InstructorPresetRow): TeachingScenarioDefinition<DynamicScenarioStage, DynamicScenarioTrigger> {
  const stages = preset.scenario.stages ?? []
  const pathDriven = (preset.scenario.schemaVersion ?? 0) >= 9
  return {
    id: preset.id,
    name: preset.name,
    description: preset.scenario.description,
    stages: stages.map((stage, index) => ({
      id: stage.id ?? `${preset.id}:stage:${index}`,
      name: stage.name || `Stage ${index + 1}`,
      snapshot: stage,
      triggers: pathDriven ? [] : dynamicStageTriggers(stage),
      notes: stage.comment,
      content: contentFor(stage),
    })),
    branches: (preset.scenario.branches ?? []).map((branch) => ({ ...branch })),
  }
}

export interface EduventScenarioRuntimeOptions {
  role: SessionRole
  sessionId: string | null
  currentScenario: InstructorScenarioSnapshot
  onLoadScenario: (scenario: InstructorScenarioSnapshot, options?: { pauseSimulation?: boolean; resetScenarioClock?: boolean; stageTransition?: DynamicScenarioStage }) => void
  physiologyMeasurements: PhysiologicalMeasurements
  scenarioElapsedSeconds: number
  sessionMembers: SessionMemberRow[]
  runtimeHost: HTMLElement | null
  onStartInstructorSession: (scenario?: InstructorScenarioSnapshot) => Promise<void>
  onDynamicScenarioStarted?: () => void
  onScenarioDiagnosticChange?: (context: EduventDynamicScenarioDiagnosticContext | null) => void
  scenarioActionEvent?: { action: DynamicScenarioActionId; sequence: number } | null
}

export function useEduventInstructorScenarioRuntime(options: EduventScenarioRuntimeOptions) {
  const currentRef = useRef(options.currentScenario)
  currentRef.current = options.currentScenario
  const membersRef = useRef(options.sessionMembers)
  membersRef.current = options.sessionMembers
  const selfDirectedRef = useRef(false)
  const localActionBaselineRef = useRef(0)
  const candidateActionBaselineRef = useRef(new Map<string, number>())
  const ventInstructorBaselineRef = useRef<VentilatorSettings | null>(null)
  const ventCandidateBaselineRef = useRef(new Map<string, VentilatorSettings>())
  const patientInstructorBaselineRef = useRef<PatientSettings | null>(null)
  const patientCandidateBaselineRef = useRef(new Map<string, PatientSettings>())
  const [activePreset, setActivePreset] = useState<InstructorPresetRow | null>(null)
  const [selfDirectedRun, setSelfDirectedRun] = useState<SelfDirectedRunStart | null>(null)
  const [selfDirectedError, setSelfDirectedError] = useState<string | null>(null)
  const [mediaUrl, setMediaUrl] = useState<string | null>(null)
  const [questionState, setQuestionState] = useState({ answered: false, correct: false })
  const prompts = useTeachingPrompts(options.role, options.sessionId, eduventTeachingHost)
  const mediaPresentation = useTeachingMediaPresentation(options.role, options.sessionId)
  selfDirectedRef.current = Boolean(selfDirectedRun)

  const adapter = useMemo<TeachingScenarioRuntimeAdapter<DynamicScenarioStage, DynamicScenarioTrigger, RuntimeContext>>(() => ({
    applyStage: async (stage, context) => {
      const next = applyDynamicStage(currentRef.current, stage)
      options.onLoadScenario(next, {
        pauseSimulation: false,
        resetScenarioClock: context.stageIndex === 0,
        stageTransition: context.stageIndex > 0 ? stage : undefined,
      })
      ventInstructorBaselineRef.current = { ...next.ventilator }
      patientInstructorBaselineRef.current = { ...next.patient }
      ventCandidateBaselineRef.current = new Map(membersRef.current.filter((member) => member.role === 'candidate').flatMap((member) => {
        const settings = member.ventilator_settings as Partial<VentilatorSettings>
        return settings && Object.keys(settings).length ? [[member.id, { ...settings } as VentilatorSettings] as const] : []
      }))
      patientCandidateBaselineRef.current = new Map(membersRef.current.filter((member) => member.role === 'candidate').flatMap((member) => {
        const settings = member.patient_settings as Partial<PatientSettings>
        return settings && Object.keys(settings).length ? [[member.id, { ...settings } as PatientSettings] as const] : []
      }))
      localActionBaselineRef.current = options.scenarioActionEvent?.sequence ?? 0
      candidateActionBaselineRef.current = new Map(membersRef.current.filter((member) => member.role === 'candidate').map((member) => [member.id, member.scenario_action_revision ?? 0]))
    },
    triggerMatches: (trigger, ctx, stageContext) => {
      const stage = stageContext.stage.snapshot
      const selfDirected = selfDirectedRef.current
      if (trigger.type === 'manual') return false
      if (trigger.type === 'time') return ctx.simulationTime - stageContext.stageStartedSimulationTime >= Math.max(1, trigger.seconds)
      if (trigger.type === 'condition') {
        const actual = metricValue(ctx.measurements, trigger.metric)
        return actual != null && conditionMatches(actual, trigger.operator, trigger.value)
      }
      if (trigger.type === 'question-any') return selfDirected ? ctx.questionAnswered : (ctx.questionAnswered || prompts.responses.length > 0)
      if (trigger.type === 'question-correct') {
        if (selfDirected) return ctx.questionCorrect
        return ctx.questionCorrect || Boolean(stage.question?.correctOptionId && prompts.responses.some((response) => response.option_id === stage.question?.correctOptionId))
      }
      if (trigger.type === 'device-action') {
        const localActionMatches = Boolean(ctx.localAction && ctx.localAction.sequence > localActionBaselineRef.current && ctx.localAction.action === trigger.action)
        if (selfDirected) return (trigger.actor === 'candidate' || trigger.actor === 'either') && localActionMatches
        if ((trigger.actor === 'instructor' || trigger.actor === 'either') && localActionMatches) return true
        if (trigger.actor === 'candidate' || trigger.actor === 'either') {
          return ctx.members.some((member) => member.role === 'candidate' && (member.scenario_action_revision ?? 0) > (candidateActionBaselineRef.current.get(member.id) ?? 0) && member.last_scenario_action === trigger.action)
        }
        return false
      }

      const group = trigger.type === 'patient-change' ? 'patient' : 'ventilator'
      const parameter = trigger.parameter as string
      if (ctx.simulationTime - stageContext.stageStartedSimulationTime < transitionDuration(stage, group, parameter)) return false

      if (group === 'patient') {
        const key = trigger.parameter as keyof PatientSettings
        const localBaseline = patientInstructorBaselineRef.current
        const localChanged = Boolean(localBaseline && settingChanged(ctx.current.patient[key], localBaseline[key]))
        if (selfDirected) return (trigger.actor === 'candidate' || trigger.actor === 'either') && localChanged
        if ((trigger.actor === 'instructor' || trigger.actor === 'either') && localChanged) return true
        if (trigger.actor === 'candidate' || trigger.actor === 'either') {
          return ctx.members.some((member) => {
            if (member.role !== 'candidate') return false
            const baseline = patientCandidateBaselineRef.current.get(member.id)
            const settings = member.patient_settings as Partial<PatientSettings>
            return Boolean(baseline && settings && key in settings && settingChanged(settings[key], baseline[key]))
          })
        }
        return false
      }

      const key = trigger.parameter as keyof VentilatorSettings
      const localBaseline = ventInstructorBaselineRef.current
      const localChanged = Boolean(localBaseline && settingChanged(ctx.current.ventilator[key], localBaseline[key]))
      if (selfDirected) return (trigger.actor === 'candidate' || trigger.actor === 'either') && localChanged
      if ((trigger.actor === 'instructor' || trigger.actor === 'either') && localChanged) return true
      if (trigger.actor === 'candidate' || trigger.actor === 'either') {
        return ctx.members.some((member) => {
          if (member.role !== 'candidate') return false
          const baseline = ventCandidateBaselineRef.current.get(member.id)
          const settings = member.ventilator_settings as Partial<VentilatorSettings>
          return Boolean(baseline && settings && key in settings && settingChanged(settings[key], baseline[key]))
        })
      }
      return false
    },
  }), [options.onLoadScenario, options.scenarioActionEvent?.sequence, prompts.responses])

  const runtime = useTeachingScenarioRuntime<DynamicScenarioStage, DynamicScenarioTrigger, RuntimeContext>(adapter)

  const start = async (preset: InstructorPresetRow) => {
    const definition = definitionFor(preset)
    if (!definition.stages.length) return
    setActivePreset(preset)
    setSelfDirectedRun(null)
    selfDirectedRef.current = false
    setQuestionState({ answered: false, correct: false })
    if (options.role === 'standalone') {
      await options.onStartInstructorSession(applyDynamicStage(options.currentScenario, definition.stages[0].snapshot))
    }
    await runtime.start(definition, options.role === 'standalone' ? 0 : options.scenarioElapsedSeconds)
    options.onDynamicScenarioStarted?.()
  }

  useEffect(() => {
    if (runtime.status !== 'running') return
    void runtime.evaluate({
      current: options.currentScenario,
      measurements: options.physiologyMeasurements,
      members: options.sessionMembers,
      simulationTime: options.scenarioElapsedSeconds,
      localAction: options.scenarioActionEvent ?? null,
      questionAnswered: questionState.answered,
      questionCorrect: questionState.correct,
    }, options.scenarioElapsedSeconds)
  }, [runtime.status, runtime.stageIndex, options.currentScenario, options.physiologyMeasurements, options.sessionMembers, options.scenarioElapsedSeconds, options.scenarioActionEvent, questionState])

  useEffect(() => {
    const stage = runtime.stage?.snapshot
    setQuestionState({ answered: false, correct: false })
    setMediaUrl(null)
    if (!stage) return
    const type = stage.stageType ?? 'controls'
    if (selfDirectedRun && type === 'media' && stage.media?.mediaId) {
      let cancelled = false
      void listCaseMediaByIds([stage.media.mediaId])
        .then((rows) => {
          if (!rows[0]) throw new Error('Scenario media is no longer available.')
          return createCaseMediaSignedUrl(rows[0].storage_path, 3600)
        })
        .then((url) => { if (!cancelled) setMediaUrl(url) })
        .catch(() => undefined)
      return () => { cancelled = true }
    }
    if (!selfDirectedRun && options.role === 'instructor' && options.sessionId) {
      if (type === 'media' && stage.media?.mediaId) {
        void releaseSessionCaseMedia(options.sessionId, stage.media.mediaId)
          .then(() => mediaPresentation.present(stage.media!.mediaId))
          .catch(() => undefined)
      } else if (mediaPresentation.activePresentation) {
        void mediaPresentation.close().catch(() => undefined)
      }
      if (type === 'question' && stage.question) {
        void prompts.presentPrompt({
          kind: stage.question.kind,
          title: stage.question.title ?? '',
          body: stage.question.body,
          options: stage.question.options,
          correctOptionId: stage.question.correctOptionId,
          explanation: stage.question.explanation,
        }).catch(() => undefined)
      } else if (prompts.activePrompt) {
        void prompts.closePrompt().catch(() => undefined)
      }
    }
  }, [runtime.stageIndex, activePreset?.id, selfDirectedRun?.runId, options.role, options.sessionId])

  useEffect(() => {
    if (options.role !== 'standalone' || selfDirectedRun) return
    const code = new URL(window.location.href).searchParams.get('assignment')
    if (!code) return
    let cancelled = false
    void startSelfDirectedRun(code).then(async (run) => {
      if (cancelled) return
      const preset: InstructorPresetRow = {
        id: `self-directed:${run.runId}`,
        instructor_id: '',
        name: run.title,
        scenario: run.scenario,
        created_at: '',
        updated_at: '',
      }
      selfDirectedRef.current = true
      setSelfDirectedRun(run)
      setActivePreset(preset)
      await runtime.start(definitionFor(preset), 0)
      options.onDynamicScenarioStarted?.()
    }).catch((cause) => {
      if (cancelled) return
      setSelfDirectedError(cause instanceof Error ? cause.message : 'Unable to start this self-directed scenario.')
      options.onDynamicScenarioStarted?.()
    })
    return () => { cancelled = true }
  }, [options.role])

  useEffect(() => {
    if (!selfDirectedRun || runtime.status === 'idle' || !runtime.scenario || !runtime.stage) return
    const pathDriven = (activePreset?.scenario.schemaVersion ?? 0) >= 9
    const outgoing = (runtime.scenario.branches ?? []).filter((branch) => branch.enabled !== false && branch.fromStageId === runtime.stage?.id)
    const completed = runtime.status === 'complete' || (pathDriven ? outgoing.length === 0 : runtime.stageIndex >= runtime.scenario.stages.length - 1)
    void updateSelfDirectedRun(selfDirectedRun.runId, runtime.stageIndex, completed).catch(() => undefined)
  }, [selfDirectedRun?.runId, runtime.stageIndex, runtime.status, runtime.scenario, runtime.stage?.id, activePreset?.scenario.schemaVersion])

  useEffect(() => {
    if (!options.onScenarioDiagnosticChange) return
    if (!activePreset || !runtime.stage || runtime.status === 'idle') {
      options.onScenarioDiagnosticChange(null)
      return
    }
    options.onScenarioDiagnosticChange({
      scenarioId: activePreset.id,
      scenarioName: activePreset.name,
      description: activePreset.scenario.description ?? '',
      schemaVersion: activePreset.scenario.schemaVersion ?? null,
      stageIndex: runtime.stageIndex,
      stageName: runtime.stage.name,
      stageStartedAtSeconds: runtime.stageStartedSimulationTime,
      triggers: runtime.stage.triggers,
      scenario: activePreset.scenario,
    })
  }, [activePreset, runtime.stageIndex, runtime.stageStartedSimulationTime, runtime.status, options.onScenarioDiagnosticChange])

  useEffect(() => () => options.onScenarioDiagnosticChange?.(null), [options.onScenarioDiagnosticChange])

  const close = () => {
    runtime.stop()
    setActivePreset(null)
    setSelfDirectedRun(null)
    selfDirectedRef.current = false
    setSelfDirectedError(null)
    const url = new URL(window.location.href)
    if (url.searchParams.has('assignment')) {
      url.searchParams.delete('assignment')
      window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
    }
  }

  const currentStageId = runtime.stage?.id
  const branchActions = useMemo<SharedScenarioBranchAction[]>(() => {
    if (!runtime.scenario || !currentStageId) return []
    return (runtime.scenario.branches ?? [])
      .filter((branch) => branch.enabled !== false && branch.fromStageId === currentStageId && dynamicBranchTriggers(branch).some((trigger) => trigger.type === 'manual'))
      .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0))
      .map((branch, index) => ({
        id: branch.id ?? `${currentStageId}:branch:${index}`,
        label: branch.label?.trim() || 'Choose path',
        targetLabel: runtime.scenario?.stages.find((stage) => stage.id === branch.toStageId)?.name,
        onSelect: async () => { await runtime.goToStage(branch.toStageId, options.scenarioElapsedSeconds) },
      }))
  }, [runtime.scenario, currentStageId, options.scenarioElapsedSeconds])

  const previousStage = runtime.scenario && runtime.stageIndex > 0 ? runtime.scenario.stages[runtime.stageIndex - 1] : null
  const pathDriven = (activePreset?.scenario.schemaVersion ?? 0) >= 9
  const outgoingPaths = runtime.scenario && currentStageId ? (runtime.scenario.branches ?? []).filter((branch) => branch.enabled !== false && branch.fromStageId === currentStageId) : []
  const finalStage = Boolean(runtime.scenario && (pathDriven ? outgoingPaths.length === 0 : runtime.stageIndex >= runtime.scenario.stages.length - 1))
  const runtimePanel = activePreset && runtime.stage && runtime.status !== 'idle' ? <SharedScenarioRuntimePanel
    scenarioName={activePreset.name}
    stageName={runtime.stage.name}
    stageNumber={runtime.stageIndex + 1}
    stageCount={runtime.scenario?.stages.length ?? 0}
    notes={runtime.stage.notes}
    content={runtime.stage.content?.kind === 'media' && mediaUrl ? contentFor(runtime.stage.snapshot, mediaUrl) : runtime.stage.content}
    manualAdvanceAvailable={!pathDriven && !finalStage && runtime.stage.triggers.some((trigger) => trigger.type === 'manual')}
    onAdvance={async () => { await runtime.advance(options.scenarioElapsedSeconds) }}
    previousAvailable={Boolean(previousStage) && options.role === 'instructor'}
    onPrevious={previousStage ? async () => { await runtime.goToStage(previousStage.id, options.scenarioElapsedSeconds) } : undefined}
    branchActions={branchActions}
    onQuestionResult={(answered, correct) => setQuestionState({ answered, correct })}
    onClose={close}
  /> : null

  return {
    activePreset,
    runtime,
    start,
    close,
    runtimeNode: options.runtimeHost && runtimePanel ? createPortal(runtimePanel, options.runtimeHost) : runtimePanel,
    selfDirectedError,
  }
}
