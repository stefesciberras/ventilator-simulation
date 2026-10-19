from pathlib import Path
import re

# ---------- instructorAccount.ts ----------
p=Path('src/instructorAccount.ts'); s=p.read_text()
s=s.replace("import { supabase } from './session/supabase'\n", "import { supabase } from './session/supabase'\nimport { createBranchId, createStageId } from './scenario-builder/ids'\n", 1)
s=s.replace("export interface DynamicScenarioStage {\n  name: string\n", "export interface DynamicScenarioStage {\n  id?: string\n  name: string\n", 1)
anchor="export interface DynamicScenarioStage {"
idx=s.index(anchor)
end=s.index("\n}\n\nexport function dynamicStageTriggers", idx)+3
branch_type="""
export interface DynamicScenarioBranch {
  id: string
  fromStageId: string
  toStageId: string
  trigger: DynamicScenarioTrigger
  priority: number
  label?: string
  enabled?: boolean
}

"""
s=s[:end]+branch_type+s[end:]
s=s.replace("  stages?: DynamicScenarioStage[]\n", "  stages?: DynamicScenarioStage[]\n  branches?: DynamicScenarioBranch[]\n", 1)
s=s.replace("    stages: [{ name: 'Stage 1', comment: '', stageType: 'controls', transition: { mode: 'immediate' }, transitionOverrides: {}, snapshot: firstStageSnapshot, apply, sourceName, advanceTrigger: { type: 'manual' }, advanceTriggers: [{ type: 'manual' }] }],\n", "    stages: [{ id: createStageId(), name: 'Stage 1', comment: '', stageType: 'controls', transition: { mode: 'immediate' }, transitionOverrides: {}, snapshot: firstStageSnapshot, apply, sourceName, advanceTrigger: { type: 'manual' }, advanceTriggers: [{ type: 'manual' }] }],\n    branches: [],\n", 1)
s=s.replace("        name: stage.name || `Stage ${index + 1}`,\n", "        id: stage.id ?? createStageId(),\n        name: stage.name || `Stage ${index + 1}`,\n", 1)
old="""    stages: scenario.kind === 'dynamic' ? (scenario.stages ?? []).map((stage, index) => {
      const triggers = dynamicStageTriggers(stage)
      return {
        id: stage.id ?? createStageId(),
        name: stage.name || `Stage ${index + 1}`,
"""
if old not in s: raise SystemExit('normalise stage anchor failed')
# append branches after stage map expression using targeted tail
needle="""    }) : undefined,
  }
}
"""
repl="""    }) : undefined,
    branches: scenario.kind === 'dynamic' ? (scenario.branches ?? []).map((branch, index) => ({
      ...branch,
      id: branch.id || createBranchId(),
      priority: Number.isFinite(branch.priority) ? branch.priority : index,
      enabled: branch.enabled !== false,
    })) : undefined,
  }
}
"""
s=s.replace(needle,repl,1)
p.write_text(s)

