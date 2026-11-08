# loppjuSIM development change log

## 1.3.0.36 — Fix offline preparation on Cloudflare (2026-11-08)

- Production verification identified Cloudflare's HTTP 307 canonical redirect from the versioned `.html` shell to its extensionless URL. The offline downloader previously rejected all redirects, failing installation despite correct asset checksums.
- Follow canonical redirects, require a same-origin final response and verify the exact manifest checksum. Cache a fresh response without redirect metadata so offline navigation can reuse it safely. Existing sessions/checkpoints are untouched.
- Regression coverage now simulates the production HTML redirect, checks offline response headers/redirect metadata, and rejects cross-origin or checksum-invalid responses while preserving the active build. Both products: 1.3.0.36.


## 1.3.0.35 — Offline app shell and local reload recovery (2026-11-07)

- Opening the Anaesth v2 pilot prepares a verified offline shell, including lazy assets, on each device. Availability is shown explicitly; simulator routes reload from that complete build offline. API/auth/pairing/library responses are never cached.
- Updates wait for all open app tabs to close, preserving running sessions. Build-specific shell URLs and content hashes prevent mixed-deployment caches. Incomplete caches can be repaired online with Check offline availability.
- Remember only the last successful local role/session ID, never credentials or pairing text. Instructor reload selects that saved session; Connect restores its IndexedDB checkpoint paused (allow 15 seconds for the old ownership lease). Candidates remain candidates and need fresh pairing after reload.
- Offline reconnection still requires manual offer/answer exchange. Automatic links need internet; offline instructions and errors explain this. Offline shell availability does not make cloud sessions or online content libraries available offline. Site data must be retained.
- Both MV and EDUMON: 1.3.0.35. Automated shell/cache and IndexedDB recovery regressions; physical offline-browser verification remains required.


## 1.3.0.34 — Automatic local candidate pairing (2026-11-07)

- Local instructors can create a five-minute, single-candidate link. Candidates open/paste the link and Connect; offer/answer exchange is automatic.
- A separate short-lived Cloudflare Durable Object stores only connection descriptions, with separate random owner/candidate capabilities, expiry and cleanup. Simulation authority, checkpoints and commands remain local/direct peer-to-peer. Internet is required for automatic pairing/re-pairing, not for an established LAN connection.
- Manual offline pairing remains supported; invalid/incomplete/wrong-direction text now produces actionable errors. No Cloudflare branch preview configuration added.
- Both MV and EDUMON versions: 1.3.0.34. Automated regression/build verification; real two-device browser verification remains required.


This file is the cross-thread source of truth for incremental code changes made to the loppjuSIM repository.

## Change policy

- Add an entry here for every merged implementation change, regardless of which ChatGPT/project thread initiated it.
- Keep the newest change first.
- For each implementation change, increment both **LoppjuSIM-MV** (`src/appVersion.ts`) and **LoppjuSIM-Anaesth / EDUMON** (`src/edumon/appVersion.ts`) by **0.0.0.1** unless an explicit release/version instruction overrides this policy.
- Record the resulting versions in the entry so changes can be correlated with diagnostics and deployed builds.
- Prefer one concise entry per merged change/PR, including the behavioural change and any important architectural rule introduced.

---

## 1.3.0.33 — 2026-11-06 (experimental local peer pairing)
- Added manual WebRTC offer/answer pairing for one instructor and one candidate. No external signalling, STUN or TURN service is configured; a reachable local network is required.
- Instructor owns the existing IndexedDB-backed runtime and clock. Candidate uses canonical snapshots and authenticated candidate-only commands, with shared adapter authorization and retained command receipts.
- Re-pairing replaces the old connection without recreating the runtime. Instructor recovery remains paused; candidate cannot promote itself or control the clock. Sessions created before this version need a new local session ID for pairing.
- Both product versions are 1.3.0.33. Automated wire/authentication/re-pairing tests use a WebRTC test double; real two-device ICE/network behaviour remains for manual verification. Offline app loading, QR exchange, automatic reconnect and production catalogue downloads remain pending.

## 1.3.0.32 — 2026-11-06 (experimental browser-local authority)
- Added Local / Cloud host selection in the Anaesth v2 panel. Local uses the shared engine, a built-in pilot catalogue and IndexedDB checkpoints; no simulation network connection is opened.
- Local checkpoints retain pinned definitions and clock settings. Recovery pauses time, leases prevent concurrent tab writers, and hidden tabs pause. Reconnect with the same session ID after the previous 15-second lease expires.
- Added IndexedDB-backed regression coverage (fake-indexeddb) for ownership, HR alarms, drug deduplication, recovery and suspension. Browser/device validation remains outstanding.
- Both products advance to 1.3.0.32. Local mode currently runs on the main thread and is single-browser only; downloaded production catalogues, offline application loading and LAN transport remain pending.

