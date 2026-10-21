import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { SessionRole } from '../session/useTeachingSession'
import type { SessionMemberRow } from '../session/supabase'
import type { PatientSettings, VentilatorSettings } from '../simulation/types'
import type { PhysiologicalMeasurements } from '../physiologyMeasurements'
import {
  applyDynamicStage,
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
import { SharedScenarioRuntimePanel } from '../teaching/scenario/SharedScenarioRuntimePanel'
import { useTeachingScenarioRuntime, type TeachingScenarioDefinition, type TeachingScenarioStageContent } from '../teaching/scenario/runtimeCore'

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
    peakPressure: measurements.peakPressure, plateauPressure: measurements.plateauPressure, meanPressure: measurements.meanPressure,
    totalPeep: measurements.measuredPeep, autoPeep: measurements.autoPeep, expiredTidalVolume: measurements.expiredTidalVolume,
    totalRespiratoryRate: measurements.totalRespiratoryRate, actualMinuteVentilation: measurements.actualMinuteVentilation,
    alveolarMinuteVentilation: measurements.alveolarMinuteVentilation, endTidalCO2: measurements.endTidalCO2,
    oxygenSaturation: measurements.oxygenSaturation, drivingPressure: measurements.drivingPressure,
  }
  const value = mapping[metric]
  return value != null && Number.isFinite(value) ? value : null
}
function conditionMatches(actual: number, operator: 'lt' | 'eq' | 'gt', target: number) {
  if (operator === 'lt') return actual < target
  if (operator === 'gt') return actual > target
  return Math.abs(actual - target) <= Math.max(0.1, Math.abs(target) * 0.005)
}
function changed(a: unknown, b: unknown) { return typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) > 1e-6 : a !== b }
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
  return {
    id: preset.id,
    name: preset.name,
    description: preset.scenario.description,
    stages: stages.map((stage, index) => ({
      id: stage.id ?? `${preset.id}:stage:${index}`,
      name: stage.name || `Stage ${index + 1}`,
      snapshot: stage,
      triggers: dynamicStageTriggers(stage),
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
  const currentRef = useRef(options.currentScenario); currentRef.current = options.currentScenario
  const roleRef = useRef(options.role); roleRef.current = options.role
  const membersRef = useRef(options.sessionMembers); membersRef.current = options.sessionMembers
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

  const adapter = useMemo(() => ({
    applyStage: async (stage: DynamicScenarioStage, context: { stageIndex: number; stageStartedSimulationTime: number }) => {
      const next = applyDynamicStage(currentRef.current, stage)
      options.onLoadScenario(next, { pauseSimulation: false, resetScenarioClock: context.stageIndex === 0, stageTransition: context.stageIndex > 0 ? stage : undefined })
      ventInstructorBaselineRef.current = { ...next.ventilator }
      patientInstructorBaselineRef.current = { ...next.patient }
      ventCandidateBaselineRef.current = new Map(membersRef.current.filter((m) => m.role === 'candidate').flatMap((m) => {
        const settings = m.ventilator_settings as Partial<VentilatorSettings>; return settings && Object.keys(settings).length ? [[m.id, { ...settings } as VentilatorSettings] as const] : []
      }))
      patientCandidateBaselineRef.current = new Map(membersRef.current.filter((m) => m.role === 'candidate').flatMap((m) => {
        const settings = m.patient_settings as Partial<PatientSettings>; return settings && Object.keys(settings).length ? [[m.id, { ...settings } as PatientSettings] as const] : []
      }))
      localActionBaselineRef.current = options.scenarioActionEvent?.sequence ?? 0
      candidateActionBaselineRef.current = new Map(membersRef.current.filter((m) => m.role === 'candidate').map((m) => [m.id, m.scenario_action_revision ?? 0]))
    },
    triggerMatches: (trigger: DynamicScenarioTrigger, ctx: RuntimeContext, stageCtx: { stage: { snapshot: DynamicScenarioStage }; stageStartedSimulationTime: number }) => {
      const stage = stageCtx.stage.snapshot
      if (trigger.type === 'manual') return false
      if (trigger.type === 'time') return ctx.simulationTime - stageCtx.stageStartedSimulationTime >= Math.max(1, trigger.seconds)
      if (trigger.type === 'condition') { const actual = metricValue(ctx.measurements, trigger.metric); return actual != null && conditionMatches(actual, trigger.operator, trigger.value) }
      if (trigger.type === 'question-any') return ctx.questionAnswered || prompts.responses.length > 0
      if (trigger.type === 'question-correct') return ctx.questionCorrect || Boolean(stage.question?.correctOptionId && prompts.responses.some((response) => response.option_id === stage.question?.correctOptionId))
      if (trigger.type === 'device-action') {
        if ((trigger.actor === 'instructor' || trigger.actor === 'either') && ctx.localAction && ctx.localAction.sequence > localActionBaselineRef.current && ctx.localAction.action === trigger.action) return true
        if (trigger.actor === 'candidate' || trigger.actor === 'either') return ctx.members.some((m) => m.role === 'candidate' && (m.scenario_action_revision ?? 0) > (candidateActionBaselineRef.current.get(m.id) ?? 0) && m.last_scenario_action === trigger.action)
        return false
      }
      const group = trigger.type === 'patient-change' ? 'patient' : 'ventilator'
      const parameter = trigger.parameter as string
      if (ctx.simulationTime - stageCtx.stageStartedSimulationTime < transitionDuration(stage, group, parameter)) return false
      if (group === 'patient') {
        if (trigger.actor === 'instructor' || trigger.actor === 'either') { const base = patientInstructorBaselineRef.current; if (base && changed(ctx.current.patient[trigger.parameter as keyof PatientSettings], base[trigger.parameter as keyof PatientSettings])) return true }
        if (trigger.actor === 'candidate' || trigger.actor === 'either') return ctx.members.some((m) => { const base = patientCandidateBaselineRef.current.get(m.id); const settings = m.patient_settings as Partial<PatientSettings>; return m.role === 'candidate' && Boolean(base && settings && trigger.parameter in settings && changed(settings[trigger.parameter as keyof PatientSettings], base[trigger.parameter as keyof PatientSettings])) })
        return false
      }
      if (trigger.actor === 'instructor' || trigger.actor === 'either') { const base = ventInstructorBaselineRef.current; if (base && changed(ctx.current.ventilator[trigger.parameter as keyof VentilatorSettings], base[trigger.parameter as keyof VentilatorSettings])) return true }
      if (trigger.actor === 'candidate' || trigger.actor === 'either') return ctx.members.some((m) => { const base = ventCandidateBaselineRef.current.get(m.id); const settings = m.ventilator_settings as Partial<VentilatorSettings>; return m.role === 'candidate' && Boolean(base && settings && trigger.parameter in settings && changed(settings[trigger.parameter as keyof VentilatorSettings], base[trigger.parameter as keyof VentilatorSettings])) })
      return false
    },
  }), [options.onLoadScenario, options.scenarioActionEvent?.sequence, prompts.responses])
  const runtime = useTeachingScenarioRuntime<DynamicScenarioStage, DynamicScenarioTrigger, RuntimeContext>(adapter)

  const start = async (preset: InstructorPresetRow) => {
    const definition = definitionFor(preset)
    if (!definition.stages.length) return
    setActivePreset(preset); setSelfDirectedRun(null); setQuestionState({ answered: false, correct: false })
    if (options.role === 'standalone') await options.onStartInstructorSession(applyDynamicStage(options.currentScenario, definition.stages[0].snapshot))
    await runtime.start(definition, options.role === 'standalone' ? 0 : options.scenarioElapsedSeconds)
    options.onDynamicScenarioStarted?.()
  }

  useEffect(() => {
    if (runtime.status !== 'running') return
    void runtime.evaluate({ current: options.currentScenario, measurements: options.physiologyMeasurements, members: options.sessionMembers, simulationTime: options.scenarioElapsedSeconds, localAction: options.scenarioActionEvent ?? null, questionAnswered: questionState.answered, questionCorrect: questionState.correct }, options.scenarioElapsedSeconds)
  }, [runtime.status, runtime.stageIndex, options.currentScenario, options.physiologyMeasurements, options.sessionMembers, options.scenarioElapsedSeconds, options.scenarioActionEvent, questionState])

  useEffect(() => {
    const stage = runtime.stage?.snapshot
    setQuestionState({ answered: false, correct: false }); setMediaUrl(null)
    if (!stage) return
    const type = stage.stageType ?? 'controls'
    if (selfDirectedRun && type === 'media' && stage.media?.mediaId) {
      let cancelled = false
      void listCaseMediaByIds([stage.media.mediaId]).then((rows) => { if (!rows[0]) throw new Error('Scenario media is no longer available.'); return createCaseMediaSignedUrl(rows[0].storage_path, 3600) }).then((url) => { if (!cancelled) setMediaUrl(url) }).catch(() => undefined)
      return () => { cancelled = true }
    }
    if (!selfDirectedRun && options.role === 'instructor' && options.sessionId) {
      if (type === 'media' && stage.media?.mediaId) void releaseSessionCaseMedia(options.sessionId, stage.media.mediaId).then(() => mediaPresentation.present(stage.media!.mediaId)).catch(() => undefined)
      if (type === 'question' && stage.question) void prompts.presentPrompt({ kind: stage.question.kind, title: stage.question.title ?? '', body: stage.question.body, options: stage.question.options, correctOptionId: stage.question.correctOptionId, explanation: stage.question.explanation }).catch(() => undefined)
    }
  }, [runtime.stageIndex, activePreset?.id, selfDirectedRun?.runId, options.role, options.sessionId])

  useEffect(() => {
    if (options.role !== 'standalone' || selfDirectedRun) return
    const code = new URL(window.location.href).searchParams.get('assignment'); if (!code) return
    let cancelled = false
    void startSelfDirectedRun(code).then(async (run) => {
      if (cancelled) return
      const preset: InstructorPresetRow = { id: `self-directed:${run.runId}`, instructor_id: '', name: run.title, scenario: run.scenario, created_at: '', updated_at: '' }
      setSelfDirectedRun(run); setActivePreset(preset); await runtime.start(definitionFor(preset), 0); options.onDynamicScenarioStarted?.()
    }).catch((cause) => { if (!cancelled) { setSelfDirectedError(cause instanceof Error ? cause.message : 'Unable to start this self-directed scenario.'); options.onDynamicScenarioStarted?.() } })
    return () => { cancelled = true }
  }, [options.role])

  useEffect(() => { if (selfDirectedRun && runtime.status !== 'idle') void updateSelfDirectedRun(selfDirectedRun.runId, runtime.stageIndex, runtime.status === 'complete').catch(() => undefined) }, [selfDirectedRun?.runId, runtime.stageIndex, runtime.status])

  useEffect(() => {
    if (!options.onScenarioDiagnosticChange) return
    if (!activePreset || !runtime.stage || runtime.status === 'idle') { options.onScenarioDiagnosticChange(null); return }
    options.onScenarioDiagnosticChange({ scenarioId: activePreset.id, scenarioName: activePreset.name, description: activePreset.scenario.description ?? '', schemaVersion: activePreset.scenario.schemaVersion ?? null, stageIndex: runtime.stageIndex, stageName: runtime.stage.name, stageStartedAtSeconds: runtime.stageStartedSimulationTime, triggers: runtime.stage.triggers, scenario: activePreset.scenario })
  }, [activePreset, runtime.stageIndex, runtime.stageStartedSimulationTime, runtime.status, options.onScenarioDiagnosticChange])

  const close = () => { runtime.stop(); setActivePreset(null); setSelfDirectedRun(null); setSelfDirectedError(null); const url = new URL(window.location.href); if (url.searchParams.has('assignment')) { url.searchParams.delete('assignment'); window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`) } }
  const runtimePanel = activePreset && runtime.stage && runtime.status !== 'idle' ? <SharedScenarioRuntimePanel scenarioName={activePreset.name} stageName={runtime.stage.name} stageNumber={runtime.stageIndex + 1} stageCount={runtime.scenario?.stages.length ?? 0} notes={runtime.stage.notes} content={runtime.stage.content?.kind === 'media' && mediaUrl ? contentFor(runtime.stage.snapshot, mediaUrl) : runtime.stage.content} manualAdvanceAvailable={runtime.stage.triggers.some((t) => t.type === 'manual')} onAdvance={() => runtime.advance(options.scenarioElapsedSeconds)} onQuestionResult={(answered, correct) => setQuestionState({ answered, correct })} onClose={close} /> : null

  return {
    activePreset,
    runtime,
    start,
    close,
    runtimeNode: options.runtimeHost && runtimePanel ? createPortal(runtimePanel, options.runtimeHost) : runtimePanel,
    selfDirectedError,
  }
}
