export const SCENARIO_DOCUMENT_FORMAT = 'eduvent-scenario' as const
export const SCENARIO_DOCUMENT_SCHEMA_VERSION = 1 as const

export type ScenarioModuleId = string
export type ScenarioVariableId = string
export type ScenarioValue = string | number | boolean | null

export type ScenarioVariableType = 'number' | 'boolean' | 'select' | 'string'
export type ScenarioVariableRole = 'setting' | 'measurement'

export interface ScenarioVariableOption {
  value: string
  label: string
}

export interface ScenarioVariableStudioMetadata {
  /** Show this variable as an editable stage-state control in Studio. Defaults to writable settings. */
  editable?: boolean
  /** Expose changes to this variable as a branching trigger. Defaults to writable settings. */
  triggerable?: boolean
  /** Expose this variable as a threshold/equality measurement trigger. Defaults to measurement-role variables. */
  measurable?: boolean
}

export interface ScenarioVariableDefinition {
  id: ScenarioVariableId
  label: string
  group: string
  type: ScenarioVariableType
  role: ScenarioVariableRole
  unit?: string
  min?: number
  max?: number
  step?: number
  defaultValue?: ScenarioValue
  options?: ScenarioVariableOption[]
  writable?: boolean
  /** Dot-separated location inside the product scenario snapshot. */
  snapshotPath?: string
  /** Numeric setting may interpolate while entering a stage. */
  transitionable?: boolean
  /**
   * Product-owned Studio exposure metadata. Omit to use the safe defaults:
   * writable setting => editable + triggerable; measurement => measurable.
   * Explicit false values let modules keep internal variables out of Studio.
   */
  studio?: ScenarioVariableStudioMetadata
}

export function isStudioEditable(variable: ScenarioVariableDefinition) {
  return variable.studio?.editable ?? (variable.role === 'setting' && variable.writable === true)
}

export function isStudioTriggerable(variable: ScenarioVariableDefinition) {
  return variable.studio?.triggerable ?? (variable.role === 'setting' && variable.writable === true)
}

export function isStudioMeasurable(variable: ScenarioVariableDefinition) {
  return variable.studio?.measurable ?? variable.role === 'measurement'
}

export interface ScenarioTemplateDefinition {
  id: string
  label: string
  group: string
  description?: string
  values: Record<ScenarioVariableId, ScenarioValue>
}

export interface ScenarioTriggerSourceDefinition {
  id: string
  label: string
  kind: 'measurement' | 'candidate-action' | 'instructor-action'
  variableId: ScenarioVariableId
}

interface ScenarioTriggerBase {
  id: string
}

export type ScenarioAtomicTrigger =
  | (ScenarioTriggerBase & { type: 'manual' })
  | (ScenarioTriggerBase & { type: 'time'; seconds: number })
  | (ScenarioTriggerBase & { type: 'condition'; variableId: ScenarioVariableId; operator: 'lt' | 'lte' | 'eq' | 'gte' | 'gt'; value: number })
  | (ScenarioTriggerBase & { type: 'action'; variableId: ScenarioVariableId; actor: 'candidate' | 'instructor' | 'either' })

export type ScenarioTriggerExpression =
  | ScenarioAtomicTrigger
  | (ScenarioTriggerBase & { type: 'group'; mode: 'all' | 'any'; triggers: ScenarioTriggerExpression[] })

export type VariableTransition =
  | { mode: 'immediate' }
  | { mode: 'linear'; durationSeconds: number }

export interface ScenarioVariableChange {
  value: ScenarioValue
  transition: VariableTransition
}

export interface ScenarioStageDefinition {
  id: string
  name: string
  notes?: string
  changes: Record<ScenarioVariableId, ScenarioVariableChange>
}

export interface ScenarioBranchDefinition {
  id: string
  fromStageId: string
  toStageId: string
  trigger: ScenarioTriggerExpression
  /** Lower numbers are evaluated first. Equal priorities retain document order. */
  priority: number
  label?: string
  enabled?: boolean
}

export interface ScenarioDocumentMetadata {
  name: string
  notes: string
  createdAt?: string
  updatedAt?: string
}

export interface ScenarioModuleReference {
  id: ScenarioModuleId
  schemaVersion: number
}

export interface ScenarioBuilderDocument {
  format: typeof SCENARIO_DOCUMENT_FORMAT
  schemaVersion: typeof SCENARIO_DOCUMENT_SCHEMA_VERSION
  builderVersion: string
  id: string
  metadata: ScenarioDocumentMetadata
  module: ScenarioModuleReference
  entryStageId: string
  stages: ScenarioStageDefinition[]
  branches: ScenarioBranchDefinition[]
}

export interface ScenarioModuleDefinition<TPreset = unknown> {
  id: ScenarioModuleId
  schemaVersion: number
  label: string
  shortLabel: string
  description: string
  available: boolean
  variables: ScenarioVariableDefinition[]
  templates: ScenarioTemplateDefinition[]
  triggerSources: ScenarioTriggerSourceDefinition[]
  supportsPreset: (preset: TPreset) => boolean
}
