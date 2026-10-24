# EDUMON actions and effects — instructor guide

> Maintenance contract: keep this guide updated whenever the action/effect vocabulary, runtime behaviour, physiology interpretation, seeded Drugs/Events, drug/event grouping, long-press controls, persistence model, priority/constraint semantics, timing semantics or relevant file locations change.

## Central rule

**Actions describe effects; physiology interprets effects.**

Buttons activate declarative effects. They must not directly mutate displayed monitor values or waveform pixels. EDUMON physiology and monitor modules interpret the active effects and derive haemodynamics, ventilation, TOF, BIS and waveforms.

## Action groups

### Drugs
- **Anaesthesia** — Propofol, Fentanyl, Remifentanil infusion, Relaxant, Neostigmine, Sugammadex, TIVA.
- **Cardiovascular** — Atropine, Ephedrine, Phenylephrine, Noradrenaline infusion, Adrenaline infusion, Beta blocker.

### Events
- **Anaesthesia** — Induction, Maintenance, Awakening, Laryngoscopy, Pain, Surgery.
- **Cardiovascular** — Hypertension, Hypotension, Tachycardia, Bradycardia, Hypovolaemia, Bleeding.
- **Respiratory** — Apnoea, Return of diaphragm breathing, Bronchospasm.

These subclasses are presentation/taxonomy. The underlying rows remain ordinary `ActionDefinition` objects.

## Momentary and toggle actions

- **momentary** — onset, finite duration, then recovery.
- **toggle** — onset, stays active indefinitely until switched off, then follows the effect's release behaviour.

All timing uses simulation time.

### Toggle UI state

For toggle actions, `ActionRuntime` is the source of truth for whether the action is ON. The ACTIONS panel derives the coloured/pressed state from currently running toggle `ActiveEffect` instances, rather than keeping a separate component-local boolean set. This means an active Bradycardia, Surgery, infusion, Apnoea, Bronchospasm, Beta blocker, etc. remains visibly active after changing tabs/views and returning to ACTIONS.

For adjustable toggles, the active L/M/H badge is reconstructed from the running effect's `intensity`. The most recently selected inactive level is retained separately only as the instructor's next-start preference; it does not determine whether an action is active.

### Release behaviour

Each effect may define `releaseBehaviour`:

- `recover` — default. When a toggle is stopped, the remaining contribution decays to zero over `recoverySeconds`.
- `persist` — stopping the toggle does not reverse that effect. Its contribution remains until physiology is explicitly changed/superseded.

This is defined per effect, not per action, so one action may recover one target while leaving another physiological consequence behind. Hypovolaemia and Bleeding currently use `persist` for their haemodynamic surrogate effects: stopping the event does not magically restore the volume deficit. Definitions without the field remain backward-compatible and recover.

## Priority and constraints

EDUMON now resolves competing effects on the same target by **priority**. This is deliberately separate from action intensity and release behaviour.

- Ordinary actions default to priority **30**.
- `public.edusim_action_definitions.priority` stores the action's default priority.
- An individual effect may optionally specify a JSON `priority`; this overrides the action default for that effect only.
- Lower priority effects resolve first; higher priority effects resolve later and can constrain or override the lower-priority result.
- At the same priority, ordinary numerical modifiers resolve before a `constraint`, so the constraint wins at that level.
- A still-higher-priority ordinary effect may act after a lower-priority constraint. This allows future explicit rescue/dominant physiology without hard-coding action names.
- Manual instructor intervention is **outside and above** this numerical priority system. `supersedeActionTarget(...)` removes action ownership of that target and commits the instructor-selected value.

Priority is therefore not a universal "winner takes all" switch. It defines target-resolution order. Multi-target actions can retain different effects independently and may use different per-effect priorities.

### Constraint operation

The `constraint` operation represents a physiological limit rather than an additive drug/event effect. Current constraint types are:

- `block-increase` — progressively removes positive deviation above the current patient reference value.
- `block-decrease` — progressively removes negative deviation below the current patient reference value.
- `minimum` — prevents the resolved value falling below the constraint value.
- `maximum` — prevents the resolved value rising above the constraint value.

Constraint strength follows the normal onset/recovery weight and intensity. This allows a constraint to develop and recover rather than switching instantaneously unless its timing is configured that way.

### Beta blocker example

`Beta blocker` is a cardiovascular **Drug** toggle available to both EDUMON-Ana and EDUMON-ICU. It has priority **70** and applies a `block-increase` constraint to `haemodynamics.heartRate`.

Example:

- Patient HR 70, MAP normal.
- Hypovolaemia (priority 30) attempts MAP −20 and HR +15.
- Beta blocker (priority 70) suppresses the positive HR deviation, so HR remains approximately at the patient's reference HR while the hypotension remains.
- It does **not** create bradycardia: a pre-existing lower-priority negative HR effect is not removed by `block-increase`.
- If the instructor manually sets HR to 95, manual target ownership supersedes both the beta-blocker constraint and other active HR effects; unrelated MAP effects remain active.

This pattern is intended for future dominant physiological states such as conduction disease, pacing, receptor blockade and other target-specific interactions. Rhythm remains a separate higher-order physiological concept in `monitorEngine.ts`; do not use ordinary HR offsets to simulate VF/asystole.

