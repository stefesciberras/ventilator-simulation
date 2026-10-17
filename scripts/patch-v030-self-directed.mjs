import fs from 'node:fs'

function patch(path, transform) {
  const before = fs.readFileSync(path, 'utf8')
  const after = transform(before)
  if (after === before) throw new Error(`No changes made to ${path}`)
  fs.writeFileSync(path, after)
}

function replaceOnce(text, needle, replacement, label) {
  const index = text.indexOf(needle)
  if (index < 0) throw new Error(`Missing patch anchor: ${label}`)
  if (text.indexOf(needle, index + needle.length) >= 0) throw new Error(`Patch anchor is not unique: ${label}`)
  return text.slice(0, index) + replacement + text.slice(index + needle.length)
}

patch('src/components/DynamicScenarioBuilder.tsx', (input) => {
  let text = input
  text = replaceOnce(text,
    "import { SCENARIO_BUILDER_VERSION } from '../scenario-builder/version'\n",
    "import { SCENARIO_BUILDER_VERSION } from '../scenario-builder/version'\nimport { createSelfDirectedAssignment, selfDirectedAssignmentUrl, type SelfDirectedAssignmentCreated } from '../selfDirectedAssignments'\n",
    'builder self-directed import')

  text = replaceOnce(text,
    "  const scenarioImportInputRef = useRef<HTMLInputElement | null>(null)\n",
    "  const scenarioImportInputRef = useRef<HTMLInputElement | null>(null)\n  const [assignmentOpen, setAssignmentOpen] = useState(false)\n  const [assignmentExpiryValue, setAssignmentExpiryValue] = useState(7)\n  const [assignmentExpiryUnit, setAssignmentExpiryUnit] = useState<'days' | 'weeks'>('days')\n  const [assignmentBusy, setAssignmentBusy] = useState(false)\n  const [assignmentError, setAssignmentError] = useState<string | null>(null)\n  const [assignmentResult, setAssignmentResult] = useState<SelfDirectedAssignmentCreated | null>(null)\n",
    'builder assignment state')

  text = replaceOnce(text,
    "  const remove = async () => {\n",
    `  const publishSelfDirected = async () => {\n    if (!selectedPreset || dirty) return\n    setAssignmentBusy(true)\n    setAssignmentError(null)\n    setAssignmentResult(null)\n    try {\n      const multiplier = assignmentExpiryUnit === 'weeks' ? 7 : 1\n      const result = await createSelfDirectedAssignment(selectedPreset.name, selectedPreset.scenario, assignmentExpiryValue * multiplier)\n      setAssignmentResult(result)\n    } catch (cause) {\n      setAssignmentError(cause instanceof Error ? cause.message : 'Unable to create self-directed session.')\n    } finally {\n      setAssignmentBusy(false)\n    }\n  }\n\n  const copyAssignmentLink = async () => {\n    if (!assignmentResult) return\n    const link = selfDirectedAssignmentUrl(assignmentResult.accessCode)\n    try {\n      await navigator.clipboard.writeText(link)\n      setMessage('Self-directed session link copied.')\n    } catch {\n      window.prompt('Copy this self-directed session link:', link)\n    }\n  }\n\n  const remove = async () => {\n`,
    'builder publish assignment function')

  text = replaceOnce(text,
    `          {selectedPreset && (\n            <button\n              type="button"\n              className="account-primary-button"\n              disabled={busy || dirty}\n              onClick={() => { onStartScenario(selectedPreset); onClose() }}\n            >\n              Start scenario\n            </button>\n          )}\n        </div>\n\n        <div className="dynamic-scenario-header-block">`,
    `          {selectedPreset && <button type="button" className="account-secondary-button" disabled={busy || dirty} title={dirty ? 'Save changes before creating a self-directed session' : 'Create a self-directed session'} onClick={() => { setAssignmentOpen((current) => !current); setAssignmentResult(null); setAssignmentError(null) }}>Assign</button>}\n          {selectedPreset && (\n            <button\n              type="button"\n              className="account-primary-button"\n              disabled={busy || dirty}\n              onClick={() => { onStartScenario(selectedPreset); onClose() }}\n            >\n              Start scenario\n            </button>\n          )}\n        </div>\n\n        {assignmentOpen && selectedPreset && (\n          <section className="dynamic-assignment-card" aria-label="Create self-directed session">\n            <div className="dynamic-assignment-heading">\n              <div><span>Self-directed session</span><strong>{selectedPreset.name}</strong></div>\n              <button type="button" className="dynamic-stage-collapse" onClick={() => setAssignmentOpen(false)} aria-label="Close self-directed session setup">×</button>\n            </div>\n            <p>Candidates receive an independent copy of this saved scenario and can run it without an instructor connected.</p>\n            <div className="dynamic-assignment-expiry">\n              <label><span>Expires in</span><input type="number" min={1} max={assignmentExpiryUnit === 'weeks' ? 52 : 365} value={assignmentExpiryValue} onChange={(event) => setAssignmentExpiryValue(Math.max(1, Number(event.target.value) || 1))} /></label>\n              <label><span>Unit</span><select value={assignmentExpiryUnit} onChange={(event) => setAssignmentExpiryUnit(event.target.value as 'days' | 'weeks')}><option value="days">Days</option><option value="weeks">Weeks</option></select></label>\n              <button type="button" className="account-primary-button" disabled={assignmentBusy} onClick={() => void publishSelfDirected()}>{assignmentBusy ? 'Creating…' : 'Create session'}</button>\n            </div>\n            <small className="dynamic-assignment-note">The assignment is a snapshot of the scenario at publication time. Media, questions and polling are intentionally not included in v0.3.</small>\n            {assignmentResult && (\n              <div className="dynamic-assignment-result">\n                <div><span>Session code</span><strong>{assignmentResult.accessCode}</strong></div>\n                <div><span>Expires</span><strong>{new Date(assignmentResult.expiresAt).toLocaleString()}</strong></div>\n                <button type="button" className="account-secondary-button" onClick={() => void copyAssignmentLink()}>Copy link</button>\n              </div>\n            )}\n            {assignmentError && <div className="account-error" role="alert">{assignmentError}</div>}\n          </section>\n        )}\n\n        <div className="dynamic-scenario-header-block">`,
    'builder assignment panel')
  return text
})

