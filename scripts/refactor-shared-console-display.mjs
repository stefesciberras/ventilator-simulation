import fs from 'node:fs'

function replaceOrThrow(text, from, to, label) {
  if (!text.includes(from)) throw new Error(`Missing ${label}`)
  return text.replace(from, to)
}

// EDUMON
{
  const path = 'src/edumon/EdumonApp.tsx'
  let text = fs.readFileSync(path, 'utf8')
  text = replaceOrThrow(text,
    "import { SimulationWorkspaceShell } from '../components/SimulationWorkspaceShell'\n",
    "import { SimulationWorkspaceShell } from '../components/SimulationWorkspaceShell'\nimport { SimulationConsoleShell } from '../components/SimulationConsoleShell'\nimport { useSimulationDisplayControls } from '../components/useSimulationDisplayControls'\n",
    'EDUMON shared imports')
  text = text.replace("import { TeachingLaserPointerSurface, useTeachingDisplaySync } from '../teaching'", "import { TeachingLaserPointerSurface } from '../teaching'")
  text = replaceOrThrow(text,
`  const displaySync = useTeachingDisplaySync(teachingSession.role, teachingSession.session?.id ?? null, {
    localLaserEnabled: laserActive,
    onCandidateFrozenChange: (active) => { setFrozen(active); setFrozenSamples(active ? liveSamples : null) },
    onCandidateLaserChange: setLaserActive,
  })`,
`  const displayControls = useSimulationDisplayControls<MonitorSample[]>({
    role: teachingSession.role,
    sessionId: teachingSession.session?.id ?? null,
    frozen,
    setFrozen,
    frozenSnapshot: frozenSamples,
    setFrozenSnapshot: setFrozenSamples,
    captureSnapshot: () => liveSamples,
    laserEnabled: laserActive,
    setLaserEnabled: setLaserActive,
  })`, 'EDUMON display sync')
  text = replaceOrThrow(text,
`  const toggleFreeze = () => {
    if (teachingSession.role === 'candidate' && displaySync.state.frozen) return
    const next = !frozen
    setFrozen(next)
    setFrozenSamples(next ? liveSamples : null)
    if (teachingSession.role === 'instructor' && teachingSession.session?.id) displaySync.setFrozen(next)
  }

  const toggleLaser = () => {
    setLaserActive((active) => {
      const next = !active
      if (next && !frozen) {
        setFrozenSamples(liveSamples)
        setFrozen(true)
        if (teachingSession.role === 'instructor' && teachingSession.session?.id) displaySync.setFrozen(true)
      }
      if (teachingSession.role === 'instructor' && teachingSession.session?.id) displaySync.setLaserEnabled(next)
      return next
    })
  }`,
`  const toggleFreeze = displayControls.toggleFreeze
  const toggleLaser = displayControls.toggleLaser`, 'EDUMON local display handlers')
  text = text.replace("freezeDisabled={teachingSession.role === 'candidate' && displaySync.state.frozen}", "freezeDisabled={displayControls.freezeDisabled}")
  text = text.replace("laserDisabled={candidateLocked}", "laserDisabled={displayControls.laserDisabled}")
  text = replaceOrThrow(text,
`        <section className="ventilator-console edumon-console" aria-label={\`${'${module.productName}'} patient monitor\`}>
          <SimulationHardwareControls`,
`        <SimulationConsoleShell
          ariaLabel={\`${'${module.productName}'} patient monitor\`}
          className="edumon-console"
          hardwareControls={<SimulationHardwareControls`, 'EDUMON console open')
  text = replaceOrThrow(text,
`            alarmTimerClassName="edumon-alarm-silence-timer"
          />

          <div className="edumon-monitor-body">`,
`            alarmTimerClassName="edumon-alarm-silence-timer"
          />}
          display={<div className="edumon-monitor-body">`, 'EDUMON hardware/display boundary')
  text = replaceOrThrow(text,
`          </div>

          <div className="edumon-control-strip" aria-label="Monitor controls">`,
`          </div>}
          footer={<div className="edumon-control-strip" aria-label="Monitor controls">`, 'EDUMON display/footer boundary')
  text = replaceOrThrow(text,
`          </div>
        </section>

        )}`,
`          </div>}
        />

        )}`, 'EDUMON console close')
  fs.writeFileSync(path, text)
}

