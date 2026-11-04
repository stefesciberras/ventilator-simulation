/**
 * Pure experimental Anaesth v2 alarm eligibility and measurement semantics.
 * Every input is a checkpointed canonical session field. No browser DOM,
 * local ActionRuntime, or alarm playback side effects belong in this module.
 */
import { projectAnaesthV2Monitor } from './anaesthPilot.mjs'

export const DEFAULT_V2_ALARM_LIMITS = Object.freeze({
  heartRateLow:50, heartRateHigh:120, mapLow:60, mapHigh:110,
  spo2Low:90, spo2High:100, etco2Low:25, etco2High:55,
  bisLow:30, bisHigh:70,
})
export const DEFAULT_V2_DISPLAY = Object.freeze({
  heartRate:true, spo2:true, invasiveBloodPressure:false,
  bis:false, capnography:false, temperature:false,
})
const allowedDisplay = new Set(Object.keys(DEFAULT_V2_DISPLAY))
const allowedLimits = Object.freeze({
  heartRateLow:[20,250],heartRateHigh:[20,250],mapLow:[20,180],mapHigh:[20,180],
  spo2Low:[50,100],spo2High:[50,100],
  etco2Low:[0,120],etco2High:[0,120],bisLow:[0,100],bisHigh:[0,100],
})
const limits = state => ({...DEFAULT_V2_ALARM_LIMITS,...state.alarmRuntime?.limits})
const displayed = state => ({...DEFAULT_V2_DISPLAY,...state.display})
const evaluation = (key,label,active,priority='warning',eligible=true,immediateCritical=false) =>
  ({key,label,active:Boolean(active)&&Boolean(eligible),priority,eligible:Boolean(eligible),immediateCritical})
export function validateV2AlarmLimits(request) {
  if (!request || typeof request !== 'object' || Array.isArray(request) ||
      Object.keys(request).length !== Object.keys(allowedLimits).length ||
      Object.keys(request).some(key=>!Object.hasOwn(allowedLimits,key))) throw Error('invalid-alarm-limits')
  for(const [key,[min,max]] of Object.entries(allowedLimits)) {
    if (typeof request[key] !== 'number' || !Number.isFinite(request[key]) ||
        request[key] < min || request[key] > max) throw Error('invalid-alarm-limit')
  }
  for(const pair of [['heartRateLow','heartRateHigh'],['mapLow','mapHigh'],
    ['spo2Low','spo2High'],['etco2Low','etco2High'],['bisLow','bisHigh']]) {
    if (request[pair[0]] >= request[pair[1]]) throw Error('invalid-alarm-limit-order')
  }
  return structuredClone(request)
}
export function setV2AlarmDisplay(state,payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) ||
    Object.keys(payload).length!==2 || !allowedDisplay.has(payload.parameter) ||
    typeof payload.enabled !== 'boolean') throw Error('invalid-monitor-display')
  return {...state,display:{...displayed(state),[payload.parameter]:payload.enabled}}
}
export function setV2AlarmLimits(state,payload) {
  return {...state,alarmRuntime:{...state.alarmRuntime,limits:validateV2AlarmLimits(payload)}}
}
export function takeV2NibpMeasurement(state) {
  const monitor = projectAnaesthV2Monitor(state)
  const systolic = Math.round(monitor.systolicPressure)
  const diastolic = Math.round(monitor.diastolicPressure)
  const mean = Math.round(diastolic + (systolic-diastolic)/3)
  const l = limits(state)
  const reading = {systolic,diastolic,mean,measuredAtSimulationTime:state.actionRuntime.simulationTime}
  // Freeze the alarm outcome at completed measurement time. Limit changes
  // and subsequent continuous MAP changes must not retest this old reading.
  return {...state,alarmRuntime:{...state.alarmRuntime,
    nibpReading:reading,nibpLow:mean<l.mapLow,nibpHigh:mean>l.mapHigh}}
}
export function evaluateV2AnaesthAlarms(state) {
  const l=limits(state)
  const d=displayed(state)
  const m=projectAnaesthV2Monitor(state)
  const mean=m.diastolicPressure+(m.systolicPressure-m.diastolicPressure)/3
  const spo2=state.respiratoryRuntime?.spo2Percent
  const co2=state.respiratoryRuntime?.estimatedEtCo2MmHg
  const bis=state.monitorRuntime?.bisValue
  const organisedRhythm=m.rhythm!=='ventricular-fibrillation'&&m.rhythm!=='asystole'
  return [
    evaluation('heartRateLow','LOW HEART RATE',organisedRhythm&&m.heartRate<l.heartRateLow,'warning',d.heartRate),
    evaluation('heartRateHigh','HIGH HEART RATE',organisedRhythm&&m.heartRate>l.heartRateHigh,'warning',d.heartRate),
    evaluation('mapLow','LOW ARTERIAL PRESSURE',mean<l.mapLow,'critical',d.invasiveBloodPressure),
    evaluation('mapHigh','HIGH ARTERIAL PRESSURE',mean>l.mapHigh,'warning',d.invasiveBloodPressure),
    evaluation('nibpMapLow','LOW NIBP',state.alarmRuntime?.nibpLow,'critical',Boolean(state.alarmRuntime?.nibpReading)),
    evaluation('nibpMapHigh','HIGH NIBP',state.alarmRuntime?.nibpHigh,'warning',Boolean(state.alarmRuntime?.nibpReading)),
    evaluation('spo2Low','LOW SpO₂',spo2!=null&&spo2<l.spo2Low,'critical',d.spo2&&spo2!=null),
    evaluation('spo2High','HIGH SpO₂',spo2!=null&&spo2>l.spo2High,'warning',d.spo2&&spo2!=null),
    evaluation('etco2Low','LOW EtCO₂',co2!=null&&co2<l.etco2Low,'critical',d.capnography&&co2!=null),
    evaluation('etco2High','HIGH EtCO₂',co2!=null&&co2>l.etco2High,'warning',d.capnography&&co2!=null),
    evaluation('bisLow','LOW BIS',bis!=null&&bis<l.bisLow,'warning',d.bis&&bis!=null),
    evaluation('bisHigh','HIGH BIS',bis!=null&&bis>l.bisHigh,'warning',d.bis&&bis!=null),
    evaluation('vf','VENTRICULAR FIBRILLATION',m.rhythm==='ventricular-fibrillation','critical',d.heartRate,true),
    evaluation('asystole','ASYSTOLE',m.rhythm==='asystole','critical',d.heartRate,true),
  ]
}
export function withV2AlarmEvaluations(state) {
  const current=state.alarmRuntime ?? {}
  const simulatedNow=state.actionRuntime?.simulationTime ?? 0
  const silencedUntilSimulationTime=current.silencedUntilSimulationTime ?? 0
  return {...state,alarmRuntime:{...current,limits:limits(state),
    silencedUntilSimulationTime,
    silenced:silencedUntilSimulationTime>simulatedNow,
    evaluations:evaluateV2AnaesthAlarms(state)}}
}
