import fs from 'node:fs'

function replaceOnce(text, from, to, label) {
  if (!text.includes(from)) throw new Error(`Missing replacement target: ${label}`)
  return text.replace(from, to)
}

// EDUMON top bar: inject the same account button component used by EDUVENT.
{
  const path = 'src/edumon/EdumonTopBar.tsx'
  let text = fs.readFileSync(path, 'utf8')
  text = replaceOnce(text,
    "import type { EdumonModuleDefinition } from './modules'\n",
    "import type { ReactNode } from 'react'\nimport type { EdumonModuleDefinition } from './modules'\n",
    'EdumonTopBar ReactNode import')
  text = text.replace(/function CloudIcon\(\) \{[\s\S]*?\n\}\n\nfunction ScenarioIcon/, 'function ScenarioIcon')
  text = replaceOnce(text,
    "  onScenario: () => void\n  onAccount: () => void\n  onAbout: () => void\n",
    "  onScenario: () => void\n  accountAction: ReactNode\n  onAbout: () => void\n",
    'EdumonTopBar props')
  text = replaceOnce(text,
    "export function EdumonTopBar({ module, simulationPaused, simulationSpeed, elapsedSeconds, onPausedChange, onSpeedChange, simulationControlsLocked = false, onScenario, onAccount, onAbout }: EdumonTopBarProps) {",
    "export function EdumonTopBar({ module, simulationPaused, simulationSpeed, elapsedSeconds, onPausedChange, onSpeedChange, simulationControlsLocked = false, onScenario, accountAction, onAbout }: EdumonTopBarProps) {",
    'EdumonTopBar signature')
  text = replaceOnce(text,
    "      <button type=\"button\" className=\"top-account-button\" onClick={onAccount} title=\"Instructor account\" aria-label=\"Open instructor account\"><CloudIcon /></button>\n",
    "      {accountAction}\n",
    'EdumonTopBar account action')
  fs.writeFileSync(path, text)
}

// EDUMON app: use shared account auth/dialog and wire the product scenario adapter to the core runtime.
{
  const path = 'src/edumon/EdumonApp.tsx'
  let text = fs.readFileSync(path, 'utf8')
  text = replaceOnce(text,
    "import { SharedBasicSessionPanel, useProductTeachingSession } from '../teaching/session'\nimport { getInstructorAccount } from '../instructorAccount'\n",
    "import { SharedBasicSessionPanel, useProductTeachingSession } from '../teaching/session'\nimport { InstructorAccountButton, InstructorAccountDialog, useInstructorAccountAuth } from '../components/InstructorAccountAuth'\nimport { useTeachingScenarioRuntime } from '../teaching/scenario/runtimeCore'\nimport { createEdumonScenarioRuntimeAdapter } from './scenarioAdapter'\n",
    'Edumon imports')
  text = replaceOnce(text,
    "  const [topPanel, setTopPanel] = useState<'scenario' | 'account' | 'about' | null>(null)\n",
    "  const [topPanel, setTopPanel] = useState<'scenario' | 'about' | null>(null)\n",
    'Edumon top panel state')
  text = text.replace("  const [instructorAuthenticated, setInstructorAuthenticated] = useState(false)\n", '')
  const oldAccountEffect = `  useEffect(() => {\n    let active = true\n    void getInstructorAccount()\n      .then((account) => { if (active) setInstructorAuthenticated(Boolean(account)) })\n      .catch(() => { if (active) setInstructorAuthenticated(false) })\n    return () => { active = false }\n  }, [topPanel])\n\n`
  text = replaceOnce(text, oldAccountEffect, '', 'Edumon legacy account probe')
  text = replaceOnce(text,
    "  const candidateCount = teachingSession.members.filter((member) => member.role === 'candidate').length\n  const candidateLocked = teachingSession.role === 'candidate'\n",
    "  const candidateCount = teachingSession.members.filter((member) => member.role === 'candidate').length\n  const candidateLocked = teachingSession.role === 'candidate'\n  const accountChangeLocked = teachingSession.role !== 'standalone'\n  const accountAuth = useInstructorAccountAuth({ locked: accountChangeLocked })\n  const instructorAuthenticated = Boolean(accountAuth.account)\n  const edumonScenarioAdapter = useMemo(() => createEdumonScenarioRuntimeAdapter((snapshot) => {\n    setPatientState(snapshot.patient)\n    setSimulationPaused(snapshot.simulationPaused)\n    setSimulationSpeed(snapshot.simulationSpeed)\n  }), [])\n  const scenarioRuntime = useTeachingScenarioRuntime(edumonScenarioAdapter)\n",
    'Edumon shared account/runtime state')
  text = replaceOnce(text,
    "  const sessionPanel = (\n",
    "  useEffect(() => {\n    if (scenarioRuntime.status !== 'running') return\n    void scenarioRuntime.evaluate({ simulationTime: elapsed, state: sharedTeachingState, measurements }, elapsed)\n  }, [scenarioRuntime, elapsed, sharedTeachingState, measurements])\n\n  const sessionPanel = (\n",
    'Edumon scenario evaluator')
  text = replaceOnce(text,
    "        onScenario={() => setTopPanel('scenario')}\n        onAccount={() => setTopPanel('account')}\n        onAbout={() => setTopPanel('about')}\n",
    "        onScenario={() => setTopPanel('scenario')}\n        accountAction={<InstructorAccountButton auth={accountAuth} />}\n        onAbout={() => setTopPanel('about')}\n",
    'Edumon top bar shared account button')
  text = text.replace(/\n      \{topPanel === 'account'[\s\S]*?<\/AuxiliaryMonitorModal>\}/, '')
  text = replaceOnce(text,
    "      {topPanel === 'about' && <AuxiliaryMonitorModal",
    "      <InstructorAccountDialog auth={accountAuth} locked={accountChangeLocked} />\n      {topPanel === 'about' && <AuxiliaryMonitorModal",
    'Edumon shared account dialog')
  fs.writeFileSync(path, text)
}

