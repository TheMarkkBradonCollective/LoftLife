# LoftLife — Architecture

## 1. Topology

```
Browser (React 19 + Three.js)
   │  same origin
   ├── /api/*  ──►  Express (server/index.mjs)
   └── /ws     ──►  WebSocket gateway (server/realtime.mjs)
                          │
                          └── SQLite (node:sqlite, WAL)  data/loftlife.db
```

In development Vite proxies `/api` and `/ws` to `:8787` so the browser only ever sees one origin —
no CORS, no cross-site cookies, and WebSockets stay same-site. In production the same Express
process serves `dist/` and the API on one port behind a TLS terminator.

**Why this shape:** the prototype already used Vite + React + Three.js, and the server had to run
without paid services or native modules. `node:sqlite` (Node ≥ 22.5) gives real SQL, transactions and
WAL durability with zero build steps, while the HTTP/WS surface stays language-agnostic so a Unity 6
client can consume exactly the same protocol later.

## 2. Data model

| Table | Purpose | Key constraints |
| --- | --- | --- |
| `users` | identity, role, suspension | unique `handle`, unique `email` (case-insensitive) |
| `sessions` | bearer tokens | stored as SHA-256 digest, 30-day TTL |
| `profiles` | display name, avatar JSON, bio | 1:1 with user |
| `wallets` | `yuanzi`, `tongbao` | `CHECK (>= 0)` |
| `ledger` | append-only history | unique partial index on `idempotency_key` |
| `inventory` | furniture/clothing ownership | unique `(user, kind, catalog_id)`, `qty >= 0` |
| `suites` | the player's hotel room | one per owner |
| `worlds` | player-created spaces | `access` enum, `published`, `max_visitors` |
| `world_collaborators` / `world_invites` | build rights / entry grants | composite PKs |
| `friendships` | canonical `a < b` pair | `status` pending/accepted |
| `blocks` | directed block list | composite PK |
| `chat_messages` | persisted city/world/DM text | indexed by `(scope, scope_id, created_at)` |
| `reports`, `audit_log` | moderation + traceability | |

Room/world decoration is stored as validated JSON (`items_json`, `surfaces_json`) because the client
already models it as an array of placed items; the server validates every field before storing it, so
it is never trusted blindly.

## 3. Trust boundaries

- **Passwords** — scrypt (N=16384, r=8, p=1), per-user 16-byte salt, `timingSafeEqual` comparison.
  Login also compares against a dummy hash when the account is missing, to avoid a timing oracle.
- **Tokens** — 256-bit random, returned once, stored hashed. `revokeSession` on logout.
- **Input** — `server/validate.mjs` enforces enums, `#rrggbb` colours, integer grid ranges, 200-item
  cap, unique item uids, and that every `catalogId` exists in the server's shop table.
- **Economy** — price and currency come from the server table. Balance changes only through
  `applyLedger`, inside `BEGIN IMMEDIATE`. Negative balances are impossible (application check plus
  SQL `CHECK`). Retries are deduplicated by idempotency key.
- **Permissions** — `canEnterWorld` / `canEditWorld` are shared by the REST entry check and the
  WebSocket handshake, so a client cannot bypass the check by connecting directly.
- **Rate limits** — fixed-window per IP for auth (12/min default) and per socket for pose (30/s) and
  chat (8 per 10 s, 125 ms minimum gap).

## 4. Realtime protocol

JSON over WebSocket at `/ws`. The first message must be `hello` within 10 seconds.

Client → server:

| Type | Payload | Notes |
| --- | --- | --- |
| `hello` | `{token, place: {kind:'city'}\|{kind:'world', worldId}}` | authenticates, assigns an instance |
| `pose` | `{x,y,z,yaw,emote,location,voice,voiceMode}` | ≤ 30/s; bounded coordinates + max displacement. Ignored while riding transit |
| `chat` | `{scope:'local'\|'city'\|'world'\|'dm'\|'party', body, mode?, to?}` | `mode`: whisper/say/shout |
| `joinFriend` | `{handle}` | moves the player to their friend's instance |
| `party` | `{action, handle?, userId?}` | create / invite / accept / leave / kick / join leader |
| `voice` | `{to, kind:'offer'\|'answer'\|'ice', data}` | SDP/ICE relay to one player in the same instance |
| `transit` | `{action:'board'\|'exit', lineId?, stopId?}` | server assigns a seat and drives the rider |
| `ping` | `{}` | liveness |

Server → client:

| Type | Payload |
| --- | --- |
| `ready` | instance info, your identity, full player list |
| `snapshot` | all players in the instance, 10 Hz |
| `join` / `leave` | incremental membership |
| `chat` | attributed message with `from`, `at`, optional `scopeId` |
| `party` | `{party, invites}` — the caller's party, or null, plus pending invitations |
| `voice` | `{from, kind, data}` — relayed signalling only, never audio |
| `transit` | `{riding, vehicles, exited?}` — seat changes and vehicle state |
| `error` | `{code, message}` — explicit, never silent |

**Instances.** The Main City is presented as one world but runs as numbered shards (`city:1`,
`city:2`, …) with a capacity (default 40, `LOFTLIFE_INSTANCE_CAPACITY`). A new shard opens when all
are full; `joinFriend` relocates a player to a friend's shard. Characters, inventory, currency and
worlds are account-scoped, so travelling between shards loses nothing. Shards stay numbered rather
than being deleted, so friends can rejoin the same one.

**Chat routing.** `local` is range-gated server-side (whisper 4 m, say 14 m, shout 35 m) and is
ephemeral; `city`/`world` are persisted and delivered to the instance; `dm` is persisted under a
canonical `a|b` scope id and delivered to the recipient wherever they are connected; `party` is
delivered to every member across instances. Blocking is enforced at delivery time.

**Parties.** A party is a process-local object (leader, members, pending invites, max 8) — transient
like a voice call, so it is not in SQLite. Party chat uses the party id as its scope. `party.join`
relocates a member to the leader's instance through the same capacity-checked path as `joinFriend`.

**Voice.** Voice is opt-in and never routed through the server: the gateway only relays
`offer`/`answer`/`ice` between two connections in the same instance, after block checks and a
signalling rate limit. Clients build a WebRTC mesh with the nearby players whose `voice` flag is set,
mute their own track unless push-to-talk is held, and scale each remote stream's volume by distance
against the same whisper/say/shout bands. Blocked players are never signalled.

**Transit.** Routes and stops are server-owned (`server/transit.mjs`, also exposed at
`GET /api/transit`). A vehicle exists per instance and line while it has riders. Boarding validates
range to the stop, assigns the lowest free seat, and from then on the server writes the rider's
position every tick; poses from that client are ignored, so the bus cannot be steered. Two players
who board the same line share one vehicle and see each other's avatars.

## 5. Scaling and hosting

Current ceiling: one process, one SQLite writer. Realistically comfortable for a few thousand
registered accounts and a few hundred concurrent players on one modest VM.

Path when that is not enough:

1. **Reads** — WAL already allows concurrent readers; move to PostgreSQL when write concurrency
   becomes the limit. The schema is plain SQL and portable; queries are not SQLite-specific.
2. **Realtime fan-out** — replace in-process instance maps with a Redis (or NATS) pub/sub layer and
   make WebSocket routing sticky per instance.
3. **Static assets** — serve `dist/` from a CDN; the API becomes stateless and horizontally scalable.

Estimated running costs (indicative, not commitments):

| Item | Estimate | Needed for |
| --- | --- | --- |
| Small VPS (2 vCPU / 4 GB) | ~€5–10 / month | API + realtime + SQLite, low hundreds of concurrent players |
| Larger VPS (4–8 vCPU) | ~€15–40 / month | growth, before managed Postgres |
| Managed PostgreSQL | free tier → ~$15–25 / month | when concurrency outgrows SQLite |
| Object storage (R2/S3) | ~$0.015 / GB-month, cheap egress | custom assets, snapshots |
| TLS/CDN/WAF | $0 (Cloudflare free tier) | production edge |
| Off-site backups | ~$1–5 / month | `sqlite3 .backup` + object storage |

No paid dependency is required to run the current build. Nothing here has been purchased.

## 6. Backups and operations

- Nightly `sqlite3 data/loftlife.db ".backup 'backups/loftlife-YYYYMMDD.db'"` plus WAL checkpoint,
  uploaded off-box. SQLite's `.backup` is safe while the server is running.
- `audit_log` records registration, purchases, world changes, blocks and moderation actions.
- `/api/health` returns account count and live instance occupancy — the right liveness probe.
- Secrets: none are required today. If AI or email is added later, keep keys server-side only
  (environment variables / a secret store), never in the client bundle.

## 7. Path to Unity 6 (Windows / Android / browser)

The protocol is deliberately transport-agnostic:

- REST for identity, profile, wallet, inventory, worlds, social graph.
- WebSocket JSON for presence, movement, chat.

A Unity client therefore needs no server rewrite: implement the same `/api` calls and the `/ws`
message set, keep the same bearer token, and render the same authoritative world state. Shared
*content* (furniture ids, prices, grid rules) should move to a shared JSON manifest the server owns,
which is the first step in Phase 9 and also benefits the browser client.
