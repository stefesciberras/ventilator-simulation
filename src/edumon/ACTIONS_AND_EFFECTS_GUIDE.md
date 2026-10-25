# EDUMON actions and effects — instructor guide

> Maintenance contract: keep this guide updated whenever action/effect vocabulary, runtime behaviour, physiology interpretation, seeded Drugs/Events, grouping, persistence, priority/constraint semantics, physiological hard bounds, diagnostics, timing semantics, display-control semantics or relevant file locations change.

## Central rule

**Actions describe effects; physiology interprets effects.** Buttons activate declarative effects; they must not directly mutate monitor values or waveform pixels.

Display-only actions are a deliberate exception to the physiology path: they control monitor presentation only and must never change the patient model.

## Action groups

### Drugs
- **Anaesthesia** — Propofol, Fentanyl, Remifentanil infusion, Relaxant, Neostigmine, Sugammadex, TIVA.
- **Cardiovascular** — Atropine, Ephedrine, Phenylephrine, Noradrenaline infusion, Adrenaline infusion, Beta blocker.
- **Others** — Antibiotics and future miscellaneous drugs used primarily for scenario actions/logging.

`Antibiotics` is deliberately a **no-op Drug**: it has `effects: []`, so it produces no physiological change. Pressing it still goes through `ActionRuntime` and records an activation entry with simulation time, action ID/name and kind.

### Events
- **Anaesthesia** — Induction, Maintenance, Awakening, Laryngoscopy, Pain, Surgery.
- **Cardiovascular** — Hypertension, Hypotension, Tachycardia, Bradycardia, Hypovolaemia, Bleeding.
- **Respiratory** — Apnoea, Curare Cleft, Bronchospasm.
- **Monitors** — Inv BP, BIS, Temp.

`Curare Cleft` retains the compatibility ID `diaphragm-return`.

## Monitor display events

The Monitors group contains display-only toggle Events. They deliberately have `effects: []` and therefore never enter physiological effect resolution.

- `monitor-inv-bp` / **Inv BP** — shows or hides the invasive arterial-pressure waveform and ART numerical values.
- `monitor-bis` / **BIS** — shows or hides the BIS trend and BIS value. Available in EDUMON-Ana.
- `monitor-temp` / **Temp** — shows or hides the temperature display.

The patient model continues evolving whether these displays are visible or not. For example, hiding Temp does not remove or reset `temperatureC`; hiding Inv BP does not change SBP/DBP; hiding BIS does not change anaesthetic depth.

Monitor toggles also demonstrate why toggle state must be tracked independently from `ActiveEffect`: a legitimate toggle can have zero physiological effects. `ActionRuntime.activeToggleActions` is therefore the source of truth for toggle ON/OFF, while `activeEffects` remains the source of physiological contributions. Display components subscribe to ActionRuntime and interpret monitor toggle state separately.

## Runtime, timing and UI state

Momentary actions have onset, duration and recovery. Toggle actions remain active until switched off and then follow `recover` or `persist` for their effects. All timing uses simulation time.

`ActionRuntime` is the source of truth for toggle state. Running toggle actions are tracked independently of their effects so a zero-effect toggle such as a monitor display control can remain ON. For effect-bearing toggles, manual target supersession still clears the toggle when all of its running effects have been removed.

A momentary action may legitimately have no effects. `ActionRuntime` must still log its activation; do not add fake effects solely to make a scenario/logging action observable.

The desktop ACTIONS layout uses three columns; narrow/mobile layout remains two columns.

## Drug/Event action history in diagnostics

`ActionRuntime` retains a bounded **action history** of the latest 500 interactions. It records Drug/Event activation, toggle deactivation, intensity changes, manual target supersession and runtime clearing. Diagnostics expose both `activeToggleActions` and active physiological effects, including current effect weight.

The runtime registers itself with shared `SimulationDiagnostics`, so copied or published EDUSIM diagnostics automatically include `runtimeDiagnostics.actions`. Monitor toggles therefore appear in diagnostics even though they have no physiological effects.

EDUMON also supports deliberate **Publish diagnostics** to the RLS-protected Supabase diagnostic inbox.

## Teaching Session Log

The Teaching tab now uses a shared **Session Log** rather than the former placeholder Scenario Log. This is separate from the browser-local diagnostic scenario logger.

While an instructor/candidate teaching session is active, `ActionRuntime` mirrors user-facing Drug/Event activation, deactivation and intensity changes to the durable Session Log. This is observational only: recording an entry must never alter action timing, effect composition or physiology.

The shared Session Log also receives instructor/candidate setting changes, alarm activation/resolution and alarm-silence actions, freeze/display actions, candidate device actions, session membership events and shared oxygen-flush events. The database assigns a monotonically increasing entry ID so the instructor view can display all participants in one deterministic order; each row also retains its occurrence timestamp and actor identity.

Session Log persistence is in `public.edusim_session_log_entries`, protected by RLS. Instructors can read the complete session; candidates can append entries and can read only their own rows. Supabase Realtime INSERT events keep the Teaching panel live.

## Priority and constraints

Ordinary actions default to priority **30**. Lower priority resolves first, higher priority later; same-priority ordinary modifiers resolve before `constraint`. Manual instructor intervention sits above the action priority system through `supersedeActionTarget(...)`.

Constraints: `block-increase`, `block-decrease`, `minimum`, `maximum`. Priority is target-specific, not whole-action cancellation.

