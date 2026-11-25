# LoftLife — Repository Audit

_Date: 25 November 2026. Scope: the repository as it existed at the start of this work, plus the
changes delivered in this session._

This is a factual account. Anything described as working was exercised (typecheck, production build,
16 automated tests, or a real browser session). Anything not exercised is described as such.

---

## 1. What the project actually was

A **browser-only React + Three.js room-builder prototype** — around 14,200 lines across 21 source
files — with no server component of any kind. Every piece of state lived in `localStorage`.

Architecture as found:

| Area | Files | Notes |
| --- | --- | --- |
| 3D scene | `RoomViewport.tsx` (3,082 lines) | One component owning WebGL setup, movement, camera, interaction, furniture sync |
| App shell / HUD | `App.tsx` (1,551 lines) | All UI state, catalog filtering, hotkeys, dock, modals |
| World building | `worldBuilder.ts` (2,018), `hotelBuilder.ts` (939), `roomBuilder.ts` (507) | Procedural geometry |
| Content | `catalog.ts` (652), `furniture.ts` (1,431) | 23 furniture items, 3 presets, 5 NPC residents |
| City | `cityLayout.ts` (311), `cityTraffic.ts` (823) | A–Z × 1st–30th street grid, traffic + signals |
| Avatar | `avatar.ts` (719) | Sculpted rig, procedural animations, emotes |

## 2. Functionality that genuinely worked

Verified by reading the implementation, then by `tsc`, `vite build`, and browser inspection:

- **Room building.** Grid placement (14×14 m), footprint-aware collision, rotation, recolouring,
  move/duplicate/delete, 20-step undo, wall-mounted items on north/west walls.
- **Surfaces and lighting.** 5 floor finishes, 6 wall paints, morning/golden/night moods.
- **Character creator.** Skin tones, 6 hairstyles, 4 tops, 4 accessories, colour pickers, live
  preview, procedural idle/walk/sit/wave/dance/cheer/jump animation.
- **Hotel.** Lobby, four floors, elevator floor picker, keycard door terminal, numbered suite doors
  with proximity interaction, guest visit into resident NPC suites with greetings.
- **Main City.** Procedural street grid with A–Z diagonal streets, plaza, fountain, buildings,
  ground-height resolution, camera occlusion avoidance, city map modal, street-name HUD.
- **Traffic.** Vehicles following the street network with signal phases (decorative, non-rideable).
- **Movement.** Isometric click-to-walk with A* pathfinding, third-person play view with pointer
  lock, sprint, jump, sitting on furniture.
- **Audio.** WebAudio-synthesised SFX (steps, clicks, place/remove, elevator ding).

This is a genuinely good foundation. It was preserved rather than rewritten.

## 3. Defects and gaps found

| # | Finding | Severity |
| --- | --- | --- |
| 1 | **The dependency graph did not install with npm.** Root `esbuild@^0.25` conflicted with Vite 8's required peer `^0.27 \|\| ^0.28`, so `npm install` failed outright. Only Bun's lenient resolver could install it. | Blocker |
| 2 | **No backend at all.** `express`, `dotenv` and `@google/genai` were listed as dependencies but no server file existed; the `clean` script referenced a `server.js` that was never written. Multiplayer, accounts, economy and persistence were entirely absent. | Blocker for the vision |
| 3 | `@google/genai` is unused dead weight (with `protobufjs` etc. behind it). | Low |
| 4 | No tests of any kind. | Medium |
| 5 | `App.tsx` and `RoomViewport.tsx` are 1,551 and 3,082 lines — monoliths with mixed concerns, making changes risky. | Medium |
| 6 | Single 1.1 MB JS chunk (301 kB gzip). Three.js is bundled eagerly on the auth path. | Low |
| 7 | No mobile input path: no touch joystick, no touch camera. Desktop-only controls. | High for the vision |
| 8 | Traffic is visual only — no rideable taxi/bus/train, no schedules. | High for the vision |
| 9 | NPC residents are hardcoded fiction, not real players. | Expected for a prototype |
| 10 | No wardrobe ownership, shops, currency, or any economy concept. | High |
| 11 | Suite identity was implicit (`402` hardcoded in the client); no room addressing, ownership, or guest permissions. | High |
| 12 | `localStorage` writes were unguarded against quota errors beyond a `try/catch`, and there was no migration path. | Low |
| 13 | City identity markers (`CITY_LAYOUT`) live only in the client, so the server cannot validate city-space positions properly. | Medium (documented below) |

## 4. What was delivered in this session

### 4.1 Foundation (Phase 2)
- `server/` — Express API + WebSocket gateway + **`node:sqlite`** persistence (zero native modules,
  zero paid services). Schema covers users, sessions, profiles, wallets, ledger, inventory, suites,
  worlds, collaborators, invites, friendships, blocks, chat, reports, audit log.
- Accounts: scrypt password hashing with per-user salt, 30-day sessions stored as SHA-256 digests,
  fixed-window rate limiting on auth, `suspended_until` enforcement that also drops live sessions.
- Server-side validation of every persisted shape (`server/validate.mjs`) — unknown keys dropped,
  out-of-range values rejected, furniture ids checked against the real catalogue.
