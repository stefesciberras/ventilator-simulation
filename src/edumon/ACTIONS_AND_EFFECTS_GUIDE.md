# EDUMON actions and effects — instructor guide

> Maintenance contract: keep this guide updated whenever action/effect vocabulary, runtime behaviour, physiology interpretation, seeded Drugs/Events, grouping, persistence, priority/constraint semantics, physiological hard bounds, timing semantics or relevant file locations change.

## Central rule

**Actions describe effects; physiology interprets effects.** Buttons activate declarative effects; they must not directly mutate monitor values or waveform pixels.

## Action groups

### Drugs
- **Anaesthesia** — Propofol, Fentanyl, Remifentanil infusion, Relaxant, Neostigmine, Sugammadex, TIVA.
- **Cardiovascular** — Atropine, Ephedrine, Phenylephrine, Noradrenaline infusion, Adrenaline infusion, Beta blocker.

### Events
- **Anaesthesia** — Induction, Maintenance, Awakening, Laryngoscopy, Pain, Surgery.
- **Cardiovascular** — Hypertension, Hypotension, Tachycardia, Bradycardia, Hypovolaemia, Bleeding.
- **Respiratory** — Apnoea, Return of diaphragm breathing, Bronchospasm.

## Runtime, timing and UI state

Momentary actions have onset, finite duration and recovery. Toggle actions remain active until switched off and then follow each effect's `releaseBehaviour` (`recover` or `persist`). All timing uses simulation time.

`ActionRuntime` is the source of truth for toggle state. The ACTIONS panel derives coloured/pressed state and active L/M/H intensity from runtime effects; it must not keep a separate local ON/OFF truth that is lost on remount.

## Priority and constraints

Ordinary actions default to priority **30**. `public.edusim_action_definitions.priority` stores the action default; an individual effect may override it with its own JSON `priority`.

Lower priority resolves first. Higher priority resolves later. At equal priority, ordinary numerical modifiers resolve before `constraint`. Manual instructor intervention is outside and above the action priority system: `supersedeActionTarget(...)` removes action ownership of that target and commits the selected patient value.

Constraint types are:
- `block-increase`
- `block-decrease`
- `minimum`
- `maximum`

Priority is target-specific, not whole-action cancellation.

## Absolute physiological hard bounds

After action/effect composition, EDUMON applies **absolute simulator sanity bounds** in `src/edumon/physiologicalBounds.ts`. These are not normal ranges, alarm limits or action priorities. They exist to prevent impossible internal/modelled values when multiple effects stack.

Current hard bounds are:

| Parameter | Absolute bound |
|---|---:|
| Heart rate | 0–240 bpm |
| Systolic pressure | 20–300 mmHg |
| Diastolic pressure | 10–200 mmHg |
| SpO₂ | 0–100% |
| Peripheral perfusion | 0–1 |
| Respiratory rate | 0–80/min |
| Tidal volume | 0–3000 mL |
| Expiratory resistance | 0.1–200 cmH₂O/L/s |
| FiO₂ | 0.21–1.0 |
| Shunt fraction | 0–1 |
| maxSpO₂ | 0–100% |

Dead space is additionally constrained to `0 <= deadSpace <= bounded tidal volume`, and systolic pressure is kept above diastolic pressure.

These bounds are applied **after action physiology**, so stacked actions cannot leave the modelled patient with values such as HR 500. Manual instructor control remains higher than all Drug/Event priorities, but manual control does **not** bypass these absolute simulator invariants. Rhythm-specific rate constraints remain separate in `monitorEngine.ts`: for example VF/asystole produce effective rate 0, SVT/VT have their own rate ranges, and ordinary sinus-family monitoring is more restrictive than the global 240 bpm sanity ceiling.

## Current-value controls and target ownership

The old inverse-baseline behaviour is removed. When the instructor directly edits a model-driven parameter, EDUMON supersedes action ownership of that target and commits the selected current value. Other targets from the same action continue running.

Examples:
- HR 78 + Bradycardia → 43; instructor sets HR 50 → HR action effects are superseded and current HR becomes 50.
- Editing SBP/DBP supersedes `haemodynamics.meanArterialPressure` while preserving unrelated effects.
- Changing ECG rhythm supersedes action ownership of HR.
- Direct respiratory-rate editing currently supersedes `respiration.drive`; finer respiratory targets remain future work.

## Beta blocker reference implementation

`Beta blocker` is a cardiovascular **Drug** toggle available in both EDUMON-Ana and EDUMON-ICU, priority **70**, with three HR effects:
- `offset -15` bpm;
- `constraint: block-increase`;
- `constraint: minimum`, value **50 bpm**.

All three currently use 10-second onset and 30-second recovery. Thus HR 80 tends toward ~65, HR 55 is limited near 50, and lower-priority tachycardic responses such as Hypovolaemia are suppressed while unrelated MAP effects continue. The 50 bpm floor is a teaching-model effect, not a universal physiological law; higher-priority conduction/rhythm physiology may later override it. Manual HR change supersedes all Beta blocker HR effects.

## Long-press levels

`dose-levels` and `severity-levels` use runtime intensity: Low 0.65×, Medium 1.0×, High 1.35×. A running toggle can change level without restarting onset timing.

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

## Key physiology notes

Hypovolaemia and Bleeding use persistent HR/MAP surrogate effects. Bronchospasm acts through `respiration.airwayObstruction` and increases expiratory resistance. Apnoea acts through respiratory drive. Return of diaphragm breathing targets respiratory drive and `neuromuscular.tofMinimumCount`. Surgery/Laryngoscopy/Pain feed `stimulus.sympathetic`; opioids alter nociceptive response; anaesthetic depth attenuates that response. Capnography remains derived from mechanics.

## Editing and persistence

Permanent instructors edit the shared library via `/actions`. Definitions are stored in `public.edusim_action_definitions`; fallback definitions remain in `src/edumon/EdumonActionsPanel.tsx`. The editor-facing setting label is **Anaesthesia** while the stored compatibility key remains `ana` (`ana | itu | all`).

## Architecture reference

- `src/edusim/actions/ActionEffect.ts` — validated targets/operations, priority, constraints and release vocabulary.
- `src/edusim/actions/ActionRuntime.ts` — timing, intensity, priority resolution, constraints, recover/persist and target supersession.
- `src/edumon/actionPhysiology.ts` — EDUMON interpretation of active effects and final call into hard bounds.
- `src/edumon/physiologicalBounds.ts` — centralized absolute EDUMON physiological sanity bounds.
- `src/edumon/monitorEngine.ts` — rhythm-specific effective-rate constraints, measurements and waveforms.
- `src/edumon/EdumonWorkspacePanel.tsx` — instructor controls and manual target supersession.
- `src/action-editor/ActionEditorApp.tsx` — action/effect editing.
- `src/edumon/EdumonActionsPanel.tsx` — grouping, fallback definitions and action UI.

## Simulation-design caution

EDUMON is an educational simulator. Effect magnitudes, priorities, hard bounds, onset/recovery values, dose/severity multipliers and surrogate physiology are configurable teaching approximations, not validated patient-model limits.
