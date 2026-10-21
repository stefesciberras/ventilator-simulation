import fs from 'node:fs'

const path = 'src/App.tsx'
let source = fs.readFileSync(path, 'utf8')

const importAnchor = "import { PhysiologyMeasurementsDialog } from './components/PhysiologyMeasurementsDialog'\n"
const sharedImport = "import { SimulationTopBar } from './components/SimulationTopBar'\n"
if (!source.includes(sharedImport)) {
  if (!source.includes(importAnchor)) throw new Error('Could not find import anchor')
  source = source.replace(importAnchor, importAnchor + sharedImport)
}

source = source.replace(
  /\nfunction formatSimulationClock\(seconds: number\): string \{[\s\S]*?\n\}\n\ntype MetricAlarmLevel/,
  '\n\ntype MetricAlarmLevel',
)

source = source.replace(
  /\nfunction PauseIcon\(\{ paused \}: \{ paused: boolean \}\) \{[\s\S]*?\n\}\n\nfunction FreezeWaveformIcon/,
  '\n\nfunction FreezeWaveformIcon',
)

const topBarStart = '      <header className="topbar">'
const navStart = '      <nav className={`mobile-workspace-switcher ${candidateControlsVisible ? \'\' : \'candidate-controls-hidden\'}`} aria-label="Mobile workspace pages">'
const start = source.indexOf(topBarStart)
const end = source.indexOf(navStart, start)
if (start < 0 || end < 0) throw new Error('Could not locate EDUVENT top bar boundaries')

const sharedTopBar = `      <SimulationTopBar
        brandKicker="EDUVENT"
        title="Mechanical Ventilation Simulator"
        simulationPaused={simulationPaused}
        simulationSpeed={simulationSpeed}
        elapsedSeconds={displayedScenarioElapsedTime}
        onPausedChange={setSimulationPaused}
        onSpeedChange={(speed) => setSimulationSpeed(speed as SimulationSpeed)}
        speedOptions={SIMULATION_SPEEDS}
        pauseDisabled={teachingSession.role === 'candidate'}
        speedDisabled={teachingSession.role === 'candidate'}
        pauseTitle={teachingSession.role === 'candidate'
          ? (simulationPaused ? 'Simulation paused by instructor' : 'Simulation pause controlled by instructor')
          : (simulationPaused ? 'Resume whole simulation' : 'Pause whole simulation')}
        pauseAriaLabel={teachingSession.role === 'candidate'
          ? (simulationPaused ? 'Simulation paused by instructor' : 'Simulation pause controlled by instructor')
          : (simulationPaused ? 'Resume whole simulation' : 'Pause whole simulation')}
        speedTitle={teachingSession.role === 'candidate' ? 'Simulation speed controlled by instructor' : 'Simulation speed'}
        statusText={simulationPaused ? 'SIMULATION PAUSED' : 'SIMULATION ACTIVE'}
        version={APP_VERSION}
        onAbout={() => setAboutOpen(true)}
        rightActions={(
          <>
            <InstructorAccountControls
              role={teachingSession.role}
              sessionId={teachingSession.session?.id ?? null}
              currentScenario={currentInstructorScenario}
              onLoadScenario={loadInstructorScenario}
              simulationPaused={simulationPaused}
              onSimulationPausedChange={setSimulationPaused}
              physiologyMeasurements={physiologyMeasurements}
              scenarioElapsedSeconds={displayedScenarioElapsedTime}
              sessionMembers={teachingSession.members}
              runtimeHost={dynamicScenarioRuntimeHost}
              onStartInstructorSession={startInstructorSession}
              onAccountConnectionChange={setInstructorAccountConnected}
              onDynamicScenarioStarted={() => { setActiveStaticScenarioName(null); setControlTab('teaching'); setMobileWorkspacePage('settings') }}
              onStaticScenarioLoaded={(name) => { setActiveStaticScenarioName(name); setControlTab('teaching') }}
              onScenarioDiagnosticChange={setDynamicScenarioDiagnostic}
              scenarioActionEvent={scenarioActionEvent}
            />
            {teachingSession.role === 'candidate' && (
              <CaseMediaPanel
                role={teachingSession.role}
                sessionId={teachingSession.session?.id ?? null}
                scenarioMediaIds={scenarioMediaIds}
                onScenarioMediaIdsChange={setScenarioMediaIds}
              />
            )}
            <div className="top-diagnostic-menu">
              <button
                className={\`top-diagnostic-button \${diagnosticMenuOpen ? 'active' : ''} \${diagnosticCopied ? 'copied' : ''}\`}
                type="button"
                onClick={() => setDiagnosticMenuOpen((open) => !open)}
                title={diagnosticCopied ? \`\${diagnosticCopied === 'simulation' ? 'Simulation' : 'Scenario'} logs copied\` : 'Diagnostics'}
                aria-label="Open diagnostics menu"
                aria-haspopup="menu"
                aria-expanded={diagnosticMenuOpen}
              ><DiagnosticIcon copied={Boolean(diagnosticCopied)} /></button>
              {diagnosticMenuOpen && (
                <div className="top-diagnostic-dropdown" role="menu" aria-label="Copy diagnostics">
                  <button type="button" role="menuitem" onClick={() => void copyDiagnostics()}>
                    <strong>Simulation Logs</strong><small>Settings, alarms and visible waveform</small>
                  </button>
                  <button type="button" role="menuitem" onClick={() => void copyScenarioSnapshotDiagnostics()}>
                    <strong>Scenario Debug Snapshot</strong><small>Complete scenario, current stage/state and recent events</small>
                  </button>
                  <button type="button" role="menuitem" onClick={() => void copyScenarioDiagnostics()}>
                    <strong>Scenario Logs</strong><small>Teaching-session and scenario runtime events</small>
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      />

`

source = source.slice(0, start) + sharedTopBar + source.slice(end)
fs.writeFileSync(path, source)
console.log('EDUVENT top bar migrated to SimulationTopBar')
