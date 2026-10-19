from pathlib import Path
import subprocess
subprocess.run(['git','checkout','HEAD','--','src/components/InstructorAccountControls.tsx'],check=True)
p=Path('src/components/InstructorAccountControls.tsx'); s=p.read_text()
s=s.replace("  type DynamicScenarioApplyMask,\n", "  type DynamicScenarioApplyMask,\n  type DynamicScenarioBranch,\n", 1)
anchor="  const startDynamicScenario = async (preset: InstructorPresetRow) => {\n"
helper="""  const loadDynamicBranch = (preset: InstructorPresetRow, branch: DynamicScenarioBranch, reason: 'manual' | 'automatic' = 'manual') => {
    const stages = preset.scenario.stages ?? []
    const target = stages.findIndex((stage) => stage.id === branch.toStageId)
    if (target < 0) return
    loadDynamicStage(preset, target, reason)
  }

"""
s=s.replace(anchor,helper+anchor,1)
old="""    if (!shouldAdvance) return
    automaticAdvanceLockRef.current=true
    loadDynamicStage(activeRuntimePreset,activeDynamicStage+1,'automatic')
"""
new="""    const activeStage = stages[activeDynamicStage]
    const outgoingBranches = (activeRuntimePreset.scenario.branches ?? []).filter((branch) => branch.enabled !== false && branch.fromStageId === activeStage?.id).sort((a,b) => a.priority - b.priority)
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
        if (trigger.actor==='instructor'||trigger.actor==='either') { const baseline=patientBaselineInstructorRef.current; if(baseline && settingChanged(currentScenario.patient[trigger.parameter],baseline[trigger.parameter]))return true }
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
    if (!shouldAdvance) return
    automaticAdvanceLockRef.current=true
    loadDynamicStage(activeRuntimePreset,activeDynamicStage+1,'automatic')
"""
if old not in s: raise SystemExit('auto tail missing')
s=s.replace(old,new,1)
label="  const singleTriggerLabel=(trigger:DynamicScenarioTrigger)=>trigger.type==='manual'?'Instructor choice':trigger.type==='time'?`After ${trigger.seconds}s`:trigger.type==='condition'?`${trigger.metric} ${trigger.operator==='lt'?'<':trigger.operator==='gt'?'>':'='} ${trigger.value}`:trigger.type==='question-any'?'Any answer':trigger.type==='question-correct'?'Correct answer':trigger.type==='device-action'?trigger.action:trigger.type==='patient-change'?`${String(trigger.parameter)} changed`:`${String(trigger.parameter)} changed`\n\n"
s=s.replace("  const flowDragStart=",label+"  const flowDragStart=",1)
s=s.replace("elapsed=Math.max(0,scenarioElapsedSeconds-activeDynamicStageStartedAt);if(instructorFlowHidden)","elapsed=Math.max(0,scenarioElapsedSeconds-activeDynamicStageStartedAt),branches=(activeRuntimePreset.scenario.branches??[]).filter(branch=>branch.enabled!==false&&branch.fromStageId===stage?.id).sort((a,b)=>a.priority-b.priority);if(instructorFlowHidden)",1)
needle="</div>{stage?.comment?.trim()&&<p className=\"instructor-scenario-flow-comment\">"
insert="</div>{branches.length>0&&<div className=\"instructor-scenario-branches\"><strong>Available paths</strong>{branches.map((branch)=>{const targetIndex=stages.findIndex(x=>x.id===branch.toStageId);return <button type=\"button\" key={branch.id} className={branch.trigger.type==='manual'?'manual':''} onClick={()=>loadDynamicBranch(activeRuntimePreset,branch,'manual')}><span>{branch.label?.trim()||singleTriggerLabel(branch.trigger)}</span><em>→ {targetIndex>=0?(stages[targetIndex].name||`Stage ${targetIndex+1}`):'Missing stage'}</em></button>})}</div>}{stage?.comment?.trim()&&<p className=\"instructor-scenario-flow-comment\">"
if needle not in s: raise SystemExit('flow insertion anchor missing')
s=s.replace(needle,insert,1)
s=s.replace("Select any stage to activate it in the live session.","Select any stage, or choose one of the defined branch paths.",1)
p.write_text(s)
