# loppjuSIM Session Engine v2 — implementation status and remaining work

**Canonical technical status as of 4 November 2026**  
**Latest verified application versions:** `APP_VERSION = 1.3.0.26`, `EDUMON_APP_VERSION = 1.3.0.26` (both on `main`).  
**Implementation status:** **experimental, opt-in Anaesth pilot**, code merged and GitHub build/regression verified; **not a production-ready replacement for v1**.  
**Scope:** shared session engine and transport, Cloudflare authority, Anaesth-specific physiology and monitor bridge. The Vent and ITU products have **not** been migrated onto this full v2 physiology path.

> **Source-of-truth rule:** This document describes the current state after v1.3.0.26. Older, chronological entries in [SESSION_ENGINE_V2_FOUNDATION.md](SESSION_ENGINE_V2_FOUNDATION.md) remain useful for architectural rationale, but earlier statements such as “not wired into the application,” “BIS not yet implemented,” “oxygenation not yet authoritative,” or “ventilator controls greyed out” refer to past milestones and are no longer the current implementation. The release chronology remains in [../CHANGELOG.md](../CHANGELOG.md).

## 1. Purpose and runtime architecture

The objective of Session Engine v2 is a **single authoritative physiological and scenario runtime**, viewed and controlled by instructor and candidate clients without parallel, conflicting browser-local simulation engines.

```text
Instructor browser (v2 opt-in)      Candidate browser (v2 opt-in)
   | validated commands                 | permitted device / measurement commands
   |                                    |
   +--------------- WebSocket ----------+
                        |
             Cloudflare Worker gateway
             /api/session-v2/ws
                        |
             Durable Object per session
             - authenticated role boundary
             - serialized SessionEngineV2 reducer
             - clock and timed ticks
             - checkpoint -> persist -> receipt -> broadcast
                        |
              Anaesth adapter / shared kernels
              patient / drugs / gases / respiratory
              BIS / TOF / bronchospasm / alarms
                        |
                canonical revisioned snapshot
                        |
              Browser monitor presentation
              ECG/pleth and locally drawn waveforms
              canonical numeric EtSevo, EtCO2, SpO2,
              BIS, TOF, Ppeak, respiratory parameters
```

**Shared product-neutral reducer:** `src/session-v2/engine.mjs` processes validated commands with session epoch and revision fencing, command deduplication, per-runtime partitioning, reset and checkpoint export/restore. Modes represented in the engine are `standalone`, `simulation`, `teaching` and `self-directed`. Do **not** mistake a supported reducer mode for a fully integrated browser workflow across all products.

**Authority and transport:** `worker/sessionV2Room.mjs` implements a Cloudflare Durable Object room with SQLite-backed persisted checkpoints and a versioned session-specific action library. A single DO serializes accepted commands, persists state before acknowledging and broadcasts snapshots. Its instructor-controlled clock supports pause/resume and 0.5×, 1×, 2×, 4× simulation speeds. New/recovered rooms start paused and do not invent wall-clock catch-up while disconnected. The separate Node LAN server, file-backed host and IndexedDB components are **development/experimental transport or persistence implementations**, not proof of production offline multi-device authority.

**Browser entry:** `src/edumon/AnaesthSessionV2Preview.tsx` appears on the Anaesth route with `?sessionV2Preview=1`. The Cloudflare route additionally requires explicit experimental deployment configuration and distinct instructor/candidate test credentials. The usual application continues to use v1 by default. Browser identity, instructor permissions, reset and trusted effects must be enforced server-side; a hidden or disabled button is never an authorization boundary.

**Roles and semantics:** The pilot authorizes instructor-only patient, scenario-event severity, monitor-visibility, alarm-limit and silence changes, while designated candidate device operations and intermittent measurements are accepted. v2's *reducer* includes partitioning for Teaching, but the present Anaesth preview must not be described as a finished Standalone/Simulation/Teaching workflow with production-grade synchronization, LAN offline support or all scenario controls.

