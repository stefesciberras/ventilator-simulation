import type { SimulationProductSessionContract } from '../core/SimulationProductAdapter'
import type { SessionMemberRow, TeachingSessionRow } from '../session/supabase'
import type { PatientSettings, VentilatorSettings } from '../simulation/types'

function asSession(value: unknown): TeachingSessionRow { return value as TeachingSessionRow }
function asMember(value: unknown): SessionMemberRow { return value as SessionMemberRow }
function hasVentilatorSettings(value: SessionMemberRow['ventilator_settings']): value is VentilatorSettings { return Boolean(value && typeof value === 'object' && 'mode' in value) }
function hasPatientSettings(value: SessionMemberRow['patient_settings']): value is PatientSettings { return Boolean(value && typeof value === 'object' && 'compliance' in value) }

export const EDUVENT_SESSION_CONTRACT: SimulationProductSessionContract = {
  domains: [
    {
      id: 'patient',
      title: 'Patient',
      status: (value) => asSession(value).sync_patient ? 'Shared' : 'Local',
      active: (value) => Boolean(asSession(value).sync_patient),
      rows: [
        { id: 'controls', label: 'Show Controls view to candidate', checked: (value) => asSession(value).candidate_controls_visible !== false, emphasis: true, patch: (checked) => ({ candidateControlsVisible: checked }) },
        { id: 'share', label: 'Share patient settings', checked: (value) => Boolean(asSession(value).sync_patient), patch: (checked) => ({ syncPatient: checked }) },
        { id: 'edit', label: 'Candidate may change', checked: (value) => Boolean(asSession(value).candidate_can_edit_patient), disabled: (value) => !asSession(value).sync_patient, patch: (checked) => ({ candidateCanEditPatient: checked }) },
        { id: 'effort', label: 'Show patient effort to candidate', checked: (value) => Boolean(asSession(value).show_patient_effort), patch: (checked) => ({ showPatientEffort: checked }) },
      ],
    },
    {
      id: 'device',
      title: 'Ventilator',
      status: (value) => asSession(value).sync_ventilator ? 'Shared' : 'Local',
      active: (value) => Boolean(asSession(value).sync_ventilator),
      rows: [
        { id: 'share', label: 'Share ventilator settings', checked: (value) => Boolean(asSession(value).sync_ventilator), patch: (checked) => ({ syncVentilator: checked }) },
        { id: 'edit', label: 'Candidate may change', checked: (value) => Boolean(asSession(value).candidate_can_edit_ventilator), disabled: (value) => !asSession(value).sync_ventilator, patch: (checked) => ({ candidateCanEditVentilator: checked }) },
        { id: 'waveforms', label: 'Candidate may change waveforms', checked: (value) => Boolean(asSession(value).candidate_can_edit_waveforms), patch: (checked) => ({ candidateCanEditWaveforms: checked }) },
        { id: 'pes', label: 'Allow oesophageal pressure', checked: (value) => Boolean(asSession(value).allow_oesophageal_pressure), patch: (checked) => ({ allowOesophagealPressure: checked }) },
      ],
    },
    {
      id: 'alarms',
      title: 'Alarms',
      status: (value) => asSession(value).sync_alarms ? 'Shared' : 'Local',
      active: (value) => Boolean(asSession(value).sync_alarms),
      rows: [
        { id: 'share', label: 'Share alarm settings', checked: (value) => Boolean(asSession(value).sync_alarms), patch: (checked) => ({ syncAlarms: checked }) },
        { id: 'edit', label: 'Candidate may change', checked: (value) => Boolean(asSession(value).candidate_can_edit_alarms), disabled: (value) => !asSession(value).sync_alarms, patch: (checked) => ({ candidateCanEditAlarms: checked }) },
        { id: 'silent', label: 'Keep candidate alarms silent', checked: (value) => Boolean(asSession(value).alarms_silent), disabled: (value) => !asSession(value).sync_alarms, emphasis: true, patch: (checked) => ({ alarmsSilent: checked }) },
      ],
    },
  ],
  candidateStatus: [
    { id: 'patient', state: (value) => asSession(value).sync_patient && !asSession(value).candidate_can_edit_patient ? 'locked' : 'available', text: (value) => `Patient: ${asSession(value).sync_patient ? (asSession(value).candidate_can_edit_patient ? 'shared / editable' : 'instructor controlled') : 'candidate local'}` },
    { id: 'device', state: (value) => asSession(value).sync_ventilator && !asSession(value).candidate_can_edit_ventilator ? 'locked' : 'available', text: (value) => `Ventilator: ${asSession(value).sync_ventilator ? (asSession(value).candidate_can_edit_ventilator ? 'shared / editable' : 'instructor controlled') : 'candidate local'}` },
    { id: 'waveforms', state: (value) => !asSession(value).candidate_can_edit_waveforms ? 'locked' : 'available', text: (value) => `Waveforms: ${asSession(value).candidate_can_edit_waveforms ? 'editable' : 'instructor locked'} • Oesophageal pressure: ${asSession(value).allow_oesophageal_pressure ? 'available' : 'hidden'}` },
    { id: 'alarms', state: (value) => asSession(value).sync_alarms && !asSession(value).candidate_can_edit_alarms ? 'locked' : 'available', text: (value) => `Alarms: ${asSession(value).sync_alarms ? (asSession(value).candidate_can_edit_alarms ? 'shared / editable' : 'instructor controlled') : 'candidate local'}${asSession(value).sync_alarms && asSession(value).alarms_silent ? ' / silent' : ''}` },
  ],
  telemetry: [
    { id: 'mode', label: 'Mode', value: (value) => { const vent = asMember(value).ventilator_settings; return hasVentilatorSettings(vent) ? vent.mode : '—' } },
    { id: 'fio2', label: 'FiO₂', value: (value) => { const vent = asMember(value).ventilator_settings; return hasVentilatorSettings(vent) ? `${Math.round(vent.fio2 * 100)}%` : '—' } },
    { id: 'peep', label: 'PEEP', value: (value) => { const vent = asMember(value).ventilator_settings; return hasVentilatorSettings(vent) ? String(vent.peep) : '—' } },
    { id: 'rr', label: 'RR set', value: (value) => { const vent = asMember(value).ventilator_settings; return hasVentilatorSettings(vent) ? String(vent.rate) : '—' } },
    { id: 'compliance', label: 'Compliance', value: (value) => { const patient = asMember(value).patient_settings; return hasPatientSettings(patient) ? patient.compliance.toFixed(0) : '—' } },
    { id: 'resistance', label: 'Rinsp', value: (value) => { const patient = asMember(value).patient_settings; return hasPatientSettings(patient) ? patient.resistance.toFixed(0) : '—' } },
    { id: 'spontaneous-rate', label: 'Spont RR', value: (value) => { const patient = asMember(value).patient_settings; return hasPatientSettings(patient) ? patient.spontaneousRate.toFixed(0) : '—' } },
    { id: 'effort', label: 'Effort', value: (value) => { const patient = asMember(value).patient_settings; return hasPatientSettings(patient) ? patient.effort.toFixed(0) : '—' } },
  ],
}
