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

Momentary actions have onset, duration and recovery. Toggle actions remain active until switched off and then follow `recover` or `persist`. All timing uses simulation time. `ActionRuntime` is the source of truth for toggle state and active L/M/H intensity.

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
| Tidal volume | 0–3000 mL |
| Expiratory resistance | 0.1–200 cmH₂O/L/s |
| FiO₂ | 0.21–1.0 |
| Shunt fraction | 0–1 |
| maxSpO₂ | 0–100% |

Dead space is constrained to `0 <= deadSpace <= bounded tidal volume`, and systolic pressure remains above diastolic pressure. Thus stacked actions cannot leave the modelled patient with impossible values such as **HR 500**.

Manual instructor control remains higher than all Drug/Event priorities, but it does **not** bypass these absolute simulator invariants. Rhythm-specific rate constraints remain separate in `monitorEngine.ts`; VF/asystole produce effective rate 0 and SVT/VT retain their rhythm-specific ranges.

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

## Key physiology notes

Hypovolaemia and Bleeding use persistent HR/MAP surrogate effects. Bronchospasm acts through `respiration.airwayObstruction`. Apnoea acts through respiratory drive. Return of diaphragm breathing targets respiratory drive and `neuromuscular.tofMinimumCount`.

Surgery, Laryngoscopy and Pain produce `stimulus.sympathetic`. Opioids alter nociceptive response and anaesthetic depth attenuates the response. The composed sympathetic stimulus passes through the shared **saturating sympathetic response** transfer function before HR/MAP translation; this saturation prevents unbounded sympathetic amplification. Capnography remains derived from mechanics.

## Editing and persistence

Permanent instructors edit the shared library via `/actions`. Definitions are stored in `public.edusim_action_definitions`; fallback definitions remain in `src/edumon/EdumonActionsPanel.tsx`. The editor-facing setting label is **Anaesthesia** while the stored compatibility key remains `ana` (`ana | itu | all`).

## Architecture reference

- `src/edusim/actions/ActionEffect.ts` — targets, operations, priority, constraints and release vocabulary.
- `src/edusim/actions/ActionRuntime.ts` — timing, intensity, priority resolution, constraints, recover/persist and target supersession.
- `src/edumon/actionPhysiology.ts` — EDUMON interpretation and final call into hard bounds.
- `src/edumon/physiologicalBounds.ts` — centralized absolute physiological sanity bounds.
- `src/edumon/monitorEngine.ts` — rhythm-specific constraints, measurements and waveforms.
- `src/edumon/EdumonWorkspacePanel.tsx` — instructor controls and manual target supersession.

## Simulation-design caution

EDUMON is an educational simulator. Effect magnitudes, priorities, hard bounds, timings and surrogate physiology are configurable teaching approximations, not validated patient-model limits.