## 2. Canonical Anaesth state

The Anaesth reducer is `src/session-v2/adapters/anaesth.mjs`, with independent state partitions:

| State | Source of truth | Behaviour |
| --- | --- | --- |
| `patient` | Session checkpoint | Baseline HR/BP, SpO₂ ceiling, respiratory and ventilator **settings**, FiSevo and anaesthetic state |
| `actionRuntime` | Session checkpoint | Simulated time, active declarative ActionEffects and toggled actions; never browser-global v1 runtime |
| `gasRuntime` | Session checkpoint | End-tidal sevoflurane concentration and its uptake kinetics |
| `respiratoryRuntime` | Session checkpoint | Alveolar/estimated end-tidal CO₂, alveolar O₂ fraction, modelled SpO₂, effective RR/VT, ventilation, resistance, expiratory time constant and modelled Ppeak |
| `monitorRuntime` | Session checkpoint | BIS trend-driving numeric value and **last measured** TOF count/ratio/time |
| `bronchospasmRuntime` | Session checkpoint | Target and effective severity (0–100%), with a simulated-time response |
| `display` | Session checkpoint | Authoritative monitoring capabilities/eligibility (e.g. invasive BP, BIS, EtCO₂, temperature) |
| `alarmRuntime` | Session checkpoint | Thresholds, eligible active alarm evaluations, last completed NIBP reading and frozen NIBP alarm outcome, and simulated-time silence state |
| `clockControl` | Durable Object storage | Running/paused and playback speed; accompanies published snapshots |

**Distinguish settings from outputs.** FiSevo is **set**; EtSevo is a **modelled output**. Ventilator RR, VT, PEEP, timing, pressures and FiO₂ are **settings**; delivered VT, Ppeak, EtCO₂ and SpO₂ are **derived outputs**. A reconnect must restore canonical values and never reset kinetics merely because the browser page refreshed.

**Reset versus reconnect:** Reset Patient establishes the adapter baseline, empties active drugs/events, resets the session's simulated clock and restores gas, respiratory, measurement and alarm state to defaults. Reconnect resumes from the room checkpoint and rehydrates the UI without replaying commands. The **New Session** action creates a separate room and pinned action library. Older checkpoints may lack newly introduced fields; their fallbacks cannot reconstruct history that was never recorded.

## 3. Physiological models implemented

### 3.1 Declarative Drugs & Events

- The trusted v2 ActionDefinition library is resolved for a room on creation from configured Supabase sources, **pinned per session** and restored unchanged after DO restart; a curated pilot fallback is available when Supabase is not configured.
- The server validates action identity, permissions, effect vocabulary and the incoming payload; clients request action IDs and permitted parameters rather than sending arbitrary effect definitions.
- Shared `src/edumon/sharedActionPhysiology.mjs` applies ActionEffects to haemodynamics, depth, respiratory drive, neuromuscular block and obstruction. v1 supplies its existing ActionRuntime resolver; v2 supplies its checkpoint-owned resolver.
- This is an **educational action-effect model**, not full pharmacokinetic/pharmacodynamic equivalence to a clinical anaesthesia workstation.

### 3.2 Sevoflurane, depth, BIS and TOF

- `sharedVolatilePhysiology.mjs` provides shared uptake and MAC/depth functions; `gasRuntime.etSevoPercent` is advanced on authoritative simulated-time ticks and shown in both the experimental preview and gas footer.
- The monitor uses the established yellow Sevo labelling. Its experimental v2 FiSevo setting cannot also run a conflicting v1 gas uptake clock.
- `sharedAnaestheticMeasurements.mjs` supplies deterministic BIS depth targeting with lag and TOF count/ratio calculations; v2 checkpoints the BIS value. TOF is **intermittent**: a command stores the last measurement, which remains unchanged until the next measurement.
- **Limitations:** simplified volatile kinetics, no authoritative BIS signal-artifact/noise model, no complete display waveform history; the v2 TOF command is not a full timed peripheral nerve stimulator measurement.

