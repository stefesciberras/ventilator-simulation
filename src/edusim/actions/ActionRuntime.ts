import { registerSimulationDiagnosticProvider } from '../../core/SimulationDiagnostics'
import { recordSessionLogEvent } from '../../teaching/session/sessionLog'
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

export interface ActiveToggleAction {
  actionId: string
  actionName?: string
  actionKind?: 'drug' | 'event'
  intensity: number
  startedAtSimulationTime: number
  effectIds: string[]
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
  activeToggleActions: ActiveToggleAction[]
}

const MAX_ACTION_LOG_ENTRIES = 500
let simulationTime = 0
let sequence = 0
let logSequence = 0
let activeEffects: ActiveEffect[] = []
let activeToggleActions: ActiveToggleAction[] = []
let actionLog: ActionRuntimeLogEntry[] = []
const runtimeListeners = new Set<() => void>()

const clamp01 = (value: number) => Math.max(0, Math.min(1, value))
const normaliseIntensity = (value: number) => Number.isFinite(value) ? Math.max(0, value) : 1
const releaseBehaviour = (active: ActiveEffect) => active.effect.releaseBehaviour ?? 'recover'
const effectPriority = (effect: EdusimActionEffect) => Number.isFinite(effect.priority) ? Number(effect.priority) : DEFAULT_EDUSIM_ACTION_PRIORITY

function notifyActionRuntime(): void {
  for (const listener of runtimeListeners) listener()
}

export function subscribeToActionRuntime(listener: () => void): () => void {
  runtimeListeners.add(listener)
  return () => runtimeListeners.delete(listener)
}

