import { useEffect, useMemo, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import type { SessionRole } from '../session/useTeachingSession'
import type { AlarmLimits } from '../alarmTypes'
import type { PatientSettings, VentilatorSettings } from '../simulation/types'
import {
  applyDynamicStage,
  asDynamicScenario,
  asStaticScenario,
  createFullDynamicStageApplyMask,
  createInstructorAccount,
  createInstructorPreset,
  deleteInstructorPreset,
  getInstructorAccount,
  listInstructorPresets,
  signInInstructor,
  signOutInstructor,
  subscribeToInstructorAccount,
  updateInstructorPreset,
  type DynamicScenarioApplyMask,
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
import { DynamicScenarioBuilder } from './DynamicScenarioBuilder'
import '../account.css'

interface InstructorAccountControlsProps {
  role: SessionRole
  currentScenario: InstructorScenarioSnapshot
  onLoadScenario: (scenario: InstructorScenarioSnapshot) => void
  simulationPaused: boolean
  onSimulationPausedChange: (paused: boolean) => void
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

export function InstructorAccountControls({ role, currentScenario, onLoadScenario, simulationPaused, onSimulationPausedChange }: InstructorAccountControlsProps) {
  const [account, setAccount] = useState<User | null>(null)
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
      if (scenarioType === 'dynamic') { setActiveDynamicId(created.id); setActiveDynamicStage(0) }
      await refreshPresets(account)
    } catch (cause) {
      setPresetMessage(cause instanceof Error ? cause.message : 'Unable to save scenario.')
    } finally {
      setPresetBusy(false)
    }
  }

  const loadDynamicStage = (preset: InstructorPresetRow, index: number) => {
    const stages = preset.scenario.stages ?? []
    if (!stages.length) return
    const nextIndex = Math.max(0, Math.min(stages.length - 1, index))
    onLoadScenario(applyDynamicStage(currentScenario, stages[nextIndex]))
    setActiveDynamicId(preset.id)
    setActiveDynamicStage(nextIndex)
    setPresetMessage(`“${preset.name}” · ${stages[nextIndex].name} (${nextIndex + 1}/${stages.length})`)
  }

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
    })
    setPresetBusy(true)
    try {
      await updateInstructorPreset(preset.id, { scenario: { ...preset.scenario, schemaVersion: 3, kind: 'dynamic', stages } })
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
      setPresetMessage(cause instanceof Error ? cause.message : 'Unable to update scenario.')
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
              <DynamicScenarioBuilder
                currentScenario={currentScenario}
                dynamicPresets={dynamicPresets}
                staticPresets={staticPresets}
                simulationPaused={simulationPaused}
                onSimulationPausedChange={onSimulationPausedChange}
                onRefresh={() => refreshPresets(account)}
                onClose={() => setScenarioOpen(false)}
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