### 3.3 Shared CO₂ and oxygenation

- `src/core/physiology/respiratory/sharedCo2Kinetics.mjs`: shared alveolar CO₂ mass balance. v2 integrates modelled EtCO₂ using effective ActionEffect-adjusted ventilation; v1 calls the same numerical kernel.
- `src/core/physiology/respiratory/sharedOxygenation.mjs`: shared educational alveolar oxygen mixing, metabolic depletion, V/Q/shunt/PEEP effects, haemoglobin saturation approximation and 2.5s/4s oximeter lag.
- V2 checkpoints alveolar O₂ fraction and modelled SpO₂; FiO₂, ventilation, obstruction, shunt and oxygen consumption influence the resulting value. The instructor-set SpO₂ remains a ceiling in this model.
- The regular Anaesth monitor's numerical SpO₂ is projected from v2 rather than the browser-local respiratory output. **This is not a clinically validated oxygen transport or blood-gas model.**

### 3.4 Bronchospasm

- Bronchospasm remains a **declarative Event** internally, with a single instructor 0–100% live severity slider. Its former separate Apply button was removed in v1.3.0.24; slider traffic is debounced.
- `src/session-v2/adapters/bronchospasm.mjs` turns the target into a smoothly approaching effective severity and one nonstacking `respiration.airwayObstruction` ActionEffect.
- The canonical resistance feeds **both** local capnogram morphology (obstructive upstroke/plateau) and the v2 pressure/ventilation projection.
- The current mode-aware **single-compartment educational mechanics approximation** raises resistive Ppeak for VC while generally maintaining set VT; PC/PSV are pressure-limited and may lose delivered VT. Ventilator settings and output remain separately represented.
- **Not finished:** true breath-by-breath pressure/flow coupling, dynamic expiratory flow, auto-PEEP, air trapping, trigger behaviour, more faithful SIMV/PSV/VG-PC response, and parity with the mature loppjuSIM-Vent mechanics.

## 4. Controls, waveform rendering and monitor sync

**Standard ventilator UI re-enabled in experimental v2** (v1.3.0.24). Both Monitor and Instructor view send validated commands for mode, FiO₂, PEEP, mandatory rate, target VT, inspiratory time/I:E, flow, inspiratory plateau fraction, pressure control, pressure support, VG pressure ceiling, expiratory termination sensitivity and SIMV synchronization window. The Cloudflare session owns the accepted setting; the browser must **not** calculate and publish a competing patient/ventilator state.

**Capnogram:** numerical EtCO₂, RR and simulated time come from the session. The browser locally samples the short visual waveform at approximately 50 Hz and repaints up to 20 fps; it does not own a second gas-exchange model. A real defect was fixed in v1.3.0.23: clock metadata was missing on subsequent `snapshot` messages and repeatedly froze presentation between messages. Both `welcome` and `snapshot` now carry running state and speed. Bounded interpolation must not advance indefinitely after heartbeats stop; pause/reset/reconnect retain canonical time.

**Alarm and NIBP integration** (v1.3.0.26):
- The v2 reducer evaluates active/eligible alarm conditions from checkpointed state; the established shared alarm controller still drives **presentation**: banner, colour, audible alert, escalation and lifecycle. End-to-end synchronization of **all** presentation lifecycle details is not yet demonstrated.
- **Never alarm for a hidden parameter.** Invasive BP, BIS and EtCO₂ alarms are ineligible when those displays are disabled. HR and SpO₂ are displayed by default; absence of a measured value cannot be treated as a pathological value. Temperature visibility is tracked, but a complete temperature alarm family is not yet implemented.
- **NIBP is measurement-only.** The UI completes its cuff cycle before submitting `monitor.nibp.measure`. The server then records a reading and evaluates limits once. Beginning inflation, editing limits, or subsequent invasive/continuous BP changes cannot retrospectively change that retained NIBP alarm outcome; only another completed measurement can.
- Instructor-only authoritative commands control monitor visibility, limits and alarm silence, with v2 state broadcast to peers. Candidate-initiated NIBP/TOF measurements are permitted by the pilot.
- Alarm silencing is maintained in authoritative simulated time. More comprehensive sound/lifecycle, alert acknowledgement and pause/disconnect behaviour require browser validation and potentially further consolidation.

