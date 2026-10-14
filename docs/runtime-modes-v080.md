# EDUVENT v0.80 runtime modes

EDUVENT v0.80 supports three teaching-room topologies while keeping the ventilation/physiology engine in each candidate browser.

## 1. Browser peer-to-peer (iPad → iPad / PC)

Use the normal HTTPS EDUVENT PWA. Instructor and candidates authenticate/join through Supabase as before. Supabase Realtime carries WebRTC signalling only; once a peer is connected, live teaching snapshots and scenario events use an ordered WebRTC DataChannel directly between the instructor browser and each candidate browser.

No Node server is required on the instructor device. This is the default when EDUVENT is loaded from its normal HTTPS/cloud origin.

If the direct peer path is unavailable, Supabase remains the authoritative durable state/fallback transport. Candidate simulation continues locally with the last received settings during transient loss.

## 2. Local PC server (PC → iPad / PC)

Run the existing EDUVENT local server on the instructor PC. It serves the built PWA and the WebSocket relay from the same local origin. Candidates open the LAN address printed by the server or scan a QR code produced from that address.

When EDUVENT is loaded from localhost, a private IPv4 address, or a `.local` hostname over HTTP, it automatically chooses the local WebSocket relay instead of WebRTC.

This mode is useful when the instructor PC can host the room and a stable LAN is available. Supabase remains available for authentication, durable state and cloud fallback unless the appliance/self-hosted option is used.

## 3. EDUVENT appliance (Raspberry Pi / dedicated box)

The appliance is intended to provide the complete local stack:

- EDUVENT PWA/web server
- EDUVENT WebSocket teaching relay
- local Supabase stack (Auth, Postgres/PostgREST, Realtime, Storage/API gateway as required)
- EDUVENT database migrations
- optional Wi-Fi access point / mDNS name such as `eduvent.local`

The browser runtime identifies an appliance when the hostname is `eduvent.local`, begins with `eduvent-box`, or when `?runtimeProfile=appliance` is present. The runtime badge then reports `EDUVENT box`.

The `appliance/` directory contains the initial deployment scaffold. It deliberately keeps the local Supabase stack separate from the EDUVENT application container so upstream Supabase images/configuration can be upgraded independently.

## Runtime priority

For an active teaching session the fast path is selected automatically:

1. local same-origin relay available → PC server / appliance WebSocket
2. otherwise → WebRTC peer-to-peer
3. Supabase session row / Realtime → durable copy and fallback

Sequence numbers, gap detection, resynchronisation and periodic full-state checkpoints are transport-independent. The candidate ventilation simulation does not move to the instructor or server.

## WebRTC signalling

Each teaching session gets a Supabase Realtime broadcast signalling channel scoped to the session ID. Candidates announce themselves, the instructor creates one peer connection per candidate, and offer/answer/ICE messages are addressed to a specific client ID. The six-character session key is included and validated in signalling messages in addition to the existing session join/RLS controls.

A small replay buffer plus the latest full snapshot are retained by the instructor transport so a reconnected candidate can resynchronise quickly.

## Offline boundaries

Browser peer-to-peer still needs Supabase when a new session is created/joined and for WebRTC signalling. An already-established DataChannel can continue carrying live runtime state if internet access later disappears, subject to browser/network behaviour.

The appliance mode is the route to fully offline session creation and operation because it hosts Supabase and the web/relay services locally.
