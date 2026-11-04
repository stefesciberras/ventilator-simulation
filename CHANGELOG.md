# loppjuSIM Changelog

This is the cross-product development changelog for loppjuSIM-MV (Vent), loppjuSIM-Anaesth, and loppjuSIM-ITU. Product-specific details and older release histories may be maintained separately.

## 1.3.0.20 — 2026-11-04 (restore yellow Sevo in experimental v2)
- Restore **bright yellow (#f1d35f) FiSevo label and numeric value** in the experimental v2 read-only gas footer, without making local FiSevo editing possible. Preserve v1 appearance and behaviour.
- Bump both application versions to **1.3.0.20**. Session physiology, BIS, TOF and clock are unchanged.

## 1.3.0.19 — 2026-11-04 (shared BIS/TOF monitoring and v2 FiSevo styling)
- Bumped both application versions to **1.3.0.19**; default v1 simulation architecture remains unchanged.
- Restored the **neutral FiSevo monitor colour** in experimental v2. The read-only canonical FiSevo row no longer uses the yellow editable-control class; disabled browser tinting is explicitly neutralized. The existing v1 adjustable-control styling is preserved.
- Extracted pure **BIS depth targets, 8-second response lag and TOF count/ratio model** into `sharedAnaestheticMeasurements.mjs`. Existing v1 BIS/TOF use the shared functions while keeping v1's local BIS jitter and intermittent TOF operation.
- Experimental v2 Anaesth now stores a deterministic **BIS value** in the canonical checkpoint and updates it on authoritative simulation ticks, using effective volatile/IV hypnotic depth. Browser monitor BIS displays that value and does not advance its own local BIS clock in v2 mode.
- New validated `monitor.tof.measure` command captures **intermittent TOF count and ratio**, calculated server-side from v2 neuromuscular block and minimum TOF effects at the time of measurement. The most recent reading and its simulation timestamp persist through reconnection and are cleared on Reset Patient. Candidate and instructor can request a measurement; no client-provided count/ratio is accepted.
- The established TOF display and BIS monitor consume the v2 monitor snapshot in opt-in preview mode. The v1 display and runtime remain untouched outside experimental v2.
- Added regressions for response kinetics, last-measurement semantics, malformed client payload rejection, checkpoint retention, reset, monitor wiring and read-only styling.
- **Scope:** BIS is a deterministic educational index without clinical noise/artifact modelling; v2 TOF measures immediately on command rather than simulating the v1's short acquisition delay. Waveform history remains client presentation, not a persisted waveform. Full alarm gating and other monitor/device synchronization remain planned.

## 1.3.0.18 — 2026-11-04 (single authoritative volatile display in v2 preview)
- Bumped Vent and Anaesth/ITU versions to **1.3.0.18**, preserving the normal v1 simulator.
- Fixed the experimental v2 preview/full Anaesth gas-panel split-brain state. Previously, the preview restored checkpointed `gasRuntime.etSevoPercent` but the full monitor footer retained its *own* React ref/state and kept calculating sevo uptake on a browser animation loop. This made a page refresh show EtSevo 0 in the monitor despite a restored server checkpoint, and allowed the full monitor EtSevo to remain high after v2 Reset Patient.
- V2 preview now publishes each authoritative EtSevo snapshot to its parent. That value is passed to `EdumonWorkspacePanel` and `EdumonAnaGasControl`. Only when `sessionV2Preview=1`, the full gas footer and MAC read the canonical v2 concentration, and the competing local v1 uptake/depth loop and local FiSevo manipulation are disabled.
- Connecting/disconnecting clears stale derived volatile display. A missing legacy EtSevo appears as unavailable rather than a fabricated zero, pending a new checkpoint.
- Added regression testing of v2-only monitor wiring and restored/reset canonical FiSevo/EtSevo. No normal v1 gas UI calculation changes.
- **Remaining gap:** BIS, TOF and other standard monitor/device controls are still local in the experimental v2 preview; full session/device authority and display synchronization remain future work.

## 1.3.0.17 — 2026-11-04 (v2 reconnect volatile-state synchronization)
- Bumped both products to **1.3.0.17**, preserving the production v1 simulator and Cloudflare v2 authority.
- Fixed the experimental Anaesth v2 preview's FiSevo editor: its draft now initializes from the **canonical session patient** on the first welcome snapshot and updates only when the authoritative FiSevo actually changes (including reset). Continuous tick snapshots do not overwrite an unsent user edit. Connecting/disconnecting clears stale draft-sync provenance.
- Distinguished **missing legacy EtSevo state** from an actual measured/modelled zero: absent `gasRuntime` is explicitly marked not recorded; no fabricated 0.00 MAC value is displayed.
- Added a Cloudflare Durable Object reconstruction regression that checks nonzero end-tidal sevoflurane, inspired sevoflurane and simulation time survive disconnection/recovery without reinitialization.
- Important limitation: checkpoints created before v1.3.0.16 have no persisted `gasRuntime`. Their historical EtSevo cannot be reconstructed; a fresh simulation must be used to test persisted volatile uptake.
- No changes to drug models, normal v1 anaesthetic settings, existing v2 clock or device alarms.

## 1.3.0.16 — 2026-11-04 (shared volatile uptake and session-persisted EtSevo)
- Bumped Vent and Anaesth/ITU application versions to **1.3.0.16**, retaining default production Session Engine v1.
- Extracted the existing exponential sevoflurane end-tidal uptake equation, alveolar-ventilation fallback and MAC-to-depth relationship into the pure `src/edumon/sharedVolatilePhysiology.mjs`. The v1 Anaesth gas control now calls these functions with its existing live gas-exchange output and animation-clock increments. The existing v1 anaesthetic depth helper delegates to the same shared MAC-to-depth formula.
- Session Engine v2 Anaesth ticks now integrate end-tidal sevoflurane using the shared uptake equation with v2's checkpointed effective ventilation and simulation time. The resulting `gasRuntime.etSevoPercent` is persisted in the canonical session checkpoint, synchronized across peers and restored without replay on reconnect; reset restores EtSevo=0.
- The v2 monitor projection composes end-tidal volatile-derived baseline depth and IV hypnotic ActionEffects once, preserving model purity and avoiding duplicate drug application. The preview explicitly shows EtSevo and approximate MAC.
- Added regression coverage for uptake timestep composition, MAC sensitivity, wash-in/wash-out, unchanged raw patient controls, reset, checkpoint recovery and older checkpoints lacking `gasRuntime`.
- **Scope:** The v2 gas calculation uses estimated rather than the v1 browser's live respiratory gas-exchange output. Complete BIS/TOF measured monitoring, depth-dependent haemodynamics, agent-dependent alarm gating, EtCO2 and waveform/device parity remain future work. Clinical-dose accuracy is not claimed.

## 1.3.0.15 — 2026-11-04 (shared Anaesth/ITU ActionEffect physiology)
- Bumped Vent and Anaesth/ITU versions to **1.3.0.15**; existing production Session Engine v1 and v2 authority, clock and storage contracts remain in place.
- Extracted the existing EDUMON ActionEffect-mediated haemodynamics, spontaneous/mandatory respiratory mechanics, neuromuscular blockade, sympathetic stimulation, anaesthetic-depth sensitivity and hard physiological bounds into `src/edumon/sharedActionPhysiology.mjs`. The pure module accepts a patient baseline and injected numeric-effect resolver; it never reads the browser-global ActionRuntime or calls external services.
- **v1 EDUMON** action physiology delegates to the shared pure module through its existing global ActionRuntime resolver, preserving the previous calculation order and output bounds.
- **v2 Anaesth** monitor projection now delegates to the *same module*, resolving effects from the canonical per-session v2 ActionRuntime. In particular, Relaxant suppresses spontaneous mechanical breathing without reducing set mandatory ventilation in VC-AC/PC-AC; propofol/fentanyl/nociceptive/sympathetic effects use the same response path.
- Aligned v2 effect constraints with v1 partial-intensity/onset interpolation for minimum, maximum, block-increase and block-decrease.
- Added cross-version regression cases checking baseline purity, time-course parity, pressure/HR/respiratory responses, MANUAL/PSV/mandatory ventilation, bounds, depth, sympathetic stimulation and constraint interpolation. Updated the action-physiology regression's source assertions to cover the new shared module.
- **Scope limitations:** the v2 monitoring preview remains opt-in; this does not yet make end-tidal volatile uptake, BIS, capnography, waveform phase, device state or alarm parity authoritative. Drug effects remain educational model approximations, not clinical dosing guidance.

## 1.3.0.14 — 2026-11-04 (experimental Cloudflare authoritative clock)
- Bumped both product versions to **1.3.0.14**. The production v1 simulator remains unchanged.
- Introduced a single server-owned simulation clock in the Cloudflare Durable Object for opt-in Session Engine v2. A Durable Object alarm advances the authoritative checkpoint in 1-second real-time intervals, at selected speeds 0.5×, 1×, 2× or 4×, then broadcasts persisted canonical snapshots to instructor and candidate. Drug onset/recovery now progresses when the clock is running without manual ticks.
- Clock pause/resume and speed changes are accepted only from Worker-verified instructors; connected candidates receive current running/paused status and speed as read-only metadata. Manual step commands are disabled in the preview and rejected by the server while the clock runs.
- Clock is **paused by default**, including after DO reconstruction/recovery, and requires an instructor to explicitly resume. This avoids replaying elapsed wall time after an outage or reconnect. Reset/end stops alarms, with reset restoring zero simulated time and clearing effects.
- Server-only automatic tick commands do not accumulate dedup receipts; external drug/parameter commands retain persisted command deduplication.
- Added deterministic Cloudflare alarm/dual-client regression covering speeds, candidate permission rejection, pause, reset, recovered checkpoint, and resumed time.
- **Limitations:** Cloudflare alarm scheduling is best-effort and not a clinical-grade precise timing mechanism; on delays the model advances in bounded discrete steps rather than replaying large wall-time gaps. The v2 monitor projection is still limited, and no offline LAN authority is included.

## 1.3.0.13 — 2026-11-04 (Anaesth v2 session reset and fresh-room controls)
- Bumped Vent and Anaesth/ITU application versions to **1.3.0.13**; all v1 simulator session flows remain unchanged.
- Added **Reset Patient** and **New Session** controls to the experimental Anaesth v2 preview, visible only when the Worker confirms the WebSocket as an instructor. Both actions require confirmation.
- **Reset Patient:** issues an instructor-authorized v2 `reset` command; restores baseline monitor settings, clears active Drugs & Events, resets drug simulation time and the authoritative shared session clock to zero, persists before receipt and broadcasts the new snapshot to connected peers. Retains the same room, pinned drug catalogue, credentials and connections.
- **New Session:** generates a unique `ana-<UUID>` session ID, disconnects the old preview socket and automatically connects the instructor to the new Durable Object room. This room starts with clean defaults and the latest configured action catalogue. The previous room is retained, and candidates must join the **new** session ID themselves.
- The Worker includes the verified connection role in the `welcome` packet for UI gating; server-side permission checks remain authoritative. Candidate reset commands are still rejected even if submitted outside the UI.
- Expanded Cloudflare Durable Object regressions to cover rejected candidate reset, accepted instructor reset, cleared drugs, zeroed clock, synchronized snapshots, checkpoint recovery after reset, and independent new-room creation.
- Added read-only neuromuscular block percentage and Relaxant simulated onset indicators to clarify why a newly invoked 120-second onset drug has no immediate monitor effect. Includes candidate invocation and reset regressions.
- Experimental v2 only; not a full simulator physiology reset or automatic candidate migration across sessions.

## 1.3.0.12 — 2026-11-04 (session-pinned Anaesth ActionDefinitions)
- Bumped both product versions to **1.3.0.12**, keeping Session Engine v1 unchanged and v2 experimental.
- Added a strict, server-side-only Anaesth ActionDefinition loader from Supabase REST (when `SESSION_V2_ACTIONS_SUPABASE_URL` and `SESSION_V2_ACTIONS_SUPABASE_KEY` are configured), accepting only supported Anaesth/all action settings, known effect targets/operations, and bounded inputs. Fail closed if a configured Supabase catalogue is unavailable, invalid, or empty.
- On creation of each new Cloudflare Durable Object session, persist the **validated ActionDefinition snapshot together with the initial checkpoint**, and use that fixed library for all further command processing and reconstruction. Subsequent edits in Supabase do not silently change active-scenario effects. Existing v1.3.0.11 sessions without a pinned library continue with their original pilot definitions.
- Without optional Supabase connection settings, new experimental rooms explicitly retain a pinned three-drug pilot fallback.
- The v2 preview now shows the **session-pinned catalogue** and lets instructor/candidate invoke selected permitted actions, replacing hard-coded three-drug buttons. User-provided definitions are never accepted from WebSocket commands.
- Added regression coverage for catalogue validation, unsafe effects, failed fetches, versioned pinned recovery, duplicate effects and Durable Object library retention. Production v1 drugs and session behaviour are unchanged.
- **Limitations:** This is not a live-immutable Supabase release/version table or full Anaesth pharmacodynamics. Cross-product adapters, full waveform/monitor control, true LAN offline transport and real role-based Supabase user authentication remain planned.

## 1.3.0.11 — 2026-11-04 (experimental Anaesth ActionEffects projection)
- Bumped both product versions to **1.3.0.11**. All production Session Engine v1 flows remain default.
- Connected three trusted, explicitly curated Anaesth fallback action definitions (Propofol, Fentanyl and Relaxant) to the opt-in Cloudflare Durable Object v2 action evaluator.
- Action invocation persists declarative ActiveEffects in the canonical checkpoint; drugs never directly mutate raw patient parameters. An independent pure, bounded projection calculates selected HR/BP/respiratory/depth outputs from checkpointed simulation time and active effects without reading or writing the v1 global ActionRuntime.
- Experimental preview exposes drug actions and instructor-only explicit 1-second / 10-second simulation advances, displaying simulated time, spontaneous RR, depth, and active effect count. Projection is sent as a read-only derived view, while the raw patient and effects remain authoritative.
- Added CI coverage of drug onset, block, simulated time, duplicate prevention, candidate tick restriction, checkpoint reconstruction and reset.
- **Not production parity:** the three pilot action definitions are curated copies, not the live Supabase action library. Preview is not the full Anaesth drug/physiology/monitoring engine, does not model real PK/PD or alarms, and can coexist with unsynchronized v1 controls. Offline LAN authority remains unimplemented.

## 1.3.0.10 — 2026-11-04 (Cloudflare Worker API routing fix)
- Bumped Vent and Anaesth/ITU application versions to **1.3.0.10**, leaving v1 runtime behaviour unchanged.
- Confirmed Cloudflare SPA asset fallback intercepted `/api/session-v2/status` and returned index.html instead of JSON, preventing Worker diagnostics and WebSocket upgrade requests.
- Set Wrangler `assets.run_worker_first` to `["/api/*"]` so Worker API endpoints execute before the static SPA fallback; normal React page and asset requests still use the existing SPA routing.
- Added a CI regression enforcing Worker-first API routing, SPA fallback and the v2 Durable Object binding.
- After deployment, `/api/session-v2/status` should respond with nonsecret JSON indicating readiness; live deployment and actual WebSocket connectivity must still be verified.

## 1.3.0.9 — 2026-11-04 (Cloudflare WebSocket handshake diagnostics)
- Bumped Vent and Anaesth/ITU application versions to **1.3.0.9**. Existing production v1 sessions are unchanged.
- Added a Cloudflare Worker readiness endpoint `GET /api/session-v2/status` returning only `ready` and nonsecret configuration reason; it never reveals tokens or credential-derived data.
- Forward the original WebSocket upgrade request to the Durable Object using `new Request(request, { headers })`, retaining the runtime's original handshake semantics while stripping the credential-bearing subprotocol.
- Failed Durable Object upgrade requests return a controlled 503 and log only the error type, never credentials or request headers.
- The opt-in Anaesth preview now reports WebSocket close codes and checks the readiness endpoint after retries fail, distinguishing missing Cloudflare configuration from a configured gateway with a handshake failure.
- Actual live Cloudflare runtime/deployment status still requires external verification. The favicon.ico 404 is unrelated.

## 1.3.0.8 — 2026-11-04 (Cloudflare WebSocket subprotocol handshake)
- Bumped Vent and Anaesth/ITU application versions to **1.3.0.8**; all production v1 sessions remain unchanged.
- Corrected v2 Cloudflare WebSocket handshake negotiation: the browser now offers a fixed, public `loppjusim-v2` subprotocol alongside the credential-bearing, hex-encoded token.
- The Worker validates the secret, strips the credential-bearing token from the internal Durable Object request, forwards only the public subprotocol, and the Durable Object selects `loppjusim-v2` in its HTTP 101 response. Secrets are never echoed in the selected protocol.
- Added regression assertions for 101 responses and the negotiated protocol. This addresses browser handshake failures despite valid credentials.
- The v2 preview remains experimental, disabled by feature flag unless explicitly configured. A successful build does not guarantee the live Cloudflare deployment or secret configuration.

## 1.3.0.7 — 2026-11-04 (Cloudflare preview credential encoding fix)
- Bumped Vent and Anaesth/ITU displayed application versions to **1.3.0.7**. Session Engine v1 remains unchanged.
- Fixed browser WebSocket constructor failure when instructor/candidate test secrets include punctuation or non-ASCII characters. Both browser and Cloudflare Worker use a validated UTF-8 hex-encoded subprotocol, not the raw secret string.
- Added bounded reconnect attempts, a 10-second welcome timeout and explicit connection-failure messages instead of indefinitely displaying Connecting.
- Added regression tests for subprotocol encoding/decoding, special characters, Unicode, invalid tokens and oversized credentials.
- **Security:** encoding is reversible and not encryption. Use WSS only, rotate secrets exposed in logs or shared console traces, and replace these demo shared secrets with proper per-user authentication before production use.

## 1.3.0.6 — 2026-11-04 (experimental Cloudflare-native v2)
- Bumped displayed Vent and Anaesth/ITU application versions to **1.3.0.6**. Session Engine v1 remains default.
- Added a SQLite-backed Cloudflare Durable Object class (`SessionV2Room`) with a single authoritative Session Engine v2 reducer per room, WebSocket message processing, checkpoint-before-acknowledgement and canonical snapshot broadcasting.
- Added a Worker route at `/api/session-v2/ws` gated by `SESSION_V2_EXPERIMENTAL=1` and distinct long Cloudflare secrets. Browser access is authenticated by the Worker before a room can be opened; roles are passed internally, not trusted from browser messages.
- Updated Anaesth preview to connect through same-origin WebSocket using HTTPS/WSS and a test secret carried in the WebSocket subprotocol instead of a query string.
- Added SQLite Durable Object binding/migration in Wrangler configuration, with experimental feature disabled unless explicitly configured. No dedicated Node server is needed for this cloud route.
- On object reconstruction, the v2 engine restores from persisted checkpoint and fences prior epochs. Production Drugs & Events, ITU/Vent adapters, full physiology checkpoint parity, and true offline LAN transport remain outstanding.
- **Requires Cloudflare configuration:** set two distinct 32+ character `SESSION_V2_INSTRUCTOR_TOKEN` and `SESSION_V2_CANDIDATE_TOKEN` secrets and set `SESSION_V2_EXPERIMENTAL=1` before opting into the preview. Secrets must not be committed to Git.
- **Safety:** the experimental cloud room uses an Anaesth demo baseline, not the real Scenario Studio or ActionEffect library. Do not enable for live teaching until full clinical parameter parity and access-control hardening are verified.

## 1.3.0.5 — 2026-11-04 (LAN preview heartbeat reliability)
- Bumped Vent and Anaesth/ITU application version constants to **1.3.0.5**.
- Corrected the experimental LAN host's WebSocket upgrade handler to register heartbeat/pong liveness directly on each upgraded connection, preventing active instructor/candidate sessions from being terminated by an unhandled pong after successive heartbeat intervals.
- No changes to the production Session Engine v1 or production simulation physiology.

## 1.3.0.4 — 2026-11-04 (development; opt-in LAN browser preview and file durability)
- Bumped Vent and Anaesth/ITU application versions to **1.3.0.4**. Existing v1 session paths remain the default.
- Added a single-process Node file authority store using serialized transactions, fsync, atomic rename and revision/lease fencing. The LAN test server now restores canonical patient and action snapshots after restart once the previous lease expires.
- Added instructor-controlled lease renewal in the experimental LAN host. A competing host cannot take over before lease expiry.
- Added the Anaesth Session v2 preview behind `?sessionV2Preview=1`. It connects to the separate LAN v2 endpoint, displays session revision/epoch, sends instructor HR and candidate/instructor FiSevo controls and applies received canonical patient snapshots to the actual Anaesth monitor.
- Added a file-backed restart regression verifying retained FiSevo/Propofol effect state, expired lease recovery, duplicate command receipt reuse and rejection of stale authority.
- **Still experimental:** preview does not replace v1 product teaching hooks, the v2 demo does not use real production Drug/Action definitions or scenario runtime, waveform/gas kinetic continuity is not yet retained, no TLS/production authentication is configured. File store supports only a single running Node process using the same directory; no multiprocess locking.
- Cloudflare/static hosting does not run the Node LAN server. Browser preview requires separately starting the local test server.

## 1.3.0.3 — 2026-11-04 (development; experimental LAN transport)
- Bumped Vent and Anaesth/ITU application versions to **1.3.0.3**; active Session Engine v1 remains unchanged.
- Added an isolated v2 WebSocket gateway: verified instructor/candidate joins, durable-authority command receipts, and revisioned canonical snapshot broadcasts.
- Gateway ignores untrusted client role and participant IDs when authorizing mutations. Invalid and oversized messages are rejected.
- Added an explicitly opt-in, separate Node LAN test server using a fixed Anaesth demo patient, server-configured credentials, and default loopback binding. The existing v1 server and /eduvent-session endpoint are unchanged.
- Added real two-client WebSocket regression tests for bidirectional parameter updates, drug-command deduplication, unauthorized edits, synchronization and reconnect.
- **Not deployed as live session logic:** demo host uses memory-only storage, not disk-backed restart durability; Drugs & Events run in the test adapter only, and no UI or production scenario integration exists. Plain ws:// must only be used in a trusted test network, not exposed publicly.
- Next: durable server checkpoint store, secure provisioning, browser client adapter and full instructor/candidate UI tests.

## 1.3.0.2 — 2026-11-04 (development; trusted authority boundary)
- Bumped Vent and Anaesth/ITU application versions to **1.3.0.2**; the v2 engine remains disabled in the live simulators.
- Added transactional authority-ledger contract with secure short-lived lease tokens, expiry, host fencing epochs and revision-checked checkpoint commits.
- Added a memory authority ledger for tests and a browser-local IndexedDB v2 ledger that writes leases and checkpoints in the same transaction. Browser-local storage **does not establish cross-device LAN authority**.
- Added a trusted-host coordinator requiring an injected identity verifier, verified participant identity on each command, instructor-only lease renewal and takeover after old lease expiry.
- Accepted commands are first evaluated on an isolated engine fork and then committed; no accepted receipt is returned until the checkpoint transaction succeeds. Ambiguous, stale or failed writes stop the host.
- Added regression tests covering competing hosts, expired leases, instructor takeover, command epoch fencing, recovered action deduplication, candidate permissions and failed-checkpoint fail-closed behavior.
- **Not yet complete:** trusted authentication is an injectable host contract, not a deployed identity service. LAN/server authoritative persistence, transport signaling, UI wiring and two-browser tests remain outstanding.

## 1.3.0.1 — 2026-11-04 (development; v2 checkpoint foundation)
- Bumped both app version constants to **1.3.0.1**, retaining existing production v1 session behavior.
- Introduced versioned v2 checkpoint export/import with canonical patient/runtime state, participant roles, simulation clock, authority epoch, bounded event history and accepted-command receipts.
- Recovery after engine recreation retains ActionEffect snapshots without replaying drugs; a live instructor session resumes in Recovering with a new fenced epoch until the trusted host authenticates recovery. Ended sessions remain ended.
- Added revision-checked checkpoint storage interfaces: an in-memory test store and an offline browser IndexedDB store (atomic within one browser database).
- Added checkpoint regression tests for duplicate drug prevention, stale-epoch commands, candidate isolation, snapshot validation, ended sessions and stale-write rejection. Included in `npm run test:core`.
- **Not yet production-capable:** session restore is not wired to the UI, stores do not establish a cross-device authority lease, and browser peer/transport integration remains unimplemented. A trustworthy single-writer authority and persistence-before-ack protocol are prerequisites for enabling v2.

## 1.3.0.0 — 2026-11-04 (development; v2 remains opt-in)

### Versioning
- Bumped the displayed versions of both the Vent application (`src/appVersion.ts`) and the shared Anaesth/ITU application (`src/edumon/appVersion.ts`) to **1.3.0.0** on the `feature/session-engine-v2-foundation` branch.
- This is a **development version**, not evidence of a deployed, complete v2 engine.
- The npm package version remains `0.1.0` because npm package versions use three-component SemVer; four-component product versions are maintained in application constants.

### Session Engine v2 — shared across all products (experimental)
- Added a product-neutral authoritative command processor with canonical runtime snapshots, revisions and command deduplication.
- Added instructor authority epochs for rejecting stale connections after recovery.
- Added session lifecycle handling for start, disconnect, instructor recovery, reset and explicit termination.
- Added independent candidate runtimes for Teaching mode; one shared runtime for Simulation mode.
- Restricted Simulation to one candidate and forwarded the actor role to product adapters.
- Kept Session Engine v1 and all current product UIs untouched; **v2 is not enabled in production**.

### Anaesth integration boundary — first product adapter (experimental)
- Added `src/session-v2/adapters/anaesth.mjs` with pure, serialized patient, ventilator-setting, anaesthetic-gas and ActionRuntime snapshot containers.
- Added validated commands for instructor patient parameters, permitted device settings and FiSevo; the host must still enforce full product-specific candidate permissions.
- Added an injectable, trusted Drugs & Events evaluator boundary: incoming clients can submit action IDs/intensities, **not arbitrary effects or snapshots**. A separate pure declarative action evaluator can now be injected from a trusted local definition library; no changes are made directly to measured clinical values.
- Reset recreates baseline patient and ActionRuntime state, including volatile agent settings, without ending the session.
- The existing Anaesth physiology, ActionRuntime singleton, waveform generators and React components remain unchanged.

### Session retention audit
- Added `docs/SESSION_ENGINE_V2_RETENTION_INVENTORY.md`, a field-level canonical retention and synchronization inventory for Anaesth/ITU monitors, Vent patient mechanics and ventilator settings, Drugs & Events, alarms, scenario runtime, measurement histories and session authority.
- The inventory differentiates canonical, derived, and candidate-local presentation state and explicitly marks v2 persistence, physics checkpoints and browser rehydration as not implemented.

### Regression coverage
- Added transport-free reducer tests for command deduplication, recovery epochs, reset, termination and Teaching isolation.
- Added Anaesth adapter tests for instructor/candidate mutation paths, FiSevo, ventilator settings, rejected unauthorized changes, mock drug execution exactly once, reset and independent Teaching candidates.
- Wired v2 reducer, Anaesth adapter and declarative ActionEffect regression suites into `npm run test:core`.

### Still required before activating v2
- Authenticated authority lease and durable snapshot/checkpoint storage.
- Local LAN and cloud transport adapters with initial join, reconnect and conflict recovery.
- Pure physiology/ActionEffect integration and derived monitor-state persistence.
- Full candidate permissions, pause/clock handling, multi-browser integration and regression testing on Anaesth, ITU and Vent.
- Migration plan, rollback switch and production validation.

### Do not regress
- Existing Standalone, Simulation, Teaching and Self-directed mode contracts.
- Independent candidate state in Teaching; shared bidirectional state in Simulation.
- LAN-first/Internet-independent Simulation wherever the established local runtime supports it.
- Recoverable instructor sessions must not be implicitly ended by refresh/disconnection.
- Reset patient/device/drug/history state without ending the session.
- Keep the simulator physiology and shared Actions definitions rather than duplicating them in session code.
