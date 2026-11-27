# LoftLife — Architecture

## 1. Topology

**Production (Cloudflare):**

```
Browser (React + Three.js, static assets)
   │
   ▼
Cloudflare Worker (src/cloudflare/worker.ts)
   ├── Neon Postgres — accounts, sessions, profiles, worlds, social and economy data
   └── Durable Objects — TheCity / world realtime sockets, presence, chat and movement
```

**Local development (Node parity runtime):**

```
Browser ──► Vite ──► Express API (server/index.mjs) ──► SQLite
                  └► WebSocket gateway (server/realtime.mjs) ─► in-process instances
```

Vite proxies local `/api` and `/ws` requests to the Node dev server on `:8787`. The Node runtime
keeps SQLite for local development; the deployed Worker uses Neon and Durable Objects. The guest
session API and canonical city-instance contract are implemented in both runtimes so local
development follows the same guest and Main City rules as production.

The Worker serves the built client, owns account creation and sign-in against Neon, handles game
APIs, and routes realtime connections to Durable Objects. It does not proxy production city
realtime to the local Node server.

**Why this shape:** the browser protocol remains transport-agnostic, while Cloudflare provides the
production edge and per-instance realtime coordination. The Node runtime remains useful for fast
local development and automated parity tests.

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

**Instances.** TheCity is one shared logical instance. Clients request `city`; the shared
resolver canonicalizes that request to `city:main`. Clients cannot select arbitrary numbered
`city:*` instances, and invalid city shard requests are rejected before a Durable Object is
allocated. The default city capacity is 64 (configurable with `LOFTLIFE_CITY_CAPACITY`, retaining
`LOFTLIFE_INSTANCE_CAPACITY` as a compatibility fallback). When all 64 places are occupied, the
server rejects another join with `instance_full`. There is currently no overflow shard, waiting
lobby, or queue; the overflow experience is a follow-up design decision.

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

## 8. Production identity and realtime: Cloudflare + Neon

The deployed Cloudflare Worker is the production application edge. It serves static assets, owns
account registration and sign-in, handles game APIs, and connects realtime clients to the
`LoftLifeRealtime` Durable Object. Neon Postgres is the production store for account and game
records; Durable Objects coordinate live city/world sessions.

```
Browser ──► Cloudflare Worker ──► Neon Postgres
                    │
                    └──────────► Durable Objects (TheCity and player worlds)
```

### Token and session behavior

Passwords are hashed with PBKDF2-SHA256 using Web Crypto. Session tokens are HMAC-signed with
`LOFTLIFE_SESSION_SECRET`; the Worker checks the corresponding Neon session record on API and
realtime joins. Guest sessions are separate from account sessions, use a signed 12-hour token, and
are stored by hash in `ll_guest_sessions`. Guests can join TheCity and use public/nearby chat, but
cannot use account-only social, party, private-world, or messaging features.

The Node development runtime implements the matching `/api/guest/session` create/revoke contract.
It uses its own local SQLite database and shares the canonical city resolver with the Worker.

### Who owns what

| Concern | Production owner | Notes |
| --- | --- | --- |
| Password hash, email, handle, role | Worker → Neon | `ll_accounts`; unique handle and email |
| Account session revocation | Worker → Neon | `ll_sessions`; checked at the edge |
| Guest sessions | Worker → Neon | `ll_guest_sessions`; separate from registered accounts |
| Profiles, wallets, inventory, suites, worlds, social and economy | Worker → Neon | `ll_*` tables |
| Realtime presence, movement, chat and instance membership | Durable Objects | `LoftLifeRealtime`; one canonical `city:main` |
| Local development state | Node dev server → SQLite | Separate local data; not production persistence |

### Required Worker secrets

| Name | Purpose |
| --- | --- |
| `DATABASE_URL` | Neon Postgres connection string |
| `LOFTLIFE_SESSION_SECRET` | HMAC signing key, at least 32 characters |

Secrets are configured outside source control and injected by the deployment workflow. Never place
secret values in client code, repository files, logs, or test fixtures.

### Verification status

The Node and in-process Worker/DO test suites cover guest session creation/revocation, canonical
city routing, two-guest presence and chat, guest restrictions, and full-instance rejection. The
in-process Worker harness uses a Neon SQL stub and WebSocket shim; it is not a live Neon or
workerd test.

As of 2026-11-26, GitHub Actions checks and the Cloudflare deployment workflow completed
successfully for commit `262e2855d2f91663cfffedd3555e61f29a7511a7`. Cloudflare reports that the
corresponding Worker deployment is serving 100% of traffic. This confirms deployment, not the
live guest journey or production database migration state. A real two-client test against the
deployed Worker, Neon, and Durable Object is still required.

### Current scaling limit

TheCity is a single 64-player instance. A player arriving when it is full receives
`instance_full`. There is no queue, lobby, or automatic overflow routing yet. Do not create
numbered city shards as an implicit workaround; choose and document the overflow experience before
implementing it.
