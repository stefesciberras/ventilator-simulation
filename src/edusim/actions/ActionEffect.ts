export const EDUSIM_ACTION_EFFECT_OPERATIONS = [
  'offset',
  'set',
  'multiplier',
  'target',
  'increment',
  'trigger',
] as const

export type EdusimActionEffectOperation = typeof EDUSIM_ACTION_EFFECT_OPERATIONS[number]

export type EdusimActionEffectTarget =
  | 'haemodynamics.heartRate'
  | 'haemodynamics.meanArterialPressure'
  | 'respiration.drive'
  | 'neuromuscular.block'
  | 'anaesthesia.hypnoticEffect'
  | 'anaesthesia.nociceptiveResponse'
  | 'stimulus.sympathetic'

export interface EdusimActionEffectTargetDefinition {
  id: EdusimActionEffectTarget
  label: string
  unit?: string
  allowedOperations: readonly EdusimActionEffectOperation[]
}

export const EDUSIM_ACTION_EFFECT_TARGETS: readonly EdusimActionEffectTargetDefinition[] = [
  {
    id: 'haemodynamics.heartRate',
    label: 'Heart rate',
    unit: 'bpm',
    allowedOperations: ['offset', 'set', 'target', 'increment'],
  },
  {
    id: 'haemodynamics.meanArterialPressure',
    label: 'Mean arterial pressure',
    unit: 'mmHg',
    allowedOperations: ['offset', 'set', 'target', 'increment'],
  },
  {
    id: 'respiration.drive',
    label: 'Respiratory drive',
    allowedOperations: ['multiplier', 'set', 'target', 'increment'],
  },
  {
    id: 'neuromuscular.block',
    label: 'Neuromuscular block',
    unit: '0–1',
    allowedOperations: ['target', 'set', 'offset', 'increment'],
  },
  {
    id: 'anaesthesia.hypnoticEffect',
    label: 'Hypnotic effect',
    allowedOperations: ['offset', 'multiplier', 'target', 'increment'],
  },
  {
    id: 'anaesthesia.nociceptiveResponse',
    label: 'Nociceptive response',
    allowedOperations: ['multiplier', 'offset', 'target', 'increment'],
  },
  {
    id: 'stimulus.sympathetic',
    label: 'Sympathetic stimulus',
    allowedOperations: ['trigger', 'offset', 'target', 'increment'],
  },
]

export interface EdusimActionEffect {
  id: string
  target: EdusimActionEffectTarget
  operation: EdusimActionEffectOperation
  value: number
  onsetSeconds: number
  durationSeconds: number
  recoverySeconds: number
}

const targetIds = new Set<EdusimActionEffectTarget>(EDUSIM_ACTION_EFFECT_TARGETS.map((target) => target.id))
const operationIds = new Set<EdusimActionEffectOperation>(EDUSIM_ACTION_EFFECT_OPERATIONS)

export function isEdusimActionEffectTarget(value: unknown): value is EdusimActionEffectTarget {
  return typeof value === 'string' && targetIds.has(value as EdusimActionEffectTarget)
}

export function isEdusimActionEffectOperation(value: unknown): value is EdusimActionEffectOperation {
  return typeof value === 'string' && operationIds.has(value as EdusimActionEffectOperation)
}

export function getEdusimActionEffectTargetDefinition(target: EdusimActionEffectTarget): EdusimActionEffectTargetDefinition {
  return EDUSIM_ACTION_EFFECT_TARGETS.find((definition) => definition.id === target) ?? EDUSIM_ACTION_EFFECT_TARGETS[0]
}

export function normaliseEdusimActionEffects(value: unknown): EdusimActionEffect[] {
  if (!Array.isArray(value)) return []

  return value.flatMap((candidate, index) => {
    if (!candidate || typeof candidate !== 'object') return []
    const row = candidate as Record<string, unknown>
    if (!isEdusimActionEffectTarget(row.target) || !isEdusimActionEffectOperation(row.operation)) return []

    const numericValue = Number(row.value)
    if (!Number.isFinite(numericValue)) return []

    return [{
      id: typeof row.id === 'string' && row.id.trim() ? row.id.trim() : `effect-${index + 1}`,
      target: row.target,
      operation: row.operation,
      value: numericValue,
      onsetSeconds: Math.max(0, Number(row.onsetSeconds) || 0),
      durationSeconds: Math.max(0, Number(row.durationSeconds) || 0),
      recoverySeconds: Math.max(0, Number(row.recoverySeconds) || 0),
    }]
  })
}
