# Session Engine v2 — experimental foundation

Status: **opt-in, not wired into the application**. Existing v1 session hooks and transport are unchanged.

## Scope of this first implementation
- Product-neutral synchronous command processor with one authoritative state per runtime
- Standalone, Simulation, Teaching, Self-directed runtime partitioning
- Instructor authority, participant connection tracking and epoch fencing
- Serialized simulator adapter (`initialState`, `apply`, `reset`)
- Command deduplication, bounded diagnostic event history, revisioned snapshots
- Non-destructive instructor recovery; candidate runtime isolation in Teaching
- Offline Node regression test: `node scripts/session-v2-engine-regression.mjs`

## Anaesth adapter milestone (v1.3.0.0 development)\n- Added `src/session-v2/adapters/anaesth.mjs`, containing a pure patient and device command reducer, FiSevo updates, a baseline reset, and an injectable trusted action evaluator.\n- `scripts/session-v2-anaesth-regression.mjs` exercises instructor and candidate commands, mocked drug deduplication, reset, epoch recovery and Teaching isolation.\n- This adapter is a staging integration contract only. It does **not** call the real ActionRuntime physiology and is **not** wired to the React application.\n- Version constants for Vent and Anaesth/ITU are 1.3.0.0 on the v2 feature branch. See root `CHANGELOG.md`.\n\n## Not yet implemented
Persistence, authenticated authority leases, transport adapters, wire protocol, replay across engine recreation, controlled simulation clock scheduling, snapshot schema migration, browser integration, simulator adapters, permission policies for individual device controls and two-browser end-to-end tests. Do not enable v2 in production until these are implemented and verified.

## Safety invariants
1. No React or transport dependency in the core.
2. Only a trusted host may authenticate a recovering instructor; `recover()` itself is **not** an authentication mechanism.
3. Never accept an old epoch's commands.
4. Never mutate patient/device state from transport callbacks except via accepted commands.
5. A disconnected instructor puts Simulation in Recovering, not Ended.
6. Teaching candidates act on their own runtime, not another learner's runtime.
7. Reset changes runtime state, not session membership or lifecycle.
8. Tests are a reducer-level first step, **not** a substitute for two-browser integration tests.

## Next implementation milestone
Integrate a pure Anaesth ActionEffect evaluator, define snapshot durability and storage, trusted lease/epoch renewal and pluggable transports; then run browser integration tests before any v1 migration.


## Checkpoint milestone (v1.3.0.1; experimental)
- `engine.exportCheckpoint()` captures session, runtimes, accepted-command receipts and event history.
- `SessionEngineV2.fromCheckpoint({ checkpoint, adapter, expectedSessionId })` validates the checkpoint and reconstructs the state without replaying a drug command.
- Live restores enter Recovering, invalidate the previous authority epoch and require a trusted host to authenticate instructor recovery.
- `checkpointStore.mjs` provides revision-checked memory and browser-local IndexedDB adapters. These are **not distributed authority leases**.
- The host must persist an accepted command before broadcasting/acknowledging it to participants; this atomic integration remains to be implemented.
- Run `node scripts/session-v2-checkpoint-regression.mjs` for restart/retention coverage.


## Trusted authority milestone (v1.3.0.2; experimental)
- `authorityStore.mjs`: transactional memory and IndexedDB lease/checkpoint ledgers; token+epoch+expiry fencing and strict checkpoint revision compare-and-swap.
- `authorityHost.mjs`: requires trusted `authenticate(credentials)`; client-provided actor IDs never grant permission.
- New commands run only against `SessionEngineV2.fork()`. The checkpoint must be durably committed before a success receipt is exposed; failure stops the host.
- A competing host cannot take over until the prior lease expires. Re-acquisition requires trusted instructor identity and creates a newer fenced epoch.
- `scripts/session-v2-authority-regression.mjs` tests double-writer attempts, expiry, recovery and persistence-failure rejection.
- Browser IndexedDB offers **single-origin** transaction atomicity only. An authenticated LAN/server coordinator is still required for multiple devices; this contract is NOT live in the app.


