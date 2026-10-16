export type ScenarioModuleId = string

export type BuilderTrigger =
  | { type: 'manual' }
  | { type: 'time'; seconds: number }
  | { type: 'condition'; metric: string; operator: 'lt' | 'eq' | 'gt'; value: number }
  | { type: 'action'; parameter: string; actor: 'candidate' | 'instructor' | 'either' }

export type VariableTransition =
  | { mode: 'immediate' }
  | { mode: 'linear'; durationSeconds: number }

export interface ScenarioStageDefinition<TPayload = unknown> {
  id: string
  name: string
  payload: TPayload
  variableTransitions?: Record<string, VariableTransition>
}

export interface ScenarioBranchDefinition {
  id: string
  fromStageId: string
  toStageId: string
  trigger: BuilderTrigger
  label?: string
}

export interface ScenarioBuilderDocument<TPayload = unknown> {
  schemaVersion: 1
  builderVersion: string
  moduleId: ScenarioModuleId
  id?: string
  name: string
  notes: string
  entryStageId: string
  stages: Array<ScenarioStageDefinition<TPayload>>
  branches: ScenarioBranchDefinition[]
}

export interface ScenarioModuleDefinition<TPreset = unknown> {
  id: ScenarioModuleId
  label: string
  shortLabel: string
  description: string
  available: boolean
  supportsPreset: (preset: TPreset) => boolean
}
