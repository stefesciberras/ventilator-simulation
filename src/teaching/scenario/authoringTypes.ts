import type { ReactNode } from 'react'
import type { LoppjuSimRuntimeMode } from '../../core/runtimeModes'
import type { ScenarioProductId } from './products'
import type {
  ScenarioActor,
  ScenarioMediaContent,
  ScenarioOperator,
  ScenarioQuestionContent,
  ScenarioQuestionOption,
  ScenarioStageKind,
  ScenarioTransition,
  ScenarioTriggerMode,
} from './domain'

export type SharedScenarioStageKind = ScenarioStageKind
export type SharedScenarioActor = ScenarioActor
export type SharedScenarioOperator = ScenarioOperator
export type SharedScenarioTransition = ScenarioTransition
export type SharedScenarioMediaContent = ScenarioMediaContent
export type SharedScenarioQuestionContent = ScenarioQuestionContent
export type SharedScenarioQuestionOption = ScenarioQuestionOption

export type SharedScenarioAuthoringTrigger =
  | { id: string; type: 'manual' }
  | { id: string; type: 'time'; seconds: number }
  | { id: string; type: 'condition'; metric: string; operator: SharedScenarioOperator; value: number }
  | { id: string; type: 'action'; parameter: string; actor: SharedScenarioActor }
  | { id: string; type: 'edusim-action'; actionId: string; actor: SharedScenarioActor }
  | { id: string; type: 'question-any' }
  | { id: string; type: 'question-correct' }
  | { id: string; type: 'media-ended' }
  | { id: string; type: 'media-acknowledged' }

export interface SharedScenarioAuthoringStage<TSnapshot> {
  id: string
  name: string
  notes: string
  kind: SharedScenarioStageKind
  snapshot: TSnapshot
  /** Product variable IDs explicitly applied when this state stage is entered. */
  appliedVariableIds?: string[]
  /** Default transition inherited by numeric values applied on stage entry. */
  transition?: SharedScenarioTransition
  /** Optional product-variable transition overrides, keyed by product variable ID. */
  transitionOverrides?: Record<string, SharedScenarioTransition>
  triggers: SharedScenarioAuthoringTrigger[]
  media?: SharedScenarioMediaContent
  question?: SharedScenarioQuestionContent
}

export interface SharedScenarioAuthoringBranch {
  id: string
  fromStageId: string
  toStageId: string
  /** Primary trigger for the branch. New Studio authoring uses one trigger per path. */
  trigger: SharedScenarioAuthoringTrigger
  /** Legacy multi-condition payload retained only while older test documents still exist. */
  triggers?: SharedScenarioAuthoringTrigger[]
  /** Legacy trigger combination mode. New Studio authoring uses one trigger per path. */
  triggerMode?: ScenarioTriggerMode
  priority: number
  label?: string
  enabled?: boolean
}

export interface SharedScenarioAuthoringDocument<TSnapshot> {
  schemaVersion: 1
  product: ScenarioProductId
  name: string
  description: string
  /**
   * User-facing runtime modes in which this scenario may be used. Omitted on
   * legacy documents; omission is interpreted as all modes for compatibility.
   */
  supportedModes?: LoppjuSimRuntimeMode[]
  stages: SharedScenarioAuthoringStage<TSnapshot>[]
  branches: SharedScenarioAuthoringBranch[]
}

export interface SharedScenarioTriggerChoice {
  id: string
  label: string
  /** Studio palette grouping supplied by the product module. */
  group?: string
}

export interface SharedScenarioActionChoice extends SharedScenarioTriggerChoice {
  kind: 'drug' | 'event'
}

/**
 * Product-neutral description of something that can cause a scenario path to fire.
 * Studio renders these definitions; product modules own the clinical vocabulary.
 */
export type SharedScenarioTriggerRegistryItem =
  | {
      id: string
      label: string
      group: string
      kind: 'measurement'
      metric: string
      unit?: string
    }
  | {
      id: string
      label: string
      group: string
      kind: 'parameter-change'
      parameter: string
      actors: readonly SharedScenarioActor[]
    }
  | {
      id: string
      label: string
      group: 'Drugs' | 'Events'
      kind: 'drug' | 'event'
      actionId: string
      actors: readonly SharedScenarioActor[]
    }
  | {
      id: string
      label: string
      group: 'Runtime'
      kind: 'manual' | 'time'
    }

export interface SharedScenarioEditorAdapter<TScenario, TSnapshot> {
  product: ScenarioProductId
  productLabel: string
  emptySnapshot: () => TSnapshot
  toDocument: (name: string, scenario: TScenario) => SharedScenarioAuthoringDocument<TSnapshot>
  fromDocument: (document: SharedScenarioAuthoringDocument<TSnapshot>) => TScenario
  renderSnapshotEditor: (
    snapshot: TSnapshot,
    onChange: (snapshot: TSnapshot) => void,
    options?: { appliedVariableIds?: string[]; onAppliedVariableIdsChange?: (ids: string[]) => void },
  ) => ReactNode
  defaultAppliedVariableIds?: (snapshot: TSnapshot) => string[]
  /** Numeric variables eligible for gradual stage transitions. Omit for products without transition runtime support. */
  transitionVariables?: (snapshot: TSnapshot) => readonly SharedScenarioTriggerChoice[]
  conditionMetrics: readonly SharedScenarioTriggerChoice[]
  actionParameters: readonly SharedScenarioTriggerChoice[]
  /** Static product-owned trigger vocabulary used by the Studio palette. */
  triggerRegistry: readonly SharedScenarioTriggerRegistryItem[]
  /** Dynamically load the shared Drugs & Events library for products that support EDUSIM actions. */
  loadEdusimActionChoices?: () => Promise<readonly SharedScenarioActionChoice[]>
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
    triggers: [],
  }
}