## LAN transport experiment (v1.3.0.3)
- `src/session-v2/lanGateway.mjs` handles a separate v2 WebSocket protocol with instructor/candidate authentication, request receipts, snapshots and resync.
- `server/session-v2-lan-server.mjs` provides an opt-in local test host at `/loppjusim-v2` on loopback port 4174, with a fixed Anaesth test patient and credentials supplied by the server operator.
- `scripts/session-v2-lan-regression.mjs` uses actual WebSocket clients to validate two-party parameter synchronization, command permission rejection, action deduplication and reconnect.
- This is a demonstration boundary only: server memory is not restart durable, the browser simulator has not been connected, no production trusted identity provider has been installed, and the test server does not expose the production Drugs & Events action library.
- Network security: use loopback by default. Cleartext WebSocket credentials on a LAN are unsuitable for Internet or untrusted-network deployment. Preserve the legacy v1 LAN server unchanged.


## v1.3.0.4 opt-in browser preview and durable LAN host
- `server/session-v2-file-authority-store.mjs` provides serialized, atomically renamed, fsync-backed checkpoint/lease storage for one Node process. Never run two processes against the same ledger; this is not distributed locking.
- The isolated LAN test host uses disk checkpoints and instructor-side lease renewal. Recovery after process restart requires expiry of the previous lease; recovered command receipts prevent duplicate Drugs & Events.
- `src/edumon/AnaesthSessionV2Preview.tsx` is shown only on the Anaesth route with `?sessionV2Preview=1`. It connects to the experimental LAN gateway and renders the canonical patient state through the existing monitor input, without taking over normal v1 sessions.
- `scripts/session-v2-file-restart-regression.mjs` verifies file-backed recovery and old-authority fencing.
- Preview is NOT an enabled production mode. Local demo drug evaluator is not loaded in the standalone LAN server; no production ActionRuntime or full physiological state model is yet integrated. No TLS, browser credential provisioning, multi-process lease coordinator or full two-browser refresh E2E test is claimed.


## Cloudflare Durable Object experiment (v1.3.0.6)
- Worker route `/api/session-v2/ws?sessionId=ana-preview` checks the experimental feature flag and two server-side secrets; the browser places its test credential in the `v2auth.<secret>` WebSocket subprotocol, not in a query string.
- `worker/sessionV2Room.mjs` owns one product-neutral v2 runtime per session ID, uses persisted SQLite-backed Durable Object storage checkpoints, accepts supported validated v2 commands and publishes revisioned snapshots after accepted commits.
- `wrangler.jsonc` declares a new SQLite Durable Object namespace via migration and leaves `SESSION_V2_EXPERIMENTAL` undefined by default (disabled).
- Anaesth preview `?sessionV2Preview=1` connects to same-origin `wss://.../api/session-v2/ws`; no standalone Node server is required for this route.
- Explicit opt-in requires `SESSION_V2_EXPERIMENTAL=1` in Cloudflare deployment settings and two distinct server-side secrets (`SESSION_V2_INSTRUCTOR_TOKEN`, `SESSION_V2_CANDIDATE_TOKEN`), each 32+ characters.
- Existing Node LAN experiment remains a development harness only; the live v1 session engine is untouched.
- Cloudflare prototype only: no true LAN offline authority, no production Auth integration, no real Anaesth/ITU/Vent physiology bridge, no session scenario runtime integration, no production candidate UI permissions beyond demo model. Not production-ready.


## v1.3.0.11 — controlled Anaesth Actions / physiology projection pilot
- `src/session-v2/adapters/anaesthPilot.mjs` holds three curated Anaesth fallback action definitions (Propofol, Fentanyl, Relaxant), uses the existing pure `createAnaesthDeclarativeActionEvaluator`, and derives an opt-in HR/BP/spontaneous ventilation/depth projection from the canonical ActiveEffects timeline.
- Cloudflare `SessionV2Room` accepts those trusted `action.invoke` IDs; its outgoing snapshots include `runtime.state.monitorProjection` (derived, **not persisted**) while baseline patient and ActiveEffects continue to be stored atomically.
- Preview renders projection into the existing monitor and shows action buttons, timeline, and instructor-only ticks. Existing v1 global ActionRuntime and regular simulator controls remain unchanged. Avoid invoking v1 actions concurrently with the pilot.
- A pilot demonstration is not the full physiology integration: no Supabase action definition resolution, full pharmacology, kinetics, BIS/EtSevo/alarms or authoritative continuous simulation clock. Next milestone must replace curated definitions with a **versioned trusted session action library** and wire the real product-specific physiology as a side-effect-free adapter.


