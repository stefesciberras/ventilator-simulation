# EDUMON actions and effects — instructor guide

> Maintenance contract: keep this guide updated whenever the action/effect vocabulary, action editor, runtime behaviour, physiological interpretation, seeded Drugs/Events, or timing semantics change.

This guide is for instructors and simulation faculty who want to understand or edit EDUMON Drugs and Events without needing to understand the source code.

## The central rule

**Actions describe effects; physiology interprets effects.**

A Drug or Event button should not directly change the displayed heart rate, blood pressure, BIS, ventilation or another monitor value. Instead, the action contains one or more declarative effects. EDUMON physiology reads those effects and calculates what the patient and monitor should do.

This allows effects to combine. For example, Surgery creates a sympathetic stimulus. Fentanyl or Remifentanil reduces nociceptive response. Anaesthetic depth from volatile anaesthesia, Propofol bolus or TIVA reduces the cardiovascular response to that stimulus. The final HR and BP response is calculated from all of those states rather than being hard-coded into the Surgery button.

## Where instructors edit actions

Permanent instructors can use the **Edit action library** control and the `/actions` page. The shared definitions are stored in Supabase in `public.edusim_action_definitions`. EDUMON also contains local fallback definitions so the simulator remains usable if the shared library cannot be loaded.

## Action fields

Each action has Kind, Name, Short press action, Setting, Description, Effects and Sort order. Authoritative settings are `ana`, `itu` and `all`.

There are two important short-press behaviours:

- **momentary** — each press creates a new timed administration/event instance;
- **toggle** — first press starts an ongoing effect, second press stops it.

Toggle actions are used for infusions and sustained events. They ramp to full effect over **Onset**, stay active indefinitely while the toggle is on, and after switch-off ramp back toward baseline over **Recovery**. For a toggle action, `durationSeconds` does not determine how long the effect stays on.

## Effect fields

Each effect contains Target, Operation, Value, Onset, Duration and Recovery.

For **momentary** actions:

- Onset = ramp to full effect;
- Duration = full-effect period;
- Recovery = ramp back to baseline.

For **toggle** actions:

- Onset = ramp after switching on;
- the effect remains at full strength until switched off;
- Recovery = ramp after switching off.

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

### Propofol bolus

Propofol is a generic momentary bolus with three declarative effects:

- increases `anaesthesia.hypnoticEffect`;
- reduces `respiration.drive`;
- lowers `haemodynamics.meanArterialPressure`.

The hypnotic component deepens the **effective anaesthetic depth** used by BIS and stimulus-response attenuation.

### TIVA (Propofol TCI)

TIVA is a **toggle** action representing a Propofol TCI-style infusion. Switching it on creates a sustained hypnotic effect, respiratory-drive depression and MAP reduction; switching it off starts the configured recovery ramps.

The current implementation is deliberately a teaching abstraction. It represents the physiological result of a maintained TCI rather than modelling a specific pump algorithm, target plasma concentration, target effect-site concentration or named pharmacokinetic model. A future TCI module can replace this surrogate without changing the action/physiology separation.

### Fentanyl

Fentanyl is a momentary opioid administration. It modestly lowers HR, reduces respiratory drive and reduces `anaesthesia.nociceptiveResponse`.

### Remifentanil infusion

Remifentanil is a **toggle** infusion. While running it strongly attenuates `anaesthesia.nociceptiveResponse`, depresses spontaneous respiratory drive and modestly lowers HR. Because its effects are declarative, Surgery and Laryngoscopy automatically become less haemodynamically stimulating while the infusion is active.

Its onset/recovery parameters are educational approximations rather than a complete pharmacokinetic model.

### Relaxant

Relaxant increases `neuromuscular.block`. EDUMON interprets this as reduced respiratory muscle function. It does not directly suppress central respiratory drive, and mandatory ventilation is not disabled simply because the patient is paralysed.

### Laryngoscopy and Pain

These are momentary Events. They create `stimulus.sympathetic` for a defined period.

### Surgery

Surgery is a **toggle Event** representing sustained operative nociceptive stimulation. Turn it on at the start of surgery and turn it off when surgery finishes. While on, it continuously contributes `stimulus.sympathetic`; after it is switched off, the stimulus decays over its recovery period.

The raw composed cardiovascular stimulus is:

`stimulus × nociceptive response × anaesthetic-depth response`

That composed value then passes through a **saturating physiological response curve** before EDUMON translates it into HR and MAP change. A composed response of 1.0 keeps the existing approximately +25 bpm HR / +30 mmHg MAP teaching response. Larger overlapping or repeated stimuli still increase the response, but with diminishing returns rather than increasing linearly without limit.

The current saturation curve is normalized so:

- composed response 1.0 → effective response 1.0;
- composed response 2.0 → effective response about 1.25;
- very large composed responses approach an effective ceiling of about 1.67.

This saturation is part of **physiology**, not part of the Event definition.

## What instructors can edit without programming

You can usually edit an existing Drug or Event in `/actions` when changing its name/description, ordering, Ana/ICU availability, magnitude, timing, momentary/toggle behaviour, or an existing validated target/operation.

When changing an action from momentary to toggle, remember that Duration no longer determines the on-time; the instructor controls the duration by switching the action off.

## When programming is required

Programming is required for a new target, new physiological state, new combination rule, new saturation/transfer function, new operation meaning, a device/monitor that does not yet consume the physiology, or new scenario/session/debrief behaviour.

Do not work around a missing physiological concept by making a button directly change displayed monitor values.

## Architecture reference for maintainers

- `src/edusim/actions/ActionEffect.ts` — validated targets and operations.
- `src/edusim/actions/ActionRuntime.ts` — simulation-time ActiveEffects, momentary timing, sustained toggle state, recovery and stacking.
- `src/edumon/actionLibrary.ts` — persistence/shared action library.
- `src/action-editor/ActionEditorApp.tsx` — instructor editor.
- `src/edumon/actionPhysiology.ts` — EDUMON interpretation of generic effects, including sympathetic-response saturation.
- `src/edumon/anaestheticPhysiology.ts` — depth/sensitivity/response and action-driven effective depth.
- `src/edumon/respiratoryPhysiology.ts` — respiratory/gas-exchange interpretation.
- `src/edumon/EdumonBisTrend.tsx` — BIS derived from effective depth.
- `src/edumon/EdumonActionsPanel.tsx` — buttons/fallback definitions; activates actions but does not own physiology.
- `supabase/migrations/` — persistent seeded definitions and schema/data migrations.

## Simulation-design caution

EDUMON is an educational simulator. Effect values, infusion surrogates and response curves are configurable teaching approximations. Test isolated effects and combinations before relying on a new definition in teaching.
