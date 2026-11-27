# LoftLife

A 3D social world: a modern American city around the **Main Hotel**, with a personal suite, a
third-person avatar, a grid-based furniture builder, and — as of this build — real accounts,
persistent characters, player-owned worlds, a server-authoritative economy and live multiplayer.

Built with React 19 + TypeScript + Three.js + Vite, and a small Node/Express + SQLite backend
using Node's built-in `node:sqlite` (no native modules, no paid services).

---

## Quick start

```bash
npm install

# API + realtime (:8787) and Vite dev server (:3000) together
npm run dev:full
```

Open <http://localhost:3000>, create an account, and you spawn in your furnished hotel suite.

Other scripts:

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite only (no backend — the app falls back to offline mode) |
| `npm run server` | API + realtime gateway on `:8787`; also serves `dist/` if built |
| `npm run build` | Production build to `dist/` |
| `npm run assets:previews` | Render every catalog preview PNG from its actual 3D model (`--force`, `--only=`, `--category=`) |
| `npm run assets:check` | Re-validate every catalog image against the model signature that produced it |
| `npm run assets:upload` | Upload previews to R2 under `catalog/v1/<category>/` (needs `CATALOG_R2_BUCKET` + `CLOUDFLARE_API_TOKEN`) |
| `npm run db:seed` | Apply the catalog migration + generated seed to Neon (`--apply`, needs `DATABASE_URL`) |
| `npm test` | 180 integration/acceptance checks: HTTP API, permissions, CUBITS/TG-Banking/cash, economy, parties, voice signalling, transit seats, Cloudflare-issued identity, two-client city movement, 64-player capacity, the shipping Worker/Durable Object path, the catalog/preview pipeline, and multi-storey build persistence |
| `npm run lint` | `tsc --noEmit` |

Catalog assets are generated, not hand-drawn: `shared/catalog/expansion.mjs` is the single record of
what exists, and `scripts/render-catalog-previews.mjs` renders each item's real Three.js model into
`public/catalog-previews/`. See [docs/CATALOG-EXPANSION.md](docs/CATALOG-EXPANSION.md).

### Environment variables

All optional; sensible defaults are used.

| Name | Default | Purpose |
| --- | --- | --- |
| `PORT` | `8787` | API/realtime port |
| `LOFTLIFE_DATA_DIR` | `./data` | Where the SQLite database lives (git-ignored) |
| `LOFTLIFE_INSTANCE_CAPACITY` | `40` | Players per city instance before a new one opens |
| `LOFTLIFE_AUTH_RATE_MAX` | `12` | Auth attempts per minute per IP |
| `LOFTLIFE_API_URL` | `http://127.0.0.1:8787` | Dev proxy target for `/api` and `/ws` |
| `LOFTLIFE_SESSION_SECRET` | unset | Optional. HMAC key (≥ 32 chars) for tokens minted by the Cloudflare edge; must match the Worker's secret |
| `DATABASE_URL` | unset | Optional. Neon pooled connection string — read by the Cloudflare Worker, never by the game server |
| `GAME_ORIGIN` | `http://127.0.0.1:8787` | Optional. Where the Worker proxies `/api/*` and `/ws` |

**No secrets or API keys are required for local play.** Passwords are hashed with scrypt, session
tokens are stored only as SHA-256 digests, and nothing sensitive belongs in source control.

### Optional: Cloudflare edge + Neon identity

The Worker in `src/cloudflare/worker.ts` can front the app: it serves `dist/`, handles
register/login/logout against Neon Postgres, and proxies the game API and realtime socket to the
Node server. The Node server trusts the Worker's signed token with the same secret.

```bash
npm run build
npx wrangler secret put DATABASE_URL                 # Neon pooled connection string
npx wrangler secret put LOFTLIFE_SESSION_SECRET      # same value as the Node env var
export LOFTLIFE_SESSION_SECRET="$(openssl rand -hex 32)"   # for the Node server
npx wrangler dev --local                             # verify locally first
```

Set `GAME_ORIGIN` in `wrangler.toml` to wherever the game server runs. Without `DATABASE_URL` the
edge answers auth requests with `503 unconfigured`; local email/password accounts on the Node server
keep working either way. See [ARCHITECTURE §8](docs/ARCHITECTURE.md) for the token format, ownership
split and the pieces that still need a live Neon sign-in test.

---

## Product vision

**LoftLife is a living 3D social gaming world.** Its guiding principles are:

- **Explore a world, not a lobby:** a coherent, believable city with districts, streets, landmarks,
  destinations and interiors designed to feel connected.
- **Play without forced roleplay:** players choose how to spend their time; roleplay is not required
  to enjoy the world.
- **Interact with the world:** visible objects and places should be evaluated for meaningful,
  consistent interactions rather than serving only as decoration.
- **Give every destination a purpose:** locations should offer something to explore, something to
  interact with, or something to do with other players.
- **Create and share:** customizable characters, personal spaces, buildable destinations and
  collaborative experiences are core gameplay, not side features.
