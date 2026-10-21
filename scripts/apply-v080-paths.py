from pathlib import Path
import re


def must_replace(text, old, new, label, count=1):
    if old not in text:
        raise SystemExit(f'missing anchor: {label}')
    return text.replace(old, new, count)

# ---------- instructorAccount.ts ----------
p = Path('src/instructorAccount.ts')
s = p.read_text()
s = must_replace(s, "export interface DynamicScenarioBranch {\n  id: string\n  fromStageId: string\n  toStageId: string\n  trigger: DynamicScenarioTrigger\n  priority: number\n  label?: string\n  enabled?: boolean\n}\n", "export type DynamicScenarioTriggerMode = 'any' | 'all'\n\nexport interface DynamicScenarioBranch {\n  id: string\n  fromStageId: string\n  toStageId: string\n  /** Legacy single trigger retained for schema <= 8 compatibility. */\n  trigger?: DynamicScenarioTrigger\n  /** Schema v9 path conditions. */\n  triggers?: DynamicScenarioTrigger[]\n  triggerMode?: DynamicScenarioTriggerMode\n  priority: number\n  label?: string\n  enabled?: boolean\n}\n\nexport function dynamicBranchTriggers(branch: DynamicScenarioBranch): DynamicScenarioTrigger[] {\n  if (branch.triggers?.length) return branch.triggers\n  return [branch.trigger ?? { type: 'manual' }]\n}\n\nexport function dynamicBranchTriggerMode(branch: DynamicScenarioBranch): DynamicScenarioTriggerMode {\n  return branch.triggerMode === 'all' ? 'all' : 'any'\n}\n", 'branch type')
s = must_replace(s, "    schemaVersion: 7,\n", "    schemaVersion: 9,\n", 'dynamic schema default')
old = """    branches: scenario.kind === 'dynamic' ? (scenario.branches ?? []).map((branch, index) => ({
      ...branch,
      id: branch.id || createBranchId(),
      priority: Number.isFinite(branch.priority) ? branch.priority : index,
      enabled: branch.enabled !== false,
    })) : undefined,
"""
new = """    branches: scenario.kind === 'dynamic' ? (scenario.branches ?? []).map((branch, index) => {
      const triggers = dynamicBranchTriggers(branch)
      return {
        ...branch,
        id: branch.id || createBranchId(),
        trigger: triggers[0],
        triggers,
        triggerMode: dynamicBranchTriggerMode(branch),
        priority: Number.isFinite(branch.priority) ? branch.priority : index,
        enabled: branch.enabled !== false,
      }
    }) : undefined,
"""
s = must_replace(s, old, new, 'normalise branches')
p.write_text(s)

# ---------- runtimeCore.ts ----------
p = Path('src/teaching/scenario/runtimeCore.ts')
s = p.read_text()
s = must_replace(s, "export interface TeachingScenarioBranch<TTrigger> {\n  id?: string\n  fromStageId?: string\n  toStageId: string\n  trigger: TTrigger\n  priority?: number\n  label?: string\n  enabled?: boolean\n}\n", "export interface TeachingScenarioBranch<TTrigger> {\n  id?: string\n  fromStageId?: string\n  toStageId: string\n  /** Legacy single trigger. */\n  trigger?: TTrigger\n  /** Multiple path conditions. Defaults to ANY semantics. */\n  triggers?: TTrigger[]\n  triggerMode?: 'any' | 'all'\n  priority?: number\n  label?: string\n  enabled?: boolean\n}\n", 'runtime branch type')
old = """  const matchedBranch = [...branches]
    .filter((branch) => branch.enabled !== false)
    .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0))
    .find((branch) => triggerMatches(branch.trigger))
"""
new = """  const matchedBranch = [...branches]
    .filter((branch) => branch.enabled !== false)
    .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0))
    .find((branch) => {
      const triggers = branch.triggers?.length ? branch.triggers : branch.trigger != null ? [branch.trigger] : []
      if (!triggers.length) return false
      return branch.triggerMode === 'all' ? triggers.every(triggerMatches) : triggers.some(triggerMatches)
    })
"""
s = must_replace(s, old, new, 'runtime branch resolution')
p.write_text(s)

# ---------- DynamicScenarioBuilder.tsx ----------
p = Path('src/components/DynamicScenarioBuilder.tsx')
s = p.read_text()
s = must_replace(s, "  dynamicStageTriggers,\n", "  dynamicBranchTriggers,\n  dynamicBranchTriggerMode,\n  dynamicStageTriggers,\n", 'builder imports')
s = must_replace(s, "  const [triggerMenuIndex, setTriggerMenuIndex] = useState<number | null>(null)\n", "", 'remove trigger menu state')

