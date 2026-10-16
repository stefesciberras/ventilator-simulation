from pathlib import Path


def replace(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f'Expected text not found in {path}: {old[:120]!r}')
    p.write_text(text.replace(old, new, 1))


path = 'src/components/InstructorAccountControls.tsx'
replace(path,
    "import { useEffect, useMemo, useRef, useState } from 'react'\n",
    "import { useEffect, useMemo, useRef, useState } from 'react'\nimport { createPortal } from 'react-dom'\n")
replace(path,
    "  sessionMembers: SessionMemberRow[]\n}",
    "  sessionMembers: SessionMemberRow[]\n  runtimeHost: HTMLElement | null\n  onStartInstructorSession: (scenario?: InstructorScenarioSnapshot) => Promise<void>\n  onDynamicScenarioStarted?: () => void\n}")
replace(path,
    "export function InstructorAccountControls({ role, currentScenario, onLoadScenario, simulationPaused, onSimulationPausedChange, physiologyMeasurements, scenarioElapsedSeconds, sessionMembers }: InstructorAccountControlsProps) {",
    "export function InstructorAccountControls({ role, currentScenario, onLoadScenario, simulationPaused, onSimulationPausedChange, physiologyMeasurements, scenarioElapsedSeconds, sessionMembers, runtimeHost, onStartInstructorSession, onDynamicScenarioStarted }: InstructorAccountControlsProps) {")
replace(path,
    "      setPresetMessage(`Saved “${created.name}”.`)\n      if (scenarioType === 'dynamic') { setActiveDynamicId(created.id); setActiveDynamicStage(0) }\n      await refreshPresets(account)",
    "      setPresetMessage(`Saved “${created.name}”.`)\n      await refreshPresets(account)")

old = """  const loadDynamicStage = (preset: InstructorPresetRow, index: number, reason: 'manual' | 'automatic' = 'manual') => {
    const stages = preset.scenario.stages ?? []
    if (!stages.length) return
    const nextIndex = Math.max(0, Math.min(stages.length - 1, index))
    const nextScenario = applyDynamicStage(currentScenario, stages[nextIndex])
    onLoadScenario(nextScenario)
    setActiveDynamicId(preset.id)
    setActiveDynamicStage(nextIndex)
    setActiveDynamicStageStartedAt(scenarioElapsedSeconds)
    actionBaselineInstructorRef.current = { ...nextScenario.ventilator }
    actionBaselineCandidatesRef.current = new Map(sessionMembers.filter((member) => member.role === 'candidate').flatMap((member) => {
      const settings = member.ventilator_settings as Partial<VentilatorSettings>
      return settings && Object.keys(settings).length ? [[member.id, { ...settings } as VentilatorSettings] as const] : []
    }))
    triggerArmedAfterRef.current = Date.now() + 750
    automaticAdvanceLockRef.current = false
    setPresetMessage(`“${preset.name}” · ${stages[nextIndex].name} (${nextIndex + 1}/${stages.length})${reason === 'automatic' ? ' · auto advanced' : ''}`)
  }

  useEffect(() => {
    if (!account || role === 'candidate') return
    const url = new URL(window.location.href)
    const requestedScenarioId = url.searchParams.get('scenario')
    if (!requestedScenarioId) return
    const preset = dynamicPresets.find((item) => item.id === requestedScenarioId)
    if (!preset) return
    loadDynamicStage(preset, 0)
    url.searchParams.delete('scenario')
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
  }, [account, role, dynamicPresets])
"""
new = """  const activateDynamicStage = (
    preset: InstructorPresetRow,
    index: number,
    nextScenario: InstructorScenarioSnapshot,
    reason: 'manual' | 'automatic' = 'manual',
    stageStartedAt = scenarioElapsedSeconds,
  ) => {
    const stages = preset.scenario.stages ?? []
    if (!stages.length) return
    const nextIndex = Math.max(0, Math.min(stages.length - 1, index))
    setActiveDynamicId(preset.id)
    setActiveDynamicStage(nextIndex)
    setActiveDynamicStageStartedAt(stageStartedAt)
    actionBaselineInstructorRef.current = { ...nextScenario.ventilator }
    actionBaselineCandidatesRef.current = new Map(sessionMembers.filter((member) => member.role === 'candidate').flatMap((member) => {
      const settings = member.ventilator_settings as Partial<VentilatorSettings>
      return settings && Object.keys(settings).length ? [[member.id, { ...settings } as VentilatorSettings] as const] : []
    }))
    triggerArmedAfterRef.current = Date.now() + 750
    automaticAdvanceLockRef.current = false
    setPresetMessage(`“${preset.name}” · ${stages[nextIndex].name} (${nextIndex + 1}/${stages.length})${reason === 'automatic' ? ' · auto advanced' : ''}`)
  }

  const loadDynamicStage = (preset: InstructorPresetRow, index: number, reason: 'manual' | 'automatic' = 'manual') => {
    if (role !== 'instructor') return
    const stages = preset.scenario.stages ?? []
    if (!stages.length) return
    const nextIndex = Math.max(0, Math.min(stages.length - 1, index))
    const nextScenario = applyDynamicStage(currentScenario, stages[nextIndex])
    onLoadScenario(nextScenario)
    activateDynamicStage(preset, nextIndex, nextScenario, reason)
  }

  const startDynamicScenario = async (preset: InstructorPresetRow) => {
    if (role === 'candidate') return
    const stages = preset.scenario.stages ?? []
    if (!stages.length) return
    const firstScenario = applyDynamicStage(currentScenario, stages[0])
    if (role === 'standalone') {
      await onStartInstructorSession(firstScenario)
      activateDynamicStage(preset, 0, firstScenario, 'manual', 0)
    } else {
      onLoadScenario(firstScenario)
      activateDynamicStage(preset, 0, firstScenario)
    }
    setScenarioOpen(false)
    onDynamicScenarioStarted?.()
  }

  useEffect(() => {
    if (!account || role === 'candidate') return
    const url = new URL(window.location.href)
    const requestedScenarioId = url.searchParams.get('scenario')
    if (!requestedScenarioId) return
    const preset = dynamicPresets.find((item) => item.id === requestedScenarioId)
    if (!preset) return
    void startDynamicScenario(preset).finally(() => {
      url.searchParams.delete('scenario')
      window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
    })
  }, [account, role, dynamicPresets])

  useEffect(() => {
    if (role === 'instructor' || !activeDynamicId) return
    setActiveDynamicId(null)
    setActiveDynamicStage(0)
  }, [role, activeDynamicId])
"""
replace(path, old, new)