## 5. Implementation status

| Subsystem | Status | Evidence / caveat |
| --- | --- | --- |
| Pure reducer, modes, permissions, epoch/revision fencing | **Implemented and regression-tested** | `engine.mjs`; product integrations not complete |
| Durable Object transport, checkpoint durability, instructor clock | **Implemented and regression-tested in harness** | Live deployment/auth hardening still open |
| Pinned trusted action library and shared ActionEffects | **Implemented for Anaesth pilot** | Curated fallback; broader catalogue and authoring open |
| Sevo uptake / EtSevo / depth | **Implemented in experimental Anaesth** | Simplified physiology |
| BIS and intermittent TOF | **Implemented in experimental Anaesth** | Artifact/signal and acquisition timing incomplete |
| CO₂ kinetics and continuously presented capnogram | **Implemented and regression-tested** | Visual browser smoothness still requires on-device confirmation |
| Bronchospasm severity, capnogram shape and Ppeak | **Implemented as pilot Event** | Educational mechanics, not full ventilator solver |
| Standard ventilator controls / synchronized settings | **Implemented in experimental Anaesth** | Full ventilator state-machine integration incomplete |
| Shared alveolar O₂ / SpO₂ authority | **Implemented and regression-tested** | Approximate gas exchange, not clinical validation |
| Alarm visibility, thresholds, silence and NIBP measurement gating | **Implemented and regression-tested in reducer/UI wiring** | Alarm presentation lifecycle and device E2E incomplete |
| Production standalone/simulation/teaching UX and Studio runtime | **Partially implemented / planned** | Engine modes do not imply full end-to-end product workflows |
| True offline/LAN-first shared authority across devices | **Not delivered as a production feature** | Node experiments do not provide automatic offline fallback |
| ITU and Vent full v2 adapters | **Not implemented to Anaesth parity** | Keep mature v1 engines operational |
| Full scenario orchestration, recording, assessment and replay | **Planned/partial in other subsystems** | Not established as fully v2 driven |
| Production identity, organizational isolation and monitoring | **Not ready** | Experimental token boundary only |

### Verified CI baselines

The following PRs were merged into `main`; GitHub Actions **Build** passed on their final heads:

| Version | PR | Build | Milestone |
| --- | --- | --- | --- |
| 1.3.0.21 | #459 | #1068 | Shared CO₂, authoritative EtCO₂ and capnography |
| 1.3.0.22 | #460 | #1071 | Local waveform sampling and bounded animation |
| 1.3.0.23 | #461 | #1076 | Bronchospasm Event, mode-aware Ppeak and clock metadata fix |
| 1.3.0.24 | #462 | #1080 | Live severity; regular ventilator control commands |
| 1.3.0.25 | #463 | #1084 | Shared oxygenation and authoritative SpO₂ |
| 1.3.0.26 | #464 | #1086 | Alarm/display limits, visibility, silence and NIBP completion |

Earlier v2 foundations (.0–.20) are described chronologically in [SESSION_ENGINE_V2_FOUNDATION.md](SESSION_ENGINE_V2_FOUNDATION.md). **Passing CI does not prove that the Cloudflare worker has been deployed or that two production browsers behave identically.**

## 6. Remaining work — prioritized

### P0 — verify and stabilize the current v2 pilot before expanding

