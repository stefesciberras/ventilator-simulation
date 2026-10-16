from pathlib import Path

def patch(path, replacements):
 p=Path(path); s=p.read_text()
 for old,new in replacements:
  if old not in s: raise SystemExit(f'missing in {path}: '+old[:100])
  s=s.replace(old,new,1)
 p.write_text(s)

patch('src/diagnostics.ts',[
("""async function copyJsonPayload(payload: Record<string, unknown>, promptTitle: string): Promise<boolean> {
  const text = JSON.stringify(payload)
""","""async function copyJsonPayload(payload: Record<string, unknown>, promptTitle: string, pretty = false): Promise<boolean> {
  const text = JSON.stringify(payload, null, pretty ? 2 : undefined)
"""),
("export async function copyDiagnosticSnapshot(\n","""export async function copyScenarioSnapshot(snapshot: Record<string, unknown>): Promise<boolean> {
  const entries: ScenarioLogEntry[] = readScenarioLogs()
  return copyJsonPayload({
    schema: 'eduvent-scenario-diagnostic-v1',
    capturedAt: new Date().toISOString(),
    appVersion: APP_VERSION,
    purpose: 'Paste this JSON into the EDUVENT development thread for scenario debugging.',
    snapshot,
    recentScenarioEvents: entries.slice(-100),
  }, 'Copy scenario diagnostic JSON', true)
}

export async function copyDiagnosticSnapshot(
""")])

patch('src/App.tsx',[
("import { InstructorAccountControls } from './components/InstructorAccountControls'\n","import { InstructorAccountControls, type DynamicScenarioDiagnosticContext } from './components/InstructorAccountControls'\n"),
("import { appendScenarioLog, copyDiagnosticSnapshot, copyScenarioLogs } from './diagnostics'\n","import { appendScenarioLog, copyDiagnosticSnapshot, copyScenarioLogs, copyScenarioSnapshot } from './diagnostics'\n"),
("""  const [dynamicScenarioRuntimeHost, setDynamicScenarioRuntimeHost] = useState<HTMLDivElement | null>(null)
  const [mobileWorkspacePage, setMobileWorkspacePage] = useState<'ventilator' | 'settings'>('ventilator')
""","""  const [dynamicScenarioRuntimeHost, setDynamicScenarioRuntimeHost] = useState<HTMLDivElement | null>(null)
  const [dynamicScenarioDiagnostic, setDynamicScenarioDiagnostic] = useState<DynamicScenarioDiagnosticContext | null>(null)
  const [mobileWorkspacePage, setMobileWorkspacePage] = useState<'ventilator' | 'settings'>('ventilator')
"""),
("""  const toggleOxygenBoost = () => {
""","""  const copyScenarioSnapshotDiagnostics = async () => {
    const active = dynamicScenarioDiagnostic
    const copied = await copyScenarioSnapshot({
      session: {
        role: teachingSession.role,
        status: teachingSession.session?.status ?? null,
        connection: teachingSession.connection,
        runtimeTransport: teachingSession.runtimeTransportKind,
        runtimeConnection: teachingSession.localRuntimeConnection,
        candidateCount: teachingSession.members.filter((member) => member.role === 'candidate').length,
      },
      runtime: {
        scenarioElapsedSeconds: displayedScenarioElapsedTime,
        simulationPaused,
        simulationSpeed,
        stageElapsedSeconds: active ? Math.max(0, displayedScenarioElapsedTime - active.stageStartedAtSeconds) : null,
        activeScenario: active,
      },
      currentAppliedScenario: currentInstructorScenario,
      physiologyMeasurements,
    })
    setDiagnosticMenuOpen(false)
    setDiagnosticCopied(copied ? 'scenario' : null)
    if (copied) window.setTimeout(() => setDiagnosticCopied(null), 1800)
  }

  const toggleOxygenBoost = () => {
"""),
("""            onStartInstructorSession={startInstructorSession}
            onDynamicScenarioStarted={() => { setControlTab('teaching'); setMobileWorkspacePage('settings') }}
          />
""","""            onStartInstructorSession={startInstructorSession}
            onDynamicScenarioStarted={() => { setControlTab('teaching'); setMobileWorkspacePage('settings') }}
            onScenarioDiagnosticChange={setDynamicScenarioDiagnostic}
          />
"""),
("""                <button type="button" role="menuitem" onClick={() => void copyScenarioDiagnostics()}>
                  <strong>Scenario Logs</strong><small>Teaching-session and scenario runtime events</small>
                </button>
""","""                <button type="button" role="menuitem" onClick={() => void copyScenarioSnapshotDiagnostics()}>
                  <strong>Scenario Debug Snapshot</strong><small>Complete scenario, current stage/state and recent events</small>
                </button>
                <button type="button" role="menuitem" onClick={() => void copyScenarioDiagnostics()}>
                  <strong>Scenario Logs</strong><small>Teaching-session and scenario runtime events</small>
                </button>
""")])

patch('src/account.css',[(".dynamic-runtime-stage-card { display: grid; grid-template-columns: minmax(0,1.4fr) minmax(70px,.45fr) minmax(0,1fr); gap: 1px; background: #263a43; border: 1px solid #263a43; }\n",".dynamic-runtime-stage-card { display: grid; grid-template-columns: minmax(0,1.3fr) minmax(70px,.45fr) minmax(82px,.5fr) minmax(0,1.25fr); gap: 1px; background: #263a43; border: 1px solid #263a43; }\n")])
