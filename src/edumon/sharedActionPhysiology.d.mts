import type { MonitorPatientState } from './types'
import type { EdusimActionEffectTarget } from '../edusim/actions/ActionEffect'
export type NumericActionResolver = (target: EdusimActionEffectTarget, base: number) => number
export declare const DEFAULT_RESPIRATORY_STATE: Readonly<import('./types').MonitorRespiratorySettings>
export declare function saturatingSympatheticResponse(response: number): number
export declare function sharedAnaestheticDepth(state: MonitorPatientState, resolve: NumericActionResolver): import('./types').AnaestheticDepth
export declare function applySharedEdumonBounds(state: MonitorPatientState): MonitorPatientState
export declare function applySharedEdumonActionPhysiology(state: MonitorPatientState, resolve: NumericActionResolver): MonitorPatientState
