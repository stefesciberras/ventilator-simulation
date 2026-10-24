# EDUMON actions/effects — prompt for AI coding agents

> Maintenance contract: update this prompt whenever action/effect vocabulary, runtime semantics, physiology interpretation, persistence, seeded actions, grouping, long-press controls, timing or relevant file locations change.

Use this prompt when modifying EDUSIM/EDUMON Drugs, Events or physiological responses.

## Non-negotiable architecture

**Actions describe effects; physiology interprets effects.**

Never make a Drug/Event button directly mutate monitor values, respiratory traces, BIS, TOF or waveform pixels. Buttons activate `ActionDefinition`; `ActionRuntime` creates simulation-time `ActiveEffect` instances; EDUMON physiology/monitor code interprets those effects.

## Core files

- `src/edusim/actions/ActionEffect.ts` — validated targets/operations.
- `src/edusim/actions/ActionRuntime.ts` — momentary/toggle timing, recovery, stacking and adjustable intensity.
- `src/edumon/EdumonActionsPanel.tsx` — fallback definitions, Drug/Event subclasses, generic long-press level UI.
- `src/edumon/actionPhysiology.ts` — EDUMON-specific interpretation.
- `src/edumon/EdumonWorkspacePanel.tsx` — displays modelled action-aware control values and translates instructor fine tuning back to baseline controls.
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

## Grouping

Drugs:
- Anaesthesia
- Cardiovascular

Events:
- Anaesthesia
- Cardiovascular
- Respiratory

Grouping is presentation only; physiology stays declarative.

## Timing

Momentary: onset -> finite duration -> recovery.

Toggle: onset -> sustained indefinitely -> switch-off -> recovery.

All timing uses simulation time.

## Modelled-value control sliders

For physiological controls directly modified by actions, the instructor slider must display the value returned by `applyEdumonActionPhysiology(...)`, not the untouched baseline. Current action-aware sliders are HR, systolic/diastolic pressure and spontaneous respiratory rate.

Do not solve this by copying effective values into patient state every render: that would compound effects. When an instructor fine-tunes an affected additive haemodynamic control, translate the desired effective-value delta back to the baseline. For a non-zero multiplicative respiratory-drive effect, invert the current effective scale when changing the baseline respiratory rate. If an active hard `set` effect owns the value (for example Apnoea setting drive to zero), preserve the baseline until that action releases rather than fighting the effect or destroying the recovery baseline.

The purpose is that Bradycardia visibly moves the HR slider, Hypotension/Hypovolaemia/Bleeding move pressure sliders, and Apnoea moves respiratory rate to zero, while the declarative action architecture remains intact.

## Adjustable level semantics

Two generic long-press actions exist:

- `dose-levels` for adjustable infusions;
- `severity-levels` for adjustable clinical events.

Both use `ActiveEffect.intensity`:
- Low 0.65
- Medium 1.0
- High 1.35

Changing a running toggle's level must use `setActionIntensity()` without restarting it.

For `offset`/`increment`, scale additive magnitude. For `multiplier`, scale distance from neutral 1.0: `1 + (effect.value - 1) * weight * intensity`. For `target`/`set`, scale interpolation weight and clamp safely.

## Current Cardiovascular Events

- `hypertension` — toggle MAP increase.
- `hypotension` — toggle MAP decrease.
- `tachycardia` — toggle HR increase.
- `bradycardia` — toggle HR decrease.
- `hypovolaemia` — toggle with `severity-levels`; currently MAP down + HR up surrogate.
- `bleeding` — toggle with `severity-levels`; currently MAP down + HR up surrogate.

Hypovolaemia and Bleeding do not yet modify an explicit blood-volume compartment. Do not fake such a state in the UI; add a future validated physiology target/state when needed.

## Current Respiratory Events

### Apnoea
`apnoea` is a toggle using `respiration.drive` set to 0. Recovery occurs through the generic toggle recovery semantics.

### Return of diaphragm breathing
`diaphragm-return` is momentary and uses:
- `respiration.drive` target 1;
- `neuromuscular.tofMinimumCount` target 1.

TOF is derived from current `neuromuscular.block`; the minimum-count effect guarantees at least one response, not exactly one.

### Bronchospasm
`bronchospasm` is a toggle with `long_press_action = 'severity-levels'` and uses `respiration.airwayObstruction`.

`actionPhysiology.ts` interprets this as increased expiratory resistance. Capnography derives obstruction from resistance/compliance, so bronchospasm must change the CO₂ waveform through respiratory mechanics, never through button-specific waveform drawing.

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
8. Keep physiology out of click handlers.
9. Keep action-aware sliders projected from effective physiology without feeding effective values back recursively.
10. Update regression coverage.
11. Update both documentation files.
12. Bump EDUMON version.
13. Run full CI and merge only when green.

## Review checklist

Confirm that no button directly mutates monitor values, action-aware sliders display effective physiology without compounding it, no waveform is redrawn by an Event handler, persistent/fallback definitions agree, severity can change while toggles run, TOF derives from neuromuscular state, bronchospasm alters expiratory mechanics, docs are current, and build/regressions pass.