## Long-press levels

Two generic long-press controls use the same runtime intensity mechanism:

- `dose-levels` — adjustable infusion dose/intensity;
- `severity-levels` — adjustable event severity.

Both offer Low = 0.65 ×, Medium = 1.0 × and High = 1.35 × base intensity. The button shows L/M/H. A running toggle can change level without stopping or restarting its onset timer.

For offsets, intensity scales the offset. For multipliers, intensity scales the distance from neutral 1.0. For target/set operations, intensity scales interpolation weight. For constraints, intensity scales constraint strength.

## Current-value controls and target ownership

Patient controls corresponding to action-modelled physiology show the **current modelled value**, including HR, systolic/diastolic pressure and spontaneous respiratory rate.

The old inverse-baseline behaviour has been removed. EDUMON no longer turns an instructor edit such as modelled HR 43 → 50 into a hidden baseline HR of 85. Instead, an explicit instructor edit **supersedes the active action target** and commits the selected current value as the patient value. Other targets from the same action continue running.

Examples:

- HR 78 + Bradycardia → 43. Instructor sets HR to 50: the active `haemodynamics.heartRate` modifier is superseded and current HR becomes 50.
- A MAP modifier affecting both displayed pressures is superseded when the instructor directly changes SBP or DBP; the currently modelled companion pressure is committed at the same time.
- Changing ECG rhythm supersedes action ownership of HR. Rhythm selection establishes the appropriate current ventricular-rate control value; VF/asystole still produce no effective perfusing rate in `monitorEngine.ts`.
- Direct respiratory-rate editing supersedes `respiration.drive` and commits the selected spontaneous rate. This remains intentionally coarse until respiratory drive is decomposed into finer independent output targets.

This is **target-level ownership**, not cancellation of the whole action. If an action modifies HR and MAP, taking manual control of HR must not cancel the MAP effect.

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

Operations are `offset`, `set`, `multiplier`, `target`, `increment`, `constraint`, `trigger`.

## Cardiovascular Events

### Hypertension / Hypotension
Toggle sustained MAP offsets. These are direct teaching-state disturbances, independent of a specific cause.

### Tachycardia / Bradycardia
Toggle sustained HR offsets. Manual HR or rhythm intervention supersedes the HR target rather than reverse-calculating a hidden baseline.

### Hypovolaemia
A toggle event with `severity-levels`. The current surrogate lowers MAP and raises HR. Both haemodynamic effects use `releaseBehaviour: persist`. Under Beta blocker, the HR rise may be suppressed while the MAP fall remains.

### Bleeding
A toggle event with `severity-levels`. The current surrogate produces a somewhat stronger hypotensive/tachycardic effect than Hypovolaemia and persists when the toggle is stopped. It does not yet accumulate actual blood-volume loss; future volume-state physiology should replace this approximation with bleeding rate plus circulating-volume state.

## Cardiovascular Drugs

### Beta blocker
A priority-70 toggle constraint that suppresses lower-priority positive chronotropic responses without directly applying a negative HR offset.

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

The editor exposes the action-level priority and optional per-effect priority override. Selecting `constraint` exposes the constraint type. Action priority is persisted in the table `priority` column; per-effect priority and constraint metadata live in the existing `effects` JSONB objects.

The editor-facing setting label is **Anaesthesia** while the stored compatibility key remains `ana` (`ana | itu | all`).

`releaseBehaviour` also lives inside each effect JSON object. Existing definitions without explicit priority behave as priority 30; definitions without `releaseBehaviour` recover normally.

Changing existing magnitudes/timings/group members is usually data work. New physiological concepts require a validated target plus physiology/monitor interpretation.

## Architecture reference

- `src/edusim/actions/ActionEffect.ts` — validated targets/operations, priority, constraints and `recover | persist` release vocabulary.
- `src/edusim/actions/ActionRuntime.ts` — simulation-time ActiveEffects, priority ordering, constraint resolution, toggles, release behaviour, intensity and target supersession.
- `src/action-editor/ActionEditorApp.tsx` — edits action priority, per-effect priority and constraint type.
- `src/edumon/EdumonActionsPanel.tsx` — grouping, seeded fallback actions, generic dose/severity UI and runtime-derived toggle/level display state.
- `src/edumon/actionPhysiology.ts` — haemodynamic, respiratory obstruction and TOF-related interpretation.
- `src/edumon/EdumonWorkspacePanel.tsx` — projects current modelled physiology into instructor sliders; direct edits supersede the corresponding action target.
- `src/edumon/monitorEngine.ts` — rhythm-specific effective ventricular-rate constraints and waveform/measurement generation.
- `src/edumon/EdumonAnaGasControl.tsx` — TOF measurement derived from neuromuscular state.
- `src/edumon/EdumonCapnographySurface.tsx` — capnogram shape derived from respiratory mechanics.
- `supabase/migrations/` — persistent action definitions and schema changes.

## Simulation-design caution

EDUMON is an educational simulator. Current effect magnitudes, priorities, constraint behavior, onset/recovery values, dose/severity multipliers, volume-loss surrogates and TOF mapping are configurable teaching approximations rather than fixed clinical-dose claims or a validated patient model.
