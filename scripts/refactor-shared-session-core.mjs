import fs from 'node:fs'

function replaceRequired(text, from, to, label) {
  if (!text.includes(from)) throw new Error(`Missing ${label}`)
  return text.replace(from, to)
}

// EDUVENT: remove duplicated candidate/self-directed launch state and use the shared launcher.
{
  const path = 'src/components/SessionPanel.tsx'
  let text = fs.readFileSync(path, 'utf8')
  text = replaceRequired(
    text,
    "import { CandidateInvitation } from './CandidateInvitation'\n",
    "import { CandidateInvitation } from './CandidateInvitation'\nimport { SharedSessionLauncher } from '../teaching/session'\n",
    'SessionPanel shared launcher import',
  )
  text = replaceRequired(
    text,
    "  const [joinMode, setJoinMode] = useState(false)\n  const [sessionKey, setSessionKey] = useState('')\n  const [displayName, setDisplayName] = useState('')\n  const candidateNameInputRef = useRef<HTMLInputElement | null>(null)\n  const [selfDirectedJoinMode, setSelfDirectedJoinMode] = useState(false)\n  const [assignmentCode, setAssignmentCode] = useState('')\n",
    '',
    'SessionPanel duplicated launcher state',
  )
  text = text.replace(/\n  useEffect\(\(\) => \{\n    if \(role !== 'standalone'\) return\n    const rawKey = new URLSearchParams[\s\S]*?\n  \}, \[role\]\)\n\n  useEffect\(\(\) => \{\n    if \(!recoverableCandidate\) return\n    setSessionKey\(recoverableCandidate\.sessionKey\)\n    setDisplayName\(recoverableCandidate\.displayName\)\n  \}, \[recoverableCandidate\]\)\n/, '\n')

  const standaloneStart = text.indexOf("  if (role === 'standalone') {")
  const instructorStart = text.indexOf("\n  if (role === 'instructor') {", standaloneStart)
  if (standaloneStart < 0 || instructorStart < 0) throw new Error('Unable to locate EDUVENT standalone SessionPanel block')

  const replacement = `  if (role === 'standalone') {
    return (
      <section className="session-panel standalone-session-panel">
        <div className="session-panel-heading">
          <div><span className="session-kicker">Teaching</span><h2>Session mode</h2></div>
          <span className="session-role-pill">Standalone</span>
        </div>
        {startWizardOpen ? (
          <div className="session-start-wizard">
            <div className="session-start-wizard-heading">
              <div><span>Instructor session</span><strong>Choose starting state</strong></div>
              <button type="button" className="session-start-close" onClick={() => setStartWizardOpen(false)} aria-label="Close session setup">×</button>
            </div>
            <div className="session-start-source-tabs" role="tablist" aria-label="Instructor session starting state">
              <button type="button" className={startSource === 'current' ? 'selected' : ''} onClick={() => setStartSource('current')}>Current setup</button>
              <button type="button" className={startSource === 'scenario' ? 'selected' : ''} disabled={startPresetsBusy || !startPresets.length} onClick={() => setStartSource('scenario')}>Saved scenario</button>
            </div>
            {startSource === 'current' ? (
              <div className="session-start-current-card">
                <span>Current standalone setup</span>
                <strong>{currentScenario.ventilator.mode} · FiO₂ {Math.round(currentScenario.ventilator.fio2 * 100)}% · PEEP {currentScenario.ventilator.peep}</strong>
                <div className="session-start-summary-chips">{summaryFor(currentScenario).map((item) => <em key={item}>{item}</em>)}</div>
                <small>You can configure the patient and ventilator in standalone mode before opening the room.</small>
              </div>
            ) : (
              <div className="session-start-scenarios">
                <div className="session-start-scenario-list">
                  {startPresets.map((preset) => (
                    <button type="button" key={preset.id} className={\`session-start-scenario-option \${selectedStartPresetId === preset.id ? 'selected' : ''}\`} onClick={() => setSelectedStartPresetId(preset.id)}>
                      <strong>{preset.name}</strong>
                      <small>{preset.scenario.description || 'Static scenario'}</small>
                    </button>
                  ))}
                </div>
                {selectedStartPreset && (
                  <div className="session-start-scenario-preview">
                    <span>Selected scenario</span>
                    <strong>{selectedStartPreset.name}</strong>
                    {selectedStartPreset.scenario.description && <p>{selectedStartPreset.scenario.description}</p>}
                    <div className="session-start-summary-chips">{summaryFor(selectedStartPreset.scenario).map((item) => <em key={item}>{item}</em>)}</div>
                    <button type="button" className="session-secondary-button" onClick={loadSelectedScenarioIntoStandalone}>Load into standalone to adjust</button>
                  </div>
                )}
              </div>
            )}
            {startPresetsBusy && <div className="session-start-note">Loading saved scenarios…</div>}
            {startPresetMessage && <div className="session-start-note">{startPresetMessage}</div>}
            <div className="session-start-actions">
              <button type="button" className="session-primary-button" disabled={!instructorAuthenticated || connection === 'connecting' || (startSource === 'scenario' && !selectedStartPreset)} onClick={() => void startInstructorFromWizard()}>
                {startSource === 'scenario' && selectedStartPreset ? \`Start with \${selectedStartPreset.name}\` : 'Start with current setup'}
              </button>
              <button type="button" className="session-secondary-button" onClick={() => setStartWizardOpen(false)}>Cancel</button>
            </div>
          </div>
        ) : (
          <SharedSessionLauncher
            instructorAuthenticated={instructorAuthenticated}
            connection={connection}
            error={error}
            recoverableInstructor={recoverableInstructor}
            recoverableCandidate={recoverableCandidate}
            onStartInstructor={() => void openInstructorStart()}
            onResumeInstructor={onResumeInstructor}
            onJoinCandidate={onJoinCandidate}
            onResumeCandidate={onResumeCandidate}
          />
        )}
        {connection === 'connecting' && <ConnectionBadge connection={connection} />}
      </section>
    )
  }
`
  text = text.slice(0, standaloneStart) + replacement + text.slice(instructorStart)
  fs.writeFileSync(path, text)
}

