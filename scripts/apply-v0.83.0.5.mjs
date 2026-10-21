import fs from 'node:fs'

function replaceOne(text, from, to, label) {
  if (!text.includes(from)) throw new Error(`Missing ${label}`)
  return text.replace(from, to)
}

const appPath = 'src/App.tsx'
let app = fs.readFileSync(appPath, 'utf8')

app = replaceOne(
  app,
  `import { useTeachingSharedWaveformFreeze } from './teaching/useTeachingSharedWaveformFreeze'`,
  `import { useTeachingSharedWaveformFreeze } from './teaching/useTeachingSharedWaveformFreeze'\nimport { useTeachingSharedOxygenFlush } from './teaching/useTeachingSharedOxygenFlush'`,
  'shared oxygen import',
)

app = replaceOne(
  app,
  `  const freezeLongPressTimeoutRef = useRef<number | null>(null)\n  const freezeLongPressTriggeredRef = useRef(false)\n  const oxygenBoostDeadlineRef = useRef<number | null>(null)`,
  `  const freezeLongPressTimeoutRef = useRef<number | null>(null)\n  const freezeLongPressTriggeredRef = useRef(false)\n  const oxygenLongPressTimeoutRef = useRef<number | null>(null)\n  const oxygenLongPressTriggeredRef = useRef(false)\n  const oxygenBoostDeadlineRef = useRef<number | null>(null)`,
  'oxygen long press refs',
)

app = replaceOne(
  app,
  `    if (freezeLongPressTimeoutRef.current != null) window.clearTimeout(freezeLongPressTimeoutRef.current)\n    if (scenarioStageTransitionTimerRef.current != null) window.clearInterval(scenarioStageTransitionTimerRef.current)`,
  `    if (freezeLongPressTimeoutRef.current != null) window.clearTimeout(freezeLongPressTimeoutRef.current)\n    if (oxygenLongPressTimeoutRef.current != null) window.clearTimeout(oxygenLongPressTimeoutRef.current)\n    if (scenarioStageTransitionTimerRef.current != null) window.clearInterval(scenarioStageTransitionTimerRef.current)`,
  'oxygen long press cleanup',
)

app = replaceOne(
  app,
  `  const sharedWaveformFreeze = useTeachingSharedWaveformFreeze(`,
  `  const sharedOxygenFlush = useTeachingSharedOxygenFlush(\n    teachingSession.role,\n    teachingSession.session?.id ?? null,\n  )\n\n  const sharedWaveformFreeze = useTeachingSharedWaveformFreeze(`,
  'shared oxygen hook',
)

app = replaceOne(
  app,
  `  const effectiveVentilator = useMemo(() => ({ ...ventilator, fio2: oxygenBoost ? 1 : ventilator.fio2 }), [ventilator, oxygenBoost])`,
  `  const oxygenBoostActive = oxygenBoost || sharedOxygenFlush.active\n  const effectiveVentilator = useMemo(() => ({ ...ventilator, fio2: oxygenBoostActive ? 1 : ventilator.fio2 }), [ventilator, oxygenBoostActive])`,
  'effective oxygen state',
)

app = replaceOne(
  app,
  `  const toggleOxygenBoost = () => {\n    if (oxygenBoost) {\n      oxygenBoostDeadlineRef.current = null\n      setOxygenBoost(false)\n      setOxygenBoostSecondsRemaining(0)\n      return\n    }\n\n    recordScenarioAction('oxygen-flush')\n    oxygenBoostDeadlineRef.current = Date.now() + 60_000\n    setOxygenBoostSecondsRemaining(60)\n    setOxygenBoost(true)\n  }`,
  `  const stopLocalOxygenBoost = () => {\n    oxygenBoostDeadlineRef.current = null\n    setOxygenBoost(false)\n    setOxygenBoostSecondsRemaining(0)\n  }\n\n  const startLocalOxygenBoost = () => {\n    recordScenarioAction('oxygen-flush')\n    oxygenBoostDeadlineRef.current = Date.now() + 60_000\n    setOxygenBoostSecondsRemaining(60)\n    setOxygenBoost(true)\n  }\n\n  const toggleOxygenBoost = () => {\n    if (oxygenBoost) stopLocalOxygenBoost()\n    else startLocalOxygenBoost()\n  }\n\n  const startOxygenLongPress = () => {\n    if (teachingSession.role !== 'instructor' || !teachingSession.session?.id) return\n    oxygenLongPressTriggeredRef.current = false\n    if (oxygenLongPressTimeoutRef.current != null) window.clearTimeout(oxygenLongPressTimeoutRef.current)\n    oxygenLongPressTimeoutRef.current = window.setTimeout(() => {\n      oxygenLongPressTimeoutRef.current = null\n      oxygenLongPressTriggeredRef.current = true\n      const next = !sharedOxygenFlush.active\n      if (next) startLocalOxygenBoost()\n      else stopLocalOxygenBoost()\n      sharedOxygenFlush.setActive(next)\n    }, 700)\n  }\n\n  const finishOxygenPress = () => {\n    if (oxygenLongPressTimeoutRef.current != null) {\n      window.clearTimeout(oxygenLongPressTimeoutRef.current)\n      oxygenLongPressTimeoutRef.current = null\n    }\n  }\n\n  const handleOxygenBoostClick = () => {\n    if (oxygenLongPressTriggeredRef.current) {\n      oxygenLongPressTriggeredRef.current = false\n      return\n    }\n    if (teachingSession.role === 'instructor' && sharedOxygenFlush.active) {\n      stopLocalOxygenBoost()\n      sharedOxygenFlush.setActive(false)\n      return\n    }\n    toggleOxygenBoost()\n  }`,
  'oxygen handlers',
)

