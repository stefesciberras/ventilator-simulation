import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  ScenarioBranch,
  ScenarioDefinition,
  ScenarioMediaContent,
  ScenarioQuestionContent,
  ScenarioQuestionOption,
  ScenarioRuntimeAdapter,
  ScenarioStage,
  ScenarioStageContent,
  ScenarioStageContext,
  ScenarioTransition,
} from './domain'
import { setScenarioRuntimeTriggerInfo, type ScenarioRuntimeTriggerInfo } from './runtimeUiState'

export type TeachingScenarioMediaContent = ScenarioMediaContent
export type TeachingScenarioQuestionContent = ScenarioQuestionContent
export type TeachingScenarioQuestionOption = ScenarioQuestionOption
export type TeachingScenarioStageContent = ScenarioStageContent
export type TeachingScenarioTransition = ScenarioTransition
export type TeachingScenarioStage<TSnapshot, TTrigger> = ScenarioStage<TSnapshot, TTrigger>
export type TeachingScenarioBranch<TTrigger> = ScenarioBranch<TTrigger>
export type TeachingScenarioDefinition<TSnapshot, TTrigger> = ScenarioDefinition<TSnapshot, TTrigger>
export type TeachingScenarioStageContext<TSnapshot, TTrigger> = ScenarioStageContext<TSnapshot, TTrigger>
export type TeachingScenarioRuntimeAdapter<TSnapshot, TTrigger, TContext> = ScenarioRuntimeAdapter<TSnapshot, TTrigger, TContext>

export type TeachingScenarioRuntimeStatus = 'idle' | 'running' | 'complete'

export interface TeachingScenarioRuntimeSnapshot {
  scenarioId: string
  stageIndex: number
  stageStartedSimulationTime: number
  status: Exclude<TeachingScenarioRuntimeStatus, 'idle'>
  timeTriggerPaused?: boolean
  timeTriggerPauseStartedSimulationTime?: number | null
}

interface PersistedTeachingScenarioRuntime<TSnapshot, TTrigger> {
  scenario: TeachingScenarioDefinition<TSnapshot, TTrigger>
  snapshot: TeachingScenarioRuntimeSnapshot
}

export type TeachingScenarioTransitionResolution =
  | { kind: 'branch'; toStageId: string }
  | { kind: 'advance' }
  | null

const runtimePersistenceKey = () => {
  if (typeof window === 'undefined') return null
  return `loppjusim.scenario-runtime:${window.location.pathname}`
}