## 1.3.0.31 — 2026-11-06 (shared Anaesth v2 session foundation)
- Extracted the existing Anaesth adapter setup, initial patient, monitor/effect projection and public catalogue projection into `src/session-v2/anaesthSession.mjs` for reuse by future local authority.
- Cloudflare now consumes these shared functions. Its authentication, clock scheduling, checkpoint persistence, recovery and wire format remain unchanged; v1 is unaffected.
- Added an offline setup/projection regression covering the HR transition/alarm relationship, active drug effects, checkpoint preservation and restoration. Existing Cloudflare integration tests continue to cover the extracted path.
- Both application versions are **1.3.0.31**. This is an extraction only: browser-local authority and offline pairing are still pending.

## 2026-11-02 — Autosave shared Drug & Event library

**Versions after change**

- LoppjuSIM-MV: `0.83.0.84` (from `0.83.0.83`)
- LoppjuSIM-Anaesth / EDUMON: `1.2.8.45` (from `1.2.8.44`)

**Changes**

- Added local-first autosave to the shared **Drug & Event Library Editor** so definition fields and declarative effect rows are persisted without requiring the manual Save button.
- Every edit is written immediately to a browser recovery draft. Once an action has a valid lowercase ID and a name, changes are debounced to the shared action library after 1.5 seconds of inactivity.
- Failed cloud autosaves retain the local draft and automatically retry after 5 seconds; the editor shows pending, saving, saved, local-only and retrying states.
- New drugs/events begin autosaving as soon as their ID and name become valid. Duplicate IDs are blocked from autosaving so creating a new action cannot silently overwrite an existing definition.
- The manual control remains as **Save now**, providing an explicit immediate flush in addition to autosave. Successful saves clear the matching recovery draft; deletion also clears its local draft.
- No Supabase schema change was required; autosave uses the existing `saveEdusimAction()` upsert pathway and shared runtime action cache.

**Architectural rule**

> Shared authoring editors should be local-first: every edit must have an immediate recoverable local representation, while valid authoring state is asynchronously persisted to the durable shared library. A transient cloud failure must never discard the editor's current work, and manual Save should remain an explicit flush rather than the sole persistence mechanism.

## 2026-11-02 — Informative manual-trigger destination labels

**Versions after change**

- LoppjuSIM-MV: `0.83.0.83` (from `0.83.0.82`)
- LoppjuSIM-Anaesth / EDUMON: `1.2.8.44` (from `1.2.8.43`)

**Changes**

- Replaced the generic Manual trigger `Available` status with an informative destination label.
- A single branch now displays `Available → <destination stage>` using the authored target label.
- A simple sequential manual advance displays `Available → Stage N` (or `Scenario complete` at the end).
- Multiple manual branches display `Available → choose a path below`, with each path retaining its own destination row.
- Unavailable manual transitions continue to display only `Not available`.

**Architectural rule**

> Scenario runtime trigger rows should expose the consequence of an available transition wherever that destination is already known, rather than presenting availability without routing context.

## 2026-11-01 — Clear EDUMON monitor histories on simulation reset

**Versions after change**

- LoppjuSIM-MV: `0.83.0.82` (from `0.83.0.81`)
- LoppjuSIM-Anaesth / EDUMON: `1.2.8.43` (from `1.2.8.42`)

**Changes**

- BIS now clears its 60-second trend point history, lag/inertia state, jitter state and local simulation clock on the shared simulation-reset event.
- Capnography now clears its rolling waveform history, respiratory runtime, capnogram state and local simulation clock on reset.
- Restart Scenario therefore begins auxiliary monitor histories from a clean baseline before Stage 1 is applied, rather than retaining data from the previous scenario run.

**Architectural rule**

> Product/component-local rolling histories and dynamic monitor runtimes are transient simulation state. They must subscribe to the shared reset lifecycle and be cleared whenever the simulator or active scenario is cleanly restarted.

## 2026-11-01 — Explicit session recovery and clean scenario restart

**Versions after change**

- LoppjuSIM-MV: `0.83.0.81` (from `0.83.0.80`)
- LoppjuSIM-Anaesth / EDUMON: `1.2.8.42` (from `1.2.8.41`)

**Changes**

