import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { advanceOxygenation, targetSpO2FromAlveolarFraction } from '../src/core/physiology/respiratory/sharedOxygenation.mjs'
import { SessionEngineV2 } from '../src/session-v2/engine.mjs'
import { createAnaesthSessionAdapter } from '../src/session-v2/adapters/anaesth.mjs'
import { projectAnaesthV2Monitor } from '../src/session-v2/adapters/anaesthPilot.mjs'

const baselineInput = {
  alveolarOxygenFraction:.16,spo2Percent:98,respiratoryRate:12,tidalVolumeMl:500,
  deadSpaceMl:150,fio2:.21,frcMl:2500,oxygenConsumptionMlMin:250,
  expiratoryResistanceCmH2OLs:8,shuntFraction:.03,complianceMlPerCmH2O:70,
  peepCmH2O:5,maxSpO2:100,deltaSeconds:1,
}
const initial = advanceOxygenation(baselineInput)
assert.ok(Number.isFinite(initial.spo2Percent) && initial.spo2Percent<=100)
assert.equal(targetSpO2FromAlveolarFraction(.16,baselineInput),
  targetSpO2FromAlveolarFraction(.16,{...baselineInput}), 'same pure target')
const apnea = advanceOxygenation({...baselineInput,respiratoryRate:0,deltaSeconds:60})
assert.ok(apnea.alveolarOxygenFraction < .16,'oxygen depletes during apnea')
assert.throws(()=>advanceOxygenation({...baselineInput,deltaSeconds:-1}),/invalid-oxygenation-input/)

const patient={heartRate:78,systolicPressure:122,diastolicPressure:68,spo2:98,peripheralPerfusion:1,
 respiratory:{ventilatorMode:'MANUAL',respiratoryRate:12,tidalVolumeMl:500,
 spontaneousRespiratoryRate:12,spontaneousTidalVolumeMl:500,deadSpaceMl:150,
 frcMl:2500,fio2:.21,peepCmH2O:5,complianceMlPerCmH2O:70,
 expiratoryResistanceCmH2OLs:8,shuntFraction:.03,oxygenConsumptionMlMin:250,
 co2ProductionMlMin:250,maxSpO2:100},
 anaestheticGases:{fiSevoPercent:0}}
const adapter=createAnaesthSessionAdapter({initialPatient:patient})
const engine=new SessionEngineV2({sessionId:'oxygen-test',mode:'simulation',instructorId:'inst',adapter})
engine.join({participantId:'candidate',role:'candidate'})
engine.start('inst')
let seq=0
const send=(role,type,payload={})=>engine.submit({id:'oxygen-'+(++seq),epoch:engine.snapshot.session.epoch,
 participantId:role,runtimeId:'main',type,payload})
const state=()=>engine.snapshot.runtimes[0].state
const tick=()=>assert.equal(send('inst','tick',{deltaMs:1000}).accepted,true)
assert.equal(state().respiratoryRuntime.spo2Percent,98)
assert.equal(send('candidate','device.parameter.set',{path:'spontaneousRespiratoryRate',value:0}).accepted,true)
assert.equal(send('candidate','device.parameter.set',{path:'spontaneousTidalVolumeMl',value:0}).accepted,true)
for(let i=0;i<90;i++)tick()
assert.ok(state().respiratoryRuntime.spo2Percent<95,'apnea should cause modelled desaturation')
assert.ok(state().respiratoryRuntime.alveolarOxygenFraction<.16)
assert.equal(projectAnaesthV2Monitor(state()).authoritativeV2Spo2,state().respiratoryRuntime.spo2Percent)
const hypoxic=state().respiratoryRuntime.spo2Percent
assert.equal(send('candidate','device.parameter.set',{path:'spontaneousRespiratoryRate',value:12}).accepted,true)
assert.equal(send('candidate','device.parameter.set',{path:'spontaneousTidalVolumeMl',value:500}).accepted,true)
assert.equal(send('candidate','device.parameter.set',{path:'fio2',value:1}).accepted,true)
for(let i=0;i<90;i++)tick()
assert.ok(state().respiratoryRuntime.spo2Percent>hypoxic+5,'oxygenation improves with restored ventilation and FiO2')
assert.ok(state().respiratoryRuntime.spo2Percent<=98,'SpO2 baseline instructor ceiling')
const snapshot=engine.exportCheckpoint()
const recovered=SessionEngineV2.fromCheckpoint({checkpoint:snapshot,adapter})
assert.deepEqual(recovered.snapshot.runtimes[0].state.respiratoryRuntime,state().respiratoryRuntime)
assert.equal(send('inst','reset').accepted,true)
assert.equal(state().respiratoryRuntime.spo2Percent,98)
assert.equal(state().respiratoryRuntime.alveolarOxygenFraction,.16)
assert.equal(state().patient.respiratory.fio2,.21)
const read=p=>readFileSync(p,'utf8')
assert.ok(read('src/core/physiology/respiratory/RespiratoryPhysiology.ts').includes('advanceOxygenation({'),
 'v1 must consume same oxygen kinetics')
assert.ok(read('src/edumon/monitorEngine.ts').includes('state.authoritativeV2Spo2 ??'),
 'v2 must not take stale browser pulse-oximeter output')
assert.ok(read('src/edumon/AnaesthSessionV2Preview.tsx').includes('spo2Percent: runtime?.respiratoryRuntime?.spo2Percent'),
 'preview must synchronize canonical oxygen reading')
console.log('Shared oxygenation, hypoxia/reoxygenation, checkpoint/reset and v2 SpO2 authority passed')