# ---------- DynamicScenarioBuilder.tsx ----------
p=Path('src/components/DynamicScenarioBuilder.tsx'); s=p.read_text()
s=s.replace("  type DynamicScenarioApplyMask,\n", "  type DynamicScenarioApplyMask,\n  type DynamicScenarioBranch,\n", 1)
s=s.replace("import { SCENARIO_BUILDER_VERSION } from '../scenario-builder/version'\n", "import { SCENARIO_BUILDER_VERSION } from '../scenario-builder/version'\nimport { createBranchId, createStageId } from '../scenario-builder/ids'\n", 1)
s=s.replace("interface ScenarioDraft { id: string | null; name: string; description: string; stages: StageDraft[] }", "interface ScenarioDraft { id: string | null; name: string; description: string; stages: StageDraft[]; branches: DynamicScenarioBranch[] }")
s=s.replace("    ...cloned,\n    name: stage.name || `Stage ${index + 1}`,\n", "    ...cloned,\n    id: stage.id ?? createStageId(),\n    name: stage.name || `Stage ${index + 1}`,\n", 1)
s=s.replace("  return {\n    name: `Stage ${index + 1}`,\n", "  return {\n    id: createStageId(),\n    name: `Stage ${index + 1}`,\n", 1)
s=s.replace("  return { id: null, name: 'New dynamic scenario', description: '', stages: [newStage(base, 0)] }", "  return { id: null, name: 'New dynamic scenario', description: '', stages: [newStage(base, 0)], branches: [] }")
s=s.replace("    stages: (preset.scenario.stages ?? []).map(normaliseStage),\n  }", "    stages: (preset.scenario.stages ?? []).map(normaliseStage),\n    branches: (preset.scenario.branches ?? []).map((branch, index) => ({ ...branch, id: branch.id || createBranchId(), priority: Number.isFinite(branch.priority) ? branch.priority : index, enabled: branch.enabled !== false })),\n  }", 1)
# remove branches when deleting a stage
s=s.replace("      ...current,\n      stages: current.stages.filter((_, i) => i !== index),\n    }))", "      ...current,\n      stages: current.stages.filter((_, i) => i !== index),\n      branches: current.branches.filter((branch) => branch.fromStageId !== current.stages[index]?.id && branch.toStageId !== current.stages[index]?.id),\n    }))", 1)
# branch editor helpers before removeStage
anchor="  const removeStage = (index: number) => {\n"
helpers="""  const addBranch = (stageIndex: number) => {
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
s=s.replace(anchor,helpers+anchor,1)
# save schema/branches
s=s.replace("        schemaVersion: 7,\n        kind: 'dynamic',", "        schemaVersion: 8,\n        kind: 'dynamic',", 1)
s=s.replace("        stages: draft.stages.map((stage) => {", "        branches: draft.branches.map((branch, index) => ({ ...branch, priority: Number.isFinite(branch.priority) ? branch.priority : index, enabled: branch.enabled !== false })),\n        stages: draft.stages.map((stage) => {", 1)
s=s.replace("const scenario: InstructorScenarioSnapshot = { ...cloneScenario(parsed.scenario), schemaVersion: 7, kind: 'dynamic',", "const scenario: InstructorScenarioSnapshot = { ...cloneScenario(parsed.scenario), schemaVersion: 8, kind: 'dynamic',", 1)
# insert branch UI before transition builder
ui_anchor='''                <div className="dynamic-transition-builder">\n'''
branch_ui='''                <div className="dynamic-branch-builder">
                  <div className="dynamic-branch-heading"><div><strong>Branches from this stage</strong><span>Optional alternate paths. Branch triggers are evaluated before the normal next-stage trigger.</span></div><button type="button" disabled={draft.stages.length < 2} onClick={() => addBranch(index)}>＋ Add branch</button></div>
                  {draft.branches.filter((branch) => branch.fromStageId === stage.id).sort((a,b)=>a.priority-b.priority).map((branch) => {
                    const trigger = branch.trigger
                    return <div className="dynamic-branch-row" key={branch.id}>
                      <input className="dynamic-branch-label" value={branch.label ?? ''} placeholder="Branch label (optional)" onChange={(event)=>updateBranch(branch.id,{label:event.target.value})} />
                      <select value={branch.toStageId} onChange={(event)=>updateBranch(branch.id,{toStageId:event.target.value})}>{draft.stages.filter((candidate)=>candidate.id!==stage.id).map((candidate,stageIndex)=><option key={candidate.id} value={candidate.id}>Stage {stageIndex+1}: {candidate.name}</option>)}</select>
                      <select value={trigger.type} onChange={(event)=>updateBranch(branch.id,{trigger:defaultTriggerForType(event.target.value as DynamicScenarioTrigger['type'])})}>
                        {(stageType==='question'?['question-any','question-correct','time','manual']:['manual','time','condition','action','patient-change','device-action'] as DynamicScenarioTrigger['type'][]).map((type)=><option key={type} value={type}>{type==='manual'?'Instructor choice':type==='time'?'Time passed':type==='condition'?'Measured value':type==='action'?'Ventilator change':type==='patient-change'?'Patient change':type==='device-action'?'Action':type==='question-correct'?'Correct answer':'Any answer'}</option>)}
                      </select>
                      {trigger.type==='time'&&<input type="number" min={1} max={3600} value={trigger.seconds} onChange={(event)=>updateBranch(branch.id,{trigger:{...trigger,seconds:Math.max(1,Number(event.target.value)||1)}})} />}
                      {trigger.type==='condition'&&<><select value={trigger.metric} onChange={(event)=>updateBranch(branch.id,{trigger:{...trigger,metric:event.target.value as DynamicScenarioMetric}})}>{CONDITION_METRICS.map((metric)=><option key={metric.value} value={metric.value}>{metric.label}</option>)}</select><select value={trigger.operator} onChange={(event)=>updateBranch(branch.id,{trigger:{...trigger,operator:event.target.value as 'lt'|'eq'|'gt'}})}><option value="lt">&lt;</option><option value="eq">=</option><option value="gt">&gt;</option></select><input type="number" step="0.1" value={trigger.value} onChange={(event)=>updateBranch(branch.id,{trigger:{...trigger,value:Number(event.target.value)||0}})} /></>}
                      {trigger.type==='action'&&<><select value={String(trigger.parameter)} onChange={(event)=>updateBranch(branch.id,{trigger:{...trigger,parameter:event.target.value as keyof VentilatorSettings}})}>{VENT_FIELDS.map((field)=><option key={field.key} value={field.key}>{field.label}</option>)}</select><select value={trigger.actor} onChange={(event)=>updateBranch(branch.id,{trigger:{...trigger,actor:event.target.value as 'candidate'|'instructor'|'either'}})}><option value="either">Either</option><option value="candidate">Candidate</option><option value="instructor">Instructor</option></select></>}
                      {trigger.type==='patient-change'&&<><select value={String(trigger.parameter)} onChange={(event)=>updateBranch(branch.id,{trigger:{...trigger,parameter:event.target.value as keyof PatientSettings}})}>{[...PATIENT_FIELDS,...PHYSIO_FIELDS].map((field)=><option key={field.key} value={field.key}>{field.label}</option>)}</select><select value={trigger.actor} onChange={(event)=>updateBranch(branch.id,{trigger:{...trigger,actor:event.target.value as 'candidate'|'instructor'|'either'}})}><option value="either">Either</option><option value="candidate">Candidate</option><option value="instructor">Instructor</option></select></>}
                      {trigger.type==='device-action'&&<><select value={trigger.action} onChange={(event)=>updateBranch(branch.id,{trigger:{...trigger,action:event.target.value as typeof trigger.action}})}><option value="freeze-waveform">Freeze waveform</option><option value="inspiratory-hold">Inspiratory hold</option><option value="expiratory-hold">Expiratory hold</option><option value="oxygen-flush">Oxygen flush</option><option value="nebulisation">Nebulisation</option></select><select value={trigger.actor} onChange={(event)=>updateBranch(branch.id,{trigger:{...trigger,actor:event.target.value as 'candidate'|'instructor'|'either'}})}><option value="either">Either</option><option value="candidate">Candidate</option><option value="instructor">Instructor</option></select></>}
                      <button type="button" className="dynamic-stage-remove" onClick={()=>removeBranch(branch.id)} aria-label="Remove branch">×</button>
                    </div>
                  })}
                </div>

'''
if ui_anchor not in s: raise SystemExit('branch UI anchor missing')
s=s.replace(ui_anchor,branch_ui+ui_anchor,1)
p.write_text(s)

# ---------- InstructorAccountControls.tsx ----------
p=Path('src/components/InstructorAccountControls.tsx'); s=p.read_text()
s=s.replace("  type DynamicScenarioApplyMask,\n", "  type DynamicScenarioApplyMask,\n  type DynamicScenarioBranch,\n", 1)
# branch loader helper after jumpDynamicStage
anchor="""  const startDynamicScenario = async (preset: InstructorPresetRow) => {
"""
helper="""  const loadDynamicBranch = (preset: InstructorPresetRow, branch: DynamicScenarioBranch, reason: 'manual' | 'automatic' = 'manual') => {
    const stages = preset.scenario.stages ?? []
    const target = stages.findIndex((stage) => stage.id === branch.toStageId)
    if (target < 0) return
    loadDynamicStage(preset, target, reason)
  }

"""
s=s.replace(anchor,helper+anchor,1)
# Rewrite auto effect by adding branch selection after shouldAdvance logic using regex around final advance call
old="""    if (!shouldAdvance) return
    automaticAdvanceLockRef.current=true
    loadDynamicStage(activeRuntimePreset,activeDynamicStage+1,'automatic')
"""
new="""    const activeStage = stages[activeDynamicStage]
    const outgoingBranches = (activeRuntimePreset.scenario.branches ?? []).filter((branch) => branch.enabled !== false && branch.fromStageId === activeStage?.id).sort((a,b) => a.priority - b.priority)
    if (!automaticAdvanceLockRef.current && outgoingBranches.length) {
      const branchMatches = (trigger: DynamicScenarioTrigger) => {
        if (trigger.type === 'manual') return false
        if (trigger.type === 'time') return scenarioElapsedSeconds - activeDynamicStageStartedAt >= Math.max(1, trigger.seconds)
        if (trigger.type === 'condition') { const actual=conditionMetricValue(physiologyMeasurements,trigger.metric); return actual!=null && conditionMatches(actual,trigger.operator,trigger.value) }
        if (trigger.type === 'question-any') return selfDirectedRun ? selfDirectedQuestionAnswer != null : scenarioPromptRuntime.responses.length > 0
        if (trigger.type === 'question-correct') { const correct=activeStage?.question?.correctOptionId??null; return Boolean(correct && (selfDirectedRun ? selfDirectedQuestionAnswer===correct : scenarioPromptRuntime.responses.some((response)=>response.option_id===correct))) }
        if (trigger.type === 'device-action') {
          if (selfDirectedRun) return (trigger.actor==='candidate'||trigger.actor==='either') && Boolean(scenarioActionEvent && scenarioActionEvent.sequence>localScenarioActionBaselineRef.current && scenarioActionEvent.action===trigger.action)
          if ((trigger.actor==='instructor'||trigger.actor==='either') && scenarioActionEvent && scenarioActionEvent.sequence>localScenarioActionBaselineRef.current && scenarioActionEvent.action===trigger.action) return true
          if (trigger.actor==='candidate'||trigger.actor==='either') return sessionMembers.some((member)=>member.role==='candidate' && (member.scenario_action_revision??0)>(candidateScenarioActionBaselineRef.current.get(member.id)??0) && member.last_scenario_action===trigger.action)
          return false
        }
        if (trigger.type === 'patient-change') {
          const duration=stageTransitionDuration(activeStage,'patient',String(trigger.parameter)); if(scenarioElapsedSeconds-activeDynamicStageStartedAt<duration)return false
          if (selfDirectedRun) { const baseline=patientBaselineInstructorRef.current; return (trigger.actor==='candidate'||trigger.actor==='either') && Boolean(baseline && settingChanged(currentScenario.patient[trigger.parameter],baseline[trigger.parameter])) }
          if ((trigger.actor==='instructor'||trigger.actor==='either')) { const baseline=patientBaselineInstructorRef.current; if(baseline && settingChanged(currentScenario.patient[trigger.parameter],baseline[trigger.parameter]))return true }
          if (trigger.actor==='candidate'||trigger.actor==='either') return sessionMembers.some((member)=>{if(member.role!=='candidate')return false;const baseline=patientBaselineCandidatesRef.current.get(member.id),settings=member.patient_settings as Partial<PatientSettings>;return Boolean(baseline&&settings&&(trigger.parameter in settings)&&settingChanged(settings[trigger.parameter],baseline[trigger.parameter]))})
          return false
        }
        const duration=stageTransitionDuration(activeStage,'ventilator',String(trigger.parameter)); if(scenarioElapsedSeconds-activeDynamicStageStartedAt<duration)return false
        if (selfDirectedRun) { const baseline=actionBaselineInstructorRef.current; return (trigger.actor==='candidate'||trigger.actor==='either') && Boolean(baseline && settingChanged(currentScenario.ventilator[trigger.parameter],baseline[trigger.parameter])) }
        if (trigger.actor==='instructor'||trigger.actor==='either') { const baseline=actionBaselineInstructorRef.current; if(baseline && settingChanged(currentScenario.ventilator[trigger.parameter],baseline[trigger.parameter]))return true }
        if (trigger.actor==='candidate'||trigger.actor==='either') return sessionMembers.some((member)=>{if(member.role!=='candidate')return false;const baseline=actionBaselineCandidatesRef.current.get(member.id),settings=member.ventilator_settings as Partial<VentilatorSettings>;return Boolean(baseline&&settings&&(trigger.parameter in settings)&&settingChanged(settings[trigger.parameter],baseline[trigger.parameter]))})
        return false
      }
      const matchedBranch = outgoingBranches.find((branch) => branchMatches(branch.trigger))
      if (matchedBranch) { automaticAdvanceLockRef.current=true; loadDynamicBranch(activeRuntimePreset, matchedBranch, 'automatic'); return }
    }
    if (!shouldAdvance) return
    automaticAdvanceLockRef.current=true
    loadDynamicStage(activeRuntimePreset,activeDynamicStage+1,'automatic')
"""
if old not in s: raise SystemExit('auto advance tail missing')
s=s.replace(old,new,1)
# replace flow portal compact line with branch-aware version
start="      {runtimeHost&&activeRuntimePreset&&role==='instructor'&&createPortal((()=>{"
end="})(),runtimeHost)}\n      {selfDirectedRun && activeRuntimePreset"
a=s.index(start); b=s.index(end,a)
flow="""      {runtimeHost&&activeRuntimePreset&&role==='instructor'&&createPortal((()=>{const stages=activeRuntimePreset.scenario.stages??[],index=Math.min(activeDynamicStage,Math.max(0,stages.length-1)),stage=stages[index],manual=stage?dynamicStageTriggers(stage).some(t=>t.type==='manual'):false,elapsed=Math.max(0,scenarioElapsedSeconds-activeDynamicStageStartedAt),branches=(activeRuntimePreset.scenario.branches??[]).filter(branch=>branch.enabled!==false&&branch.fromStageId===stage?.id).sort((a,b)=>a.priority-b.priority);if(instructorFlowHidden)return <button type=\"button\" className=\"teaching-prompt-reopen instructor-scenario-flow-reopen\" onClick={()=>setInstructorFlowHidden(false)}><span>Scenario flow</span><strong>Show</strong></button>;return <div className=\"teaching-media-overlay instructor-scenario-flow-overlay\"><section className=\"teaching-media-modal instructor-scenario-flow-modal\" role=\"dialog\" aria-modal=\"false\" style={{transform:`translate(${instructorFlowPosition.x}px, ${instructorFlowPosition.y}px)`}}><div className=\"teaching-media-header instructor-scenario-flow-header\" onPointerDown={flowDragStart} onPointerMove={flowDragMove} onPointerUp={flowDragEnd} onPointerCancel={flowDragEnd}><div><span>Scenario flow</span><strong>{activeRuntimePreset.name}</strong></div><button type=\"button\" onClick={()=>setInstructorFlowHidden(true)}>Hide</button></div><div className=\"instructor-scenario-flow-body\"><div className=\"instructor-scenario-flow-meta\"><strong>{stage?.name??`Stage ${index+1}`}</strong><span>{index+1}/{stages.length} · {formatStageTimer(elapsed)}</span></div><div className=\"instructor-scenario-flow-track\">{stages.map((x,i)=><div className=\"instructor-scenario-flow-wrap\" key={x.id??`${i}-${x.name}`}><button type=\"button\" className={`instructor-scenario-flow-node ${i===index?'active':''}`} onClick={()=>jumpDynamicStage(activeRuntimePreset,i)}><small>Stage {i+1}</small><strong>{x.name||`Stage ${i+1}`}</strong><em>{(x.stageType??'controls')==='controls'?'Controls':(x.stageType??'controls')==='media'?'Media':'Question'}</em></button></div>)}</div>{branches.length>0&&<div className=\"instructor-scenario-branches\"><strong>Available paths</strong>{branches.map((branch)=>{const targetIndex=stages.findIndex(x=>x.id===branch.toStageId);return <button type=\"button\" key={branch.id} className={branch.trigger.type==='manual'?'manual':''} onClick={()=>loadDynamicBranch(activeRuntimePreset,branch,'manual')}><span>{branch.label?.trim()||singleTriggerLabel(branch.trigger)}</span><em>→ {targetIndex>=0?(stages[targetIndex].name||`Stage ${targetIndex+1}`):'Missing stage'}</em></button>})}</div>}{stage?.comment?.trim()&&<p className=\"instructor-scenario-flow-comment\">{stage.comment.trim()}</p>}<div className=\"instructor-scenario-flow-actions\"><button type=\"button\" disabled={index<=0} onClick={()=>jumpDynamicStage(activeRuntimePreset,index-1)}>Previous</button><button type=\"button\" className=\"instructor-scenario-flow-primary\" disabled={index>=stages.length-1} onClick={()=>loadDynamicStage(activeRuntimePreset,index+1)}>{manual?'Manual trigger':'Advance now'}</button><button type=\"button\" className=\"instructor-scenario-flow-stop\" onClick={()=>{setActiveDynamicId(null);setActiveDynamicStage(0);setInstructorFlowHidden(false);setInstructorFlowPosition({x:0,y:0});setPresetMessage('Dynamic scenario stopped.')}}>Stop</button></div><small className=\"instructor-scenario-flow-help\">Select any stage, or choose one of the defined branch paths.</small></div></section></div>})(),runtimeHost)}\n      {selfDirectedRun && activeRuntimePreset"""
# helper label function before flow drag handlers
label_helper="""  const singleTriggerLabel=(trigger:DynamicScenarioTrigger)=>trigger.type==='manual'?'Instructor choice':trigger.type==='time'?`After ${trigger.seconds}s`:trigger.type==='condition'?`${trigger.metric} ${trigger.operator==='lt'?'<':trigger.operator==='gt'?'>':'='} ${trigger.value}`:trigger.type==='question-any'?'Any answer':trigger.type==='question-correct'?'Correct answer':trigger.type==='device-action'?trigger.action:trigger.type==='patient-change'?`${String(trigger.parameter)} changed`:`${String(trigger.parameter)} changed`

"""
s=s.replace("  const flowDragStart=",label_helper+"  const flowDragStart=",1)
s=s[:a]+flow+s[b+len(end)-len("      {selfDirectedRun && activeRuntimePreset"):]
p.write_text(s)

# ---------- CSS ----------
p=Path('src/components/DynamicScenarioBuilder.css'); s=p.read_text()+'''\n/* v0.6.0 branching */\n.dynamic-branch-builder{margin-top:10px;padding:10px;border:1px solid #334851;border-radius:10px;background:#0b151a}.dynamic-branch-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:8px}.dynamic-branch-heading>div{display:grid;gap:2px}.dynamic-branch-heading span{color:#8fa4ad;font-size:.72rem}.dynamic-branch-heading button{min-height:32px}.dynamic-branch-row{display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding:8px 0;border-top:1px solid #24363e}.dynamic-branch-row:first-of-type{border-top:0}.dynamic-branch-row select,.dynamic-branch-row input{min-height:34px;background:#101b21;color:#dce8eb;border:1px solid #40545e;border-radius:6px}.dynamic-branch-label{min-width:150px;flex:1}.dynamic-branch-row input[type=number]{width:88px}\n'''; p.write_text(s)
p=Path('src/account.css'); s=p.read_text()+'''\n/* v0.6.0 branch paths */\n.instructor-scenario-branches{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:7px;padding:9px;border:1px solid #334851;border-radius:9px;background:#0b151a}.instructor-scenario-branches>strong{grid-column:1/-1;color:#f0b06e;font-size:.72rem;text-transform:uppercase;letter-spacing:.05em}.instructor-scenario-branches button{display:grid;gap:2px;text-align:left;padding:8px;border:1px solid #40545e;border-radius:8px;background:#101b21;color:#dce8eb}.instructor-scenario-branches button.manual{border-color:#ef8a27}.instructor-scenario-branches button em{font-size:.68rem;font-style:normal;color:#8fa4ad}\n'''; p.write_text(s)
Path('src/scenario-builder/version.ts').write_text("export const SCENARIO_BUILDER_VERSION = '0.6.0'\n")
