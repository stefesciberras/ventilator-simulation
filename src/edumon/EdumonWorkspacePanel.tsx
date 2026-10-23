import { useEffect, useState, type ReactNode } from 'react'
import { DEFAULT_MONITOR_RESPIRATORY_SETTINGS, type MonitorPatientState, type MonitorRespiratorySettings } from './types'
import { ECG_MORPHOLOGIES, ECG_MORPHOLOGY_LABELS, RHYTHM_LABELS, RHYTHMS } from './monitorEngine'
import type { TeachingHostAdapter, TeachingRole } from '../teaching/types'
import { EdumonTeachingLibraries } from './EdumonTeachingLibraries'
import { EdumonNibpControl } from './EdumonNibpControl'
import { EdumonCapnographySurface } from './EdumonCapnographySurface'
import { EdumonAnaGasControl } from './EdumonAnaGasControl'
import { EdumonVentilatorControl } from './EdumonVentilatorControl'
import { SimulationControlFramework, type SimulationControlProfileDefinition, type SimulationControlTabDefinition } from '../components/SimulationControlFramework'
import { SimulationTransitionTimeControl } from '../components/SimulationTransitionTimeControl'
import './edumon-rhythm-control.css'

export type EdumonControlTab = 'actions' | 'patient' | 'physio' | 'teaching'
export type EdumonPatientProfile = 'Awake' | 'Asleep' | 'Paediatric'

export const EDUMON_PATIENT_PROFILES: Record<EdumonPatientProfile, MonitorPatientState> = {
  Awake: { heartRate: 78, rhythm: 'sinus', ecgMorphology: 'nil', morphologySeverity: 50, systolicPressure: 122, diastolicPressure: 68, spo2: 98, peripheralPerfusion: 1 },
  Asleep: { heartRate: 62, rhythm: 'sinus', ecgMorphology: 'nil', morphologySeverity: 50, systolicPressure: 105, diastolicPressure: 60, spo2: 99, peripheralPerfusion: 0.9 },
  Paediatric: { heartRate: 110, rhythm: 'sinus', ecgMorphology: 'nil', morphologySeverity: 50, systolicPressure: 95, diastolicPressure: 55, spo2: 99, peripheralPerfusion: 1 },
}

