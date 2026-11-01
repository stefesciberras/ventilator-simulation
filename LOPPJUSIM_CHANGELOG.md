# loppjuSIM development change log

This file is the cross-thread source of truth for incremental code changes made to the loppjuSIM repository.

## Change policy

- Add an entry here for every merged implementation change, regardless of which ChatGPT/project thread initiated it.
- Keep the newest change first.
- For each implementation change, increment both **LoppjuSIM-MV** (`src/appVersion.ts`) and **LoppjuSIM-Anaesth / EDUMON** (`src/edumon/appVersion.ts`) by **0.0.0.1** unless an explicit release/version instruction overrides this policy.
- Record the resulting versions in the entry so changes can be correlated with diagnostics and deployed builds.
- Prefer one concise entry per merged change/PR, including the behavioural change and any important architectural rule introduced.

---

## 2026-11-01 — Scenario-controlled Anaesth monitoring displays

**Versions after change**

- LoppjuSIM-MV: `0.83.0.77` (from `0.83.0.76`)
- LoppjuSIM-Anaesth / EDUMON: `1.2.8.38` (from `1.2.8.37`)

**Changes**

- Added a dedicated **Monitoring** section to Anaesth Scenario Studio with stage controls for invasive blood pressure, BIS, EtCO₂/capnography and temperature.
- Monitoring controls use the normal sparse stage-application model: each monitor has its own Apply checkbox, and unapplied monitor state persists across stage transitions.
- Existing/legacy scenarios do not automatically apply monitoring controls, preventing an older stage from unexpectedly switching monitor sources off merely by being opened or run.
- Scenario-applied monitoring changes use the same canonical ActionRuntime monitor-display capability IDs as the live Anaesth Monitoring panel, so the visible monitor surface, action-toggle state and alarm-source eligibility remain aligned.
- Monitoring configuration is stored separately from patient physiology in the Anaesth scenario snapshot.

**Architectural rule**

> Monitoring modality/display configuration is scenario-addressable device state, not patient physiology. Scenario stages must drive the same monitor-display capability/ActionRuntime pathway as the live simulator controls, and sparse application must preserve any monitor state not explicitly applied by that stage.

## 2026-11-01 — Dedicated Monitoring section in Actions

**Versions after change**

- LoppjuSIM-MV: `0.83.0.76` (from `0.83.0.75`)
- LoppjuSIM-Anaesth / EDUMON: `1.2.8.37` (from `1.2.8.36`)

**Changes**

- Added **Monitoring** as a third top-level collapsible section in the ACTIONS panel alongside Drugs and Events.
- Moved the display-only invasive BP, BIS and temperature controls out of Events into Monitoring without changing their ActionRuntime, candidate-permission or instructor-only semantics.
- Moved the EtCO₂/capnography control into the same Monitoring section and renamed its visible control label from `Capno` to `EtCO₂`.
- The clinical Events section now contains only patient/physiological events (Anaesthesia, Cardiovascular and Respiratory).
- Instructor-only monitor-display controls remain grouped separately inside Monitoring and continue to affect only the instructor display.

**Architectural rule**

> Monitoring modality/display controls are device/observation configuration, not physiological events. They belong in a dedicated Monitoring surface while continuing to use the existing monitor-display capability and ActionRuntime pathways so alarm eligibility and session permissions remain unchanged.

## 2026-11-01 — Restart active scenario from shared simulation controls

**Versions after change**

- LoppjuSIM-MV: `0.83.0.75` (from `0.83.0.74`)
- LoppjuSIM-Anaesth / EDUMON: `1.2.8.36` (from `1.2.8.35`)

**Changes**

- Extended the shared long-press **Pause Simulation** control so an active scenario exposes a new **Restart scenario** action above **Reset simulation**.
- Restart re-runs the same active scenario from Stage 1 at the current simulation time without ending the surrounding Simulation/Teaching session, changing the session key, or disconnecting candidates.
- Full **Reset simulation** remains a separate operation that clears scenario/transient simulator state and restores product defaults while preserving the active session according to the current session/scenario lifecycle contract.
- When no scenario runtime is active, the long-press dialog shows only Reset simulation and Cancel.
- Made the Pause/Resume Simulation control non-selectable on touch and disabled the iOS touch callout so long-press gestures do not select the control text.

