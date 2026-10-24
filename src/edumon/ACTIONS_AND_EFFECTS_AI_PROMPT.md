# EDUMON actions/effects — prompt for AI coding agents

> Maintenance contract: update this prompt whenever the action/effect vocabulary, runtime semantics, physiology interpretation, persistence model, seeded actions, drug grouping, dose controls, or relevant file locations change.

Use this prompt when asking an AI coding agent to add or edit EDUMON Drugs, Events or physiological responses.

---

You are modifying the EDUSIM/EDUMON action framework in `stefesciberras/ventilator-simulation`.

## Non-negotiable architecture

**Actions describe effects; physiology interprets effects.**

Never make a Drug/Event button directly mutate monitor values, waveforms, BIS, respiratory measurements or patient physiology. Buttons activate an `ActionDefinition`; `ActionRuntime` creates simulation-time `ActiveEffect` instances; EDUMON physiology consumes those effects.

## Current architecture

Core files:

- `src/edusim/actions/ActionEffect.ts` — validated target/operation vocabulary.
- `src/edusim/actions/ActionRuntime.ts` — momentary/toggle timing, recovery, adjustable action intensity, stacking and numeric resolution.
- `src/edumon/actionLibrary.ts` — Supabase persistence.
- `src/action-editor/ActionEditorApp.tsx` — instructor editor.
- `src/edumon/EdumonActionsPanel.tsx` — buttons, drug-class presentation, long-press dose selector and fallback actions.
- `src/edumon/actionPhysiology.ts` — EDUMON interpretation of generic effects.
- `src/edumon/anaestheticPhysiology.ts` — effective anaesthetic depth.
- `supabase/migrations/` — persistent seeded definitions/data migrations.
- `src/edumon/ACTIONS_AND_EFFECTS_GUIDE.md` — instructor-facing guide; keep synchronized.

Current targets:

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

## Drug classes

The monitor currently displays two Drug subclasses:

- **Anaesthesia** — existing anaesthetic drugs/actions.
- **Cardiovascular** — Atropine, Ephedrine, Phenylephrine and Noradrenaline infusion.

This grouping is presentation/taxonomy. It must not move physiological logic into the UI.

## Timing and toggle semantics

All effects use **simulation time**.

For `momentary` actions: onset -> duration -> recovery, and repeated presses may stack.

For `toggle` actions: first press starts the action, onset ramps to full effect, the effect remains indefinitely until the second press, and then recovery starts. `durationSeconds` does not terminate a running toggle.

## Infusion dose-level semantics

Infusions that support dose selection set:

`long_press_action = 'dose-levels'`

The normal short press remains start/stop. Long press opens a three-step selector:

- Low = intensity 0.65
- Medium = intensity 1.0 (default)
- High = intensity 1.35

Changing the level of an already-running infusion updates its active `ActiveEffect.intensity` without stopping/restarting the infusion.

Intensity is interpreted generically in `ActionRuntime`:

- `offset` / `increment`: scale the additive effect directly;
- `multiplier`: scale the distance from neutral 1.0, i.e. `1 + (effect.value - 1) * weight * intensity`;
- `target` / `set`: intensity scales the interpolation weight, clamped to 1;
- `trigger`: unchanged.

Do not scale multiplier values by simple multiplication (`effect.value * intensity`), because that makes suppressive multipliers behave backwards.

The Low/Medium/High steps are educational relative intensity levels, not clinical dosing units or a detailed PK/PD model.

## Existing composition rules

- Fentanyl and Remifentanil lower `anaesthesia.nociceptiveResponse`.
- Laryngoscopy, Pain and Surgery create `stimulus.sympathetic`.
- Raw sympathetic drive is `stimulus × nociceptive response × anaesthetic-depth response`, then passes through the shared saturating sympathetic transfer function.
- `anaesthesia.hypnoticEffect` deepens the effective anaesthetic depth used by BIS and stimulus attenuation.
- Propofol bolus and TIVA therefore share the hypnotic-depth pathway.
- Relaxant acts through `neuromuscular.block` rather than central drive.

## Current infusion actions

### Remifentanil

`remifentanil` is a toggle Drug with `long_press_action = 'dose-levels'`. Its base/Medium effects reduce nociceptive response and respiratory drive and modestly reduce HR.

### TIVA (Propofol TCI)

`tiva` is a toggle Drug with `long_press_action = 'dose-levels'`. Its base/Medium effects increase hypnotic effect, reduce respiratory drive and lower MAP. Do not add a separate TIVA-only BIS pathway.

### Noradrenaline

`noradrenaline` is a Cardiovascular toggle Drug with `long_press_action = 'dose-levels'`. Its base/Medium effects raise MAP and apply a small negative HR offset. It remains active until switched off, then recovers.

## Current Cardiovascular boluses

- `atropine` — positive HR offset.
- `ephedrine` — positive HR and MAP offsets.
- `phenylephrine` — positive MAP offset plus modest negative HR offset.

These are teaching-model responses rather than fixed clinical dose claims.

## When adding/editing a Drug or Event

1. Inspect current implementation first.
2. Use existing declarative targets where possible.
3. Add/update persistent Supabase definitions via a new migration; do not rewrite deployed migrations.
4. Keep fallback definitions aligned.
5. Put physiology in physiology/runtime layers, never in action button click handlers.
6. Choose momentary versus toggle deliberately.
7. For adjustable infusions use the generic `dose-levels` long press and runtime intensity; do not create drug-specific dose UI logic.
8. Preserve multiplier-intensity mathematics around neutral 1.0.
9. Add/update regressions.
10. Update both documentation files.
11. Bump EDUMON version appropriately.
12. Run full CI and merge only when green.

## Review checklist

Confirm:
- no direct monitor mutation from buttons;
- no arbitrary target paths;
- fallback and persistent definitions agree;
- toggle actions sustain until stopped and recover after stop;
- Low/Medium/High can change while an infusion is running;
- multiplier dose scaling is relative to neutral 1.0;
- drug grouping is presentation-only;
- documentation and regressions are current;
- build passes.

If a requested feature cannot be represented cleanly with these abstractions, add the missing runtime/physiology abstraction rather than taking a UI shortcut.

---
