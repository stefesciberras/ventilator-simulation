import fs from 'node:fs'

function replaceOnce(text, from, to, label) {
  if (!text.includes(from)) throw new Error(`Missing target: ${label}`)
  return text.replace(from, to)
}

{
  const path = 'src/App.tsx'
  let text = fs.readFileSync(path, 'utf8')
  text = replaceOnce(text,
    "import { SimulationTopBar } from './components/SimulationTopBar'\n",
    "import { SimulationTopBar } from './components/SimulationTopBar'\nimport { SimulationAboutDialog } from './components/SimulationAboutDialog'\nimport { SimulationDiagnosticsMenu, type SimulationDiagnosticAction } from './components/SimulationDiagnosticsMenu'\n",
    'EDUVENT shared chrome imports')

  const aboutStart = text.indexOf('      {aboutOpen && (\n        <div className="about-backdrop"')
  const topbarStart = text.indexOf('      <SimulationTopBar', aboutStart)
  if (aboutStart < 0 || topbarStart < 0) throw new Error('EDUVENT About block not found')
  text = text.slice(0, aboutStart) + `      <SimulationAboutDialog\n        open={aboutOpen}\n        productLabel="EDUVENT"\n        title="Mechanical Ventilation Simulator"\n        description="An interactive mechanical ventilation simulator for education and training."\n        version={APP_VERSION}\n        onClose={() => setAboutOpen(false)}\n        wakeLock={screenWakeLock}\n        diagnostics={eduventDiagnosticActions}\n      />\n` + text.slice(topbarStart)

  const marker = '  return (\n    <main className="app-shell">'
  const diagnostics = `  const eduventDiagnosticActions: SimulationDiagnosticAction[] = [\n    { id: 'simulation', label: 'Simulation Logs', description: 'Settings, alarms and visible waveform', onSelect: copyDiagnostics },\n    { id: 'snapshot', label: 'Scenario Debug Snapshot', description: 'Complete scenario, current stage/state and recent events', onSelect: copyScenarioSnapshotDiagnostics },\n    { id: 'scenario', label: 'Scenario Logs', description: 'Teaching-session and scenario runtime events', onSelect: copyScenarioDiagnostics },\n  ]\n\n`
  text = replaceOnce(text, marker, diagnostics + marker, 'EDUVENT diagnostic actions')

  const oldTiming = `        pauseDisabled={teachingSession.role === 'candidate'}\n        speedDisabled={teachingSession.role === 'candidate'}\n        pauseTitle={teachingSession.role === 'candidate'\n          ? (simulationPaused ? 'Simulation paused by instructor' : 'Simulation pause controlled by instructor')\n          : (simulationPaused ? 'Resume whole simulation' : 'Pause whole simulation')}\n        pauseAriaLabel={teachingSession.role === 'candidate'\n          ? (simulationPaused ? 'Simulation paused by instructor' : 'Simulation pause controlled by instructor')\n          : (simulationPaused ? 'Resume whole simulation' : 'Pause whole simulation')}\n        speedTitle={teachingSession.role === 'candidate' ? 'Simulation speed controlled by instructor' : 'Simulation speed'}\n`
  text = replaceOnce(text, oldTiming, "        controlsControlledByInstructor={teachingSession.role === 'candidate'}\n", 'EDUVENT timing authority')

  const diagStart = text.indexOf('            <div className="top-diagnostic-menu">')
  const diagEnd = text.indexOf('            </div>\n          </>\n        )}', diagStart)
  if (diagStart < 0 || diagEnd < 0) throw new Error('EDUVENT diagnostic menu not found')
  text = text.slice(0, diagStart) + '            <SimulationDiagnosticsMenu actions={eduventDiagnosticActions} />\n' + text.slice(diagEnd + '            </div>\n'.length)
  fs.writeFileSync(path, text)
}

{
  const path = 'src/edumon/EdumonApp.tsx'
  let text = fs.readFileSync(path, 'utf8')
  text = replaceOnce(text,
    "import { SimulationHardwareControls } from '../components/SimulationHardwareControls'\n",
    "import { SimulationHardwareControls } from '../components/SimulationHardwareControls'\nimport { SimulationAboutDialog } from '../components/SimulationAboutDialog'\nimport { SimulationDiagnosticsMenu, type SimulationDiagnosticAction } from '../components/SimulationDiagnosticsMenu'\nimport { useScreenWakeLock } from '../useScreenWakeLock'\n",
    'EDUMON shared chrome imports')
  text = replaceOnce(text,
    "  const alarmSilenceTimeoutRef = useRef<number | null>(null)\n",
    "  const alarmSilenceTimeoutRef = useRef<number | null>(null)\n  const screenWakeLock = useScreenWakeLock()\n",
    'EDUMON wake lock')

  const marker = '  return (\n    <main className={`app-shell edumon-app-shell edumon-module-${module.id}`}>'
  const actions = `  const copyEdumonMonitorDiagnostics = async () => {\n    await navigator.clipboard.writeText(JSON.stringify({ product: module.productName, simulationTime: elapsed, patient: patientState, measurements, simulationPaused, simulationSpeed }, null, 2))\n  }\n  const copyEdumonSessionDiagnostics = async () => {\n    await navigator.clipboard.writeText(JSON.stringify({ product: module.productName, role: teachingSession.role, session: teachingSession.session, members: teachingSession.members, scenarioRuntime: scenarioRuntime.state }, null, 2))\n  }\n  const edumonDiagnosticActions: SimulationDiagnosticAction[] = [\n    { id: 'monitor', label: 'Monitor State', description: 'Patient settings, measurements and timing', onSelect: copyEdumonMonitorDiagnostics },\n    { id: 'session', label: 'Session / Scenario State', description: 'Teaching session and scenario runtime state', onSelect: copyEdumonSessionDiagnostics },\n  ]\n\n`
  text = replaceOnce(text, marker, actions + marker, 'EDUMON diagnostic actions')
  text = replaceOnce(text,
    "        accountAction={<InstructorAccountButton auth={accountAuth} />}\n        onAbout={() => setTopPanel('about')}\n",
    "        accountAction={<InstructorAccountButton auth={accountAuth} />}\n        diagnosticsAction={<SimulationDiagnosticsMenu actions={edumonDiagnosticActions} />}\n        onAbout={() => setTopPanel('about')}\n",
    'EDUMON diagnostics action')
  const oldAbout = `      {topPanel === 'about' && <AuxiliaryMonitorModal title={module.productName} onClose={() => setTopPanel(null)}><div className="edumon-top-panel-content"><span>EDUSIM MONITORING PLATFORM</span><strong>{module.subtitle}</strong><p>Version v0.1.0.0</p><p>Educational simulation only — not a medical device and not for clinical decision-making.</p></div></AuxiliaryMonitorModal>}\n`
  const newAbout = `      <SimulationAboutDialog open={topPanel === 'about'} productLabel={module.productName} title={module.subtitle} description="An interactive patient-monitor simulator for anaesthesia, acute care and intensive-care education." version="0.1.0.0" onClose={() => setTopPanel(null)} wakeLock={screenWakeLock} diagnostics={edumonDiagnosticActions} />\n`
  text = replaceOnce(text, oldAbout, newAbout, 'EDUMON About dialog')
  fs.writeFileSync(path, text)
}

console.log('Shared runtime chrome refactor applied.')