**Architectural rule**

> Scenario restart, simulator reset and session termination are separate lifecycle operations. Restarting a scenario restarts only the scenario runtime at Stage 1; it must not terminate or recreate the live session. Shared long-press controls should remain touch-safe and must not rely on native text selection behavior.

## 2026-11-01 — Mobile simulator back-navigation guard and DOA slider override

**Versions after change**

- LoppjuSIM-MV: `0.83.0.74` (from `0.83.0.73`)
- LoppjuSIM-Anaesth / EDUMON: `1.2.8.35` (from `1.2.8.34`)

**Changes**

- Added a simulator-route history guard so browser back actions and mobile edge-swipe back gestures do not navigate away from an active MV, Anaesth or ITU simulator page; explicit in-app navigation remains available.
- Manual Anaesth Depth of Anaesthesia adjustment now supersedes the active `anaesthesia.hypnoticEffect` before applying the selected depth, so the displayed effective depth and the requested slider step remain aligned instead of retaining a hidden propofol/hypnotic contribution.
- The DOA range control is automatically marked as a dedicated interaction target and receives a 44 px coarse-pointer touch area on mobile/tablet layouts.
- Browser gesture handling is disabled on the DOA slider itself so horizontal slider movement is reserved for the clinical control rather than browser navigation.

**Architectural rule**

> A manual physiology control that displays a derived/effective value must supersede the transient ActionEffect target responsible for that value before applying the manual setting. Simulator routes should protect active sessions from accidental browser-history navigation while preserving explicit application navigation.

## 2026-11-01 — Reference artwork for shared patient eye indicator

**Versions after change**

- LoppjuSIM-MV: `0.83.0.73` (from `0.83.0.72`)
- LoppjuSIM-Anaesth / EDUMON: `1.2.8.34` (from `1.2.8.33`)

**Changes**

- Replaced the generated SVG eye artwork with the supplied three-state paired-eye reference artwork: open, half-closed and closed.
- Preserved the existing Anaesth physiology mapping from `effectiveAnaestheticDepth()`: depth 5 open, depth 4 half-closed, depths 1–3 closed.
- Kept the shared Anaesth/ITU patient-eye appearance state and independent pupil diameter/reactivity fields for future neurological pupil modelling.
- Aligned the eye indicator to the far left of the monitor display-action strip and sized the artwork to the same 48 px height as the alarm-silence hardware control.

**Architectural rule**

> Patient eye appearance remains a shared physiology-driven component. Presentation artwork may change independently of the shared physiological state API and its future pupil-state extensions.

## 2026-11-01 — Mode-aware Anaesth Scenario Studio ventilation controls

**Versions after change**

- LoppjuSIM-MV: `0.83.0.72` (from `0.83.0.71`)
- LoppjuSIM-Anaesth / EDUMON: `1.2.8.33` (from `1.2.8.32`)

**Changes**

- Anaesth Scenario Studio now shows only ventilation controls that are clinically applicable to the selected ventilation mode.
- Manual shows FiO₂ and PEEP only; VC-AC shows mandatory volume-control settings; PC-AC shows mandatory pressure-control settings; PSV shows pressure support and ETS; SIMV modes additionally expose pressure support, ETS and sync window; VG-PC exposes VT target and pressure limit.
- Changing ventilation mode updates the visible control set immediately.
- Hidden mode-inapplicable settings remain preserved in the scenario snapshot so switching modes does not destroy previously authored values.

**Architectural rule**

> Scenario Studio should expose the same mode-dependent device controls as the simulator. Controls that cannot affect the selected device mode should not be presented as active authoring parameters, while their stored values may be retained for reversible mode switching.

## 2026-11-01 — Shared patient eye indicator for Anaesth and ITU

**Versions after change**

- LoppjuSIM-MV: `0.83.0.71` (unchanged by this PR)
- LoppjuSIM-Anaesth / EDUMON: `1.2.8.32` (from `1.2.8.31`)

**Changes**

