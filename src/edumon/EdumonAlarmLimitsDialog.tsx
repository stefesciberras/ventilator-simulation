import { SharedAlarmLimitsDialog, type SharedAlarmLimitPairDefinition } from '../alarms/SharedAlarmLimits'
import type { EdumonAlarmLimits } from './alarmDefinitions'
interface Props{open:boolean;limits:EdumonAlarmLimits;disabled?:boolean;contained?:boolean;onChange:(limits:EdumonAlarmLimits)=>void;onClose:()=>void}
const DEFINITIONS:SharedAlarmLimitPairDefinition<EdumonAlarmLimits>[]=[{id:'heart-rate',label:'Heart rate',unit:'bpm',min:20,max:250,step:1,lowKey:'heartRateLow',highKey:'heartRateHigh'},{id:'map',label:'MAP',unit:'mmHg',min:20,max:180,step:1,lowKey:'mapLow',highKey:'mapHigh'},{id:'spo2',label:'SpO₂',unit:'%',min:50,max:100,step:1,lowKey:'spo2Low',highKey:'spo2High'}]
export function EdumonAlarmLimitsDialog({open,limits,disabled=false,contained=false,onChange,onClose}:Props){return <SharedAlarmLimitsDialog open={open} values={limits} definitions={DEFINITIONS} disabled={disabled} contained={contained} onChange={onChange} onClose={onClose}/>}
