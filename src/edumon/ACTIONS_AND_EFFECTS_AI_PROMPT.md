# EDUMON actions/effects — prompt for AI coding agents

> Maintenance contract: update this prompt whenever the action/effect vocabulary, runtime semantics, physiology interpretation, persistence model, seeded actions, or relevant file locations change.

Use this prompt when asking an AI coding agent to add or edit EDUMON Drugs, Events or physiological responses.

---

You are modifying the EDUSIM/EDUMON action framework in `stefesciberras/ventilator-simulation`.

## Non-negotiable architecture

**Actions describe effects; physiology interprets effects.**

Never make a Drug/Event button directly mutate monitor values, waveforms, BIS, respiratory measurements or patient physiology. Buttons only activate an `ActionDefinition`. The runtime creates simulation-time `ActiveEffect` instances. EDUMON physiology consumes those effects and derives patient/monitor behaviour.

## Current architecture

Core files:

- `src/edusim/actions/ActionEffect.ts` — validated target/operation vocabulary and normalisation.
- `src/edusim/actions/ActionRuntime.ts` — simulation-time active effects, momentary timing, sustained toggle state, recovery, stacking and numeric effect resolution.
- `src/edumon/actionLibrary.ts` — Supabase persistence and definition loading/saving.
- `src/action-editor/ActionEditorApp.tsx` — instructor editor.
- `src/edumon/EdumonActionsPanel.tsx` — activates definitions and contains local fallback actions.
- `src/edumon/actionPhysiology.ts` — EDUMON-specific interpretation of generic effects, including sympathetic-response saturation.
- `src/edumon/anaestheticPhysiology.ts` — anaesthetic depth/sensitivity/response and effective action-driven depth.
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

## Timing and toggle semantics

All effects run on **simulation time**, not wall-clock time.

For `momentary` actions:
- onset ramps from zero to full effect;
- duration is the full-effect interval;
- recovery ramps back to baseline;
- repeated presses create separate instances and may stack.

For `toggle` actions:
- the first press starts the action;
- onset ramps to full effect;
- after onset the effect remains fully active indefinitely while the toggle is on;
- `durationSeconds` does not stop a toggle effect;
- the second press marks the effect as stopped and starts its configured recovery ramp;
- do not delete toggle effects immediately on switch-off, because recovery is part of the physiology.

Use toggle for sustained infusions and sustained Events unless there is a better dedicated abstraction.

## Existing composition rules

Do not duplicate these in individual actions:

- Fentanyl and Remifentanil lower `anaesthesia.nociceptiveResponse`.
- Laryngoscopy, Pain and Surgery create `stimulus.sympathetic`.
- Surgery is a sustained toggle Event rather than a fixed-duration momentary event.
- Raw sympathetic drive is `stimulus × nociceptive response × anaesthetic-depth response`, then passes through the shared saturating sympathetic transfer function before HR/MAP effects are generated.
- `anaesthesia.hypnoticEffect` deepens the same effective anaesthetic depth used by BIS and stimulus attenuation.
- Propofol bolus and TIVA (Propofol TCI) therefore share the same hypnotic-depth pathway.
- TIVA is currently a teaching surrogate for maintained Propofol TCI effect, not a detailed Marsh/Schnider/Eleveld or pump model.
- Remifentanil infusion is currently a teaching surrogate with rapid onset/recovery, not a detailed PK/PD model.
- Relaxant acts through `neuromuscular.block`, not central respiratory drive.

## Current sustained actions

### Remifentanil infusion

`remifentanil` is a `toggle` Drug using:
- `anaesthesia.nociceptiveResponse` multiplier below 1;
- `respiration.drive` multiplier below 1;
- modest negative `haemodynamics.heartRate` offset.

### TIVA (Propofol TCI)

`tiva` is a `toggle` Drug using:
- positive `anaesthesia.hypnoticEffect` offset;
- reduced `respiration.drive`;
- negative MAP offset.

Do not create a separate TIVA-only BIS or stimulus pathway.

### Surgery

`surgery` is a `toggle` Event using sustained `stimulus.sympathetic`. It remains active for the instructor-controlled duration of surgery, then decays over recovery after switch-off.

## When adding/editing a Drug or Event

1. Inspect the current implementation before editing.
2. Decide whether the behaviour can be expressed with existing declarative targets.
3. Add/update the persistent Supabase definition via a new migration; do not rewrite previously deployed migrations.
4. Keep the local fallback definition in `EdumonActionsPanel.tsx` consistent with the persistent definition.
5. Put physiological combination logic and transfer functions in EDUMON physiology modules, not in action buttons.
6. Deliberately choose `momentary` versus `toggle` semantics.
7. Ensure onset, indefinite toggle sustain, switch-off recovery, stacking and simulation-time behaviour are correct.
8. Add or update regression checks.
9. Update both documentation files when architecture, semantics or examples change.
10. Bump the EDUMON version appropriately.
11. Run full CI and merge only when green.

## Review checklist

Confirm:
- no direct monitor mutation from a button;
- no arbitrary/unvalidated target path;
- persistent and fallback definitions agree;
- toggle actions sustain until stopped and recover after stop;
- momentary actions retain finite onset/duration/recovery behaviour;
- physiology owns interpretation and saturation;
- documentation is current;
- regression/build passes.

If a requested change cannot be represented cleanly with the current abstractions, add the missing physiological/runtime abstraction rather than taking a UI shortcut.

---
