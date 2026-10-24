# EDUMON actions and effects — instructor guide

> Maintenance contract: keep this guide updated whenever the action/effect vocabulary, action editor, runtime behaviour, physiological interpretation, seeded Drugs/Events, or timing semantics change.

This guide is for instructors and simulation faculty who want to understand or edit EDUMON Drugs and Events without needing to understand the source code.

## The central rule

**Actions describe effects; physiology interprets effects.**

A Drug or Event button should not directly change the displayed heart rate, blood pressure, BIS, ventilation or another monitor value. Instead, the action contains one or more declarative effects. EDUMON physiology reads those effects and calculates what the patient and monitor should do.

This is important because different effects can combine. For example, Laryngoscopy produces a sympathetic stimulus. Fentanyl reduces nociceptive response. Anaesthetic depth reduces the cardiovascular response to that stimulus. The final HR and BP response is therefore calculated from all of those states rather than being hard-coded into the Laryngoscopy button.

## Where instructors edit actions

Permanent instructors can use the **Edit action library** control and the `/actions` page. The shared definitions are stored in Supabase in `public.edusim_action_definitions`. EDUMON also contains local fallback definitions so the simulator remains usable if the shared library cannot be loaded.

## Action fields

Each action has Kind, Name, Short press action, Setting, Description, Effects and Sort order. Short press is usually `momentary`; some ongoing actions can be `toggle`. Authoritative settings are `ana`, `itu` and `all`.

## Effect fields

Each effect contains Target, Operation, Value, Onset, Duration and Recovery. Onset is a ramp to full effect, Duration is the full-effect period, and Recovery is the ramp back to baseline.

All timing uses **simulation time**, not wall-clock time. Pausing the simulation pauses effect progression, and simulation speed changes how quickly effects progress in real time.

## Current effect targets

The current validated vocabulary is:

- `haemodynamics.heartRate`
- `haemodynamics.meanArterialPressure`
- `respiration.drive`
- `neuromuscular.block`
- `anaesthesia.hypnoticEffect`
- `anaesthesia.nociceptiveResponse`
- `stimulus.sympathetic`

Use the target dropdown. Do not invent new target text. A genuinely new physiological concept requires programming so the target can be validated and interpreted by physiology.

## Operations

The editor only offers operations appropriate to the selected target.

- **offset** — add/subtract an amount.
- **multiplier** — multiply baseline by a factor.
- **target** — move toward a target value.
- **set** — set/interpolate toward a value.
- **increment** — additive state change where supported.
- **trigger** — event-style effect interpreted by the runtime/physiology layer.

Repeated momentary administrations create separate active instances. Offsets can accumulate and multipliers can compound. Target/set effects do not necessarily behave like repeated doses, so choose the operation deliberately.

## Current examples

### Fentanyl

Fentanyl modestly lowers HR, reduces respiratory drive and reduces `anaesthesia.nociceptiveResponse`. Therefore it automatically blunts Laryngoscopy, Pain and Surgical stimulus without those Events knowing anything about Fentanyl.

### Relaxant

Relaxant increases `neuromuscular.block`. EDUMON interprets this as reduced respiratory muscle function. It does not directly suppress central respiratory drive, and mandatory ventilation is not disabled simply because the patient is paralysed.

### Propofol

Propofol is a generic bolus model with three declarative effects:

- increases `anaesthesia.hypnoticEffect`;
- reduces `respiration.drive`;
- lowers `haemodynamics.meanArterialPressure`.

The hypnotic component deepens the **effective anaesthetic depth** used by BIS and stimulus-response attenuation. Volatile anaesthesia and Propofol therefore share one conceptual depth pathway.

The initial values are teaching-model parameters, not a claim that one button equals one fixed clinical dose in every patient.

### Laryngoscopy, Pain and Surgical stimulus

These Events create `stimulus.sympathetic` with different strengths and durations. Their raw composed cardiovascular stimulus is:

`stimulus × nociceptive response × anaesthetic-depth response`

That composed value then passes through a **saturating physiological response curve** before EDUMON translates it into HR and MAP change. A composed response of 1.0 keeps the existing approximately +25 bpm HR / +30 mmHg MAP teaching response. Larger overlapping or repeated stimuli still increase the response, but with diminishing returns rather than increasing linearly without limit.

The current saturation curve is normalized so:

- composed response 1.0 → effective response 1.0;
- composed response 2.0 → effective response about 1.25;
- very large composed responses approach an effective ceiling of about 1.67.

This saturation is part of **physiology**, not part of the Event definition. Therefore instructors should normally continue to describe how strong and how long the stimulus is, rather than manually compensating Event values for the saturation curve.

## What instructors can edit without programming

You can usually edit an existing Drug or Event in `/actions` when changing its name/description, ordering, Ana/ICU availability, magnitude, timing, or an existing validated target/operation.

## When programming is required

Programming is required for a new target, new physiological state, new combination rule, new saturation/transfer function, new operation meaning, a device/monitor that does not yet consume the physiology, or new scenario/session/debrief behaviour.

Do not work around a missing physiological concept by making a button directly change displayed monitor values.

## Architecture reference for maintainers

- `src/edusim/actions/ActionEffect.ts` — validated targets and operations.
- `src/edusim/actions/ActionRuntime.ts` — simulation-time ActiveEffects, stacking and resolution.
- `src/edumon/actionLibrary.ts` — persistence/shared action library.
- `src/action-editor/ActionEditorApp.tsx` — instructor editor.
- `src/edumon/actionPhysiology.ts` — EDUMON interpretation of generic effects, including sympathetic-response saturation.
- `src/edumon/anaestheticPhysiology.ts` — depth/sensitivity/response and action-driven effective depth.
- `src/edumon/respiratoryPhysiology.ts` — respiratory/gas-exchange interpretation.
- `src/edumon/EdumonBisTrend.tsx` — BIS derived from effective depth.
- `src/edumon/EdumonActionsPanel.tsx` — buttons/fallback definitions; activates actions but does not own physiology.
- `supabase/migrations/` — persistent seeded definitions and schema/data migrations.

## Simulation-design caution

EDUMON is an educational simulator. Effect values and response curves are configurable teaching approximations. Test isolated effects and combinations before relying on a new definition in teaching.
