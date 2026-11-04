/**
 * Opt-in Session v2 Anaesth ActionEffect pilot.
 *
 * This is a PURE, checkpoint-derived physiology projection: NEVER mutate
 * the authoritative baseline patient when a drug is invoked. Effects are
 * stored as declarative ActiveEffects by the existing v2 evaluator.
 *
 * Pilot definitions mirror the initial v1 EDUMON Ana fallback action effects.
 * Not a Supabase action-library integration, dosing model or validated
 * clinical pharmacokinetic model.
 */
import { createAnaesthDeclarativeActionEvaluator } from './actionEffects.mjs'
import { applySharedEdumonActionPhysiology, sharedAnaestheticDepth } from '../../edumon/sharedActionPhysiology.mjs'
import { effectiveSevoDepth } from '../../edumon/sharedVolatilePhysiology.mjs'

const pilot = [
  {
    id: 'propofol', name: 'Propofol', kind: 'drug', setting: 'ana',
    short_press_action: 'momentary', candidate_access: 'allowed',
    effects: [
      { id: 'propofol-hypnotic-effect', target: 'anaesthesia.hypnoticEffect', operation: 'offset', value: 0.65, onsetSeconds: 25, durationSeconds: 180, recoverySeconds: 240 },
      { id: 'propofol-respiratory-drive', target: 'respiration.drive', operation: 'multiplier', value: 0.4, onsetSeconds: 20, durationSeconds: 150, recoverySeconds: 180 },
      { id: 'propofol-map', target: 'haemodynamics.meanArterialPressure', operation: 'offset', value: -15, onsetSeconds: 20, durationSeconds: 180, recoverySeconds: 180 },
    ],
  },
  {
    id: 'fentanyl', name: 'Fentanyl', kind: 'drug', setting: 'ana',
    short_press_action: 'momentary', candidate_access: 'allowed',
    effects: [
      { id: 'fentanyl-heart-rate', target: 'haemodynamics.heartRate', operation: 'offset', value: -6, onsetSeconds: 15, durationSeconds: 180, recoverySeconds: 120 },
      { id: 'fentanyl-respiratory-drive', target: 'respiration.drive', operation: 'multiplier', value: 0.75, onsetSeconds: 20, durationSeconds: 240, recoverySeconds: 180 },
      { id: 'fentanyl-nociceptive-response', target: 'anaesthesia.nociceptiveResponse', operation: 'multiplier', value: 0.55, onsetSeconds: 15, durationSeconds: 300, recoverySeconds: 180 },
    ],
  },
  {
    id: 'relaxant', name: 'Relaxant', kind: 'drug', setting: 'ana',
    short_press_action: 'momentary', candidate_access: 'allowed',
    effects: [
      { id: 'relaxant-neuromuscular-block', target: 'neuromuscular.block', operation: 'target', value: 1, onsetSeconds: 120, durationSeconds: 1200, recoverySeconds: 600 },
    ],
  },
]
export const getAnaesthV2PilotDefinitions = () => structuredClone(pilot)
const definitions = new Map(pilot.map(def => [def.id, Object.freeze(def)]))
export const anaesthV2PilotActionIds = Object.freeze([...definitions.keys()])
export const createAnaesthV2PilotEvaluator = () =>
  createAnaesthDeclarativeActionEvaluator({ getDefinition: id => definitions.get(id) ?? null })

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))
const finite = n => typeof n === 'number' && Number.isFinite(n)
function weight(active, now) {
  const effect = active.effect
  const onset = Math.max(0, effect.onsetSeconds)
  const recovery = Math.max(0, effect.recoverySeconds)
  const elapsed = Math.max(0, now - active.startedAtSimulationTime)
  if (active.mode === 'toggle') {
    const untilStop = t => onset > 0 ? clamp((t - active.startedAtSimulationTime) / onset, 0, 1) : 1
    if (active.stoppedAtSimulationTime == null || now <= active.stoppedAtSimulationTime) return untilStop(now)
    if (effect.releaseBehaviour === 'persist') return untilStop(active.stoppedAtSimulationTime)
    return recovery > 0 ? untilStop(active.stoppedAtSimulationTime) *
      clamp(1 - (now - active.stoppedAtSimulationTime) / recovery, 0, 1) : 0
  }
  if (onset > 0 && elapsed < onset) return clamp(elapsed / onset, 0, 1)
  const remaining = elapsed - onset - Math.max(0, effect.durationSeconds)
  if (remaining <= 0) return 1
  return recovery > 0 ? clamp(1 - remaining / recovery, 0, 1) : 0
}
export function resolveV2ActionNumber(runtime, target, base) {
  const now = runtime?.simulationTime
  if (!finite(now) || !Array.isArray(runtime?.activeEffects)) return base
  let value = base
  const candidates = runtime.activeEffects.filter(e => e?.effect?.target === target)
    .sort((a, b) => (a.effect.priority ?? 30) - (b.effect.priority ?? 30) ||
      Number(a.effect.operation === 'constraint') - Number(b.effect.operation === 'constraint') ||
      a.startedAtSimulationTime - b.startedAtSimulationTime || a.instanceId.localeCompare(b.instanceId))
  for (const active of candidates) {
    const w = weight(active, now)
    if (w <= 0) continue
    const e = active.effect
    const intensity = finite(active.intensity) ? Math.max(0, active.intensity) : 1
    switch (e.operation) {
      case 'offset': case 'increment': value += e.value * w * intensity; break
      case 'multiplier': value *= 1 + (e.value - 1) * w * intensity; break
      case 'set': case 'target': value += (e.value - value) * clamp(w * intensity, 0, 1); break
      case 'constraint': {
        // Match the existing ActionRuntime.applyConstraint() exactly,
        // including partial onset and intensity interpolation.
        const strength = clamp(w * intensity, 0, 1)
        if (e.constraint === 'minimum' && value < e.value) value += (e.value - value) * strength
        if (e.constraint === 'maximum' && value > e.value) value += (e.value - value) * strength
        if (e.constraint === 'block-increase') value -= Math.max(0, value - base) * strength
        if (e.constraint === 'block-decrease') value += Math.max(0, base - value) * strength
        break
      }
      // Trigger is evaluated by the target-specific physiology model, not a
      // numeric addition; this pilot does not support trigger projection.
      default: break
    }
  }
  return value
}

