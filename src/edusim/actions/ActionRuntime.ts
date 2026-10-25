import { registerSimulationDiagnosticProvider } from '../../core/SimulationDiagnostics'
import {
  DEFAULT_EDUSIM_ACTION_PRIORITY,
  type EdusimActionEffect,
  type EdusimActionEffectTarget,
} from './ActionEffect'

export interface EdusimActionRuntimeDefinition {
  id: string
  name?: string
  kind?: 'drug' | 'event'
  short_press_action: 'momentary' | 'toggle'
  effects: EdusimActionEffect[]
  priority?: number
}

export interface ActiveEffect {
  instanceId: string
  actionId: string
  actionName?: string
  actionKind?: 'drug' | 'event'
  mode: 'momentary' | 'toggle'
  intensity: number
  effect: EdusimActionEffect
  startedAtSimulationTime: number
  stoppedAtSimulationTime?: number
}

export type ActionRuntimeLogType = 'activate' | 'deactivate' | 'intensity' | 'supersede-target' | 'clear'

export interface ActionRuntimeLogEntry {
  sequence: number
  simulationTime: number
  type: ActionRuntimeLogType
  actionId?: string
  actionName?: string
  actionKind?: 'drug' | 'event'
  mode?: 'momentary' | 'toggle'
  intensity?: number
  target?: EdusimActionEffectTarget
  effectIds?: string[]
  affectedActionIds?: string[]
}

export interface ActionRuntimeSnapshot {
  simulationTime: number
  activeEffects: ActiveEffect[]
}

const MAX_ACTION_LOG_ENTRIES = 500
let simulationTime = 0
let sequence = 0
let logSequence = 0
let activeEffects: ActiveEffect[] = []
let actionLog: ActionRuntimeLogEntry[] = []

const clamp01 = (value: number) => Math.max(0, Math.min(1, value))
const normaliseIntensity = (value: number) => Number.isFinite(value) ? Math.max(0, value) : 1
const releaseBehaviour = (active: ActiveEffect) => active.effect.releaseBehaviour ?? 'recover'
const effectPriority = (effect: EdusimActionEffect) => Number.isFinite(effect.priority) ? Number(effect.priority) : DEFAULT_EDUSIM_ACTION_PRIORITY

function appendActionLog(entry: Omit<ActionRuntimeLogEntry, 'sequence'>): void {
  actionLog = [...actionLog, { ...entry, sequence: ++logSequence }].slice(-MAX_ACTION_LOG_ENTRIES)
}

function effectLifetime(effect: EdusimActionEffect): number {
  return Math.max(0, effect.onsetSeconds) + Math.max(0, effect.durationSeconds) + Math.max(0, effect.recoverySeconds)
}

