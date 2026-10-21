import type { SessionRole } from '../session/useTeachingSession'
import type { SessionMemberRow } from '../session/supabase'
import type { PatientSettings, VentilatorSettings } from '../simulation/types'
import { SharedInstructorLiveRoom } from '../teaching/session'
export { EduventSessionPanel as SessionPanel } from '../eduvent/EduventSessionPanel'

function hasVentilatorSettings(value: SessionMemberRow['ventilator_settings']): value is VentilatorSettings {
  return Boolean(value && typeof value === 'object' && 'mode' in value)
}
function hasPatientSettings(value: SessionMemberRow['patient_settings']): value is PatientSettings {
  return Boolean(value && typeof value === 'object' && 'compliance' in value)
}

/** Compatibility export for the Teaching tab; the implementation is shared core. */
export function InstructorLiveRoom({ role, members }: { role: SessionRole; members: SessionMemberRow[] }) {
  return <SharedInstructorLiveRoom
    role={role}
    members={members}
    storageKey="eduvent-instructor-live-room"
    renderTelemetry={(member) => {
      const row = member as SessionMemberRow
      const vent = hasVentilatorSettings(row.ventilator_settings) ? row.ventilator_settings : null
      const patient = hasPatientSettings(row.patient_settings) ? row.patient_settings : null
      return <div className="candidate-state-grid">
        <div><span>Mode</span><strong>{vent?.mode ?? '—'}</strong></div>
        <div><span>FiO₂</span><strong>{vent ? `${Math.round(vent.fio2 * 100)}%` : '—'}</strong></div>
        <div><span>PEEP</span><strong>{vent?.peep ?? '—'}</strong></div>
        <div><span>RR set</span><strong>{vent?.rate ?? '—'}</strong></div>
        <div><span>Compliance</span><strong>{patient ? patient.compliance.toFixed(0) : '—'}</strong></div>
        <div><span>Rinsp</span><strong>{patient ? patient.resistance.toFixed(0) : '—'}</strong></div>
        <div><span>Spont RR</span><strong>{patient ? patient.spontaneousRate.toFixed(0) : '—'}</strong></div>
        <div><span>Effort</span><strong>{patient ? patient.effort.toFixed(0) : '—'}</strong></div>
      </div>
    }}
  />
}