app = replaceOne(
  app,
  `  const oxygenBoostTimer = \`0:\${String(oxygenBoostSecondsRemaining).padStart(2, '0')}\``,
  `  useEffect(() => {\n    if (teachingSession.role !== 'instructor' || !sharedOxygenFlush.active || oxygenBoost) return\n    sharedOxygenFlush.setActive(false)\n  }, [oxygenBoost, sharedOxygenFlush.active, sharedOxygenFlush.setActive, teachingSession.role])\n\n  const oxygenBoostTimer = \`0:\${String(oxygenBoostSecondsRemaining).padStart(2, '0')}\``,
  'shared oxygen timeout release',
)

app = replaceOne(
  app,
  `            <div className={\`oxygen-enrichment-control \${oxygenBoost ? 'active' : ''}\`}>\n              <button\n                className={\`hardware-button oxygen-button \${oxygenBoost ? 'active amber' : ''}\`}\n                onClick={toggleOxygenBoost}\n                title={oxygenBoost ? 'O₂ enrichment active at 100% — press to cancel' : 'O₂ enrichment: 100% oxygen for 1 minute'}\n                aria-label={oxygenBoost ? \`O₂ enrichment active, \${oxygenBoostSecondsRemaining} seconds remaining. Press to cancel.\` : 'Start O₂ enrichment at 100 percent for 1 minute'}\n              >O₂</button>\n              {oxygenBoost && <span className="oxygen-enrichment-timer" aria-live="polite">{oxygenBoostTimer}</span>}\n            </div>`,
  `            <div className={\`oxygen-enrichment-control \${oxygenBoostActive ? 'active' : ''}\`}>\n              <button\n                className={\`hardware-button oxygen-button \${oxygenBoostActive ? 'active amber' : ''} \${sharedOxygenFlush.active ? 'shared-oxygen' : ''}\`}\n                onClick={handleOxygenBoostClick}\n                onPointerDown={startOxygenLongPress}\n                onPointerUp={finishOxygenPress}\n                onPointerCancel={finishOxygenPress}\n                onPointerLeave={finishOxygenPress}\n                onContextMenu={(event) => event.preventDefault()}\n                title={sharedOxygenFlush.active\n                  ? (teachingSession.role === 'instructor' ? 'Shared O₂ enrichment active — press to stop for everyone' : 'Instructor shared O₂ enrichment active; your local O₂ control remains independent')\n                  : oxygenBoost ? 'O₂ enrichment active at 100% — press to cancel'\n                    : teachingSession.role === 'instructor' && teachingSession.session?.id ? 'O₂ enrichment: press for local, hold for all screens'\n                      : 'O₂ enrichment: 100% oxygen for 1 minute'}\n                aria-label={sharedOxygenFlush.active\n                  ? 'Shared O₂ enrichment active at 100 percent'\n                  : oxygenBoost ? \`O₂ enrichment active, \${oxygenBoostSecondsRemaining} seconds remaining. Press to cancel.\`\n                    : 'Start O₂ enrichment at 100 percent for 1 minute'}\n              >O₂</button>\n              {oxygenBoost && <span className="oxygen-enrichment-timer" aria-live="polite">{oxygenBoostTimer}</span>}\n            </div>`,
  'oxygen button shared interaction',
)

app = app.replaceAll('fio2BoostActive={oxygenBoost}', 'fio2BoostActive={oxygenBoostActive}')
app = app.replace('simulation: { time: currentSimulationTime, paused: simulationPaused, waveformFrozen, activeMode, oxygenBoost, nebuliser, alarmSilenced }', 'simulation: { time: currentSimulationTime, paused: simulationPaused, waveformFrozen, activeMode, oxygenBoost: oxygenBoostActive, nebuliser, alarmSilenced }')

fs.writeFileSync(appPath, app)

const versionPath = 'src/appVersion.ts'
let version = fs.readFileSync(versionPath, 'utf8')
version = replaceOne(version, "export const APP_VERSION = '0.83.0.4'", "export const APP_VERSION = '0.83.0.5'", 'version bump')
fs.writeFileSync(versionPath, version)

console.log('Applied v0.83.0.5 shared oxygen flush')
