import type { InstructorPresetRow } from '../../../instructorAccount'
import { ARDS_PROFILES, PATIENT_PROFILES } from '../../../patientProfiles'
import type { PatientSettings } from '../../../simulation/types'
import type {
  ScenarioModuleDefinition,
  ScenarioTemplateDefinition,
  ScenarioTriggerSourceDefinition,
  ScenarioValue,
  ScenarioVariableDefinition,
} from '../../model'

const modes = ['VC-AC', 'SIMV-VC', 'PC-AC', 'SIMV-PC', 'BIPAP', 'VG-PC', 'APRV', 'PSV']

const variables: ScenarioVariableDefinition[] = [
  { id: 'ventilator.mode', label: 'Mode', group: 'Ventilator', type: 'select', role: 'setting', options: modes.map((value) => ({ value, label: value })), writable: true },
  { id: 'ventilator.fio2', label: 'FiO₂', group: 'Ventilator', type: 'number', role: 'setting', min: 0.21, max: 1, step: 0.01, writable: true },
  { id: 'ventilator.peep', label: 'PEEP', group: 'Ventilator', type: 'number', role: 'setting', unit: 'cmH₂O', min: 0, max: 20, step: 1, writable: true },
  { id: 'ventilator.rate', label: 'Set respiratory rate', group: 'Ventilator', type: 'number', role: 'setting', unit: '/min', min: 5, max: 40, step: 1, writable: true },
  { id: 'ventilator.tidalVolume', label: 'Tidal volume', group: 'Ventilator', type: 'number', role: 'setting', unit: 'mL', min: 250, max: 800, step: 10, writable: true },
  { id: 'ventilator.inspiratoryTime', label: 'Inspiratory time', group: 'Ventilator', type: 'number', role: 'setting', unit: 's', min: 0.2, max: 5, step: 0.05, writable: true },
  { id: 'ventilator.inspiratoryFlow', label: 'Inspiratory flow', group: 'Ventilator', type: 'number', role: 'setting', unit: 'L/min', min: 10, max: 140, step: 1, writable: true },
  { id: 'ventilator.plateauPercent', label: 'Plateau time', group: 'Ventilator', type: 'number', role: 'setting', unit: '% Ti', min: 0, max: 20, step: 1, writable: true },
  { id: 'ventilator.pressureControl', label: 'Pressure control', group: 'Ventilator', type: 'number', role: 'setting', unit: 'cmH₂O', min: 5, max: 30, step: 1, writable: true },
  { id: 'ventilator.volumeGuaranteePressureLimit', label: 'AutoFlow Pmax', group: 'Ventilator', type: 'number', role: 'setting', unit: 'cmH₂O', min: 20, max: 60, step: 1, writable: true },
  { id: 'ventilator.pressureSupport', label: 'Pressure support', group: 'Ventilator', type: 'number', role: 'setting', unit: 'cmH₂O', min: 0, max: 25, step: 1, writable: true },
  { id: 'ventilator.triggerType', label: 'Trigger type', group: 'Ventilator', type: 'select', role: 'setting', options: [{ value: 'pressure', label: 'Pressure' }, { value: 'flow', label: 'Flow' }], writable: true },
  { id: 'ventilator.triggerSensitivity', label: 'Pressure trigger', group: 'Ventilator', type: 'number', role: 'setting', unit: 'cmH₂O below PEEP', min: 0.5, max: 8, step: 0.5, writable: true },
  { id: 'ventilator.flowTriggerSensitivity', label: 'Flow trigger', group: 'Ventilator', type: 'number', role: 'setting', unit: 'L/min', min: 0.5, max: 10, step: 0.5, writable: true },
  { id: 'ventilator.terminationSensitivity', label: 'Expiratory trigger (ETS)', group: 'Ventilator', type: 'number', role: 'setting', unit: '% peak flow', min: 5, max: 80, step: 5, writable: true },
  { id: 'ventilator.simvSyncWindowPercent', label: 'SIMV synchronisation window', group: 'Ventilator', type: 'number', role: 'setting', unit: '% cycle', min: 5, max: 75, step: 5, writable: true },
  { id: 'ventilator.showSimvSyncWindow', label: 'Show SIMV sync window', group: 'Ventilator', type: 'boolean', role: 'setting', writable: true },
  { id: 'ventilator.pHigh', label: 'Phigh', group: 'Ventilator', type: 'number', role: 'setting', unit: 'cmH₂O', min: 10, max: 40, step: 1, writable: true },
  { id: 'ventilator.pLow', label: 'Plow', group: 'Ventilator', type: 'number', role: 'setting', unit: 'cmH₂O', min: 0, max: 15, step: 1, writable: true },
  { id: 'ventilator.tHigh', label: 'Thigh', group: 'Ventilator', type: 'number', role: 'setting', unit: 's', min: 0.5, max: 10, step: 0.1, writable: true },
  { id: 'ventilator.tLow', label: 'Tlow', group: 'Ventilator', type: 'number', role: 'setting', unit: 's', min: 0.2, max: 2, step: 0.05, writable: true },

  { id: 'patient.sex', label: 'Sex', group: 'Patient', type: 'select', role: 'setting', options: [{ value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }], writable: true },
  { id: 'patient.heightCm', label: 'Height', group: 'Patient', type: 'number', role: 'setting', unit: 'cm', min: 90, max: 210, step: 1, writable: true },
  { id: 'patient.oxygenConsumption', label: 'Oxygen consumption (VO₂)', group: 'Physiology', type: 'number', role: 'setting', unit: 'mL/min', min: 100, max: 600, step: 10, writable: true },
  { id: 'patient.frc', label: 'FRC', group: 'Physiology', type: 'number', role: 'setting', unit: 'mL', min: 500, max: 5000, step: 10, writable: true },
  { id: 'patient.shuntFraction', label: 'Shunt fraction', group: 'Physiology', type: 'number', role: 'setting', min: 0, max: 0.5, step: 0.01, writable: true },
  { id: 'patient.maxSpO2', label: 'Maximum SpO₂', group: 'Physiology', type: 'number', role: 'setting', unit: '%', min: 80, max: 100, step: 1, writable: true },
  { id: 'patient.compliance', label: 'Lung compliance', group: 'Patient', type: 'number', role: 'setting', unit: 'mL/cmH₂O', min: 15, max: 100, step: 1, writable: true },
  { id: 'patient.chestWallCompliance', label: 'Chest wall compliance', group: 'Patient', type: 'number', role: 'setting', unit: 'mL/cmH₂O', min: 40, max: 400, step: 5, writable: true },
  { id: 'patient.resistance', label: 'Inspiratory airway resistance', group: 'Patient', type: 'number', role: 'setting', unit: 'cmH₂O/L/s', min: 3, max: 40, step: 1, writable: true },
  { id: 'patient.expiratoryResistance', label: 'Expiratory airway resistance', group: 'Patient', type: 'number', role: 'setting', unit: 'cmH₂O/L/s', min: 3, max: 50, step: 1, writable: true },
  { id: 'patient.expiratoryFlowLimitation', label: 'Expiratory flow limitation', group: 'Patient', type: 'number', role: 'setting', min: 0, max: 1, step: 0.05, writable: true },
  { id: 'patient.spontaneousRate', label: 'Spontaneous respiratory rate', group: 'Patient', type: 'number', role: 'setting', unit: '/min', min: 0, max: 35, step: 1, writable: true },
  { id: 'patient.effort', label: 'Inspiratory effort', group: 'Patient', type: 'number', role: 'setting', unit: 'cmH₂O', min: 0, max: 20, step: 1, writable: true },
  { id: 'patient.neuralInspiratoryTime', label: 'Neural inspiratory time', group: 'Patient', type: 'number', role: 'setting', unit: 's', min: 0.3, max: 3, step: 0.1, writable: true },
  { id: 'patient.effortRisePercent', label: 'Effort rise', group: 'Patient', type: 'number', role: 'setting', unit: '%', min: 5, max: 95, step: 5, writable: true },
  { id: 'patient.effortRelaxationPercent', label: 'Effort relaxation', group: 'Patient', type: 'number', role: 'setting', unit: '%', min: 5, max: 95, step: 5, writable: true },
  { id: 'patient.endExpiratoryOesophagealPressure', label: 'End-expiratory Pes', group: 'Patient', type: 'number', role: 'setting', unit: 'cmH₂O', min: -15, max: 15, step: 0.5, writable: true },
  { id: 'patient.co2Production', label: 'VCO₂ production', group: 'Physiology', type: 'number', role: 'setting', unit: 'mL/min', min: 100, max: 500, step: 10, writable: true },
  { id: 'patient.vdVt', label: 'Vd/Vt', group: 'Physiology', type: 'number', role: 'setting', min: 0.1, max: 0.9, step: 0.05, writable: true },

  { id: 'measurement.peakPressure', label: 'Peak pressure', group: 'Measurements', type: 'number', role: 'measurement', unit: 'cmH₂O' },
  { id: 'measurement.plateauPressure', label: 'Plateau pressure', group: 'Measurements', type: 'number', role: 'measurement', unit: 'cmH₂O' },
  { id: 'measurement.meanPressure', label: 'Mean airway pressure', group: 'Measurements', type: 'number', role: 'measurement', unit: 'cmH₂O' },
  { id: 'measurement.totalPeep', label: 'Total PEEP', group: 'Measurements', type: 'number', role: 'measurement', unit: 'cmH₂O' },
  { id: 'measurement.autoPeep', label: 'AutoPEEP', group: 'Measurements', type: 'number', role: 'measurement', unit: 'cmH₂O' },
  { id: 'measurement.drivingPressure', label: 'Driving pressure', group: 'Measurements', type: 'number', role: 'measurement', unit: 'cmH₂O' },
  { id: 'measurement.expiredTidalVolume', label: 'Expired tidal volume', group: 'Measurements', type: 'number', role: 'measurement', unit: 'mL' },
  { id: 'measurement.totalRespiratoryRate', label: 'Respiratory rate', group: 'Measurements', type: 'number', role: 'measurement', unit: '/min' },
  { id: 'measurement.actualMinuteVentilation', label: 'Minute ventilation', group: 'Measurements', type: 'number', role: 'measurement', unit: 'L/min' },
  { id: 'measurement.alveolarMinuteVentilation', label: 'Alveolar minute ventilation', group: 'Measurements', type: 'number', role: 'measurement', unit: 'L/min' },
  { id: 'measurement.endTidalCO2', label: 'EtCO₂', group: 'Measurements', type: 'number', role: 'measurement', unit: 'mmHg' },
  { id: 'measurement.oxygenSaturation', label: 'SpO₂', group: 'Measurements', type: 'number', role: 'measurement', unit: '%' },
]