old = """      {role !== 'candidate' && activeDynamicPreset && (() => {
        const stages = activeDynamicPreset.scenario.stages ?? []
        const index = Math.min(activeDynamicStage, Math.max(0, stages.length - 1))
        const trigger = stages[index]?.advanceTrigger
        const manualTrigger = (trigger ?? { type: 'manual' as const }).type === 'manual'
        return <div className=\"dynamic-runtime-toolbar\">
          <button type=\"button\" className=\"dynamic-runtime-status\" onClick={openScenarios} title=\"Open dynamic scenario builder\">
            <span>{activeDynamicPreset.name}</span><strong>{stages[index]?.name ?? `Stage ${index + 1}`}</strong><small>{triggerRuntimeLabel(trigger)}</small>
          </button>
          <button type=\"button\" disabled={index <= 0} onClick={() => loadDynamicStage(activeDynamicPreset, index - 1)}>Back</button>
          <button
            type=\"button\"
            disabled={index >= stages.length - 1}
            title={manualTrigger ? 'Fire the manual trigger and load the next stage' : 'Advance to the next stage now'}
            onClick={() => loadDynamicStage(activeDynamicPreset, index + 1)}
          >
            {manualTrigger ? 'Manual trigger' : 'Advance now'}
          </button>
          <button type=\"button\" onClick={() => { setActiveDynamicId(null); setActiveDynamicStage(0); setPresetMessage('Dynamic scenario stopped.') }}>Stop</button>
        </div>
      })()}
"""
new = """      {runtimeHost && role === 'instructor' && activeDynamicPreset && createPortal((() => {
        const stages = activeDynamicPreset.scenario.stages ?? []
        const index = Math.min(activeDynamicStage, Math.max(0, stages.length - 1))
        const trigger = stages[index]?.advanceTrigger
        const manualTrigger = (trigger ?? { type: 'manual' as const }).type === 'manual'
        return <section className=\"dynamic-runtime-panel\" aria-label=\"Running dynamic scenario\">
          <div className=\"dynamic-runtime-panel-heading\">
            <div>
              <span>Running scenario</span>
              <strong>{activeDynamicPreset.name}</strong>
            </div>
            <button type=\"button\" onClick={openScenarios}>Scenario library</button>
          </div>
          <div className=\"dynamic-runtime-stage-card\">
            <div><span>Current stage</span><strong>{stages[index]?.name ?? `Stage ${index + 1}`}</strong></div>
            <div><span>Progress</span><strong>{index + 1} / {stages.length}</strong></div>
            <div><span>Trigger</span><strong>{triggerRuntimeLabel(trigger)}</strong></div>
          </div>
          <div className=\"dynamic-runtime-panel-actions\">
            <button type=\"button\" disabled={index <= 0} onClick={() => loadDynamicStage(activeDynamicPreset, index - 1)}>Back</button>
            <button
              type=\"button\"
              className=\"dynamic-runtime-primary\"
              disabled={index >= stages.length - 1}
              title={manualTrigger ? 'Fire the manual trigger and load the next stage' : 'Advance to the next stage now'}
              onClick={() => loadDynamicStage(activeDynamicPreset, index + 1)}
            >
              {manualTrigger ? 'Manual trigger' : 'Advance now'}
            </button>
            <button type=\"button\" className=\"dynamic-runtime-stop\" onClick={() => { setActiveDynamicId(null); setActiveDynamicStage(0); setPresetMessage('Dynamic scenario stopped.') }}>Stop scenario</button>
          </div>
        </section>
      })(), runtimeHost)}
"""
replace(path, old, new)
replace(path,
    "                onStart={(preset) => { loadDynamicStage(preset, 0); setScenarioOpen(false) }}",
    "                onStart={(preset) => { void startDynamicScenario(preset) }}")

