import { useEffect, useMemo, useRef, useState } from 'react'
import { EDUMON_APP_VERSION } from './appVersion'
import { DEFAULT_MONITOR_STATE, type MonitorPatientState, type MonitorSample } from './types'
import { generateMonitorSamples, measurementsFor, RHYTHM_LABELS } from './monitorEngine'
import { AuxiliaryMonitorModal } from './AuxiliaryMonitorModal'
import { EdumonTeachingLibraries } from './EdumonTeachingLibraries'
import { EdumonTopBar, type EdumonSimulationSpeed } from './EdumonTopBar'
import { EdumonWorkspacePanel } from './EdumonWorkspacePanel'
import { EDUMON_MODULES, moduleFromPath, type EdumonAuxiliaryMonitorId, type EdumonModuleDefinition } from './modules'
import { edumonAnaTeachingHost, edumonIcuTeachingHost } from '../teaching/hosts/edumon'
import { SimulationHardwareControls } from '../components/SimulationHardwareControls'
import { SimulationAboutDialog } from '../components/SimulationAboutDialog'
import { SimulationDiagnosticsMenu, type SimulationDiagnosticAction } from '../components/SimulationDiagnosticsMenu'
import { SimulationWorkspaceShell } from '../components/SimulationWorkspaceShell'
import { SimulationConsoleShell } from '../components/SimulationConsoleShell'
import { useSimulationDisplayControls } from '../components/useSimulationDisplayControls'
import { useScreenWakeLock } from '../useScreenWakeLock'
import { SharedBasicSessionPanel, deriveAlarmSessionSemantics, useProductTeachingSession, useTeachingAlarmSync } from '../teaching/session'
import { InstructorAccountButton, InstructorAccountDialog, useInstructorAccountAuth } from '../components/InstructorAccountAuth'
import { useTeachingScenarioRuntime } from '../teaching/scenario/runtimeCore'
import { createEdumonScenarioRuntimeAdapter } from './scenarioAdapter'
import type { EdumonStoredScenario } from './scenarioTypes'
import { TeachingLaserPointerSurface } from '../teaching'
import { useProductScenarioLibrary } from '../teaching/scenario/useProductScenarioLibrary'
import { SharedScenarioRuntimePanel } from '../teaching/scenario/SharedScenarioRuntimePanel'
import { selfDirectedAssignmentUrl, startSelfDirectedRun, updateSelfDirectedRun } from '../selfDirectedAssignments'
import { scenarioProductForEdumonModule } from '../teaching/scenario/products'
import './edumon.css'
import './edumon-console-parity.css'

const TRACE_WINDOW_SECONDS = 8
const SAMPLE_RATE = 100

interface EdumonTeachingState {
  patient: MonitorPatientState
  simulationPaused: boolean
  simulationSpeed: EdumonSimulationSpeed
}

type TraceKey = 'ecg' | 'arterialPressure' | 'pleth'

interface TraceSpec {
  key: TraceKey
  label: string
  unit: string
  min: number
  max: number
  className: string
}

const TRACE_SPECS: TraceSpec[] = [
  { key: 'ecg', label: 'ECG II', unit: 'mV', min: -0.8, max: 1.6, className: 'ecg' },
  { key: 'arterialPressure', label: 'ART', unit: 'mmHg', min: 0, max: 180, className: 'art' },
  { key: 'pleth', label: 'SpO₂', unit: '', min: 0, max: 1.2, className: 'spo2' },
]

