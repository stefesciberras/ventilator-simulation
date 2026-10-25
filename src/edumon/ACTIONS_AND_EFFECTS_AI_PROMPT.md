# EDUMON actions/effects — prompt for AI coding agents

> Maintenance contract: update this prompt whenever action/effect vocabulary, runtime semantics, physiology interpretation, persistence, seeded actions, grouping, priority/constraint semantics, physiological hard bounds, diagnostics, timing, display-control semantics or relevant file locations change.

Use this prompt when modifying EDUSIM/EDUMON Drugs, Events, monitor controls or physiological responses.

## Non-negotiable architecture

**Actions describe effects; physiology interprets effects.** Never make a Drug/Event button directly mutate physiological monitor values or waveform pixels.

Core physiology flow:

`ActionDefinition -> ActionRuntime/ActiveEffects -> EDUMON physiology -> absolute physiological hard bounds -> rhythm/monitor interpretation`

Display-only monitor Events are separate from physiology. They use ActionRuntime toggle state with `effects: []`; presentation components interpret those toggles without altering patient state.

Manual instructor edits supersede action ownership on that target, but do not bypass absolute hard bounds.

A valid action may intentionally have `effects: []`. Do not invent a dummy physiological target merely to make a scenario/logging/display action observable.

## Core files

- `src/edusim/actions/ActionEffect.ts` — targets/operations, priority, constraints and release behaviour.
- `src/edusim/actions/ActionRuntime.ts` — active toggle actions, active effects, timing, priority ordering, target supersession, subscriptions, diagnostics and Session Log mirroring.
- `src/teaching/session/sessionLog.ts` — durable teaching-session client plus browser-local standalone `sessionStorage` runtime.
- `src/teaching/TeachingSessionLogPanel.tsx` — shared Session Log view and CSV export for cloud sessions and standalone runs.
- `src/core/SimulationDiagnostics.ts` — runtime diagnostic-provider registry.
- `src/teaching/diagnostics/PublishedDiagnostics.ts` — deliberate Supabase publication of diagnostic bundles.
- `src/edumon/actionPhysiology.ts` — physiology interpretation, shared sympathetic saturation and hard bounds.
- `src/edumon/monitorDisplayActions.ts` — display-only monitor toggle IDs and runtime subscription bridge.
- `src/edumon/EdumonBisTrend.tsx` — BIS display controlled by `monitor-bis`.
- `src/edumon/EdumonTemperatureSurface.tsx` — Temp display controlled by `monitor-temp`; also mounts the invasive-BP DOM bridge.
- `src/edumon/EdumonActionsPanel.tsx` — fallback definitions, grouping and runtime-derived toggle state.
- `src/action-editor/ActionEditorApp.tsx` — persistent action/effect editing.

## Toggle state vs active effects

Do not infer toggle ON/OFF only from `activeEffects`. A toggle may legitimately have zero effects.

`ActionRuntime.activeToggleActions` is the authoritative ON/OFF state. `activeEffects` contains only physiological contributions. `subscribeToActionRuntime(...)` is the cross-component notification mechanism.

For ordinary effect-bearing toggles, `supersedeActionTarget(...)` removes only that target. If all effects belonging to the running toggle have been superseded, its active toggle state must also clear. Zero-effect toggles are unaffected by target supersession.

## Monitor display Events

Events → **Monitors** contains:

- `monitor-inv-bp` / **Inv BP** — toggle; setting `all`; `effects: []`; controls invasive ART waveform and numeric values only.
- `monitor-bis` / **BIS** — toggle; setting `ana`; `effects: []`; controls BIS trend/value only.
- `monitor-temp` / **Temp** — toggle; setting `all`; `effects: []`; controls temperature value display only.

All three are **display-only**. Never mutate SBP/DBP, temperature, anaesthetic depth, BIS physiology or any other patient-model field when toggling them. The underlying model continues to evolve while hidden.

Monitor toggle state and activation/deactivation must appear in ActionRuntime diagnostics and published diagnostics even though `activeEffects` is empty.

## Teaching and standalone Session Log contract

The user-facing log is named **Session Log** in both EDUVENT and EDUMON. Do not rename the older browser-local diagnostic scenario logger; it is a separate diagnostic facility.

During an active teaching session, ActionRuntime activation/deactivation/intensity interactions for Drugs and Events must be mirrored to the Session Log. This is an observational side effect only: failure to write a Session Log row must never interrupt or modify ActionRuntime physiology.

Shared teaching-session storage is `public.edusim_session_log_entries`, with actor identity supplied server-side and chronological identity IDs. Instructor/candidate simulator-state changes are captured by database triggers on the shared session rows, while alarm lifecycle/silence and freeze/display actions are logged at their shared control boundaries. Candidate device actions are captured from candidate action revisions. The instructor panel subscribes to INSERT events and displays all actors in entry order.

Keep teaching-session RLS strict: instructors may read the full session log, while candidates may append and read only their own entries. Do not trust client-provided actor names, roles or product IDs.

In **standalone** mode, use the same Session Log event vocabulary but keep the log **local only**. Do not create a teaching session and do not write standalone events to Supabase automatically. `sessionLog.ts` stores one per-product local run in browser `sessionStorage`, bounded to 2,000 entries, with actor role `standalone`. The same panel subscribes to the local runtime and exports CSV. Refreshing the same tab/session may retain the run; a future explicit publish/save operation may upload it, but implicit upload is forbidden.