// EDUVENT
{
  const path = 'src/App.tsx'
  let text = fs.readFileSync(path, 'utf8')
  text = text.replace("import type { TouchEvent } from 'react'\n", '')
  text = text.replace("import { useTeachingSharedWaveformFreeze } from './teaching/useTeachingSharedWaveformFreeze'\n", '')
  text = replaceOrThrow(text,
    "import { SimulationDiagnosticsMenu, type SimulationDiagnosticAction } from './components/SimulationDiagnosticsMenu'\n",
    "import { SimulationDiagnosticsMenu, type SimulationDiagnosticAction } from './components/SimulationDiagnosticsMenu'\nimport { SimulationConsoleShell } from './components/SimulationConsoleShell'\nimport { SimulationWorkspaceShell } from './components/SimulationWorkspaceShell'\nimport { useSimulationDisplayControls } from './components/useSimulationDisplayControls'\n",
    'EDUVENT shared imports')
  text = text.replace("  const [mobileWorkspacePage, setMobileWorkspacePage] = useState<'ventilator' | 'settings'>('ventilator')\n  const mobileSwipeStartRef = useRef<{ x: number; y: number; blocked: boolean } | null>(null)\n", '')
  text = text.replace("    if (!candidateControlsVisible && mobileWorkspacePage === 'settings') setMobileWorkspacePage('ventilator')\n  }, [candidateControlsVisible, mobileWorkspacePage])\n", "  }, [candidateControlsVisible])\n")
  text = text.replace("    setMobileWorkspacePage('settings')\n", '')
  text = text.replace("    if (compactWorkspace) setMobileWorkspacePage('ventilator')\n", "    if (compactWorkspace) return\n")
  text = text.replace("; setMobileWorkspacePage('settings')", '')

  const legacySyncStart = text.indexOf('  const sharedWaveformFreeze = useTeachingSharedWaveformFreeze(')
  if (legacySyncStart < 0) throw new Error('Missing EDUVENT shared waveform freeze hook')
  const legacySyncEnd = text.indexOf('\n\n  const teachingAlarmSync', legacySyncStart)
  if (legacySyncEnd < 0) throw new Error('Missing EDUVENT shared waveform freeze end')
  text = text.slice(0, legacySyncStart) + text.slice(legacySyncEnd + 2)

  text = replaceOrThrow(text,
`  const movingSamples = useMemo(() => timeline.slice(-WINDOW_SAMPLES), [timeline])
  const samples = waveformFrozen && frozenSamples ? frozenSamples : movingSamples`,
`  const movingSamples = useMemo(() => timeline.slice(-WINDOW_SAMPLES), [timeline])
  const displayControls = useSimulationDisplayControls<Sample[]>({
    role: teachingSession.role,
    sessionId: teachingSession.session?.id ?? null,
    frozen: waveformFrozen,
    setFrozen: setWaveformFrozen,
    frozenSnapshot: frozenSamples,
    setFrozenSnapshot: setFrozenSamples,
    captureSnapshot: () => movingSamples,
    laserEnabled: teachingLaserEnabled,
    setLaserEnabled: setTeachingLaserEnabled,
    onFreezeActivated: () => {
      recordScenarioAction('freeze-waveform')
      setTraceCursor(Math.min(Math.floor(movingSamples.length * 0.7), Math.max(0, movingSamples.length - 1)))
    },
  })
  const samples = waveformFrozen && frozenSamples ? frozenSamples : movingSamples`, 'EDUVENT shared display controls')

  const freezeHandlersStart = text.indexOf('  const toggleFreeze = () => {')
  const freezeHandlersEnd = text.indexOf('\n\n  const beginInspiratoryHold', freezeHandlersStart)
  if (freezeHandlersStart < 0 || freezeHandlersEnd < 0) throw new Error('Missing EDUVENT freeze handlers')
  const replacement = `  const toggleFreeze = displayControls.toggleFreeze\n\n  const startFreezeLongPress = () => {\n    if (teachingSession.role !== 'instructor' || !teachingSession.session?.id) return\n    freezeLongPressTriggeredRef.current = false\n    if (freezeLongPressTimeoutRef.current != null) window.clearTimeout(freezeLongPressTimeoutRef.current)\n    freezeLongPressTimeoutRef.current = window.setTimeout(() => {\n      freezeLongPressTimeoutRef.current = null\n      freezeLongPressTriggeredRef.current = true\n      displayControls.setSharedFrozen(!displayControls.sharedFrozen)\n    }, 700)\n  }\n\n  const finishFreezePress = () => {\n    if (freezeLongPressTimeoutRef.current != null) {\n      window.clearTimeout(freezeLongPressTimeoutRef.current)\n      freezeLongPressTimeoutRef.current = null\n    }\n  }\n\n  const handleFreezeClick = () => {\n    if (freezeLongPressTriggeredRef.current) {\n      freezeLongPressTriggeredRef.current = false\n      return\n    }\n    toggleFreeze()\n  }`
  text = text.slice(0, freezeHandlersStart) + replacement + text.slice(freezeHandlersEnd)

  const swipeStart = text.indexOf('  const handleMobileWorkspaceTouchStart = ')
  const swipeEnd = text.indexOf('\n\n  const eduventDiagnosticActions', swipeStart)
  if (swipeStart >= 0 && swipeEnd >= 0) text = text.slice(0, swipeStart) + text.slice(swipeEnd + 2)

  const navStart = text.indexOf('      <nav className={`mobile-workspace-switcher')
  const workspaceStart = text.indexOf('      <div\n        className={`workspace mobile-page-', navStart)
  if (navStart < 0 || workspaceStart < 0) throw new Error('Missing EDUVENT mobile workspace shell')
  const workspaceOpenEnd = text.indexOf('      >\n', workspaceStart) + '      >\n'.length
  text = text.slice(0, navStart) + `      <SimulationWorkspaceShell\n        displayLabel="Ventilator"\n        controlsLabel="Controls"\n        ariaLabel="EDUVENT workspace pages"\n        displayPageClassName="mobile-page-ventilator"\n        controlsPageClassName="mobile-page-settings"\n        controlsVisible={candidateControlsVisible}\n        allowSwipeFromCanvas\n        display={(\n` + text.slice(workspaceOpenEnd)

  text = replaceOrThrow(text,
`        <section className="ventilator-console">
          <div className="console-mode-bar">`,
`        <SimulationConsoleShell
          ariaLabel="Mechanical ventilator"
          className="eduvent-console"
          header={<div className="console-mode-bar">`, 'EDUVENT console open')
  text = replaceOrThrow(text,
`          </div>

          <div className="alarm-row">`,
`          </div>}
          status={<div className="alarm-row">`, 'EDUVENT header/status boundary')
  text = replaceOrThrow(text,
`          </div>

          <div className="screen-body teaching-laser-target">`,
`          </div>}
          display={<div className="screen-body teaching-laser-target">`, 'EDUVENT status/display boundary')
  text = replaceOrThrow(text,
`          </div>

          <InteractiveVentilatorStrip`,
`          </div>}
          footer={<InteractiveVentilatorStrip`, 'EDUVENT display/footer boundary')
  text = replaceOrThrow(text,
`            fio2BoostActive={oxygenBoostActive}
          />
        </section>

        <aside className="control-panel tabbed-control-panel">`,
`            fio2BoostActive={oxygenBoostActive}
          />}
        />
        )}
        controls={(
        <aside className="control-panel tabbed-control-panel">`, 'EDUVENT console/control boundary')

  const finalWorkspaceClose = text.lastIndexOf('      </div>\n    </main>')
  if (finalWorkspaceClose < 0) throw new Error('Missing EDUVENT workspace close')
  text = text.slice(0, finalWorkspaceClose) + `        )}\n      />\n` + text.slice(finalWorkspaceClose + '      </div>\n'.length)
  text = text.replace(/sharedWaveformFreeze\.active/g, 'displayControls.sharedFrozen')
  text = text.replace(/sharedWaveformFreeze\.setActive\(([^)]*)\)/g, 'displayControls.setSharedFrozen($1)')
  text = text.replace("className={`hardware-button icon-button teaching-laser-console-button ${teachingLaserEnabled ? 'active' : ''}`}\n                onClick={() => setTeachingLaserEnabled((enabled) => !enabled)}", "className={`hardware-button icon-button teaching-laser-console-button ${teachingLaserEnabled ? 'active' : ''}`}\n                onClick={displayControls.toggleLaser}")
  fs.writeFileSync(path, text)
}

// version bumps
{
  const path = 'src/appVersion.ts'
  let text = fs.readFileSync(path, 'utf8')
  text = text.replace(/APP_VERSION = '[^']+'/, "APP_VERSION = '0.83.0.8'")
  fs.writeFileSync(path, text)
}
{
  const path = 'src/edumon/appVersion.ts'
  let text = fs.readFileSync(path, 'utf8')
  text = text.replace(/EDUMON_APP_VERSION = '[^']+'/, "EDUMON_APP_VERSION = '0.1.0.9'")
  fs.writeFileSync(path, text)
}