/**
 * v2 uses the exact same pure EDUMON haemodynamic, respiratory and
 * sympathetic physiology as v1. It resolves each effect from its own
 * canonical ActionRuntime, never from the browser's singleton.
 * This remains a modelled state projection, not full monitor/device parity.
 */
export function projectAnaesthV2Monitor(state) {
  const resolve = (target, base) => resolveV2ActionNumber(state.actionRuntime, target, base)
  // Agent-derived baseline depth and IV hypnotic effect compose once.
  // A missing gasRuntime (legacy/manual unit-test snapshot) preserves
  // its existing depth baseline until an authoritative tick upgrades it.
  const etSevo = state.gasRuntime?.etSevoPercent
  const baseline = etSevo == null ? state.patient : {
    ...state.patient,
    anaestheticPhysiology: {
      ...state.patient.anaestheticPhysiology,
      depthOfAnaesthesia: effectiveSevoDepth(
        etSevo, state.patient.anaestheticPhysiology?.anaestheticSensitivity ?? 0),
    },
  }
  const bounded = applySharedEdumonActionPhysiology(baseline, resolve)
  return {
    ...bounded,
    // v2 monitor values are a read-only projection of checkpointed oxygen
    // kinetics. Keep the original instructor-set SpO2 baseline unchanged.
    spo2: state.respiratoryRuntime?.spo2Percent ?? bounded.spo2,
    authoritativeV2Spo2: state.respiratoryRuntime?.spo2Percent ?? bounded.spo2,
    anaestheticPhysiology: {
      ...bounded.anaestheticPhysiology,
      depthOfAnaesthesia: sharedAnaestheticDepth(baseline, resolve),
    },
  }
}
