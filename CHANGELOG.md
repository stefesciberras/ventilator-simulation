# loppjuSIM Changelog

This is the cross-product development changelog for loppjuSIM-MV (Vent), loppjuSIM-Anaesth, and loppjuSIM-ITU. Product-specific details and older release histories may be maintained separately.

## 1.3.0.6 — 2026-11-04 (experimental Cloudflare-native v2)
- Bumped displayed Vent and Anaesth/ITU application versions to **1.3.0.6**. Session Engine v1 remains default.
- Added a SQLite-backed Cloudflare Durable Object class (`SessionV2Room`) with a single authoritative Session Engine v2 reducer per room, WebSocket message processing, checkpoint-before-acknowledgement and canonical snapshot broadcasting.
- Added a Worker route at `/api/session-v2/ws` gated by `SESSION_V2_EXPERIMENTAL=1` and distinct long Cloudflare secrets. Browser access is authenticated by the Worker before a room can be opened; roles are passed internally, not trusted from browser messages.
- Updated Anaesth preview to connect through same-origin WebSocket using HTTPS/WSS and a test secret carried in the WebSocket subprotocol instead of a query string.
- Added SQLite Durable Object binding/migration in Wrangler configuration, with experimental feature disabled by default. No dedicated Node server is needed for this cloud route.
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
