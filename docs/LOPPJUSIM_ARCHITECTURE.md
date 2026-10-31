# loppjuSIM Canonical Architecture

**Status:** Canonical source of truth  
**Updated:** 31 October 2026  
**Repository:** `stefesciberras/ventilator-simulation`

This document is the architectural source of truth for the loppjuSIM platform. It supersedes older handover summaries when they conflict with current code or the decisions recorded here. Historical internal names such as `EDUSIM`, `EDUVENT`, `EDUMON` and `scenario-builder` remain in source paths, database objects and compatibility contracts where migration would be disruptive; they should not be interpreted as current product naming.

## 1. Current product family and baselines

| Product | Current public role | Baseline |
|---|---|---:|
| loppjuSIM-MV | Mechanical ventilation simulator | `0.83.0.69` |
| loppjuSIM-Anaesth | Anaesthesia patient-monitor simulator | `1.2.8.27` |
| loppjuSIM-ITU | Intensive-care patient-monitor simulator | `1.2.8.27` |
| loppjuSIM-Studio | Shared scenario authoring environment | `0.13.0` |
| loppjuSIM Core | Shared application, simulation, teaching, scenario and persistence infrastructure | shared source, not independently versioned |

Canonical product IDs remain `mv`, `anaesth` and `icu`. Legacy internal identifiers and routes may continue to use `eduvent`, `edumon-ana`, `edumon-icu`, `edusim` and `scenario-builder` for compatibility.

## 2. Architectural principle

The platform is modular. **loppjuSIM Core owns generic simulation, scenario, teaching, session, persistence and shared UI infrastructure. Product modules own device behaviour and physiology.**

```text
                         loppjuSIM
                             │
                       loppjuSIM Core
                             │
       ┌─────────────────────┼─────────────────────┐
       │                     │                     │
 loppjuSIM-MV        loppjuSIM-Anaesth        loppjuSIM-ITU
 ventilator          anaesthesia monitor       ICU monitor
 mechanics           + gases/BIS/NMB           + ICU physiology
       │                     │                     │
       └─────────────────────┼─────────────────────┘
                             │
                     loppjuSIM-Studio
                  product-neutral authoring
```

A generic feature should be implemented once in Core when it is meaningful across products. Product code should expose its capabilities through adapters/registries rather than force Studio, teaching, session or persistence code to know product physiology.

### 2.1 Core responsibilities

Core/shared infrastructure includes:

- product routing and platform navigation;
- common simulation shells and top bars;
- shared session contracts and transport abstractions;
- Standalone, Simulation and Teaching runtime-mode contracts;
- scenario domain types, authoring contracts and runtime sequencing;
- shared teaching media, questions, polls, laser/pointer and waveform-sharing infrastructure;
- session logging and diagnostics;
- shared alarm/display primitives where appropriate;
- common persistence and scenario/profile repositories;
- local-first simulation/session infrastructure;
- Drugs & Events action/effect runtime primitives.

### 2.2 Product responsibilities

Each simulator remains responsible for:

- physiology and device mechanics;
- product-specific state and measurements;
- how a scenario snapshot is interpreted/applied;
- how product measurements and parameter changes are exposed to Studio;
- product-specific trigger matching where generic Core cannot do so;
- translating declarative ActionEffects into physiological consequences.

Studio must not contain a second hand-maintained copy of a product's clinical parameters.

## 3. Shared product registry and Studio exposure

The product/module variable definition is the canonical source for Studio exposure. A simulator declares its scenario variables once using `ScenarioVariableDefinition`-style metadata. Studio derives authoring behavior from those declarations.

Conceptually:

```text
Product physiology/device state
        ↓
ScenarioVariableDefinition[]
        ↓
product/module registry
        ├─ editable stage controls
        ├─ measurement-condition triggers
        ├─ parameter-change triggers
        └─ transition-capable variables
```

Important rules:

- writable settings are editable in Studio by default;
- writable settings can be parameter-change triggers by default;
- measurements are available as measurement-condition triggers by default;
- nested product state must expose the correct canonical snapshot path;
- `studio.editable`, `studio.triggerable` and `studio.measurable` are deliberate opt-in/opt-out overrides;
- a new simulator parameter should normally be registered once, not duplicated in a Studio-specific list.

