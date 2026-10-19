import fs from 'node:fs'

function edit(path, changes) {
  let text = fs.readFileSync(path, 'utf8')
  for (const { from, to, label } of changes) {
    if (!text.includes(from)) throw new Error(`${path}: missing ${label}`)
    text = text.replace(from, to)
  }
  fs.writeFileSync(path, text)
}

edit('src/components/InstructorAccountControls.tsx', [
  {
    label: 'static scenario callback prop',
    from: `  onDynamicScenarioStarted?: () => void\n  onScenarioDiagnosticChange?: (context: DynamicScenarioDiagnosticContext | null) => void`,
    to: `  onDynamicScenarioStarted?: () => void\n  onStaticScenarioLoaded?: (name: string) => void\n  onScenarioDiagnosticChange?: (context: DynamicScenarioDiagnosticContext | null) => void`,
  },
  {
    label: 'static scenario callback destructuring',
    from: `export function InstructorAccountControls({ role, currentScenario, onLoadScenario, simulationPaused, onSimulationPausedChange, physiologyMeasurements, scenarioElapsedSeconds, sessionMembers, runtimeHost, onStartInstructorSession, onAccountConnectionChange, onDynamicScenarioStarted, onScenarioDiagnosticChange }: InstructorAccountControlsProps) {`,
    to: `export function InstructorAccountControls({ role, currentScenario, onLoadScenario, simulationPaused, onSimulationPausedChange, physiologyMeasurements, scenarioElapsedSeconds, sessionMembers, runtimeHost, onStartInstructorSession, onAccountConnectionChange, onDynamicScenarioStarted, onStaticScenarioLoaded, onScenarioDiagnosticChange }: InstructorAccountControlsProps) {`,
  },
  {
    label: 'static scenario load callback',
    from: `  const loadScenario = (preset: InstructorPresetRow) => {\n    onLoadScenario(preset.scenario)\n    setPresetMessage(\`Loaded “\${preset.name}”.\`)\n    setScenarioOpen(false)\n  }`,
    to: `  const loadScenario = (preset: InstructorPresetRow) => {\n    onLoadScenario(preset.scenario)\n    onStaticScenarioLoaded?.(preset.name)\n    setPresetMessage(\`Loaded “\${preset.name}”.\`)\n    setScenarioOpen(false)\n  }`,
  },
])

edit('src/App.tsx', [
  {
    label: 'static scenario state',
    from: `  const [dynamicScenarioDiagnostic, setDynamicScenarioDiagnostic] = useState<DynamicScenarioDiagnosticContext | null>(null)\n  const [mobileWorkspacePage, setMobileWorkspacePage] = useState<'ventilator' | 'settings'>('ventilator')`,
    to: `  const [dynamicScenarioDiagnostic, setDynamicScenarioDiagnostic] = useState<DynamicScenarioDiagnosticContext | null>(null)\n  const [activeStaticScenarioName, setActiveStaticScenarioName] = useState<string | null>(null)\n  const [mobileWorkspacePage, setMobileWorkspacePage] = useState<'ventilator' | 'settings'>('ventilator')`,
  },
  {
    label: 'scenario callbacks',
    from: `            onDynamicScenarioStarted={() => { setControlTab('teaching'); setMobileWorkspacePage('settings') }}\n            onScenarioDiagnosticChange={setDynamicScenarioDiagnostic}`,
    to: `            onDynamicScenarioStarted={() => { setActiveStaticScenarioName(null); setControlTab('teaching'); setMobileWorkspacePage('settings') }}\n            onStaticScenarioLoaded={(name) => { setActiveStaticScenarioName(name); setControlTab('teaching') }}\n            onScenarioDiagnosticChange={setDynamicScenarioDiagnostic}`,
  },
  {
    label: 'active scenario teaching card',
    from: `                  onBroadcastNow={teachingSession.broadcastNow}\n                />\n                <TeachingMediaInstructorPanel`,
    to: `                  onBroadcastNow={teachingSession.broadcastNow}\n                />\n                {teachingSession.role !== 'candidate' && (dynamicScenarioDiagnostic || activeStaticScenarioName) && (\n                  <section className=\"teaching-active-scenario\" aria-label=\"Active scenario\">\n                    <div className=\"teaching-active-scenario-heading\">\n                      <span>Active scenario</span>\n                      <strong className={dynamicScenarioDiagnostic ? 'dynamic' : 'static'}>{dynamicScenarioDiagnostic ? 'Dynamic' : 'Static'}</strong>\n                    </div>\n                    <div className=\"teaching-active-scenario-body\">\n                      <strong>{dynamicScenarioDiagnostic?.scenarioName ?? activeStaticScenarioName}</strong>\n                      {dynamicScenarioDiagnostic && (\n                        <span>Stage {dynamicScenarioDiagnostic.stageIndex + 1}: {dynamicScenarioDiagnostic.stageName}</span>\n                      )}\n                    </div>\n                  </section>\n                )}\n                <TeachingMediaInstructorPanel`,
  },
])

const cssPath = 'src/teaching/teaching.css'
let css = fs.readFileSync(cssPath, 'utf8')
if (!css.includes('.teaching-active-scenario')) {
  css += `\n\n/* Active scenario summary in Teaching */\n.teaching-active-scenario { display:grid; gap:8px; margin:0 0 12px; padding:11px 13px; border:1px solid #3c515c; border-radius:10px; background:#101a20; box-shadow:inset 0 1px 0 rgba(255,255,255,.035); }\n.teaching-active-scenario-heading { display:flex; align-items:center; justify-content:space-between; gap:10px; }\n.teaching-active-scenario-heading > span { color:#8297a1; font-size:.68rem; font-weight:800; letter-spacing:.11em; text-transform:uppercase; }\n.teaching-active-scenario-heading > strong { padding:3px 7px; border:1px solid #5c7380; border-radius:999px; color:#b8ccd5; font-size:.62rem; letter-spacing:.06em; text-transform:uppercase; }\n.teaching-active-scenario-heading > strong.dynamic { color:#ffd28a; border-color:#9c6d30; background:rgba(156,109,48,.12); }\n.teaching-active-scenario-heading > strong.static { color:#9ee6f8; border-color:#39798b; background:rgba(57,121,139,.12); }\n.teaching-active-scenario-body { display:flex; align-items:baseline; justify-content:space-between; gap:12px; min-width:0; }\n.teaching-active-scenario-body > strong { min-width:0; overflow:hidden; color:#eff7f9; font-size:.9rem; text-overflow:ellipsis; white-space:nowrap; }\n.teaching-active-scenario-body > span { flex:0 0 auto; color:#93a8b1; font-size:.72rem; }\n@media (max-width:680px) { .teaching-active-scenario-body { align-items:flex-start; flex-direction:column; gap:4px; } .teaching-active-scenario-body > strong { max-width:100%; } }\n`
  fs.writeFileSync(cssPath, css)
}

edit('src/appVersion.ts', [
  { label: 'version bump', from: `export const APP_VERSION = '0.82.9.7'`, to: `export const APP_VERSION = '0.82.9.8'` },
])

console.log('Applied v0.82.9.8 active scenario indicator')