1. **Two-browser manual/E2E verification:** instructor/candidate connect, authoritative welcome/revisions, live severity (0→100→0), ventilator mode and settings, EtSevo, EtCO₂ continuous rendering, SpO₂ after hypoventilation/FiO₂ changes, BIS/TOF, cuff completion, display gating, alarms, pause/speed, reset, browser reload, DO restart and long disconnect. Include mobile/tablet and a realistic high-latency connection.
2. **Correct any current UI authority mismatches:** verify settings on both panels hydrate from canonical snapshots after reconnect, repeated slider commands cannot revert to stale values, closed/paused rooms do not invent time, and locally generated monitor traces never overwrite checkpointed physiology.
3. **Harden alarm presentation synchronization:** evaluate acknowledgement, active/cleared/retained lifecycle, audio silence timers, alarm priority and disconnection against the canonical alarm state. The existing local alarm controller may still own browser-specific presentation state and must not diverge between peers.
4. **Protocol/version migration and older room testing:** explicitly migrate or safely initialize missing gas, respiratory, BIS/TOF, bronchospasm and alarm fields without silently manufacturing historical values. Test checkpoint schema and action-library compatibility across deployments.
5. **Separate actual Cloudflare deployment verification from GitHub CI:** confirm Worker binding/migration, Durable Object storage, action library credentials, negotiated WS protocol, rollout/rollback and cloud logs. Do not expose test secrets.

### P1 — complete shared physiological/device integration

6. **Unify v2 ventilator mechanics with loppjuSIM-Vent:** replace the limited educational `projectBronchospasmVentilation` estimate with the shared breath-by-breath equation-of-motion, pressure and flow controllers, modes (including SIMV/PSV and VG), mechanical/neural timing, trigger/cycle, dynamic airway resistance, pressure-volume loops, auto-PEEP and air trapping. Validate expected Ppeak/Pplat/delivered VT differences, and preserve existing Vent regression baselines.
7. **Physiology parity and responsiveness:** harmonize hypoxia, hypercapnia, haemodynamic response to volatile and IV hypnotics, respiratory depression, bronchospasm and recovery. Add boundary tests for extreme physiology; model should be deterministic at fixed state/time and explicitly labelled educational.
8. **Monitor device parity:** complete authoritative temperature and associated alarm family, capnogram/BIS artifacts, optional invasive monitoring channels, and intermittent TOF/NIBP acquisition timing and lifecycle. Do not generate alarms for absent/hidden measurements.
9. **Drugs & Events consolidation:** expose bronchospasm severity as a first-class versioned declarative ActionDefinition/Effect in the shared library and Scenario Studio, not only a hardcoded Anaesth pilot command; design onset/recovery and automatic scenario transitions. Ensure effects can never directly mutate rendered monitor values.

### P2 — deliver product workflows and local-first operation

10. **Studio integration:** build v2-aware scenario authoring, live stage/condition/event runtime, version-pinned scenarios and ActionDefinitions, scenario triggers (e.g. bronchospasm), instructor overrides, autosave/recovery and deterministic history. Align Standalone / Simulation / Teaching permissions.
11. **Instructor View + candidate experience:** implement tablet-friendly controls, monitor preview/secondary screen, participant joining, permissions, session ownership hand-off, teaching-mode candidate isolation, synchronized simulation-mode candidate actions and full session lifecycle.
12. **Local-first/offline:** implement a real LAN authority or peer/local-host negotiation and reconnection policy when internet is unavailable; distinguish browser offline cache from **shared session** offline authority. Secure split-brain avoidance, leases, fencing and conflict resolution.
13. **Vent and ITU migration:** implement separate v2 adapters using shared core physiological inputs, preserving product-specific device behaviour and UI without breaking v1.
14. **Security, scale and operations:** replace pilot tokens with authenticated user/organization roles, robust session authorization, rate limits, audit trails, data retention and consent policies; add monitoring, cost controls, observability and deployment rollback.
15. **Automated browser/end-to-end tests:** real two-client WebSocket + Cloudflare-like storage tests, visual waveform timing, reconnect, background-tab recovery, device states and alarm assertions. Keep reducer/unit tests as an additional gate rather than treating them as E2E proof.

