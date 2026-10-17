from pathlib import Path


def replace(path: str, old: str, new: str):
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f'Missing expected text in {path}: {old[:120]!r}')
    p.write_text(text.replace(old, new, 1))

# Version
replace('src/appVersion.ts', "export const APP_VERSION = '0.82.8.2'", "export const APP_VERSION = '0.82.8.3'")

# Lift permanent instructor account connection state to App.
replace('src/App.tsx',
"export default function App() {\n  const [aboutOpen, setAboutOpen] = useState(false)",
"export default function App() {\n  const [aboutOpen, setAboutOpen] = useState(false)\n  const [instructorAccountConnected, setInstructorAccountConnected] = useState(false)")
replace('src/App.tsx',
"            onStartInstructorSession={startInstructorSession}\n            onDynamicScenarioStarted=",
"            onStartInstructorSession={startInstructorSession}\n            onAccountConnectionChange={setInstructorAccountConnected}\n            onDynamicScenarioStarted=")
replace('src/App.tsx',
"                <SessionPanel\n                  role={teachingSession.role}",
"                <SessionPanel\n                  role={teachingSession.role}\n                  instructorAuthenticated={instructorAccountConnected}")
replace('src/App.tsx',
"                <TeachingMediaInstructorPanel\n                  role={teachingSession.role}",
"                <TeachingMediaInstructorPanel\n                  role={teachingSession.role}\n                  instructorAuthenticated={instructorAccountConnected}")
replace('src/App.tsx',
"      <TeachingInstructorWorkspace\n        role={teachingSession.role}",
"      <TeachingInstructorWorkspace\n        role={teachingSession.role}\n        instructorAuthenticated={instructorAccountConnected}")

# Account control reports whether a permanent instructor is connected.
replace('src/components/InstructorAccountControls.tsx',
"  onStartInstructorSession: (scenario?: InstructorScenarioSnapshot) => Promise<void>\n  onDynamicScenarioStarted?: () => void",
"  onStartInstructorSession: (scenario?: InstructorScenarioSnapshot) => Promise<void>\n  onAccountConnectionChange?: (connected: boolean) => void\n  onDynamicScenarioStarted?: () => void")
replace('src/components/InstructorAccountControls.tsx',
"export function InstructorAccountControls({ role, currentScenario, onLoadScenario, simulationPaused, onSimulationPausedChange, physiologyMeasurements, scenarioElapsedSeconds, sessionMembers, runtimeHost, onStartInstructorSession, onDynamicScenarioStarted, onScenarioDiagnosticChange }: InstructorAccountControlsProps) {",
"export function InstructorAccountControls({ role, currentScenario, onLoadScenario, simulationPaused, onSimulationPausedChange, physiologyMeasurements, scenarioElapsedSeconds, sessionMembers, runtimeHost, onStartInstructorSession, onAccountConnectionChange, onDynamicScenarioStarted, onScenarioDiagnosticChange }: InstructorAccountControlsProps) {")
replace('src/components/InstructorAccountControls.tsx',
"  const [account, setAccount] = useState<User | null>(null)\n  const [accountOpen, setAccountOpen] = useState(false)",
"  const [account, setAccount] = useState<User | null>(null)\n  useEffect(() => { onAccountConnectionChange?.(Boolean(account)) }, [account, onAccountConnectionChange])\n  const [accountOpen, setAccountOpen] = useState(false)")

# Session panel: candidates remain available anonymously, instructor starts/resumes require account.
replace('src/components/SessionPanel.tsx',
"interface SessionPanelProps {\n  role: SessionRole",
"interface SessionPanelProps {\n  role: SessionRole\n  instructorAuthenticated: boolean")
replace('src/components/SessionPanel.tsx',
"export function SessionPanel({\n  role,\n  simulatorExpanded,",
"export function SessionPanel({\n  role,\n  instructorAuthenticated,\n  simulatorExpanded,")
replace('src/components/SessionPanel.tsx',
"  const openInstructorStart = async () => {\n    setStartWizardOpen(true)",
"  const openInstructorStart = async () => {\n    if (!instructorAuthenticated) return\n    setStartWizardOpen(true)")
replace('src/components/SessionPanel.tsx',
"  const startInstructorFromWizard = async () => {\n    const scenario =",
"  const startInstructorFromWizard = async () => {\n    if (!instructorAuthenticated) return\n    const scenario =")
replace('src/components/SessionPanel.tsx',
"disabled={connection === 'connecting' || (startSource === 'scenario' && !selectedStartPreset)}",
"disabled={!instructorAuthenticated || connection === 'connecting' || (startSource === 'scenario' && !selectedStartPreset)}")
replace('src/components/SessionPanel.tsx',
"<button type=\"button\" className=\"session-primary-button\" disabled={connection === 'connecting'} onClick={() => void openInstructorStart()}>Start instructor session</button>",
"<button type=\"button\" className=\"session-primary-button\" disabled={!instructorAuthenticated || connection === 'connecting'} title={!instructorAuthenticated ? 'Sign in to an instructor account first' : undefined} onClick={() => void openInstructorStart()}>Start instructor session</button>")
replace('src/components/SessionPanel.tsx',
"{recoverableInstructor && onResumeInstructor && (<button type=\"button\" className=\"session-secondary-button\" onClick={() => void onResumeInstructor(recoverableInstructor.sessionId)}>Rejoin instructor {recoverableInstructor.sessionKey}</button>)}\n            </div>",
"{recoverableInstructor && onResumeInstructor && (<button type=\"button\" className=\"session-secondary-button\" disabled={!instructorAuthenticated} title={!instructorAuthenticated ? 'Sign in to an instructor account first' : undefined} onClick={() => void onResumeInstructor(recoverableInstructor.sessionId)}>Rejoin instructor {recoverableInstructor.sessionKey}</button>)}\n              {!instructorAuthenticated && <div className=\"session-instructor-signin-note\">Sign in to an instructor account to start or resume an instructor teaching session. Joining as a candidate does not require an account.</div>}\n            </div>")