This registry-driven design applies to MV, Anaesth and ITU.

## 4. Scenario Studio architecture — v0.13.0

Studio is a product-neutral authoring application backed by product adapters. Its job is to create and maintain scenario documents; it does not own physiology.

### 4.1 Scenario document

The shared authoring document contains:

- schema version;
- product ID;
- name and description;
- optional supported runtime modes;
- stages;
- branches/paths.

A stage contains its snapshot, sparse application mask, transition configuration and optional media/question content. A branch connects one source stage to one destination stage with a trigger and priority.

Current authoring contracts retain legacy multi-trigger payload fields for compatibility, but **new Studio authoring uses one primary trigger per path**. The runtime can still read legacy `triggers` plus `triggerMode` while those documents exist.

### 4.2 Sparse stage application

Scenario stages are not full resets. A stage snapshot may contain a complete state representation for authoring convenience, but `appliedVariableIds` / product apply masks define which values are actually applied on stage entry.

Architectural invariant:

> A stage changes only the variables explicitly marked for application. Unapplied simulator state persists across the transition.

This is critical for realistic branching, candidate interventions and progressive scenarios. Bulk authoring operations such as section-level Apply All/Unapply All are only shortcuts over the same sparse apply mask; they do not create a second persistence model.

### 4.3 Stage transitions, timing and runtime persistence

The shared scenario runtime owns:

- scenario start/stop;
- current stage;
- stage order;
- branch resolution;
- stage transition locking;
- stage start simulation time;
- durable runtime reconstruction;
- cleanup of persisted runtime state when a scenario/session is deliberately terminated.

The canonical stage clock is simulation time (`stageStartedSimulationTime`), not wall-clock time. Consequently:

- pausing simulation does not consume stage duration;
- simulation speed can remain coherent with scenario timing;
- automatic stage loads must not pause the simulator;
- stage transitions must not reset unrelated simulation clocks;
- Pause Simulation and Freeze Waveform remain separate concepts.

Active scenario runtime is persisted locally using a path-scoped key of the form `loppjusim.scenario-runtime:<pathname>`. The persisted payload contains the scenario definition plus the minimum runtime snapshot required to reconstruct the current stage. This persistence has a strict lifecycle:

```text
active scenario
  ↓
runtime snapshot persisted
  ↓
browser refresh/reload
  ↓
scenario + current stage reconstructed

explicit scenario stop / end session / full reset
  ↓
runtime.stop()
  ↓
persisted scenario runtime removed
  ↓
subsequent refresh starts without the previous scenario
```

Therefore a browser refresh during a live scenario may recover the current stage, but **ending the session or explicitly stopping/resetting the simulation must retire that runtime and clear its persisted stage**. Session teardown and scenario teardown are separate subsystems but their lifecycles are intentionally linked.

The shared top bar may expose the current stage through a compact **STAGE** control. It displays the active stage and opens the current stage controls when a manual transition is available; it is disabled when the current stage has no manual path. The stage indicator is presentation state only and must never be treated as the source of runtime authority.

### 4.4 Branching/path model

A stage can have multiple outgoing paths. Each current Studio-authored path has:

```text
source stage
  + trigger
  + destination stage
  + priority
  + enabled state
```

Branch evaluation rules:

1. evaluate enabled outgoing paths from the current stage;
2. order by priority, with lower numeric value meaning higher priority;
3. determine which trigger(s) match through the product/runtime adapter;
4. execute only the highest-priority eligible branch;
5. once the stage changes, stop evaluating transitions from the old stage;
6. if no branch fires, a stage's linear advance trigger may advance to the next stage.

Multiple outgoing paths may target the same destination. A scenario is therefore a directed stage graph rather than merely a linear list, while preserving linear progression as the simple default.

### 4.5 Trigger vocabulary

Shared authoring currently supports:

- Manual;
- Time passed;
- Measurement condition (`<`, `=`, `>`);
- Parameter changed;
- Drug / Event action;
- Question answered;
- Correct question answer;
- Video finished;
- Media acknowledged.

Action-like triggers support actor scope where relevant:

- Candidate;
- Instructor;
- Either.

The grouped Studio trigger registry is assembled from:

```text
product module registry
  ├─ measurements
  └─ triggerable writable parameters

shared Drugs & Events library
  ├─ Drugs
  └─ Events

Core runtime vocabulary
  ├─ Manual
  └─ Time
```

Drugs and Events are loaded from the shared action-definition system; they must not be duplicated as a hard-coded Studio catalogue.

### 4.6 Declarative actions in scenarios

Scenario actions and action triggers obey the same platform invariant as the simulator UI:

> Actions describe declarative effects; physiology interprets those effects.

The intended chain is:

```text
ActionDefinition
    ↓
ActionRuntime
    ↓
ActiveEffect
    ↓
ActionEffectEngine
    ↓
product physiology adapter/interpreter
    ↓
measurements and waveforms
```

Scenario code should refer to stable action IDs and semantic invocation events. A Drug/Event button or scenario stage must not directly write a displayed HR, BP, SpO₂ or other monitor value.

### 4.7 Draft autosave and recovery

From the v0.13.0 baseline, Studio draft editing is continuously persisted.

Canonical authoring lifecycle:

```text
editing
  ↓
dirty
  ↓
local draft persisted
  ↓
cloud/library sync attempted
  ↓
synced
```

Current behavior:

- edits are saved to a local draft safety copy immediately;
- cloud/library autosave is debounced after editing;
- failed cloud saves retain the local draft and retry;
- reopening the scenario can recover the local draft;
- manual **Save** remains an immediate fallback path;
- import creates a new dirty draft;
- deleting a scenario removes its associated local draft;
- unload/unmount preserves unsaved work locally where browser storage permits.

The local draft namespace is product/scenario scoped (`loppjusim:scenario-studio:draft:...`). Browser storage is a safety net, not the authoritative published library.

**Autosave never publishes. Publish remains an explicit lifecycle operation.** Draft persistence and publication must not be conflated.

A future revision/optimistic-concurrency mechanism for stale tabs remains desirable; continuous autosave alone is not a substitute for multi-editor conflict detection.

## 5. Runtime modes

Every scenario may declare the runtime modes in which it is allowed. Legacy scenarios with no declaration remain compatible with all modes.

The canonical modes are **Standalone / Simulation / Teaching**.

### 5.1 Standalone

- one user;
- one local simulator runtime;
- no live session required;
- no internet required for the live simulation loop;
- user controls the local simulator directly.

### 5.2 Simulation

Simulation mode is the standard instructor/candidate simulation-room workflow.

- one instructor and one candidate participate in one shared authoritative simulation;
- instructor changes affect the candidate view/runtime;
- candidate actions and permitted control changes affect the same authoritative simulation seen by the instructor;
- candidate-to-instructor synchronization is therefore bidirectional;
- commands are validated/sequenced by a single simulation-session authority;
- accepted mutations produce a canonical ordered state/snapshot stream;
- the live runtime must not depend on internet availability.

The Core command model includes semantic mutations such as patient/device/environment parameter changes, action invocation/intensity/stop, scenario controls, alarm changes, pause and waveform freeze. These commands carry actor identity/role and simulation time.

Transport is abstracted behind `SimulationTransport`. The runtime must remain transport-independent so LAN/local and cloud-capable transports can implement the same command/snapshot contract.

### 5.3 Teaching

Teaching mode is one instructor serving one or more candidates whose simulators remain independent.

- each candidate retains a local physiology/simulation runtime;
- instructor teaching state can be broadcast to candidates;
- candidates can be granted selected local controls/interventions;
- Candidate A's local clinical intervention must not implicitly alter Candidate B's physiology;
- instructor presentation/synchronization is distinct from sharing one authoritative simulation.

This mode preserves the long-standing architecture that teaching synchronization transmits semantic state, instructions and events rather than moving all physiology execution to the instructor/browser/cloud.

### 5.4 Session and scenario lifecycle

A live session and a scenario runtime are related but are not the same object. Ending/ leaving a session must transition the product back to Standalone and retire any session-owned scenario runtime. A normal browser refresh while a session/scenario remains active may recover the session and scenario state; an explicit end operation must not.

Canonical teardown order is:

```text
End session / Leave session
  ↓
remote/session transport teardown
  ↓
role returns to Standalone
  ↓
active scenario runtime stops
  ↓
scenario runtime persistence is cleared
```

