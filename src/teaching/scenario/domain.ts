export type ScenarioStageKind = 'state' | 'media' | 'question'
export type ScenarioActor = 'candidate' | 'instructor' | 'either'
export type ScenarioOperator = 'lt' | 'eq' | 'gt'
export type ScenarioTriggerMode = 'any' | 'all'

export type ScenarioTransition =
  | { mode: 'immediate' }
  | { mode: 'linear'; durationSeconds: number }

export interface ScenarioMediaContent {
  mediaId?: string
  title: string
  mediaKind: 'image' | 'video'
  storagePath: string
  mimeType: string
}

export interface ScenarioQuestionOption {
  id: string
  text: string
}

export interface ScenarioQuestionContent {
  libraryItemId?: string
  kind: 'mcq' | 'poll'
  title: string | null
  body: string
  options: ScenarioQuestionOption[]
  correctOptionId: string | null
  explanation: string | null
}

export type ScenarioStageContent =
  | { kind: 'state' }
  | { kind: 'media'; media: ScenarioMediaContent }
  | { kind: 'question'; question: ScenarioQuestionContent }

export interface ScenarioStage<TSnapshot, TTrigger> {
  id: string
  name: string
  snapshot: TSnapshot
  appliedVariableIds?: string[]
  transition?: ScenarioTransition
  transitionOverrides?: Record<string, ScenarioTransition>
  triggers: TTrigger[]
  notes?: string
  content?: ScenarioStageContent
}

export interface ScenarioBranch<TTrigger> {
  id?: string
  fromStageId?: string
  toStageId: string
  trigger: TTrigger
  triggers?: TTrigger[]
  triggerMode?: ScenarioTriggerMode
  priority?: number
  label?: string
  enabled?: boolean
}

export interface ScenarioDefinition<TSnapshot, TTrigger> {
  id: string
  name: string
  description?: string
  stages: Array<ScenarioStage<TSnapshot, TTrigger>>
  branches?: Array<ScenarioBranch<TTrigger>>
}

export interface ScenarioStageContext<TSnapshot, TTrigger> {
  scenario: ScenarioDefinition<TSnapshot, TTrigger>
  stage: ScenarioStage<TSnapshot, TTrigger>
  stageIndex: number
  stageStartedSimulationTime: number
}

export interface ScenarioRuntimeAdapter<TSnapshot, TTrigger, TContext> {
  applyStage: (snapshot: TSnapshot, context: ScenarioStageContext<TSnapshot, TTrigger>) => void | Promise<void>
  triggerMatches: (trigger: TTrigger, context: TContext, stage: ScenarioStageContext<TSnapshot, TTrigger>) => boolean
}

/**
 * Optional product contract layered on top of the generic runtime. Products
 * describe their own variable, metric and action vocabularies without leaking
 * them into EDUSIM scenario-core types.
 */
export interface ProductScenarioContract<TSnapshot, TTrigger, TContext> {
  emptySnapshot: () => TSnapshot
  runtimeAdapter: ScenarioRuntimeAdapter<TSnapshot, TTrigger, TContext>
  variableIds?: readonly string[]
  metricIds?: readonly string[]
  actionIds?: readonly string[]
}