# Media: do not query the cloud library without a permanent instructor account; show locked block.
replace('src/teaching/TeachingMediaPanel.tsx',
"interface TeachingMediaInstructorPanelProps {\n  role: TeachingRole",
"interface TeachingMediaInstructorPanelProps {\n  role: TeachingRole\n  instructorAuthenticated: boolean")
replace('src/teaching/TeachingMediaPanel.tsx',
"export function TeachingMediaInstructorPanel({ role, sessionId, scenarioMediaIds, onScenarioMediaIdsChange }: TeachingMediaInstructorPanelProps) {",
"export function TeachingMediaInstructorPanel({ role, instructorAuthenticated, sessionId, scenarioMediaIds, onScenarioMediaIdsChange }: TeachingMediaInstructorPanelProps) {")
replace('src/teaching/TeachingMediaPanel.tsx',
"  const refresh = useCallback(async () => {\n    if (role === 'candidate') return",
"  const refresh = useCallback(async () => {\n    if (role === 'candidate' || !instructorAuthenticated) {\n      setLibrary([])\n      setReleasedIds(new Set())\n      setError(null)\n      return\n    }")
replace('src/teaching/TeachingMediaPanel.tsx',
"  }, [role, selectedId, sessionId])",
"  }, [role, instructorAuthenticated, selectedId, sessionId])")
replace('src/teaching/TeachingMediaPanel.tsx',
"  if (role === 'candidate') return null\n\n  const upload =",
"  if (role === 'candidate') return null\n  if (!instructorAuthenticated) return (\n    <section className=\"teaching-media-panel teaching-account-required\" aria-label=\"Media\">\n      <div className=\"teaching-media-heading teaching-media-heading-static\"><span><strong>Media</strong></span></div>\n      <div className=\"teaching-account-required-message\"><strong>Instructor sign-in required</strong><span>Sign in to your instructor account to use the media library and present media to candidates.</span></div>\n    </section>\n  )\n\n  const upload =")

# Questions/Polls: locked unless permanent instructor account is connected.
replace('src/teaching/TeachingWorkspace.tsx',
"  role,\n  host,",
"  role,\n  instructorAuthenticated,\n  host,")
replace('src/teaching/TeachingWorkspace.tsx',
"  role: TeachingRole\n  host: TeachingHostAdapter",
"  role: TeachingRole\n  instructorAuthenticated: boolean\n  host: TeachingHostAdapter")
replace('src/teaching/TeachingWorkspace.tsx',
"  if (role === 'candidate') return null\n\n  const resetComposer =",
"  if (role === 'candidate') return null\n  if (!instructorAuthenticated) return (\n    <section className=\"teaching-prompt-instructor teaching-account-required\" aria-label=\"Questions and Polls\">\n      <div className=\"teaching-prompt-section-heading\"><div><h3>Questions and Polls</h3></div></div>\n      <div className=\"teaching-account-required-message\"><strong>Instructor sign-in required</strong><span>Sign in to your instructor account to prepare, save and present questions or polls.</span></div>\n    </section>\n  )\n\n  const resetComposer =")

# Styling.
with Path('src/session.css').open('a') as f:
    f.write("\n/* Permanent instructor account gating */\n.session-instructor-signin-note{flex:1 1 100%;margin-top:4px;padding:9px 11px;border:1px solid #4a5357;border-radius:8px;background:#171d20;color:#aebbc0;font-size:.78rem;line-height:1.4}.session-instructor-signin-note::before{content:'Cloud ';color:#79c6e2;font-weight:800}\n")
with Path('src/teaching/teaching.css').open('a') as f:
    f.write("\n/* Permanent instructor account gating */\n.teaching-account-required{opacity:.82}.teaching-account-required-message{display:grid;gap:4px;margin-top:10px;padding:12px;border:1px dashed #465860;border-radius:8px;background:#0d171c;color:#98a9b0}.teaching-account-required-message strong{color:#dbe7eb;font-size:.86rem}.teaching-account-required-message span{font-size:.78rem;line-height:1.4}.teaching-media-heading-static{cursor:default}\n")
