import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { User } from '@supabase/supabase-js'
import type { SessionRole } from '../session/useTeachingSession'
import type { AlarmLimits } from '../alarmTypes'
import type { PatientSettings, VentilatorSettings } from '../simulation/types'
import type { PhysiologicalMeasurements } from '../physiologyMeasurements'
import type { SessionMemberRow } from '../session/supabase'
import {
  applyDynamicStage,
  asDynamicScenario,
  asStaticScenario,
  createFullDynamicStageApplyMask,
  createInstructorAccount,
  createInstructorPreset,
  deleteInstructorPreset,
  dynamicStageTriggers,
  getInstructorAccount,
  listInstructorPresets,
  signInInstructor,
  signOutInstructor,
  subscribeToInstructorAccount,
  updateInstructorPreset,
  type DynamicScenarioActionId,
  type DynamicScenarioApplyMask,
  type DynamicScenarioMetric,
  type DynamicScenarioTrigger,
  type DynamicScenarioStage,
  type InstructorPresetRow,
  type InstructorScenarioSnapshot,
} from '../instructorAccount'
import {
  clearSupabaseLocalOverride,
  getSupabaseConfiguration,
  getSupabaseLocalOverride,
  saveSupabaseLocalOverride,
} from '../session/supabase'
import { APP_VERSION } from '../appVersion'
import { DynamicScenarioRuntimeLibrary } from './DynamicScenarioRuntimeLibrary'
import { startSelfDirectedRun, updateSelfDirectedRun, type SelfDirectedRunStart } from '../selfDirectedAssignments'
import { createCaseMediaSignedUrl, listCaseMediaByIds, releaseSessionCaseMedia } from '../caseMedia'
import { eduventTeachingHost, useTeachingPrompts } from '../teaching'
import { useTeachingMediaPresentation } from '../teaching/TeachingMediaPresentation'
import '../account.css'

export interface DynamicScenarioDiagnosticContext {
  scenarioId: string
  scenarioName: string
  description: string
  schemaVersion: number | null
  stageIndex: number
  stageName: string
  stageStartedAtSeconds: number
  triggers: DynamicScenarioTrigger[]
  scenario: InstructorScenarioSnapshot
}

interface InstructorAccountControlsProps {
  role: SessionRole
  sessionId: string | null
  currentScenario: InstructorScenarioSnapshot
  onLoadScenario: (scenario: InstructorScenarioSnapshot, options?: { pauseSimulation?: boolean; resetScenarioClock?: boolean; stageTransition?: DynamicScenarioStage }) => void
  simulationPaused: boolean
  onSimulationPausedChange: (paused: boolean) => void
  physiologyMeasurements: PhysiologicalMeasurements
  scenarioElapsedSeconds: number
  sessionMembers: SessionMemberRow[]
  runtimeHost: HTMLElement | null
  onStartInstructorSession: (scenario?: InstructorScenarioSnapshot) => Promise<void>
  onAccountConnectionChange?: (connected: boolean) => void
  onDynamicScenarioStarted?: () => void
  onStaticScenarioLoaded?: (name: string) => void
  onScenarioDiagnosticChange?: (context: DynamicScenarioDiagnosticContext | null) => void
  scenarioActionEvent?: { action: DynamicScenarioActionId; sequence: number } | null
}

function CloudIcon({ connected }: { connected: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7.2 18.2h10.1a4 4 0 0 0 .7-7.9A6.2 6.2 0 0 0 6.2 8.6a4.9 4.9 0 0 0 1 9.6Z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      {connected && <path d="m9.2 13.2 1.8 1.8 3.9-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />}
    </svg>
  )
}

function ScenarioIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 5.5h14v13H5z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M8 9h8M8 12h5M8 15h7" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M8 3.5h8v4H8z" fill="#0e171c" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  )
}

function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 7h14M5 12h14M5 17h14" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  )
}

function CloseIcon() {
  return <span aria-hidden="true">×</span>
}

function accountLabel(user: User | null) {
  return user?.email ?? 'Instructor cloud account'
}

const INSTRUCTOR_DETAILS_STORAGE_KEY = 'eduvent.instructor-details'

interface InstructorDetails { name: string; email: string; centre: string }

function loadInstructorDetails(): InstructorDetails {
  if (typeof window === 'undefined') return { name: '', email: '', centre: '' }
  try {
    const parsed = JSON.parse(window.localStorage.getItem(INSTRUCTOR_DETAILS_STORAGE_KEY) ?? '{}') as Partial<InstructorDetails>
    return {
      name: typeof parsed.name === 'string' ? parsed.name : '',
      email: typeof parsed.email === 'string' ? parsed.email : '',
      centre: typeof parsed.centre === 'string' ? parsed.centre : '',
    }
  } catch {
    return { name: '', email: '', centre: '' }
  }
}

function summaryItems(scenario: InstructorScenarioSnapshot) {
  const patient = scenario.patient
  const ventilator = scenario.ventilator
  return [
    ventilator.mode,
    `FiO₂ ${Math.round(ventilator.fio2 * 100)}%`,
    `PEEP ${ventilator.peep}`,
    `RR ${ventilator.rate}`,
    `VT ${ventilator.tidalVolume} mL`,
    `C ${patient.compliance}`,
    `Rexp ${patient.expiratoryResistance}`,
    `Spont ${patient.spontaneousRate}`,
    `Shunt ${Math.round((patient.shuntFraction ?? 0.03) * 100)}%`,
    `Media ${scenario.mediaIds?.length ?? 0}`,
  ]
}

const VENTILATOR_STAGE_FIELDS: Array<{ key: keyof VentilatorSettings; label: string }> = [
  { key: 'mode', label: 'Mode' }, { key: 'fio2', label: 'FiO₂' }, { key: 'peep', label: 'PEEP' },
  { key: 'rate', label: 'Set RR' }, { key: 'tidalVolume', label: 'Tidal volume' }, { key: 'inspiratoryTime', label: 'Tinsp' },
  { key: 'inspiratoryFlow', label: 'Inspiratory flow' }, { key: 'plateauPercent', label: 'Plateau %' },
  { key: 'pressureControl', label: 'Pressure control' }, { key: 'volumeGuaranteePressureLimit', label: 'VG pressure limit' },
  { key: 'pressureSupport', label: 'Pressure support' }, { key: 'triggerType', label: 'Trigger type' },
  { key: 'triggerSensitivity', label: 'Pressure trigger' }, { key: 'flowTriggerSensitivity', label: 'Flow trigger' },
  { key: 'terminationSensitivity', label: 'Termination sensitivity' }, { key: 'simvSyncWindowPercent', label: 'SIMV sync window' },
  { key: 'showSimvSyncWindow', label: 'Show SIMV sync window' }, { key: 'pHigh', label: 'P high' }, { key: 'pLow', label: 'P low' },
  { key: 'tHigh', label: 'T high' }, { key: 'tLow', label: 'T low' },
]

const PATIENT_STAGE_FIELDS: Array<{ key: keyof PatientSettings; label: string }> = [
  { key: 'sex', label: 'Sex' }, { key: 'heightCm', label: 'Height' }, { key: 'compliance', label: 'Compliance' },
  { key: 'resistance', label: 'Inspiratory resistance' }, { key: 'expiratoryResistance', label: 'Expiratory resistance' },
  { key: 'expiratoryFlowLimitation', label: 'Expiratory flow limitation' }, { key: 'spontaneousRate', label: 'Patient respiratory rate' },
  { key: 'effort', label: 'Effort' }, { key: 'neuralInspiratoryTime', label: 'Neural Tinsp' },
  { key: 'effortRisePercent', label: 'Effort rise' }, { key: 'effortRelaxationPercent', label: 'Effort relaxation' },
  { key: 'endExpiratoryOesophagealPressure', label: 'End-expiratory Pes' }, { key: 'oxygenConsumption', label: 'O₂ consumption' },
  { key: 'frc', label: 'FRC' }, { key: 'shuntFraction', label: 'Shunt' }, { key: 'maxSpO2', label: 'Maximum SpO₂' },
  { key: 'co2Production', label: 'CO₂ production' }, { key: 'vdVt', label: 'Vd/Vt' },
]

const ALARM_STAGE_FIELDS: Array<{ key: keyof AlarmLimits; label: string }> = [
  { key: 'pressureLimit', label: 'Pressure limitation' }, { key: 'peakPressure', label: 'Peak pressure alarm' },
  { key: 'apneaTime', label: 'Apnoea time' }, { key: 'co2Min', label: 'CO₂ minimum' }, { key: 'co2Max', label: 'CO₂ maximum' },
  { key: 'minuteVentilationMin', label: 'Min ventilation minimum' }, { key: 'minuteVentilationMax', label: 'Min ventilation maximum' },
  { key: 'tidalVolumeMin', label: 'VT minimum' }, { key: 'tidalVolumeMax', label: 'VT maximum' },
  { key: 'respiratoryRateMin', label: 'RR minimum' }, { key: 'respiratoryRateMax', label: 'RR maximum' },
]

