import type { SimulationProductSessionContract } from '../core/SimulationProductAdapter'
import type { ProductTeachingMemberRow, ProductTeachingSessionRow } from '../teaching/session/productSession'
import { RHYTHM_LABELS } from './monitorEngine'
import type { EdumonTeachingState } from './teachingState'

function asSession(value: unknown): ProductTeachingSessionRow<EdumonTeachingState> { return value as ProductTeachingSessionRow<EdumonTeachingState> }
function asMember(value: unknown): ProductTeachingMemberRow<EdumonTeachingState> { return value as ProductTeachingMemberRow<EdumonTeachingState> }

export const EDUMON_SESSION_CONTRACT: SimulationProductSessionContract = {
  domains: [
    {
      id: 'patient',
      title: 'Patient',
      status: () => 'Shared',
      active: () => true,
      rows: [
        { id: 'state', label: 'Patient state follows instructor', checked: () => true },
      ],
    },
    {
      id: 'alarms',
      title: 'Alarms',
      status: () => 'Shared',
      active: () => true,
      rows: [
        { id: 'limits', label: 'Alarm limits follow instructor', checked: () => true },
      ],
    },
    {
      id: 'display',
      title: 'Display',
      status: (value) => asSession(value).product_state?.simulationPaused ? 'Paused' : 'Shared',
      active: () => true,
      rows: [
        { id: 'timing', label: 'Pause and simulation speed follow instructor', checked: () => true },
      ],
    },
  ],
  candidateStatus: [
    { id: 'patient', state: () => 'locked', text: () => 'Patient: instructor controlled' },
    { id: 'alarms', state: () => 'locked', text: () => 'Alarms: instructor controlled' },
    { id: 'display', state: () => 'locked', text: (value) => `Display: ${asSession(value).product_state?.simulationPaused ? 'paused by instructor' : 'shared timing'}` },
  ],
  telemetry: [
    { id: 'rhythm', label: 'Rhythm', value: (value) => { const patient = asMember(value).product_state?.patient; return patient ? RHYTHM_LABELS[patient.rhythm] : '—' } },
    { id: 'hr', label: 'HR', value: (value) => { const patient = asMember(value).product_state?.patient; return patient ? String(Math.round(patient.heartRate)) : '—' } },
    { id: 'art', label: 'ART', value: (value) => { const patient = asMember(value).product_state?.patient; return patient ? `${Math.round(patient.systolicPressure)}/${Math.round(patient.diastolicPressure)}` : '—' } },
    { id: 'spo2', label: 'SpO₂', value: (value) => { const patient = asMember(value).product_state?.patient; return patient ? `${Math.round(patient.spo2)}%` : '—' } },
  ],
}
