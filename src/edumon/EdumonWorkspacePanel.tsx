import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { DEFAULT_MONITOR_RESPIRATORY_SETTINGS, type AnaestheticDepth, type MonitorPatientState, type MonitorRespiratorySettings } from './types'
import { applyAnaestheticDepthEffects, resolvedAnaestheticPhysiology } from './anaestheticPhysiology'
import { applyEdumonActionPhysiology } from './actionPhysiology'
import { getActionRuntimeSimulationTime, supersedeActionTarget } from '../edusim/actions/ActionRuntime'
import { ECG_MORPHOLOGIES, ECG_MORPHOLOGY_LABELS, RHYTHM_LABELS, RHYTHMS } from './monitorEngine'
import type { TeachingHostAdapter, TeachingRole } from '../teaching/types'
import { EdumonTeachingLibraries } from './EdumonTeachingLibraries'
import { EdumonNibpControl } from './EdumonNibpControl'
import { EdumonCapnographySurface } from './EdumonCapnographySurface'
import { EdumonTemperatureSurface } from './EdumonTemperatureSurface'
import { EdumonAnaGasControl } from './EdumonAnaGasControl'
import { EdumonVentilatorControl } from './EdumonVentilatorControl'
import { EdumonActionsPanel } from './EdumonActionsPanel'
import { SimulationControlFramework, type SimulationControlProfileDefinition, type SimulationControlTabDefinition } from '../components/SimulationControlFramework'
import { SimulationTransitionTimeControl } from '../components/SimulationTransitionTimeControl'
import { EDUMON_PATIENT_PROFILES } from './patientProfiles'
import { EDUMON_PROFILE_KEYS } from '../profiles/builtinProfiles'
import { useProductProfiles } from '../profiles/useProductProfiles'
import './edumon-rhythm-control.css'

