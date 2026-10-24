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
- **toggle** — onset, stays active indefinitely until switched off, then follows the effect's release behaviour.

All timing uses simulation time.

### Release behaviour

Each effect may define `releaseBehaviour`:

- `recover` — default. When a toggle is stopped, the remaining contribution decays to zero over `recoverySeconds`.
- `persist` — stopping the toggle does not reverse that effect. Its contribution remains until physiology is explicitly changed/superseded.

This is defined per effect, not per action, so one action may recover one target while leaving another physiological consequence behind. Hypovolaemia and Bleeding currently use `persist` for their haemodynamic surrogate effects: stopping the event does not magically restore the volume deficit. Definitions without the field remain backward-compatible and recover.

## Long-press levels

Two generic long-press controls use the same runtime intensity mechanism:

- `dose-levels` — adjustable infusion dose/intensity;
- `severity-levels` — adjustable event severity.

Both offer Low = 0.65 ×, Medium = 1.0 × and High = 1.35 × base intensity. The button shows L/M/H. A running toggle can change level without stopping or restarting its onset timer.

For offsets, intensity scales the offset. For multipliers, intensity scales the distance from neutral 1.0. For target/set operations, intensity scales interpolation weight.

## Current-value controls and target ownership

Patient controls corresponding to action-modelled physiology show the **current modelled value**, including HR, systolic/diastolic pressure and spontaneous respiratory rate.

The old inverse-baseline behaviour has been removed. EDUMON no longer turns an instructor edit such as modelled HR 43 → 50 into a hidden baseline HR of 85. Instead, an explicit instructor edit **supersedes the active action target** and commits the selected current value as the patient value. Other targets from the same action continue running.

Examples:

- HR 78 + Bradycardia → 43. Instructor sets HR to 50: the active `haemodynamics.heartRate` modifier is superseded and current HR becomes 50. Turning Bradycardia off later cannot expose a hidden 85 bpm baseline.
- A MAP modifier affecting both displayed pressures is superseded when the instructor directly changes SBP or DBP; the currently modelled companion pressure is committed at the same time.
- Changing ECG rhythm supersedes action ownership of HR. Rhythm selection establishes the appropriate current ventricular-rate control value; VF/asystole still produce no effective perfusing rate in `monitorEngine.ts`.
- Direct respiratory-rate editing supersedes `respiration.drive` and commits the selected spontaneous rate. This is intentionally simple until respiratory drive is decomposed into finer independent output targets.

This is **target-level ownership**, not cancellation of the whole action. If a future event modifies HR and another parameter, taking manual control of HR must not cancel the other parameter's effect.

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

## Cardiovascular Events

### Hypertension / Hypotension
Toggle sustained MAP offsets. These are direct teaching-state disturbances, independent of a specific cause.

### Tachycardia / Bradycardia
Toggle sustained HR offsets. Manual HR or rhythm intervention supersedes the HR target rather than reverse-calculating a hidden baseline.

### Hypovolaemia
A toggle event with `severity-levels`. The current surrogate lowers MAP and raises HR. Both haemodynamic effects use `releaseBehaviour: persist`, because switching the event off should not automatically restore volume. It does not yet model an explicit circulating-volume compartment.

### Bleeding
A toggle event with `severity-levels`. The current surrogate produces a somewhat stronger hypotensive/tachycardic effect than Hypovolaemia and persists when the toggle is stopped. It does not yet accumulate actual blood-volume loss; future volume-state physiology should replace this approximation with bleeding rate plus circulating-volume state.

## Respiratory Events

### Apnoea
A toggle event acting through `respiration.drive = 0`. Switching it off normally allows respiratory drive to recover. A direct instructor respiratory-rate intervention supersedes that drive target.

### Return of diaphragm breathing
A momentary event representing return of spontaneous diaphragmatic effort after reversal. It targets `respiration.drive` toward 1 and `neuromuscular.tofMinimumCount` to at least 1 for the active interval.

TOF measurement is derived from current `neuromuscular.block`. The minimum-count effect guarantees at least one response while allowing better recovery to display 2–4 responses.

### Bronchospasm
A toggle event with `severity-levels` acting through `respiration.airwayObstruction`. EDUMON physiology converts obstruction into increased expiratory airway resistance; capnogram shape remains derived from mechanics rather than drawn directly by the event.

## Existing anaesthesia composition

Surgery/Laryngoscopy/Pain produce `stimulus.sympathetic`. Opioids lower `anaesthesia.nociceptiveResponse`. Effective anaesthetic depth attenuates stimulus response. The raw composed response is then passed through the shared saturating sympathetic transfer function before HR/MAP translation.

Propofol/TIVA use `anaesthesia.hypnoticEffect`. Relaxant and reversal agents use `neuromuscular.block`.

## Editing and persistence

Permanent instructors can edit the shared action library via `/actions`. Persistent rows are stored in `public.edusim_action_definitions`; local fallback definitions remain in `src/edumon/EdumonActionsPanel.tsx`.

`releaseBehaviour` lives inside each effect JSON object in the existing `effects` JSONB column; no new table column is required. Existing rows without it normalize to `recover`.

Changing existing magnitudes/timings/group members is usually data work. New physiological concepts require a validated target plus physiology/monitor interpretation.

## Architecture reference

- `src/edusim/actions/ActionEffect.ts` — validated targets/operations and `recover | persist` release vocabulary.
- `src/edusim/actions/ActionRuntime.ts` — simulation-time ActiveEffects, toggles, release behaviour, intensity and target supersession.
- `src/edumon/EdumonActionsPanel.tsx` — grouping and generic dose/severity UI.
- `src/edumon/actionPhysiology.ts` — haemodynamic, respiratory obstruction and TOF-related interpretation.
- `src/edumon/EdumonWorkspacePanel.tsx` — projects current modelled physiology into instructor sliders; direct edits supersede the corresponding action target and commit the selected current value.
- `src/edumon/monitorEngine.ts` — rhythm-specific effective ventricular-rate constraints and waveform/measurement generation.
- `src/edumon/EdumonAnaGasControl.tsx` — TOF measurement derived from neuromuscular state.
- `src/edumon/EdumonCapnographySurface.tsx` — capnogram shape derived from respiratory mechanics.
- `supabase/migrations/` — persistent action definitions.

## Simulation-design caution

EDUMON is an educational simulator. Current effect magnitudes, onset/recovery values, dose/severity multipliers, volume-loss surrogates and TOF mapping are configurable teaching approximations rather than fixed clinical-dose claims or a validated patient model.