const patientTemplateKeys: Array<keyof PatientSettings> = [
  'sex', 'heightCm', 'oxygenConsumption', 'frc', 'shuntFraction', 'maxSpO2', 'compliance',
  'chestWallCompliance', 'resistance', 'expiratoryResistance', 'expiratoryFlowLimitation',
  'spontaneousRate', 'effort', 'neuralInspiratoryTime', 'effortRisePercent', 'effortRelaxationPercent',
  'endExpiratoryOesophagealPressure', 'co2Production', 'vdVt',
]

function patientValues(patient: PatientSettings): Record<string, ScenarioValue> {
  const values: Record<string, ScenarioValue> = {}
  for (const key of patientTemplateKeys) {
    const value = patient[key]
    if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean' || value === null) values[`patient.${String(key)}`] = value
  }
  return values
}

const templates: ScenarioTemplateDefinition[] = [
  { id: 'patient.normal', label: 'Normal', group: 'Patient profiles', values: patientValues(PATIENT_PROFILES.Normal) },
  { id: 'patient.copd', label: 'COPD', group: 'Patient profiles', values: patientValues(PATIENT_PROFILES.COPD) },
  { id: 'patient.asthma', label: 'Asthma', group: 'Patient profiles', values: patientValues(PATIENT_PROFILES.Asthma) },
  { id: 'patient.ards.mild', label: 'ARDS Mild', group: 'Patient profiles', values: patientValues(ARDS_PROFILES.mild) },
  { id: 'patient.ards.moderate', label: 'ARDS Moderate', group: 'Patient profiles', values: patientValues(ARDS_PROFILES.moderate) },
  { id: 'patient.ards.severe', label: 'ARDS Severe', group: 'Patient profiles', values: patientValues(ARDS_PROFILES.severe) },
  { id: 'patient.paediatric', label: 'Paediatric', group: 'Patient profiles', values: patientValues(PATIENT_PROFILES.Paed) },
]

const measurementTriggers: ScenarioTriggerSourceDefinition[] = variables
  .filter((variable) => variable.role === 'measurement')
  .map((variable) => ({ id: `measurement:${variable.id}`, label: variable.label, kind: 'measurement', variableId: variable.id }))

const actionTriggers: ScenarioTriggerSourceDefinition[] = variables
  .filter((variable) => variable.role === 'setting' && variable.writable)
  .flatMap((variable) => [
    { id: `candidate-action:${variable.id}`, label: variable.label, kind: 'candidate-action' as const, variableId: variable.id },
    { id: `instructor-action:${variable.id}`, label: variable.label, kind: 'instructor-action' as const, variableId: variable.id },
  ])

export const VENTILATOR_SCENARIO_MODULE: ScenarioModuleDefinition<InstructorPresetRow> = {
  id: 'ventilator',
  schemaVersion: 1,
  label: 'Mechanical ventilation',
  shortLabel: 'Ventilator',
  description: 'EDUVENT patient, ventilator and physiology scenarios.',
  available: true,
  variables,
  templates,
  triggerSources: [...measurementTriggers, ...actionTriggers],
  supportsPreset: (preset) => preset.scenario.kind === 'dynamic',
}