old = """function fromPreset(preset: InstructorPresetRow): ScenarioDraft {
  return {
    id: preset.id,
    name: preset.name,
    description: preset.scenario.description ?? '',
    stages: (preset.scenario.stages ?? []).map(normaliseStage),
    branches: (preset.scenario.branches ?? []).map((branch, index) => ({ ...branch, id: branch.id || createBranchId(), priority: Number.isFinite(branch.priority) ? branch.priority : index, enabled: branch.enabled !== false })),
  }
}
"""
new = """function fromPreset(preset: InstructorPresetRow): ScenarioDraft {
  const stages = (preset.scenario.stages ?? []).map(normaliseStage)
  const branches: DynamicScenarioBranch[] = (preset.scenario.branches ?? []).map((branch, index) => {
    const triggers = dynamicBranchTriggers(branch)
    return { ...branch, id: branch.id || createBranchId(), trigger: triggers[0], triggers, triggerMode: dynamicBranchTriggerMode(branch), priority: Number.isFinite(branch.priority) ? branch.priority : index, enabled: branch.enabled !== false }
  })

  // Schema <= 8 stored ordinary next-stage progression separately from branches.
  // Convert it into an explicit path so editing immediately uses the unified graph model.
  if ((preset.scenario.schemaVersion ?? 0) < 9) {
    stages.slice(0, -1).forEach((stage, index) => {
      const next = stages[index + 1]
      if (!stage.id || !next?.id) return
      const triggers = dynamicStageTriggers(stage)
      branches.push({
        id: createBranchId(),
        fromStageId: stage.id,
        toStageId: next.id,
        trigger: triggers[0],
        triggers,
        triggerMode: 'any',
        priority: 1000 + index,
        label: 'Continue',
        enabled: true,
      })
    })
  }

  return { id: preset.id, name: preset.name, description: preset.scenario.description ?? '', stages, branches }
}
"""
s = must_replace(s, old, new, 'fromPreset migration')

old = """  const insertStage = (index: number) => {
    setCollapsedStages(new Set())
    setDraft((current) => {
      const stages = [...current.stages]
      const base = stages[index]?.snapshot ?? currentScenario
      stages.splice(index + 1, 0, newStage(base, index + 1))
      return { ...current, stages }
    })
    setTriggerMenuIndex(null)
  }
"""
new = """  const insertStage = (index: number) => {
    setCollapsedStages(new Set())
    setDraft((current) => {
      const stages = [...current.stages]
      const from = stages[index]
      const oldNext = stages[index + 1]
      const base = from?.snapshot ?? currentScenario
      const inserted = newStage(base, index + 1)
      stages.splice(index + 1, 0, inserted)
      if (!from?.id || !inserted.id) return { ...current, stages }

      let branches = [...current.branches]
      const outgoing = branches.filter((branch) => branch.fromStageId === from.id && branch.enabled !== false)
      if (oldNext?.id && outgoing.length === 1 && outgoing[0].toStageId === oldNext.id) {
        branches = branches.map((branch) => branch.id === outgoing[0].id ? { ...branch, toStageId: inserted.id! } : branch)
        branches.push({ id: createBranchId(), fromStageId: inserted.id, toStageId: oldNext.id, trigger: { type: 'manual' }, triggers: [{ type: 'manual' }], triggerMode: 'any', priority: 0, label: 'Continue', enabled: true })
      } else {
        branches.push({ id: createBranchId(), fromStageId: from.id, toStageId: inserted.id, trigger: { type: 'manual' }, triggers: [{ type: 'manual' }], triggerMode: 'any', priority: outgoing.length, label: 'Continue', enabled: true })
        if (oldNext?.id) branches.push({ id: createBranchId(), fromStageId: inserted.id, toStageId: oldNext.id, trigger: { type: 'manual' }, triggers: [{ type: 'manual' }], triggerMode: 'any', priority: 0, label: 'Continue', enabled: true })
      }
      return { ...current, stages, branches }
    })
  }
"""
s = must_replace(s, old, new, 'insert stage path')

s = s.replace("    setTriggerMenuIndex(null)\n", "")

# Remove legacy stage-trigger editing helper block.
s = re.sub(r"\n  const setAdvanceTriggers = \(index: number, advanceTriggers: DynamicScenarioTrigger\[\]\) => \{.*?\n  \}\n\n  const addBranch =", "\n  const addBranch =", s, count=1, flags=re.S)
if 'const setAdvanceTriggers' in s:
    raise SystemExit('failed removing legacy trigger helpers')