function DynamicStageSourceSelect({ value, staticPresets, onChange }: { value: string; staticPresets: InstructorPresetRow[]; onChange: (value: string) => void }) {
  return <label className="dynamic-stage-source"><span>Stage source</span><select value={value} onChange={(event) => onChange(event.target.value)}><option value="current">Current simulator state</option>{staticPresets.length > 0 && <optgroup label="Static presets">{staticPresets.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}</optgroup>}</select></label>
}

function DynamicStageApplyEditor({ mask, onChange }: { mask: DynamicScenarioApplyMask; onChange: (mask: DynamicScenarioApplyMask) => void }) {
  const toggle = (group: 'ventilator' | 'patient' | 'alarmLimits', key: string, checked: boolean) => {
    const selected = new Set((mask[group] ?? []).map(String))
    if (checked) selected.add(key); else selected.delete(key)
    onChange({ ...mask, [group]: [...selected] } as DynamicScenarioApplyMask)
  }
  const setAll = (selected: boolean) => onChange(selected ? {
    ventilator: VENTILATOR_STAGE_FIELDS.map((item) => item.key), patient: PATIENT_STAGE_FIELDS.map((item) => item.key), alarmLimits: ALARM_STAGE_FIELDS.map((item) => item.key), patientTransitionSeconds: true, waveformDisplay: true, mediaIds: true,
  } : { ventilator: [], patient: [], alarmLimits: [], patientTransitionSeconds: false, waveformDisplay: false, mediaIds: false })
  const group = <K extends 'ventilator' | 'patient' | 'alarmLimits'>(title: string, name: K, options: Array<{ key: string; label: string }>) => <details className="dynamic-mask-group"><summary>{title}<small>{mask[name].length}/{options.length}</small></summary><div className="dynamic-mask-grid">{options.map((item) => <label key={item.key}><input type="checkbox" checked={(mask[name] as string[]).includes(item.key)} onChange={(event) => toggle(name, item.key, event.target.checked)} /><span>{item.label}</span></label>)}</div></details>
  return <div className="dynamic-stage-mask"><div className="dynamic-mask-heading"><strong>Parameters pushed at this stage</strong><div><button type="button" onClick={() => setAll(true)}>Select all</button><button type="button" onClick={() => setAll(false)}>Clear all</button></div></div>{group('Ventilator', 'ventilator', VENTILATOR_STAGE_FIELDS as Array<{ key: string; label: string }>)}{group('Patient / physiology', 'patient', PATIENT_STAGE_FIELDS as Array<{ key: string; label: string }>)}{group('Alarms', 'alarmLimits', ALARM_STAGE_FIELDS as Array<{ key: string; label: string }>)}<details className="dynamic-mask-group"><summary>Other</summary><div className="dynamic-mask-grid"><label><input type="checkbox" checked={mask.patientTransitionSeconds} onChange={(event) => onChange({ ...mask, patientTransitionSeconds: event.target.checked })} /><span>Transition time</span></label><label><input type="checkbox" checked={mask.waveformDisplay} onChange={(event) => onChange({ ...mask, waveformDisplay: event.target.checked })} /><span>Waveform display</span></label><label><input type="checkbox" checked={mask.mediaIds} onChange={(event) => onChange({ ...mask, mediaIds: event.target.checked })} /><span>Scenario media</span></label></div></details></div>
}

function conditionMetricValue(measurements: PhysiologicalMeasurements, metric: DynamicScenarioMetric): number | null {
  const mapping: Record<DynamicScenarioMetric, number | null> = {
    peakPressure: measurements.peakPressure, plateauPressure: measurements.plateauPressure, meanPressure: measurements.meanPressure,
    totalPeep: measurements.measuredPeep, autoPeep: measurements.autoPeep, expiredTidalVolume: measurements.expiredTidalVolume,
    totalRespiratoryRate: measurements.totalRespiratoryRate, actualMinuteVentilation: measurements.actualMinuteVentilation,
    alveolarMinuteVentilation: measurements.alveolarMinuteVentilation, endTidalCO2: measurements.endTidalCO2,
    oxygenSaturation: measurements.oxygenSaturation, drivingPressure: measurements.drivingPressure,
  }
  const value = mapping[metric]
  return value != null && Number.isFinite(value) ? value : null
}

function conditionMatches(actual: number, operator: 'lt' | 'eq' | 'gt', target: number) {
  if (operator === 'lt') return actual < target
  if (operator === 'gt') return actual > target
  const tolerance = Math.max(0.1, Math.abs(target) * 0.005)
  return Math.abs(actual - target) <= tolerance
}

function settingChanged(a: unknown, b: unknown) {
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) > 1e-6
  return a !== b
}

function stageTransitionDuration(stage: DynamicScenarioStage, group: 'ventilator' | 'patient', parameter: string): number {
  const overrides = stage.transitionOverrides?.[group] as Record<string, { mode: 'immediate' } | { mode: 'linear'; durationSeconds: number }> | undefined
  const policy = overrides?.[parameter] ?? stage.transition ?? { mode: 'immediate' as const }
  return policy.mode === 'linear' ? Math.max(0, policy.durationSeconds) : 0
}

function formatStageTimer(seconds: number) {
  const total=Math.max(0,Math.floor(seconds)), hours=Math.floor(total/3600), minutes=Math.floor((total%3600)/60), secs=total%60
  return hours>0 ? `${String(hours).padStart(2,'0')}:${String(minutes).padStart(2,'0')}:${String(secs).padStart(2,'0')}` : `${String(minutes).padStart(2,'0')}:${String(secs).padStart(2,'0')}`
}

function nextCopyName(baseName: string, presets: InstructorPresetRow[]) {
  const names = new Set(presets.map((preset) => preset.name.toLocaleLowerCase()))
  let candidate = `${baseName} copy`
  let suffix = 2
  while (names.has(candidate.toLocaleLowerCase())) {
    candidate = `${baseName} copy ${suffix}`
    suffix += 1
  }
  return candidate
}