## 7. DO NOT REGRESS — non-negotiable invariants

1. **v1 remains functional and default** until an explicitly tested migration plan replaces it; no silent v2 activation.
2. **One physiological authority per v2 session**. Browser local rendering may interpolate waveforms, but cannot compute and publish a competing EtCO₂, SpO₂, EtSevo, BIS or ventilator state.
3. **Persist before acknowledge/broadcast** and fence commands with revision/epoch and authenticated roles. Never accept client-injected effects, measurements or alarm conditions.
4. **Reconnect is not reset.** Gas fractions, drugs, BIS, SpO₂, CO₂, event severity, device settings, display flags, NIBP reading and alarm state survive a normal reconnect.
5. **Reset removes active drugs/events and restarts the physiological timeline**, including gases, measurements, oxygenation and alarms; member/session identity rules remain separate.
6. **Set parameters are not measured parameters**: FiSevo ≠ EtSevo; ventilator settings ≠ delivered VT/Ppeak; current MAP ≠ last completed NIBP.
7. **Bronchospasm remains an Event with a live severity control**, and affects capnogram shape and airway mechanics via the *same* airway-resistance state. Do not add a second independent browser obstruction control.
8. **Volume control and pressure control respond differently**: do not fake a rising Ppeak in every mode or arbitrarily preserve delivered VT under pressure limitation.
9. **The capnogram remains continuously presented between server snapshots** and uses server running/speed metadata on **both** welcome and every subsequent snapshot; stop extrapolation on stale clock.
10. **No alarm from a hidden channel.** Invasive BP, BIS and capnography require display eligibility; SpO₂ must reflect canonical physiology. NIBP alarm status changes only after completion of a real v2 measurement command.
11. **Instructor vs candidate permissions must be enforced at the reducer and transport**, never only through UI disabled states.
12. **Clinical models are educational approximations**, not validated monitors or ventilators. Never conflate CI pass, local tests and live cloud/browser verification.

## 8. Handover checklist for future development chats

Start from `main` after v1.3.0.26 and this document, consult the exact current source before editing, and work in small focused PRs with tests before merge. Do not rely on historic pilot wording for current implementation. Check version constants, pinned action library contracts, WebSocket protocol, adapter and UI authority boundaries. Prioritize **P0 two-browser verification and alarms** before expanding physiological modelling; next substantive architecture milestone is replacing pilot pressure projection with shared Vent breath mechanics and providing Scenario Studio-authored bronchospasm events. Maintain an explicit distinction between **implemented**, **experimental/partial**, **planned**, **historical/deprecated** and **live independently verified**.

**Historical approaches not to reintroduce:** browser-global ActionRuntime as v2 authority, duplicated browser respiratory gas exchange, one-Hz rebuild/frozen capnogram after clock snapshots, separate bronchospasm Apply button, greyed-out v2 ventilator controls with a duplicate preview selector, unconditional monitor alarms for hidden channels, continuous reassessment of old NIBP readings, resetting EtSevo on page refresh, untrusted browser-supplied identity/effects, and declaring a GitHub CI pass equivalent to a verified deployed session.


### Local-first extraction — 1.3.0.31 (6 November 2026)

Implemented: `src/session-v2/anaesthSession.mjs` owns the existing initial patient, pinned-catalogue adapter factory and presentation projections. Cloudflare consumes the same module. It performs no network calls, scheduling or storage. Checkpoint version 1 and Cloudflare protocol remain unchanged.

Next: build browser-local authority around the existing authority host and IndexedDB store, including coordinated catalogue/clock persistence, lease renewal and safe-paused recovery. Then introduce the session-client boundary and offline peer transport. No browser-local session mode or WebRTC pairing is enabled by this extraction.