Standalone coverage should match normal simulator use: Drug/Event actions, settings/model changes, alarms and silence, freeze/laser, oxygen flush, nebuliser, and ventilator hold/device actions. EDUVENT local settings are observed from its current scenario snapshot; EDUMON local settings are observed from the product state. Do not reuse cloud database triggers for standalone operation.

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

Display-only monitor Events intentionally have no target or operation.

## Priority semantics

Ordinary/default priority is **30**. Lower priority resolves first, higher priority later. Same-priority ordinary modifiers resolve before `constraint`. Per-effect JSON `priority` may override the action default.

Manual instructor target ownership sits above action priority. Do not interpret priority as whole-action cancellation.

Supported constraints: `block-increase`, `block-decrease`, `minimum`, `maximum`.

## Absolute physiological hard bounds

`applyEdumonPhysiologicalBounds()` is an absolute final sanity layer after action/effect composition. It is not an action, alarm range or normal range.

Current invariants include HR 0–240 bpm, SBP 20–300 mmHg, DBP 10–200 mmHg, SpO₂ 0–100%, RR 0–80/min and tidal volume 0–1000 mL. These must prevent impossible composed states such as **HR 500**.

Keep rhythm constraints separate from global hard bounds.

## Shared sympathetic saturation architecture

Surgery, Laryngoscopy and Pain create `stimulus.sympathetic`. Opioids alter `anaesthesia.nociceptiveResponse`, and effective anaesthetic depth attenuates the response. The composed value **must pass through the shared saturating sympathetic response transfer function** before HR/MAP translation.

Preserve this **shared saturation architecture**. Do not bypass `saturatingSympatheticResponse(...)` with direct HR/MAP mutations or unbounded additive sympathetic handling.

## Reference actions

`beta-blocker` is a cardiovascular Drug toggle, priority 70, with HR `offset -15`, `block-increase`, and `minimum 50 bpm`.

`Antibiotics` is an **Others** Drug momentary no-op action with `effects: []`; it exists for scenario/logging semantics.

`Curare Cleft` is the display name for compatibility action ID `diaphragm-return`.

## Neuromuscular block

The current respiratory model uses `neuromuscular.block` to suppress mechanically visible spontaneous RR and tidal volume. At complete block spontaneous mechanical ventilation is zero; mandatory ventilator breaths may continue.

## Drug/Event diagnostics and action history

`ActionRuntime` keeps the latest 500 interactions: activation, toggle deactivation, intensity changes, target supersession and clears. Diagnostics expose `activeToggleActions`, weighted `activeEffects`, and history.

Copied and deliberately published diagnostics must therefore retain display-only monitor toggle state and its history. The explicit **Publish diagnostics** workflow persists the diagnostic bundle to the owner-scoped Supabase inbox for later interrogation.

## Timing and release

Momentary: onset -> finite duration -> recovery.

Toggle: onset -> sustained -> switch-off -> `recover` or `persist` per physiological effect. A zero-effect toggle simply remains in `activeToggleActions` until switched off or runtime reset.

## Toggle UI state

`ActionRuntime` is the source of truth. Do not reintroduce component-local toggle state. The ACTIONS panel subscribes to the runtime, so state changes made elsewhere must update it immediately.

Desktop Drug/Event grids use three columns; mobile/narrow layout remains two columns.

## Current action groups

Anaesthesia Drugs: Propofol, Fentanyl, Remifentanil infusion, Relaxant, Neostigmine, Sugammadex, TIVA.

Cardiovascular Drugs: Atropine, Ephedrine, Phenylephrine, Noradrenaline infusion, Adrenaline infusion, Beta blocker.

Others: Antibiotics.

Cardiovascular Events: Hypertension, Hypotension, Tachycardia, Bradycardia, Hypovolaemia, Bleeding.

Respiratory Events: Apnoea, Curare Cleft, Bronchospasm.

Monitor Events: Inv BP, BIS, Temp.

## Persistence/editor rules

Definitions live in `public.edusim_action_definitions`. Monitor display controls are stored as normal toggle Events with empty `effects` arrays. The editor-facing setting label is **Anaesthesia**, while the compatibility key remains `ana` (`ana | itu | all`).

## Change checklist

1. Inspect current implementation.
2. Keep physiology actions declarative.
3. Keep display-only actions out of physiological state.
4. Permit zero-effect momentary and toggle actions; never add dummy effects.
5. Keep active toggle state independent from active effects.
6. Preserve runtime subscriptions, diagnostics and Session Log mirroring.
7. Use priority + constraints for competing physiological effects.
8. Keep manual supersession above action priority.
9. Keep absolute hard bounds centralized and final.
10. Preserve the shared sympathetic saturation architecture.
11. Keep fallback and persisted definitions aligned.
12. Preserve teaching Session Log RLS/server-derived identity and standalone local-only storage.
13. Update regression coverage and both documentation files.
14. Bump EDUMON version.
15. Run full CI and merge only when green.

## Review checklist

Confirm that monitor Events are display-only; Inv BP never changes blood pressure, BIS never changes anaesthetic depth, Temp never changes temperature; zero-effect toggles remain active and can be switched off; monitor state is present in diagnostics; Drug/Event interactions are mirrored to Session Log without affecting physiology; candidates cannot spoof teaching-session actor identity; standalone Session Log uses `sessionStorage` and remains local only; effect-bearing toggles still clear when all targets are superseded; Beta blocker remains `-15 + block-increase + minimum 50`; Antibiotics remains a logged no-op under Others; hard bounds still prevent HR 500; the shared sympathetic saturation architecture remains intact; and build/regressions pass.