- **Make multiplayer feel alive:** accurate presence, synchronized movement and interactions,
  proximity voice, parties and shared activities must work reliably across devices.

The design shorthand is **FiveM-inspired world immersion + HighRise-inspired social creativity +
LoftLife gameplay and interaction**. These are inspirations, not templates to copy.

See the new root [`plan.md`](plan.md) for the complete product vision, design rules, feature pillars,
known gaps, priorities and long-term roadmap. The more implementation-specific status remains in
[`docs/ROADMAP.md`](docs/ROADMAP.md).

---

## What works right now

**Game (pre-existing, preserved)**
- Third-person and isometric camera, WASD + pointer-lock mouse look, sprint, jump, emotes, sitting.
- Grid-based room builder: **344 catalog items** (73 original + 271 expansion) covering construction,
  residential, commercial, nightlife, specialty, event, outdoor and vehicle pieces — with a preview
  thumbnail per item and per colour variant rendered from that item's own model, search, category and
  themed-collection filters. **Up to four stacked storeys** with per-storey finishes, real slabs,
  walls and rooftop railings, stairs that move the avatar between floors, and storey-local
  collision (see [docs/BUILDING-MULTIFLOOR.md](docs/BUILDING-MULTIFLOOR.md)).
  Recolour/rotate/move/duplicate/delete, undo, 5 floor finishes, 6 wall paints, 3 lighting moods,
  3 starter layouts.
- Character studio: skin tones, 6 hairstyles, 4 tops, accessories, hair/outfit colours.
- Main Hotel: lobby, 4 floors, brass elevator, keycard door terminal, numbered suite doors,
  resident NPC suites and greetings.
- Main City: a 725-block, 13-district world on the A–Z × 1st–30th grid — an eight-lane M Street
  boulevard, avenue/street/residential hierarchy, civic plaza, Central Park, entertainment and
  retail promenades, luxury waterfront, industrial yards and a three-block airport campus.
  Eleven walk-up destinations with interiors, live traffic and signals, a district-aware city map
  and walkable streets. See [docs/CITY-MASTERPLAN.md](docs/CITY-MASTERPLAN.md).

**Online (added in this build)**
- Accounts, sessions, rate limiting; first account on a fresh database becomes admin.
- Persistent character, wardrobe ownership, suite decoration, inventory, wallet.
- Economy: **CUBITS** digital wallet, **TG-Banking** account + payment card, physical cash, ATMs
  at Hotel Plaza and Market Hall, and a server-priced general store accepting wallet, card or cash.
- Legacy **YUANZI (元子)** and **TONGBAO (通宝)** wallets, append-only ledger, idempotent purchases
  and a daily reward remain intact. No exchange rate or automatic conversion is applied.
- Furniture/wardrobe shop: **344 world assets** + 6 wardrobe pieces at shared-catalog prices, with
  transparent previews, search, category filters and a live per-item 3D inspector.
- Player-owned worlds: create, decorate, publish, five access modes
  (public / private / invite-only / friends-only / collaborative), collaborator build rights.
- Friends, friend requests, blocking, player search, city chat, direct messages, proximity chat
  with whisper (4 m) / say (14 m) / shout (35 m) ranges.
- Live multiplayer: server-authoritative presence, 10 Hz movement broadcast, city instances that
  open automatically when full, and "join friend" travel between instances.
- **Parties**: create, invite, accept, kick, leave, cross-instance party chat, and "join leader".
- **Proximity voice**: opt-in WebRTC mesh, server-relayed SDP/ICE, audible only inside the
  whisper/talk/shout distance bands, with volume following distance. Voice Range (`R` cycles
  Off → Whisper → Talk → Shout) is separate from the microphone mode (`T`): push-to-talk,
  toggle-to-talk, voice activation with a sensitivity slider, open mic and push-to-mute. Settings →
  Audio & Voice holds the mode picker, sensitivity, permission status, input device and a live
  mic test; preferences save on-device offline and to the account when signed in.
- **Rideable transit**: six LoftLine routes (four buses, two elevated light-rail lines) with marked
  stops, plus a Central Station hub and 15 taxi destinations. Seats are assigned by the server,
  rider positions are server-authoritative, and passengers who board the same line share the tram.
- **Device-aware game HUD**: one cohesive interface built from `src/hud/`, composed for six
  presentations (mobile portrait/landscape, tablet portrait/landscape, desktop browser and the
  installed desktop app). Touch gets a single joystick, camera drag plus a Camera popover,
  contextual actions, sprint/jump/emote, voice and chat; desktop keeps keyboard/mouse and never
  mounts touch controls. A light central game menu holds Map, World, Inventory, Character,
  Social, Friends, Messages, Emotes, Settings and Leave world, and gameplay input is suppressed
  while it or the social sheet is open. Contextual actions, HUD states and safe-area layout are
  described in [docs/HUD-REDESIGN.md](docs/HUD-REDESIGN.md); runtime detection and device
  testing are in [docs/DEVICE-COMPATIBILITY.md](docs/DEVICE-COMPATIBILITY.md).
