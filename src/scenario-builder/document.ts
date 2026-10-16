import { createBranchId, createScenarioId, createStageId, createTriggerId } from './ids'
import {
  SCENARIO_DOCUMENT_FORMAT,
  SCENARIO_DOCUMENT_SCHEMA_VERSION,
  type ScenarioBranchDefinition,
  type ScenarioBuilderDocument,
  type ScenarioModuleDefinition,
  type ScenarioStageDefinition,
  type ScenarioTriggerExpression,
} from './model'

export interface ScenarioDocumentValidationIssue {
  severity: 'error' | 'warning'
  code: string
  message: string
  path?: string
}

export function createScenarioStage(name = 'New stage'): ScenarioStageDefinition {
  return { id: createStageId(), name, changes: {} }
}

export function createManualTrigger(): ScenarioTriggerExpression {
  return { id: createTriggerId(), type: 'manual' }
}

export function createScenarioBranch(
  fromStageId: string,
  toStageId: string,
  trigger: ScenarioTriggerExpression = createManualTrigger(),
  priority = 0,
): ScenarioBranchDefinition {
  return { id: createBranchId(), fromStageId, toStageId, trigger, priority, enabled: true }
}

export function createEmptyScenarioDocument(
  module: { id: string; schemaVersion: number },
  builderVersion: string,
  name = 'Untitled scenario',
): ScenarioBuilderDocument {
  const initialStage = createScenarioStage('Initial stage')
  const now = new Date().toISOString()
  return {
    format: SCENARIO_DOCUMENT_FORMAT,
    schemaVersion: SCENARIO_DOCUMENT_SCHEMA_VERSION,
    builderVersion,
    id: createScenarioId(),
    metadata: { name, notes: '', createdAt: now, updatedAt: now },
    module: { ...module },
    entryStageId: initialStage.id,
    stages: [initialStage],
    branches: [],
  }
}

function validateTrigger(
  trigger: ScenarioTriggerExpression,
  path: string,
  issues: ScenarioDocumentValidationIssue[],
  seenTriggerIds: Set<string>,
) {
  if (!trigger.id) {
    issues.push({ severity: 'error', code: 'missing-trigger-id', message: 'Every trigger requires a stable ID.', path: `${path}.id` })
  } else if (seenTriggerIds.has(trigger.id)) {
    issues.push({ severity: 'error', code: 'duplicate-trigger-id', message: `Trigger ID ${trigger.id} is duplicated.`, path: `${path}.id` })
  } else {
    seenTriggerIds.add(trigger.id)
  }

  if (trigger.type === 'time' && (!Number.isFinite(trigger.seconds) || trigger.seconds < 0)) {
    issues.push({ severity: 'error', code: 'invalid-trigger-time', message: 'Time triggers must use a non-negative number of seconds.', path })
  }
  if (trigger.type === 'condition' && !Number.isFinite(trigger.value)) {
    issues.push({ severity: 'error', code: 'invalid-trigger-value', message: 'Condition trigger values must be finite numbers.', path })
  }
  if (trigger.type === 'group') {
    if (trigger.triggers.length === 0) {
      issues.push({ severity: 'error', code: 'empty-trigger-group', message: 'Trigger groups must contain at least one trigger.', path })
    }
    trigger.triggers.forEach((child, index) => validateTrigger(child, `${path}.triggers[${index}]`, issues, seenTriggerIds))
  }
}

