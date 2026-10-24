# EDUMON actions and effects — instructor guide

> Maintenance contract: keep this guide updated whenever the action/effect vocabulary, runtime behaviour, physiology interpretation, seeded Drugs/Events, drug/event grouping, long-press controls, persistence model, timing semantics or relevant file locations change.

## Central rule

**Actions describe effects; physiology interprets effects.**

Buttons activate declarative effects. They must not directly mutate displayed monitor values or waveform pixels. EDUMON physiology and monitor modules interpret the active effects and derive haemodynamics, ventilation, TOF, BIS and waveforms.

## Action groups

### Drugs
- **Anaesthesia** — Propofol, Fentanyl, Remifentanil infusion, Relaxant, Neostigmine, Sugammadex, TIVA.
- **Cardiovascular** — Atropine, Ephedrine, Phenylephrine, Noradrenaline infusion, Adrenaline infusion.

### Events
- **Anaesthesia** — Induction, Maintenance, Awakening, Laryngoscopy, Pain, Surgery.
- **Cardiovascular** — Hypertension, Hypotension, Tachycardia, Bradycardia, Hypovolaemia, Bleeding.
- **Respiratory** — Apnoea, Return of diaphragm breathing, Bronchospasm.

These subclasses are presentation/taxonomy. The underlying rows remain ordinary `ActionDefinition` objects.

## Momentary and toggle actions

- **momentary** — onset, finite duration, then recovery.
- **toggle** — onset, stays active indefinitely until switched off, then follows recovery.

All timing uses simulation time.

## Long-press levels

Two generic long-press controls use the same runtime intensity mechanism:

- `dose-levels` — adjustable infusion dose/intensity;
- `severity-levels` — adjustable event severity.

Both offer:
- Low = 0.65 × base intensity
- Medium = 1.0 × base intensity
- High = 1.35 × base intensity

The button shows L/M/H. A running toggle can change level without stopping or restarting its onset timer.

For offsets, intensity scales the offset. For multipliers, intensity scales the distance from neutral 1.0. For target/set operations, intensity scales interpolation weight.

## Current validated effect targets

- `haemodynamics.heartRate`
- `haemodynamics.meanArterialPressure`
- `respiration.drive`
- `respiration.airwayObstruction`
- `neuromuscular.block`
- `neuromuscular.tofMinimumCount`
- `anaesthesia.hypnoticEffect`
- `anaesthesia.nociceptiveResponse`
- `stimulus.sympathetic`

Operations remain `offset`, `set`, `multiplier`, `target`, `increment`, `trigger`.

## New Cardiovascular Events

### Hypertension / Hypotension
Toggle sustained MAP offsets. These are direct teaching-state disturbances, independent of a specific cause.

### Tachycardia / Bradycardia
Toggle sustained HR offsets.

### Hypovolaemia
A toggle event with `severity-levels`. The current surrogate lowers MAP and raises HR. It does not yet model an explicit circulating-volume compartment, so this should be treated as a haemodynamic teaching approximation.

### Bleeding
A toggle event with `severity-levels`. The current surrogate produces a somewhat stronger hypotensive/tachycardic effect than Hypovolaemia. It does not yet accumulate actual blood-volume loss; future volume-state physiology can replace this approximation without changing the ActionDefinition pattern.

## New Respiratory Events

### Apnoea
A toggle event acting through `respiration.drive = 0`. Switching it off allows respiratory drive to recover rather than directly redrawing or hiding the capnogram.

### Return of diaphragm breathing
A momentary event representing return of spontaneous diaphragmatic effort after reversal. It:
- targets `respiration.drive` toward 1;
- targets `neuromuscular.tofMinimumCount` to at least 1 for the active interval.

TOF measurement is now derived from current `neuromuscular.block` rather than remaining fixed at 4/1.0. The minimum-count effect guarantees at least one response while allowing better recovery to display 2–4 responses.

### Bronchospasm
A toggle event with `severity-levels` acting through `respiration.airwayObstruction`.

EDUMON physiology converts that obstruction into increased expiratory airway resistance. The capnogram already derives its expiratory shape from resistance/compliance time constants, so progressively severe Bronchospasm naturally produces a more obstructive/shark-fin CO₂ waveform. The event itself does not draw a waveform.

## Existing anaesthesia composition

Surgery/Laryngoscopy/Pain produce `stimulus.sympathetic`. Opioids lower `anaesthesia.nociceptiveResponse`. Effective anaesthetic depth attenuates stimulus response. The raw composed response is then passed through the shared saturating sympathetic transfer function before HR/MAP translation.

Propofol/TIVA use `anaesthesia.hypnoticEffect`. Relaxant and reversal agents use `neuromuscular.block`.

## Editing and persistence

Permanent instructors can edit the shared action library via `/actions`. Persistent rows are stored in `public.edusim_action_definitions`; local fallback definitions remain in `src/edumon/EdumonActionsPanel.tsx`.

Changing existing magnitudes/timings/group members is usually data work. New physiological concepts require a validated target plus physiology/monitor interpretation.

## Architecture reference

- `src/edusim/actions/ActionEffect.ts` — validated targets/operations.
- `src/edusim/actions/ActionRuntime.ts` — simulation-time ActiveEffects, toggles, recovery, intensity.
- `src/edumon/EdumonActionsPanel.tsx` — grouping and generic dose/severity UI.
- `src/edumon/actionPhysiology.ts` — haemodynamic, respiratory obstruction and TOF-related interpretation.
- `src/edumon/EdumonAnaGasControl.tsx` — TOF measurement derived from neuromuscular state.
- `src/edumon/EdumonCapnographySurface.tsx` — capnogram shape derived from respiratory mechanics.
- `supabase/migrations/` — persistent action definitions.

## Simulation-design caution

EDUMON is an educational simulator. Current effect magnitudes, onset/recovery values, dose/severity multipliers, volume-loss surrogates and TOF mapping are configurable teaching approximations rather than fixed clinical-dose claims or a validated patient model.
