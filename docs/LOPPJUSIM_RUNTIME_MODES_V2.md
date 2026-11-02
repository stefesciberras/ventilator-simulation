# loppjuSIM Core runtime modes v3

loppjuSIM has four first-class user-facing runtime modes. Runtime mode describes **simulation ownership and synchronization semantics**. It is distinct from participant role, authentication state and transport topology.

## Canonical invariants

```text
Standalone:     1 user                  -> 1 unrestricted local runtime, no session
Simulation:     1 instructor + 1 learner -> 1 shared authoritative patient runtime
Teaching:       1 instructor + N learners -> 1 instructor/master state + N independent learner runtimes
Self-directed:  1 learner               -> 1 independent learner runtime driven by a dynamic scenario
```

A browser tab, WebSocket connection or Supabase Realtime subscription is never the identity of the simulation session. Refreshing or reconnecting a client must reattach it to the existing runtime rather than create a new patient.

## Standalone

**Session:** none.  
**Authentication:** not required for simulator use.  
**Logical runtime:** one local runtime.  
**Control authority:** unrestricted local user.

Standalone is the absence of a shared session. Physiology, Actions, alarms, waveforms, ventilator/device controls and presentation controls remain local.

Dynamic scenarios are authenticated content. A signed-out Standalone user may use the simulator manually but may not launch dynamic scenarios. A signed-in user may launch an eligible dynamic scenario locally without turning Standalone into a shared session.

The laser pointer, pause, waveform freeze and alarm silence are local in Standalone.

## Simulation

**Participants:** exactly one signed-in instructor and one candidate.  
**Joining:** instructor creates a session and invitation key/link; candidate may use invitation access without a full registered account.  
**Logical runtimes:** exactly one shared authoritative patient runtime.

Simulation is the conventional simulation-centre topology. Instructor and candidate do not run two patient models that are merely synchronized. They are two control/view surfaces attached to one logical patient.

```text
Instructor permitted command ----\
                                 -> Session authority -> canonical patient runtime -> both views
Candidate permitted command -----/
```

Every accepted candidate clinical mutation is reflected in the instructor runtime and vice versa. Examples include permitted ventilator settings, Sevo and explicitly permitted Actions. Derived waveform samples and measured monitor values are not the command vocabulary; physiology is reconstructed from canonical state.

### Candidate access

The candidate uses a restricted control surface. The candidate must not have access to:

- Patient controls;
- Physiology controls;
- Teaching controls;
- Patient Profiles;
- Instructor/Monitor mode;
- pause/resume;
- session termination;
- unrestricted Actions/Events.

The candidate may use the product-specific approved controls, including permitted ventilator settings, Sevo where applicable, limited waveform/display controls, local waveform freeze and explicitly permitted Actions.

### Instructor-global controls

The following are instructor-authoritative session controls:

- simulation pause/resume;
- global waveform freeze/unfreeze;
- alarm silence where the product exposes shared alarm silence.

They apply to instructor and candidate. Candidate-local presentation controls cannot override an active instructor-global state. In particular:

```text
effectiveWaveformFreeze = instructorGlobalFreeze OR candidateLocalFreeze
```

The instructor laser pointer is a one-way ephemeral presentation broadcast. It is not patient state and the candidate cannot control it.

## Teaching

**Participants:** one signed-in instructor and one or more candidates.  
**Joining:** instructor creates the session; candidates use invitation keys/links.  
**Logical runtimes:** independent candidate runtimes under an instructor/master teaching state.

Teaching deliberately differs from Simulation. Instructor-originated patient/teaching changes may be broadcast to every candidate, but a candidate intervention remains local to that candidate.

```text
Instructor/master state -> Candidate A runtime
                        -> Candidate B runtime
                        -> Candidate C runtime

Candidate A intervention -> Candidate A only
Candidate B intervention -> Candidate B only
```

When an instructor update arrives, candidate-owned permitted state must be merged rather than blindly replaced. Candidate A's ventilator intervention, for example, must not disappear merely because the instructor later introduces bronchospasm unless the instructor explicitly changes the same authoritative domain.

