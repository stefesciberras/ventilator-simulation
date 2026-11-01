import { activateAction, deactivateAction, isActionToggleRunning, type EdusimActionRuntimeDefinition } from '../edusim/actions/ActionRuntime'
import { EDUMON_MONITOR_DISPLAY_ACTION_IDS, type EdumonMonitorDisplayActionId } from './monitorDisplayActions'
import type { EdumonScenarioMonitoringSnapshot } from './scenarioTypes'

export interface EdumonScenarioMonitoringControl {
  id: string
  key: keyof EdumonScenarioMonitoringSnapshot
  label: string
  actionId: EdumonMonitorDisplayActionId
  actionName: string
}

/**
 * Canonical Anaesth scenario-facing monitoring registry. These controls describe
 * observation/display capability, not patient physiology.
 */
export const ANAESTH_SCENARIO_MONITORING_CONTROLS: readonly EdumonScenarioMonitoringControl[] = [
  { id: 'monitorInvasiveBloodPressure', key: 'invasiveBloodPressure', label: 'Invasive blood pressure', actionId: EDUMON_MONITOR_DISPLAY_ACTION_IDS.invasiveBloodPressure, actionName: 'Inv BP' },
  { id: 'monitorBis', key: 'bis', label: 'BIS', actionId: EDUMON_MONITOR_DISPLAY_ACTION_IDS.bis, actionName: 'BIS' },
  { id: 'monitorCapnography', key: 'capnography', label: 'EtCO₂ / capnography', actionId: EDUMON_MONITOR_DISPLAY_ACTION_IDS.capnography, actionName: 'EtCO₂' },
  { id: 'monitorTemperature', key: 'temperature', label: 'Temperature', actionId: EDUMON_MONITOR_DISPLAY_ACTION_IDS.temperature, actionName: 'Temp' },
] as const

export function applyEdumonScenarioMonitoringControl(control: EdumonScenarioMonitoringControl, enabled: boolean): void {
  const running = isActionToggleRunning(control.actionId)
  if (running === enabled) return

  if (!enabled) {
    deactivateAction(control.actionId)
    return
  }

  // Monitor display actions are persisted as legacy `event` toggles with no
  // physiological effects. Reuse that ActionRuntime contract so the Actions UI,
  // monitor surfaces, alarm eligibility and session semantics remain aligned.
  const definition: EdusimActionRuntimeDefinition = {
    id: control.actionId,
    name: control.actionName,
    kind: 'event',
    short_press_action: 'toggle',
    effects: [],
  }
  activateAction(definition)
}
