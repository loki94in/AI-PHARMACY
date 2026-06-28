# AI-Pharmacy Cloud Sync Relay

Minimal stateless HTTP relay that lets pharmacy devices exchange AIMAIL sync
batches when they can't reach each other directly over LAN.

## Deploy

```bash
# Any Node 18+ host (Railway, Fly.io, Render, a VPS, etc.)
RELAY_SECRET=<min-16-char-secret> node relay-server/server.cjs
```

Default port: **4000** (override with `PORT=8080`).

## Configure the pharmacy server

Settings → Sync → Cloud Relay:
- Relay URL: `https://your-relay-host.example.com`
- Relay Secret: same value as `RELAY_SECRET`
- Enable: toggle on

Or via API:
```bash
curl -X POST http://localhost:5000/api/sync/relay-config \
  -H 'Content-Type: application/json' \
  -d '{"enabled":true,"relayUrl":"https://relay.example.com","relaySecret":"<secret>"}'
```

## Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | /health | none | Liveness probe |
| POST | /push | X-Relay-Secret | Upload a batch of sync jobs |
| GET | /poll/:deviceId | X-Relay-Secret | Fetch and consume pending jobs for device |
| GET | /stats | X-Relay-Secret | Batch count + uptime |

## Notes

- Batches are stored **in memory** with a 24-hour TTL. The relay is
  not a persistent store — it is a temporary staging area.
- Fan-out: a batch pushed by device A is delivered to **any device
  that polls**, except device A itself.
- No database, no disk writes, no dependencies beyond Node.js stdlib.