export type EdumonControlTab = 'actions' | 'patient' | 'physio' | 'teaching'
interface EdumonWorkspacePanelProps {
  patientState: MonitorPatientState
  onPatientStateChange: (state: MonitorPatientState) => void
  transitionSeconds: number
  onTransitionSecondsChange: (seconds: number) => void
  teachingHost: TeachingHostAdapter
  teachingRole?: TeachingRole
  teachingSessionId?: string | null
  candidateCount?: number
  patientControlsLocked?: boolean
  deviceControlsLocked?: boolean
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
  patientControlsLocked = false,
  deviceControlsLocked = false,
  sessionPanel,
}: EdumonWorkspacePanelProps) {
  const [tab, setTab] = useState<EdumonControlTab>('patient')
  const [profile, setProfile] = useState<string>('Awake')
  const profileProduct = teachingHost.appId.toLowerCase().includes('icu') ? 'icu' as const : 'anaesth' as const
  const { rows: savedProfiles } = useProductProfiles<MonitorPatientState>(profileProduct)
  const resolvedProfiles = useMemo<Record<string, MonitorPatientState>>(() => {
    const result: Record<string, MonitorPatientState> = { ...EDUMON_PATIENT_PROFILES }
    for (const [name, baseKey] of Object.entries(EDUMON_PROFILE_KEYS)) {
      const override = savedProfiles.find((row) => row.base_key === baseKey)
      if (override) result[name] = { ...result[name], ...override.values }
    }
    for (const row of savedProfiles.filter((candidate) => !candidate.base_key)) result[row.name] = row.values
    return result
  }, [savedProfiles])
  const [pressuresCoupled, setPressuresCoupled] = useState(false)
  const [showInvasiveBloodPressure, setShowInvasiveBloodPressure] = useState(true)
  const respiratory: MonitorRespiratorySettings = {
    ...DEFAULT_MONITOR_RESPIRATORY_SETTINGS,
    ...(patientState.respiratory ?? {}),
  }
  const modelledPatientState = applyEdumonActionPhysiology(patientState, getActionRuntimeSimulationTime())
  const modelledRespiratory: MonitorRespiratorySettings = {
    ...DEFAULT_MONITOR_RESPIRATORY_SETTINGS,
    ...(modelledPatientState.respiratory ?? {}),
  }
  const anaestheticPhysiology = resolvedAnaestheticPhysiology(patientState)

  useEffect(() => {
    const root = document.documentElement
    root.setAttribute('data-edumon-invasive-bp-visible', showInvasiveBloodPressure ? 'true' : 'false')
    return () => root.removeAttribute('data-edumon-invasive-bp-visible')
  }, [showInvasiveBloodPressure])

  const applyProfile = (nextProfile: string) => {
    if (patientControlsLocked) return
    const values = resolvedProfiles[nextProfile]
    if (!values) return
    setProfile(nextProfile)
    supersedeActionTarget('haemodynamics.heartRate')
    supersedeActionTarget('haemodynamics.meanArterialPressure')
    onPatientStateChange({
      ...values,
      respiratory: patientState.respiratory,
      anaestheticGases: patientState.anaestheticGases,
      anaestheticPhysiology: patientState.anaestheticPhysiology,
    })
  }

  const updateRhythm = (rhythm: MonitorPatientState['rhythm']) => {
    if (patientControlsLocked) return
    let heartRate = modelledPatientState.heartRate
    if (rhythm === 'sinus-bradycardia' && heartRate >= 60) heartRate = 48
    if (rhythm === 'sinus-tachycardia' && heartRate <= 100) heartRate = 125
    if (rhythm === 'svt' && heartRate < 140) heartRate = 180
    if (rhythm === 'ventricular-tachycardia' && heartRate < 110) heartRate = 160
    if (rhythm === 'sinus' && (heartRate < 60 || heartRate > 100)) heartRate = 78
    supersedeActionTarget('haemodynamics.heartRate')
    onPatientStateChange({ ...patientState, rhythm, heartRate })
  }

  const updatePatient = (patch: Partial<MonitorPatientState>) => {
    if (patientControlsLocked) return
    const next = { ...patientState, ...patch }
    if (next.systolicPressure <= next.diastolicPressure) {
      if (patch.diastolicPressure != null && patch.systolicPressure == null) next.diastolicPressure = Math.max(20, next.systolicPressure - 1)
      else next.systolicPressure = Math.min(220, next.diastolicPressure + 1)
    }
    onPatientStateChange(next)
  }

  const updateRespiratory = (patch: Partial<MonitorRespiratorySettings>) => {
    if (patientControlsLocked) return
    const nextRespiratory = { ...respiratory, ...patch }
    nextRespiratory.deadSpaceMl = Math.min(nextRespiratory.deadSpaceMl, Math.max(0, nextRespiratory.tidalVolumeMl))
    onPatientStateChange({ ...patientState, respiratory: nextRespiratory })
  }

  const updateModelledHeartRate = (value: number) => {
    if (patientControlsLocked) return
    const desired = clamp(value, 30, 220)
    supersedeActionTarget('haemodynamics.heartRate')
    updatePatient({ heartRate: desired })
  }

  const updateModelledRespiratoryRate = (value: number) => {
    if (patientControlsLocked) return
    const desired = clamp(value, 0, 40)
    supersedeActionTarget('respiration.drive')
    updateRespiratory({
      spontaneousRespiratoryRate: desired,
      respiratoryRate: respiratory.ventilatorMode === 'MANUAL' || respiratory.ventilatorMode === 'PSV' ? desired : respiratory.respiratoryRate,
    })
  }

  const updateAnaestheticSensitivity = (value: number) => {
    if (patientControlsLocked) return
    onPatientStateChange({
      ...patientState,
      anaestheticPhysiology: {
        ...anaestheticPhysiology,
        anaestheticSensitivity: clamp(value, -1, 1),
      },
    })
  }

  const updateAnaestheticDepth = (value: number) => {
    if (patientControlsLocked) return
    const depth = clamp(Math.round(value), 1, 5) as AnaestheticDepth
    onPatientStateChange(applyAnaestheticDepthEffects(patientState, depth, anaestheticPhysiology.anaestheticResponse))
  }

  const updateSystolicPressure = (value: number) => {
    if (patientControlsLocked) return
    const desired = clamp(value, 40, 220)
    let systolicPressure = desired
    let diastolicPressure = modelledPatientState.diastolicPressure
    if (pressuresCoupled) diastolicPressure = clamp(modelledPatientState.diastolicPressure + (desired - modelledPatientState.systolicPressure) * 0.3, 20, 140)
    if (systolicPressure <= diastolicPressure) systolicPressure = Math.min(220, diastolicPressure + 1)
    supersedeActionTarget('haemodynamics.meanArterialPressure')
    onPatientStateChange({ ...patientState, systolicPressure, diastolicPressure })
  }

  const updateDiastolicPressure = (value: number) => {
    if (patientControlsLocked) return
    const desired = clamp(value, 20, 140)
    let diastolicPressure = desired
    let systolicPressure = modelledPatientState.systolicPressure
    if (pressuresCoupled) systolicPressure = clamp(modelledPatientState.systolicPressure + (desired - modelledPatientState.diastolicPressure) * 0.3, 40, 220)
    if (diastolicPressure >= systolicPressure) diastolicPressure = Math.max(20, systolicPressure - 1)
    supersedeActionTarget('haemodynamics.meanArterialPressure')
    onPatientStateChange({ ...patientState, systolicPressure, diastolicPressure })
  }

  const morphology = patientState.ecgMorphology ?? 'nil'
  const morphologySeverity = patientState.morphologySeverity ?? 50
  const temperatureC = patientState.temperatureC ?? 37

  const profiles: Array<SimulationControlProfileDefinition<string>> = Object.keys(resolvedProfiles).map((candidate) => ({
    id: candidate,
    label: candidate,
    active: profile === candidate,
    disabled: patientControlsLocked,
    className: profile === candidate ? 'profile-selected' : '',
    title: patientControlsLocked ? 'Patient profile controlled by instructor' : `Apply ${candidate} profile`,
    onSelect: applyProfile,
  }))

  const tabs: Array<SimulationControlTabDefinition<EdumonControlTab>> = [
    { id: 'actions', label: 'ACTIONS', content: <EdumonActionsPanel role={teachingRole} /> },
    {
      id: 'patient',
      label: 'PATIENT',
      locked: patientControlsLocked,
      content: (
        <section className="control-section edumon-patient-controls">
          <div className="control-section-title"><h2>Patient</h2><span className="edumon-profile-badge">{patientControlsLocked ? 'Instructor controlled' : profile}</span></div>
          <div className="patient-transition-control">
            <SimulationTransitionTimeControl value={transitionSeconds} onChange={onTransitionSecondsChange} disabled={patientControlsLocked} showValue={false} />
          </div>
          <label className="edumon-select-control edumon-signal-control edumon-signal-ecg">
            <span>Rhythm <b>{RHYTHM_LABELS[patientState.rhythm]}</b></span>
            <select disabled={patientControlsLocked} value={patientState.rhythm} onChange={(event) => updateRhythm(event.target.value as MonitorPatientState['rhythm'])}>
              {RHYTHMS.map((rhythm) => <option key={rhythm} value={rhythm}>{RHYTHM_LABELS[rhythm]}</option>)}
            </select>
          </label>
          <label className="edumon-select-control edumon-signal-control edumon-signal-ecg">
            <span>Morphology <b>{ECG_MORPHOLOGY_LABELS[morphology]}</b></span>
            <select disabled={patientControlsLocked} value={morphology} onChange={(event) => updatePatient({ ecgMorphology: event.target.value as MonitorPatientState['ecgMorphology'] })}>
              {ECG_MORPHOLOGIES.map((candidate) => <option key={candidate} value={candidate}>{ECG_MORPHOLOGY_LABELS[candidate]}</option>)}
            </select>
          </label>
          {morphology !== 'nil' && (
            <label className="edumon-morphology-severity edumon-signal-control edumon-signal-ecg">
              <span>Severity <b>{Math.round(morphologySeverity)}%</b></span>
              <input disabled={patientControlsLocked} type="range" min="0" max="100" step="1" value={morphologySeverity} onChange={(event) => updatePatient({ morphologySeverity: Number(event.target.value) })} />
            </label>
          )}
          <label className="edumon-signal-control edumon-signal-ecg"><span>Heart rate <b>{Math.round(modelledPatientState.heartRate)}</b></span><input disabled={patientControlsLocked} type="range" min="30" max="220" step="1" value={clamp(modelledPatientState.heartRate, 30, 220)} onChange={(event) => updateModelledHeartRate(Number(event.target.value))} /></label>
          <div className="edumon-art-options" aria-label="Arterial pressure options">
            <label className="edumon-inline-checkbox edumon-signal-control edumon-signal-art">
              <input disabled={patientControlsLocked} type="checkbox" checked={pressuresCoupled} onChange={(event) => setPressuresCoupled(event.target.checked)} />
              <span>Couple pressures</span>
            </label>
            <label className="edumon-inline-checkbox edumon-signal-control edumon-signal-art">
              <input disabled={patientControlsLocked} type="checkbox" checked={showInvasiveBloodPressure} onChange={(event) => setShowInvasiveBloodPressure(event.target.checked)} />
              <span>Show invasive blood pressure</span>
            </label>
          </div>
          <label className="edumon-signal-control edumon-signal-art"><span>Systolic pressure <b>{Math.round(modelledPatientState.systolicPressure)}</b></span><input disabled={patientControlsLocked} type="range" min="40" max="220" step="1" value={clamp(modelledPatientState.systolicPressure, 40, 220)} onChange={(event) => updateSystolicPressure(Number(event.target.value))} /></label>
          <label className="edumon-signal-control edumon-signal-art"><span>Diastolic pressure <b>{Math.round(modelledPatientState.diastolicPressure)}</b></span><input disabled={patientControlsLocked} type="range" min="20" max="140" step="1" value={clamp(modelledPatientState.diastolicPressure, 20, 140)} onChange={(event) => updateDiastolicPressure(Number(event.target.value))} /></label>
          <label className="edumon-signal-control edumon-signal-spo2"><span>SpO₂ ceiling <b>{Math.round(patientState.spo2)}%</b></span><input disabled={patientControlsLocked} type="range" min="50" max="100" step="1" value={patientState.spo2} onChange={(event) => updatePatient({ spo2: Number(event.target.value) })} /></label>
          <label className="edumon-signal-control edumon-signal-spo2"><span>Peripheral perfusion <b>{patientState.peripheralPerfusion.toFixed(1)}</b></span><input disabled={patientControlsLocked} type="range" min="0" max="1" step="0.1" value={patientState.peripheralPerfusion} onChange={(event) => updatePatient({ peripheralPerfusion: Number(event.target.value) })} /></label>
          <label className="edumon-signal-control edumon-signal-temperature"><span>Temperature <b>{temperatureC.toFixed(1)} °C</b></span><input disabled={patientControlsLocked} type="range" min="30" max="42" step="0.1" value={temperatureC} onChange={(event) => updatePatient({ temperatureC: Number(event.target.value) })} /></label>
        </section>
      ),
    },
    {
      id: 'physio',
      label: 'PHYSIO',
      locked: patientControlsLocked,
      content: (
        <section className="control-section edumon-physio-panel">
          <div className="control-section-title"><h2>Respiratory / gas exchange</h2></div>
          <label className="edumon-signal-control edumon-signal-capnography"><span>Patient respiratory rate <b>{Math.round(modelledRespiratory.spontaneousRespiratoryRate)}/min</b></span><input disabled={patientControlsLocked} type="range" min="0" max="40" step="1" value={clamp(modelledRespiratory.spontaneousRespiratoryRate, 0, 40)} onChange={(event) => updateModelledRespiratoryRate(Number(event.target.value))} /></label>
          <label className="edumon-signal-control edumon-signal-capnography"><span>Dead space <b>{Math.round(respiratory.deadSpaceMl)} mL</b></span><input disabled={patientControlsLocked} type="range" min="0" max={Math.max(0, respiratory.tidalVolumeMl)} step="10" value={respiratory.deadSpaceMl} onChange={(event) => updateRespiratory({ deadSpaceMl: Number(event.target.value) })} /></label>
          <label className="edumon-signal-control edumon-signal-capnography"><span>VCO₂ <b>{Math.round(respiratory.co2ProductionMlMin)} mL/min</b></span><input disabled={patientControlsLocked} type="range" min="50" max="600" step="10" value={respiratory.co2ProductionMlMin} onChange={(event) => updateRespiratory({ co2ProductionMlMin: Number(event.target.value) })} /></label>
          <label className="edumon-signal-control edumon-signal-capnography"><span>VO₂ <b>{Math.round(respiratory.oxygenConsumptionMlMin)} mL/min</b></span><input disabled={patientControlsLocked} type="range" min="50" max="600" step="10" value={respiratory.oxygenConsumptionMlMin} onChange={(event) => updateRespiratory({ oxygenConsumptionMlMin: Number(event.target.value) })} /></label>
          {teachingHost.appId === 'anaesth' && (
            <>
              <div className="control-section-title"><h2>Anaesthetic physiology</h2></div>
              <label className="edumon-signal-control edumon-signal-agent">
                <span>Anaesthetic sensitivity <b>{anaestheticPhysiology.anaestheticSensitivity >= 0 ? '+' : ''}{anaestheticPhysiology.anaestheticSensitivity.toFixed(1)}</b></span>
                <input disabled={patientControlsLocked} type="range" min="-1" max="1" step="0.1" value={anaestheticPhysiology.anaestheticSensitivity} onChange={(event) => updateAnaestheticSensitivity(Number(event.target.value))} />
              </label>
              <label className="edumon-signal-control edumon-signal-agent">
                <span>Depth of anaesthesia <b>Step {anaestheticPhysiology.depthOfAnaesthesia}</b></span>
                <input disabled={patientControlsLocked} type="range" min="1" max="5" step="1" value={anaestheticPhysiology.depthOfAnaesthesia} onChange={(event) => updateAnaestheticDepth(Number(event.target.value))} />
              </label>
            </>
          )}
        </section>
      ),
    },
    {
      id: 'teaching',
      label: 'TEACHING',
      content: (
        <div className="edumon-side-teaching">
          <EdumonTeachingLibraries host={teachingHost} role={teachingRole} sessionId={teachingSessionId} candidateCount={candidateCount} sessionPanel={sessionPanel} />
        </div>
      ),
    },
  ]

  return (
    <>
      <EdumonNibpControl patientState={patientState} />
      <EdumonCapnographySurface patientState={patientState} />
      <EdumonTemperatureSurface patientState={patientState} />
      <EdumonVentilatorControl patientState={patientState} onPatientStateChange={onPatientStateChange} disabled={deviceControlsLocked} />
      {teachingHost.appId === 'anaesth' && (
        <EdumonAnaGasControl patientState={patientState} onPatientStateChange={onPatientStateChange} sideControlsLocked={deviceControlsLocked} />
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