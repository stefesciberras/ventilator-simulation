from pathlib import Path


def replace(path: str, old: str, new: str, expected: int = 1) -> None:
    p = Path(path)
    text = p.read_text()
    actual = text.count(old)
    if actual != expected:
        raise SystemExit(f"{path}: expected {expected} occurrence(s), found {actual}: {old[:180]!r}")
    p.write_text(text.replace(old, new))

Path('src/appVersion.ts').write_text("export const APP_VERSION = '0.81.3'\n")

app = 'src/App.tsx'
replace(app,
    "import { copyDiagnosticSnapshot } from './diagnostics'\n",
    "import { appendScenarioLog, copyDiagnosticSnapshot, copyScenarioLogs } from './diagnostics'\n")
replace(app,
    "  const [diagnosticCopied, setDiagnosticCopied] = useState(false)\n",
    "  const [diagnosticCopied, setDiagnosticCopied] = useState<'simulation' | 'scenario' | null>(null)\n  const [diagnosticMenuOpen, setDiagnosticMenuOpen] = useState(false)\n")
replace(app,
    "            {(['teaching', 'vent', 'patient', 'physio'] as const).map((tab) => (\n",
    "            {(['vent', 'patient', 'physio', 'teaching'] as const).map((tab) => (\n")
replace(app,
    "    scenarioClockOriginRef.current = simulationTimeRef.current\n    setVentilator({ ...scenario.ventilator })\n",
    "    scenarioClockOriginRef.current = simulationTimeRef.current\n    appendScenarioLog('scenario.loaded', {\n      role: teachingSession.role,\n      sessionId: teachingSession.session?.id ?? null,\n      kind: scenario.kind ?? 'static',\n      ventilatorMode: scenario.ventilator.mode,\n      fio2: scenario.ventilator.fio2,\n      peep: scenario.ventilator.peep,\n      mediaCount: scenario.mediaIds?.length ?? 0,\n    })\n    setVentilator({ ...scenario.ventilator })\n")
replace(app,
    "    setDiagnosticCopied(copied)\n    if (copied) window.setTimeout(() => setDiagnosticCopied(false), 1800)\n  }\n\n  const toggleOxygenBoost = () => {\n",
    "    setDiagnosticMenuOpen(false)\n    setDiagnosticCopied(copied ? 'simulation' : null)\n    if (copied) window.setTimeout(() => setDiagnosticCopied(null), 1800)\n  }\n\n  const copyScenarioDiagnostics = async () => {\n    const copied = await copyScenarioLogs({\n      role: teachingSession.role,\n      sessionId: teachingSession.session?.id ?? null,\n      sessionKey: teachingSession.session?.session_key ?? null,\n      sessionStatus: teachingSession.session?.status ?? null,\n      connection: teachingSession.connection,\n      runtimeTransport: teachingSession.runtimeTransportKind,\n      runtimeConnection: teachingSession.localRuntimeConnection,\n      scenarioElapsedSeconds: displayedScenarioElapsedTime,\n      simulationPaused,\n      candidateCount: teachingSession.members.filter((member) => member.role === 'candidate').length,\n    })\n    setDiagnosticMenuOpen(false)\n    setDiagnosticCopied(copied ? 'scenario' : null)\n    if (copied) window.setTimeout(() => setDiagnosticCopied(null), 1800)\n  }\n\n  const toggleOxygenBoost = () => {\n")
old_button = '''          <button
            className={`top-diagnostic-button ${diagnosticCopied ? 'active copied' : ''}`}
            type="button"
            onClick={copyDiagnostics}
            title={diagnosticCopied ? 'Diagnostic JSON copied' : 'Copy settings and visible waveform as diagnostic JSON'}
            aria-label={diagnosticCopied ? 'Diagnostic JSON copied' : 'Copy diagnostic JSON'}
          ><DiagnosticIcon copied={diagnosticCopied} /></button>
'''
new_button = '''          <div className="top-diagnostic-menu">
            <button
              className={`top-diagnostic-button ${diagnosticMenuOpen ? 'active' : ''} ${diagnosticCopied ? 'copied' : ''}`}
              type="button"
              onClick={() => setDiagnosticMenuOpen((open) => !open)}
              title={diagnosticCopied ? `${diagnosticCopied === 'simulation' ? 'Simulation' : 'Scenario'} logs copied` : 'Diagnostics'}
              aria-label="Open diagnostics menu"
              aria-haspopup="menu"
              aria-expanded={diagnosticMenuOpen}
            ><DiagnosticIcon copied={Boolean(diagnosticCopied)} /></button>
            {diagnosticMenuOpen && (
              <div className="top-diagnostic-dropdown" role="menu" aria-label="Copy diagnostics">
                <button type="button" role="menuitem" onClick={() => void copyDiagnostics()}>
                  <strong>Simulation Logs</strong><small>Settings, alarms and visible waveform</small>
                </button>
                <button type="button" role="menuitem" onClick={() => void copyScenarioDiagnostics()}>
                  <strong>Scenario Logs</strong><small>Teaching-session and scenario runtime events</small>
                </button>
              </div>
            )}
          </div>
'''
replace(app, old_button, new_button)