old = """  const addBranch = (stageIndex: number) => {
    const from = draft.stages[stageIndex]
    if (!from?.id || draft.stages.length < 2) return
    const fallback = draft.stages[Math.min(stageIndex + 1, draft.stages.length - 1)]
    const target = fallback?.id === from.id ? draft.stages.find((stage) => stage.id !== from.id) : fallback
    if (!target?.id) return
    setDraft((current) => ({ ...current, branches: [...current.branches, { id: createBranchId(), fromStageId: from.id!, toStageId: target.id!, trigger: { type: 'manual' }, priority: current.branches.filter((branch) => branch.fromStageId === from.id).length, label: '', enabled: true }] }))
  }
  const updateBranch = (branchId: string, updates: Partial<DynamicScenarioBranch>) => setDraft((current) => ({ ...current, branches: current.branches.map((branch) => branch.id === branchId ? { ...branch, ...updates } : branch) }))
  const removeBranch = (branchId: string) => setDraft((current) => ({ ...current, branches: current.branches.filter((branch) => branch.id !== branchId) }))
"""
new = """  const addBranch = (stageIndex: number) => {
    const from = draft.stages[stageIndex]
    if (!from?.id || draft.stages.length < 2) return
    const fallback = draft.stages[Math.min(stageIndex + 1, draft.stages.length - 1)]
    const target = fallback?.id === from.id ? draft.stages.find((stage) => stage.id !== from.id) : fallback
    if (!target?.id) return
    const trigger: DynamicScenarioTrigger = { type: 'manual' }
    setDraft((current) => ({ ...current, branches: [...current.branches, { id: createBranchId(), fromStageId: from.id!, toStageId: target.id!, trigger, triggers: [trigger], triggerMode: 'any', priority: current.branches.filter((branch) => branch.fromStageId === from.id).length, label: 'Continue', enabled: true }] }))
  }
  const updateBranch = (branchId: string, updates: Partial<DynamicScenarioBranch>) => setDraft((current) => ({ ...current, branches: current.branches.map((branch) => branch.id === branchId ? { ...branch, ...updates } : branch) }))
  const removeBranch = (branchId: string) => setDraft((current) => ({ ...current, branches: current.branches.filter((branch) => branch.id !== branchId) }))
  const setBranchTriggers = (branchId: string, triggers: DynamicScenarioTrigger[]) => {
    const next = triggers.length ? triggers : [{ type: 'manual' } as DynamicScenarioTrigger]
    updateBranch(branchId, { trigger: next[0], triggers: next })
  }
  const addBranchTrigger = (branchId: string, stageType: DynamicScenarioStage['stageType']) => {
    const branch = draft.branches.find((item) => item.id === branchId)
    if (!branch) return
    const next = (stageType ?? 'controls') === 'question' ? defaultTriggerForType('question-any') : defaultTriggerForType('condition')
    setBranchTriggers(branchId, [...dynamicBranchTriggers(branch), next])
  }
  const updateBranchTrigger = (branchId: string, triggerIndex: number, trigger: DynamicScenarioTrigger) => {
    const branch = draft.branches.find((item) => item.id === branchId)
    if (!branch) return
    setBranchTriggers(branchId, dynamicBranchTriggers(branch).map((item, index) => index === triggerIndex ? trigger : item))
  }
  const removeBranchTrigger = (branchId: string, triggerIndex: number) => {
    const branch = draft.branches.find((item) => item.id === branchId)
    if (!branch) return
    const triggers = dynamicBranchTriggers(branch)
    if (triggers.length <= 1) return
    setBranchTriggers(branchId, triggers.filter((_, index) => index !== triggerIndex))
  }
"""
s = must_replace(s, old, new, 'path helpers')

# Stage type no longer owns progression triggers.
old = """  const setStageType = (index: number, stageType: 'controls' | 'media' | 'question') => {
    updateStage(index, (stage) => {
      if (stageType === 'question') {
        const trigger: DynamicScenarioTrigger = { type: 'question-any' }
        return { ...stage, stageType, media: undefined, advanceTrigger: trigger, advanceTriggers: [trigger] }
      }
      const trigger: DynamicScenarioTrigger = { type: 'manual' }
      return stageType === 'controls'
        ? { ...stage, stageType, media: undefined, question: undefined, advanceTrigger: trigger, advanceTriggers: [trigger] }
        : { ...stage, stageType, question: undefined, advanceTrigger: trigger, advanceTriggers: [trigger] }
    })
  }
"""
new = """  const setStageType = (index: number, stageType: 'controls' | 'media' | 'question') => {
    updateStage(index, (stage) => stageType === 'controls'
      ? { ...stage, stageType, media: undefined, question: undefined }
      : stageType === 'media'
        ? { ...stage, stageType, question: undefined }
        : { ...stage, stageType, media: undefined })
  }
"""
s = must_replace(s, old, new, 'stage type')

# Question selection no longer overwrites progression.
s = must_replace(s, """    const trigger: DynamicScenarioTrigger = { type: 'question-any' }
    updateStage(index, (stage) => ({
      ...stage, stageType: 'question', media: undefined,
      question: { libraryItemId: item.id, kind: item.kind as 'mcq' | 'poll', title: item.title, body: item.body, options: item.options, correctOptionId: item.correct_option_id, explanation: item.explanation },
      advanceTrigger: trigger, advanceTriggers: [trigger],
    }))
""", """    updateStage(index, (stage) => ({
      ...stage, stageType: 'question', media: undefined,
      question: { libraryItemId: item.id, kind: item.kind as 'mcq' | 'poll', title: item.title, body: item.body, options: item.options, correctOptionId: item.correct_option_id, explanation: item.explanation },
    }))
""", 'question selection')