function TraceCanvas({ samples, spec }: { samples: MonitorSample[]; spec: TraceSpec }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const context = canvas.getContext('2d')
    if (!context) return

    const rect = canvas.getBoundingClientRect()
    const ratio = window.devicePixelRatio || 1
    canvas.width = Math.max(1, Math.round(rect.width * ratio))
    canvas.height = Math.max(1, Math.round(rect.height * ratio))
    context.setTransform(ratio, 0, 0, ratio, 0, 0)

    const width = rect.width
    const height = rect.height
    context.clearRect(0, 0, width, height)

    context.strokeStyle = 'rgba(255,255,255,0.055)'
    context.lineWidth = 1
    for (let column = 1; column < 8; column += 1) {
      const x = (width * column) / 8
      context.beginPath(); context.moveTo(x, 0); context.lineTo(x, height); context.stroke()
    }
    for (let row = 1; row < 4; row += 1) {
      const y = (height * row) / 4
      context.beginPath(); context.moveTo(0, y); context.lineTo(width, y); context.stroke()
    }

    if (!samples.length) return
    const range = Math.max(0.001, spec.max - spec.min)
    const toY = (value: number) => height - ((value - spec.min) / range) * height

    context.strokeStyle = getComputedStyle(canvas).color
    context.lineWidth = spec.key === 'ecg' ? 1.8 : 2.1
    context.lineJoin = 'round'
    context.lineCap = 'round'
    context.beginPath()
    samples.forEach((sample, index) => {
      const x = (index / Math.max(1, samples.length - 1)) * width
      const y = Math.max(1, Math.min(height - 1, toY(sample[spec.key])))
      if (index === 0) context.moveTo(x, y)
      else context.lineTo(x, y)
    })
    context.stroke()
  }, [samples, spec])

  return (
    <div className={`edumon-trace edumon-trace-${spec.className} waveform-card`}>
      <div className="edumon-trace-label waveform-label"><strong>{spec.label}</strong>{spec.unit && <span>{spec.unit}</span>}</div>
      <canvas ref={canvasRef} aria-label={`${spec.label} waveform`} />
    </div>
  )
}

function ValuePanel({ label, value, unit, detail, className }: { label: string; value: string; unit?: string; detail?: string; className: string }) {
  return (
    <div className={`edumon-value-panel edumon-value-${className} metric`}>
      <span className="edumon-value-label">{label}</span>
      <strong className="edumon-value-main">{value}</strong>
      {unit && <small className="edumon-value-unit">{unit}</small>}
      {detail && <div className="edumon-value-detail">{detail}</div>}
    </div>
  )
}

function EdumonLanding() {
  return (
    <main className="edumon-page edumon-landing">
      <section className="edumon-module-picker">
        <div className="edumon-module-picker-heading">
          <span>EDUSIM monitoring platform</span>
          <h1>EDUMON</h1>
          <p>Select the clinical monitor environment. Both modules share the same patient, waveform, teaching and scenario foundations.</p>
        </div>
        <div className="edumon-module-cards">
          {Object.values(EDUMON_MODULES).map((module) => (
            <a key={module.id} className="edumon-module-card" href={`/edumon/${module.id}`}>
              <span>{module.id === 'ana' ? 'ANA' : 'ICU'}</span>
              <strong>{module.productName}</strong>
              <p>{module.subtitle}</p>
              <div>{module.id === 'ana' ? 'Anaesthetic gases · MAC · BIS / TOF' : 'ICP / CPP · CVP · advanced ICU monitoring'}</div>
            </a>
          ))}
        </div>
      </section>
      <div className="edumon-version">EDUMON v{EDUMON_APP_VERSION}</div>
    </main>
  )
}

function GasMonitorPreview() {
  return (
    <div className="edumon-extra-monitor-grid edumon-gas-monitor">
      <div><span>FiO₂</span><strong>50</strong><small>%</small></div>
      <div><span>EtO₂</span><strong>44</strong><small>%</small></div>
      <div><span>EtSevo</span><strong>1.8</strong><small>%</small></div>
      <div><span>FiSevo</span><strong>2.0</strong><small>%</small></div>
      <div className="wide"><span>MAC</span><strong>0.9</strong><small>age adjusted · preview</small></div>
      <p className="wide">Gas physiology and live analyser waveforms are deliberately not implemented yet.</p>
    </div>
  )
}

function NeuroMonitorPreview({ map }: { map: number | null }) {
  const icp = 14
  const cpp = map == null ? null : Math.max(0, map - icp)
  return (
    <div className="edumon-extra-monitor-grid edumon-neuro-monitor">
      <div><span>ICP</span><strong>{icp}</strong><small>mmHg</small></div>
      <div><span>CPP</span><strong>{cpp ?? '—'}</strong><small>mmHg</small></div>
      <div className="wide edumon-placeholder-waveform" aria-label="ICP waveform placeholder"><i /><i /><i /><i /><i /><i /></div>
      <p className="wide">CPP is derived from the current monitor MAP minus ICP. The dedicated ICP waveform engine will be added later.</p>
    </div>
  )
}

