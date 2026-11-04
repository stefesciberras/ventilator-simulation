import { resolveNumericActionEffect } from '../edusim/actions/ActionRuntime'
import {
  applySharedEdumonActionPhysiology,
  saturatingSympatheticResponse,
} from './sharedActionPhysiology.mjs'
import type { MonitorPatientState } from './types'

// The established v1 ActionRuntime remains the source of active effects. The
// pure physiology is shared with Session Engine v2, but global mutable runtime
// state is never handed to the cloud authority.
export { saturatingSympatheticResponse }

export function applyEdumonActionPhysiology(state: MonitorPatientState, simulationTime: number): MonitorPatientState {
  return applySharedEdumonActionPhysiology(state, (target, base) =>
    resolveNumericActionEffect(target, base, simulationTime))
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

export function currentNeuromuscularBlock(simulationTime: number): number {
  return clamp(resolveNumericActionEffect('neuromuscular.block', 0, simulationTime), 0, 1)
}

export function currentTofMinimumCount(simulationTime: number): number {
  return clamp(resolveNumericActionEffect('neuromuscular.tofMinimumCount', 0, simulationTime), 0, 4)
}

export function currentAirwayObstruction(simulationTime: number): number {
  return clamp(resolveNumericActionEffect('respiration.airwayObstruction', 0, simulationTime), 0, 1)
}

export function currentNociceptiveResponse(simulationTime: number): number {
  return Math.max(0, resolveNumericActionEffect('anaesthesia.nociceptiveResponse', 1, simulationTime))
}

export function currentSympatheticStimulus(simulationTime: number): number {
  return Math.max(0, resolveNumericActionEffect('stimulus.sympathetic', 0, simulationTime))
}