// EDUMON: attach product-aware shared session state to the monitor simulator.
{
  const path = 'src/edumon/EdumonApp.tsx'
  let text = fs.readFileSync(path, 'utf8')
  text = replaceRequired(
    text,
    "import { SimulationHardwareControls } from '../components/SimulationHardwareControls'\n",
    "import { SimulationHardwareControls } from '../components/SimulationHardwareControls'\nimport { SharedBasicSessionPanel, useProductTeachingSession } from '../teaching/session'\nimport { getInstructorAccount } from '../instructorAccount'\n",
    'EDUMON shared session imports',
  )
  text = replaceRequired(
    text,
    "const SAMPLE_RATE = 100\n",
    "const SAMPLE_RATE = 100\n\ninterface EdumonTeachingState {\n  patient: MonitorPatientState\n  simulationPaused: boolean\n  simulationSpeed: EdumonSimulationSpeed\n}\n",
    'EDUMON teaching state type',
  )
  text = replaceRequired(
    text,
    "  const [alarmSilenceRemaining, setAlarmSilenceRemaining] = useState(0)\n",
    "  const [alarmSilenceRemaining, setAlarmSilenceRemaining] = useState(0)\n  const [instructorAuthenticated, setInstructorAuthenticated] = useState(false)\n",
    'EDUMON instructor authentication state',
  )
  text = replaceRequired(
    text,
    "  const teachingHost = module.id === 'ana' ? edumonAnaTeachingHost : edumonIcuTeachingHost\n  const selectedAuxiliary = module.auxiliaryMonitors.find((item) => item.id === auxiliaryMonitor) ?? null\n",
    `  const teachingHost = module.id === 'ana' ? edumonAnaTeachingHost : edumonIcuTeachingHost
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
  const selectedAuxiliary = module.auxiliaryMonitors.find((item) => item.id === auxiliaryMonitor) ?? null

  useEffect(() => {
    let active = true
    void getInstructorAccount()
      .then((account) => { if (active) setInstructorAuthenticated(Boolean(account)) })
      .catch(() => { if (active) setInstructorAuthenticated(false) })
    return () => { active = false }
  }, [topPanel])

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
    />
  )
`,
    'EDUMON teaching session core',
  )
  text = replaceRequired(
    text,
    "        onSpeedChange={setSimulationSpeed}\n        onScenario={() => setTopPanel('scenario')}\n",
    "        onSpeedChange={setSimulationSpeed}\n        simulationControlsLocked={candidateLocked}\n        onScenario={() => setTopPanel('scenario')}\n",
    'EDUMON topbar session lock',
  )
  text = replaceRequired(
    text,
    "        <EdumonWorkspacePanel patientState={patientState} onPatientStateChange={setPatientState} teachingHost={teachingHost} meanPressure={measurements.meanPressure} />",
    "        <EdumonWorkspacePanel patientState={patientState} onPatientStateChange={setPatientState} teachingHost={teachingHost} teachingRole={teachingSession.role} teachingSessionId={teachingSession.session?.id ?? null} candidateCount={candidateCount} controlsLocked={candidateLocked} sessionPanel={sessionPanel} meanPressure={measurements.meanPressure} />",
    'EDUMON workspace session props',
  )
  text = replaceRequired(
    text,
    "          {auxiliaryMonitor === 'teaching' && <EdumonTeachingLibraries host={teachingHost} />}",
    "          {auxiliaryMonitor === 'teaching' && <EdumonTeachingLibraries host={teachingHost} role={teachingSession.role} sessionId={teachingSession.session?.id ?? null} candidateCount={candidateCount} />}",
    'EDUMON auxiliary teaching session props',
  )
  text = replaceRequired(
    text,
    "      {topPanel === 'scenario' && <AuxiliaryMonitorModal title=\"Scenario\" onClose={() => setTopPanel(null)}><div className=\"edumon-top-panel-content\"><span>ACTIVE SCENARIO</span><strong>None</strong><p>EDUMON will use the shared EDUSIM Scenario Runtime and the same scenario workflow as EDUVENT.</p></div></AuxiliaryMonitorModal>}\n      {topPanel === 'account' && <AuxiliaryMonitorModal title=\"Instructor account\" onClose={() => setTopPanel(null)}><EdumonTeachingLibraries host={teachingHost} /></AuxiliaryMonitorModal>}",
    "      {topPanel === 'scenario' && <AuxiliaryMonitorModal title=\"Scenarios and sessions\" onClose={() => setTopPanel(null)}>{sessionPanel}</AuxiliaryMonitorModal>}\n      {topPanel === 'account' && <AuxiliaryMonitorModal title=\"Instructor account\" onClose={() => setTopPanel(null)}><EdumonTeachingLibraries host={teachingHost} role={teachingSession.role} sessionId={teachingSession.session?.id ?? null} candidateCount={candidateCount} /></AuxiliaryMonitorModal>}",
    'EDUMON scenario/account modal session UI',
  )
  fs.writeFileSync(path, text)
}

console.log('Shared session refactor applied')