# Add reusable path-condition editor before reset.
anchor = "  const reset = () => {\n"
editor = r'''  const renderPathTrigger = (branch: DynamicScenarioBranch, trigger: DynamicScenarioTrigger, triggerIndex: number, stageType: DynamicScenarioStageType) => {
    const triggerTypes: DynamicScenarioTrigger['type'][] = stageType === 'question'
      ? ['manual', 'question-any', 'question-correct', 'time', 'condition', 'action', 'patient-change', 'device-action']
      : ['manual', 'time', 'condition', 'action', 'patient-change', 'device-action']
    return <div className="dynamic-path-condition" key={`${branch.id}-${triggerIndex}`}>
      <select className="dynamic-path-condition-type" value={trigger.type} onChange={(event) => updateBranchTrigger(branch.id, triggerIndex, defaultTriggerForType(event.target.value as DynamicScenarioTrigger['type']))}>
        {triggerTypes.map((type) => <option key={type} value={type} disabled={type === 'question-correct' && !draft.stages.find((stage) => stage.id === branch.fromStageId)?.question?.correctOptionId}>{type === 'manual' ? 'Instructor choice' : type === 'time' ? 'Time passed' : type === 'condition' ? 'Measured value' : type === 'action' ? 'Ventilator change' : type === 'patient-change' ? 'Patient change' : type === 'device-action' ? 'Action' : type === 'question-correct' ? 'Correct answer' : 'Any answer'}</option>)}
      </select>
      {trigger.type === 'time' && <label><span>Seconds</span><input type="number" min={1} max={3600} value={trigger.seconds} onChange={(event) => updateBranchTrigger(branch.id, triggerIndex, { ...trigger, seconds: Math.max(1, Number(event.target.value) || 1) })} /></label>}
      {trigger.type === 'condition' && <><label><span>Measured value</span><select value={trigger.metric} onChange={(event) => updateBranchTrigger(branch.id, triggerIndex, { ...trigger, metric: event.target.value as DynamicScenarioMetric })}>{CONDITION_METRICS.map((metric) => <option key={metric.value} value={metric.value}>{metric.label}</option>)}</select></label><label><span>Comparison</span><select value={trigger.operator} onChange={(event) => updateBranchTrigger(branch.id, triggerIndex, { ...trigger, operator: event.target.value as 'lt' | 'eq' | 'gt' })}><option value="lt">Less than (&lt;)</option><option value="eq">Equal to (=)</option><option value="gt">Greater than (&gt;)</option></select></label><label><span>Value</span><input type="number" step="0.1" value={trigger.value} onChange={(event) => updateBranchTrigger(branch.id, triggerIndex, { ...trigger, value: Number(event.target.value) || 0 })} /></label></>}
      {trigger.type === 'action' && <><label><span>Ventilator</span><select value={String(trigger.parameter)} onChange={(event) => updateBranchTrigger(branch.id, triggerIndex, { ...trigger, parameter: event.target.value as keyof VentilatorSettings })}>{VENT_FIELDS.map((field) => <option key={field.key} value={field.key}>{field.label}</option>)}</select></label><label><span>Changed by</span><select value={trigger.actor} onChange={(event) => updateBranchTrigger(branch.id, triggerIndex, { ...trigger, actor: event.target.value as 'candidate' | 'instructor' | 'either' })}><option value="either">Either</option><option value="candidate">Candidate</option><option value="instructor">Instructor</option></select></label></>}
      {trigger.type === 'patient-change' && <><label><span>Patient / physiology</span><select value={String(trigger.parameter)} onChange={(event) => updateBranchTrigger(branch.id, triggerIndex, { ...trigger, parameter: event.target.value as keyof PatientSettings })}>{[...PATIENT_FIELDS, ...PHYSIO_FIELDS].map((field) => <option key={field.key} value={field.key}>{field.label}</option>)}</select></label><label><span>Changed by</span><select value={trigger.actor} onChange={(event) => updateBranchTrigger(branch.id, triggerIndex, { ...trigger, actor: event.target.value as 'candidate' | 'instructor' | 'either' })}><option value="either">Either</option><option value="candidate">Candidate</option><option value="instructor">Instructor</option></select></label></>}
      {trigger.type === 'device-action' && <><label><span>Action</span><select value={trigger.action} onChange={(event) => updateBranchTrigger(branch.id, triggerIndex, { ...trigger, action: event.target.value as typeof trigger.action })}><option value="freeze-waveform">Freeze waveform</option><option value="inspiratory-hold">Inspiratory hold</option><option value="expiratory-hold">Expiratory hold</option><option value="oxygen-flush">Oxygen flush</option><option value="nebulisation">Nebulisation</option></select></label><label><span>Performed by</span><select value={trigger.actor} onChange={(event) => updateBranchTrigger(branch.id, triggerIndex, { ...trigger, actor: event.target.value as 'candidate' | 'instructor' | 'either' })}><option value="either">Either</option><option value="candidate">Candidate</option><option value="instructor">Instructor</option></select></label></>}
      {(trigger.type === 'manual' || trigger.type === 'question-any' || trigger.type === 'question-correct') && <span className="dynamic-path-condition-summary">{singleTriggerSummary(trigger)}</span>}
      <button type="button" className="dynamic-path-condition-remove" disabled={dynamicBranchTriggers(branch).length <= 1} onClick={() => removeBranchTrigger(branch.id, triggerIndex)} aria-label="Remove condition">×</button>
    </div>
  }

'''
s = must_replace(s, anchor, editor + anchor, 'path editor anchor')

# Make builder controls use the same heading/control-row vocabulary as the simulator.
s = s.replace('className="dynamic-control-heading"', 'className="control-heading dynamic-control-heading"')
s = must_replace(s, "<div className={`dynamic-control-row ${enabled ? 'enabled' : 'disabled'}`} key={field.key}>", "<div className={`control-row dynamic-control-row ${enabled ? 'enabled' : 'disabled'}`} key={field.key}>", 'control row class')

