# EDUMON actions/effects — prompt for AI coding agents

> Maintenance contract: update this prompt whenever action/effect vocabulary, runtime semantics, physiology interpretation, persistence, seeded actions, grouping, long-press controls, priority/constraint semantics, timing or relevant file locations change.

Use this prompt when modifying EDUSIM/EDUMON Drugs, Events or physiological responses.

## Non-negotiable architecture

**Actions describe effects; physiology interprets effects.**

Never make a Drug/Event button directly mutate monitor values, respiratory traces, BIS, TOF or waveform pixels. Buttons activate `ActionDefinition`; `ActionRuntime` creates simulation-time `ActiveEffect` instances; EDUMON physiology/monitor code interprets those effects.

## Core files

- `src/edusim/actions/ActionEffect.ts` — validated targets/operations, priority, constraint vocabulary and release behaviour.
- `src/edusim/actions/ActionRuntime.ts` — priority ordering, constraint resolution, momentary/toggle timing, recover/persist release, stacking, adjustable intensity and target supersession.
- `src/action-editor/ActionEditorApp.tsx` — permanent-instructor editing of action priority, per-effect priority and constraints.
- `src/edumon/EdumonActionsPanel.tsx` — fallback definitions, Drug/Event subclasses, generic long-press level UI and runtime-derived toggle state.
- `src/edumon/actionPhysiology.ts` — EDUMON-specific interpretation.
- `src/edumon/EdumonWorkspacePanel.tsx` — displays current action-aware values; direct instructor edits supersede the corresponding action target.
- `src/edumon/monitorEngine.ts` — rhythm constraints, waveforms and measurements.
- `src/edumon/EdumonAnaGasControl.tsx` — TOF measurement derived from neuromuscular state.
- `src/edumon/EdumonCapnographySurface.tsx` — CO₂ waveform derived from respiratory mechanics.
- `supabase/migrations/` — persistent definitions/schema.

## Current targets

- `haemodynamics.heartRate`
- `haemodynamics.meanArterialPressure`
- `respiration.drive`
- `respiration.airwayObstruction`
- `neuromuscular.block`
- `neuromuscular.tofMinimumCount`
- `anaesthesia.hypnoticEffect`
- `anaesthesia.nociceptiveResponse`
- `stimulus.sympathetic`

Operations: `offset`, `set`, `multiplier`, `target`, `increment`, `constraint`, `trigger`.

## Priority semantics

Every action has a default priority. Persisted definitions use `public.edusim_action_definitions.priority`; ordinary/default priority is **30**. Each effect may optionally specify its own JSON `priority`, which overrides the action priority for that target effect.

Resolver rules for effects on the same target:

1. Lower priority resolves first.
2. Higher priority resolves later.
3. At equal priority, ordinary numerical operations resolve before `constraint`, so a same-level constraint acts on the composed ordinary result.
4. A still-higher-priority ordinary effect can act after a lower-priority constraint.
5. Manual instructor control is outside/above numeric priority. `supersedeActionTarget(...)` removes all action ownership of that target and the caller commits the instructor-selected value.

Do not treat priority as globally cancelling lower-priority actions. It is target-specific resolution order. If Hypovolaemia owns HR and MAP but a higher-priority HR constraint suppresses its tachycardia, its MAP effect must continue normally.

## Constraint semantics

`operation: 'constraint'` requires one of:

- `block-increase` — suppress positive deviation above the patient reference/base value.
- `block-decrease` — suppress negative deviation below the reference/base value.
- `minimum` — constrain toward/not below `effect.value`.
- `maximum` — constrain toward/not above `effect.value`.

Constraint strength follows onset/recovery weight and intensity. Do not fake blockade as a large opposite offset; that produces paradoxical bradycardia/hypotension interactions instead of suppressing the intended response.

### Beta blocker reference implementation

`beta-blocker` is a cardiovascular **Drug** toggle, setting `all`, priority **70**, with:

- target `haemodynamics.heartRate`
- operation `constraint`
- constraint `block-increase`

Thus ordinary priority-30 Hypovolaemia still lowers MAP, but its +HR response is suppressed toward the patient's reference HR. Beta blocker does not itself manufacture bradycardia. A lower-priority negative HR effect can remain. Manual HR change supersedes the beta-blocker HR constraint and all other HR actions, while unrelated targets continue.

Use this as the model for future receptor blockade, conduction disease, pacing and other dominant target-specific physiology. Do not encode such interactions by naming other actions in click handlers.

## Timing and release

Momentary: onset -> finite duration -> recovery.

Toggle: onset -> sustained indefinitely -> switch-off -> effect-specific release behaviour.

`releaseBehaviour` is optional per effect and normalizes to `recover`:
- `recover`: decay the remaining contribution over `recoverySeconds`.
- `persist`: retain the contribution after the toggle is stopped until that target is explicitly superseded/changed.

Do not implement persist by applying an opposite or duplicate numerical mutation. Runtime weight owns the retained contribution. Hypovolaemia and Bleeding currently persist their HR/MAP surrogate consequences.

All timing uses simulation time.

## Toggle UI state

