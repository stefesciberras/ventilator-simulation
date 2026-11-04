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

## Not yet implemented
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
Define snapshot durability and storage, trusted lease/epoch renewal, pluggable transport contract and Anaesth simulator adapter; then run browser integration tests before any v1 migration.