# Save schema 9 and paths only; legacy stage triggers become inert manual sentinels.
s = s.replace('schemaVersion: 8,', 'schemaVersion: 9,', 2)
old = "branches: draft.branches.map((branch, index) => ({ ...branch, priority: Number.isFinite(branch.priority) ? branch.priority : index, enabled: branch.enabled !== false })),"
new = "branches: draft.branches.map((branch, index) => { const triggers = dynamicBranchTriggers(branch); return { ...branch, trigger: triggers[0], triggers, triggerMode: dynamicBranchTriggerMode(branch), priority: Number.isFinite(branch.priority) ? branch.priority : index, enabled: branch.enabled !== false } }),"
s = must_replace(s, old, new, 'save paths')
# within saved stages replace computed trigger assignment with manual sentinel
s = must_replace(s, """          const triggers = dynamicStageTriggers(stage)
          return {
            ...stage,
            sourcePresetId: undefined,
            advanceTrigger: triggers[0],
            advanceTriggers: triggers,
""", """          const legacyTrigger: DynamicScenarioTrigger = { type: 'manual' }
          return {
            ...stage,
            sourcePresetId: undefined,
            advanceTrigger: legacyTrigger,
            advanceTriggers: [legacyTrigger],
""", 'save stage sentinel')

# Import: migrate legacy linear progression into explicit paths.
old = """      const importedStages = parsed.scenario.stages.map((stage, index) => normaliseStage(stage, index))
      const scenario: InstructorScenarioSnapshot = { ...cloneScenario(parsed.scenario), schemaVersion: 9, kind: 'dynamic', stages: importedStages.map((stage) => { const triggers = dynamicStageTriggers(stage); return { ...stage, sourcePresetId: undefined, advanceTrigger: triggers[0], advanceTriggers: triggers } }) }
"""
new = """      const importedStages = parsed.scenario.stages.map((stage, index) => normaliseStage(stage, index))
      const importedBranches: DynamicScenarioBranch[] = (parsed.scenario.branches ?? []).map((branch, index) => { const triggers=dynamicBranchTriggers(branch); return { ...branch, id:branch.id||createBranchId(), trigger:triggers[0], triggers, triggerMode:dynamicBranchTriggerMode(branch), priority:Number.isFinite(branch.priority)?branch.priority:index, enabled:branch.enabled!==false } })
      if ((parsed.scenario.schemaVersion ?? 0) < 9) importedStages.slice(0,-1).forEach((stage,index)=>{ const next=importedStages[index+1]; if(!stage.id||!next?.id)return; const triggers=dynamicStageTriggers(stage); importedBranches.push({id:createBranchId(),fromStageId:stage.id,toStageId:next.id,trigger:triggers[0],triggers,triggerMode:'any',priority:1000+index,label:'Continue',enabled:true}) })
      const legacyTrigger: DynamicScenarioTrigger = { type:'manual' }
      const scenario: InstructorScenarioSnapshot = { ...cloneScenario(parsed.scenario), schemaVersion: 9, kind: 'dynamic', branches: importedBranches, stages: importedStages.map((stage) => ({ ...stage, sourcePresetId: undefined, advanceTrigger: legacyTrigger, advanceTriggers: [legacyTrigger] })) }
"""
s = must_replace(s, old, new, 'import migration')

# Replace the old branch UI with unified Paths UI.
start = s.index('                <div className="dynamic-branch-builder">')
end = s.index('                <div className="dynamic-transition-builder">', start)
paths_ui = r'''                <div className="dynamic-branch-builder dynamic-path-builder">
                  <div className="dynamic-branch-heading"><div><strong>Paths from this stage</strong><span>Every route to another stage lives here. Add multiple conditions and choose whether ANY or ALL must match.</span></div><button type="button" disabled={draft.stages.length < 2} onClick={() => addBranch(index)}>＋ Add path</button></div>
                  {draft.branches.filter((branch) => branch.fromStageId === stage.id).sort((a,b)=>a.priority-b.priority).map((branch) => {
                    const pathTriggers = dynamicBranchTriggers(branch)
                    return <section className="dynamic-path-card" key={branch.id}>
                      <div className="dynamic-path-head">
                        <label><span>Path name</span><input className="dynamic-branch-label" value={branch.label ?? ''} placeholder="e.g. Continue / Deteriorates / Responds" onChange={(event)=>updateBranch(branch.id,{label:event.target.value})} /></label>
                        <label><span>Destination</span><select value={branch.toStageId} onChange={(event)=>updateBranch(branch.id,{toStageId:event.target.value})}>{draft.stages.filter((candidate)=>candidate.id!==stage.id).map((candidate)=>{const stageIndex=draft.stages.findIndex((item)=>item.id===candidate.id);return <option key={candidate.id} value={candidate.id}>Stage {stageIndex+1}: {candidate.name}</option>})}</select></label>
                        <label><span>Priority</span><input type="number" min={0} max={9999} value={branch.priority} onChange={(event)=>updateBranch(branch.id,{priority:Math.max(0,Number(event.target.value)||0)})} /></label>
                        <button type="button" className="dynamic-stage-remove" onClick={()=>removeBranch(branch.id)} aria-label="Remove path">×</button>
                      </div>
                      <div className="dynamic-path-logic">
                        <strong>When</strong>
                        {pathTriggers.length > 1 && <div className="dynamic-path-mode" role="group" aria-label="Path condition logic"><button type="button" className={dynamicBranchTriggerMode(branch)==='any'?'selected':''} onClick={()=>updateBranch(branch.id,{triggerMode:'any'})}>ANY</button><button type="button" className={dynamicBranchTriggerMode(branch)==='all'?'selected':''} onClick={()=>updateBranch(branch.id,{triggerMode:'all'})}>ALL</button></div>}
                        <small>{pathTriggers.length > 1 ? (dynamicBranchTriggerMode(branch)==='all' ? 'all conditions are true' : 'any condition is true') : 'this condition is met'}</small>
                      </div>
                      <div className="dynamic-path-conditions">{pathTriggers.map((trigger,triggerIndex)=>renderPathTrigger(branch,trigger,triggerIndex,stageType))}</div>
                      <button type="button" className="dynamic-path-add-condition" onClick={()=>addBranchTrigger(branch.id,stageType)}>＋ Add condition</button>
                    </section>
                  })}
                  {!draft.branches.some((branch)=>branch.fromStageId===stage.id) && <div className="dynamic-path-empty">No outgoing path. This stage is an endpoint until the instructor jumps elsewhere.</div>}
                </div>

'''
s = s[:start] + paths_ui + s[end:]
# Remove old stage-trigger/linear transition UI entirely.
start = s.index('                <div className="dynamic-transition-builder">')
end = s.index('                <div className="dynamic-stage-insert-row"', start)
s = s[:start] + s[end:]