export function InstructorAccountControls({ role, sessionId, currentScenario, onLoadScenario, simulationPaused, onSimulationPausedChange, physiologyMeasurements, scenarioElapsedSeconds, sessionMembers, runtimeHost, onStartInstructorSession, onAccountConnectionChange, onDynamicScenarioStarted, onStaticScenarioLoaded, onScenarioDiagnosticChange, scenarioActionEvent = null }: InstructorAccountControlsProps) {
  const [account, setAccount] = useState<User | null>(null)
  useEffect(() => { onAccountConnectionChange?.(Boolean(account)) }, [account, onAccountConnectionChange])
  const [accountOpen, setAccountOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [scenarioOpen, setScenarioOpen] = useState(false)
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [presets, setPresets] = useState<InstructorPresetRow[]>([])
  const [presetName, setPresetName] = useState('')
  const [presetDescription, setPresetDescription] = useState('')
  const [scenarioType, setScenarioType] = useState<'static' | 'dynamic'>('static')
  const [activeDynamicId, setActiveDynamicId] = useState<string | null>(null)
  const [activeDynamicStage, setActiveDynamicStage] = useState(0)
  const [activeDynamicStageStartedAt, setActiveDynamicStageStartedAt] = useState(0)
  const [selfDirectedRun, setSelfDirectedRun] = useState<SelfDirectedRunStart | null>(null)
  const [selfDirectedError, setSelfDirectedError] = useState<string | null>(null)
  const [selfDirectedPanelPosition, setSelfDirectedPanelPosition] = useState({ x: 0, y: 0 })
  const [instructorFlowHidden,setInstructorFlowHidden]=useState(false)
  const [instructorFlowPosition,setInstructorFlowPosition]=useState({x:0,y:0})
  const instructorFlowDragRef=useRef<{pointerId:number;startX:number;startY:number;originX:number;originY:number;baseLeft:number;baseTop:number;width:number;height:number}|null>(null)
  const selfDirectedPanelDragRef = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number; baseLeft: number; baseTop: number; width: number; height: number } | null>(null)
  const [selfDirectedStageMediaUrl, setSelfDirectedStageMediaUrl] = useState<string | null>(null)
  const [selfDirectedQuestionSelected, setSelfDirectedQuestionSelected] = useState('')
  const [selfDirectedQuestionAnswer, setSelfDirectedQuestionAnswer] = useState<string | null>(null)
  const scenarioPromptRuntime = useTeachingPrompts(role, sessionId, eduventTeachingHost)
  const scenarioMediaRuntime = useTeachingMediaPresentation(role, sessionId)
  const actionBaselineInstructorRef = useRef<VentilatorSettings | null>(null)
  const actionBaselineCandidatesRef = useRef(new Map<string, VentilatorSettings>())
  const patientBaselineInstructorRef = useRef<PatientSettings | null>(null)
  const patientBaselineCandidatesRef = useRef(new Map<string, PatientSettings>())
  const localScenarioActionBaselineRef = useRef(0)
  const candidateScenarioActionBaselineRef = useRef(new Map<string, number>())
  const triggerArmedAfterRef = useRef(0)
  const automaticAdvanceLockRef = useRef(false)
  const [dynamicCreateSourceId, setDynamicCreateSourceId] = useState('current')
  const [dynamicCreateMask, setDynamicCreateMask] = useState<DynamicScenarioApplyMask>(() => createFullDynamicStageApplyMask(currentScenario))
  const [stageBuilderPresetId, setStageBuilderPresetId] = useState<string | null>(null)
  const [stageBuilderSourceId, setStageBuilderSourceId] = useState('current')
  const [stageBuilderMask, setStageBuilderMask] = useState<DynamicScenarioApplyMask>(() => createFullDynamicStageApplyMask(currentScenario))
  const [presetBusy, setPresetBusy] = useState(false)
  const [presetMessage, setPresetMessage] = useState<string | null>(null)
  const [editingPresetId, setEditingPresetId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const initialSupabaseConfig = getSupabaseLocalOverride()
  const activeSupabaseConfig = getSupabaseConfiguration()
  const [supabaseProject, setSupabaseProject] = useState(initialSupabaseConfig?.project ?? activeSupabaseConfig.url)
  const [supabasePublishableKey, setSupabasePublishableKey] = useState(initialSupabaseConfig?.publishableKey ?? activeSupabaseConfig.publishableKey)
  const [supabaseConfigMessage, setSupabaseConfigMessage] = useState<string | null>(null)
  const [supabaseConfigError, setSupabaseConfigError] = useState<string | null>(null)
  const initialInstructorDetails = loadInstructorDetails()
  const [instructorName, setInstructorName] = useState(initialInstructorDetails.name)
  const [instructorEmail, setInstructorEmail] = useState(initialInstructorDetails.email)
  const [instructorCentre, setInstructorCentre] = useState(initialInstructorDetails.centre)
  const [instructorDetailsMessage, setInstructorDetailsMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!settingsOpen) return
    const local = getSupabaseLocalOverride()
    const active = getSupabaseConfiguration()
    setSupabaseProject(local?.project ?? active.url)
    setSupabasePublishableKey(local?.publishableKey ?? active.publishableKey)
    setSupabaseConfigMessage(null)
    setSupabaseConfigError(null)
    const details = loadInstructorDetails()
    setInstructorName(details.name)
    setInstructorEmail(details.email || account?.email || '')
    setInstructorCentre(details.centre)
    setInstructorDetailsMessage(null)
  }, [settingsOpen, account?.email])

  const saveInstructorDetails = () => {
    const details = { name: instructorName.trim(), email: instructorEmail.trim(), centre: instructorCentre.trim() }
    try {
      window.localStorage.setItem(INSTRUCTOR_DETAILS_STORAGE_KEY, JSON.stringify(details))
      setInstructorName(details.name)
      setInstructorEmail(details.email)
      setInstructorCentre(details.centre)
      setInstructorDetailsMessage('Instructor details saved.')
    } catch {
      setInstructorDetailsMessage('Unable to save instructor details in this browser.')
    }
  }

  const saveCentreSupabase = () => {
    if (role !== 'standalone') { setSupabaseConfigError('End or leave the teaching session before changing centre configuration.'); return }
    setSupabaseConfigMessage(null); setSupabaseConfigError(null)
    try {
      saveSupabaseLocalOverride(supabaseProject, supabasePublishableKey)
      setSupabaseConfigMessage('Centre configuration saved. EDUVENT is reconnecting…')
      window.setTimeout(() => window.location.reload(), 250)
    } catch (cause) { setSupabaseConfigError(cause instanceof Error ? cause.message : 'Unable to save Supabase configuration.') }
  }

  const resetCentreSupabase = () => {
    if (role !== 'standalone') { setSupabaseConfigError('End or leave the teaching session before changing centre configuration.'); return }
    clearSupabaseLocalOverride()
    setSupabaseConfigMessage('Local override cleared. EDUVENT is reconnecting to the deployment default…')
    setSupabaseConfigError(null)
    window.setTimeout(() => window.location.reload(), 250)
  }

  const staticPresets = useMemo(() => presets.filter((preset) => (preset.scenario.kind ?? 'static') === 'static'), [presets])
  const dynamicPresets = useMemo(() => presets.filter((preset) => preset.scenario.kind === 'dynamic'), [presets])
  const activeDynamicPreset = useMemo(() => dynamicPresets.find((preset) => preset.id === activeDynamicId) ?? null, [dynamicPresets, activeDynamicId])
  const selfDirectedPreset = useMemo<InstructorPresetRow | null>(() => selfDirectedRun ? ({
    id: `self-directed:${selfDirectedRun.runId}`, instructor_id: '', name: selfDirectedRun.title, scenario: selfDirectedRun.scenario, created_at: '', updated_at: '',
  }) : null, [selfDirectedRun])
  const activeRuntimePreset = selfDirectedPreset ?? activeDynamicPreset
  useEffect(() => {
    if (!onScenarioDiagnosticChange) return
    if (!activeRuntimePreset) { onScenarioDiagnosticChange(null); return }
    const stages=activeRuntimePreset.scenario.stages ?? []
    const index=Math.min(activeDynamicStage,Math.max(0,stages.length-1)), stage=stages[index]
    onScenarioDiagnosticChange({ scenarioId: activeRuntimePreset.id, scenarioName: activeRuntimePreset.name, description: activeRuntimePreset.scenario.description ?? '', schemaVersion: activeRuntimePreset.scenario.schemaVersion ?? null, stageIndex: index, stageName: stage?.name ?? `Stage ${index+1}`, stageStartedAtSeconds: activeDynamicStageStartedAt, triggers: stage ? dynamicStageTriggers(stage) : [], scenario: activeRuntimePreset.scenario })
  }, [activeRuntimePreset, activeDynamicStage, activeDynamicStageStartedAt, onScenarioDiagnosticChange])
  useEffect(() => () => onScenarioDiagnosticChange?.(null), [onScenarioDiagnosticChange])
  const scenarioForStageSource = (sourceId: string) => sourceId === 'current' ? currentScenario : (staticPresets.find((preset) => preset.id === sourceId)?.scenario ?? currentScenario)
  const nameForStageSource = (sourceId: string) => sourceId === 'current' ? 'Current simulator state' : (staticPresets.find((preset) => preset.id === sourceId)?.name ?? 'Current simulator state')
  const resetMaskForSource = (sourceId: string, setter: (mask: DynamicScenarioApplyMask) => void) => setter(createFullDynamicStageApplyMask(scenarioForStageSource(sourceId)))

  const refreshPresets = async (nextAccount: User | null = account) => {
    if (!nextAccount) {
      setPresets([])
      return
    }
    try {
      setPresets(await listInstructorPresets())
    } catch (cause) {
      setPresetMessage(cause instanceof Error ? cause.message : 'Unable to load instructor scenarios.')
    }
  }

  useEffect(() => {
    let active = true
    void getInstructorAccount()
      .then((user) => {
        if (!active) return
        setAccount(user)
        if (user) void refreshPresets(user)
      })
      .catch(() => undefined)

    const unsubscribe = subscribeToInstructorAccount((user) => {
      if (!active) return
      setAccount(user)
      setMessage(null)
      setError(null)
      if (user) void refreshPresets(user)
      else setPresets([])
    })

    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  const accountChangeLocked = role !== 'standalone'

  const submitAuth = async (event: React.FormEvent) => {
    event.preventDefault()
    if (accountChangeLocked) {
      setError('End or leave the teaching session before changing instructor account.')
      return
    }
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      if (authMode === 'signin') {
        const user = await signInInstructor(email, password)
        setAccount(user)
        setMessage('Instructor account connected.')
        setPassword('')
        await refreshPresets(user)
      } else {
        const created = await createInstructorAccount(email, password)
        setPassword('')
        if (created.confirmationRequired) {
          setMessage('Account created. Check your email to confirm the address, then return to EDUVENT and sign in.')
        } else if (created.user) {
          setAccount(created.user)
          setMessage('Instructor account created and connected.')
          await refreshPresets(created.user)
        }
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to complete account request.')
    } finally {
      setBusy(false)
    }
  }

  const logout = async () => {
    if (accountChangeLocked) {
      setError('End or leave the teaching session before signing out.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await signOutInstructor()
      setAccount(null)
      setPresets([])
      setMessage('Instructor cloud account disconnected.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to sign out.')
    } finally {
      setBusy(false)
    }
  }

  const openScenarios = () => {
    setScenarioOpen(true)
    setPresetMessage(null)
    setEditingPresetId(null)
    if (account) void refreshPresets(account)
  }

  const saveScenario = async () => {
    if (!account) {
      setPresetMessage('Connect an instructor cloud account first.')
      return
    }
    setPresetBusy(true)
    setPresetMessage(null)
    try {
      const dynamicSource = scenarioForStageSource(dynamicCreateSourceId)
      const created = await createInstructorPreset(
        presetName,
        scenarioType === 'dynamic'
          ? asDynamicScenario(dynamicSource, presetDescription, dynamicCreateMask, nameForStageSource(dynamicCreateSourceId))
          : asStaticScenario(currentScenario, presetDescription),
      )
      setPresetName('')
      setPresetDescription('')
      setPresetMessage(`Saved “${created.name}”.`)
      await refreshPresets(account)
    } catch (cause) {
      setPresetMessage(cause instanceof Error ? cause.message : 'Unable to save scenario.')
    } finally {
      setPresetBusy(false)
    }
  }

  const activateDynamicStage = (
    preset: InstructorPresetRow,
    index: number,
    nextScenario: InstructorScenarioSnapshot,
    reason: 'manual' | 'automatic' = 'manual',
    stageStartedAt = scenarioElapsedSeconds,
  ) => {
    const stages = preset.scenario.stages ?? []
    if (!stages.length) return
    const nextIndex = Math.max(0, Math.min(stages.length - 1, index))
    if (!preset.id.startsWith('self-directed:')) setActiveDynamicId(preset.id)
    setActiveDynamicStage(nextIndex)
    setActiveDynamicStageStartedAt(stageStartedAt)
    actionBaselineInstructorRef.current = { ...nextScenario.ventilator }
    actionBaselineCandidatesRef.current = new Map(sessionMembers.filter((member) => member.role === 'candidate').flatMap((member) => {
      const settings = member.ventilator_settings as Partial<VentilatorSettings>
      return settings && Object.keys(settings).length ? [[member.id, { ...settings } as VentilatorSettings] as const] : []
    }))
    patientBaselineInstructorRef.current = { ...nextScenario.patient }
    patientBaselineCandidatesRef.current = new Map(sessionMembers.filter((member) => member.role === 'candidate').flatMap((member) => {
      const settings = member.patient_settings as Partial<PatientSettings>
      return settings && Object.keys(settings).length ? [[member.id, { ...settings } as PatientSettings] as const] : []
    }))
    localScenarioActionBaselineRef.current = scenarioActionEvent?.sequence ?? 0
    candidateScenarioActionBaselineRef.current = new Map(sessionMembers.filter((member) => member.role === 'candidate').map((member) => [member.id, member.scenario_action_revision ?? 0]))
    triggerArmedAfterRef.current = Date.now() + 750
    automaticAdvanceLockRef.current = false
    setPresetMessage(`“${preset.name}” · ${stages[nextIndex].name} (${nextIndex + 1}/${stages.length})${reason === 'automatic' ? ' · auto advanced' : ''}`)
  }

  const loadDynamicStage = (preset: InstructorPresetRow, index: number, reason: 'manual' | 'automatic' = 'manual') => {
    const selfDirected = preset.id.startsWith('self-directed:')
    if (role !== 'instructor' && !selfDirected) return
    const stages = preset.scenario.stages ?? []
    if (!stages.length) return
    const nextIndex = Math.max(0, Math.min(stages.length - 1, index))
    const nextScenario = applyDynamicStage(currentScenario, stages[nextIndex])
    onLoadScenario(nextScenario, { pauseSimulation: false, resetScenarioClock: false, stageTransition: nextIndex > 0 ? stages[nextIndex] : undefined })
    activateDynamicStage(preset, nextIndex, nextScenario, reason)
    if (selfDirected && selfDirectedRun) void updateSelfDirectedRun(selfDirectedRun.runId, nextIndex, nextIndex === stages.length - 1).catch(() => undefined)
  }

  const scenarioAtDynamicStage=(preset:InstructorPresetRow,index:number)=>{
    const stages=preset.scenario.stages??[]; const target=Math.max(0,Math.min(stages.length-1,index))
    let next=asStaticScenario({...preset.scenario,kind:'static',stages:undefined},'')
    for(let i=0;i<=target;i+=1) next=applyDynamicStage(next,stages[i])
    return next
  }
  const jumpDynamicStage=(preset:InstructorPresetRow,index:number)=>{
    if(role!=='instructor')return; const stages=preset.scenario.stages??[]; if(!stages.length)return
    const target=Math.max(0,Math.min(stages.length-1,index)); if(target===activeDynamicStage)return
    const next=scenarioAtDynamicStage(preset,target)
    onLoadScenario(next,{pauseSimulation:false,resetScenarioClock:false,stageTransition:target>0?stages[target]:undefined})
    activateDynamicStage(preset,target,next,'manual')
  }

  const startDynamicScenario = async (preset: InstructorPresetRow) => {
    if (role === 'candidate') return
    const stages = preset.scenario.stages ?? []
    if (!stages.length) return
    setInstructorFlowHidden(false); setInstructorFlowPosition({x:0,y:0})
    const firstScenario = applyDynamicStage(currentScenario, stages[0])
    if (role === 'standalone') {
      await onStartInstructorSession(firstScenario)
      activateDynamicStage(preset, 0, firstScenario, 'manual', 0)
    } else {
      onLoadScenario(firstScenario, { pauseSimulation: false, resetScenarioClock: true })
      activateDynamicStage(preset, 0, firstScenario, 'manual', 0)
    }
    setScenarioOpen(false)
    onDynamicScenarioStarted?.()
  }

  useEffect(() => {
    if (role !== 'standalone' || selfDirectedRun) return
    const url = new URL(window.location.href)
    const assignmentCode = url.searchParams.get('assignment')
    if (!assignmentCode) return
    let cancelled = false
    setSelfDirectedError(null)
    void startSelfDirectedRun(assignmentCode).then((run) => {
      if (cancelled) return
      const stages = run.scenario.stages ?? []
      if (run.scenario.kind !== 'dynamic' || !stages.length) throw new Error('This self-directed session does not contain a runnable dynamic scenario.')
      const firstScenario = applyDynamicStage(currentScenario, stages[0])
      setSelfDirectedRun(run)
      setActiveDynamicId(null)
      setActiveDynamicStage(0)
      setActiveDynamicStageStartedAt(0)
      actionBaselineInstructorRef.current = { ...firstScenario.ventilator }
      actionBaselineCandidatesRef.current = new Map()
      patientBaselineInstructorRef.current = { ...firstScenario.patient }
      patientBaselineCandidatesRef.current = new Map()
      localScenarioActionBaselineRef.current = scenarioActionEvent?.sequence ?? 0
      candidateScenarioActionBaselineRef.current = new Map()
      triggerArmedAfterRef.current = Date.now() + 750
      automaticAdvanceLockRef.current = false
      onLoadScenario(firstScenario, { pauseSimulation: false, resetScenarioClock: true })
      void updateSelfDirectedRun(run.runId, 0, stages.length === 1).catch(() => undefined)
      onDynamicScenarioStarted?.()
    }).catch((cause) => {
      if (cancelled) return
      setSelfDirectedError(cause instanceof Error ? cause.message : 'Unable to start this self-directed scenario.')
      onDynamicScenarioStarted?.()
    })
    return () => { cancelled = true }
  }, [role])

  useEffect(() => {
    if (!account || role === 'candidate' || selfDirectedRun) return
    const url = new URL(window.location.href)
    const requestedScenarioId = url.searchParams.get('scenario')
    if (!requestedScenarioId) return
    const preset = dynamicPresets.find((item) => item.id === requestedScenarioId)
    if (!preset) return
    void startDynamicScenario(preset).finally(() => {
      url.searchParams.delete('scenario')
      window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
    })
  }, [account, role, dynamicPresets])

  useEffect(() => {
    if (role !== 'candidate' || !activeDynamicId) return
    setActiveDynamicId(null)
    setActiveDynamicStage(0)
  }, [role, activeDynamicId])

  useEffect(() => {
    if (role === 'candidate' || !activeRuntimePreset || automaticAdvanceLockRef.current || Date.now() < triggerArmedAfterRef.current) return
    const stages = activeRuntimePreset.scenario.stages ?? []
    if (activeDynamicStage < 0 || activeDynamicStage >= stages.length - 1) return
    const automaticTriggers = dynamicStageTriggers(stages[activeDynamicStage]).filter((trigger) => trigger.type !== 'manual')
    if (!automaticTriggers.length) return
    let shouldAdvance = false
    for (const trigger of automaticTriggers) {
      if (trigger.type === 'time') shouldAdvance = scenarioElapsedSeconds - activeDynamicStageStartedAt >= Math.max(1, trigger.seconds)
      else if (trigger.type === 'condition') {
        const actual=conditionMetricValue(physiologyMeasurements,trigger.metric)
        shouldAdvance=actual!=null && conditionMatches(actual,trigger.operator,trigger.value)
      } else if (trigger.type === 'question-any') {
        shouldAdvance = selfDirectedRun ? selfDirectedQuestionAnswer != null : scenarioPromptRuntime.responses.length > 0
      } else if (trigger.type === 'question-correct') {
        const question = stages[activeDynamicStage].question
        const correct = question?.correctOptionId ?? null
        shouldAdvance = Boolean(correct && (selfDirectedRun ? selfDirectedQuestionAnswer === correct : scenarioPromptRuntime.responses.some((response) => response.option_id === correct)))
      } else if (trigger.type === 'patient-change') {
        const transitionDuration = stageTransitionDuration(stages[activeDynamicStage], 'patient', String(trigger.parameter))
        if (scenarioElapsedSeconds - activeDynamicStageStartedAt < transitionDuration) continue
        if (selfDirectedRun) {
          if (trigger.actor === 'candidate' || trigger.actor === 'either') {
            const baseline=patientBaselineInstructorRef.current
            if (baseline && settingChanged(currentScenario.patient[trigger.parameter],baseline[trigger.parameter])) shouldAdvance=true
          }
        } else {
          if (trigger.actor === 'instructor' || trigger.actor === 'either') {
            const baseline=patientBaselineInstructorRef.current
            if (baseline && settingChanged(currentScenario.patient[trigger.parameter],baseline[trigger.parameter])) shouldAdvance=true
          }
          if (!shouldAdvance && (trigger.actor === 'candidate' || trigger.actor === 'either')) {
            for (const member of sessionMembers) {
              if (member.role !== 'candidate') continue
              const baseline=patientBaselineCandidatesRef.current.get(member.id), settings=member.patient_settings as Partial<PatientSettings>
              if (!baseline || !settings || !(trigger.parameter in settings)) continue
              if (settingChanged(settings[trigger.parameter],baseline[trigger.parameter])) { shouldAdvance=true; break }
            }
          }
        }
      } else if (trigger.type === 'device-action') {
        if (selfDirectedRun) {
          shouldAdvance = (trigger.actor === 'candidate' || trigger.actor === 'either') && Boolean(scenarioActionEvent && scenarioActionEvent.sequence > localScenarioActionBaselineRef.current && scenarioActionEvent.action === trigger.action)
        } else {
          if ((trigger.actor === 'instructor' || trigger.actor === 'either') && scenarioActionEvent && scenarioActionEvent.sequence > localScenarioActionBaselineRef.current && scenarioActionEvent.action === trigger.action) shouldAdvance=true
          if (!shouldAdvance && (trigger.actor === 'candidate' || trigger.actor === 'either')) {
            for (const member of sessionMembers) {
              if (member.role !== 'candidate') continue
              const baseline=candidateScenarioActionBaselineRef.current.get(member.id) ?? 0
              if ((member.scenario_action_revision ?? 0) > baseline && member.last_scenario_action === trigger.action) { shouldAdvance=true; break }
            }
          }
        }
      } else if (trigger.type === 'action') {
        const transitionDuration = stageTransitionDuration(stages[activeDynamicStage], 'ventilator', String(trigger.parameter))
        if (scenarioElapsedSeconds - activeDynamicStageStartedAt < transitionDuration) continue
        if (selfDirectedRun) {
          if (trigger.actor === 'candidate' || trigger.actor === 'either') {
            const baseline=actionBaselineInstructorRef.current
            if (baseline && settingChanged(currentScenario.ventilator[trigger.parameter],baseline[trigger.parameter])) shouldAdvance=true
          }
        } else {
          if (trigger.actor === 'instructor' || trigger.actor === 'either') {
            const baseline=actionBaselineInstructorRef.current
            if (baseline && settingChanged(currentScenario.ventilator[trigger.parameter],baseline[trigger.parameter])) shouldAdvance=true
          }
          if (!shouldAdvance && (trigger.actor === 'candidate' || trigger.actor === 'either')) {
            for (const member of sessionMembers) {
              if (member.role !== 'candidate') continue
              const baseline=actionBaselineCandidatesRef.current.get(member.id), settings=member.ventilator_settings as Partial<VentilatorSettings>
              if (!baseline || !settings || !(trigger.parameter in settings)) continue
              if (settingChanged(settings[trigger.parameter],baseline[trigger.parameter])) { shouldAdvance=true; break }
            }
          }
        }
      }
      if (shouldAdvance) break
    }
    if (!shouldAdvance) return
    automaticAdvanceLockRef.current=true
    loadDynamicStage(activeRuntimePreset,activeDynamicStage+1,'automatic')
  }, [role, activeRuntimePreset, activeDynamicStage, activeDynamicStageStartedAt, scenarioElapsedSeconds, physiologyMeasurements, currentScenario.ventilator, currentScenario.patient, sessionMembers, selfDirectedRun, selfDirectedQuestionAnswer, scenarioPromptRuntime.responses, scenarioActionEvent])

  useEffect(() => {
    const stages = activeRuntimePreset?.scenario.stages ?? []
    const stage = stages[Math.min(activeDynamicStage, Math.max(0, stages.length - 1))]
    setSelfDirectedQuestionSelected('')
    setSelfDirectedQuestionAnswer(null)
    setSelfDirectedStageMediaUrl(null)
    if (!stage || !activeRuntimePreset) return
    const stageType = stage.stageType ?? 'controls'
    if (selfDirectedRun) {
      if (stageType === 'media' && stage.media?.mediaId) {
        let cancelled = false
        void listCaseMediaByIds([stage.media.mediaId]).then((rows) => {
          const media = rows[0]
          if (!media) throw new Error('Scenario media is no longer available.')
          return createCaseMediaSignedUrl(media.storage_path, 3600)
        }).then((url) => { if (!cancelled) setSelfDirectedStageMediaUrl(url) }).catch(() => { if (!cancelled) setSelfDirectedStageMediaUrl(null) })
        return () => { cancelled = true }
      }
      return
    }
    if (role !== 'instructor' || !sessionId) return
    if (stageType === 'media' && stage.media?.mediaId) {
      void releaseSessionCaseMedia(sessionId, stage.media.mediaId).then(() => scenarioMediaRuntime.present(stage.media!.mediaId)).catch(() => undefined)
    } else if (scenarioMediaRuntime.activePresentation) {
      void scenarioMediaRuntime.close().catch(() => undefined)
    }
    if (stageType === 'question' && stage.question) {
      void scenarioPromptRuntime.presentPrompt({ kind: stage.question.kind, title: stage.question.title ?? '', body: stage.question.body, options: stage.question.options, correctOptionId: stage.question.correctOptionId, explanation: stage.question.explanation }).catch(() => undefined)
    } else if (scenarioPromptRuntime.activePrompt) {
      void scenarioPromptRuntime.closePrompt().catch(() => undefined)
    }
  }, [activeRuntimePreset?.id, activeDynamicStage, selfDirectedRun?.runId, role, sessionId])

  const addDynamicStage = async (preset: InstructorPresetRow) => {
    if (!account) return
    const stages = [...(preset.scenario.stages ?? [])]
    const stageNumber = stages.length + 1
    const source = scenarioForStageSource(stageBuilderSourceId)
    stages.push({
      name: `Stage ${stageNumber}`,
      snapshot: asStaticScenario(source, ''),
      apply: { ...stageBuilderMask, ventilator: [...stageBuilderMask.ventilator], patient: [...stageBuilderMask.patient], alarmLimits: [...stageBuilderMask.alarmLimits] },
      sourceName: nameForStageSource(stageBuilderSourceId),
      advanceTrigger: { type: 'manual' },
      advanceTriggers: [{ type: 'manual' }],
    })
    setPresetBusy(true)
    try {
      await updateInstructorPreset(preset.id, { scenario: { ...preset.scenario, schemaVersion: 6, kind: 'dynamic', stages } })
      setPresetMessage(`Added Stage ${stageNumber} to “${preset.name}”.`)
      setStageBuilderPresetId(null)
      setStageBuilderSourceId('current')
      setStageBuilderMask(createFullDynamicStageApplyMask(currentScenario))
      await refreshPresets(account)
    } catch (cause) {
      setPresetMessage(cause instanceof Error ? cause.message : 'Unable to add stage.')
    } finally { setPresetBusy(false) }
  }

  const loadScenario = (preset: InstructorPresetRow) => {
    onLoadScenario(preset.scenario)
    onStaticScenarioLoaded?.(preset.name)
    setPresetMessage(`Loaded “${preset.name}”.`)
    setScenarioOpen(false)
  }

  const updateFromCurrent = async (preset: InstructorPresetRow) => {
    if (!account || !window.confirm(`Replace the saved state in “${preset.name}” with the current simulator settings?`)) return
    setPresetBusy(true)
    setPresetMessage(null)
    try {
      await updateInstructorPreset(preset.id, {
        scenario: asStaticScenario(currentScenario, preset.scenario.description ?? ''),
      })
      setPresetMessage(`Updated “${preset.name}” from the current simulator state.`)
      await refreshPresets(account)
    } catch (cause) {
      setPresetMessage(cause instanceof Error ? cause.message : 'Unable to update scenario details.')
    } finally {
      setPresetBusy(false)
    }
  }

  const duplicateScenario = async (preset: InstructorPresetRow) => {
    if (!account) return
    setPresetBusy(true)
    setPresetMessage(null)
    try {
      const created = await createInstructorPreset(nextCopyName(preset.name, presets), preset.scenario)
      setPresetMessage(`Duplicated as “${created.name}”.`)
      await refreshPresets(account)
    } catch (cause) {
      setPresetMessage(cause instanceof Error ? cause.message : 'Unable to duplicate scenario.')
    } finally {
      setPresetBusy(false)
    }
  }

  const beginEdit = (preset: InstructorPresetRow) => {
    setEditingPresetId(preset.id)
    setEditName(preset.name)
    setEditDescription(preset.scenario.description ?? '')
    setPresetMessage(null)
  }

  const saveDetails = async (preset: InstructorPresetRow) => {
    if (!account) return
    setPresetBusy(true)
    setPresetMessage(null)
    try {
      const updated = await updateInstructorPreset(preset.id, {
        name: editName,
        scenario: asStaticScenario(preset.scenario, editDescription),
      })
      setEditingPresetId(null)
      setPresetMessage(`Updated details for “${updated.name}”.`)
      await refreshPresets(account)
    } catch (cause) {
      setPresetMessage(cause instanceof Error ? cause.message : 'Unable to update scenario details.')
    } finally {
      setPresetBusy(false)
    }
  }

  const removeScenario = async (preset: InstructorPresetRow) => {
    if (!account || !window.confirm(`Delete scenario “${preset.name}”?`)) return
    setPresetBusy(true)
    setPresetMessage(null)
    try {
      await deleteInstructorPreset(preset.id)
      if (editingPresetId === preset.id) setEditingPresetId(null)
      setPresetMessage(`Deleted “${preset.name}”.`)
      await refreshPresets(account)
    } catch (cause) {
      setPresetMessage(cause instanceof Error ? cause.message : 'Unable to delete scenario.')
    } finally {
      setPresetBusy(false)
    }
  }

  const flowDragStart=(e:React.PointerEvent<HTMLDivElement>)=>{if(window.innerWidth<900||(e.target as HTMLElement).closest('button'))return;const el=e.currentTarget.closest('.instructor-scenario-flow-modal') as HTMLElement|null;if(!el)return;const q=el.getBoundingClientRect();instructorFlowDragRef.current={pointerId:e.pointerId,startX:e.clientX,startY:e.clientY,originX:instructorFlowPosition.x,originY:instructorFlowPosition.y,baseLeft:q.left-instructorFlowPosition.x,baseTop:q.top-instructorFlowPosition.y,width:q.width,height:q.height};e.currentTarget.setPointerCapture?.(e.pointerId);e.preventDefault()}
  const flowDragMove=(e:React.PointerEvent<HTMLDivElement>)=>{const d=instructorFlowDragRef.current;if(!d||d.pointerId!==e.pointerId||window.innerWidth<900)return;const m=12,x=d.originX+e.clientX-d.startX,y=d.originY+e.clientY-d.startY;setInstructorFlowPosition({x:Math.max(m-d.baseLeft,Math.min(window.innerWidth-m-d.baseLeft-d.width,x)),y:Math.max(m-d.baseTop,Math.min(window.innerHeight-m-d.baseTop-d.height,y))});e.preventDefault()}
  const flowDragEnd=(e:React.PointerEvent<HTMLDivElement>)=>{if(instructorFlowDragRef.current?.pointerId===e.pointerId)instructorFlowDragRef.current=null;if(e.currentTarget.hasPointerCapture?.(e.pointerId))e.currentTarget.releasePointerCapture?.(e.pointerId)}

  return (
    <>
      <button
        type="button"
        className={`top-account-button ${account ? 'connected' : ''}`}
        title={accountLabel(account)}
        aria-label={account ? `Instructor cloud account connected as ${account.email}` : 'Instructor cloud account sign in'}
        onClick={() => { setAccountOpen(true); setMessage(null); setError(null) }}
      >
        <CloudIcon connected={Boolean(account)} />
      </button>
      {role !== 'candidate' && (
        <button
          type="button"
          className="top-account-button scenario-top-button"
          title="Instructor scenarios"
          aria-label="Open instructor scenarios"
          onClick={openScenarios}
        >
          <ScenarioIcon />
        </button>
      )}
      {runtimeHost&&activeRuntimePreset&&role==='instructor'&&createPortal((()=>{const stages=activeRuntimePreset.scenario.stages??[],index=Math.min(activeDynamicStage,Math.max(0,stages.length-1)),stage=stages[index],manual=stage?dynamicStageTriggers(stage).some(t=>t.type==='manual'):false,elapsed=Math.max(0,scenarioElapsedSeconds-activeDynamicStageStartedAt);if(instructorFlowHidden)return <button type="button" className="teaching-prompt-reopen instructor-scenario-flow-reopen" onClick={()=>setInstructorFlowHidden(false)}><span>Scenario flow</span><strong>Show</strong></button>;return <div className="teaching-media-overlay instructor-scenario-flow-overlay"><section className="teaching-media-modal instructor-scenario-flow-modal" role="dialog" aria-modal="false" style={{transform:`translate(${instructorFlowPosition.x}px, ${instructorFlowPosition.y}px)`}}><div className="teaching-media-header instructor-scenario-flow-header" onPointerDown={flowDragStart} onPointerMove={flowDragMove} onPointerUp={flowDragEnd} onPointerCancel={flowDragEnd}><div><span>Scenario flow</span><strong>{activeRuntimePreset.name}</strong></div><button type="button" onClick={()=>setInstructorFlowHidden(true)}>Hide</button></div><div className="instructor-scenario-flow-body"><div className="instructor-scenario-flow-meta"><strong>{stage?.name??`Stage ${index+1}`}</strong><span>{index+1}/{stages.length} · {formatStageTimer(elapsed)}</span></div><div className="instructor-scenario-flow-track">{stages.map((x,i)=><div className="instructor-scenario-flow-wrap" key={`${i}-${x.name}`}>{i>0&&<span>→</span>}<button type="button" className={`instructor-scenario-flow-node ${i===index?'active':''}`} onClick={()=>jumpDynamicStage(activeRuntimePreset,i)}><small>Stage {i+1}</small><strong>{x.name||`Stage ${i+1}`}</strong><em>{(x.stageType??'controls')==='controls'?'Controls':(x.stageType??'controls')==='media'?'Media':'Question'}</em></button></div>)}</div>{stage?.comment?.trim()&&<p className="instructor-scenario-flow-comment">{stage.comment.trim()}</p>}<div className="instructor-scenario-flow-actions"><button type="button" disabled={index<=0} onClick={()=>jumpDynamicStage(activeRuntimePreset,index-1)}>Previous</button><button type="button" className="instructor-scenario-flow-primary" disabled={index>=stages.length-1} onClick={()=>loadDynamicStage(activeRuntimePreset,index+1)}>{manual?'Manual trigger':'Advance now'}</button><button type="button" className="instructor-scenario-flow-stop" onClick={()=>{setActiveDynamicId(null);setActiveDynamicStage(0);setInstructorFlowHidden(false);setInstructorFlowPosition({x:0,y:0});setPresetMessage('Dynamic scenario stopped.')}}>Stop</button></div><small className="instructor-scenario-flow-help">Select any stage to activate it in the live session.</small></div></section></div>})(),runtimeHost)}
      {selfDirectedRun && activeRuntimePreset && createPortal((() => {
        const stages = activeRuntimePreset.scenario.stages ?? []
        const index = Math.min(activeDynamicStage, Math.max(0, stages.length - 1))
        const stage = stages[index]
        const stageType = stage?.stageType ?? 'controls'
        const triggers: DynamicScenarioTrigger[] = stage ? dynamicStageTriggers(stage) : [{ type: 'manual' }]
        const completed = index >= stages.length - 1
        const manualTrigger = !completed && triggers.some((trigger) => trigger.type === 'manual')
        const exitSelfDirectedScenario = () => {
          setSelfDirectedRun(null); setActiveDynamicId(null); setActiveDynamicStage(0); setSelfDirectedPanelPosition({ x: 0, y: 0 })
          const url = new URL(window.location.href); url.searchParams.delete('assignment'); window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
          setPresetMessage('Self-directed scenario closed.')
        }
        const startPanelDrag = (event: React.PointerEvent<HTMLDivElement>) => {
          if ((event.target as HTMLElement).closest('button')) return
          const panel = event.currentTarget.closest('.self-directed-scenario-modal') as HTMLElement | null; if (!panel) return
          const rect = panel.getBoundingClientRect()
          selfDirectedPanelDragRef.current = { pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,originX:selfDirectedPanelPosition.x,originY:selfDirectedPanelPosition.y,baseLeft:rect.left-selfDirectedPanelPosition.x,baseTop:rect.top-selfDirectedPanelPosition.y,width:rect.width,height:rect.height }
          event.currentTarget.setPointerCapture?.(event.pointerId); event.preventDefault()
        }
        const movePanelDrag = (event: React.PointerEvent<HTMLDivElement>) => {
          const drag=selfDirectedPanelDragRef.current; if(!drag||drag.pointerId!==event.pointerId)return; const margin=8
          const x=drag.originX+event.clientX-drag.startX,y=drag.originY+event.clientY-drag.startY
          setSelfDirectedPanelPosition({x:Math.max(margin-drag.baseLeft,Math.min(window.innerWidth-margin-drag.baseLeft-drag.width,x)),y:Math.max(margin-drag.baseTop,Math.min(window.innerHeight-margin-drag.baseTop-drag.height,y))}); event.preventDefault()
        }
        const endPanelDrag = (event: React.PointerEvent<HTMLDivElement>) => { if(selfDirectedPanelDragRef.current?.pointerId===event.pointerId)selfDirectedPanelDragRef.current=null; if(event.currentTarget.hasPointerCapture?.(event.pointerId))event.currentTarget.releasePointerCapture?.(event.pointerId) }
        return <div className="teaching-media-overlay self-directed-scenario-overlay" role="presentation">
          <section className={`teaching-media-modal self-directed-scenario-modal stage-${stageType}`} role="dialog" aria-modal="false" aria-label="Active scenario" style={{ transform:`translate(${selfDirectedPanelPosition.x}px, ${selfDirectedPanelPosition.y}px)` }}>
            <div className="teaching-media-header self-directed-scenario-header" onPointerDown={startPanelDrag} onPointerMove={movePanelDrag} onPointerUp={endPanelDrag} onPointerCancel={endPanelDrag} title="Drag to move"><div><span>{stageType === 'media' ? 'Scenario media' : stageType === 'question' ? 'Scenario question' : 'Active scenario'}</span></div><button type="button" onClick={exitSelfDirectedScenario}>Exit</button></div>
            {stageType === 'media' && stage?.media ? <div className="self-directed-stage-media">
              {!selfDirectedStageMediaUrl ? <div className="teaching-media-loading">Loading media…</div> : stage.media.mediaKind === 'video' ? <video src={selfDirectedStageMediaUrl} controls playsInline autoPlay /> : <img src={selfDirectedStageMediaUrl} alt={stage.media.title} />}
              {manualTrigger && !completed && <button type="button" className="self-directed-scenario-continue" onClick={() => loadDynamicStage(activeRuntimePreset,index+1)}>Continue</button>}
            </div> : stageType === 'question' && stage?.question ? <div className="self-directed-stage-question">
              {stage.question.title && <h3>{stage.question.title}</h3>}<p>{stage.question.body}</p>
              <div className="self-directed-question-options">{stage.question.options.map((option, optionIndex) => <button type="button" key={option.id} className={selfDirectedQuestionSelected===option.id?'selected':''} onClick={() => setSelfDirectedQuestionSelected(option.id)}><strong>{String.fromCharCode(65+optionIndex)}</strong><span>{option.text}</span></button>)}</div>
              {selfDirectedQuestionAnswer && stage.question.correctOptionId && selfDirectedQuestionAnswer !== stage.question.correctOptionId && triggers.some((trigger)=>trigger.type==='question-correct') && <div className="self-directed-question-feedback">Not correct. Select another answer and try again.</div>}
              <button type="button" className="self-directed-scenario-continue" disabled={!selfDirectedQuestionSelected} onClick={() => setSelfDirectedQuestionAnswer(selfDirectedQuestionSelected)}>Submit answer</button>
            </div> : <div className="self-directed-scenario-body">
              {completed ? <div className="self-directed-scenario-status complete"><strong>Scenario complete</strong><span>You have reached the end of this scenario.</span></div> : manualTrigger ? <button type="button" className="self-directed-scenario-continue" onClick={() => loadDynamicStage(activeRuntimePreset,index+1)}>Continue</button> : <div className="self-directed-scenario-status"><strong>Scenario active</strong><span>Continue working with the simulator.</span></div>}
            </div>}
          </section>
        </div>
      })(), document.body)}
      {runtimeHost && selfDirectedError && createPortal(<section className="dynamic-runtime-panel self-directed-error-panel" role="alert"><div className="dynamic-runtime-panel-heading"><div><span>Self-directed scenario</span><strong>Unable to start</strong></div></div><p>{selfDirectedError}</p><div className="dynamic-runtime-panel-actions"><button type="button" onClick={() => { setSelfDirectedError(null); const url=new URL(window.location.href); url.searchParams.delete('assignment'); window.history.replaceState({},'',`${url.pathname}${url.search}${url.hash}`) }}>Close</button></div></section>, runtimeHost)}
      <button
        type="button"
        className="top-account-button"
        title="EDUVENT settings"
        aria-label="Open EDUVENT settings"
        onClick={() => { setSettingsOpen(true); setPresetMessage(null); if (account) void refreshPresets(account) }}
      >
        <MenuIcon />
      </button>

      {accountOpen && (
        <div className="account-dialog-backdrop" onMouseDown={() => setAccountOpen(false)}>
          <section className="account-dialog" role="dialog" aria-modal="true" aria-label="Instructor cloud account" onMouseDown={(event) => event.stopPropagation()}>
            <div className="account-dialog-heading">
              <div><span>Cloud</span><h2>Instructor account</h2></div>
              <button type="button" className="account-close-button" onClick={() => setAccountOpen(false)} aria-label="Close account dialog"><CloseIcon /></button>
            </div>

            {account ? (
              <div className="account-connected-card">
                <span>Connected instructor</span>
                <strong>{account.email}</strong>
                <small>Cloud scenarios are private to this account.</small>
                <button type="button" className="account-secondary-button" disabled={busy || accountChangeLocked} onClick={() => void logout()}>Sign out</button>
                {accountChangeLocked && <p>Finish the current teaching session before changing accounts.</p>}
              </div>
            ) : (
              <>
                <div className="account-auth-tabs" role="tablist" aria-label="Instructor account action">
                  <button type="button" className={authMode === 'signin' ? 'selected' : ''} onClick={() => { setAuthMode('signin'); setError(null); setMessage(null) }}>Sign in</button>
                  <button type="button" className={authMode === 'signup' ? 'selected' : ''} onClick={() => { setAuthMode('signup'); setError(null); setMessage(null) }}>Create account</button>
                </div>
                <form className="account-auth-form" onSubmit={submitAuth}>
                  <label><span>Email</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required /></label>
                  <label><span>Password</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={authMode === 'signin' ? 'current-password' : 'new-password'} minLength={8} required /></label>
                  <button type="submit" className="account-primary-button" disabled={busy || accountChangeLocked}>{busy ? 'Please wait…' : authMode === 'signin' ? 'Sign in' : 'Create instructor account'}</button>
                </form>
                {accountChangeLocked && <p className="account-hint">Finish the current teaching session before changing accounts.</p>}
              </>
            )}
            {message && <div className="account-message">{message}</div>}
            {error && <div className="account-error" role="alert">{error}</div>}
          </section>
        </div>
      )}

      {scenarioOpen && (
        <div className="account-dialog-backdrop" onMouseDown={() => setScenarioOpen(false)}>
          <section className="account-dialog scenario-manager-dialog" role="dialog" aria-modal="true" aria-label="Instructor scenarios" onMouseDown={(event) => event.stopPropagation()}>
            <div className="account-dialog-heading">
              <div><span>Instructor tools</span><h2>Scenarios</h2></div>
              <button type="button" className="account-close-button" onClick={() => setScenarioOpen(false)} aria-label="Close scenarios"><CloseIcon /></button>
            </div>

            <div className="scenario-type-tabs" role="tablist" aria-label="Scenario type">
              <button type="button" className={scenarioType === 'static' ? 'selected' : ''} role="tab" aria-selected={scenarioType === 'static'} onClick={() => setScenarioType('static')}>Static presets</button>
              <button type="button" className={scenarioType === 'dynamic' ? 'selected' : ''} role="tab" aria-selected={scenarioType === 'dynamic'} onClick={() => setScenarioType('dynamic')}>Dynamic scenarios</button>
            </div>
            {scenarioType === 'dynamic' && account ? (
              <DynamicScenarioRuntimeLibrary
                presets={dynamicPresets}
                busy={presetBusy}
                onStart={(preset) => { void startDynamicScenario(preset) }}
              />
            ) : account ? (
              <>
                <section className="scenario-create-card">
                  <div className="scenario-settings-heading">
                    <div><span>{scenarioType === 'dynamic' ? 'New dynamic scenario' : 'New static preset'}</span><h3>{scenarioType === 'dynamic' ? 'Configure Stage 1 source and applied parameters' : 'Capture current simulator state'}</h3></div>
                    <small>{account.email}</small>
                  </div>
                  <div className="scenario-create-fields">
                    <label>
                      <span>Name</span>
                      <input value={presetName} onChange={(event) => setPresetName(event.target.value)} maxLength={80} placeholder="e.g. Severe ARDS – initial state" />
                    </label>
                    <label>
                      <span>Instructor notes</span>
                      <textarea value={presetDescription} onChange={(event) => setPresetDescription(event.target.value)} maxLength={500} rows={3} placeholder="Optional teaching notes, expected problem or objective…" />
                    </label>
                  </div>
                  {scenarioType === 'dynamic' && <div className="dynamic-stage-builder create"><DynamicStageSourceSelect value={dynamicCreateSourceId} staticPresets={staticPresets} onChange={(value) => { setDynamicCreateSourceId(value); resetMaskForSource(value, setDynamicCreateMask) }} /><DynamicStageApplyEditor mask={dynamicCreateMask} onChange={setDynamicCreateMask} /></div>}
                  <button type="button" className="account-primary-button scenario-save-current" disabled={presetBusy || !presetName.trim()} onClick={() => void saveScenario()}>{scenarioType === 'dynamic' ? 'Create dynamic scenario' : 'Save current state as preset'}</button>
                </section>

                <div className="scenario-library-heading">
                  <div><span>Library</span><strong>{scenarioType === 'static' ? `${staticPresets.length} static ${staticPresets.length === 1 ? 'preset' : 'presets'}` : `${dynamicPresets.length} dynamic ${dynamicPresets.length === 1 ? 'scenario' : 'scenarios'}`}</strong></div>
                  <small>Most recently updated first</small>
                </div>

                <div className="scenario-card-list">
                  {scenarioType === 'static' && (staticPresets.length ? staticPresets.map((preset) => {
                    const editing = editingPresetId === preset.id
                    return (
                      <article className="scenario-card" key={preset.id}>
                        <div className="scenario-card-heading">
                          <div>
                            <span className="scenario-kind-badge">Static</span>
                            <strong>{preset.name}</strong>
                            <small>Updated {new Date(preset.updated_at).toLocaleString()}</small>
                          </div>
                        </div>

                        {editing ? (
                          <div className="scenario-edit-fields">
                            <label><span>Name</span><input value={editName} onChange={(event) => setEditName(event.target.value)} maxLength={80} /></label>
                            <label><span>Instructor notes</span><textarea value={editDescription} onChange={(event) => setEditDescription(event.target.value)} maxLength={500} rows={3} /></label>
                            <div className="scenario-edit-actions">
                              <button type="button" className="account-primary-button" disabled={presetBusy || !editName.trim()} onClick={() => void saveDetails(preset)}>Save details</button>
                              <button type="button" disabled={presetBusy} onClick={() => setEditingPresetId(null)}>Cancel</button>
                            </div>
                          </div>
                        ) : (
                          <div className="scenario-card-view">
                            <div className="scenario-card-main">
                              {preset.scenario.description ? <p className="scenario-description">{preset.scenario.description}</p> : <p className="scenario-description empty">No instructor notes.</p>}
                              <div className="scenario-summary-chips">
                                {summaryItems(preset.scenario).map((item) => <span key={item}>{item}</span>)}
                              </div>
                            </div>
                            <div className="scenario-card-actions">
                              <button type="button" className="scenario-load-button" disabled={presetBusy} onClick={() => loadScenario(preset)}>Load</button>
                              <button type="button" disabled={presetBusy} onClick={() => void updateFromCurrent(preset)}>Update from current</button>
                              <button type="button" disabled={presetBusy} onClick={() => beginEdit(preset)}>Edit details</button>
                              <button type="button" disabled={presetBusy} onClick={() => void duplicateScenario(preset)}>Duplicate</button>
                              <button type="button" className="scenario-delete-button" disabled={presetBusy} onClick={() => void removeScenario(preset)}>Delete</button>
                            </div>
                          </div>
                        )}
                      </article>
                    )
                  }) : <div className="scenario-empty">No static scenarios saved yet. Configure the patient and ventilator, then capture the current state above.</div>)}
                  {scenarioType === 'dynamic' && (dynamicPresets.length ? dynamicPresets.map((preset) => {
                    const stages = preset.scenario.stages ?? []
                    const active = activeDynamicId === preset.id
                    const stageIndex = active ? Math.min(activeDynamicStage, Math.max(0, stages.length - 1)) : 0
                    return <article className="scenario-card dynamic-scenario-card" key={preset.id}>
                      <div className="scenario-card-heading"><div><span className="scenario-kind-badge">Dynamic</span><strong>{preset.name}</strong><small>{stages.length} {stages.length === 1 ? 'stage' : 'stages'}</small></div></div>
                      <div className="scenario-card-main">
                        {preset.scenario.description ? <p className="scenario-description">{preset.scenario.description}</p> : <p className="scenario-description empty">No instructor notes.</p>}
                        {active && stages.length > 0 && <div className="dynamic-stage-status"><div><strong>{stages[stageIndex].name}</strong><small>{stages[stageIndex].sourceName ?? 'Full snapshot'}</small></div><span>{stageIndex + 1} / {stages.length}</span></div>}
                        {stageBuilderPresetId === preset.id && <div className="dynamic-stage-builder inline"><DynamicStageSourceSelect value={stageBuilderSourceId} staticPresets={staticPresets} onChange={(value) => { setStageBuilderSourceId(value); resetMaskForSource(value, setStageBuilderMask) }} /><DynamicStageApplyEditor mask={stageBuilderMask} onChange={setStageBuilderMask} /><div className="dynamic-stage-builder-actions"><button type="button" className="account-primary-button" disabled={presetBusy} onClick={() => void addDynamicStage(preset)}>Add Stage {stages.length + 1}</button><button type="button" disabled={presetBusy} onClick={() => setStageBuilderPresetId(null)}>Cancel</button></div></div>}
                      </div>
                      <div className="scenario-card-actions dynamic-actions">
                        <button type="button" className="scenario-load-button" disabled={presetBusy || !stages.length} onClick={() => loadDynamicStage(preset, active ? stageIndex : 0)}>{active ? 'Reload stage' : 'Start'}</button>
                        <button type="button" disabled={presetBusy || !active || stageIndex <= 0} onClick={() => loadDynamicStage(preset, stageIndex - 1)}>Back</button>
                        <button type="button" className="account-primary-button" disabled={presetBusy || !active || stageIndex >= stages.length - 1} onClick={() => loadDynamicStage(preset, stageIndex + 1)}>Proceed to Next</button>
                        <button type="button" disabled={presetBusy} onClick={() => { const opening = stageBuilderPresetId !== preset.id; setStageBuilderPresetId(opening ? preset.id : null); if (opening) { setStageBuilderSourceId('current'); setStageBuilderMask(createFullDynamicStageApplyMask(currentScenario)) } }}>{stageBuilderPresetId === preset.id ? 'Close stage builder' : 'Add stage'}</button>
                        <button type="button" className="scenario-delete-button" disabled={presetBusy} onClick={() => void removeScenario(preset)}>Delete</button>
                      </div>
                    </article>
                  }) : <div className="scenario-empty">No dynamic scenarios saved yet. Create one from the current simulator state, then add further stages from the states you want to teach.</div>)}
                </div>
              </>
            ) : (
              <div className="scenario-signin-card">
                <strong>Cloud account required</strong>
                <p>Static scenarios are saved privately to your instructor account so they are available on any device.</p>
                <button type="button" className="account-primary-button" onClick={() => { setScenarioOpen(false); setAccountOpen(true) }}>Sign in to instructor account</button>
              </div>
            )}
            {presetMessage && <div className="account-message">{presetMessage}</div>}
          </section>
        </div>
      )}

      {settingsOpen && (
        <div className="account-dialog-backdrop" onMouseDown={() => setSettingsOpen(false)}>
          <section className="account-dialog settings-dialog" role="dialog" aria-modal="true" aria-label="EDUVENT settings" onMouseDown={(event) => event.stopPropagation()}>
            <div className="account-dialog-heading">
              <div><span>EDUVENT</span><h2>Settings</h2></div>
              <button type="button" className="account-close-button" onClick={() => setSettingsOpen(false)} aria-label="Close settings"><CloseIcon /></button>
            </div>

            <div className="settings-summary-grid">
              <div><span>Version</span><strong>v{APP_VERSION}</strong></div>
              <div><span>Teaching room</span><strong>2-hour lifetime</strong></div>
              <div><span>Cloud</span><strong>{account ? 'Connected' : 'Not signed in'}</strong></div>
            </div>

            <section className="instructor-details-section">
              <div className="scenario-settings-heading">
                <div><span>Instructor</span><h3>Instructor details</h3></div>
              </div>
              <div className="instructor-details-fields">
                <label><span>Name</span><input value={instructorName} onChange={(event) => setInstructorName(event.target.value)} placeholder="Instructor name" /></label>
                <label><span>Email</span><input type="email" value={instructorEmail} onChange={(event) => setInstructorEmail(event.target.value)} placeholder="name@example.com" /></label>
                <label><span>Centre</span><input value={instructorCentre} onChange={(event) => setInstructorCentre(event.target.value)} placeholder="Hospital / simulation centre" /></label>
              </div>
              <button type="button" className="account-primary-button instructor-details-save" onClick={saveInstructorDetails}>Save instructor details</button>
              {instructorDetailsMessage && <div className="account-message">{instructorDetailsMessage}</div>}
            </section>

            <section className="supabase-settings-section">
              <div className="scenario-settings-heading">
                <div><span>Centre configuration</span><h3>Supabase</h3></div>
                <small>{getSupabaseConfiguration().source === 'local' ? 'Local override' : getSupabaseConfiguration().source === 'environment' ? 'Deployment environment' : 'Built-in default'}</small>
              </div>
              <div className="supabase-settings-fields">
                <label><span>Project URL or project reference</span><input value={supabaseProject} disabled={role !== 'standalone'} onChange={(event) => setSupabaseProject(event.target.value)} placeholder="e.g. abcdefghijklmnop or https://abcdefgh.supabase.co" autoCapitalize="none" autoCorrect="off" spellCheck={false} /></label>
                <label><span>Publishable key</span><input value={supabasePublishableKey} disabled={role !== 'standalone'} onChange={(event) => setSupabasePublishableKey(event.target.value)} placeholder="sb_publishable_…" autoCapitalize="none" autoCorrect="off" spellCheck={false} /></label>
              </div>
              <div className="supabase-settings-actions">
                <button type="button" className="account-primary-button" disabled={role !== 'standalone'} onClick={saveCentreSupabase}>Save & reconnect</button>
                <button type="button" className="account-secondary-button" disabled={role !== 'standalone' || !getSupabaseLocalOverride()} onClick={resetCentreSupabase}>Use deployment default</button>
              </div>
              <small className="supabase-settings-note">The publishable key is browser-visible by design. Never enter a Supabase service-role or secret key here. Database and media security must be enforced with RLS.</small>
              {role !== 'standalone' && <div className="account-hint">Centre configuration is locked while a teaching session is active.</div>}
              {supabaseConfigMessage && <div className="account-message">{supabaseConfigMessage}</div>}
              {supabaseConfigError && <div className="account-error">{supabaseConfigError}</div>}
            </section>
          </section>
        </div>
      )}
    </>
  )
}