// EDUVENT: consume the same account auth state, button and dialog.
{
  const path = 'src/components/InstructorAccountControls.tsx'
  let text = fs.readFileSync(path, 'utf8')
  text = replaceOnce(text,
    "import { DynamicScenarioRuntimeLibrary } from './DynamicScenarioRuntimeLibrary'\n",
    "import { DynamicScenarioRuntimeLibrary } from './DynamicScenarioRuntimeLibrary'\nimport { InstructorAccountButton, InstructorAccountDialog, useInstructorAccountAuth } from './InstructorAccountAuth'\n",
    'EDUVENT shared account import')
  for (const item of ['  createInstructorAccount,\n', '  getInstructorAccount,\n', '  signInInstructor,\n', '  signOutInstructor,\n', '  subscribeToInstructorAccount,\n']) text = text.replace(item, '')
  const oldState = `  const [account, setAccount] = useState<User | null>(null)\n  useEffect(() => { onAccountConnectionChange?.(Boolean(account)) }, [account, onAccountConnectionChange])\n  const [accountOpen, setAccountOpen] = useState(false)\n  const [settingsOpen, setSettingsOpen] = useState(false)\n  const [scenarioOpen, setScenarioOpen] = useState(false)\n  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin')\n  const [email, setEmail] = useState('')\n  const [password, setPassword] = useState('')\n  const [busy, setBusy] = useState(false)\n  const [message, setMessage] = useState<string | null>(null)\n  const [error, setError] = useState<string | null>(null)\n`
  const newState = `  const accountChangeLocked = role !== 'standalone'\n  const accountAuth = useInstructorAccountAuth({ locked: accountChangeLocked })\n  const account = accountAuth.account\n  useEffect(() => { onAccountConnectionChange?.(Boolean(account)) }, [account, onAccountConnectionChange])\n  const [settingsOpen, setSettingsOpen] = useState(false)\n  const [scenarioOpen, setScenarioOpen] = useState(false)\n`
  text = replaceOnce(text, oldState, newState, 'EDUVENT auth state')

  const authStart = text.indexOf("  useEffect(() => {\n    let active = true\n    void getInstructorAccount()")
  const authEndMarker = "  const staticPresets = useMemo"
  const authEnd = text.indexOf(authEndMarker, authStart)
  if (authStart < 0 || authEnd < 0) throw new Error('Unable to locate EDUVENT legacy account lifecycle')
  // Preserve refreshPresets, which sits before the legacy lifecycle block.
  const lifecycleStart = authStart
  const lifecycleBlock = text.slice(lifecycleStart, authEnd)
  const refreshIndex = lifecycleBlock.indexOf('  const refreshPresets = async')
  if (refreshIndex < 0) throw new Error('refreshPresets not found in auth lifecycle block')
  const refreshText = lifecycleBlock.slice(refreshIndex, lifecycleBlock.indexOf("  useEffect(() => {\n    let active = true", refreshIndex))
  text = text.slice(0, lifecycleStart) + refreshText + `  useEffect(() => {\n    if (account) void refreshPresets(account)\n    else setPresets([])\n  }, [account])\n\n` + text.slice(authEnd)
  text = text.replace("\n  const accountChangeLocked = role !== 'standalone'\n", '\n')

  const buttonStart = text.indexOf('      <button\n        type="button"\n        className={`top-account-button ${account ? \'connected\' : \'\'}`}')
  const scenarioButton = text.indexOf("      {role !== 'candidate' && (", buttonStart)
  if (buttonStart < 0 || scenarioButton < 0) throw new Error('EDUVENT account button block not found')
  text = text.slice(0, buttonStart) + '      <InstructorAccountButton auth={accountAuth} />\n' + text.slice(scenarioButton)

  const dialogStart = text.indexOf('      {accountOpen && (')
  const scenarioDialogStart = text.indexOf('      {scenarioOpen && (', dialogStart)
  if (dialogStart < 0 || scenarioDialogStart < 0) throw new Error('EDUVENT account dialog block not found')
  text = text.slice(0, dialogStart) + '      <InstructorAccountDialog auth={accountAuth} locked={accountChangeLocked} />\n\n' + text.slice(scenarioDialogStart)

  fs.writeFileSync(path, text)
}

console.log('Shared instructor account and EDUMON scenario adapter refactor complete.')
