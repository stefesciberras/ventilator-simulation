# loppjuSIM Core runtime modes v2

loppjuSIM has three first-class user-facing runtime modes. These modes describe **simulation ownership and synchronization semantics**. They are distinct from transport topology (LAN WebSocket, WebRTC, Supabase/cloud, or appliance).

## Standalone

**Participants:** one user.  
**Logical runtimes:** one local runtime.  
**Ownership:** local.

Standalone runs without an instructor session. The simulator, scenario runtime, Actions runtime, alarms, waveforms and physiology all remain local.

## Simulation

**Participants:** one instructor and normally one candidate.  
**Logical runtimes:** one shared logical simulation.  
**Ownership:** one authoritative session runtime, normally hosted by the instructor device for room-based simulation.

Simulation is the conventional simulation-centre topology. Both users may perform permitted clinical/simulator interactions and every accepted mutation is reflected to both users.

Examples:

- Candidate changes PEEP -> instructor and candidate see the new PEEP.
- Candidate gives a Drug -> the shared ActionRuntime changes and both users see the resulting simulation.
- Instructor starts Bleeding -> both users enter the same active Event/effect state.
- Instructor or candidate performs a scenario-relevant action -> one shared scenario runtime evaluates it.

Simulation mode is **bidirectional but not peer-authoritative**. Instructor and candidate issue commands; one `SimulationSessionAuthority` validates, sequences and applies accepted mutations. This avoids conflicting last-write-wins state.

### What is synchronized

Synchronize simulation inputs and canonical runtime state, including as appropriate:

- patient state/settings;
- device settings;
- environment settings;
- Drugs/Events invocations, intensity and stop/toggle operations;
- active effects;
- scenario ID, stage and scenario runtime controls;
- simulation clock, pause and speed where supported;
- display freeze/shared display state;
- alarm state where the product treats it as shared.

Do **not** make waveform samples or measured HR/BP/etc. the primary synchronization protocol. Actions remain declarative and product physiology interprets them. A canonical snapshot may contain sufficient state to recover a participant after reconnect, but physiological display output is not the command vocabulary.

### Command flow

```text
Instructor command ----\
                       -> SessionAuthority -> canonical mutation -> both participants
Candidate command -----/
```

Commands use a product-neutral envelope such as `SimulationCommand`; product modules own the meaning and validation of product-specific payloads.

### Local-first transport

Simulation mode must not depend on an internet connection for the live room path when a local path is available.

Preferred order for a room-based session:

1. same-LAN local WebSocket relay/server;
2. direct browser peer transport where appropriate;
3. cloud/Supabase fallback for remote use and durable metadata.

The existing loppjuSIM-MV local teaching relay already provides useful transport primitives: ordered envelopes, sequence numbers, replay, gap detection and full-snapshot recovery. Simulation mode should reuse those primitives rather than create another networking stack.

Supabase may remain useful for authentication, durable session records and remote fallback, but it is not in the critical live-control path when the participants are connected locally.

### Snapshot/reconnect

A participant joining or reconnecting receives a canonical `SimulationSnapshot`, then commands after its sequence number:

```text
connect
  -> snapshot sequence 840
  -> hydrate shared runtime
  -> command 841
  -> command 842
```

The snapshot should contain the state required to reconstruct the shared logical simulation without replaying the entire session history.

## Teaching

**Participants:** one instructor and one or more candidates.  
**Logical runtimes:** one local simulation runtime per candidate.  
**Ownership:** instructor controls shared teaching/patient inputs; permitted candidate interventions remain local to that candidate.

Teaching preserves the existing architecture. Instructor-originated authoritative settings/events can broadcast to every candidate, but Candidate A's permitted intervention does not mutate Candidate B's simulator.

```text
Instructor -> Candidate A local runtime
           -> Candidate B local runtime
           -> Candidate C local runtime

Candidate A action -> Candidate A runtime + log/notify instructor
Candidate B action -> Candidate B runtime + log/notify instructor
```

This is intentionally different from Simulation mode.

## Scenario compatibility

loppjuSIM Studio / Scenario Builder may declare:

```ts
supportedModes: ['standalone', 'simulation', 'teaching']
```

The field is optional for backward compatibility. A scenario with no `supportedModes` declaration (or an empty/invalid legacy declaration) is treated as supporting all three modes.

Mode availability belongs to the shared scenario document contract. Product-specific scenario codecs must preserve it when converting between the shared Studio document and the simulator's persisted scenario format.

Most permissions should remain properties of the runtime mode and product. Scenarios should only add genuinely scenario-specific exposure/restriction, such as an Action whose `candidate_access` is `scenario`.

## Terminology boundary

Do not conflate runtime mode with participant role:

- runtime mode: `standalone | simulation | teaching`
- participant role inside a session: `instructor | candidate`

Likewise, do not conflate runtime mode with transport topology:

- LAN WebSocket
- WebRTC/direct peer
- Supabase/cloud
- local appliance

The same Simulation or Teaching semantics can be carried by different transports.

## Architectural invariant

```text
Standalone: 1 user  -> 1 local logical runtime
Simulation: 2 users -> 1 shared authoritative logical runtime
Teaching:   1 instructor -> N independent candidate logical runtimes
```

That invariant should be enforced in Core so loppjuSIM-MV, loppjuSIM-Anaesth and loppjuSIM-ICU do not independently reinvent session ownership rules.