path = 'src/App.tsx'
replace(path,
    "  const [controlTab, setControlTab] = useState<'teaching' | 'vent' | 'patient' | 'physio'>('teaching')\n",
    "  const [controlTab, setControlTab] = useState<'teaching' | 'vent' | 'patient' | 'physio'>('teaching')\n  const [dynamicScenarioRuntimeHost, setDynamicScenarioRuntimeHost] = useState<HTMLDivElement | null>(null)\n")
replace(path,
    "            sessionMembers={teachingSession.members}\n          />",
    "            sessionMembers={teachingSession.members}\n            runtimeHost={dynamicScenarioRuntimeHost}\n            onStartInstructorSession={startInstructorSession}\n            onDynamicScenarioStarted={() => { setControlTab('teaching'); setMobileWorkspacePage('settings') }}\n          />")
replace(path,
    "                />\n                <InstructorLiveRoom role={teachingSession.role} members={teachingSession.members} />",
    "                />\n                <div ref={setDynamicScenarioRuntimeHost} className=\"teaching-scenario-runtime-host\" />\n                <InstructorLiveRoom role={teachingSession.role} members={teachingSession.members} />")

path = 'src/account.css'
p = Path(path)
text = p.read_text()
text += """

/* Scenario Builder v0.2.0.2 teaching-tab runtime */
.teaching-scenario-runtime-host:empty { display: none; }
.dynamic-runtime-panel { display: grid; gap: 10px; margin: 10px 0; padding: 12px; border: 1px solid #3a535f; background: #0a171d; }
.dynamic-runtime-panel-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.dynamic-runtime-panel-heading > div { min-width: 0; }
.dynamic-runtime-panel-heading span,.dynamic-runtime-stage-card span { display: block; color: #78909a; font-size: 8px; font-weight: 800; letter-spacing: .09em; text-transform: uppercase; }
.dynamic-runtime-panel-heading strong { display: block; margin-top: 3px; color: #eff7f9; font-size: 13px; overflow-wrap: anywhere; }
.dynamic-runtime-panel-heading button { flex: 0 0 auto; border-radius: 0; }
.dynamic-runtime-stage-card { display: grid; grid-template-columns: minmax(0,1.4fr) minmax(70px,.45fr) minmax(0,1fr); gap: 1px; background: #263a43; border: 1px solid #263a43; }
.dynamic-runtime-stage-card > div { min-width: 0; padding: 9px 10px; background: #0d1a20; }
.dynamic-runtime-stage-card strong { display: block; margin-top: 3px; color: #dce8ec; font-size: 10px; overflow-wrap: anywhere; }
.dynamic-runtime-panel-actions { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 7px; }
.dynamic-runtime-panel-actions button { min-height: 38px; border-radius: 0; }
.dynamic-runtime-panel-actions .dynamic-runtime-primary { color: #dff8e6; border-color: #4e9764; background: #173821; }
.dynamic-runtime-panel-actions .dynamic-runtime-stop { color: #efb9b9; border-color: #754646; background: #291717; }
@media (max-width: 560px) { .dynamic-runtime-stage-card { grid-template-columns: 1fr; } .dynamic-runtime-panel-actions { grid-template-columns: 1fr; } }
"""
p.write_text(text)

Path('src/scenario-builder/version.ts').write_text("export const SCENARIO_BUILDER_VERSION = '0.2.0.2'\n")
