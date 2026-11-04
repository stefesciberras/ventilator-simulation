# loppjuSIM Changelog

This is the cross-product development changelog for loppjuSIM-MV (Vent), loppjuSIM-Anaesth, and loppjuSIM-ITU. Product-specific details and older release histories may be maintained separately.

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