function appendActionLog(entry: Omit<ActionRuntimeLogEntry, 'sequence'>): void {
  actionLog = [...actionLog, { ...entry, sequence: ++logSequence }].slice(-MAX_ACTION_LOG_ENTRIES)

  if (!entry.actionKind || !entry.actionId || !['activate', 'deactivate', 'intensity'].includes(entry.type)) return
  const name = entry.actionName ?? entry.actionId
  const category = entry.actionKind === 'drug' ? 'drug' : 'event'
  let label: string
  if (entry.type === 'deactivate') label = `${entry.actionKind === 'drug' ? 'Drug' : 'Event'}: ${name} stopped`
  else if (entry.type === 'intensity') label = `${entry.actionKind === 'drug' ? 'Drug' : 'Event'}: ${name} intensity changed`
  else if (entry.actionKind === 'drug') label = entry.mode === 'toggle' ? `Drug: ${name} started` : `Drug: ${name} administered`
  else label = entry.mode === 'toggle' ? `Event: ${name} started` : `Event: ${name}`

  void recordSessionLogEvent({
    category,
    eventType: `action.${entry.actionKind}.${entry.type}`,
    label,
    simulationTimeSeconds: entry.simulationTime,
    details: {
      actionId: entry.actionId,
      mode: entry.mode ?? null,
      intensity: entry.intensity ?? null,
      effectIds: entry.effectIds ?? [],
    },
  }).catch(() => undefined)
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

export function getActiveToggleActions(): ActiveToggleAction[] {
  return activeToggleActions.map((active) => ({ ...active, effectIds: [...active.effectIds] }))
}

export function isActionToggleRunning(actionId: string): boolean {
  return activeToggleActions.some((active) => active.actionId === actionId)
}

export function activateAction(
  definition: EdusimActionRuntimeDefinition,
  atSimulationTime = simulationTime,
  intensity = 1,
): ActiveEffect[] {
  setActionRuntimeSimulationTime(atSimulationTime)
  const resolvedIntensity = normaliseIntensity(intensity)

  if (definition.short_press_action === 'toggle') {
    const runningAction = activeToggleActions.find((active) => active.actionId === definition.id)
    if (runningAction) {
      activeToggleActions = activeToggleActions.filter((active) => active.actionId !== definition.id)
      const runningEffects = activeEffects.filter((active) => active.actionId === definition.id && active.mode === 'toggle' && active.stoppedAtSimulationTime == null)
      activeEffects = activeEffects.map((active) => runningEffects.includes(active)
        ? { ...active, stoppedAtSimulationTime: atSimulationTime }
        : active)
      appendActionLog({
        simulationTime: atSimulationTime,
        type: 'deactivate',
        actionId: definition.id,
        actionName: runningAction.actionName ?? definition.name,
        actionKind: runningAction.actionKind ?? definition.kind,
        mode: definition.short_press_action,
        effectIds: runningAction.effectIds,
      })
      notifyActionRuntime()
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
  if (definition.short_press_action === 'toggle') {
    activeToggleActions = [...activeToggleActions, {
      actionId: definition.id,
      actionName: definition.name,
      actionKind: definition.kind,
      intensity: resolvedIntensity,
      startedAtSimulationTime: atSimulationTime,
      effectIds: definition.effects.map((effect) => effect.id),
    }]
  }
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
  notifyActionRuntime()
  return created
}

export function setActionIntensity(actionId: string, intensity: number): void {
  const nextIntensity = normaliseIntensity(intensity)
  const runningAction = activeToggleActions.find((active) => active.actionId === actionId)
  if (!runningAction) return
  activeToggleActions = activeToggleActions.map((active) => active.actionId === actionId ? { ...active, intensity: nextIntensity } : active)
  const running = activeEffects.filter((active) => active.actionId === actionId && active.mode === 'toggle' && active.stoppedAtSimulationTime == null)
  activeEffects = activeEffects.map((active) => running.includes(active)
    ? { ...active, intensity: nextIntensity }
    : active)
  appendActionLog({
    simulationTime,
    type: 'intensity',
    actionId,
    actionName: runningAction.actionName,
    actionKind: runningAction.actionKind,
    mode: 'toggle',
    intensity: nextIntensity,
    effectIds: runningAction.effectIds,
  })
  notifyActionRuntime()
}

export function deactivateAction(actionId: string): void {
  const runningAction = activeToggleActions.find((active) => active.actionId === actionId)
  if (!runningAction) return
  activeToggleActions = activeToggleActions.filter((active) => active.actionId !== actionId)
  const running = activeEffects.filter((active) => active.actionId === actionId && active.mode === 'toggle' && active.stoppedAtSimulationTime == null)
  activeEffects = activeEffects.map((active) => running.includes(active)
    ? { ...active, stoppedAtSimulationTime: simulationTime }
    : active)
  appendActionLog({
    simulationTime,
    type: 'deactivate',
    actionId,
    actionName: runningAction.actionName,
    actionKind: runningAction.actionKind,
    mode: 'toggle',
    effectIds: runningAction.effectIds,
  })
  notifyActionRuntime()
}

/**
 * Instructor ownership of a physiological target wins over every action priority.
 * Removing only this target leaves unrelated effects of the same action running.
 */
export function supersedeActionTarget(target: EdusimActionEffectTarget): number {
  const affected = activeEffects.filter((active) => active.effect.target === target)
  if (affected.length === 0) return 0
  activeEffects = activeEffects.filter((active) => active.effect.target !== target)

  const affectedActionIds = [...new Set(affected.map((active) => active.actionId))]
  activeToggleActions = activeToggleActions.filter((toggle) => {
    if (!affectedActionIds.includes(toggle.actionId) || toggle.effectIds.length === 0) return true
    return activeEffects.some((effect) => effect.actionId === toggle.actionId && effect.mode === 'toggle' && effect.stoppedAtSimulationTime == null)
  })

  appendActionLog({
    simulationTime,
    type: 'supersede-target',
    target,
    affectedActionIds,
    effectIds: affected.map((active) => active.effect.id),
  })
  notifyActionRuntime()
  return affected.length
}

export function clearActionRuntime(): void {
  const actionIds = [...new Set([...activeEffects.map((active) => active.actionId), ...activeToggleActions.map((active) => active.actionId)])]
  if (actionIds.length > 0) {
    appendActionLog({
      simulationTime,
      type: 'clear',
      affectedActionIds: actionIds,
      effectIds: activeEffects.map((active) => active.effect.id),
    })
  }
  activeEffects = []
  activeToggleActions = []
  sequence = 0
  notifyActionRuntime()
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
  return {
    simulationTime: atSimulationTime,
    activeEffects: getActiveEffects(atSimulationTime),
    activeToggleActions: getActiveToggleActions(),
  }
}

export function getActionRuntimeDiagnostics(atSimulationTime = simulationTime): Record<string, unknown> {
  const effects = getActiveEffects(atSimulationTime)
  return {
    simulationTime: atSimulationTime,
    activeToggleActions: getActiveToggleActions(),
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