This prevents an ended Simulation/Teaching session from reappearing only because a browser-local scenario snapshot remained available.

## 6. Local-first and offline architecture

The live simulation control loop is local-first.

Architectural invariant:

> Supabase or another internet service must not be in the critical path for breath-to-breath ventilation, monitor physiology, stage timing, or reactive instructor/candidate simulation control.

Cloud services are appropriate for:

- authentication and roles;
- scenario/profile/action libraries;
- scenario distribution;
- session discovery/signalling where required;
- organisation ownership;
- durable session logs and debrief data;
- asynchronous cross-device persistence.

The runtime transport layer is separate from durable persistence. Temporary cloud loss must not stop an already-running local/shared simulation when a suitable local runtime transport remains available.

## 7. Instructor/candidate synchronization

Synchronization should exchange semantic commands/events and authoritative snapshots, not merely copy rendered monitor numbers.

### Simulation mode

```text
Instructor or candidate intent
        ↓
SimulationCommand
        ↓
session authority validates + sequences
        ↓
canonical simulation state
        ↓
ordered SimulationSnapshot
        ↓
both participants converge on same runtime
```

### Teaching mode

```text
Instructor teaching action/state
        ↓
session transport
        ↓
candidate receives semantic instruction/event
        ↓
candidate-local runtime applies/interprets it
```

Where an instructor invokes a Drug/Event that should affect candidates, synchronize the action invocation (stable action ID, operation, intensity, actor and simulation time), not the instructor's resulting HR/BP values. Each receiving runtime lets its physiology interpret the same action.

Late join/reconstruction should use durable/current snapshots plus active effects/runtime state rather than replaying UI gestures alone.

## 8. Drugs & Events / ActionEffect architecture

The shared Drugs & Events framework is a reusable platform subsystem.

Definitions are persisted in the shared action-definition library, including Supabase-backed `public.edusim_action_definitions`, with local fallback where supported.

Core conceptual separation:

- `ActionDefinition` — declarative description and metadata;
- `ActionLibrary` — retrieval/catalogue;
- `ActionEffect` — validated physiological intent;
- `ActionEffectEngine` — resolves active effects over simulation time;
- `ActiveEffect` — current runtime effect instance;
- `ActionRuntime` — activation/toggle/intensity/lifecycle;
- product physiology — interprets validated targets and produces clinical state.

The validated effect vocabulary is deliberately constrained (for example `offset`, `set`, `multiplier`, `target`, `increment`, `trigger`). New effects should extend the physiology/effect vocabulary deliberately rather than bypassing it with arbitrary UI mutations.

Stable action IDs and semantic events are also the basis for:

- scenario branching;
- actor attribution;
- session logging;
- debrief/reconstruction;
- synchronized instructor actions.

## 9. Product architecture

### 9.1 loppjuSIM-MV

MV owns ventilator mechanics and respiratory physiology, including the current family of volume-, pressure-, support-, SIMV- and two-level modes. Scenario integration is through the shared authoring/runtime contracts and MV-specific adapters.

Recent mechanics work continues to move spontaneous effort and equation-of-motion behavior into reusable respiratory mechanics primitives while retaining ventilator-mode-specific control laws. Scenario regression cases are appropriate for validating trigger delay, peak flow, mechanical/neural inspiratory timing, tidal volume and Pmus/Paw phase relationships.

### 9.2 loppjuSIM-Anaesth

Anaesth uses the common monitor/physiology architecture with anaesthesia-specific extensions such as anaesthetic gases, MAC, BIS and neuromuscular-blockade/TOF behavior. It consumes the shared Drugs & Events framework and exposes scenario variables through its product registry/adapter rather than Studio-specific lists.

### 9.3 loppjuSIM-ITU

ITU shares the common monitor/physiology architecture while exposing ICU-specific controls and clinical behavior. It uses the same shared scenario, action/effect, session and logging contracts as Anaesth, with physiology-specific interpretation remaining product-owned.

## 10. Supabase responsibilities

Supabase is a durable platform service, not the physiology engine.

Current responsibilities across the project include:

- authentication/instructor identity;
- product-aware sessions and permissions;
- teaching library persistence;
- scenario/profile persistence;
- organisation data;
- self-directed assignments;
- session logs and actor attribution;
- shared action definitions;
- selected Realtime/session signalling and persistence workflows.

Database/RPC names that still contain `edusim`, `eduvent` or `edumon` are compatibility contracts. They should only be renamed through explicit migrations with backward-compatibility consideration.

## 11. Persistence boundaries

Different data has different authority:

- **live physiology/device state:** local simulation engine or Simulation-mode session authority;
- **scenario runtime state:** local/shared scenario runtime, reconstructable from scenario + runtime snapshot; browser-local persistence is used for active-run recovery and is cleared on explicit runtime/session teardown;
- **draft Studio document:** local safety copy plus asynchronous scenario-library save;
- **published/library scenario:** durable scenario repository/Supabase-backed storage;
- **teaching presentation state:** session-scoped transport/state;
- **logs/debrief:** durable asynchronous persistence.

A persisted scenario runtime is a recovery aid, not proof that a session remains active. Runtime restore must respect lifecycle state, and explicit stop/end/reset operations must clear stale recovery state.

Do not treat every UI state as globally authoritative merely because it can be persisted.

## 12. Shared UI components and platform controls

Shared application primitives include the simulation shell/top bar/workspace/console, teaching/session surfaces, alarm primitives, media/presentation components and common authoring framework. Product-specific components should plug into these surfaces without duplicating generic behavior.

The shared LoppjuSIM platform menu is the canonical entry point for cross-product platform actions. Runnable **Scenarios** are opened from this menu rather than separate product-specific top-bar scenario buttons. In Standalone mode it opens the scenario library/start workflow; during an instructor Simulation/Teaching session it provides scenario switching. Candidate mode does not expose scenario switching.

The shared simulation top bar owns the common pause/speed/time/stage controls. A short press on **Pause Simulation** retains its ordinary pause/resume semantics. A deliberate long press opens a destructive **Stop & reset simulation** confirmation. Confirmation performs a full lifecycle reset rather than simply reloading the page:

1. end/leave any active Simulation or Teaching session using the normal session teardown path;
2. stop and clear the active scenario runtime and persisted stage;
3. clear active Drugs/Events runtime state where applicable;
4. clear product-local simulator persistence and scenario/session launch parameters;
5. reload into a clean Standalone simulator.

Reset must not clear unrelated account/authentication data. The destructive reset flow is intentionally distinct from ordinary Pause/Resume and from hiding the scenario runtime popup.

UI styling and minor authoring ergonomics are intentionally not canonical architecture. They may change without requiring this document to be revised unless they introduce a new data/authority/runtime contract.

## 13. Implemented baseline

At the current baseline, the platform has implemented or established:

- product-neutral Scenario Studio for MV, Anaesth and ITU;
- module-driven Studio variable/trigger exposure;
- static/dynamic stages and sparse stage application;
- transitions and per-variable transition overrides where supported;
- branching stage graphs with path priorities;
- Manual, Time, measurement, parameter-change, Drugs/Events, question and media triggers;
- Candidate/Instructor/Either actor scope for relevant triggers;
- explicit Standalone / Simulation / Teaching mode metadata;
- simulation-time stage clocks and runtime reconstruction snapshot support;
- path-scoped active-scenario persistence across browser refresh/reload;
- explicit scenario-runtime cleanup when an active session ends;
- shared current-stage top-bar indicator/manual-control entry point;
- runnable Scenarios entry consolidated into the shared LoppjuSIM platform menu;
- long-press Pause → confirmed Stop & Reset lifecycle for clean Standalone recovery;
- local-first runtime-mode contracts;
- shared semantic Simulation commands/snapshots and transport abstraction;
- continuous Studio draft autosave with local recovery and retry;
- explicit separation of draft autosave from Publish;
- shared Drugs & Events / ActionEffect architecture;
- product-aware scenario/profile/session persistence;
- session logging and actor-attribution foundations.

## 14. Partially implemented / evolving

The following areas are architectural directions with implementation still evolving across products/modes:

- complete parity of all scenario triggers and runtime behaviors across MV, Anaesth and ITU;
- robust late-join reconstruction of every active effect/session/scenario state;
- exact simulation-clock continuity semantics for every restored scenario runtime, especially where a product's local simulation clock itself restarts on reload;
- end-to-end local/LAN Simulation-mode transport and failover behavior across all deployment shapes;
- complete semantic synchronization of instructor Drugs/Events and other shared actions in every session context;
- conflict/revision handling when the same Studio scenario is edited in multiple tabs/clients;
- debrief tooling built on the session/scenario event log;
- migration of legacy multi-trigger branch payloads after disposable/legacy scenario compatibility is no longer required.

## 15. Planned extensions

Planned work should preserve the existing contracts rather than introduce parallel systems. Likely extensions include:

- richer trigger qualifiers such as sustained/debounced measurement conditions;
- stronger event-stream-based actor attribution instead of inferring every action from resulting state changes;
- more complete scenario runtime telemetry and debrief reconstruction;
- explicit version/revision conflict resolution for Studio drafts;
- reusable templates/duplication/import-export evolution with schema migration support;
- broader local appliance/LAN deployment support;
- further extraction of shared physiology primitives where genuinely common between products.

## 16. Deprecated or non-canonical approaches

Do not regress to the following patterns:

- a separate hard-coded Studio list of product parameters;
- scenario buttons directly mutating displayed monitor values;
- cloud/Supabase calls in the critical physiology/runtime loop;
- treating Simulation and Teaching as the same synchronization model;
- broadcasting Candidate A's local Teaching-mode intervention to every candidate;
- resetting an entire simulator when a sparse stage transition should change only selected variables;
- using wall-clock time for scenario stage timing;
- coupling scenario sequencing to product-specific UI components;
- treating a hidden scenario popup as equivalent to stopping a scenario;
- leaving persisted scenario runtime behind after an explicit session end/reset;
- maintaining separate product-specific top-bar scenario launch controls where the shared platform menu is appropriate;
- autosave implicitly publishing a scenario;
- renaming legacy database/source identifiers casually without migration planning.

## 17. Architectural invariants — DO NOT REGRESS

1. **Core is product-neutral; physiology is product-owned.**
2. **Register product scenario variables once and derive Studio behavior from the registry.**
3. **Stages apply sparse state; unapplied state persists.**
4. **Scenario timing uses simulation time.**
5. **Branch priority is deterministic; only one transition leaves the old stage per evaluation.**
6. **Actions are semantic/declarative; physiology interprets effects.**
7. **Stable action IDs/events are preferable to synchronizing resulting monitor numbers.**
8. **Standalone, Simulation and Teaching have distinct authority models.**
9. **Simulation mode has one shared authoritative runtime; Teaching has independent candidate runtimes.**
10. **Live simulation must remain local-first and not internet-dependent.**
11. **Persistence/distribution is separate from the real-time physiology loop.**
12. **Draft autosave is not Publish.**
13. **Legacy scenarios without runtime-mode metadata remain usable in all modes.**
14. **Compatibility identifiers are migrated deliberately, never by cosmetic rename alone.**
15. **Refresh may restore an active scenario, but explicit scenario/session termination must clear its persisted runtime.**
16. **Ending a session must not leave a recoverable previous scenario stage behind.**
17. **Full reset ends/leaves the session before clearing local simulator/runtime state and reloading Standalone.**
18. **Shared platform actions belong in shared platform controls rather than duplicated product-specific top-bar controls.**

## 18. Primary implementation references

Key source areas at this baseline:

```text
src/core/runtimeModes.ts
src/core/platformEvents.ts
src/core/simulationReset.ts
src/components/LoppjuSimPlatformMenu.tsx
src/components/SimulationTopBar.tsx
src/session/localRuntimeTransport.ts
src/session/webRtcRuntimeTransport.ts
src/teaching/session/
src/teaching/scenario/
src/scenario-builder/
src/scenario-builder/modules/
src/edusim/actions/
src/edumon/scenarioAdapter.ts
src/edumon/scenarioRegistry.ts
src/eduvent/
supabase/migrations/
```

More focused historical documents such as `runtime-modes-v080.md`, `local-teaching-server.md` and `scenario-builder-schema-v1.md` remain useful implementation history, but this document is authoritative when they conflict with current architecture.
