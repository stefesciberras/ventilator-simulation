# EDUMON actions/effects — prompt for AI coding agents

> Maintenance contract: update this prompt whenever action/effect vocabulary, runtime semantics, physiology interpretation, persistence, seeded actions, grouping, priority/constraint semantics, physiological hard bounds, diagnostics, timing or relevant file locations change.

Use this prompt when modifying EDUSIM/EDUMON Drugs, Events or physiological responses.

## Non-negotiable architecture

**Actions describe effects; physiology interprets effects.** Never make a Drug/Event button directly mutate monitor values or waveform pixels.

Core flow:

`ActionDefinition -> ActionRuntime/ActiveEffects -> EDUMON physiology -> absolute physiological hard bounds -> rhythm/monitor interpretation`

Manual instructor edits supersede action ownership on that target, but do not bypass absolute hard bounds.

## Core files

- `src/edusim/actions/ActionEffect.ts` — targets/operations, priority, constraints and release behaviour.
- `src/edusim/actions/ActionRuntime.ts` — timing, priority ordering, constraint resolution, intensity, recover/persist, target supersession and bounded action history.
- `src/core/SimulationDiagnostics.ts` — runtime diagnostic-provider registry used to include Drug/Event state/history in copied diagnostics.
- `src/edumon/actionPhysiology.ts` — interprets active effects and then calls the hard-bounds layer.
- `src/edumon/physiologicalBounds.ts` — centralized absolute simulator sanity bounds.
- `src/edumon/monitorEngine.ts` — rhythm-specific effective-rate constraints and waveform/measurement generation.
- `src/edumon/EdumonWorkspacePanel.tsx` — instructor controls and manual target supersession.
- `src/action-editor/ActionEditorApp.tsx` — persistent action/effect editing.
- `src/edumon/EdumonActionsPanel.tsx` — fallback definitions, grouping and runtime-derived toggle state.

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

Operations: `offset`, `set`, `multiplier`, `target`, `increment`, `constraint`, `trigger`.

## Priority semantics

Ordinary/default priority is **30**. Lower priority resolves first, higher priority later. Same-priority ordinary modifiers resolve before `constraint`. Per-effect JSON `priority` may override the action default.

Manual instructor target ownership sits above action priority: call `supersedeActionTarget(...)`, commit the selected current value, and leave unrelated targets running. Do not interpret priority as whole-action cancellation.

## Constraint semantics

Supported constraints: `block-increase`, `block-decrease`, `minimum`, `maximum`.

## Absolute physiological hard bounds

`applyEdumonPhysiologicalBounds()` is an absolute final sanity layer after action/effect composition. It is **not** an action, alarm range or normal range. Do not move these limits into individual Drug/Event definitions.

Current invariants:
- HR 0–240 bpm
- SBP 20–300 mmHg
- DBP 10–200 mmHg
- SpO₂ 0–100%
- peripheral perfusion 0–1
- RR 0–80/min
- tidal volume 0–1000 mL
- expiratory resistance 0.1–200 cmH₂O/L/s
- FiO₂ 0.21–1
- shunt fraction 0–1
- maxSpO₂ 0–100%
- dead space 0 to bounded tidal volume
- SBP above DBP

These limits must prevent impossible composed state such as **HR 500** even if multiple actions stack. Manual instructor control can supersede all action effects on HR, but the final model still obeys HR 0–240.

Keep rhythm constraints separate. `monitorEngine.ts` still determines rhythm-appropriate effective rate: VF/asystole 0; SVT/VT have their own ranges; ordinary sinus-family monitoring is more restrictive than the global 240 bpm sanity ceiling.

If a new physiological variable can be pushed to impossible values by future composition, add its invariant to the centralized bounds module rather than scattering clamps through UI code.

## Beta blocker reference implementation

`beta-blocker` is a cardiovascular **Drug** toggle, setting `all`, priority **70**, with three HR effects:
- `offset -15`
- `constraint: block-increase`
- `constraint: minimum`, value `50`

All three use 10-second onset and 30-second recovery. Hypovolaemia MAP effects remain independent. Manual HR edit supersedes all Beta blocker HR effects. The 50 bpm floor is an action-level teaching constraint; the global 0–240 HR hard bound is an absolute simulator invariant.

## Neuromuscular block and mechanically visible breathing

The current EDUMON respiratory model does not separately represent central neural respiratory rhythm and mechanical respiratory excursions. `neuromuscular.block` must therefore suppress both spontaneous tidal volume and the **mechanically visible** spontaneous respiratory rate. At complete block, spontaneous mechanical ventilation is zero; mandatory ventilator breaths may continue.