- Instructor sessions are no longer silently resumed after a page refresh/reload. When an active recoverable instructor session is found, the shared simulator shell asks whether to **Continue existing session** or **Start new session**.
- Continuing reclaims the same instructor session, key and participants and allows the existing persisted scenario/runtime state to continue. Starting new explicitly retires the previous session, clears recovered scenario/transient simulator state, restores clean product defaults and opens the normal Sessions workflow.
- Candidate recovery remains automatic/explicit through the existing candidate join/rejoin flow and is not offered a new-session choice.
- **Restart scenario** is now a clean clinical restart inside the same live session: the current scenario definition is retained, the old scenario runtime and persisted stage are stopped, ActionRuntime/active effects and product transient state are cleared, product defaults are restored, then Stage 1 of the same scenario is started again.
- Restarting does not terminate or recreate the surrounding Simulation/Teaching session, change its key, or disconnect candidates.
- A durable `scenario.restarted` Session Log boundary is written for each clean restart. The normal Session Log and CSV projection show the restarted run from that boundary onward, while earlier database rows remain retained for future audit/debrief rather than being physically deleted.

**Architectural rule**

> Instructor session recovery after reload must be explicit rather than automatic. Restarting a scenario creates a new clean scenario run within the same live session: prior transient physiology/effects must not leak into the restarted run, and the normal log projection must not mix prior-run entries with the new run even though durable historical rows remain available.

## 2026-11-01 — Expanded Anaesth Scenario Studio stage transitions

**Versions after change**

- LoppjuSIM-MV: `0.83.0.80` (from `0.83.0.79`)
- LoppjuSIM-Anaesth / EDUMON: `1.2.8.41` (from `1.2.8.40`)

**Changes**

- Expanded Anaesth Scenario Studio transition support from the original five top-level monitor values to the full numeric Anaesth setting registry, including Depth of Anaesthesia, FiSevo, respiratory mechanics, metabolic inputs and numeric ventilator settings.
- Kept discrete/select and boolean state changes immediate; rhythm, sex, ventilation mode and monitoring toggles are not numerically interpolated.
- Replaced the EDUMON runtime's top-level-key transition loop with registry/path-driven interpolation so nested patient values such as `anaestheticGases.fiSevoPercent`, respiratory mechanics and ventilator settings can use the normal stage default transition and per-parameter overrides.
- Depth of Anaesthesia can now transition over time (for example 5 → 2 over 30 seconds). The runtime carries the effective depth progressively while the associated HR, arterial-pressure and spontaneous-respiratory effects transition over the same interval rather than jumping to the final physiology immediately.
- The Anaesth controls surface now receives the effective transitioning patient state, so the visible DOA/physiology controls follow the running transition rather than displaying only the final target state.
- Scenario ventilation application now recalculates effective RR/VT when spontaneous breathing or compliance changes as well as when ventilator settings change. Derived RR/VT transitions inherit the relevant driving parameter's override duration.
- ICU retains its existing explicitly declared transition set; this change deliberately broadens only the Anaesth product contract.

**Architectural rule**

> Scenario transition capability is declared by the product registry and executed by snapshot path, not by a hard-coded list of top-level patient fields. Derived physiology affected by a transitioning clinical input must evolve on the same simulation-time transition rather than jumping ahead of the input state.

## 2026-11-01 — Full PHYSIO domain colour treatment

**Versions after change**

- LoppjuSIM-MV: `0.83.0.79` (from `0.83.0.78`)
- LoppjuSIM-Anaesth / EDUMON: `1.2.8.40` (from `1.2.8.39`)

**Changes**

- Extended PHYSIO colour coding to match the PATIENT panel convention rather than colouring only the subsection headings.
- **Respiratory / gas exchange** now uses blue for the heading, parameter labels/values, slider tracks and slider thumbs.
- **Anaesthetic physiology** now uses yellow for the heading, parameter labels/values, slider tracks and slider thumbs.
- The panel background/layout remains neutral; the colour is carried by the domain controls themselves.

**Architectural rule**

> PHYSIO domain colouring should use the same control-level accent mechanism as PATIENT signal families: section identity, labels, values and interactive range controls share one domain accent without changing physiology or control semantics.

## 2026-11-01 — PHYSIO section colour coding

**Versions after change**

- LoppjuSIM-MV: `0.83.0.78` (from `0.83.0.77`)
- LoppjuSIM-Anaesth / EDUMON: `1.2.8.39` (from `1.2.8.38`)

**Changes**

- Added a blue visual treatment to the **Respiratory / gas exchange** heading in the PHYSIO panel.
- Added a yellow visual treatment to the **Anaesthetic physiology** heading in the PHYSIO panel.
- The colour coding is limited to section identity; existing signal-specific control/slider accent colours remain unchanged.

**Architectural rule**

> PHYSIO domain colour coding is presentation-only. It must not change the underlying signal-family styling, physiology state or control behaviour.

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
