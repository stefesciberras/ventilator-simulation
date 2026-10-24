# EDUMON actions/effects — prompt for AI coding agents

> Maintenance contract: update this prompt whenever action/effect vocabulary, runtime semantics, physiology interpretation, persistence, seeded actions, grouping, long-press controls, timing or relevant file locations change.

Use this prompt when modifying EDUSIM/EDUMON Drugs, Events or physiological responses.

## Non-negotiable architecture

**Actions describe effects; physiology interprets effects.**

Never make a Drug/Event button directly mutate monitor values, respiratory traces, BIS, TOF or waveform pixels. Buttons activate `ActionDefinition`; `ActionRuntime` creates simulation-time `ActiveEffect` instances; EDUMON physiology/monitor code interprets those effects.

## Core files

- `src/edusim/actions/ActionEffect.ts` — validated targets/operations and release behaviour.
- `src/edusim/actions/ActionRuntime.ts` — momentary/toggle timing, recover/persist release, stacking, adjustable intensity and target supersession.
- `src/edumon/EdumonActionsPanel.tsx` — fallback definitions, Drug/Event subclasses, generic long-press level UI, and runtime-derived toggle state.
- `src/edumon/actionPhysiology.ts` — EDUMON-specific interpretation.
- `src/edumon/EdumonWorkspacePanel.tsx` — displays current action-aware values; direct instructor edits supersede the corresponding action target.
- `src/edumon/monitorEngine.ts` — rhythm constraints, waveforms and measurements.
- `src/edumon/EdumonAnaGasControl.tsx` — TOF measurement derived from neuromuscular state.
- `src/edumon/EdumonCapnographySurface.tsx` — CO₂ waveform derived from respiratory mechanics.
- `supabase/migrations/` — persistent definitions.

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

Operations: `offset`, `set`, `multiplier`, `target`, `increment`, `trigger`.

## Timing and release

Momentary: onset -> finite duration -> recovery.

Toggle: onset -> sustained indefinitely -> switch-off -> effect-specific release behaviour.

`releaseBehaviour` is optional per effect and normalizes to `recover`:
- `recover`: decay the remaining contribution over `recoverySeconds`.
- `persist`: retain the contribution after the toggle is stopped until that target is explicitly superseded/changed.

Do not implement persist by applying an opposite or duplicate numerical mutation. Runtime weight owns the retained contribution. Hypovolaemia and Bleeding currently persist their HR/MAP surrogate consequences.

All timing uses simulation time.

## Toggle UI state

For toggle actions, `ActionRuntime` is the source of truth for ON/OFF state. Do not maintain a separate component-local toggle set in `EdumonActionsPanel`; tab/view remounts would lose it and visually desynchronise the button from the physiology.

The ACTIONS panel should derive a toggle's coloured/pressed state from running toggle `ActiveEffect` instances (`mode === 'toggle'` and no `stoppedAtSimulationTime`). For adjustable toggles, derive the active L/M/H badge from the running effect's `intensity`. A separate retained level preference may be used only for the next start of an inactive action.

## Current-value controls and instructor ownership

Action-aware sliders display the value returned by `applyEdumonActionPhysiology(...)`. Current examples are HR, systolic/diastolic pressure and spontaneous respiratory rate.

**Do not reintroduce inverse-baseline fine tuning.** The previous approach could turn HR 78 -> Bradycardia 43 -> instructor 50 into a hidden baseline of 85, causing paradoxical tachycardia when the modifier changed.

The rule is now:

1. Show the current modelled value.
2. When the instructor directly edits a model-driven control, call `supersedeActionTarget(...)` for the owned target.
3. Commit the selected current value to patient state.
4. Do not cancel unrelated targets from the same action.

For HR, manual HR or rhythm selection supersedes `haemodynamics.heartRate`. For SBP/DBP, direct pressure editing supersedes `haemodynamics.meanArterialPressure` and commits the current companion pressure. For respiratory rate, the current implementation supersedes `respiration.drive`; if future respiratory effects need independent RR and tidal-volume ownership, introduce finer validated targets rather than hidden inverse maths.

Rhythm is a physiological constraint: VF/asystole have no effective perfusing ventricular rate; VT/SVT/sinus-family rhythms constrain effective rate in `monitorEngine.ts`. Do not model VF as ordinary HR plus/minus Bradycardia.

## Adjustable level semantics

`dose-levels` and `severity-levels` both use `ActiveEffect.intensity`: Low 0.65, Medium 1.0, High 1.35. Changing a running toggle's level must use `setActionIntensity()` without restarting it.

For `offset`/`increment`, scale additive magnitude. For `multiplier`, scale distance from neutral 1.0. For `target`/`set`, scale interpolation weight and clamp safely.

## Cardiovascular Events

- `hypertension` — toggle MAP increase.
- `hypotension` — toggle MAP decrease.
- `tachycardia` — toggle HR increase.
- `bradycardia` — toggle HR decrease.
- `hypovolaemia` — severity toggle; MAP down + HR up surrogate; release persists.
- `bleeding` — severity toggle; MAP down + HR up surrogate; release persists.

Hypovolaemia and Bleeding do not yet modify an explicit blood-volume compartment. Future work should model circulating volume/preload/CO and bleeding rate rather than extending the surrogate indefinitely.

## Respiratory Events

- **Apnoea** uses `respiration.drive = 0`.
- **Return of diaphragm breathing** (`diaphragm-return`) targets respiratory drive toward 1 and TOF minimum count toward 1.
- **Bronchospasm** uses `respiration.airwayObstruction`, interpreted as increased expiratory resistance.

Capnography must remain derived from mechanics.

## Existing anaesthesia composition

Surgery/Laryngoscopy/Pain create sympathetic stimulus. Opioids alter nociceptive response. Effective anaesthetic depth attenuates response. Shared saturation limits excessive sympathetic response. Propofol/TIVA use hypnotic effect; Relaxant/reversal agents use neuromuscular block.

## Change checklist

1. Inspect current implementation.
2. Prefer existing declarative targets.
3. If a new concept is needed, add a validated target and physiology consumer.
4. Add/update a new Supabase migration; never rewrite deployed migrations.
5. Keep fallback definitions aligned.
6. Preserve momentary/toggle semantics and simulation time.
7. Use generic `dose-levels` / `severity-levels`, not drug/event-specific menus.
8. Keep physiology out of action click handlers.
9. Derive toggle active state from `ActionRuntime`; never duplicate runtime ON/OFF truth in local UI state.
10. Never reconstruct hidden baselines from current modelled values; use explicit target ownership/supersession.
11. Treat rhythm constraints before ordinary monitor interpretation; do not let incompatible rhythms acquire nonsensical effective rates.
12. Update regression coverage.
13. Update both documentation files.
14. Bump EDUMON version.
15. Run full CI and merge only when green.

## Review checklist

Confirm that no action button directly mutates monitor values, toggle colour/pressed state survives tab/view remounts because it derives from the runtime, adjustable active levels derive from runtime intensity, manual model-driven edits supersede only the intended target, recover/persist semantics are explicit and backward-compatible, rhythm changes do not conflict with HR modifiers, no hidden inverse baseline is created, no waveform is redrawn by an Event handler, persistent/fallback definitions agree where applicable, docs are current, and build/regressions pass.
