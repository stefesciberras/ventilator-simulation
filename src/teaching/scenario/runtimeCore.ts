import { useCallback, useMemo, useRef, useState } from 'react'

export interface TeachingScenarioStage<TSnapshot, TTrigger> {
  id: string
  name: string
  snapshot: TSnapshot
  triggers: TTrigger[]
}

export interface TeachingScenarioDefinition<TSnapshot, TTrigger> {
  id: string
  name: string
  description?: string
  stages: Array<TeachingScenarioStage<TSnapshot, TTrigger>>
}

export type TeachingScenarioRuntimeStatus = 'idle' | 'running' | 'complete'

export interface TeachingScenarioRuntimeSnapshot {
  scenarioId: string
  stageIndex: number
  stageStartedSimulationTime: number
  status: Exclude<TeachingScenarioRuntimeStatus, 'idle'>
}

export interface TeachingScenarioStageContext<TSnapshot, TTrigger> {
  scenario: TeachingScenarioDefinition<TSnapshot, TTrigger>
  stage: TeachingScenarioStage<TSnapshot, TTrigger>
  stageIndex: number
  stageStartedSimulationTime: number
}

export interface TeachingScenarioRuntimeAdapter<TSnapshot, TTrigger, TContext> {
  applyStage: (snapshot: TSnapshot, context: TeachingScenarioStageContext<TSnapshot, TTrigger>) => void | Promise<void>
  triggerMatches: (trigger: TTrigger, context: TContext, stage: TeachingScenarioStageContext<TSnapshot, TTrigger>) => boolean
}

/**
 * Product-neutral scenario sequencer. Simulation products provide only two
 * adapters: how a stage snapshot is applied, and how their trigger vocabulary
 * is evaluated. The runtime owns stage position, stage timing, manual advance,
 * completion, and durable reconstruction metadata.
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

  const evaluate = useCallback(async (context: TContext, simulationTime: number) => {
    if (!scenario || !stage || status !== 'running' || transitionBusyRef.current) return false
    const stageContext: TeachingScenarioStageContext<TSnapshot, TTrigger> = {
      scenario,
      stage,
      stageIndex,
      stageStartedSimulationTime,
    }
    if (!stage.triggers.some((trigger) => adapter.triggerMatches(trigger, context, stageContext))) return false
    return advance(simulationTime)
  }, [adapter, advance, scenario, stage, stageIndex, stageStartedSimulationTime, status])

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
    return {
      scenarioId: scenario.id,
      stageIndex,
      stageStartedSimulationTime,
      status,
    }
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
    evaluate,
    restore,
  }
}