patch('src/components/SessionPanel.tsx', (input) => {
  let text = input
  text = replaceOnce(text,
    "  const [displayName, setDisplayName] = useState('')\n",
    "  const [displayName, setDisplayName] = useState('')\n  const [selfDirectedJoinMode, setSelfDirectedJoinMode] = useState(false)\n  const [assignmentCode, setAssignmentCode] = useState('')\n",
    'session self-directed state')

  text = replaceOnce(text,
    "        {!joinMode ? (\n",
    "        {!joinMode && !selfDirectedJoinMode ? (\n",
    'session standalone branching')

  text = replaceOnce(text,
    `              <button type="button" className="session-secondary-button" onClick={() => setJoinMode(true)}>Join as candidate</button>\n              {recoverableCandidate`,
    `              <button type="button" className="session-secondary-button" onClick={() => setJoinMode(true)}>Join as candidate</button>\n              <button type="button" className="session-secondary-button" onClick={() => setSelfDirectedJoinMode(true)}>Run self-directed scenario</button>\n              {recoverableCandidate`,
    'session self-directed launch button')

  text = replaceOnce(text,
    `        ) : (\n          <form className="candidate-join-form" onSubmit={(event) => {\n            event.preventDefault()\n            if (!sessionKey.trim()) return\n            void onJoinCandidate(sessionKey, displayName)\n          }}>`,
    `        ) : selfDirectedJoinMode ? (\n          <form className="candidate-join-form" onSubmit={(event) => {\n            event.preventDefault()\n            const code = assignmentCode.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8)\n            if (code.length !== 8) return\n            const url = new URL(window.location.href)\n            url.search = ''\n            url.hash = ''\n            url.searchParams.set('assignment', code)\n            window.location.assign(url.toString())\n          }}>\n            <label>\n              <span>Self-directed session code</span>\n              <input value={assignmentCode} onChange={(event) => setAssignmentCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8))} placeholder="A1B2C3D4" autoCapitalize="characters" autoComplete="off" maxLength={8} required />\n            </label>\n            <p className="session-start-note">This scenario runs independently on your device. No instructor needs to be online.</p>\n            <div className="session-launch-actions">\n              <button type="submit" className="session-primary-button" disabled={assignmentCode.length < 8}>Start scenario</button>\n              <button type="button" className="session-secondary-button" onClick={() => setSelfDirectedJoinMode(false)}>Cancel</button>\n            </div>\n          </form>\n        ) : (\n          <form className="candidate-join-form" onSubmit={(event) => {\n            event.preventDefault()\n            if (!sessionKey.trim()) return\n            void onJoinCandidate(sessionKey, displayName)\n          }}>`,
    'session self-directed join form')
  return text
})

