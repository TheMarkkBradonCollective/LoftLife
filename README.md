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
| `npm test` | 161 integration/acceptance checks: HTTP API, permissions, CUBITS/TG-Banking/cash, parties, voice signalling, transit seats, Cloudflare-issued identity, two-client city movement, 64-player capacity, and the shipping Worker/Durable Object path |
| `npm run lint` | `tsc --noEmit` |

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

## What works right now

**Game (pre-existing, preserved)**
- Third-person and isometric camera, WASD + pointer-lock mouse look, sprint, jump, emotes, sitting.
- Grid-based room builder: 23 furniture items, recolouring, rotate/move/duplicate/delete, undo,
  5 floor finishes, 6 wall paints, 3 lighting moods, 3 starter layouts.
- Character studio: skin tones, 6 hairstyles, 4 tops, accessories, hair/outfit colours.
- Main Hotel: lobby, 4 floors, brass elevator, keycard door terminal, numbered suite doors,
  resident NPC suites and greetings.
- Main City: A–Z diagonal × 1st–30th street grid, procedural buildings, live traffic and signals,
  city map, walkable streets.

**Online (added in this build)**
- Accounts, sessions, rate limiting; first account on a fresh database becomes admin.
- Persistent character, wardrobe ownership, suite decoration, inventory, wallet.
- Economy: **CUBITS** digital wallet, **TG-Banking** account + payment card, physical cash, ATMs
  at Hotel Plaza and Market Hall, and a server-priced general store accepting wallet, card or cash.
- Legacy **YUANZI (元子)** and **TONGBAO (通宝)** wallets, append-only ledger, idempotent purchases,
  the furniture/wardrobe shop (23 furniture + 6 wardrobe pieces) and a daily reward remain intact.
  No exchange rate or automatic conversion is applied.
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
- **Rideable transit**: two LoftLine routes with marked stops. Seats are assigned by the server,
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
- Reports and admin moderation endpoints; audit log.

**Not implemented yet** (see [docs/ROADMAP.md](docs/ROADMAP.md)): custom uploaded assets, the Unity 6
Windows/Android clients, server-side collision re-simulation, an earned-income loop, and CI/load
testing.

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
docs/              AUDIT.md, ARCHITECTURE.md, ROADMAP.md
```

## Documentation

- [docs/AUDIT.md](docs/AUDIT.md) — honest audit of the codebase as found, plus the work done.
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — server design, data model, realtime protocol,
  hosting and costs, and the path to Unity.
- [docs/HUD-REDESIGN.md](docs/HUD-REDESIGN.md) — HUD systems, states, the six device layouts,
  screenshots and the verification report.
- [docs/DEVICE-COMPATIBILITY.md](docs/DEVICE-COMPATIBILITY.md) — runtime/input matrix, HUD rules,
  mobile renderer budget and the device test report.
- [docs/ROADMAP.md](docs/ROADMAP.md) — phased plan with current status.
- [docs/MULTIPLAYER-VALIDATION.md](docs/MULTIPLAYER-VALIDATION.md) — multiplayer and
  production validation: what the automated checks prove, what still needs a deployed run.