## v1.3.0.12 — pinned Anaesth ActionDefinitions per session
- `src/session-v2/adapters/anaesthLibrary.mjs` loads the authority's trusted Anaesth/all ActionDefinition rows from Supabase REST when `SESSION_V2_ACTIONS_SUPABASE_URL` and secret `SESSION_V2_ACTIONS_SUPABASE_KEY` are present. Both are optional for continued pilot mode; if either is set, both are required. Do **not** give browser clients this credential or commit it to the repo. Prefer a narrowly privileged read-only credential compatible with the database's RLS.
- Each newly created v2 DO room atomically stores `{checkpoint, actionLibrary}`, establishing a session-owned, versioned definition set. On DO restart the pinned set is checked and rebuilt into the evaluator instead of re-reading changed Supabase definitions. Existing legacy rooms with no library keep their original curated pilot catalogue.
- The session WebSocket carries *public action metadata* (name/id/kind/access/mode) but no secrets, effect definitions, or user-supplied trusted parameters. Browser preview displays the pinned list and invokes only an ID.
- A configured Supabase fetch/validation failure aborts new room creation rather than switching to a different drug catalogue. Supabase changes therefore apply only to newly created session IDs.
- Current action catalogue version denotes the serialization schema (1), not a global published release hash. Global curriculum versioning and proper per-user authentication still require future work.


## v1.3.0.13 — Instructor reset and new-session controls
- Anaesth v2 preview shows Reset Patient and New Session only after a Worker `welcome.role === 'instructor'`; do not rely on the browser for authorization. The engine still enforces authority restrictions.
- Reset Patient sends `reset` to the existing v2 reducer. In the shared session modes it resets `session.clockMs` alongside the adapter baseline and clears ActionRuntime effects; the Durable Object atomically persists and broadcasts the result. In Teaching mode, resetting one candidate runtime must not rewind a global/shared clock.
- New Session creates a crypto-random `ana-<UUID>` room, automatically connects the instructor to the new Durable Object, and leaves the old room and pinned library unchanged. The instructor must share the new ID with candidates for their manual reconnect.
- Both operations ask for confirmation in the experimental UI; no new server, secrets or Supabase schema are required.

- The experimental preview now displays a recomputed neuromuscular block percentage and Relaxant onset elapsed/total simulated seconds. This is a diagnostic of v2 effects, not a measured TOF count or full clinical response; the manual simulation clock must advance for onset to occur.


## v1.3.0.14 — Durable Object authoritative clock
- Optional experimental v2 Cloudflare DO room stores `clockControl: {running:boolean,speed:0.5|1|2|4}` in Durable Object storage, separate from the checkpointed engine state.
- Instructor-only `clock.control` messages change pause/resume/speed. All connected clients receive clock metadata in welcome/snapshot packets, and command acknowledgements remain persist-before-broadcast.
- A single Durable Object alarm runs approximately every second when enabled, invoking the pure session reducer for bounded clock ticks (500 ms at 0.5×; 1000 ms times speed at 1×/2×/4×). Tick changes are committed before publication; only the server sets `internalClock` to avoid unbounded dedup receipt growth. The WebSocket gateway strips client-supplied internal clock flags.
- Paused by default for newly created and recovered rooms. Reconstructing a Durable Object from a live checkpoint stops clock progression until an authenticated instructor rejoins and explicitly resumes; do not catch up blindly from offline wall time.
- Reset/end stop the alarm and running flag; external manual `tick` is forbidden during clock run. v1 session infrastructure is unchanged.
- **Technical limitation:** Durable Object alarms have scheduling jitter, and discrete ticks reflect committed alarm executions rather than precise elapsed physical time. This is educational model timing, not a medical instrument.


## v1.3.0.15 — Pure shared EDUMON action physiology
- A single `src/edumon/sharedActionPhysiology.mjs` module models effect-driven HR, MAP, sympathetic stimulus, respiratory drive, airway obstruction, NMB, ventilatory-mode interaction and hard physiologic limits.
- v1 `src/edumon/actionPhysiology.ts` injects the existing browser-global v1 ActionRuntime numeric resolver. v2 `src/session-v2/adapters/anaesthPilot.mjs` injects the session-owned checkpointed v2 effect resolver. Neither path mutates the other session's ActionRuntime.
- The v2 projected output additionally carries effective depth derived from the same hypnotic effect; v1 continues to evaluate effective depth for its monitor separately so the canonical depth slider remains a baseline control. Do not apply the hypnotic effect twice.
- MANUAL/PSV may lose spontaneous VT/RR during blockade. Mandatory ventilation settings in VC-AC/PC-AC must not be suppressed by muscle relaxant.
- Shared physiology is pure and deterministic at a given simulationTime. Hard bounds are post-composition. The v2 monitor remains an experimental projection and its full ventilator/agent/monitor integration is not yet complete.