interface EdumonWorkspacePanelProps {
  patientState: MonitorPatientState
  onPatientStateChange: (state: MonitorPatientState) => void
  transitionSeconds: number
  onTransitionSecondsChange: (seconds: number) => void
  teachingHost: TeachingHostAdapter
  teachingRole?: TeachingRole
  teachingSessionId?: string | null
  candidateCount?: number
  controlsLocked?: boolean
  sessionPanel?: ReactNode
  meanPressure: number | null
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

export function EdumonWorkspacePanel({
  patientState,
  onPatientStateChange,
  transitionSeconds,
  onTransitionSecondsChange,
  teachingHost,
  teachingRole = 'standalone',
  teachingSessionId = null,
  candidateCount = 0,
  controlsLocked = false,
  sessionPanel,
}: EdumonWorkspacePanelProps) {
  const [tab, setTab] = useState<EdumonControlTab>('patient')
  const [profile, setProfile] = useState<EdumonPatientProfile>('Awake')
  const [pressuresCoupled, setPressuresCoupled] = useState(false)
  const [showInvasiveBloodPressure, setShowInvasiveBloodPressure] = useState(true)
  const respiratory: MonitorRespiratorySettings = {
    ...DEFAULT_MONITOR_RESPIRATORY_SETTINGS,
    ...(patientState.respiratory ?? {}),
  }

  useEffect(() => {
    const root = document.documentElement
    root.setAttribute('data-edumon-invasive-bp-visible', showInvasiveBloodPressure ? 'true' : 'false')
    return () => root.removeAttribute('data-edumon-invasive-bp-visible')
  }, [showInvasiveBloodPressure])

  const applyProfile = (nextProfile: EdumonPatientProfile) => {
    if (controlsLocked) return
    setProfile(nextProfile)
    onPatientStateChange({
      ...EDUMON_PATIENT_PROFILES[nextProfile],
      respiratory: patientState.respiratory,
      anaestheticGases: patientState.anaestheticGases,
    })
  }

  const updateRhythm = (rhythm: MonitorPatientState['rhythm']) => {
    if (controlsLocked) return
    let heartRate = patientState.heartRate
    if (rhythm === 'sinus-bradycardia' && heartRate >= 60) heartRate = 48
    if (rhythm === 'sinus-tachycardia' && heartRate <= 100) heartRate = 125
    if (rhythm === 'svt' && heartRate < 140) heartRate = 180
    if (rhythm === 'ventricular-tachycardia' && heartRate < 110) heartRate = 160
    if (rhythm === 'sinus' && (heartRate < 60 || heartRate > 100)) heartRate = 78
    onPatientStateChange({ ...patientState, rhythm, heartRate })
  }

  const updatePatient = (patch: Partial<MonitorPatientState>) => {
    if (controlsLocked) return
    const next = { ...patientState, ...patch }
    if (next.systolicPressure <= next.diastolicPressure) {
      if (patch.diastolicPressure != null && patch.systolicPressure == null) next.diastolicPressure = Math.max(20, next.systolicPressure - 1)
      else next.systolicPressure = Math.min(220, next.diastolicPressure + 1)
    }
    onPatientStateChange(next)
  }

  const updateRespiratory = (patch: Partial<MonitorRespiratorySettings>) => {
    if (controlsLocked) return
    const nextRespiratory = { ...respiratory, ...patch }
    nextRespiratory.deadSpaceMl = Math.min(nextRespiratory.deadSpaceMl, Math.max(0, nextRespiratory.tidalVolumeMl))
    onPatientStateChange({ ...patientState, respiratory: nextRespiratory })
  }

  const updateSystolicPressure = (value: number) => {
    if (controlsLocked) return
    let systolicPressure = clamp(value, 40, 220)
    let diastolicPressure = patientState.diastolicPressure
    if (pressuresCoupled) {
      const delta = systolicPressure - patientState.systolicPressure
      diastolicPressure = clamp(patientState.diastolicPressure + delta * 0.3, 20, 140)
    }
    if (systolicPressure <= diastolicPressure) systolicPressure = Math.min(220, diastolicPressure + 1)
    onPatientStateChange({ ...patientState, systolicPressure, diastolicPressure })
  }

  const updateDiastolicPressure = (value: number) => {
    if (controlsLocked) return
    let diastolicPressure = clamp(value, 20, 140)
    let systolicPressure = patientState.systolicPressure
    if (pressuresCoupled) {
      const delta = diastolicPressure - patientState.diastolicPressure
      systolicPressure = clamp(patientState.systolicPressure + delta * 0.3, 40, 220)
    }
    if (diastolicPressure >= systolicPressure) diastolicPressure = Math.max(20, systolicPressure - 1)
    onPatientStateChange({ ...patientState, systolicPressure, diastolicPressure })
  }

  const morphology = patientState.ecgMorphology ?? 'nil'
  const morphologySeverity = patientState.morphologySeverity ?? 50

  const profiles: Array<SimulationControlProfileDefinition<EdumonPatientProfile>> = (Object.keys(EDUMON_PATIENT_PROFILES) as EdumonPatientProfile[]).map((candidate) => ({
    id: candidate,
    label: candidate,
    active: profile === candidate,
    disabled: controlsLocked,
    className: profile === candidate ? 'profile-selected' : '',
    title: controlsLocked ? 'Patient profile controlled by instructor' : `Apply ${candidate} profile`,
    onSelect: applyProfile,
  }))

  const tabs: Array<SimulationControlTabDefinition<EdumonControlTab>> = [
    { id: 'actions', label: 'ACTIONS', content: <div className="edumon-empty-actions" aria-label="Actions" /> },
    {
      id: 'patient',
      label: 'PATIENT',
      locked: controlsLocked,
      content: (
        <section className="control-section edumon-patient-controls">
          <div className="control-section-title"><h2>Patient</h2><span className="edumon-profile-badge">{controlsLocked ? 'Instructor controlled' : profile}</span></div>
          <div className="patient-transition-control">
            <SimulationTransitionTimeControl value={transitionSeconds} onChange={onTransitionSecondsChange} disabled={controlsLocked} showValue={false} />
          </div>
          <label className="edumon-select-control edumon-signal-control edumon-signal-ecg">
            <span>Rhythm <b>{RHYTHM_LABELS[patientState.rhythm]}</b></span>
            <select disabled={controlsLocked} value={patientState.rhythm} onChange={(event) => updateRhythm(event.target.value as MonitorPatientState['rhythm'])}>
              {RHYTHMS.map((rhythm) => <option key={rhythm} value={rhythm}>{RHYTHM_LABELS[rhythm]}</option>)}
            </select>
          </label>
          <label className="edumon-select-control edumon-signal-control edumon-signal-ecg">
            <span>Morphology <b>{ECG_MORPHOLOGY_LABELS[morphology]}</b></span>
            <select disabled={controlsLocked} value={morphology} onChange={(event) => updatePatient({ ecgMorphology: event.target.value as MonitorPatientState['ecgMorphology'] })}>
              {ECG_MORPHOLOGIES.map((candidate) => <option key={candidate} value={candidate}>{ECG_MORPHOLOGY_LABELS[candidate]}</option>)}
            </select>
          </label>
          {morphology !== 'nil' && (
            <label className="edumon-morphology-severity edumon-signal-control edumon-signal-ecg">
              <span>Severity <b>{Math.round(morphologySeverity)}%</b></span>
              <input disabled={controlsLocked} type="range" min="0" max="100" step="1" value={morphologySeverity} onChange={(event) => updatePatient({ morphologySeverity: Number(event.target.value) })} />
            </label>
          )}
          <label className="edumon-signal-control edumon-signal-ecg"><span>Heart rate <b>{Math.round(patientState.heartRate)}</b></span><input disabled={controlsLocked} type="range" min="30" max="220" step="1" value={patientState.heartRate} onChange={(event) => updatePatient({ heartRate: Number(event.target.value) })} /></label>
          <div className="edumon-art-options" aria-label="Arterial pressure options">
            <label className="edumon-inline-checkbox edumon-signal-control edumon-signal-art">
              <input disabled={controlsLocked} type="checkbox" checked={pressuresCoupled} onChange={(event) => setPressuresCoupled(event.target.checked)} />
              <span>Couple pressures</span>
            </label>
            <label className="edumon-inline-checkbox edumon-signal-control edumon-signal-art">
              <input disabled={controlsLocked} type="checkbox" checked={showInvasiveBloodPressure} onChange={(event) => setShowInvasiveBloodPressure(event.target.checked)} />
              <span>Show invasive blood pressure</span>
            </label>
          </div>
          <label className="edumon-signal-control edumon-signal-art"><span>Systolic pressure <b>{Math.round(patientState.systolicPressure)}</b></span><input disabled={controlsLocked} type="range" min="40" max="220" step="1" value={patientState.systolicPressure} onChange={(event) => updateSystolicPressure(Number(event.target.value))} /></label>
          <label className="edumon-signal-control edumon-signal-art"><span>Diastolic pressure <b>{Math.round(patientState.diastolicPressure)}</b></span><input disabled={controlsLocked} type="range" min="20" max="140" step="1" value={patientState.diastolicPressure} onChange={(event) => updateDiastolicPressure(Number(event.target.value))} /></label>
          <label className="edumon-signal-control edumon-signal-spo2"><span>SpO₂ ceiling <b>{Math.round(patientState.spo2)}%</b></span><input disabled={controlsLocked} type="range" min="50" max="100" step="1" value={patientState.spo2} onChange={(event) => updatePatient({ spo2: Number(event.target.value) })} /></label>
          <label className="edumon-signal-control edumon-signal-spo2"><span>Peripheral perfusion <b>{patientState.peripheralPerfusion.toFixed(1)}</b></span><input disabled={controlsLocked} type="range" min="0" max="1" step="0.1" value={patientState.peripheralPerfusion} onChange={(event) => updatePatient({ peripheralPerfusion: Number(event.target.value) })} /></label>
        </section>
      ),
    },
    {
      id: 'physio',
      label: 'PHYSIO',
      locked: controlsLocked,
      content: (
        <section className="control-section edumon-physio-panel">
          <div className="control-section-title"><h2>Respiratory / gas exchange</h2></div>
          <label className="edumon-signal-control edumon-signal-capnography"><span>Patient respiratory rate <b>{Math.round(respiratory.spontaneousRespiratoryRate)}/min</b></span><input disabled={controlsLocked} type="range" min="0" max="40" step="1" value={respiratory.spontaneousRespiratoryRate} onChange={(event) => updateRespiratory({ spontaneousRespiratoryRate: Number(event.target.value) })} /></label>
          <label className="edumon-signal-control edumon-signal-capnography"><span>Dead space <b>{Math.round(respiratory.deadSpaceMl)} mL</b></span><input disabled={controlsLocked} type="range" min="0" max={Math.max(0, respiratory.tidalVolumeMl)} step="10" value={respiratory.deadSpaceMl} onChange={(event) => updateRespiratory({ deadSpaceMl: Number(event.target.value) })} /></label>
          <label className="edumon-signal-control edumon-signal-capnography"><span>VCO₂ <b>{Math.round(respiratory.co2ProductionMlMin)} mL/min</b></span><input disabled={controlsLocked} type="range" min="50" max="600" step="10" value={respiratory.co2ProductionMlMin} onChange={(event) => updateRespiratory({ co2ProductionMlMin: Number(event.target.value) })} /></label>
          <label className="edumon-signal-control edumon-signal-capnography"><span>VO₂ <b>{Math.round(respiratory.oxygenConsumptionMlMin)} mL/min</b></span><input disabled={controlsLocked} type="range" min="50" max="600" step="10" value={respiratory.oxygenConsumptionMlMin} onChange={(event) => updateRespiratory({ oxygenConsumptionMlMin: Number(event.target.value) })} /></label>
        </section>
      ),
    },
    {
      id: 'teaching',
      label: 'TEACHING',
      content: (
        <div className="edumon-side-teaching">
          <EdumonTeachingLibraries
            host={teachingHost}
            role={teachingRole}
            sessionId={teachingSessionId}
            candidateCount={candidateCount}
            sessionPanel={sessionPanel}
          />
        </div>
      ),
    },
  ]

  return (
    <>
      <EdumonNibpControl patientState={patientState} />
      <EdumonCapnographySurface patientState={patientState} />
      <EdumonVentilatorControl patientState={patientState} onPatientStateChange={onPatientStateChange} disabled={controlsLocked} />
      {teachingHost.appId === 'edumon-ana' && (
        <EdumonAnaGasControl
          patientState={patientState}
          onPatientStateChange={onPatientStateChange}
          sideControlsLocked={controlsLocked}
        />
      )}
      <SimulationControlFramework
        activeTab={tab}
        tabs={tabs}
        onTabChange={setTab}
        profiles={profiles}
        ariaLabel="EDUMON controls"
        className="edumon-side-panel"
        tabsClassName="edumon-control-tabs"
        bodyClassName="edumon-side-panel-body"
        profileClassName="edumon-profile-strip"
      />
    </>
  )
}