- Added a shared paired-eye patient appearance component and placed it at the left of the monitor display-action strip, before the laser pointer, freeze and alarm-silence controls.
- The same shared component is available in both loppjuSIM-Anaesth and loppjuSIM-ITU.
- In Anaesth, eyelid state is driven from `effectiveAnaestheticDepth()` rather than BIS: depth 5 shows open eyes, depth 4 half-closed eyes, and depths 1–3 closed eyes.
- This means volatile and IV hypnotic effects that alter effective anaesthetic depth also alter the patient's visual eye state without depending on BIS lag or measurement noise.
- ITU currently defaults to open eyes until an ITU-specific consciousness/sedation model is connected.
- The shared appearance state includes independent left/right pupil diameter and pupil reactivity fields so future ITU neurological modelling can support anisocoria, miosis, mydriasis and fixed/non-reactive pupils without replacing the eye component.

**Architectural rule**

> Patient appearance should reflect simulated patient physiology rather than a downstream monitor measurement. Shared visual patient-state components should expose product-neutral appearance state so Anaesth and ITU can drive them from their own physiology models.

## 2026-10-31 — Anaesth Scenario Studio gas/ventilation registry and physiology-aware stage application

**Versions after change**

- LoppjuSIM-MV: `0.83.0.71` (from `0.83.0.70`)
- LoppjuSIM-Anaesth / EDUMON: `1.2.8.31` (from `1.2.8.30`)

**Changes**

- Added inspired sevoflurane (`FiSevo`) to the Anaesthesia section of the Anaesth Scenario Studio registry.
- Added an Anaesth-only **Ventilation** section exposing the current monitor ventilator controls: mode, FiO₂, PEEP, set RR, VT, inspiratory time, inspiratory flow, plateau, pressure control, VG pressure limit, pressure support, termination sensitivity and SIMV sync window.
- FiO₂ is presented in Studio as the clinical 21–100% value while remaining stored internally as the canonical 0.21–1.00 fraction.
- Scenario-applied depth of anaesthesia and anaesthetic haemodynamic response now pass through `applyAnaestheticDepthEffects`, so changes affect HR, arterial pressure and spontaneous respiratory drive as well as BIS/depth-dependent displays.
- If a stage explicitly supplies haemodynamic/respiratory baseline values together with DOA, those values are used as the new response baseline before the depth effect is applied, preserving reversible non-compounding anaesthetic physiology.
- Scenario-applied ventilator controls now resolve effective RR/VT before entering the respiratory physiology engine, while FiO₂/PEEP and other canonical settings continue to feed the existing gas-exchange model.

**Architectural rule**

> Scenario Studio controls are declarative clinical inputs. Applying a scenario stage must use the same product physiology pathways as equivalent live simulator controls; Studio must not bypass derived physiology by writing display-facing state only.

## 2026-10-31 — Alarm source eligibility and event-based NIBP alarms

**Versions after change**

- LoppjuSIM-MV: `0.83.0.70` (from `0.83.0.69`)
- LoppjuSIM-Anaesth / EDUMON: `1.2.8.30` (from `1.2.8.29`)

**Changes**

- Added a shared alarm `eligible` predicate so a product can suppress an alarm when its monitor/sensor/source is not currently displayed or active, while leaving the underlying physiology intact.
- Alarm eligibility is resolved dynamically by the shared alarm controller and therefore applies consistently to lifecycle state, logging, audible priority and banner display.
- EDUMON invasive arterial-pressure alarms are now eligible only while invasive BP monitoring is displayed. Hiding/disabling the source suppresses and clears its alarm presentation.
- Added the same reusable display-capability mechanism for future BIS, capnography/EtCO2 and temperature alarm definitions.
- NIBP alarms are event-driven: a cuff alarm state changes only when a measurement completes. Starting a cuff cycle does not clear an existing NIBP alarm, and changing alarm limits does not retrospectively alarm on a retained cuff value; the next completed measurement determines the new state.
- NIBP uses the existing MAP low/high limits and reports distinct `LOW NIBP` / `HIGH NIBP` alarm sources.

**Architectural rule**

> Physiology may continue to exist internally when a monitor parameter is hidden, but alarm generation must be gated by the availability/display state of that monitoring source. Intermittent measurements such as NIBP are evaluated on measurement-completion events rather than as continuously sampled values.
