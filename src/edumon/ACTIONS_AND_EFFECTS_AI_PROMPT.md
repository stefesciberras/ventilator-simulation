# EDUMON actions/effects — prompt for AI coding agents

> Maintenance contract: update this prompt whenever the action/effect vocabulary, runtime semantics, physiology interpretation, persistence model, seeded actions, or relevant file locations change.

Use this prompt when asking an AI coding agent to add or edit EDUMON Drugs, Events or physiological responses.

---

You are modifying the EDUSIM/EDUMON action framework in `stefesciberras/ventilator-simulation`.

## Non-negotiable architecture

**Actions describe effects; physiology interprets effects.**

Never make a Drug/Event button directly mutate monitor values, waveforms, BIS, respiratory measurements or patient physiology. Buttons only activate an `ActionDefinition`. The runtime creates simulation-time `ActiveEffect` instances. EDUMON physiology consumes those effects and derives patient/monitor behaviour.

Do not add logic of the form `if action === X then HR += ...` in UI code.

## Current architecture

Core files:

- `src/edusim/actions/ActionEffect.ts` — validated target/operation vocabulary and normalisation.
- `src/edusim/actions/ActionRuntime.ts` — simulation-time active effects, onset/duration/recovery, stacking and numeric effect resolution.
- `src/edumon/actionLibrary.ts` — Supabase persistence and definition loading/saving.
- `src/action-editor/ActionEditorApp.tsx` — instructor editor.
- `src/edumon/EdumonActionsPanel.tsx` — activates definitions and contains local fallback actions.
- `src/edumon/actionPhysiology.ts` — EDUMON-specific interpretation of generic effects.
- `src/edumon/anaestheticPhysiology.ts` — anaesthetic depth/sensitivity/response and effective action-driven depth.
- `src/edumon/respiratoryPhysiology.ts` — gas exchange/respiratory interpretation.
- `src/edumon/EdumonBisTrend.tsx` — BIS derived from effective anaesthetic depth.
- `supabase/migrations/` — persistent seeded definitions/data migrations.
- `src/edumon/ACTIONS_AND_EFFECTS_GUIDE.md` — instructor-facing explanation; update it when architecture or examples change.

Current effect targets:

- `haemodynamics.heartRate`
- `haemodynamics.meanArterialPressure`
- `respiration.drive`
- `neuromuscular.block`
- `anaesthesia.hypnoticEffect`
- `anaesthesia.nociceptiveResponse`
- `stimulus.sympathetic`

Current operations:

- `offset`
- `set`
- `multiplier`
- `target`
- `increment`
- `trigger`

Use only operations allowed for the chosen target in `ActionEffect.ts`. If the requested concept cannot be expressed with the validated vocabulary, add a proper new target and corresponding physiology interpretation rather than using arbitrary property paths or direct UI mutation.

## Timing semantics

Every effect has `onsetSeconds`, `durationSeconds`, and `recoverySeconds` and runs on **simulation time**, not wall-clock time. Onset is a ramp from zero to full effect; duration is full effect; recovery ramps back to zero. Effects pause with the simulation and follow simulation speed.

Momentary actions can create overlapping instances. Consider stacking semantics deliberately:

- offsets add;
- multipliers compound;
- target/set operations are order-sensitive and do not necessarily model repeated doses;
- clamp physiological quantities where appropriate in the interpreting physiology layer.

## Existing composition rules

Do not duplicate these in individual actions:

- Fentanyl lowers `anaesthesia.nociceptiveResponse`.
- Laryngoscopy/Pain/Surgical stimulus create `stimulus.sympathetic`.
- Sympathetic response is approximately `stimulus × nociceptive response × anaesthetic-depth response`.
- `anaesthesia.hypnoticEffect` deepens the same effective anaesthetic depth used by BIS and stimulus attenuation.
- Volatile anaesthesia and IV hypnotic actions therefore converge on one effective-depth concept.
- Relaxant acts through `neuromuscular.block`, not central respiratory drive.
- Mandatory mechanical ventilation should not disappear solely because respiratory drive or neuromuscular function is reduced.

## When adding/editing a Drug or Event

1. Inspect the current implementation before editing; do not rely on stale assumptions.
2. Decide whether the behaviour can be expressed with existing declarative targets.
3. Add/update the persistent Supabase definition via a new migration; do not rewrite previously deployed migrations.
4. Keep the local fallback definition in `EdumonActionsPanel.tsx` consistent with the seeded persistent definition.
5. Put physiological combination logic in EDUMON physiology modules, not in action buttons.
6. Ensure simulation-time behaviour, stacking and recovery are correct.
7. Update BIS/respiratory/haemodynamic/device consumers if the new physiological state should affect them.
8. Add or update regression checks.
9. Update both documentation files when the architecture, vocabulary, semantics or worked examples have changed:
   - `src/edumon/ACTIONS_AND_EFFECTS_GUIDE.md`
   - `src/edumon/ACTIONS_AND_EFFECTS_AI_PROMPT.md`
10. Bump the EDUMON version appropriately.
11. Run the full build/CI and merge only after it passes.

## Current Propofol example

Propofol is modelled as a generic momentary bolus with declarative effects:

- `anaesthesia.hypnoticEffect` → additive hypnotic burden;
- `respiration.drive` → multiplier below 1;
- `haemodynamics.meanArterialPressure` → negative offset.

Its hypnotic effect changes effective anaesthetic depth, which in turn affects BIS and stimulus-response attenuation. Do not create a separate Propofol-only BIS or stimulus pathway.

## Current Event example

Laryngoscopy should describe the stimulus, not the result. It therefore produces `stimulus.sympathetic`; physiology calculates HR/MAP response after accounting for opioid/nociceptive state and anaesthetic depth.

## Review checklist before finishing

Confirm all of the following:

- no direct monitor mutation from a button;
- no arbitrary/unvalidated target path;
- persistent and fallback definitions agree;
- timing uses simulation time;
- repeated administrations behave intentionally;
- physiology owns interpretation;
- relevant displays/alarms use effective physiology;
- documentation is still accurate;
- regression/build passes.

If any requested change conflicts with this architecture, preserve the architecture and implement the missing physiological abstraction instead of taking a UI shortcut.

---
