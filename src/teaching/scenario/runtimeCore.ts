import { useCallback, useMemo, useRef, useState } from 'react'
import type {
  ScenarioBranch,
  ScenarioDefinition,
  ScenarioMediaContent,
  ScenarioQuestionContent,
  ScenarioRuntimeAdapter,
  ScenarioStage,
  ScenarioStageContent,
  ScenarioStageContext,
  ScenarioTransition,
} from './domain'

export type TeachingScenarioMediaContent = ScenarioMediaContent
export type TeachingScenarioQuestionContent = ScenarioQuestionContent
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
}

export type TeachingScenarioTransitionResolution =
  | { kind: 'branch'; toStageId: string }
  | { kind: 'advance' }
  | null

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
  const transitionBusyRef = useRef(false)

  const stage = scenario?.stages[stageIndex] ?? null

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
    setScenario(definition)
    setStageIndex(index)
    setStageStartedSimulationTime(simulationTime)
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
    setStatus('idle')
    transitionBusyRef.current = false
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

  const evaluate = useCallback(async (context: TContext, simulationTime: number) => {
    if (!scenario || !stage || status !== 'running' || transitionBusyRef.current) return false
    const stageContext: TeachingScenarioStageContext<TSnapshot, TTrigger> = {
      scenario,
      stage,
      stageIndex,
      stageStartedSimulationTime,
    }
    const triggerMatches = (trigger: TTrigger) => adapter.triggerMatches(trigger, context, stageContext)
    const outgoingBranches = (scenario.branches ?? []).filter((branch) => !branch.fromStageId || branch.fromStageId === stage.id)
    const resolution = resolveTeachingScenarioTransition({ stageTriggers: stage.triggers, branches: outgoingBranches, triggerMatches })
    if (!resolution) return false
    if (resolution.kind === 'branch') return goToStage(resolution.toStageId, simulationTime)
    return advance(simulationTime)
  }, [adapter, advance, goToStage, scenario, stage, stageIndex, stageStartedSimulationTime, status])

  const restore = useCallback(async (
    definition: TeachingScenarioDefinition<TSnapshot, TTrigger>,
    snapshot: TeachingScenarioRuntimeSnapshot,
  ) => {
    if (snapshot.scenarioId !== definition.id) throw new Error('Scenario runtime snapshot does not match this scenario.')
    const safeIndex = Math.max(0, Math.min(definition.stages.length - 1, snapshot.stageIndex))
    const restored = await applyStageAt(definition, safeIndex, snapshot.stageStartedSimulationTime)
    if (restored && snapshot.status === 'complete') setStatus('complete')
    return restored
  }, [applyStageAt])

  const runtimeSnapshot = useMemo<TeachingScenarioRuntimeSnapshot | null>(() => {
    if (!scenario || status === 'idle') return null
    return { scenarioId: scenario.id, stageIndex, stageStartedSimulationTime, status }
  }, [scenario, stageIndex, stageStartedSimulationTime, status])

  return {
    scenario,
    stage,
    stageIndex,
    stageStartedSimulationTime,
    status,
    runtimeSnapshot,
    start,
    stop,
    advance,
    goToStage,
    evaluate,
    restore,
  }
}