- First account on a fresh database becomes `admin`; moderation endpoints are gated on the role.

### 4.2 Character & suite persistence (Phase 3/4 core)
- Character appearance persists per account; **wardrobe ownership is enforced server-side**, so a
  player cannot equip clothing they have not bought.
- Each account gets a furnished starter suite (mirrors the original `cozy_studio` preset) — a new
  player no longer signs into an empty box.
- Room state saves are debounced (1.2 s) and flushed on `pagehide`; `localStorage` remains the
  offline path.

### 4.3 Economy (Phase 8 core)
- **YUANZI (元子)** primary, **TONGBAO (通宝)** secondary. Integer-only balances, never floats.
- Append-only ledger with a unique partial index on idempotency keys: a retried purchase returns the
  original result instead of charging twice. All balance movement happens inside
  `BEGIN IMMEDIATE` transactions with a `>= 0` CHECK constraint as a second line of defence.
- Prices live on the server and are never read from the request body. Daily reward is the current
  Tongbao source.

### 4.4 Worlds, permissions, social, realtime (Phase 5/6 core)
- Player worlds with owner-controlled access: `public`, `private`, `invite`, `friends`, `collab`.
  Publishing is owner-only. Visitors never receive build rights; collaborators are explicit.
- Friendship requests/accept/remove, blocking (which also hides a player from search and cancels the
  request), player search, persisted city and DM chat history, proximity chat with three ranges.
- Realtime gateway: authenticated handshake, presence, 10 Hz movement broadcast, city instances that
  open at capacity, "join friend" instance travel, world instances with access checks on entry.
- Client: sign-in wall, session provider, reconnecting socket, remote avatars with name tags,
  community panel (chat/friends/presence), shop, world browser, and world building that reuses the
  existing room builder.

### 4.5 Verification performed
- `npx tsc --noEmit` — clean.
- `npm run build` — clean (1.11 MB / 301 kB gzip, warning only).
- `npm test` — **16/16 passing**, including: server-priced and idempotent purchases, overspend
  rejection, wardrobe enforcement, suite validation, all five world access modes, editor-vs-visitor
  permissions, blocking effects, unauthenticated sockets rejected, private worlds rejected over the
  socket, and **two real WebSocket clients exchanging presence, movement and chat**.
- Browser session against the running dev server: auth gate rendered, account created through the UI,
  furnished suite loaded, `PATCH /api/profile` and `PUT /api/suite` both `200`, and a second live
  client rendered as a named avatar in the same suite.
- Realtime reconnect verified by restarting the API process while a client was connected.

## 5. Known limitations (stated plainly)

- **Movement is sanity-checked, not simulated.** The server bounds coordinates and rejects impossible
  per-tick displacement, but it does not run collision physics. A determined client can still walk
  through walls. Fixing this needs a shared deterministic simulation or server-side navmesh.
- **The hotel suite is per-account but shares one physical slot** (`402`). Every player sees their
  own suite at the same hotel address; cross-player suite visits use the worlds system instead.
- **Proximity voice is not implemented.** No signalling, no capture. Only text proximity chat exists.
- **Vehicles/transit are still decorative.** No rideable taxi, bus, rail or plane.
- **Parties and group chats are stubs.** The server returns an explicit `not_implemented` rather than
  pretending.
- **The avatar studio does not grey out unowned clothing.** The server rejects an unowned outfit, and
  the client surfaces that error, but the picker still shows locked pieces as selectable.
- **No mobile touch controls** yet.
- **Single-node only.** Rate limits and presence are in-process; running multiple API processes
  behind a load balancer would need shared state (Redis) and sticky WebSocket routing.
- **`node:sqlite` is single-writer.** Fine for thousands of accounts; the schema is portable to
  PostgreSQL when concurrency demands it (see ARCHITECTURE.md).
- **Two accounts and some test rows now exist in `./data/loftlife.db`** from browser verification.
  That directory is git-ignored; delete it to start clean.
- The pre-existing top toolbar can still crowd the brand panel below ~1,250 px width; the right-hand
  cluster now wraps instead of overlapping.

## 6. Work not claimed

No Unity 6 client, no Windows or Android build, no voice, no custom-asset pipeline, no moderation
dashboard UI, no code splitting, and no CI pipeline were produced in this session. They are
sequenced in [ROADMAP.md](ROADMAP.md).

## 7. Update — completed after this audit

The following §5/§6 items were implemented afterwards and are no longer open: proximity voice
(WebRTC signalling relay, push-to-talk, distance bands), rideable LoftLine transit with server-assigned
seats, parties with cross-instance group chat, mobile touch controls, wardrobe gating in the avatar
studio, and code splitting of the 3D viewport. The suite grew from 16 to 19 integration tests
(parties, voice signalling, transit). Verified with `tsc`, `npm test`, `npm run build` and a live
browser session (account creation, city entry, stop prompt, boarding and server-driven riding).
Still open from §5/§6: server-side collision re-simulation, custom uploaded assets, Unity/Windows/
Android clients, CI and load testing. See [ROADMAP.md](ROADMAP.md) for current status.