# Remove stray triggerMenu references if any remain.
s = re.sub(r"\s*setTriggerMenuIndex\([^\n]*\)\n", "\n", s)
if 'triggerMenuIndex' in s or 'setTriggerMenuIndex' in s:
    raise SystemExit('legacy trigger menu references remain')

# ensure DynamicScenarioStageType imported for editor signature
s = must_replace(s, "  type DynamicScenarioStage,\n", "  type DynamicScenarioStage,\n  type DynamicScenarioStageType,\n", 'stage type import')

p.write_text(s)

# ---------- DynamicScenarioBuilder.css ----------
p = Path('src/components/DynamicScenarioBuilder.css')
s = p.read_text()
# Align exact semantic accents to the simulator palette.
s = s.replace('#75cbe7', '#61bedd').replace('#8dd5a0', '#70c584').replace('#c0a5e5', '#a66ddd')
# Use main simulator geometry for slider rows while retaining Apply column.
s += r'''

/* Scenario Builder v0.8.0 — simulator-matched controls and unified paths */
.dynamic-control-row.control-row { margin: 0; min-height: 76px; padding: 11px 10px; }
.dynamic-control-row .dynamic-control-body { align-self: center; }
.dynamic-control-row .control-heading { margin-bottom: 6px; }
.dynamic-control-row .control-heading span { font-size: 12px; }
.dynamic-control-row .control-heading strong { font-size: 12px; font-weight: 600; }
.dynamic-control-slider { width: 100%; min-height: 18px; margin: 0; }
.dynamic-control-column.vent .dynamic-control-slider { accent-color: #61bedd !important; }
.dynamic-control-column.patient .dynamic-control-slider { accent-color: #70c584 !important; }
.dynamic-control-column.physio .dynamic-control-slider { accent-color: #a66ddd !important; }
.dynamic-control-column.vent .dynamic-column-title { color: #61bedd; }
.dynamic-control-column.patient .dynamic-column-title { color: #70c584; }
.dynamic-control-column.physio .dynamic-column-title { color: #a66ddd; }
.dynamic-control-column.patient { border-color: rgba(113,188,127,.42); background: linear-gradient(180deg, rgba(62,102,70,.12), rgba(35,63,42,.06)); }
.dynamic-control-column.physio { border-color: rgba(166,109,221,.42); background: linear-gradient(180deg, rgba(102,61,128,.16), rgba(55,34,72,.08)); }
.dynamic-control-column.vent { border-color: rgba(97,190,221,.42); background: linear-gradient(180deg, rgba(45,102,122,.14), rgba(27,63,77,.07)); }
.dynamic-control-column.patient .dynamic-control-heading span { color: #aac9b0; }
.dynamic-control-column.physio .dynamic-control-heading span { color: #c1a4d3; }
.dynamic-control-column.vent .dynamic-control-heading span { color: #9fc7d5; }

.dynamic-path-builder { display: grid; gap: 10px; margin-top: 10px; }
.dynamic-path-card { display: grid; gap: 10px; padding: 12px; border: 1px solid #334a55; background: #0a151a; }
.dynamic-path-head { display: grid; grid-template-columns: minmax(150px,1.2fr) minmax(190px,1.4fr) 86px 34px; gap: 8px; align-items: end; }
.dynamic-path-head label, .dynamic-path-condition label { display: grid; gap: 4px; color: #8fa4ad; font-size: 8px; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; }
.dynamic-path-head input, .dynamic-path-head select, .dynamic-path-condition input, .dynamic-path-condition select { width: 100%; min-height: 34px; padding: 5px 7px; border: 1px solid #3b515b; border-radius: 0; background: #081116; color: #e4eff2; font: inherit; font-size: 10px; }
.dynamic-path-logic { display: flex; align-items: center; gap: 8px; min-height: 30px; color: #99abb3; }
.dynamic-path-logic > strong { font-size: 9px; letter-spacing: .08em; text-transform: uppercase; }
.dynamic-path-logic > small { color: #71868f; }
.dynamic-path-mode { display: flex; gap: 4px; }
.dynamic-path-mode button { min-width: 52px; min-height: 28px; padding: 4px 7px; border-radius: 0; font-size: 9px; font-weight: 800; }
.dynamic-path-mode button.selected { border-color: #61bedd; background: #163642; color: #e7f9ff; }
.dynamic-path-conditions { display: grid; gap: 7px; }
.dynamic-path-condition { display: grid; grid-template-columns: minmax(135px,1fr) repeat(3,minmax(100px,1fr)) 32px; gap: 7px; align-items: end; padding: 8px; border: 1px solid #263b44; background: #081217; }
.dynamic-path-condition-type { align-self: end; }
.dynamic-path-condition-summary { align-self: center; grid-column: span 3; color: #afc2ca; font-size: 10px; }
.dynamic-path-condition-remove { width: 32px; height: 34px; min-width: 32px; padding: 0; border-radius: 0; }
.dynamic-path-add-condition { justify-self: start; min-height: 32px; padding: 5px 10px; border-radius: 0; color: #a9e8ba; border-color: #477458; background: #102219; font-size: 9px; }
.dynamic-path-empty { padding: 10px 12px; border: 1px dashed #344a54; color: #748992; font-size: 10px; background: #091217; }
@media (max-width: 1180px) {
  .dynamic-path-head { grid-template-columns: 1fr 1fr 80px 34px; }
  .dynamic-path-condition { grid-template-columns: 1fr 1fr 1fr 32px; }
  .dynamic-path-condition-summary { grid-column: span 2; }
}
'''
p.write_text(s)

