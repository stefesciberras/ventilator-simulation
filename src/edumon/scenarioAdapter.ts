import type { MonitorMeasurements } from './types'
import type { EdumonScenarioMetric, EdumonScenarioSnapshot, EdumonScenarioTrigger } from './scenarioTypes'
import type {
  TeachingScenarioRuntimeAdapter,
  TeachingScenarioStageContext,
} from '../teaching/scenario/runtimeCore'

export interface EdumonScenarioRuntimeContext {
  simulationTime: number
  state: EdumonScenarioSnapshot
  measurements: MonitorMeasurements
  questionAnswered?: boolean
  questionCorrect?: boolean
  mediaEnded?: boolean
  mediaAcknowledged?: boolean
  stageBaselinePatient?: EdumonScenarioSnapshot['patient']
  actionEvents?: Array<{ sourceId: string; actor: 'candidate' | 'instructor'; actionId: string; sequence: number }>
  actionBaselines?: Record<string, number>
}

function numericMetric(context: EdumonScenarioRuntimeContext, metric: EdumonScenarioMetric): number | null {
  const { state, measurements } = context
  if (metric === 'heartRate') return measurements.heartRate
  if (metric === 'systolicPressure') return measurements.systolicPressure
  if (metric === 'diastolicPressure') return measurements.diastolicPressure
  if (metric === 'meanPressure') return measurements.meanPressure
  if (metric === 'pulsePressure') {
    if (measurements.systolicPressure == null || measurements.diastolicPressure == null) return null
    return measurements.systolicPressure - measurements.diastolicPressure
  }
  if (metric === 'spo2') return measurements.spo2
  if (metric === 'peripheralPerfusion') return state.patient.peripheralPerfusion
  return null
}

function conditionMatches(actual: number, operator: 'lt' | 'eq' | 'gt', target: number) {
  if (operator === 'lt') return actual < target
  if (operator === 'gt') return actual > target
  const tolerance = Math.max(0.1, Math.abs(target) * 0.005)
  return Math.abs(actual - target) <= tolerance
}

function changed(a: unknown, b: unknown) {
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) > 1e-6
  return a !== b
}

/** Product adapter for the shared EDUSIM scenario sequencer. */
export function createEdumonScenarioRuntimeAdapter(
  applySnapshot: (
    snapshot: EdumonScenarioSnapshot,
    stage: TeachingScenarioStageContext<EdumonScenarioSnapshot, EdumonScenarioTrigger>,
  ) => void | Promise<void>,
): TeachingScenarioRuntimeAdapter<EdumonScenarioSnapshot, EdumonScenarioTrigger, EdumonScenarioRuntimeContext> {
  return {
    applyStage: applySnapshot,
    triggerMatches: (trigger, context, stage) => {
      if (trigger.type === 'manual') return false
      if (trigger.type === 'question-any') return context.questionAnswered === true
      if (trigger.type === 'question-correct') return context.questionAnswered === true && context.questionCorrect === true
      if (trigger.type === 'media-ended') return context.mediaEnded === true
      if (trigger.type === 'media-acknowledged') return context.mediaAcknowledged === true
      if (trigger.type === 'time') return context.simulationTime - stage.stageStartedSimulationTime >= Math.max(0, trigger.seconds)
      if (trigger.type === 'condition') {
        const actual = numericMetric(context, trigger.metric)
        return actual != null && Number.isFinite(actual) && conditionMatches(actual, trigger.operator, trigger.value)
      }
      if (trigger.type === 'edusim-action') {
        const actor = trigger.actor ?? 'either'
        return (context.actionEvents ?? []).some((event) =>
          event.actionId === trigger.actionId
          && event.sequence > (context.actionBaselines?.[event.sourceId] ?? 0)
          && (actor === 'either' || event.actor === actor),
        )
      }
      const baseline = context.stageBaselinePatient ?? stage.stage.snapshot.patient
      return changed(context.state.patient[trigger.parameter], baseline[trigger.parameter])
    },
  }
}
