# EDUVENT local teaching server

EDUVENT can keep Supabase for authentication, session persistence and cloud fallback while moving the live instructor-to-candidate runtime path onto the local network.

## Start the server

From a checked-out EDUVENT repository:

```bash
npm install
npm run local
```

`npm run local` builds the current web app and starts a small HTTP/WebSocket server on port 4173. The terminal prints one localhost URL for the instructor and one or more LAN URLs for candidates.

The instructor should open the localhost URL. Candidates on the same Wi-Fi/LAN open the printed LAN URL. They still create/join the ordinary Supabase teaching session; once joined, EDUVENT automatically detects the local server and adds the **LAN live** runtime path.

## Runtime behaviour

- Candidate simulation, waveforms, alarms and ventilator response remain local in each browser.
- Instructor state snapshots are sent over the LAN immediately and checkpointed every 5 seconds.
- The relay assigns monotonically increasing sequence numbers and keeps a short replay buffer.
- A candidate that detects a sequence gap asks the server to replay missing messages. If replay is no longer possible, it receives the latest full snapshot.
- If the LAN relay disappears, the browser keeps the simulation running and Supabase remains the fallback transport.
- When the relay reconnects, the latest snapshot resynchronises the candidate.
- Supabase writes continue asynchronously, preserving the existing session record and remote-use capability.

## Dynamic scenarios

The transport already supports timestamped `scenario-event` envelopes in addition to full snapshots. `useTeachingSession()` exposes `broadcastRuntimeEvent(eventType, payload, scenarioTimeMs)` and `subscribeRuntimeEvents(listener)`. The dynamic-scenario engine can therefore be implemented above the transport without depending directly on either Supabase or WebSockets.

## Network/security notes

The local server binds to the LAN and is intended for a trusted classroom/simulation-centre network. Session routing uses the existing six-character teaching-session key. Do not expose port 4173 directly to the public internet. For remote teaching, continue using the cloud/Supabase path.
