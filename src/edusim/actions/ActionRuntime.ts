import type { EdusimActionEffect, EdusimActionEffectTarget } from './ActionEffect'

export interface EdusimActionRuntimeDefinition {
  id: string
  short_press_action: 'momentary' | 'toggle'
  effects: EdusimActionEffect[]
}

export interface ActiveEffect {
  instanceId: string
  actionId: string
  effect: EdusimActionEffect
  startedAtSimulationTime: number
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
  activeEffects = activeEffects.filter((active) => simulationTime <= active.startedAtSimulationTime + effectLifetime(active.effect))
}

export function getActionRuntimeSimulationTime(): number {
  return simulationTime
}

export function actionEffectWeight(active: ActiveEffect, atSimulationTime = simulationTime): number {
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
    const alreadyActive = activeEffects.some((active) => active.actionId === definition.id)
    if (alreadyActive) {
      activeEffects = activeEffects.filter((active) => active.actionId !== definition.id)
      return []
    }
  }

  const created = definition.effects.map((effect) => ({
    instanceId: `${definition.id}:${effect.id}:${++sequence}`,
    actionId: definition.id,
    effect,
    startedAtSimulationTime: atSimulationTime,
  }))
  activeEffects = [...activeEffects, ...created]
  return created
}

export function deactivateAction(actionId: string): void {
  activeEffects = activeEffects.filter((active) => active.actionId !== actionId)
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