For toggle actions, `ActionRuntime` is the source of truth for ON/OFF state. Do not maintain a separate component-local toggle set in `EdumonActionsPanel`; tab/view remounts would lose it and visually desynchronise the button from physiology.

Derive coloured/pressed state from running toggle `ActiveEffect` instances. For adjustable toggles, derive the active L/M/H badge from runtime intensity. A separate retained level preference may be used only for the next start of an inactive action.

## Current-value controls and instructor ownership

Action-aware sliders display the value returned by `applyEdumonActionPhysiology(...)`.

**Do not reintroduce inverse-baseline fine tuning.** When an instructor directly edits a model-driven control:

1. call `supersedeActionTarget(...)` for that target;
2. commit the selected current value to patient state;
3. leave unrelated targets from the same action running.

For HR, manual HR or rhythm selection supersedes `haemodynamics.heartRate`. For SBP/DBP, direct pressure editing supersedes `haemodynamics.meanArterialPressure`. For respiratory rate, the current implementation supersedes `respiration.drive`; introduce finer validated targets later rather than hidden inverse maths.

Rhythm is a higher-order physiological constraint: VF/asystole have no effective perfusing ventricular rate; VT/SVT/sinus-family rhythms constrain effective rate in `monitorEngine.ts`. Do not model VF as ordinary HR plus/minus Bradycardia.

## Adjustable level semantics

`dose-levels` and `severity-levels` both use `ActiveEffect.intensity`: Low 0.65, Medium 1.0, High 1.35. Changing a running toggle's level must use `setActionIntensity()` without restarting it.

For `offset`/`increment`, scale additive magnitude. For `multiplier`, scale distance from neutral 1.0. For `target`/`set`, scale interpolation weight. For `constraint`, scale the degree to which the constraint removes/prevents the disallowed deviation.

## Cardiovascular Events

- `hypertension` — toggle MAP increase.
- `hypotension` — toggle MAP decrease.
- `tachycardia` — toggle HR increase.
- `bradycardia` — toggle HR decrease.
- `hypovolaemia` — severity toggle; MAP down + HR up surrogate; release persists.
- `bleeding` — severity toggle; MAP down + HR up surrogate; release persists.

Hypovolaemia and Bleeding do not yet modify an explicit blood-volume compartment. Future work should model circulating volume/preload/CO and bleeding rate rather than extending the surrogate indefinitely.

## Cardiovascular Drugs

- `beta-blocker` — priority-70 HR `block-increase` constraint.

## Respiratory Events

- **Apnoea** uses `respiration.drive = 0`.
- **Return of diaphragm breathing** (`diaphragm-return`) targets respiratory drive toward 1 and TOF minimum count toward 1.
- **Bronchospasm** uses `respiration.airwayObstruction`, interpreted as increased expiratory resistance.

Capnography must remain derived from mechanics.

## Existing anaesthesia composition

Surgery/Laryngoscopy/Pain create sympathetic stimulus. Opioids alter nociceptive response. Effective anaesthetic depth attenuates response. Shared saturation limits excessive sympathetic response. Propofol/TIVA use hypnotic effect; Relaxant/reversal agents use neuromuscular block.

## Persistence/editor rules

`public.edusim_action_definitions.priority` is the action-level default. Per-effect `priority`, `constraint` and `releaseBehaviour` remain inside each effect object in `effects` JSONB. The `/actions` editor must preserve and expose these semantics. Existing rows without explicit priority behave as priority 30.

The editor-facing setting choice is **Anaesthesia** while the stored compatibility key remains `ana` (`ana | itu | all`).

## Change checklist

1. Inspect current implementation.
2. Prefer existing declarative targets.
3. If a new concept is needed, add a validated target and physiology consumer.
4. Add a new Supabase migration; never rewrite deployed migrations.
5. Keep fallback definitions aligned with persisted definitions.
6. Preserve momentary/toggle semantics and simulation time.
7. Use generic `dose-levels` / `severity-levels`, not drug/event-specific menus.
8. Keep physiology out of action click handlers.
9. Use priority + constraints for dominant target-specific interactions; do not simulate blockade with arbitrary opposite offsets.
10. Derive toggle active state from `ActionRuntime`; never duplicate runtime ON/OFF truth in local UI state.
11. Never reconstruct hidden baselines from current modelled values; use target ownership/supersession.
12. Keep manual instructor target supersession above the action priority system.
13. Treat rhythm constraints separately from ordinary HR actions.
14. Update regression coverage.
15. Update both documentation files.
16. Bump EDUMON version.
17. Run full CI and merge only when green.

## Review checklist

Confirm that priority defaults to 30, higher priority resolves later, same-priority constraints resolve after ordinary modifiers, Beta blocker is a cardiovascular Drug and suppresses positive chronotropy without cancelling Hypovolaemia MAP effect or creating bradycardia, manual control supersedes all action effects on that target, toggle state derives from runtime, recover/persist remains backward-compatible, persistent/fallback definitions agree, the action editor preserves priority/constraint metadata, the Anaesthesia setting label does not change the stored `ana` key, docs are current, and build/regressions pass.
