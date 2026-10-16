from pathlib import Path
import re
p=Path('src/components/InstructorAccountControls.tsx')
s=p.read_text()
def r(old,new):
 global s
 if old not in s: raise SystemExit('missing: '+old[:100])
 s=s.replace(old,new,1)

r("""  deleteInstructorPreset,
  getInstructorAccount,
""","""  deleteInstructorPreset,
  dynamicStageTriggers,
  getInstructorAccount,
""")
r('interface InstructorAccountControlsProps {\n',"""export interface DynamicScenarioDiagnosticContext {
  scenarioId: string
  scenarioName: string
  description: string
  schemaVersion: number | null
  stageIndex: number
  stageName: string
  stageStartedAtSeconds: number
  triggers: DynamicScenarioTrigger[]
  scenario: InstructorScenarioSnapshot
}

interface InstructorAccountControlsProps {
""")
r("""  onStartInstructorSession: (scenario?: InstructorScenarioSnapshot) => Promise<void>
  onDynamicScenarioStarted?: () => void
}
""","""  onStartInstructorSession: (scenario?: InstructorScenarioSnapshot) => Promise<void>
  onDynamicScenarioStarted?: () => void
  onScenarioDiagnosticChange?: (context: DynamicScenarioDiagnosticContext | null) => void
}
""")
r("""function triggerRuntimeLabel(trigger: DynamicScenarioTrigger | undefined) {
  const value = trigger ?? { type: 'manual' as const }
  if (value.type === 'manual') return 'Manual'
  if (value.type === 'time') return `After ${value.seconds}s`
  if (value.type === 'condition') return `${value.metric} ${value.operator === 'lt' ? '<' : value.operator === 'gt' ? '>' : '='} ${value.value}`
  return `${String(value.parameter)} changed · ${value.actor}`
}
""","""function singleTriggerRuntimeLabel(value: DynamicScenarioTrigger) {
  if (value.type === 'manual') return 'Manual'
  if (value.type === 'time') return `After ${value.seconds}s`
  if (value.type === 'condition') return `${value.metric} ${value.operator === 'lt' ? '<' : value.operator === 'gt' ? '>' : '='} ${value.value}`
  return `${String(value.parameter)} changed · ${value.actor}`
}
function triggerRuntimeLabel(triggers: DynamicScenarioTrigger[]) { return triggers.map(singleTriggerRuntimeLabel).join(' OR ') }
function formatStageTimer(seconds: number) {
  const total=Math.max(0,Math.floor(seconds)), hours=Math.floor(total/3600), minutes=Math.floor((total%3600)/60), secs=total%60
  return hours>0 ? `${String(hours).padStart(2,'0')}:${String(minutes).padStart(2,'0')}:${String(secs).padStart(2,'0')}` : `${String(minutes).padStart(2,'0')}:${String(secs).padStart(2,'0')}`
}
""")
r("export function InstructorAccountControls({ role, currentScenario, onLoadScenario, simulationPaused, onSimulationPausedChange, physiologyMeasurements, scenarioElapsedSeconds, sessionMembers, runtimeHost, onStartInstructorSession, onDynamicScenarioStarted }: InstructorAccountControlsProps) {\n","export function InstructorAccountControls({ role, currentScenario, onLoadScenario, simulationPaused, onSimulationPausedChange, physiologyMeasurements, scenarioElapsedSeconds, sessionMembers, runtimeHost, onStartInstructorSession, onDynamicScenarioStarted, onScenarioDiagnosticChange }: InstructorAccountControlsProps) {\n")
r("""  const activeDynamicPreset = useMemo(() => dynamicPresets.find((preset) => preset.id === activeDynamicId) ?? null, [dynamicPresets, activeDynamicId])
  const scenarioForStageSource = (sourceId: string) => sourceId === 'current' ? currentScenario : (staticPresets.find((preset) => preset.id === sourceId)?.scenario ?? currentScenario)
""","""  const activeDynamicPreset = useMemo(() => dynamicPresets.find((preset) => preset.id === activeDynamicId) ?? null, [dynamicPresets, activeDynamicId])
  useEffect(() => {
    if (!onScenarioDiagnosticChange) return
    if (!activeDynamicPreset) { onScenarioDiagnosticChange(null); return }
    const stages=activeDynamicPreset.scenario.stages ?? []
    const index=Math.min(activeDynamicStage,Math.max(0,stages.length-1)), stage=stages[index]
    onScenarioDiagnosticChange({ scenarioId: activeDynamicPreset.id, scenarioName: activeDynamicPreset.name, description: activeDynamicPreset.scenario.description ?? '', schemaVersion: activeDynamicPreset.scenario.schemaVersion ?? null, stageIndex: index, stageName: stage?.name ?? `Stage ${index+1}`, stageStartedAtSeconds: activeDynamicStageStartedAt, triggers: stage ? dynamicStageTriggers(stage) : [], scenario: activeDynamicPreset.scenario })
  }, [activeDynamicPreset, activeDynamicStage, activeDynamicStageStartedAt, onScenarioDiagnosticChange])
  useEffect(() => () => onScenarioDiagnosticChange?.(null), [onScenarioDiagnosticChange])
  const scenarioForStageSource = (sourceId: string) => sourceId === 'current' ? currentScenario : (staticPresets.find((preset) => preset.id === sourceId)?.scenario ?? currentScenario)
""")
pattern=r"""  useEffect\(\(\) => \{\n    if \(role === 'candidate' \|\| !activeDynamicPreset.*?  \}, \[role, activeDynamicPreset, activeDynamicStage, activeDynamicStageStartedAt, scenarioElapsedSeconds, physiologyMeasurements, currentScenario\.ventilator, sessionMembers\]\)\n"""
new="""  useEffect(() => {
    if (role === 'candidate' || !activeDynamicPreset || automaticAdvanceLockRef.current || Date.now() < triggerArmedAfterRef.current) return
    const stages = activeDynamicPreset.scenario.stages ?? []
    if (activeDynamicStage < 0 || activeDynamicStage >= stages.length - 1) return
    const automaticTriggers = dynamicStageTriggers(stages[activeDynamicStage]).filter((trigger) => trigger.type !== 'manual')
    if (!automaticTriggers.length) return
    let shouldAdvance = false
    for (const trigger of automaticTriggers) {
      if (trigger.type === 'time') shouldAdvance = scenarioElapsedSeconds - activeDynamicStageStartedAt >= Math.max(1, trigger.seconds)
      else if (trigger.type === 'condition') {
        const actual=conditionMetricValue(physiologyMeasurements,trigger.metric)
        shouldAdvance=actual!=null && conditionMatches(actual,trigger.operator,trigger.value)
      } else if (trigger.type === 'action') {
        if (trigger.actor === 'instructor' || trigger.actor === 'either') {
          const baseline=actionBaselineInstructorRef.current
          if (baseline && settingChanged(currentScenario.ventilator[trigger.parameter],baseline[trigger.parameter])) shouldAdvance=true
        }
        if (!shouldAdvance && (trigger.actor === 'candidate' || trigger.actor === 'either')) {
          for (const member of sessionMembers) {
            if (member.role !== 'candidate') continue
            const baseline=actionBaselineCandidatesRef.current.get(member.id), settings=member.ventilator_settings as Partial<VentilatorSettings>
            if (!baseline || !settings || !(trigger.parameter in settings)) continue
            if (settingChanged(settings[trigger.parameter],baseline[trigger.parameter])) { shouldAdvance=true; break }
          }
        }
      }
      if (shouldAdvance) break
    }
    if (!shouldAdvance) return
    automaticAdvanceLockRef.current=true
    loadDynamicStage(activeDynamicPreset,activeDynamicStage+1,'automatic')
  }, [role, activeDynamicPreset, activeDynamicStage, activeDynamicStageStartedAt, scenarioElapsedSeconds, physiologyMeasurements, currentScenario.ventilator, sessionMembers])
"""
s,n=re.subn(pattern,new,s,count=1,flags=re.S)
if n!=1: raise SystemExit('auto trigger block replacements: '+str(n))
r("""      sourceName: nameForStageSource(stageBuilderSourceId),
    })
""","""      sourceName: nameForStageSource(stageBuilderSourceId),
      advanceTrigger: { type: 'manual' },
      advanceTriggers: [{ type: 'manual' }],
    })
""")
r("      await updateInstructorPreset(preset.id, { scenario: { ...preset.scenario, schemaVersion: 3, kind: 'dynamic', stages } })\n","      await updateInstructorPreset(preset.id, { scenario: { ...preset.scenario, schemaVersion: 4, kind: 'dynamic', stages } })\n")
pattern=r"""      \{runtimeHost && role === 'instructor' && activeDynamicPreset && createPortal\(\(\(\) => \{.*?      \}\)\(\), runtimeHost\)\}\n"""
new="""      {runtimeHost && role === 'instructor' && activeDynamicPreset && createPortal((() => {
        const stages=activeDynamicPreset.scenario.stages ?? [], index=Math.min(activeDynamicStage,Math.max(0,stages.length-1)), stage=stages[index]
        const triggers: DynamicScenarioTrigger[]=stage ? dynamicStageTriggers(stage) : [{ type: 'manual' }]
        const manualTrigger=triggers.some((trigger)=>trigger.type==='manual')
        const stageElapsedSeconds=Math.max(0,scenarioElapsedSeconds-activeDynamicStageStartedAt)
        return <section className="dynamic-runtime-panel" aria-label="Running dynamic scenario">
          <div className="dynamic-runtime-panel-heading"><div><span>Running scenario</span><strong>{activeDynamicPreset.name}</strong></div></div>
          <div className="dynamic-runtime-stage-card">
            <div><span>Current stage</span><strong>{stage?.name ?? `Stage ${index+1}`}</strong></div>
            <div><span>Progress</span><strong>{index+1} / {stages.length}</strong></div>
            <div><span>Stage time</span><strong>{formatStageTimer(stageElapsedSeconds)}</strong></div>
            <div><span>Trigger</span><strong>{triggerRuntimeLabel(triggers)}</strong></div>
          </div>
          <div className="dynamic-runtime-panel-actions">
            <button type="button" disabled={index<=0} onClick={()=>loadDynamicStage(activeDynamicPreset,index-1)}>Back</button>
            <button type="button" className="dynamic-runtime-primary" disabled={index>=stages.length-1} title={manualTrigger ? 'Advance manually; automatic triggers remain armed' : 'Advance to the next stage now'} onClick={()=>loadDynamicStage(activeDynamicPreset,index+1)}>{manualTrigger ? 'Manual trigger' : 'Advance now'}</button>
            <button type="button" className="dynamic-runtime-stop" onClick={()=>{setActiveDynamicId(null);setActiveDynamicStage(0);setPresetMessage('Dynamic scenario stopped.')}}>Stop scenario</button>
          </div>
        </section>
      })(), runtimeHost)}
"""
s,n=re.subn(pattern,new,s,count=1,flags=re.S)
if n!=1: raise SystemExit('runtime panel replacements: '+str(n))
p.write_text(s)
