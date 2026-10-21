import type { ScenarioProductId } from './products'

export type SharedScenarioStageKind = 'state' | 'media' | 'question'
export type SharedScenarioActor = 'candidate' | 'instructor' | 'either'
export type SharedScenarioOperator = 'lt' | 'eq' | 'gt'

export type SharedScenarioAuthoringTrigger =
  | { id: string; type: 'manual' }
  | { id: string; type: 'time'; seconds: number }
  | { id: string; type: 'condition'; metric: string; operator: SharedScenarioOperator; value: number }
  | { id: string; type: 'action'; parameter: string; actor: SharedScenarioActor }
  | { id: string; type: 'question-any' }
  | { id: string; type: 'question-correct' }

export interface SharedScenarioMediaContent {
  mediaId?: string
  title: string
  mediaKind: 'image' | 'video'
  storagePath: string
  mimeType: string
}

export interface SharedScenarioQuestionOption {
  id: string
  text: string
}

export interface SharedScenarioQuestionContent {
  libraryItemId?: string
  kind: 'mcq' | 'poll'
  title: string | null
  body: string
  options: SharedScenarioQuestionOption[]
  correctOptionId: string | null
  explanation: string | null
}

export interface SharedScenarioAuthoringStage<TSnapshot> {
  id: string
  name: string
  notes: string
  kind: SharedScenarioStageKind
  snapshot: TSnapshot
  triggers: SharedScenarioAuthoringTrigger[]
  media?: SharedScenarioMediaContent
  question?: SharedScenarioQuestionContent
}

export interface SharedScenarioAuthoringBranch {
  id: string
  fromStageId: string
  toStageId: string
  trigger: SharedScenarioAuthoringTrigger
  priority: number
  label?: string
  enabled?: boolean
}

export interface SharedScenarioAuthoringDocument<TSnapshot> {
  schemaVersion: 1
  product: ScenarioProductId
  name: string
  description: string
  stages: SharedScenarioAuthoringStage<TSnapshot>[]
  branches: SharedScenarioAuthoringBranch[]
}

export interface SharedScenarioTriggerChoice {
  id: string
  label: string
}

export interface SharedScenarioEditorAdapter<TScenario, TSnapshot> {
  product: ScenarioProductId
  productLabel: string
  emptySnapshot: () => TSnapshot
  toDocument: (name: string, scenario: TScenario) => SharedScenarioAuthoringDocument<TSnapshot>
  fromDocument: (document: SharedScenarioAuthoringDocument<TSnapshot>) => TScenario
  renderSnapshotEditor: (snapshot: TSnapshot, onChange: (snapshot: TSnapshot) => void) => React.ReactNode
  conditionMetrics: readonly SharedScenarioTriggerChoice[]
  actionParameters: readonly SharedScenarioTriggerChoice[]
}

export function authoringId(prefix: string) {
  const suffix = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10)
  return `${prefix}-${suffix}`
}

export function defaultAuthoringTrigger(): SharedScenarioAuthoringTrigger {
  return { id: authoringId('trigger'), type: 'manual' }
}

export function createAuthoringStage<TSnapshot>(name: string, snapshot: TSnapshot): SharedScenarioAuthoringStage<TSnapshot> {
  return {
    id: authoringId('stage'),
    name,
    notes: '',
    kind: 'state',
    snapshot,
    triggers: [defaultAuthoringTrigger()],
  }
}