patch('src/components/InstructorAccountControls.tsx', (input) => {
  let text = input
  text = replaceOnce(text,
    "import { DynamicScenarioRuntimeLibrary } from './DynamicScenarioRuntimeLibrary'\n",
    "import { DynamicScenarioRuntimeLibrary } from './DynamicScenarioRuntimeLibrary'\nimport { startSelfDirectedRun, updateSelfDirectedRun, type SelfDirectedRunStart } from '../selfDirectedAssignments'\n",
    'runtime self-directed import')

  text = replaceOnce(text,
    "  const [activeDynamicStageStartedAt, setActiveDynamicStageStartedAt] = useState(0)\n",
    "  const [activeDynamicStageStartedAt, setActiveDynamicStageStartedAt] = useState(0)\n  const [selfDirectedRun, setSelfDirectedRun] = useState<SelfDirectedRunStart | null>(null)\n  const [selfDirectedError, setSelfDirectedError] = useState<string | null>(null)\n",
    'runtime self-directed state')

  text = replaceOnce(text,
    `  const activeDynamicPreset = useMemo(() => dynamicPresets.find((preset) => preset.id === activeDynamicId) ?? null, [dynamicPresets, activeDynamicId])\n  useEffect(() => {\n    if (!onScenarioDiagnosticChange) return\n    if (!activeDynamicPreset) { onScenarioDiagnosticChange(null); return }\n    const stages=activeDynamicPreset.scenario.stages ?? []\n    const index=Math.min(activeDynamicStage,Math.max(0,stages.length-1)), stage=stages[index]\n    onScenarioDiagnosticChange({ scenarioId: activeDynamicPreset.id, scenarioName: activeDynamicPreset.name, description: activeDynamicPreset.scenario.description ?? '', schemaVersion: activeDynamicPreset.scenario.schemaVersion ?? null, stageIndex: index, stageName: stage?.name ?? \`Stage \${index+1}\`, stageStartedAtSeconds: activeDynamicStageStartedAt, triggers: stage ? dynamicStageTriggers(stage) : [], scenario: activeDynamicPreset.scenario })\n  }, [activeDynamicPreset, activeDynamicStage, activeDynamicStageStartedAt, onScenarioDiagnosticChange])`,
    `  const activeDynamicPreset = useMemo(() => dynamicPresets.find((preset) => preset.id === activeDynamicId) ?? null, [dynamicPresets, activeDynamicId])\n  const selfDirectedPreset = useMemo<InstructorPresetRow | null>(() => selfDirectedRun ? ({\n    id: \`self-directed:\${selfDirectedRun.runId}\`, instructor_id: '', name: selfDirectedRun.title, scenario: selfDirectedRun.scenario, created_at: '', updated_at: '',\n  }) : null, [selfDirectedRun])\n  const activeRuntimePreset = selfDirectedPreset ?? activeDynamicPreset\n  useEffect(() => {\n    if (!onScenarioDiagnosticChange) return\n    if (!activeRuntimePreset) { onScenarioDiagnosticChange(null); return }\n    const stages=activeRuntimePreset.scenario.stages ?? []\n    const index=Math.min(activeDynamicStage,Math.max(0,stages.length-1)), stage=stages[index]\n    onScenarioDiagnosticChange({ scenarioId: activeRuntimePreset.id, scenarioName: activeRuntimePreset.name, description: activeRuntimePreset.scenario.description ?? '', schemaVersion: activeRuntimePreset.scenario.schemaVersion ?? null, stageIndex: index, stageName: stage?.name ?? \`Stage \${index+1}\`, stageStartedAtSeconds: activeDynamicStageStartedAt, triggers: stage ? dynamicStageTriggers(stage) : [], scenario: activeRuntimePreset.scenario })\n  }, [activeRuntimePreset, activeDynamicStage, activeDynamicStageStartedAt, onScenarioDiagnosticChange])`,
    'runtime active preset abstraction')

  text = replaceOnce(text,
    `    setActiveDynamicId(preset.id)\n    setActiveDynamicStage(nextIndex)`,
    `    if (!preset.id.startsWith('self-directed:')) setActiveDynamicId(preset.id)\n    setActiveDynamicStage(nextIndex)`,
    'runtime self-directed activate')

  text = replaceOnce(text,
    `  const loadDynamicStage = (preset: InstructorPresetRow, index: number, reason: 'manual' | 'automatic' = 'manual') => {\n    if (role !== 'instructor') return\n    const stages = preset.scenario.stages ?? []\n    if (!stages.length) return\n    const nextIndex = Math.max(0, Math.min(stages.length - 1, index))\n    const nextScenario = applyDynamicStage(currentScenario, stages[nextIndex])\n    onLoadScenario(nextScenario, { pauseSimulation: false, resetScenarioClock: false })\n    activateDynamicStage(preset, nextIndex, nextScenario, reason)\n  }`,
    `  const loadDynamicStage = (preset: InstructorPresetRow, index: number, reason: 'manual' | 'automatic' = 'manual') => {\n    const selfDirected = preset.id.startsWith('self-directed:')\n    if (role !== 'instructor' && !selfDirected) return\n    const stages = preset.scenario.stages ?? []\n    if (!stages.length) return\n    const nextIndex = Math.max(0, Math.min(stages.length - 1, index))\n    const nextScenario = applyDynamicStage(currentScenario, stages[nextIndex])\n    onLoadScenario(nextScenario, { pauseSimulation: false, resetScenarioClock: false })\n    activateDynamicStage(preset, nextIndex, nextScenario, reason)\n    if (selfDirected && selfDirectedRun) void updateSelfDirectedRun(selfDirectedRun.runId, nextIndex, nextIndex === stages.length - 1).catch(() => undefined)\n  }`,
    'runtime load stage')

  text = replaceOnce(text,
    `  useEffect(() => {\n    if (!account || role === 'candidate') return\n    const url = new URL(window.location.href)`,
    `  useEffect(() => {\n    if (role !== 'standalone' || selfDirectedRun) return\n    const url = new URL(window.location.href)\n    const assignmentCode = url.searchParams.get('assignment')\n    if (!assignmentCode) return\n    let cancelled = false\n    setSelfDirectedError(null)\n    void startSelfDirectedRun(assignmentCode).then((run) => {\n      if (cancelled) return\n      const stages = run.scenario.stages ?? []\n      if (run.scenario.kind !== 'dynamic' || !stages.length) throw new Error('This self-directed session does not contain a runnable dynamic scenario.')\n      const firstScenario = applyDynamicStage(currentScenario, stages[0])\n      setSelfDirectedRun(run)\n      setActiveDynamicId(null)\n      setActiveDynamicStage(0)\n      setActiveDynamicStageStartedAt(0)\n      actionBaselineInstructorRef.current = { ...firstScenario.ventilator }\n      actionBaselineCandidatesRef.current = new Map()\n      triggerArmedAfterRef.current = Date.now() + 750\n      automaticAdvanceLockRef.current = false\n      onLoadScenario(firstScenario, { pauseSimulation: false, resetScenarioClock: true })\n      void updateSelfDirectedRun(run.runId, 0, stages.length === 1).catch(() => undefined)\n      onDynamicScenarioStarted?.()\n    }).catch((cause) => {\n      if (cancelled) return\n      setSelfDirectedError(cause instanceof Error ? cause.message : 'Unable to start this self-directed scenario.')\n      onDynamicScenarioStarted?.()\n    })\n    return () => { cancelled = true }\n  }, [role])\n\n  useEffect(() => {\n    if (!account || role === 'candidate' || selfDirectedRun) return\n    const url = new URL(window.location.href)`,
    'runtime assignment deep link')

  text = replaceOnce(text,
    `  useEffect(() => {\n    if (role === 'candidate' || !activeDynamicPreset || automaticAdvanceLockRef.current || Date.now() < triggerArmedAfterRef.current) return\n    const stages = activeDynamicPreset.scenario.stages ?? []`,
    `  useEffect(() => {\n    if (role === 'candidate' || !activeRuntimePreset || automaticAdvanceLockRef.current || Date.now() < triggerArmedAfterRef.current) return\n    const stages = activeRuntimePreset.scenario.stages ?? []`,
    'runtime auto trigger preset')

  text = replaceOnce(text,
    `      } else if (trigger.type === 'action') {\n        if (trigger.actor === 'instructor' || trigger.actor === 'either') {\n          const baseline=actionBaselineInstructorRef.current\n          if (baseline && settingChanged(currentScenario.ventilator[trigger.parameter],baseline[trigger.parameter])) shouldAdvance=true\n        }\n        if (!shouldAdvance && (trigger.actor === 'candidate' || trigger.actor === 'either')) {\n          for (const member of sessionMembers) {\n            if (member.role !== 'candidate') continue\n            const baseline=actionBaselineCandidatesRef.current.get(member.id), settings=member.ventilator_settings as Partial<VentilatorSettings>\n            if (!baseline || !settings || !(trigger.parameter in settings)) continue\n            if (settingChanged(settings[trigger.parameter],baseline[trigger.parameter])) { shouldAdvance=true; break }\n          }\n        }\n      }`,
    `      } else if (trigger.type === 'action') {\n        if (selfDirectedRun) {\n          if (trigger.actor === 'candidate' || trigger.actor === 'either') {\n            const baseline=actionBaselineInstructorRef.current\n            if (baseline && settingChanged(currentScenario.ventilator[trigger.parameter],baseline[trigger.parameter])) shouldAdvance=true\n          }\n        } else {\n          if (trigger.actor === 'instructor' || trigger.actor === 'either') {\n            const baseline=actionBaselineInstructorRef.current\n            if (baseline && settingChanged(currentScenario.ventilator[trigger.parameter],baseline[trigger.parameter])) shouldAdvance=true\n          }\n          if (!shouldAdvance && (trigger.actor === 'candidate' || trigger.actor === 'either')) {\n            for (const member of sessionMembers) {\n              if (member.role !== 'candidate') continue\n              const baseline=actionBaselineCandidatesRef.current.get(member.id), settings=member.ventilator_settings as Partial<VentilatorSettings>\n              if (!baseline || !settings || !(trigger.parameter in settings)) continue\n              if (settingChanged(settings[trigger.parameter],baseline[trigger.parameter])) { shouldAdvance=true; break }\n            }\n          }\n        }\n      }`,
    'runtime self-directed action trigger')

  text = replaceOnce(text,
    `    loadDynamicStage(activeDynamicPreset,activeDynamicStage+1,'automatic')\n  }, [role, activeDynamicPreset, activeDynamicStage, activeDynamicStageStartedAt, scenarioElapsedSeconds, physiologyMeasurements, currentScenario.ventilator, sessionMembers])`,
    `    loadDynamicStage(activeRuntimePreset,activeDynamicStage+1,'automatic')\n  }, [role, activeRuntimePreset, activeDynamicStage, activeDynamicStageStartedAt, scenarioElapsedSeconds, physiologyMeasurements, currentScenario.ventilator, sessionMembers, selfDirectedRun])`,
    'runtime auto advance target')

  text = replaceOnce(text,
    `{runtimeHost && role === 'instructor' && activeDynamicPreset && createPortal((() => {\n        const stages=activeDynamicPreset.scenario.stages ?? [], index=Math.min(activeDynamicStage,Math.max(0,stages.length-1)), stage=stages[index]`,
    `{runtimeHost && activeRuntimePreset && (role === 'instructor' || Boolean(selfDirectedRun)) && createPortal((() => {\n        const stages=activeRuntimePreset.scenario.stages ?? [], index=Math.min(activeDynamicStage,Math.max(0,stages.length-1)), stage=stages[index]`,
    'runtime panel condition')

  text = replaceOnce(text,
    `<div className="dynamic-runtime-panel-heading"><div><span>Running scenario</span><strong>{activeDynamicPreset.name}</strong></div></div>`,
    `<div className="dynamic-runtime-panel-heading"><div><span>{selfDirectedRun ? 'Self-directed scenario' : 'Running scenario'}</span><strong>{activeRuntimePreset.name}</strong></div>{selfDirectedRun && <em className="self-directed-mode-badge">Independent</em>}</div>`,
    'runtime panel heading')

  text = replaceOnce(text,
    `<button type="button" disabled={index<=0} onClick={()=>loadDynamicStage(activeDynamicPreset,index-1)}>Back</button>\n            <button type="button" className="dynamic-runtime-primary" disabled={index>=stages.length-1} title={manualTrigger ? 'Advance manually; automatic triggers remain armed' : 'Advance to the next stage now'} onClick={()=>loadDynamicStage(activeDynamicPreset,index+1)}>{manualTrigger ? 'Manual trigger' : 'Advance now'}</button>\n            <button type="button" className="dynamic-runtime-stop" onClick={()=>{setActiveDynamicId(null);setActiveDynamicStage(0);setPresetMessage('Dynamic scenario stopped.')}}>Stop scenario</button>`,
    `<button type="button" disabled={index<=0} onClick={()=>loadDynamicStage(activeRuntimePreset,index-1)}>Back</button>\n            <button type="button" className="dynamic-runtime-primary" disabled={index>=stages.length-1} title={selfDirectedRun ? 'Continue to the next stage; automatic triggers remain armed' : manualTrigger ? 'Advance manually; automatic triggers remain armed' : 'Advance to the next stage now'} onClick={()=>loadDynamicStage(activeRuntimePreset,index+1)}>{selfDirectedRun ? (index>=stages.length-1 ? 'Completed' : 'Continue') : manualTrigger ? 'Manual trigger' : 'Advance now'}</button>\n            <button type="button" className="dynamic-runtime-stop" onClick={()=>{ if (selfDirectedRun) { setSelfDirectedRun(null); const url=new URL(window.location.href); url.searchParams.delete('assignment'); window.history.replaceState({},'',\`\${url.pathname}\${url.search}\${url.hash}\`) } setActiveDynamicId(null);setActiveDynamicStage(0);setPresetMessage(selfDirectedRun ? 'Self-directed scenario closed.' : 'Dynamic scenario stopped.')}}>{selfDirectedRun ? 'Exit scenario' : 'Stop scenario'}</button>`,
    'runtime panel actions')

  text = replaceOnce(text,
    `      <button\n        type="button"\n        className="top-account-button"\n        title="EDUVENT settings"`,
    `      {runtimeHost && selfDirectedError && createPortal(<section className="dynamic-runtime-panel self-directed-error-panel" role="alert"><div className="dynamic-runtime-panel-heading"><div><span>Self-directed scenario</span><strong>Unable to start</strong></div></div><p>{selfDirectedError}</p><div className="dynamic-runtime-panel-actions"><button type="button" onClick={() => { setSelfDirectedError(null); const url=new URL(window.location.href); url.searchParams.delete('assignment'); window.history.replaceState({},'',\`\${url.pathname}\${url.search}\${url.hash}\`) }}>Close</button></div></section>, runtimeHost)}\n      <button\n        type="button"\n        className="top-account-button"\n        title="EDUVENT settings"`,
    'runtime error panel')
  return text
})