function humaniseIdentifier(value: unknown) {
  return String(value ?? '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[-_.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^./, (letter) => letter.toUpperCase())
}

function actorSuffix(trigger: Record<string, unknown>) {
  const actor = trigger.actor
  if (typeof actor !== 'string' || !actor) return ''
  return ` · ${humaniseIdentifier(actor)}`
}

function isTimeTrigger(trigger: unknown) {
  return Boolean(trigger && typeof trigger === 'object' && String((trigger as Record<string, unknown>).type ?? '') === 'time')
}

function describeTrigger(
  trigger: unknown,
  id: string,
  targetLabel: string | undefined,
  timing: {
    stageStartedSimulationTime: number
    currentSimulationTime: number
    paused: boolean
    onTogglePause: () => void
  },
): ScenarioRuntimeTriggerInfo | null {
  if (!trigger || typeof trigger !== 'object') return null
  const value = trigger as Record<string, unknown>
  const type = String(value.type ?? '')
  if (!type || type === 'manual') return null

  let label = humaniseIdentifier(type)
  let detail = ''
  if (type === 'time') {
    const durationSeconds = Math.max(0, Number(value.seconds ?? 0) || 0)
    const elapsedSeconds = Math.max(0, timing.currentSimulationTime - timing.stageStartedSimulationTime)
    const remainingSeconds = Math.max(0, durationSeconds - elapsedSeconds)
    return {
      id,
      label: 'Time elapsed',
      detail: targetLabel ? `→ ${targetLabel}` : 'Automatic advance',
      kind: 'time',
      remainingSeconds,
      paused: timing.paused,
      onTogglePause: timing.onTogglePause,
    }
  } else if (type === 'condition') {
    label = 'Measurement condition'
    const operator = value.operator === 'lt' ? '<' : value.operator === 'gt' ? '>' : '='
    detail = `${humaniseIdentifier(value.metric)} ${operator} ${String(value.value ?? '')}`
  } else if (type === 'patient-change') {
    label = 'Patient parameter changed'
    detail = `${humaniseIdentifier(value.parameter)}${actorSuffix(value)}`
  } else if (type === 'parameter-change') {
    label = 'Parameter changed'
    detail = `${humaniseIdentifier(value.parameterId ?? value.snapshotPath)}${actorSuffix(value)}`
  } else if (type === 'action') {
    label = 'Ventilator parameter changed'
    detail = `${humaniseIdentifier(value.parameter)}${actorSuffix(value)}`
  } else if (type === 'device-action') {
    label = 'Device action'
    detail = `${humaniseIdentifier(value.action)}${actorSuffix(value)}`
  } else if (type === 'edusim-action') {
    label = 'Drug / event action'
    detail = `${humaniseIdentifier(value.actionId)}${actorSuffix(value)}`
  } else if (type === 'question-any') {
    label = 'Question answered'
    detail = 'Any answer'
  } else if (type === 'question-correct') {
    label = 'Question answered'
    detail = 'Correct answer'
  } else if (type === 'media-ended') {
    label = 'Media finished'
    detail = 'Playback ended'
  } else if (type === 'media-acknowledged') {
    label = 'Media acknowledged'
    detail = 'Acknowledgement received'
  }

  if (targetLabel) detail = detail ? `${detail} → ${targetLabel}` : `→ ${targetLabel}`
  return { id, label, detail, kind: 'informational' }
}

/** Branches take priority over linear advancement; product adapters own trigger semantics. */
export function resolveTeachingScenarioTransition<TTrigger>({
  stageTriggers,
  branches = [],
  triggerMatches,
}: {
  stageTriggers: readonly TTrigger[]
  branches?: readonly TeachingScenarioBranch<TTrigger>[]
  triggerMatches: (trigger: TTrigger) => boolean
}): TeachingScenarioTransitionResolution {
  const matchedBranch = [...branches]
    .filter((branch) => branch.enabled !== false)
    .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0))
    .find((branch) => {
      const triggers = branch.triggers?.length ? branch.triggers : branch.trigger != null ? [branch.trigger] : []
      if (!triggers.length) return false
      return branch.triggerMode === 'all' ? triggers.every(triggerMatches) : triggers.some(triggerMatches)
    })
  if (matchedBranch) return { kind: 'branch', toStageId: matchedBranch.toStageId }
  return stageTriggers.some(triggerMatches) ? { kind: 'advance' } : null
}

/**
 * Product-neutral scenario sequencer. It owns stage order, branching, stage
 * timing and durable reconstruction; products only apply snapshots and match
 * their trigger vocabulary.
 */