The generic `Relaxant` action retains a 120-second onset. Do not make its respiratory effect instantaneous simply to make the UI look responsive. Diagnostics should expose its current effect weight so onset can be verified.

`Curare Cleft` is the display name for compatibility action ID `diaphragm-return`. It represents return of diaphragmatic effort before complete peripheral recovery and currently targets respiratory drive plus `neuromuscular.tofMinimumCount`. Treat this as a teaching approximation until diaphragm-specific neuromuscular transmission is modelled separately.

## Drug/Event diagnostics and action history

`ActionRuntime` keeps a bounded **action history** of the latest 500 interactions. Record:
- Drug/Event activation;
- toggle deactivation;
- running intensity changes;
- manual `supersedeActionTarget(...)` interventions;
- runtime clears.

Current active effects in diagnostics should include their current onset/recovery weight. `ActionRuntime` registers a provider with `SimulationDiagnostics`, so every copied simulation diagnostic may include `runtimeDiagnostics.actions` without product-specific duplication.

Do not claim browser-local runtime diagnostics are directly accessible from ChatGPT. Direct chat interrogation requires an explicit persistence/upload channel (for example a Supabase diagnostic inbox) with appropriate ownership/RLS and deliberate user publishing.

## Timing and release

Momentary: onset -> finite duration -> recovery.

Toggle: onset -> sustained -> switch-off -> `recover` or `persist` per effect. Hypovolaemia and Bleeding currently persist their HR/MAP surrogate consequences. All timing uses simulation time.

## Toggle UI state

`ActionRuntime` is the source of truth for ON/OFF. Do not reintroduce component-local `toggleStates`. Adjustable L/M/H level is derived from runtime intensity for running toggles.

Desktop Drug/Event grids use three columns; mobile/narrow layout remains two columns.

## Current-value controls

**Do not reintroduce inverse-baseline fine tuning.** Direct instructor changes supersede the relevant action target rather than back-calculating a hidden baseline.

HR/rhythm supersede `haemodynamics.heartRate`; SBP/DBP supersede `haemodynamics.meanArterialPressure`; current respiratory-rate editing supersedes `respiration.drive`.

## Shared sympathetic saturation architecture

Surgery, Laryngoscopy and Pain create `stimulus.sympathetic`. Opioids change `anaesthesia.nociceptiveResponse`; effective anaesthetic depth attenuates the response. The composed value **must pass through the shared saturating sympathetic response transfer function** before HR/MAP translation. Preserve this saturation architecture; do not bypass it with direct HR/MAP mutations or unbounded additive stimulus handling.

## Adjustable levels

`dose-levels` and `severity-levels`: Low 0.65×, Medium 1.0×, High 1.35×. Changing a running toggle level must not restart onset timing.

## Current action groups

Cardiovascular Events: Hypertension, Hypotension, Tachycardia, Bradycardia, Hypovolaemia, Bleeding.

Respiratory Events: Apnoea, Curare Cleft, Bronchospasm.

Anaesthesia events/stimuli include Laryngoscopy, Pain and Surgery.

## Persistence/editor rules

`public.edusim_action_definitions.priority` stores action default priority. Per-effect `priority`, `constraint` and `releaseBehaviour` live in `effects` JSONB. The editor-facing setting label is **Anaesthesia**, stored compatibility key remains `ana` (`ana | itu | all`).

## Change checklist

1. Inspect current implementation.
2. Keep actions declarative.
3. Add validated targets/physiology consumers only when needed.
4. Use priority + constraints for competing effects.
5. Keep manual supersession above action priority.
6. Keep absolute hard bounds centralized and final.
7. Keep rhythm constraints separate from global sanity bounds.
8. Preserve the shared sympathetic saturation architecture.
9. Preserve recover/persist and simulation-time semantics.
10. Keep fallback and persisted definitions aligned.
11. Preserve Drug/Event action-history diagnostics when runtime semantics change.
12. Update regression coverage.
13. Update both documentation files.
14. Bump EDUMON version.
15. Run full CI and merge only when green.

## Review checklist

Confirm that actions still describe effects; physiology interprets effects; runtime priority semantics remain intact; manual supersession remains target-specific; physiological hard bounds prevent impossible composed values; HR 500 cannot survive model composition; tidal volume is bounded at 0–1000 mL; rhythm-specific rate behavior remains separate; Beta blocker remains `-15 + block-increase + minimum 50`; Bronchospasm, Hypovolaemia, Bleeding and Curare Cleft remain documented; Relaxant suppresses mechanically visible spontaneous breathing over its 120-second onset; action history is present in copied diagnostics; sympathetic saturation remains shared; and build/regressions pass.