## v1.3.0.16 — volatile uptake and end-tidal depth integration
- `src/edumon/sharedVolatilePhysiology.mjs` contains side-effect-free uptake and MAC/depth functions derived from existing v1 Anaesth gas calculations. v1 injects its live alveolar ventilation; v2 injects estimated alveolar ventilation from the checkpointed action-adjusted respiratory state. The same mathematical uptake and MAC sensitivity functions are used in both.
- The v2 Anaesth adapter tracks `gasRuntime.etSevoPercent` on authoritative ticks, persists it with patient and drug effects, and sets it to 0 on reset. Missing `gasRuntime` on legacy sessions is initialized at the next tick.
- v2 preview projection uses EtSevo-derived depth as the effective volatile baseline and adds IV hypnotic effects once. The raw patient `anaestheticPhysiology.depthOfAnaesthesia` is not mutated by each tick.
- The v2 preview displays EtSevo and approximate MAC. BIS/TOF numeric measurement models and live v1 gas-output parity remain subsequent milestones. Do not interpret preview EtSevo as a measured concentration or a validated clinical pharmacology model.


## v1.3.0.17 — reconnect: hydrate volatile controls from checkpoint
- The experimental preview distinguishes canonical `runtime.state.patient.anaestheticGases.fiSevoPercent` (authoritative) from the local FiSevo *draft*. On welcome or a new canonical FiSevo value (including reset), the draft is synchronized; repeated clock updates do not replace an unsent draft.
- The preview displays `runtime.state.gasRuntime.etSevoPercent` only if it exists. Older checkpoints without a recorded end-tidal value must show an explicit missing-state indication, not a misleading zero.
- The DO checkpoint persists canonical FiSevo, nonzero EtSevo and simulation time; regression verifies reconstruction/welcome snapshot. If a genuinely old room was created before EtSevo became checkpointed, its historical uptake cannot be recovered: use **New Session** to start a clean test.


## v1.3.0.18 — avoid dual EtSevo authorities
- In the opt-in Anaesth v2 preview, `AnaesthSessionV2Preview` publishes the checkpoint's EtSevo to `EdumonApp`; `EdumonWorkspacePanel` passes it to `EdumonAnaGasControl`. The real gas footer and MAC therefore show the same authoritative EtSevo as the preview.
- The v1 `requestAnimationFrame` volatile uptake/depth controller must **not** run when `v2VolatileState` is supplied, including while reconnecting; locally administered FiSevo settings are disabled in this mode so v2 and v1 cannot independently own volatile state.
- The canonical reset/recovery engine and server state are unchanged: on v2 reset EtSevo = 0, FiSevo = 0; on reconnect EtSevo and FiSevo are read from the same checkpoint. Normal sessions omit `v2VolatileState` and keep full v1 local physiology.
- This resolves gas-footer authority only. BIS, TOF and other local device states in experimental v2 are not yet synchronized; they require separate authoritative integration.


## v1.3.0.19 — shared BIS and intermittent TOF authority
- `sharedAnaestheticMeasurements.mjs` is a pure model for depth-index BIS targeting with an 8-second lag, and a block/minimum-count-derived TOF response. v1 BIS retains its original local presentation jitter and v1 TOF remains an intermittent measurement; the underlying response functions are shared.
- v2 Anaesth `monitorRuntime = {bisValue, tofReading}` is initialized by the adapter and checkpointed with the session. The authoritative simulation tick advances BIS from the effective v2 depth after gas uptake. `monitor.tof.measure` calculates and stores count/ratio and `measuredAtSimulationTime` when explicitly requested (no client-supplied measurement fields).
- Both candidate and instructor may measure TOF, receiving the same resulting snapshot. TOF values remain fixed until another measurement even if the underlying blockade changes; reset clears TOF and restores BIS to awake 100. Older v2 checkpoints without monitorRuntime initialize their BIS at 100 on the next tick or TOF measurement.
- `EdumonBisTrend` renders authoritative BIS and local bounded presentation trace without running its browser-only physiology clock in v2. `EdumonAnaGasControl` displays checkpointed TOF and sends the measurement request to the v2 session gateway.
- The v2 read-only FiSevo footer uses neutral monitor text rather than yellow adjustable-control text; v1 adjustable colour is unchanged.
- **Not yet authoritative:** BIS noise/artifact, full monitor enable/disable semantics and complete waveform history; TOF v2 has no simulated 1.8-second acquisition delay. The measurements are educational simulation values, not clinical measurements.