Candidate access restrictions are the same policy used for Simulation. Instructor pause, global waveform freeze, shared alarm silence and laser-pointer broadcasts apply to all candidates.

## Self-directed learning

**Participants:** one learner, no live instructor.  
**Entry:** a dynamic-scenario assignment/link.  
**Logical runtime:** one independent restricted learner runtime.  
**Teaching authority:** the dynamic scenario engine.

Self-directed learning is a specialization of the Teaching candidate runtime, not a separate simulator architecture. Existing self-directed assignment/run infrastructure should be reused.

```text
Dynamic scenario
      ↓
conditions / timers / learner actions
      ↓
scenario transitions
      ↓
learner patient runtime
```

The learner receives the same restricted clinical control surface as a Teaching candidate. There is no instructor laser pointer or instructor control surface, and the learner does not receive a general pause control. Scenario-authored pauses or acknowledgement steps remain valid scenario-engine behavior.

A self-directed run must be recoverable after refresh/reconnect and resume its own scenario progress and patient state rather than restarting unless the learner explicitly restarts or the assignment policy requires it.

## State classes

Do not force all synchronized data through one semantic rule. loppjuSIM distinguishes four classes:

1. **Patient/model state** — physiology inputs, ventilator/device settings, Sevo, Actions/Events and scenario state.
2. **Instructor-global session controls** — pause, global waveform freeze and shared alarm silence.
3. **Instructor presentation broadcast** — laser pointer and future ephemeral teaching overlays.
4. **Local view state** — local tab/panel selection, permitted waveform visibility and candidate-local freeze.

Simulation shares class 1 through one canonical runtime. Teaching keeps candidate class-1 interventions local while applying instructor-authoritative changes. Classes 2 and 3 flow from instructor to all participants. Class 4 remains local unless explicitly promoted to a global instructor control.

## Session durability and termination

Refreshing a page, closing/reopening a tab, a transient network loss or losing an instructor-control lease is **not** an End Session operation.

For Simulation, if either instructor or candidate remains connected, the session recovery window must remain alive and the other participant must be able to rehydrate from current canonical state. Teaching should provide the same lifecycle behavior, including restoration of each candidate's own independent runtime where persisted.

The normal authoritative termination of a live Simulation or Teaching session is:

```text
Instructor -> End Session -> session status = ended
```

Presence/lease expiry may make a client temporarily unable to control the room, and an inactivity deadline may eventually make an abandoned session unrecoverable for housekeeping, but neither is semantically equivalent to an instructor manually ending the scenario.

Session expiry therefore represents an **inactivity/recovery deadline**, not a fixed lifetime measured from session creation. Connected participant heartbeats extend that deadline.

## Local-first transport

Runtime semantics are independent of transport topology. The preferred live-room order remains:

1. same-LAN local WebSocket relay/server;
2. direct browser peer transport where appropriate;
3. Supabase/cloud fallback for remote operation and durable metadata.

A transport switch must not change Simulation or Teaching ownership semantics. Supabase may provide authentication, durable records and recovery without becoming the definition of the patient runtime.

## Scenario compatibility

Scenario Studio documents may declare:

```ts
supportedModes: ['standalone', 'simulation', 'teaching', 'self-directed']
```

The field remains optional for backward compatibility. An absent/empty legacy declaration is normalized as compatible with all runtime modes; launch-time authentication, assignment and product policies still determine whether that scenario can actually be started in a given context.

Most permissions belong to the runtime mode and product, not to individual scenarios. Scenarios should add only genuinely scenario-specific exposure, such as an Action explicitly made available to the candidate.

## Terminology boundary

Do not conflate:

- **runtime mode:** `standalone | simulation | teaching | self-directed`;
- **participant role:** local/standalone user, instructor or candidate;
- **authentication:** signed-out, anonymous invitation identity or authenticated instructor/account;
- **transport:** LAN WebSocket, WebRTC/direct peer, Supabase/cloud or local appliance.

These are orthogonal concerns and must remain separate in Core.