export function useTeachingScenarioRuntime<TSnapshot, TTrigger, TContext>(
  adapter: TeachingScenarioRuntimeAdapter<TSnapshot, TTrigger, TContext>,
) {
  const [scenario, setScenario] = useState<TeachingScenarioDefinition<TSnapshot, TTrigger> | null>(null)
  const [stageIndex, setStageIndex] = useState(0)
  const [stageStartedSimulationTime, setStageStartedSimulationTime] = useState(0)
  const [status, setStatus] = useState<TeachingScenarioRuntimeStatus>('idle')
  const [persistenceReady, setPersistenceReady] = useState(false)
  const [timeTriggerPaused, setTimeTriggerPaused] = useState(false)
  const [timeTriggerPauseStartedSimulationTime, setTimeTriggerPauseStartedSimulationTime] = useState<number | null>(null)
  const transitionBusyRef = useRef(false)
  const restoreAttemptedRef = useRef(false)
  const latestSimulationTimeRef = useRef(0)
  const stageStartedSimulationTimeRef = useRef(0)

  const stage = scenario?.stages[stageIndex] ?? null

  useEffect(() => {
    stageStartedSimulationTimeRef.current = stageStartedSimulationTime
  }, [stageStartedSimulationTime])

  const applyStageAt = useCallback(async (
    definition: TeachingScenarioDefinition<TSnapshot, TTrigger>,
    index: number,
    simulationTime: number,
  ) => {
    const nextStage = definition.stages[index]
    if (!nextStage) return false
    const stageContext: TeachingScenarioStageContext<TSnapshot, TTrigger> = {
      scenario: definition,
      stage: nextStage,
      stageIndex: index,
      stageStartedSimulationTime: simulationTime,
    }
    await adapter.applyStage(nextStage.snapshot, stageContext)
    latestSimulationTimeRef.current = simulationTime
    stageStartedSimulationTimeRef.current = simulationTime
    setScenario(definition)
    setStageIndex(index)
    setStageStartedSimulationTime(simulationTime)
    setTimeTriggerPaused(false)
    setTimeTriggerPauseStartedSimulationTime(null)
    setStatus('running')
    return true
  }, [adapter])

  const start = useCallback(async (definition: TeachingScenarioDefinition<TSnapshot, TTrigger>, simulationTime: number) => {
    if (!definition.stages.length) throw new Error('Scenario has no stages.')
    return applyStageAt(definition, 0, simulationTime)
  }, [applyStageAt])

  const stop = useCallback(() => {
    setScenario(null)
    setStageIndex(0)
    setStageStartedSimulationTime(0)
    stageStartedSimulationTimeRef.current = 0
    setStatus('idle')
    setTimeTriggerPaused(false)
    setTimeTriggerPauseStartedSimulationTime(null)
    transitionBusyRef.current = false
    setScenarioRuntimeTriggerInfo([])
    const key = runtimePersistenceKey()
    if (key) {
      try { window.localStorage.removeItem(key) } catch { /* optional persistence */ }
    }
  }, [])

  const advance = useCallback(async (simulationTime: number) => {
    if (!scenario || status !== 'running' || transitionBusyRef.current) return false
    const nextIndex = stageIndex + 1
    if (nextIndex >= scenario.stages.length) {
      setStatus('complete')
      return true
    }
    transitionBusyRef.current = true
    try {
      return await applyStageAt(scenario, nextIndex, simulationTime)
    } finally {
      transitionBusyRef.current = false
    }
  }, [applyStageAt, scenario, stageIndex, status])

  const goToStage = useCallback(async (stageId: string, simulationTime: number) => {
    if (!scenario || status !== 'running' || transitionBusyRef.current) return false
    const index = scenario.stages.findIndex((candidate) => candidate.id === stageId)
    if (index < 0) return false
    transitionBusyRef.current = true
    try {
      return await applyStageAt(scenario, index, simulationTime)
    } finally {
      transitionBusyRef.current = false
    }
  }, [applyStageAt, scenario, status])

  const toggleTimeTriggerPause = useCallback(() => {
    const now = latestSimulationTimeRef.current
    if (timeTriggerPaused) {
      const pauseStarted = timeTriggerPauseStartedSimulationTime ?? now
      const pausedDuration = Math.max(0, now - pauseStarted)
      const adjustedStageStart = stageStartedSimulationTimeRef.current + pausedDuration
      stageStartedSimulationTimeRef.current = adjustedStageStart
      setStageStartedSimulationTime(adjustedStageStart)
      setTimeTriggerPaused(false)
      setTimeTriggerPauseStartedSimulationTime(null)
      return
    }
    setTimeTriggerPauseStartedSimulationTime(now)
    setTimeTriggerPaused(true)
  }, [timeTriggerPaused, timeTriggerPauseStartedSimulationTime])

  const publishTriggerInfo = useCallback((simulationTime: number) => {
    if (!scenario || !stage || status === 'idle') {
      setScenarioRuntimeTriggerInfo([])
      return
    }
    const effectiveSimulationTime = timeTriggerPaused && timeTriggerPauseStartedSimulationTime != null
      ? timeTriggerPauseStartedSimulationTime
      : simulationTime
    const timing = {
      stageStartedSimulationTime,
      currentSimulationTime: effectiveSimulationTime,
      paused: timeTriggerPaused,
      onTogglePause: toggleTimeTriggerPause,
    }
    const info: ScenarioRuntimeTriggerInfo[] = []
    stage.triggers.forEach((trigger, index) => {
      const described = describeTrigger(trigger, `stage:${stage.id}:${index}`, undefined, timing)
      if (described) info.push(described)
    })
    ;(scenario.branches ?? [])
      .filter((branch) => branch.enabled !== false && (!branch.fromStageId || branch.fromStageId === stage.id))
      .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0))
      .forEach((branch, branchIndex) => {
        const branchTriggers = branch.triggers?.length ? branch.triggers : branch.trigger != null ? [branch.trigger] : []
        const targetLabel = scenario.stages.find((candidate) => candidate.id === branch.toStageId)?.name
        branchTriggers.forEach((trigger, triggerIndex) => {
          const described = describeTrigger(trigger, `branch:${branch.id ?? branchIndex}:${triggerIndex}`, targetLabel, timing)
          if (described) info.push(described)
        })
      })
    setScenarioRuntimeTriggerInfo(info)
  }, [scenario, stage, status, stageStartedSimulationTime, timeTriggerPaused, timeTriggerPauseStartedSimulationTime, toggleTimeTriggerPause])

  const evaluate = useCallback(async (context: TContext, simulationTime: number) => {
    latestSimulationTimeRef.current = simulationTime
    publishTriggerInfo(simulationTime)
    if (!scenario || !stage || status !== 'running' || transitionBusyRef.current) return false
    const stageContext: TeachingScenarioStageContext<TSnapshot, TTrigger> = {
      scenario,
      stage,
      stageIndex,
      stageStartedSimulationTime,
    }
    const triggerMatches = (trigger: TTrigger) => {
      if (timeTriggerPaused && isTimeTrigger(trigger)) return false
      return adapter.triggerMatches(trigger, context, stageContext)
    }
    const outgoingBranches = (scenario.branches ?? []).filter((branch) => !branch.fromStageId || branch.fromStageId === stage.id)
    const resolution = resolveTeachingScenarioTransition({ stageTriggers: stage.triggers, branches: outgoingBranches, triggerMatches })
    if (!resolution) return false
    if (resolution.kind === 'branch') return goToStage(resolution.toStageId, simulationTime)
    return advance(simulationTime)
  }, [adapter, advance, goToStage, publishTriggerInfo, scenario, stage, stageIndex, stageStartedSimulationTime, status, timeTriggerPaused])

  const restore = useCallback(async (
    definition: TeachingScenarioDefinition<TSnapshot, TTrigger>,
    snapshot: TeachingScenarioRuntimeSnapshot,
  ) => {
    if (snapshot.scenarioId !== definition.id) throw new Error('Scenario runtime snapshot does not match this scenario.')
    const safeIndex = Math.max(0, Math.min(definition.stages.length - 1, snapshot.stageIndex))
    const restored = await applyStageAt(definition, safeIndex, snapshot.stageStartedSimulationTime)
    if (restored) {
      setTimeTriggerPaused(Boolean(snapshot.timeTriggerPaused))
      setTimeTriggerPauseStartedSimulationTime(snapshot.timeTriggerPauseStartedSimulationTime ?? null)
      if (snapshot.status === 'complete') setStatus('complete')
    }
    return restored
  }, [applyStageAt])

  const runtimeSnapshot = useMemo<TeachingScenarioRuntimeSnapshot | null>(() => {
    if (!scenario || status === 'idle') return null
    return {
      scenarioId: scenario.id,
      stageIndex,
      stageStartedSimulationTime,
      status,
      timeTriggerPaused,
      timeTriggerPauseStartedSimulationTime,
    }
  }, [scenario, stageIndex, stageStartedSimulationTime, status, timeTriggerPaused, timeTriggerPauseStartedSimulationTime])

  useEffect(() => {
    publishTriggerInfo(latestSimulationTimeRef.current)
    return () => setScenarioRuntimeTriggerInfo([])
  }, [publishTriggerInfo])

  useEffect(() => {
    if (restoreAttemptedRef.current) return
    restoreAttemptedRef.current = true
    const key = runtimePersistenceKey()
    if (!key) { setPersistenceReady(true); return }
    let persisted: PersistedTeachingScenarioRuntime<TSnapshot, TTrigger> | null = null
    try {
      const raw = window.localStorage.getItem(key)
      persisted = raw ? JSON.parse(raw) as PersistedTeachingScenarioRuntime<TSnapshot, TTrigger> : null
    } catch {
      persisted = null
    }
    if (!persisted?.scenario?.stages?.length || !persisted.snapshot) {
      setPersistenceReady(true)
      return
    }
    let cancelled = false
    void restore(persisted.scenario, persisted.snapshot)
      .catch(() => {
        try { window.localStorage.removeItem(key) } catch { /* optional persistence */ }
      })
      .finally(() => { if (!cancelled) setPersistenceReady(true) })
    return () => { cancelled = true }
  }, [restore])

  useEffect(() => {
    if (!persistenceReady) return
    const key = runtimePersistenceKey()
    if (!key) return
    if (!scenario || !runtimeSnapshot) {
      try { window.localStorage.removeItem(key) } catch { /* optional persistence */ }
      return
    }
    try {
      const persisted: PersistedTeachingScenarioRuntime<TSnapshot, TTrigger> = { scenario, snapshot: runtimeSnapshot }
      window.localStorage.setItem(key, JSON.stringify(persisted))
    } catch {
      // Runtime persistence is best-effort; simulation must continue if storage is unavailable.
    }
  }, [persistenceReady, runtimeSnapshot, scenario])

  return {
    scenario,
    stage,
    stageIndex,
    stageStartedSimulationTime,
    status,
    runtimeSnapshot,
    timeTriggerPaused,
    start,
    stop,
    advance,
    goToStage,
    evaluate,
    restore,
  }
}
