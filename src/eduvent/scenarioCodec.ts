import { calculatePredictedBodyWeight } from '../patientMetrics'
import { createBranchId, createStageId } from '../scenario-builder/ids'
import type { PatientSettings } from '../simulation/types'
import type { ScenarioCodec } from '../teaching/scenario/ScenarioRepository'
import {
  dynamicBranchTriggerMode,
  dynamicBranchTriggers,
  dynamicStageTriggers,
  type InstructorScenarioSnapshot,
} from '../instructorAccount'

function normalisePatientSettings(patient: PatientSettings): PatientSettings {
  const chestWallCompliance = Number.isFinite(patient.chestWallCompliance ?? Number.NaN)
    ? patient.chestWallCompliance
    : Math.round(calculatePredictedBodyWeight(patient.sex ?? 'male', patient.heightCm ?? 170) * 3)
  return { ...patient, chestWallCompliance }
}

/** Product-specific compatibility codec for persisted EDUVENT scenario schemas. */
export function normaliseEduventScenario(scenario: InstructorScenarioSnapshot): InstructorScenarioSnapshot {
  return {
    ...scenario,
    schemaVersion: scenario.schemaVersion ?? 1,
    kind: scenario.kind ?? 'static',
    description: scenario.description ?? '',
    mediaIds: [...new Set((scenario.mediaIds ?? []).filter((id) => typeof id === 'string' && id.length > 0))],
    patient: normalisePatientSettings(scenario.patient),
    stages: scenario.kind === 'dynamic' ? (scenario.stages ?? []).map((stage, index) => {
      const triggers = dynamicStageTriggers(stage)
      return {
        id: stage.id ?? createStageId(),
        name: stage.name || `Stage ${index + 1}`,
        comment: stage.comment ?? '',
        stageType: stage.stageType ?? 'controls',
        media: stage.media,
        question: stage.question,
        transition: stage.transition ?? { mode: 'immediate' },
        transitionOverrides: stage.transitionOverrides ?? {},
        snapshot: { ...stage.snapshot, patient: normalisePatientSettings(stage.snapshot.patient), kind: 'static', stages: undefined },
        apply: stage.apply,
        sourceName: stage.sourceName,
        advanceTrigger: triggers[0],
        advanceTriggers: triggers,
      }
    }) : undefined,
    branches: scenario.kind === 'dynamic' ? (scenario.branches ?? []).map((branch, index) => {
      const triggers = dynamicBranchTriggers(branch)
      return {
        ...branch,
        id: branch.id || createBranchId(),
        trigger: triggers[0],
        triggers,
        triggerMode: dynamicBranchTriggerMode(branch),
        priority: Number.isFinite(branch.priority) ? branch.priority : index,
        enabled: branch.enabled !== false,
      }
    }) : undefined,
  }
}

/** Shared repository codec used by all EDUVENT scenario-library consumers. */
export const EDUVENT_SCENARIO_CODEC: ScenarioCodec<InstructorScenarioSnapshot> = {
  encode: normaliseEduventScenario,
  decode: (scenario) => normaliseEduventScenario(scenario as InstructorScenarioSnapshot),
}
