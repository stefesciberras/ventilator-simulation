# EDUMON actions and effects — instructor guide

> Maintenance contract: keep this guide updated whenever the action/effect vocabulary, action editor, runtime behaviour, physiological interpretation, seeded Drugs/Events, drug grouping, dose controls, or timing semantics change.

This guide is for instructors and simulation faculty who want to understand or edit EDUMON Drugs and Events without needing to understand the source code.

## The central rule

**Actions describe effects; physiology interprets effects.**

A Drug or Event button should not directly change the displayed heart rate, blood pressure, BIS, ventilation or another monitor value. Instead, the action contains one or more declarative effects. EDUMON physiology reads those effects and calculates what the patient and monitor should do.

This allows effects to combine. For example, Surgery creates a sympathetic stimulus. Fentanyl or Remifentanil reduces nociceptive response. Anaesthetic depth from volatile anaesthesia, Propofol bolus or TIVA reduces the cardiovascular response to that stimulus. The final HR and BP response is calculated from all of those states rather than being hard-coded into the Surgery button.

## Drug classes in the monitor

The Drugs section is currently subdivided into:

- **Anaesthesia** — Propofol, Fentanyl, Remifentanil infusion, Relaxant and TIVA (Propofol TCI).
- **Cardiovascular** — Atropine, Ephedrine, Phenylephrine and Noradrenaline infusion.

The subdivision is presentation/taxonomy only. The individual Drug definitions remain declarative ActionDefinitions and physiology still interprets their effects.

## Where instructors edit actions

Permanent instructors can use the **Edit action library** control and the `/actions` page. The shared definitions are stored in Supabase in `public.edusim_action_definitions`. EDUMON also contains local fallback definitions so the simulator remains usable if the shared library cannot be loaded.

## Action fields

Each action has Kind, Name, Short press action, Long press action, Setting, Description, Effects and Sort order. Authoritative settings are `ana`, `itu` and `all`.

There are two important short-press behaviours:

- **momentary** — each press creates a new timed administration/event instance;
- **toggle** — first press starts an ongoing effect, second press stops it.

Toggle actions are used for infusions and sustained events. They ramp to full effect over **Onset**, stay active indefinitely while the toggle is on, and after switch-off ramp back toward baseline over **Recovery**. For a toggle action, `durationSeconds` does not determine how long the effect stays on.

## Infusion dose-level long press

An infusion can set `long_press_action = dose-levels`.

A normal short press still starts/stops the infusion. A long press opens a compact three-step selector:

- **Low** = 0.65 × the stored/base effect intensity;
- **Medium** = 1.0 × and is the default;
- **High** = 1.35 ×.

The selected level is shown on the infusion button as **L / M / H**. If the infusion is already running, choosing another level changes the active infusion intensity without switching it off.

For additive effects such as MAP +20 mmHg, intensity scales the offset directly. For multiplier effects such as respiratory drive ×0.65, intensity scales the distance from the neutral multiplier 1.0. This is important: a higher dose must strengthen a suppressive multiplier, not accidentally reverse it.

The current dose steps are educational intensity levels rather than clinical dose units. They do not imply a specific µg/kg/min, ng/ml effect-site target, syringe concentration or pump algorithm.

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

Propofol is a generic momentary bolus with declarative hypnotic, respiratory-drive and MAP effects. The hypnotic component deepens the **effective anaesthetic depth** used by BIS and stimulus-response attenuation.

### TIVA (Propofol TCI)

TIVA is a **toggle** action representing a Propofol TCI-style infusion and supports the Low/Medium/High long-press selector. It is deliberately a teaching abstraction of maintained physiological effect rather than a named PK/PD pump model.

### Fentanyl

Fentanyl is a momentary opioid administration. It modestly lowers HR, reduces respiratory drive and reduces `anaesthesia.nociceptiveResponse`.

### Remifentanil infusion

Remifentanil is a **toggle** infusion with Low/Medium/High intensity selection. While running it attenuates `anaesthesia.nociceptiveResponse`, depresses spontaneous respiratory drive and modestly lowers HR.

### Relaxant

Relaxant increases `neuromuscular.block`. EDUMON interprets this as reduced respiratory muscle function. It does not directly suppress central respiratory drive.

### Atropine

Atropine is a momentary Cardiovascular action with a predominantly positive HR offset in the current teaching model.

### Ephedrine

Ephedrine is a momentary Cardiovascular vasopressor action with positive HR and MAP offsets.

### Phenylephrine

Phenylephrine is a momentary Cardiovascular vasopressor action with a positive MAP offset and modest negative HR offset representing reflex bradycardia.

### Noradrenaline infusion

Noradrenaline is a **toggle** Cardiovascular infusion with Low/Medium/High intensity selection. The base/Medium action raises MAP and applies a small negative HR offset. It remains active until switched off and then follows its configured recovery ramp.

### Laryngoscopy and Pain

These are momentary Events. They create `stimulus.sympathetic` for a defined period.

### Surgery

Surgery is a **toggle Event** representing sustained operative nociceptive stimulation. Turn it on at the start of surgery and turn it off when surgery finishes.

The raw composed cardiovascular stimulus is:

`stimulus × nociceptive response × anaesthetic-depth response`

That value passes through the shared saturating physiological response curve before EDUMON translates it into HR and MAP change.

## What instructors can edit without programming

You can usually edit an existing Drug or Event in `/actions` when changing its name/description, ordering, Ana/ICU availability, magnitude, timing, momentary/toggle behaviour, or an existing validated target/operation.

The current monitor drug-class grouping and `dose-levels` long-press control are application features. Adding a genuinely new drug class or a different long-press interaction currently requires code changes.

## When programming is required

Programming is required for a new target, new physiological state, new combination rule, new saturation/transfer function, new operation meaning, new drug class, new long-press interaction, a device/monitor that does not yet consume the physiology, or new scenario/session/debrief behaviour.

Do not work around a missing physiological concept by making a button directly change displayed monitor values.

## Architecture reference for maintainers

- `src/edusim/actions/ActionEffect.ts` — validated targets and operations.
- `src/edusim/actions/ActionRuntime.ts` — simulation-time ActiveEffects, sustained toggle state, adjustable intensity, recovery and stacking.
- `src/edumon/actionLibrary.ts` — persistence/shared action library.
- `src/action-editor/ActionEditorApp.tsx` — instructor editor.
- `src/edumon/actionPhysiology.ts` — EDUMON interpretation of generic effects.
- `src/edumon/anaestheticPhysiology.ts` — action-driven effective anaesthetic depth.
- `src/edumon/EdumonActionsPanel.tsx` — drug classes, long-press dose selector, buttons and fallback definitions; it activates actions but does not own physiology.
- `supabase/migrations/` — persistent seeded definitions and schema/data migrations.

## Simulation-design caution

EDUMON is an educational simulator. Effect values, infusion intensity levels and response curves are configurable teaching approximations. Test isolated effects and combinations before relying on a new definition in teaching.