export function validateScenarioDocument<TPreset>(
  document: ScenarioBuilderDocument,
  module?: ScenarioModuleDefinition<TPreset>,
): ScenarioDocumentValidationIssue[] {
  const issues: ScenarioDocumentValidationIssue[] = []
  if (document.format !== SCENARIO_DOCUMENT_FORMAT) {
    issues.push({ severity: 'error', code: 'invalid-format', message: `Expected scenario format ${SCENARIO_DOCUMENT_FORMAT}.`, path: 'format' })
  }
  if (document.schemaVersion !== SCENARIO_DOCUMENT_SCHEMA_VERSION) {
    issues.push({ severity: 'error', code: 'unsupported-schema-version', message: `Scenario schema version ${document.schemaVersion} is not supported.`, path: 'schemaVersion' })
  }
  if (!document.id) issues.push({ severity: 'error', code: 'missing-scenario-id', message: 'Scenario ID is required.', path: 'id' })
  if (document.stages.length === 0) issues.push({ severity: 'error', code: 'missing-stages', message: 'A scenario must contain at least one stage.', path: 'stages' })

  const stageIds = new Set<string>()
  document.stages.forEach((stage, index) => {
    if (!stage.id) issues.push({ severity: 'error', code: 'missing-stage-id', message: `Stage ${index + 1} has no stable ID.`, path: `stages[${index}].id` })
    else if (stageIds.has(stage.id)) issues.push({ severity: 'error', code: 'duplicate-stage-id', message: `Stage ID ${stage.id} is duplicated.`, path: `stages[${index}].id` })
    else stageIds.add(stage.id)

    Object.entries(stage.changes).forEach(([variableId, change]) => {
      if (change.transition.mode === 'linear' && (!Number.isFinite(change.transition.durationSeconds) || change.transition.durationSeconds <= 0)) {
        issues.push({ severity: 'error', code: 'invalid-transition-duration', message: 'Linear transitions require a duration greater than zero.', path: `stages[${index}].changes.${variableId}.transition` })
      }
    })
  })

  if (document.entryStageId && !stageIds.has(document.entryStageId)) {
    issues.push({ severity: 'error', code: 'invalid-entry-stage', message: 'The entry stage does not exist in this scenario.', path: 'entryStageId' })
  }

  const branchIds = new Set<string>()
  const triggerIds = new Set<string>()
  document.branches.forEach((branch, index) => {
    const path = `branches[${index}]`
    if (!branch.id) issues.push({ severity: 'error', code: 'missing-branch-id', message: `Branch ${index + 1} has no stable ID.`, path: `${path}.id` })
    else if (branchIds.has(branch.id)) issues.push({ severity: 'error', code: 'duplicate-branch-id', message: `Branch ID ${branch.id} is duplicated.`, path: `${path}.id` })
    else branchIds.add(branch.id)
    if (!stageIds.has(branch.fromStageId)) issues.push({ severity: 'error', code: 'missing-branch-source', message: 'Branch source stage does not exist.', path: `${path}.fromStageId` })
    if (!stageIds.has(branch.toStageId)) issues.push({ severity: 'error', code: 'missing-branch-target', message: 'Branch target stage does not exist.', path: `${path}.toStageId` })
    if (!Number.isInteger(branch.priority) || branch.priority < 0) issues.push({ severity: 'error', code: 'invalid-branch-priority', message: 'Branch priority must be a non-negative integer.', path: `${path}.priority` })
    validateTrigger(branch.trigger, `${path}.trigger`, issues, triggerIds)
  })

  if (module) {
    if (module.id !== document.module.id) issues.push({ severity: 'error', code: 'module-mismatch', message: `Scenario targets ${document.module.id}, not ${module.id}.`, path: 'module.id' })
    if (module.schemaVersion !== document.module.schemaVersion) issues.push({ severity: 'warning', code: 'module-schema-mismatch', message: `Scenario was authored against ${document.module.id} module schema v${document.module.schemaVersion}; the loaded module is v${module.schemaVersion}.`, path: 'module.schemaVersion' })

    const variables = new Map(module.variables.map((variable) => [variable.id, variable]))
    document.stages.forEach((stage, stageIndex) => {
      for (const variableId of Object.keys(stage.changes)) {
        const variable = variables.get(variableId)
        if (!variable) issues.push({ severity: 'warning', code: 'unknown-variable', message: `Variable ${variableId} is not published by module ${module.id}.`, path: `stages[${stageIndex}].changes.${variableId}` })
        else if (variable.role === 'measurement') issues.push({ severity: 'warning', code: 'measurement-change', message: `Measurement ${variableId} cannot normally be assigned directly by a stage.`, path: `stages[${stageIndex}].changes.${variableId}` })
      }
    })
  }

  return issues
}
