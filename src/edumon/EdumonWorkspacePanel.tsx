import { useState } from 'react'
import type { MonitorPatientState } from './types'
import { RHYTHM_LABELS, RHYTHMS } from './monitorEngine'
import type { TeachingHostAdapter } from '../teaching/types'
import { EdumonTeachingLibraries } from './EdumonTeachingLibraries'
import { SimulationControlPanel, SimulationProfileStrip, type SimulationControlTab } from '../components/SimulationControlPanel'
import './edumon-rhythm-control.css'

export type EdumonControlTab = 'actions' | 'patient' | 'physio' | 'teaching'
export type EdumonPatientProfile = 'Awake' | 'Asleep' | 'Paediatric'

export const EDUMON_PATIENT_PROFILES: Record<EdumonPatientProfile, MonitorPatientState> = {
  Awake: { heartRate: 78, rhythm: 'sinus', systolicPressure: 122, diastolicPressure: 68, spo2: 98, peripheralPerfusion: 1 },
  Asleep: { heartRate: 62, rhythm: 'sinus', systolicPressure: 105, diastolicPressure: 60, spo2: 99, peripheralPerfusion: 0.9 },
  Paediatric: { heartRate: 110, rhythm: 'sinus', systolicPressure: 95, diastolicPressure: 55, spo2: 99, peripheralPerfusion: 1 },
}

const CONTROL_TABS: Array<SimulationControlTab<EdumonControlTab>> = [
  { id: 'actions', label: 'ACTIONS' },
  { id: 'patient', label: 'PATIENT' },
  { id: 'physio', label: 'PHYSIO' },
  { id: 'teaching', label: 'TEACHING' },
]

interface EdumonWorkspacePanelProps {
  patientState: MonitorPatientState
  onPatientStateChange: (state: MonitorPatientState) => void
  teachingHost: TeachingHostAdapter
  meanPressure: number | null
}

export function EdumonWorkspacePanel({ patientState, onPatientStateChange, teachingHost, meanPressure }: EdumonWorkspacePanelProps) {
  const [tab, setTab] = useState<EdumonControlTab>('patient')
  const [profile, setProfile] = useState<EdumonPatientProfile>('Awake')

  const applyProfile = (nextProfile: EdumonPatientProfile) => {
    setProfile(nextProfile)
    onPatientStateChange({ ...EDUMON_PATIENT_PROFILES[nextProfile] })
  }

  const updateRhythm = (rhythm: MonitorPatientState['rhythm']) => {
    let heartRate = patientState.heartRate
    if (rhythm === 'sinus-bradycardia' && heartRate >= 60) heartRate = 48
    if (rhythm === 'sinus-tachycardia' && heartRate <= 100) heartRate = 125
    if (rhythm === 'svt' && heartRate < 140) heartRate = 180
    if (rhythm === 'ventricular-tachycardia' && heartRate < 110) heartRate = 160
    if (rhythm === 'sinus' && (heartRate < 60 || heartRate > 100)) heartRate = 78
    onPatientStateChange({ ...patientState, rhythm, heartRate })
  }

  const profileStrip = (
    <SimulationProfileStrip
      profiles={Object.keys(EDUMON_PATIENT_PROFILES) as EdumonPatientProfile[]}
      activeProfile={profile}
      onProfileChange={applyProfile}
      className="edumon-profile-strip"
    />
  )

  return (
    <SimulationControlPanel
      activeTab={tab}
      tabs={CONTROL_TABS}
      onTabChange={setTab}
      profileStrip={profileStrip}
      ariaLabel="EDUMON controls"
      className="edumon-side-panel"
      tabsClassName="edumon-control-tabs"
      bodyClassName="edumon-side-panel-body"
    >
      {tab === 'actions' && <div className="edumon-empty-actions" aria-label="Actions" />}
      {tab === 'patient' && (
        <section className="control-section edumon-patient-controls">
          <div className="control-section-title"><h2>Patient</h2><span className="edumon-profile-badge">{profile}</span></div>
          <label className="edumon-rhythm-control">
            <span>Rhythm <b>{RHYTHM_LABELS[patientState.rhythm]}</b></span>
            <select value={patientState.rhythm} onChange={(event) => updateRhythm(event.target.value as MonitorPatientState['rhythm'])}>
              {RHYTHMS.map((rhythm) => <option key={rhythm} value={rhythm}>{RHYTHM_LABELS[rhythm]}</option>)}
            </select>
          </label>
          <label><span>Heart rate <b>{Math.round(patientState.heartRate)}</b></span><input type="range" min="30" max="220" step="1" value={patientState.heartRate} onChange={(event) => onPatientStateChange({ ...patientState, heartRate: Number(event.target.value) })} /></label>
          <label><span>Systolic pressure <b>{Math.round(patientState.systolicPressure)}</b></span><input type="range" min="40" max="220" step="1" value={patientState.systolicPressure} onChange={(event) => onPatientStateChange({ ...patientState, systolicPressure: Number(event.target.value) })} /></label>
          <label><span>Diastolic pressure <b>{Math.round(patientState.diastolicPressure)}</b></span><input type="range" min="20" max="140" step="1" value={patientState.diastolicPressure} onChange={(event) => onPatientStateChange({ ...patientState, diastolicPressure: Number(event.target.value) })} /></label>
          <label><span>SpO₂ <b>{Math.round(patientState.spo2)}%</b></span><input type="range" min="50" max="100" step="1" value={patientState.spo2} onChange={(event) => onPatientStateChange({ ...patientState, spo2: Number(event.target.value) })} /></label>
          <label><span>Peripheral perfusion <b>{patientState.peripheralPerfusion.toFixed(1)}</b></span><input type="range" min="0" max="1" step="0.1" value={patientState.peripheralPerfusion} onChange={(event) => onPatientStateChange({ ...patientState, peripheralPerfusion: Number(event.target.value) })} /></label>
        </section>
      )}
      {tab === 'physio' && (
        <section className="control-section edumon-physio-panel">
          <div className="control-section-title"><h2>Physiology</h2></div>
          <div className="edumon-physio-grid">
            <div><span>MAP</span><strong>{meanPressure ?? '—'}</strong><small>mmHg</small></div>
            <div><span>Pulse pressure</span><strong>{Math.max(0, Math.round(patientState.systolicPressure - patientState.diastolicPressure))}</strong><small>mmHg</small></div>
            <div><span>SpO₂ target</span><strong>{Math.round(patientState.spo2)}</strong><small>%</small></div>
            <div><span>Perfusion</span><strong>{patientState.peripheralPerfusion.toFixed(1)}</strong><small>relative</small></div>
          </div>
        </section>
      )}
      {tab === 'teaching' && <div className="edumon-side-teaching"><EdumonTeachingLibraries host={teachingHost} /></div>}
    </SimulationControlPanel>
  )
}
