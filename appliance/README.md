# EDUVENT appliance

This directory is the v0.80 scaffold for a dedicated EDUVENT teaching-room appliance, intended for a Raspberry Pi or another small always-on computer.

## What it provides

The appliance runs two layers:

1. the official self-hosted Supabase Docker stack for local Auth, Postgres/PostgREST, Realtime and related Supabase services;
2. the EDUVENT application container, which serves the built PWA and the local WebSocket runtime relay on port 4173.

The candidate ventilation engine still runs in each candidate browser.

## Requirements

- 64-bit Linux
- Docker Engine with Docker Compose v2
- Git
- Python 3
- OpenSSL
- enough RAM/storage for the self-hosted Supabase stack

A Raspberry Pi 5-class device with SSD storage is the intended target. The actual Supabase image set must support the CPU architecture used by the appliance; verify this on the chosen Pi image before relying on it for an examination.

## Bootstrap

From an EDUVENT checkout on the appliance:

```bash
sudo bash appliance/bootstrap.sh
```

The script:

- downloads/updates the official Supabase self-hosted Docker configuration under `/opt/eduvent/supabase`;
- generates local Postgres/JWT/dashboard credentials;
- enables anonymous Supabase users, which EDUVENT teaching sessions require;
- starts Supabase;
- applies every SQL migration in `supabase/migrations/`;
- builds EDUVENT against the local Supabase URL/key;
- starts the EDUVENT PWA + WebSocket relay.

Generated secrets remain on the appliance and are not written into the repository.

## Addressing

Preferred local address:

```text
http://eduvent.local:4173/?runtimeProfile=appliance
```

If mDNS is unavailable, use the Pi LAN IP instead:

```text
http://192.168.x.x:4173/?runtimeProfile=appliance
```

For a polished appliance image, configure the operating-system hostname as `eduvent` and enable an mDNS responder (for example Avahi) so `eduvent.local` resolves automatically.

## Fully offline operation

Once the Docker images, EDUVENT image and local database have been provisioned, the appliance topology is intended to avoid dependency on the public EDUVENT/Supabase services for session creation and teaching-room state. Email invitations and any other internet-dependent external service are naturally unavailable while completely offline.

The appliance bootstrap is infrastructure scaffolding rather than a prebuilt SD-card image. A later packaging step can turn it into a reproducible Raspberry Pi image with Wi-Fi access-point configuration, mDNS, automatic startup, health monitoring and backup/restore.