# ---------- InstructorAccountControls.tsx ----------
p = Path('src/components/InstructorAccountControls.tsx')
s = p.read_text()
s = must_replace(s, "  dynamicStageTriggers,\n", "  dynamicBranchTriggers,\n  dynamicBranchTriggerMode,\n  dynamicStageTriggers,\n", 'runtime imports')
# graph-aware self-directed completion
old = "if (selfDirected && selfDirectedRun) void updateSelfDirectedRun(selfDirectedRun.runId, nextIndex, nextIndex === stages.length - 1).catch(() => undefined)"
new = "if (selfDirected && selfDirectedRun) { const stageId=stages[nextIndex]?.id; const outgoing=(preset.scenario.branches??[]).filter((branch)=>branch.enabled!==false&&branch.fromStageId===stageId); const completed=(preset.scenario.schemaVersion??0)>=9?outgoing.length===0:nextIndex===stages.length-1; void updateSelfDirectedRun(selfDirectedRun.runId,nextIndex,completed).catch(()=>undefined) }"
s = must_replace(s, old, new, 'self-directed completion')
# initial completion
s = must_replace(s, "void updateSelfDirectedRun(run.runId, 0, stages.length === 1).catch(() => undefined)", "{ const outgoing=(run.scenario.branches??[]).filter((branch)=>branch.enabled!==false&&branch.fromStageId===stages[0]?.id); const completed=(run.scenario.schemaVersion??0)>=9?outgoing.length===0:stages.length===1; void updateSelfDirectedRun(run.runId,0,completed).catch(()=>undefined) }", 'initial completion')
# allow terminal indexed stages to have outgoing graph paths
s = must_replace(s, "if (activeDynamicStage < 0 || activeDynamicStage >= stages.length - 1) return", "if (activeDynamicStage < 0 || activeDynamicStage >= stages.length) return", 'runtime bounds')
# v9 path model has no linear stage-trigger fallback
s = must_replace(s, "stageTriggers: dynamicStageTriggers(activeStage).filter((trigger) => trigger.type !== 'manual'),", "stageTriggers: (activeRuntimePreset.scenario.schemaVersion ?? 0) >= 9 ? [] : dynamicStageTriggers(activeStage).filter((trigger) => trigger.type !== 'manual'),", 'runtime path-only')
# richer path summary helper
old = "  const singleTriggerLabel=(trigger:DynamicScenarioTrigger)=>trigger.type==='manual'?'Instructor choice':trigger.type==='time'?`After ${trigger.seconds}s`:trigger.type==='condition'?`${trigger.metric} ${trigger.operator==='lt'?'<':trigger.operator==='gt'?'>':'='} ${trigger.value}`:trigger.type==='question-any'?'Any answer':trigger.type==='question-correct'?'Correct answer':trigger.type==='device-action'?trigger.action:trigger.type==='patient-change'?`${String(trigger.parameter)} changed`:`${String(trigger.parameter)} changed`\n"
new = old + "  const branchTriggerLabel=(branch:DynamicScenarioBranch)=>{const triggers=dynamicBranchTriggers(branch);const join=triggers.length>1?(dynamicBranchTriggerMode(branch)==='all'?' AND ':' OR '):'';return triggers.map(singleTriggerLabel).join(join)}\n"
s = must_replace(s, old, new, 'branch labels')
# instructor flow branch display references optional single trigger
s = s.replace("className={branch.trigger.type==='manual'?'manual':''}", "className={dynamicBranchTriggers(branch).some((trigger)=>trigger.type==='manual')?'manual':''}")
s = s.replace("branch.label?.trim()||singleTriggerLabel(branch.trigger)", "branch.label?.trim()||branchTriggerLabel(branch)")
# self-directed panel graph-aware state and manual path choices
old = """        const stage = stages[index]
        const stageType = stage?.stageType ?? 'controls'
        const triggers: DynamicScenarioTrigger[] = stage ? dynamicStageTriggers(stage) : [{ type: 'manual' }]
        const completed = index >= stages.length - 1
        const manualTrigger = !completed && triggers.some((trigger) => trigger.type === 'manual')
"""
new = """        const stage = stages[index]
        const stageType = stage?.stageType ?? 'controls'
        const triggers: DynamicScenarioTrigger[] = stage ? dynamicStageTriggers(stage) : [{ type: 'manual' }]
        const outgoingPaths = (activeRuntimePreset.scenario.branches ?? []).filter((branch) => branch.enabled !== false && branch.fromStageId === stage?.id).sort((a,b)=>(a.priority??0)-(b.priority??0))
        const manualPaths = outgoingPaths.filter((branch) => dynamicBranchTriggers(branch).some((trigger) => trigger.type === 'manual'))
        const completed = (activeRuntimePreset.scenario.schemaVersion ?? 0) >= 9 ? outgoingPaths.length === 0 : index >= stages.length - 1
        const manualTrigger = !completed && ((activeRuntimePreset.scenario.schemaVersion ?? 0) >= 9 ? manualPaths.length > 0 : triggers.some((trigger) => trigger.type === 'manual'))
        const manualPathButtons = manualPaths.map((branch) => <button type="button" className="self-directed-scenario-continue" key={branch.id} onClick={() => loadDynamicBranch(activeRuntimePreset,branch,'manual')}>{branch.label?.trim() || branchTriggerLabel(branch)}</button>)
"""
s = must_replace(s, old, new, 'self directed path state')
s = s.replace("{manualTrigger && !completed && <button type=\"button\" className=\"self-directed-scenario-continue\" onClick={() => loadDynamicStage(activeRuntimePreset,index+1)}>Continue</button>}", "{manualTrigger && !completed && ((activeRuntimePreset.scenario.schemaVersion ?? 0) >= 9 ? manualPathButtons : <button type=\"button\" className=\"self-directed-scenario-continue\" onClick={() => loadDynamicStage(activeRuntimePreset,index+1)}>Continue</button>)}")
s = s.replace("{completed ? <div className=\"self-directed-scenario-status complete\"><strong>Scenario complete</strong><span>You have reached the end of this scenario.</span></div> : manualTrigger ? <button type=\"button\" className=\"self-directed-scenario-continue\" onClick={() => loadDynamicStage(activeRuntimePreset,index+1)}>Continue</button> : <div className=\"self-directed-scenario-status\"><strong>Scenario active</strong><span>Continue working with the simulator.</span></div>}", "{completed ? <div className=\"self-directed-scenario-status complete\"><strong>Scenario complete</strong><span>You have reached an endpoint in this scenario.</span></div> : manualTrigger ? ((activeRuntimePreset.scenario.schemaVersion ?? 0) >= 9 ? <div className=\"self-directed-scenario-paths\">{manualPathButtons}</div> : <button type=\"button\" className=\"self-directed-scenario-continue\" onClick={() => loadDynamicStage(activeRuntimePreset,index+1)}>Continue</button>) : <div className=\"self-directed-scenario-status\"><strong>Scenario active</strong><span>Continue working with the simulator.</span></div>}")
# Instructor flow primary action should prefer the only defined manual path; otherwise remains an override advance.
old = """<button type="button" className="instructor-scenario-flow-primary" disabled={index>=stages.length-1} onClick={()=>loadDynamicStage(activeRuntimePreset,index+1)}>{manual?'Manual trigger':'Advance now'}</button>"""
new = """<button type="button" className="instructor-scenario-flow-primary" disabled={branches.length===0&&index>=stages.length-1} onClick={()=>{const manualPaths=branches.filter((branch)=>dynamicBranchTriggers(branch).some((trigger)=>trigger.type==='manual'));if(manualPaths.length===1)loadDynamicBranch(activeRuntimePreset,manualPaths[0],'manual');else if(index<stages.length-1)loadDynamicStage(activeRuntimePreset,index+1)}}>{branches.filter((branch)=>dynamicBranchTriggers(branch).some((trigger)=>trigger.type==='manual')).length===1?'Follow path':'Advance override'}</button>"""
s = must_replace(s, old, new, 'flow primary')
# manual variable is now unused in flow expression
s = s.replace(",manual=stage?dynamicStageTriggers(stage).some(t=>t.type==='manual'):false", "")
p.write_text(s)

# ---------- version ----------
p = Path('src/scenario-builder/version.ts')
s = p.read_text()
s = re.sub(r"SCENARIO_BUILDER_VERSION = '[^']+'", "SCENARIO_BUILDER_VERSION = '0.8.0'", s)
p.write_text(s)

print('Applied Scenario Builder v0.8.0 unified paths + simulator-matched controls')
