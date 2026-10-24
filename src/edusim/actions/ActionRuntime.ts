import type { EdusimActionEffect, EdusimActionEffectTarget } from './ActionEffect'

export interface EdusimActionRuntimeDefinition {
  id: string
  short_press_action: 'momentary' | 'toggle'
  effects: EdusimActionEffect[]
}

export interface ActiveEffect {
  instanceId: string
  actionId: string
  mode: 'momentary' | 'toggle'
  effect: EdusimActionEffect
  startedAtSimulationTime: number
  stoppedAtSimulationTime?: number
}

export interface ActionRuntimeSnapshot {
  simulationTime: number
  activeEffects: ActiveEffect[]
}

let simulationTime = 0
let sequence = 0
let activeEffects: ActiveEffect[] = []

const clamp01 = (value: number) => Math.max(0, Math.min(1, value))

function effectLifetime(effect: EdusimActionEffect): number {
  return Math.max(0, effect.onsetSeconds) + Math.max(0, effect.durationSeconds) + Math.max(0, effect.recoverySeconds)
}

export function setActionRuntimeSimulationTime(value: number): void {
  if (!Number.isFinite(value)) return
  simulationTime = Math.max(0, value)
  activeEffects = activeEffects.filter((active) => {
    if (active.mode === 'toggle') {
      if (active.stoppedAtSimulationTime == null) return true
      return simulationTime <= active.stoppedAtSimulationTime + Math.max(0, active.effect.recoverySeconds)
    }
    return simulationTime <= active.startedAtSimulationTime + effectLifetime(active.effect)
  })
}

export function getActionRuntimeSimulationTime(): number {
  return simulationTime
}

function runningToggleWeight(active: ActiveEffect, atSimulationTime: number): number {
  const elapsed = Math.max(0, atSimulationTime - active.startedAtSimulationTime)
  const onset = Math.max(0, active.effect.onsetSeconds)
  if (onset > 0 && elapsed < onset) return clamp01(elapsed / onset)
  return 1
}

export function actionEffectWeight(active: ActiveEffect, atSimulationTime = simulationTime): number {
  if (active.mode === 'toggle') {
    const stop = active.stoppedAtSimulationTime
    if (stop == null || atSimulationTime <= stop) return runningToggleWeight(active, atSimulationTime)

    const recovery = Math.max(0, active.effect.recoverySeconds)
    if (recovery <= 0) return 0
    const weightAtStop = runningToggleWeight(active, stop)
    return weightAtStop * clamp01(1 - ((atSimulationTime - stop) / recovery))
  }

  const elapsed = Math.max(0, atSimulationTime - active.startedAtSimulationTime)
  const onset = Math.max(0, active.effect.onsetSeconds)
  const duration = Math.max(0, active.effect.durationSeconds)
  const recovery = Math.max(0, active.effect.recoverySeconds)

  if (onset > 0 && elapsed < onset) return clamp01(elapsed / onset)
  const afterOnset = elapsed - onset
  if (afterOnset <= duration) return 1
  if (recovery <= 0) return 0
  return clamp01(1 - (afterOnset - duration) / recovery)
}

export function activateAction(definition: EdusimActionRuntimeDefinition, atSimulationTime = simulationTime): ActiveEffect[] {
  setActionRuntimeSimulationTime(atSimulationTime)

  if (definition.short_press_action === 'toggle') {
    const running = activeEffects.filter((active) => active.actionId === definition.id && active.mode === 'toggle' && active.stoppedAtSimulationTime == null)
    if (running.length > 0) {
      activeEffects = activeEffects.map((active) => running.includes(active)
        ? { ...active, stoppedAtSimulationTime: atSimulationTime }
        : active)
      return []
    }
  }

  const created = definition.effects.map((effect) => ({
    instanceId: `${definition.id}:${effect.id}:${++sequence}`,
    actionId: definition.id,
    mode: definition.short_press_action,
    effect,
    startedAtSimulationTime: atSimulationTime,
  }))
  activeEffects = [...activeEffects, ...created]
  return created
}

export function deactivateAction(actionId: string): void {
  activeEffects = activeEffects.map((active) => active.actionId === actionId && active.mode === 'toggle' && active.stoppedAtSimulationTime == null
    ? { ...active, stoppedAtSimulationTime: simulationTime }
    : active)
}

export function clearActionRuntime(): void {
  activeEffects = []
  sequence = 0
}

export function getActiveEffects(atSimulationTime = simulationTime): ActiveEffect[] {
  setActionRuntimeSimulationTime(atSimulationTime)
  return [...activeEffects]
}

export function getActionRuntimeSnapshot(atSimulationTime = simulationTime): ActionRuntimeSnapshot {
  return { simulationTime: atSimulationTime, activeEffects: getActiveEffects(atSimulationTime) }
}

export function resolveNumericActionEffect(
  target: EdusimActionEffectTarget,
  baseValue: number,
  atSimulationTime = simulationTime,
): number {
  let value = baseValue
  const candidates = getActiveEffects(atSimulationTime)
    .filter((active) => active.effect.target === target)
    .sort((a, b) => a.startedAtSimulationTime - b.startedAtSimulationTime || a.instanceId.localeCompare(b.instanceId))

  for (const active of candidates) {
    const weight = actionEffectWeight(active, atSimulationTime)
    if (weight <= 0) continue
    const effect = active.effect
    switch (effect.operation) {
      case 'offset':
      case 'increment':
        value += effect.value * weight
        break
      case 'multiplier':
        value *= 1 + (effect.value - 1) * weight
        break
      case 'target':
      case 'set':
        value += (effect.value - value) * weight
        break
      case 'trigger':
        break
    }
  }
  return value
}