patch('src/scenario-builder/version.ts', (input) => input.replace("'0.2.0.5'", "'0.3.0'"))

patch('src/components/DynamicScenarioBuilder.css', (input) => input + `\n\n/* v0.3 self-directed assignment publishing */\n.dynamic-assignment-card{margin:0 0 18px;border:1px solid #34505d;background:#0b171d;padding:16px;display:grid;gap:14px}\n.dynamic-assignment-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}.dynamic-assignment-heading>div{display:grid;gap:3px}.dynamic-assignment-heading span,.dynamic-assignment-result span{font-size:.72rem;letter-spacing:.12em;text-transform:uppercase;color:#91a7b2}.dynamic-assignment-heading strong{font-size:1.05rem}.dynamic-assignment-card p,.dynamic-assignment-note{margin:0;color:#a9bbc4}.dynamic-assignment-expiry{display:flex;align-items:end;gap:10px;flex-wrap:wrap}.dynamic-assignment-expiry label{display:grid;gap:5px}.dynamic-assignment-expiry label span{font-size:.72rem;text-transform:uppercase;letter-spacing:.09em;color:#91a7b2}.dynamic-assignment-expiry input{width:88px}.dynamic-assignment-expiry input,.dynamic-assignment-expiry select{min-height:40px;background:#101e25;border:1px solid #3b5561;color:#e4edf1;padding:0 10px}.dynamic-assignment-result{display:flex;align-items:center;gap:20px;flex-wrap:wrap;border-top:1px solid #29404a;padding-top:12px}.dynamic-assignment-result>div{display:grid;gap:2px}.dynamic-assignment-result>div:first-child strong{font-size:1.35rem;letter-spacing:.12em;color:#9de4ff}\n`)

patch('src/account.css', (input) => input + `\n\n/* v0.3 self-directed runtime */\n.self-directed-mode-badge{font-style:normal;font-size:.7rem;text-transform:uppercase;letter-spacing:.1em;border:1px solid #3c6f7e;padding:5px 8px;color:#9de4ff}.self-directed-error-panel p{margin:4px 0 12px;color:#ffc2c2}\n`)

console.log('v0.3 self-directed patches applied')