function TrendsPreview() {
  return (
    <div className="edumon-trends-preview">
      <div className="edumon-trend-line"><span>HR</span><i style={{ width: '72%' }} /></div>
      <div className="edumon-trend-line"><span>MAP</span><i style={{ width: '64%' }} /></div>
      <div className="edumon-trend-line"><span>SpO₂</span><i style={{ width: '91%' }} /></div>
      <p>The modal is reusable for extra monitor pages as well as teaching media.</p>
    </div>
  )
}

function EdumonMonitor({ module }: { module: EdumonModuleDefinition }) {
  const [patientState, setPatientState] = useState<MonitorPatientState>(DEFAULT_MONITOR_STATE)
  const [elapsed, setElapsed] = useState(TRACE_WINDOW_SECONDS)
  const [simulationPaused, setSimulationPaused] = useState(false)
  const [simulationSpeed, setSimulationSpeed] = useState<EdumonSimulationSpeed>(1)
  const [frozen, setFrozen] = useState(false)
  const [frozenSamples, setFrozenSamples] = useState<MonitorSample[] | null>(null)
  const [laserActive, setLaserActive] = useState(false)
  const [auxiliaryMonitor, setAuxiliaryMonitor] = useState<EdumonAuxiliaryMonitorId | null>(null)
  const [topPanel, setTopPanel] = useState<'scenario' | 'about' | null>(null)
  const [alarmSilencedUntil, setAlarmSilencedUntil] = useState<number | null>(null)
  const [alarmSilenceRemaining, setAlarmSilenceRemaining] = useState(0)
  const [selectedSavedScenarioId, setSelectedSavedScenarioId] = useState('')
  const launchedScenarioRef = useRef<string | null>(null)
  const launchedAssignmentRef = useRef<string | null>(null)
  const [selfDirectedRunId, setSelfDirectedRunId] = useState<string | null>(null)
  const [scenarioQuestionState, setScenarioQuestionState] = useState({ answered: false, correct: false })
  const alarmSilenceTimeoutRef = useRef<number | null>(null)
  const screenWakeLock = useScreenWakeLock()

  useEffect(() => {
    if (frozen || simulationPaused) return
    let frame = 0
    let last = performance.now()
    const tick = (now: number) => {
      const deltaSeconds = Math.min(0.1, Math.max(0, (now - last) / 1000))
      last = now
      setElapsed((current) => current + deltaSeconds * simulationSpeed)
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [frozen, simulationPaused, simulationSpeed])

  useEffect(() => {
    if (alarmSilencedUntil == null) {
      setAlarmSilenceRemaining(0)
      return
    }
    const update = () => {
      const remaining = Math.max(0, Math.ceil((alarmSilencedUntil - Date.now()) / 1000))
      setAlarmSilenceRemaining(remaining)
      if (remaining <= 0) setAlarmSilencedUntil(null)
    }
    update()
    const timer = window.setInterval(update, 250)
    return () => window.clearInterval(timer)
  }, [alarmSilencedUntil])

  useEffect(() => () => {
    if (alarmSilenceTimeoutRef.current != null) window.clearTimeout(alarmSilenceTimeoutRef.current)
  }, [])

  const liveSamples = useMemo(() => generateMonitorSamples(patientState, elapsed, TRACE_WINDOW_SECONDS, SAMPLE_RATE), [patientState, elapsed])
  const samples = frozenSamples ?? liveSamples
  const measurements = measurementsFor(patientState)
  const teachingHost = module.id === 'ana' ? edumonAnaTeachingHost : edumonIcuTeachingHost
  const sharedTeachingState = useMemo<EdumonTeachingState>(() => ({ patient: patientState, simulationPaused, simulationSpeed }), [patientState, simulationPaused, simulationSpeed])
  const teachingSession = useProductTeachingSession<EdumonTeachingState>({
    productId: teachingHost.appId,
    state: sharedTeachingState,
    setState: (next) => {
      setPatientState(next.patient)
      setSimulationPaused(next.simulationPaused)
      setSimulationSpeed(next.simulationSpeed)
    },
  })
  const candidateCount = teachingSession.members.filter((member) => member.role === 'candidate').length
  const candidateLocked = teachingSession.role === 'candidate'
  const accountChangeLocked = teachingSession.role !== 'standalone'
  const accountAuth = useInstructorAccountAuth({ locked: accountChangeLocked })
  const instructorAuthenticated = Boolean(accountAuth.account)
  const scenarioProduct = scenarioProductForEdumonModule(module.id)
  const scenarioLibrary = useProductScenarioLibrary<EdumonStoredScenario>(scenarioProduct, instructorAuthenticated)
  const savedScenarios = scenarioLibrary.items
  const savedScenariosBusy = scenarioLibrary.busy
  const savedScenarioMessage = scenarioLibrary.message ?? (!savedScenariosBusy && instructorAuthenticated && !savedScenarios.length ? 'No saved scenarios for this simulator yet. Create one in Scenario Builder.' : null)
  useEffect(() => { setSelectedSavedScenarioId((current) => savedScenarios.some((row) => row.id === current) ? current : (savedScenarios[0]?.id ?? '')) }, [savedScenarios])

  const displayControls = useSimulationDisplayControls<MonitorSample[]>({
    role: teachingSession.role,
    sessionId: teachingSession.session?.id ?? null,
    frozen,
    setFrozen,
    frozenSnapshot: frozenSamples,
    setFrozenSnapshot: setFrozenSamples,
    captureSnapshot: () => liveSamples,
    laserEnabled: laserActive,
    setLaserEnabled: setLaserActive,
  })
  const alarmSemantics = deriveAlarmSessionSemantics(teachingSession.role, { syncAlarms: true, candidateCanEditAlarms: false, alarmsSilent: false })
  const alarmSync = useTeachingAlarmSync(teachingSession.role, teachingSession.session?.id ?? null, (next) => { setAlarmSilencedUntil(next.silenceUntil) })

  const edumonScenarioAdapter = useMemo(() => createEdumonScenarioRuntimeAdapter((snapshot) => {
    setPatientState(snapshot.patient)
    setSimulationPaused(snapshot.simulationPaused)
    setSimulationSpeed(snapshot.simulationSpeed)
  }), [])
  const scenarioRuntime = useTeachingScenarioRuntime(edumonScenarioAdapter)

  const loadSavedScenario = async (id: string) => {
    const row = savedScenarios.find((item) => item.id === id)
    if (!row) return false
    await scenarioRuntime.start(row.scenario.definition, elapsed)
    return true
  }

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get('scenario')
    if (!requested || !instructorAuthenticated || teachingSession.role !== 'standalone' || launchedScenarioRef.current === requested) return
    if (!savedScenarios.some((row) => row.id === requested)) return
    launchedScenarioRef.current = requested
    void loadSavedScenario(requested)
  }, [instructorAuthenticated, teachingSession.role, savedScenarios])

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('assignment')?.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8) ?? ''
    if (code.length !== 8 || launchedAssignmentRef.current === code) return
    launchedAssignmentRef.current = code
    void startSelfDirectedRun<EdumonStoredScenario>(code).then(async (run) => {
      if (run.product !== scenarioProduct) {
        window.location.assign(selfDirectedAssignmentUrl(code, run.product))
        return
      }
      setSelfDirectedRunId(run.runId)
      await scenarioRuntime.start(run.scenario.definition, elapsed)
    }).catch((cause) => {
      console.error('Unable to start self-directed EDUMON scenario', cause)
      launchedAssignmentRef.current = null
    })
  }, [scenarioProduct])

  useEffect(() => {
    setScenarioQuestionState({ answered: false, correct: false })
    if (selfDirectedRunId && scenarioRuntime.status === 'running') void updateSelfDirectedRun(selfDirectedRunId, scenarioRuntime.stageIndex)
    if (selfDirectedRunId && scenarioRuntime.status === 'complete') void updateSelfDirectedRun(selfDirectedRunId, scenarioRuntime.stageIndex, true)
  }, [scenarioRuntime.stageIndex, scenarioRuntime.status, selfDirectedRunId])

  const selectedAuxiliary = module.auxiliaryMonitors.find((item) => item.id === auxiliaryMonitor) ?? null

  useEffect(() => {
    if (scenarioRuntime.status !== 'running') return
    void scenarioRuntime.evaluate({ simulationTime: elapsed, state: sharedTeachingState, measurements, questionAnswered: scenarioQuestionState.answered, questionCorrect: scenarioQuestionState.correct }, elapsed)
  }, [scenarioRuntime, elapsed, sharedTeachingState, measurements, scenarioQuestionState])

  const sessionPanel = (
    <SharedBasicSessionPanel
      role={teachingSession.role}
      session={teachingSession.session}
      members={teachingSession.members}
      connection={teachingSession.connection}
      error={teachingSession.error}
      instructorAuthenticated={instructorAuthenticated}
      recoverableInstructor={teachingSession.recoverableInstructor}
      recoverableCandidate={teachingSession.recoverableCandidate}
      onStartInstructor={teachingSession.startInstructor}
      onResumeInstructor={teachingSession.resumeInstructor}
      onJoinCandidate={teachingSession.joinCandidate}
      onResumeCandidate={teachingSession.resumeCandidate}
      onLeaveSession={teachingSession.leaveSession}
      onEndInstructorSession={teachingSession.endInstructorSession}
      productId={teachingHost.appId}
      productLabel={module.productName}
      productDescription={module.subtitle}
      renderCandidateTelemetry={(member) => {
        const state = (member as typeof teachingSession.members[number]).product_state as EdumonTeachingState | undefined
        if (!state?.patient) return null
        const p = state.patient
        return <div className="candidate-state-grid">
          <div><span>Rhythm</span><strong>{RHYTHM_LABELS[p.rhythm]}</strong></div>
          <div><span>HR</span><strong>{Math.round(p.heartRate)}</strong></div>
          <div><span>ART</span><strong>{Math.round(p.systolicPressure)}/{Math.round(p.diastolicPressure)}</strong></div>
          <div><span>SpO₂</span><strong>{Math.round(p.spo2)}%</strong></div>
        </div>
      }}
      instructorStart={{
        currentTitle: `${RHYTHM_LABELS[patientState.rhythm]} · HR ${patientState.heartRate} · ${patientState.systolicPressure}/${patientState.diastolicPressure} · SpO₂ ${patientState.spo2}%`,
        currentSummary: 'Configure the patient monitor in standalone mode before opening the room.',
        currentChips: [RHYTHM_LABELS[patientState.rhythm], `HR ${patientState.heartRate}`, `MAP ${measurements.meanPressure ?? "—"}`, `SpO₂ ${patientState.spo2}%`],
        savedOptions: savedScenarios.map((row) => { const snapshot = row.scenario.definition.stages[0]?.snapshot; return { id: row.id, title: row.name, summary: row.scenario.description || 'Saved monitor scenario', chips: snapshot ? [RHYTHM_LABELS[snapshot.patient.rhythm], `HR ${snapshot.patient.heartRate}`, `SpO₂ ${snapshot.patient.spo2}%`] : [] } }),
        selectedSavedId: selectedSavedScenarioId,
        onSelectedSavedIdChange: setSelectedSavedScenarioId,
        savedBusy: savedScenariosBusy,
        savedMessage: savedScenarioMessage,
        onStartCurrent: teachingSession.startInstructor,
        onLoadSaved: loadSavedScenario,
        onStartSaved: async (id) => { if (await loadSavedScenario(id)) { await new Promise<void>((resolve) => requestAnimationFrame(() => resolve())); await teachingSession.startInstructor() } },
      }}
    />
  )

  const toggleFreeze = displayControls.toggleFreeze
  const toggleLaser = displayControls.toggleLaser

  const silenceAlarm = (durationMs: number) => {
    if (alarmSemantics.candidateLocked) return
    if (teachingSession.role === 'instructor' && teachingSession.session?.id) alarmSync.silenceFor(durationMs)
    if (alarmSilenceTimeoutRef.current != null) window.clearTimeout(alarmSilenceTimeoutRef.current)
    const until = Date.now() + durationMs
    setAlarmSilencedUntil(until)
    alarmSilenceTimeoutRef.current = window.setTimeout(() => {
      setAlarmSilencedUntil(null)
      alarmSilenceTimeoutRef.current = null
    }, durationMs)
  }


  const alarmMinutes = Math.floor(alarmSilenceRemaining / 60)
  const alarmSeconds = alarmSilenceRemaining % 60
  const alarmSilenceLabel = alarmSilenceRemaining > 0 ? `${alarmMinutes}:${String(alarmSeconds).padStart(2, '0')}` : undefined

  const copyEdumonMonitorDiagnostics = async () => {
    await navigator.clipboard.writeText(JSON.stringify({ product: module.productName, simulationTime: elapsed, patient: patientState, measurements, simulationPaused, simulationSpeed }, null, 2))
  }
  const copyEdumonSessionDiagnostics = async () => {
    await navigator.clipboard.writeText(JSON.stringify({ product: module.productName, role: teachingSession.role, session: teachingSession.session, members: teachingSession.members, scenarioRuntime: scenarioRuntime.runtimeSnapshot }, null, 2))
  }
  const edumonDiagnosticActions: SimulationDiagnosticAction[] = [
    { id: 'monitor', label: 'Monitor State', description: 'Patient settings, measurements and timing', onSelect: copyEdumonMonitorDiagnostics },
    { id: 'session', label: 'Session / Scenario State', description: 'Teaching session and scenario runtime state', onSelect: copyEdumonSessionDiagnostics },
  ]

  return (
    <main className={`app-shell edumon-app-shell edumon-module-${module.id}`}>
      <EdumonTopBar
        module={module}
        simulationPaused={simulationPaused}
        simulationSpeed={simulationSpeed}
        elapsedSeconds={elapsed}
        onPausedChange={setSimulationPaused}
        onSpeedChange={setSimulationSpeed}
        simulationControlsLocked={candidateLocked}
        onScenario={() => setTopPanel('scenario')}
        accountAction={<InstructorAccountButton auth={accountAuth} />}
        diagnosticsAction={<SimulationDiagnosticsMenu actions={edumonDiagnosticActions} />}
        onAbout={() => setTopPanel('about')}
      />

      <SimulationWorkspaceShell
        workspaceClassName="edumon-workspace"
        switcherClassName="edumon-mobile-workspace-switcher"
        displayPageClassName="mobile-page-monitor"
        controlsPageClassName="mobile-page-controls"
        displayLabel="Display"
        controlsLabel="Controls"
        ariaLabel="EDUMON workspace pages"
        allowSwipeFromCanvas
        display={(
        <SimulationConsoleShell
          ariaLabel={`${module.productName} patient monitor`}
          className="edumon-console"
          hardwareControls={<SimulationHardwareControls
            className="edumon-console-top-actions"
            laserActive={laserActive}
            onLaserToggle={toggleLaser}
            laserDisabled={displayControls.laserDisabled}
            frozen={frozen}
            onFreezeToggle={toggleFreeze}
            freezeDisabled={displayControls.freezeDisabled}
            alarmSilenced={alarmSilenceRemaining > 0}
            alarmDisabled={alarmSemantics.candidateLocked}
            alarmLabel={alarmSilenceLabel}
            onAlarmSilence={silenceAlarm}
            alarmTimerClassName="edumon-alarm-silence-timer"
          />}
          display={<div className="edumon-monitor-body">
            <div className="edumon-waveform-area waveforms">
              {TRACE_SPECS.map((spec) => <TraceCanvas key={spec.key} samples={samples} spec={spec} />)}
              {frozen && <div className="edumon-freeze-indicator">FROZEN</div>}
            </div>

            <aside className="edumon-measurements metrics-panel" aria-label="Measured values">
              <ValuePanel label="HR" value={measurements.heartRate == null ? '—' : `${measurements.heartRate}`} unit="bpm" className="ecg" />
              <ValuePanel label="ART" value={measurements.systolicPressure == null ? '—/—' : `${measurements.systolicPressure}/${measurements.diastolicPressure}`} unit="mmHg" detail={measurements.meanPressure == null ? 'MAP —' : `MAP ${measurements.meanPressure}`} className="art" />
              <ValuePanel label="SpO₂" value={measurements.spo2 == null ? '—' : `${measurements.spo2}`} unit="%" className="spo2" />
            </aside>
            <TeachingLaserPointerSurface role={teachingSession.role} sessionId={teachingSession.session?.id ?? null} enabled={laserActive} onEnabledChange={setLaserActive} />
          </div>}
          footer={<div className="edumon-control-strip" aria-label="Monitor controls">
            <button type="button" className="edumon-control-tile disabled" disabled title="NIBP will be enabled in a later EDUMON milestone"><span>NIBP</span><strong>Inactive</strong><small>Manual / cycle</small></button>
            {module.auxiliaryMonitors.map((item) => (
              <button key={item.id} type="button" className="edumon-control-tile" onClick={() => setAuxiliaryMonitor(item.id)}><span>Extra monitor</span><strong>{item.shortLabel}</strong><small>{item.description}</small></button>
            ))}
          </div>}
        />

        )}
        controls={<EdumonWorkspacePanel patientState={patientState} onPatientStateChange={setPatientState} teachingHost={teachingHost} teachingRole={teachingSession.role} teachingSessionId={teachingSession.session?.id ?? null} candidateCount={candidateCount} controlsLocked={candidateLocked} sessionPanel={sessionPanel} meanPressure={measurements.meanPressure} />}
      />

      {scenarioRuntime.scenario && scenarioRuntime.stage && scenarioRuntime.status !== 'idle' && (
        <SharedScenarioRuntimePanel
          scenarioName={scenarioRuntime.scenario.name}
          stageName={scenarioRuntime.stage.name}
          stageNumber={scenarioRuntime.stageIndex + 1}
          stageCount={scenarioRuntime.scenario.stages.length}
          notes={scenarioRuntime.stage.notes}
          content={scenarioRuntime.stage.content}
          manualAdvanceAvailable={scenarioRuntime.stage.triggers.some((trigger) => trigger.type === 'manual')}
          onAdvance={async () => { await scenarioRuntime.advance(elapsed) }}
          onQuestionResult={(answered, correct) => setScenarioQuestionState({ answered, correct })}
          onClose={() => { scenarioRuntime.stop(); setSelfDirectedRunId(null) }}
        />
      )}

      {selectedAuxiliary && auxiliaryMonitor && (
        <AuxiliaryMonitorModal title={selectedAuxiliary.label} onClose={() => setAuxiliaryMonitor(null)}>
          {auxiliaryMonitor === 'ana-gases' && <GasMonitorPreview />}
          {auxiliaryMonitor === 'icu-neuro' && <NeuroMonitorPreview map={measurements.meanPressure} />}
          {auxiliaryMonitor === 'trends' && <TrendsPreview />}
          {auxiliaryMonitor === 'teaching' && <EdumonTeachingLibraries host={teachingHost} role={teachingSession.role} sessionId={teachingSession.session?.id ?? null} candidateCount={candidateCount} />}
        </AuxiliaryMonitorModal>
      )}

      {topPanel === 'scenario' && <AuxiliaryMonitorModal title="Scenarios and sessions" onClose={() => setTopPanel(null)}>{sessionPanel}</AuxiliaryMonitorModal>}
      <InstructorAccountDialog auth={accountAuth} locked={accountChangeLocked} />
      <SimulationAboutDialog open={topPanel === 'about'} productLabel={module.productName} title={module.subtitle} description="An interactive patient-monitor simulator for anaesthesia, acute care and intensive-care education." version={EDUMON_APP_VERSION} onClose={() => setTopPanel(null)} wakeLock={screenWakeLock} diagnostics={edumonDiagnosticActions} />
    </main>
  )
}

export function EdumonApp() {
  const moduleId = moduleFromPath(window.location.pathname)
  if (!moduleId) return <EdumonLanding />
  return <EdumonMonitor module={EDUMON_MODULES[moduleId]} />
}
