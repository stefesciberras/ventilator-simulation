import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { SessionEngineV2 } from '../src/session-v2/engine.mjs'
import { createAnaesthSessionAdapter } from '../src/session-v2/adapters/anaesth.mjs'
const patient = {heartRate:78, systolicPressure:122, diastolicPressure:68, spo2:98, peripheralPerfusion:1,
  respiratory:{ventilatorMode:'VC-AC',respiratoryRate:12,tidalVolumeMl:500,
    ventilatorSetRate:12,ventilatorSetTidalVolumeMl:500,
    ventilatorInspiratoryTimeSeconds:1,ventilatorInspiratoryFlowLMin:30,
    peepCmH2O:5,complianceMlPerCmH2O:70,expiratoryResistanceCmH2OLs:8,deadSpaceMl:150,frcMl:2500},
  anaestheticGases:{fiSevoPercent:0}}
const adapter = createAnaesthSessionAdapter({initialPatient:patient})
const engine = new SessionEngineV2({sessionId:'live-controls',mode:'simulation',instructorId:'instructor',adapter})
engine.join({participantId:'candidate',role:'candidate'})
engine.start('instructor')
let seq=0
const command=(actor,type,payload={})=>engine.submit({id:'vent-'+(++seq),epoch:engine.snapshot.session.epoch,
  participantId:actor,runtimeId:'main',type,payload})
const state=()=>engine.snapshot.runtimes[0].state
const step=()=>assert.equal(command('instructor','tick',{deltaMs:1000}).accepted,true)
for(const [path,value] of [
 ['ventilatorSetRate',20],['ventilatorSetTidalVolumeMl',600],['peepCmH2O',8],
 ['fio2',.75],['ventilatorInspiratoryTimeSeconds',.8],['ventilatorInspiratoryFlowLMin',60],
 ['ventilatorPlateauPercent',10],['ventilatorPressureControlCmH2O',22],
 ['ventilatorPressureSupportCmH2O',15],['ventilatorVolumeGuaranteePressureLimitCmH2O',40],
 ['ventilatorTerminationSensitivityPercent',50],['ventilatorSimvSyncWindowPercent',35]
]) {
  assert.equal(command('candidate','device.parameter.set',{path,value}).accepted,true, path)
  assert.equal(state().patient.respiratory[path],value,path)
}
assert.equal(command('candidate','device.parameter.set',{path:'spo2',value:0}).accepted,false)
assert.equal(command('candidate','device.parameter.set',{path:'fio2',value:4}).accepted,false)
assert.equal(command('candidate','device.parameter.set',{path:'fio2',value:0.4,forged:true}).accepted,false)
step()
assert.equal(state().respiratoryRuntime.respiratoryRate,20,'set mandatory rate affects delivery')
assert.equal(state().respiratoryRuntime.tidalVolumeMl,600,'set VC volume affects delivery')
const basePressure=state().respiratoryRuntime.peakAirwayPressureCmH2O
assert.equal(command('instructor','event.bronchospasm.set',{severityPercent:85}).accepted,true)
for(let i=0;i<15;i++)step()
assert.ok(state().respiratoryRuntime.peakAirwayPressureCmH2O>basePressure)
assert.equal(state().respiratoryRuntime.tidalVolumeMl,600)
assert.equal(command('candidate','device.ventilator.mode.set',{mode:'PC-AC'}).accepted,true)
step()
assert.equal(state().respiratoryRuntime.peakAirwayPressureCmH2O,30)
assert.ok(state().respiratoryRuntime.tidalVolumeMl<600)
assert.equal(command('candidate','device.ventilator.mode.set',{mode:'unsupported'}).accepted,false)
const checkpoint = engine.exportCheckpoint()
const recovered=SessionEngineV2.fromCheckpoint({checkpoint,adapter})
assert.equal(recovered.snapshot.runtimes[0].state.patient.respiratory.ventilatorSetRate,20)
assert.equal(recovered.snapshot.runtimes[0].state.patient.respiratory.fio2,.75)
assert.equal(recovered.snapshot.runtimes[0].state.bronchospasmRuntime.targetSeverityPercent,85)
assert.equal(command('instructor','event.bronchospasm.set',{severityPercent:0}).accepted,true)
for(let i=0;i<20;i++)step()
assert.ok(state().bronchospasmRuntime.effectiveSeverityPercent<.01)
assert.equal(command('instructor','reset').accepted,true)
assert.equal(state().bronchospasmRuntime.targetSeverityPercent,0)
assert.equal(state().patient.respiratory.ventilatorSetRate,12)
const read=p=>readFileSync(p,'utf8')
const preview=read('src/edumon/AnaesthSessionV2Preview.tsx')
const ui=read('src/edumon/EdumonVentilatorControl.tsx')
const app=read('src/edumon/EdumonApp.tsx')
assert.ok(!preview.includes('Apply bronchospasm</button>'),'no extra Apply button')
assert.ok(preview.includes('window.setTimeout(() => {'),'severity debounced')
assert.ok(preview.includes("type: 'event.bronchospasm.set'"),'severity sent automatically')
assert.ok(preview.includes("type: 'setting'"),'preview exposes ventilator command bridge')
assert.ok(ui.includes('onV2VentilatorChange?.({ type: \'mode\', mode })'),'existing mode selector enabled')
assert.ok(ui.includes('onV2VentilatorChange?.({ type: \'setting\''),'existing controls send validated settings')
assert.ok(app.includes('ventilatorRequestRef={v2VentilatorRequestRef}'),'both views use canonical transport')
console.log('Session v2 live bronchospasm and ventilator controls regression passed')