export function setActionRuntimeSimulationTime(value: number): void {
  if (!Number.isFinite(value)) return
  simulationTime = Math.max(0, value)
  activeEffects = activeEffects.filter((active) => {
    if (active.mode === 'toggle') {
      if (active.stoppedAtSimulationTime == null) return true
      if (releaseBehaviour(active) === 'persist') return true
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

    const weightAtStop = runningToggleWeight(active, stop)
    if (releaseBehaviour(active) === 'persist') return weightAtStop

    const recovery = Math.max(0, active.effect.recoverySeconds)
    if (recovery <= 0) return 0
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

export function activateAction(
  definition: EdusimActionRuntimeDefinition,
  atSimulationTime = simulationTime,
  intensity = 1,
): ActiveEffect[] {
  setActionRuntimeSimulationTime(atSimulationTime)
  const resolvedIntensity = normaliseIntensity(intensity)

  if (definition.short_press_action === 'toggle') {
    const running = activeEffects.filter((active) => active.actionId === definition.id && active.mode === 'toggle' && active.stoppedAtSimulationTime == null)
    if (running.length > 0) {
      activeEffects = activeEffects.map((active) => running.includes(active)
        ? { ...active, stoppedAtSimulationTime: atSimulationTime }
        : active)
      appendActionLog({
        simulationTime: atSimulationTime,
        type: 'deactivate',
        actionId: definition.id,
        actionName: definition.name,
        actionKind: definition.kind,
        mode: definition.short_press_action,
        effectIds: running.map((active) => active.effect.id),
      })
      return []
    }
  }

  const actionPriority = Number.isFinite(definition.priority) ? Number(definition.priority) : DEFAULT_EDUSIM_ACTION_PRIORITY
  const created = definition.effects.map((effect) => ({
    instanceId: `${definition.id}:${effect.id}:${++sequence}`,
    actionId: definition.id,
    actionName: definition.name,
    actionKind: definition.kind,
    mode: definition.short_press_action,
    intensity: resolvedIntensity,
    effect: { ...effect, priority: Number.isFinite(effect.priority) ? effect.priority : actionPriority },
    startedAtSimulationTime: atSimulationTime,
  }))
  activeEffects = [...activeEffects, ...created]
  appendActionLog({
    simulationTime: atSimulationTime,
    type: 'activate',
    actionId: definition.id,
    actionName: definition.name,
    actionKind: definition.kind,
    mode: definition.short_press_action,
    intensity: resolvedIntensity,
    effectIds: definition.effects.map((effect) => effect.id),
  })
  return created
}

export function setActionIntensity(actionId: string, intensity: number): void {
  const nextIntensity = normaliseIntensity(intensity)
  const running = activeEffects.filter((active) => active.actionId === actionId && active.mode === 'toggle' && active.stoppedAtSimulationTime == null)
  if (running.length === 0) return
  activeEffects = activeEffects.map((active) => running.includes(active)
    ? { ...active, intensity: nextIntensity }
    : active)
  appendActionLog({
    simulationTime,
    type: 'intensity',
    actionId,
    actionName: running[0]?.actionName,
    actionKind: running[0]?.actionKind,
    mode: 'toggle',
    intensity: nextIntensity,
    effectIds: running.map((active) => active.effect.id),
  })
}

export function deactivateAction(actionId: string): void {
  const running = activeEffects.filter((active) => active.actionId === actionId && active.mode === 'toggle' && active.stoppedAtSimulationTime == null)
  if (running.length === 0) return
  activeEffects = activeEffects.map((active) => running.includes(active)
    ? { ...active, stoppedAtSimulationTime: simulationTime }
    : active)
  appendActionLog({
    simulationTime,
    type: 'deactivate',
    actionId,
    actionName: running[0]?.actionName,
    actionKind: running[0]?.actionKind,
    mode: 'toggle',
    effectIds: running.map((active) => active.effect.id),
  })
}

/**
 * Instructor ownership of a physiological target wins over every action priority.
 * Removing only this target leaves unrelated effects of the same action running.
 */
export function supersedeActionTarget(target: EdusimActionEffectTarget): number {
  const affected = activeEffects.filter((active) => active.effect.target === target)
  if (affected.length === 0) return 0
  activeEffects = activeEffects.filter((active) => active.effect.target !== target)
  appendActionLog({
    simulationTime,
    type: 'supersede-target',
    target,
    affectedActionIds: [...new Set(affected.map((active) => active.actionId))],
    effectIds: affected.map((active) => active.effect.id),
  })
  return affected.length
}

export function clearActionRuntime(): void {
  if (activeEffects.length > 0) {
    appendActionLog({
      simulationTime,
      type: 'clear',
      affectedActionIds: [...new Set(activeEffects.map((active) => active.actionId))],
      effectIds: activeEffects.map((active) => active.effect.id),
    })
  }
  activeEffects = []
  sequence = 0
}

export function clearActionRuntimeLog(): void {
  actionLog = []
  logSequence = 0
}

export function getActiveEffects(atSimulationTime = simulationTime): ActiveEffect[] {
  setActionRuntimeSimulationTime(atSimulationTime)
  return [...activeEffects]
}

export function getActionRuntimeLog(): ActionRuntimeLogEntry[] {
  return actionLog.map((entry) => ({
    ...entry,
    effectIds: entry.effectIds ? [...entry.effectIds] : undefined,
    affectedActionIds: entry.affectedActionIds ? [...entry.affectedActionIds] : undefined,
  }))
}

export function getActionRuntimeSnapshot(atSimulationTime = simulationTime): ActionRuntimeSnapshot {
  return { simulationTime: atSimulationTime, activeEffects: getActiveEffects(atSimulationTime) }
}

export function getActionRuntimeDiagnostics(atSimulationTime = simulationTime): Record<string, unknown> {
  const effects = getActiveEffects(atSimulationTime)
  return {
    simulationTime: atSimulationTime,
    activeEffects: effects.map((active) => ({
      ...active,
      currentWeight: actionEffectWeight(active, atSimulationTime),
    })),
    history: getActionRuntimeLog(),
  }
}

function applyConstraint(value: number, baseValue: number, active: ActiveEffect, weight: number): number {
  const effect = active.effect
  const strength = clamp01(weight * normaliseIntensity(active.intensity))
  if (!effect.constraint || strength <= 0) return value

  switch (effect.constraint) {
    case 'block-increase': {
      const excess = Math.max(0, value - baseValue)
      return value - excess * strength
    }
    case 'block-decrease': {
      const deficit = Math.max(0, baseValue - value)
      return value + deficit * strength
    }
    case 'minimum': {
      if (value >= effect.value) return value
      return value + (effect.value - value) * strength
    }
    case 'maximum': {
      if (value <= effect.value) return value
      return value + (effect.value - value) * strength
    }
  }
}

export function resolveNumericActionEffect(
  target: EdusimActionEffectTarget,
  baseValue: number,
  atSimulationTime = simulationTime,
): number {
  let value = baseValue
  const candidates = getActiveEffects(atSimulationTime)
    .filter((active) => active.effect.target === target)
    .sort((a, b) => {
      const priorityDifference = effectPriority(a.effect) - effectPriority(b.effect)
      if (priorityDifference !== 0) return priorityDifference
      const aConstraint = a.effect.operation === 'constraint' ? 1 : 0
      const bConstraint = b.effect.operation === 'constraint' ? 1 : 0
      if (aConstraint !== bConstraint) return aConstraint - bConstraint
      return a.startedAtSimulationTime - b.startedAtSimulationTime || a.instanceId.localeCompare(b.instanceId)
    })

  for (const active of candidates) {
    const weight = actionEffectWeight(active, atSimulationTime)
    if (weight <= 0) continue
    const intensity = normaliseIntensity(active.intensity)
    const effect = active.effect
    switch (effect.operation) {
      case 'offset':
      case 'increment':
        value += effect.value * weight * intensity
        break
      case 'multiplier':
        value *= 1 + (effect.value - 1) * weight * intensity
        break
      case 'target':
      case 'set':
        value += (effect.value - value) * clamp01(weight * intensity)
        break
      case 'constraint':
        value = applyConstraint(value, baseValue, active, weight)
        break
      case 'trigger':
        break
    }
  }
  return value
}

registerSimulationDiagnosticProvider('actions', () => getActionRuntimeDiagnostics())