- **Avatar zoom**: `Z` (or the camera button) eases the camera toward the avatar and back to the
  exact previous distance and angle in both isometric and third-person views.
- Wardrobe studio locks unowned clothing with its server price; the 3D viewport is lazy-loaded so
  the sign-in wall no longer ships Three.js.
- **Asset pipeline**: 1,434 transparent 512×512 PNG previews rendered offline from the same
  `THREE.Object3D` the game places, with a manifest tying item id → model signature → image hash.
  `npm test` fails if a preview is missing, opaque, off-centre, unlinked from its model, or priced
  differently on the server than in the catalog.
- Reports and admin moderation endpoints; audit log.

**Not implemented yet** (see [plan.md](plan.md) and
[docs/CATALOG-EXPANSION.md](docs/CATALOG-EXPANSION.md#known-limitations)): an expanded *clothing*
line (the wardrobe keeps its existing garments; new shoes/swimwear/outerwear need rig geometry and
character-rendered previews), mitred geometry for curved/angled wall corners, animated stair
traversal and elevator/escalator motion, per-storey presence for visitors, custom uploaded assets,
the Unity 6 Windows/Android clients, server-side collision re-simulation, an earned-income loop, and
CI/load testing. R2 upload and the Neon migration/seed are implemented as guarded scripts but were
**not applied** here — this environment has no `DATABASE_URL`, R2 bucket or Cloudflare token; the
blockers and commands are in [docs/CATALOG-EXPANSION.md](docs/CATALOG-EXPANSION.md#storage-pipeline).

---

## Layout

```
server/            API + realtime (plain ESM JavaScript, no build step)
  db.mjs           SQLite schema, transactions, audit log
  auth.mjs         scrypt passwords, sessions, rate limiting
  economy.mjs      wallets, ledger, TG-Banking, cash/ATMs, shops, daily reward
  worlds.mjs       suites + player worlds, access rules, collaborators
  social.mjs       profiles, friends, blocks, chat, reports
  parties.mjs      in-memory party object, invites, membership
  transit.mjs      server-owned LoftLine routes, vehicles and seats
  realtime.mjs     WebSocket gateway, city instances, presence, chat, party, voice, transit
  index.mjs        Express app, routes, static hosting, error handling
  test/            integration tests (node:test)
  starter.mjs      furnished starter suite for new accounts
src/
  net/api.ts       typed HTTP client
  net/realtime.ts  reconnecting WebSocket client
  net/voice.ts     WebRTC proximity voice with push-to-talk
  session.tsx      account state, sync, presence, chat, party, voice, transit (React context)
  hud/             game interface: layouts (touch/desktop), joystick, actions, top HUD,
                   central menu, social sheet, editing panel, design primitives
  components/      AuthGate, 3D viewport, world menu, shop/worlds/settings modals
  game/            city layout, hotel/world builders, furniture, avatar rig, transit, audio
shared/            pure rules shared by server and client (device detection, HUD presentation)
shared/catalog/    expansion.mjs (344-item catalog + model params), preview-manifest.json
scripts/           render-catalog-previews.mjs, export-catalog-sql.mjs, lib/ (PNG codec, CPU
                   renderer, headless DOM shim)
migrations/        Postgres/Neon schema, incl. 0009 catalog metadata + generated seed
docs/              AUDIT.md, ARCHITECTURE.md, CATALOG-EXPANSION.md, ROADMAP.md, HUD-REDESIGN.md
```

## Documentation

- [docs/CITY-MASTERPLAN.md](docs/CITY-MASTERPLAN.md) — the city's districts, street hierarchy,
  destination register, transit network, implementation and validation record.
- [docs/AUDIT.md](docs/AUDIT.md) — honest audit of the codebase as found, plus the work done.
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — server design, data model, realtime protocol,
  hosting and costs, and the path to Unity.
- [docs/HUD-REDESIGN.md](docs/HUD-REDESIGN.md) — HUD systems, states, the six device layouts,
  screenshots and the verification report.
- [docs/DEVICE-COMPATIBILITY.md](docs/DEVICE-COMPATIBILITY.md) — runtime/input matrix, HUD rules,
  mobile renderer budget and the device test report.
- [docs/BUILDING-MULTIFLOOR.md](docs/BUILDING-MULTIFLOOR.md) — storey model, editor controls,
  stairs and movement, persistence/Worker parity, wall joining and limits.
- [plan.md](plan.md) — living status table: shipped, blocked storage, clothing expansion next.
- [docs/CATALOG-EXPANSION.md](docs/CATALOG-EXPANSION.md) — the 344-item catalog, model kinds,
  preview-rendering pipeline, database/storage changes, verification and known limitations.
- [docs/ROADMAP.md](docs/ROADMAP.md) — phased plan with current status.
- [docs/MULTIPLAYER-VALIDATION.md](docs/MULTIPLAYER-VALIDATION.md) — multiplayer and
  production validation: what the automated checks prove, what still needs a deployed run.