## Absolute physiological hard bounds

After action/effect composition, EDUMON applies **absolute simulator sanity bounds** in `src/edumon/physiologicalBounds.ts`. These are not normal ranges, alarm limits or action priorities.

| Parameter | Absolute bound |
|---|---:|
| Heart rate | 0–240 bpm |
| Systolic pressure | 20–300 mmHg |
| Diastolic pressure | 10–200 mmHg |
| SpO₂ | 0–100% |
| Peripheral perfusion | 0–1 |
| Respiratory rate | 0–80/min |
| Tidal volume | 0–1000 mL |
| Expiratory resistance | 0.1–200 cmH₂O/L/s |
| FiO₂ | 0.21–1.0 |
| Shunt fraction | 0–1 |
| maxSpO₂ | 0–100% |

Dead space is constrained to `0 <= deadSpace <= bounded tidal volume`, and systolic pressure remains above diastolic pressure. Thus stacked actions cannot leave the modelled patient with impossible values such as **HR 500**.

Manual instructor control remains higher than all Drug/Event priorities, but it does **not** bypass these absolute simulator invariants. Rhythm-specific rate constraints remain separate in `monitorEngine.ts`.

## Current-value controls and target ownership

Inverse-baseline adjustment is removed. Direct instructor editing supersedes action ownership of that target and commits the selected current value while unrelated targets continue. HR/rhythm supersede `haemodynamics.heartRate`; SBP/DBP supersede `haemodynamics.meanArterialPressure`; respiratory-rate editing currently supersedes `respiration.drive`.

## Beta blocker reference implementation

`Beta blocker` is a cardiovascular **Drug** toggle in Anaesthesia and ICU, priority **70**, with:
- HR `offset -15` bpm;
- HR `block-increase`;
- HR `minimum` **50 bpm**.

At full effect HR 80 tends toward ~65; HR 55 is limited near 50; Hypovolaemia can still lower MAP while its lower-priority tachycardic response is suppressed. The 50 bpm floor is an action-level teaching constraint, not a universal physiological law. Manual HR editing supersedes the Beta blocker HR effects.

## Long-press levels

`dose-levels` and `severity-levels` use runtime intensity: Low 0.65×, Medium 1.0×, High 1.35×.

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

Operations: `offset`, `set`, `multiplier`, `target`, `increment`, `constraint`, `trigger`.

Monitor-display actions intentionally use no effect target at all.

## Key physiology notes

Hypovolaemia and Bleeding use persistent HR/MAP surrogate effects. Bronchospasm acts through `respiration.airwayObstruction`. Apnoea acts through respiratory drive.

**Neuromuscular block:** the current respiratory model does not separately represent central neural respiratory rhythm and mechanically visible chest/diaphragm excursions. Therefore `neuromuscular.block` progressively suppresses both spontaneous tidal volume and the **mechanically visible** spontaneous respiratory rate. Full block produces no spontaneous mechanical breaths, while mandatory ventilator breaths can continue.

**Curare Cleft:** compatibility action `diaphragm-return` represents return of diaphragmatic effort before full peripheral neuromuscular recovery.

Surgery, Laryngoscopy and Pain produce `stimulus.sympathetic`. Opioids alter nociceptive response and anaesthetic depth attenuates the response. The composed sympathetic stimulus passes through the shared **saturating sympathetic response** transfer function before HR/MAP translation.

## Editing and persistence

Permanent instructors edit the shared library via `/actions`. Definitions are stored in `public.edusim_action_definitions`; fallback definitions remain in `src/edumon/EdumonActionsPanel.tsx`. The editor-facing setting label is **Anaesthesia** while the stored compatibility key remains `ana` (`ana | itu | all`).

## Architecture reference

- `src/edusim/actions/ActionEffect.ts` — targets, operations, priority, constraints and release vocabulary.
- `src/edusim/actions/ActionRuntime.ts` — active toggle state, timing, intensity, priority resolution, recover/persist, target supersession, subscriptions, diagnostics and Drug/Event Session Log mirroring.
- `src/teaching/session/sessionLog.ts` — shared Session Log persistence/realtime client and state-diff helpers.
- `src/teaching/TeachingSessionLogPanel.tsx` — chronological instructor Session Log UI and CSV export.
- `src/core/SimulationDiagnostics.ts` — shared diagnostic provider registry and diagnostic serialization.
- `src/teaching/diagnostics/PublishedDiagnostics.ts` — deliberate Supabase publication of diagnostic bundles.
- `src/edumon/actionPhysiology.ts` — EDUMON physiology interpretation and hard bounds.
- `src/edumon/monitorDisplayActions.ts` — display-only monitor action IDs, subscriptions and invasive-BP presentation bridge.
- `src/edumon/EdumonBisTrend.tsx` — BIS presentation controlled by `monitor-bis`.
- `src/edumon/EdumonTemperatureSurface.tsx` — temperature presentation controlled by `monitor-temp`.
- `src/edumon/physiologicalBounds.ts` — centralized absolute physiological sanity bounds.
- `src/edumon/monitorEngine.ts` — rhythm-specific constraints, measurements and waveforms.

## Simulation-design caution

EDUMON is an educational simulator. Effect magnitudes, priorities, hard bounds, timings and surrogate physiology are configurable teaching approximations, not validated patient-model limits.
