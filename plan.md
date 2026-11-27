# LoftLife — Product Vision & Development Plan

_Last updated: 27 November 2026_

> **LoftLife is a living 3D social gaming world.** It combines immersive world exploration, responsive gameplay and multiplayer interaction with expressive avatars, personal spaces and player-created destinations. Players should have a great time without being required to roleplay.

This document is the product-level source of truth for what LoftLife is meant to become and why. It complements, rather than replaces, the implementation-focused [docs/ROADMAP.md](docs/ROADMAP.md), architecture notes and validation reports.

---

## 1. The vision

LoftLife takes inspiration from two different strengths:

- **FiveM-inspired world immersion:** a believable, connected city; enterable places; movement and transportation; a sense of scale; multiplayer presence; and environments that feel like places rather than menus.
- **HighRise-inspired social creativity:** expressive customizable avatars, personal spaces, furniture, clothing, social gathering places and player creativity.
- **LoftLife's own identity:** gameplay and interaction are foundational. The world is something players explore, use, build in and experience together — not simply a backdrop for chat.

**The target feeling:** a 3D social game where players can explore a city, visit destinations, meet friends, build homes and venues, interact with objects, attend events and play activities at their own pace.

### What LoftLife is not

- It is not a roleplay server where players must adopt a job, character or storyline.
- It is not only a chat room with avatars.
- It is not only a room decorator or a collection of disconnected scenes.
- It should not imitate FiveM, HighRise or another game's protected identity, content or assets.

Roleplay-style systems may be explored as optional experiences later, but they must never be a requirement for the core game.

## 2. Core design rules

These rules should guide feature requests, code reviews, world design, UI decisions and future development prompts.

1. **If players can see it, ask whether they should be able to interact with it.** Decorative objects are allowed, but prominent objects should have a clear purpose or an intentional reason they are non-interactive.
2. **If players can visit it, give them something worth doing there.** Every destination should offer something to explore, interact with, or do with other players.
3. **One consistent interaction language.** Doors, furniture, counters, transport, activities and devices should use predictable proximity prompts, input behavior, feedback and multiplayer synchronization.
4. **World first, not disconnected blocks.** Streets, buildings, sidewalks, districts, transit and landmarks must fit together as a coherent place.
5. **Gameplay before empty visual scale.** A smaller area with useful interactions is better than a huge empty map.
6. **Multiplayer truth over visual illusion.** Presence counts, movement, object state, seating, activity state and voice status must reflect authoritative live state. Never show a player as moving or online when the server says otherwise.
7. **Creative freedom with clear permissions.** Owners control access; visitors can explore without receiving edit rights; collaborators receive only the rights granted to them.
8. **No forced roleplay.** Socializing, exploring, creating and playing activities must all be valid ways to enjoy LoftLife.
9. **Consistent across devices.** Mobile, tablet, desktop browser and future installed clients should share the same game rules and world state, with controls composed for each device.
10. **Preserve working systems.** Extend the existing game and its established decisions; do not casually replace or simplify the hotel, city, multiplayer, avatar, building or HUD foundations.

## 3. The six product pillars

### Pillar A — A world worth exploring

TheCity should feel like a real, connected world rather than a uniform grid of repeated blocks.

- Build recognizable districts and neighborhoods with a clear purpose and visual identity.
- Use streets sized for the places they serve; blocks and parcels should vary to fit buildings, parks and public spaces.
- Give major corridors appropriate scale. **M Street is the primary city avenue** and should read as a major eight-lane road (four lanes in each direction), with important destinations concentrated along it.
- Keep road hierarchy, intersections, sidewalks, crossings, transit stops, landscaping and building entrances coherent.
- Place buildings intentionally. No overlapping structures, blocked entrances, floating assets, impossible road connections or buildings that do not fit their lots.
- Use believable transitions between exterior spaces and interiors.
- The airport should be a major, unmistakable destination. The clothing shop should be its own city location, not an airport department.
- Include public places that encourage spontaneous social play: parks, plazas, community spaces, shopping, entertainment and event venues.

The map should be laid out as a designed world, not just a grid filled with generic building boxes. Existing A–Z and 1st–30th street naming is a foundation, not a reason every block must be identical.

### Pillar B — Gameplay and meaningful interaction

Create a shared interaction framework rather than implementing one-off buttons for every object.

Interaction categories should include:

- **Enter/use:** doors, gates, elevators, terminals, counters, kiosks, appliances and devices.
- **Furniture/social:** sit, stand, lie down where appropriate, use tables, gather around shared objects and trigger paired/group-friendly animations.
- **Carry/use objects:** pick up, place, equip, activate or put away supported objects, with sensible ownership and persistence rules.
- **Entertainment:** arcade cabinets, bowling, pool, basketball, music and DJ equipment, dance areas, stages, screens and event equipment.
- **Transport:** board, ride, choose a destination, sit in assigned seats, disembark and receive clear travel feedback.
- **Social expression:** wave, dance, cheer, point, greet and other emotes; synchronize shared animations where needed.
- **Location-specific activities:** every major venue should have a reason to visit beyond looking at its décor.

Each interaction should define: activation range, prompt and input, eligibility/permissions, state transition, visual/audio feedback, persistence needs, multiplayer authority, cancellation/exit behavior and accessibility.

### Pillar C — Social multiplayer that feels alive

- Accurate live player presence and counts, with clear distinction between local/offline, guest and authenticated states.
- Smooth synchronized player movement and animation, with stationary players staying stationary.
- Friends, direct messages, city/world/party chat, parties and join-friend travel.
- Proximity voice with whisper/talk/shout ranges and accessible microphone controls.
- Shared object and activity state where players are expected to see the same result.
- Reliable reconnect, session expiry, instance capacity and guest behavior.
- World instances that remain available to authorized visitors even when the owner is offline; availability is separate from privacy/access. Worlds are unavailable only while in Edit Mode or maintenance.
- Browser permission prompts and device limitations must be handled honestly. Do not substitute fake counts or local-only movement for real multiplayer state.

### Pillar D — Creation, building and ownership

LoftLife should support many kinds of player-created places, not just decorated bedrooms.

- Homes, apartments, rooms, venues, nightclubs, bars, restaurants, shops, offices, parks and event spaces.
- Full construction vocabulary: floors, wall segments, wall finishes, ceilings, stairs, ramps, doors, windows, railings and structural pieces.
- Furniture, lighting, appliances, décor, storage, signs, counters and interactive props.
- Venue equipment: DJ decks, speakers, mixers, stage pieces, lighting rigs, screens, dance floors, bars and seating.
- Placement tools with move, rotate, duplicate, delete, snapping, collision/overlap checks, undo and redo.
- Room and building layouts that support different footprints and multi-floor structures.
- Public, private, invite-only, friends-only and collaborative access modes, with clear owner/editor/visitor permissions.
- Collaborative building should be live and understandable; visitors must not accidentally edit.
- Custom uploaded assets are a later capability and require validation, licensing, moderation, performance budgets and storage-cost controls before release.

**Asset authenticity rule:** when the project calls for images or previews of actual catalog items, use the real corresponding item assets. Do not use fabricated images that pretend to be existing inventory. If a real asset is unavailable, label the item as a placeholder rather than misrepresenting it.

### Pillar E — Avatar identity and personal spaces

- Customizable 3D characters with consistent proportions, animation and readable identity.
- Foundational facial features are a paid character makeover service; hair and makeup can be changed at the home bathroom mirror and professional salons.
- Clothing shops are browse-and-purchase. Purchased clothing enters inventory; outfit changes happen at the home closet. Players can save unlimited outfits.
- Personal hotel suite and player-owned worlds should feel like destinations, not admin screens.
- Preserve the established hotel journey: enter through the lobby, use the elevator, reach the correct floor and visit a suite. Keep hotel navigation and room ownership coherent as the hotel expands.
- The current codebase has a four-floor hotel foundation. The broader design target calls for a larger hotel with seven floors and 65 rooms; the floor-by-floor room allocation needs a consistent final layout before implementation because the earlier stated per-floor count and total do not mathematically match.

### Pillar F — Activities, events and reasons to return

Build repeatable, approachable activities that work with friends or strangers without requiring roleplay.

Potential activity catalogue:
- Arcade games and skill challenges.
- Bowling, pool and other venue games.
- Basketball and casual sports.
- Dance floors, dance-offs and emote challenges.
- DJ sessions, concerts, performances and community events.
- Shopping, exploring, collecting and discovery.
- Venue-hosted activities and player-created events.
- Cooperative activities and party challenges.

Activities should be introduced in small, testable slices. Each needs clear rules, start/join/leave behavior, multiplayer synchronization, reward policy (if any), accessibility and abuse prevention. Do not add rewards or economy rules without an explicit design and playtesting.

## 4. The first-session experience

A new player should be able to understand LoftLife without reading a manual.

1. Enter as a guest or create/sign into an account.
2. Arrive in a clear, welcoming starting location.
3. Learn movement, camera and the primary interact action naturally.
4. Discover a few meaningful nearby objects and destinations.
5. See other players with accurate presence and synchronized movement.
6. Find social tools without losing control of the character.
7. Visit a memorable location or activity.
8. Understand how to return to a personal space and how building works.

Guest access is a low-friction way to experience the shared city. Account-only features and guest restrictions must remain clear; never imply that a temporary guest has persistent ownership or account capabilities.

## 5. Existing foundation — preserve and build on it

The current README and implementation documentation describe these foundations. They are not a claim that every production path has passed live acceptance testing.

- **Client:** React, TypeScript, Three.js and Vite; responsive gameplay HUD for mobile portrait/landscape, tablet portrait/landscape, desktop browser and installed desktop presentation.
- **Server and realtime:** Node/Express + SQLite for local development; Cloudflare Worker, Neon Postgres and Durable Objects for production online services.
- **Accounts and identity:** account sessions, guest sessions, persistent character/profile and server-side validation.
- **Social:** friends, requests, blocking, city/world/party chat, DMs, presence, parties and proximity voice signalling.
- **Worlds:** player-owned spaces, publishing, access modes, collaborator permissions and building foundations.
- **Economy:** Yuanzi and Tongbao wallets, server-priced shop, inventory, append-only ledger and daily reward. Earning rates, exchange rates and real-money monetization remain explicit product decisions.
- **TheCity:** A–Z diagonal streets × 1st–30th streets, city map, procedural buildings, traffic and street signals.
- **Hotel:** lobby, elevator, floors and suites are implemented in the current foundation; the larger seven-floor/65-room target remains an expansion goal.
- **Transportation:** airport and travel flows plus two rideable LoftLine routes are documented in the current implementation.
- **Testing:** automated API, permission, economy, voice, transit, city presence/capacity and Worker-path checks exist. Automated tests do not replace live two-device acceptance testing.

For exact current status, see [README.md](README.md), [docs/ROADMAP.md](docs/ROADMAP.md), [docs/MULTIPLAYER-VALIDATION.md](docs/MULTIPLAYER-VALIDATION.md) and [docs/AUDIT.md](docs/AUDIT.md).

## 6. Development priorities

Priorities are ordered to protect the core experience and avoid adding large amounts of content on an unreliable foundation.

### P0 — Make the current shared world trustworthy

- Complete live production validation with two or more independent devices/accounts and guest sessions.
- Verify that player counts match actual connected players and update correctly on join, leave, reconnect and expiry.
- Verify movement is synchronized in both directions and stationary avatars do not drift.
- Validate chat, party invitations, join-friend travel, proximity voice and guest restrictions in the deployed environment.
- Verify Neon migrations, Cloudflare Worker and Durable Object behavior against the production configuration.
- Add repeatable monitoring for connection count, instance occupancy, reconnects, errors and server health without exposing private player data.

### P1 — Establish the world and interaction foundation

- Audit the city as a connected environment: road hierarchy, M Street, district layout, varied block sizes, landmark placement, airport scale, standalone clothing shop and clean building/road alignment.
- Establish one reusable interaction registry/schema and prompt/feedback system for world objects.
- Define synchronized interaction state and server authority for shared objects.
- Add collision-aware movement and server-side validation so players cannot pass through blocked geometry.
- Verify hotel navigation, room addressing, guest visits and the intended expanded hotel layout.
- Create an interaction coverage matrix for every existing major location.

### P2 — Make destinations playable

- Build a small end-to-end activity slice (for example, one arcade game or pool table) using the shared interaction framework.
- Add venue-ready building pieces and functional equipment, beginning with a complete club/venue kit.
- Make public destinations feel distinct and worthwhile.
- Add activity and event lifecycle support: discover, join, participate, leave and cleanly recover after disconnect.
- Keep all activity rewards disabled until economy rules are explicitly designed.

### P3 — Expand creation and social experiences

- Expand multi-floor construction and structural pieces.
- Improve collaborative editing, revision history, conflict handling and visitor clarity.
- Expand the catalog with real, consistently presented item imagery.
- Add more shared activities and player-hosted events.
- Add world discovery tools and clearer destination information.

### P4 — Platform expansion and scale

- Prototype the existing REST/realtime protocol in a Unity 6 client.
- Deliver Windows desktop and Android APK targets when input, rendering, account, asset and realtime parity are proven.
- Add TURN relay for voice after choosing an operating-cost approach.
- Load test beyond the current 64-player shared-city capacity; make queue/instance decisions from measurements.
- Add custom asset upload only after moderation, licensing, validation and storage policy are ready.

## 7. Definition of done

A feature is not done merely because a button or model appears.

A gameplay feature is done when:
- It works with keyboard/mouse and the relevant touch layouts.
- Its prompt, control, feedback and exit path are understandable.
- It handles unavailable permissions, disconnects and invalid states.
- Shared state is authoritative and consistent for all players who should see it.
- It has automated coverage for important rules and manual acceptance where real devices or production services are required.
- It does not break existing hotel, city, avatar, building, social or travel behavior.

A destination is ready when:
- Its geometry, roads, entrances and neighboring spaces fit together.
- Players can enter and navigate it.
- It has at least one meaningful activity or interaction, or a deliberate social/exploration purpose.
- It performs acceptably on supported mobile and desktop targets.
- Its multiplayer and permissions behavior is verified.

A release is ready when:
- Build, typecheck and automated tests pass.
- Cloudflare/Neon deployment and migrations are verified.
- Real-device and multi-client smoke tests pass for the changed systems.
- Known limitations are documented rather than hidden.

## 8. Product decisions that must not be guessed

- Yuanzi/Tongbao earning rates, exchange rate and real-money purchase rules.
- Paid item catalogue and exact pricing beyond the existing server-defined prices.
- Custom upload licensing, moderation and technical limits.
- Final hotel room numbering and exact allocation across seven floors / 65 rooms.
- Activity reward values and any competitive ranking rules.
- Any feature that creates recurring hosting, voice relay, storage or moderation costs.

## 9. Documentation map

- [README.md](README.md) — project overview, quick start, current feature summary and commands.
- [docs/ROADMAP.md](docs/ROADMAP.md) — implementation status and near-term engineering sequence.
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — topology, data model, trust boundaries and production architecture.
- [docs/MULTIPLAYER-VALIDATION.md](docs/MULTIPLAYER-VALIDATION.md) — automated and manual multiplayer validation.
- [docs/HUD-REDESIGN.md](docs/HUD-REDESIGN.md) — gameplay HUD and device presentations.
- [docs/DEVICE-COMPATIBILITY.md](docs/DEVICE-COMPATIBILITY.md) — device/input matrix and compatibility notes.
- [docs/AUDIT.md](docs/AUDIT.md) — repository audit and known limitations.

---

**North star:** if players can see it, consider how they can interact with it. If they can visit it, give them something worth doing there. Build a world people want to explore together — without making roleplay mandatory.

## 10. Delivery status — catalog, characters, city and multi-floor build

Status is literal: **Done** means implemented here and covered by an automated check; **Blocked**
names missing external access; **Next** is unstarted. Deeper detail lives in
[docs/CATALOG-EXPANSION.md](docs/CATALOG-EXPANSION.md),
[docs/CHARACTERS-NPCS-VEHICLES.md](docs/CHARACTERS-NPCS-VEHICLES.md) and
[docs/BUILDING-MULTIFLOOR.md](docs/BUILDING-MULTIFLOOR.md).

| Area | Status | Evidence |
| --- | --- | --- |
| Authored catalog (344 items, 95 model kinds) | Done | `shared/catalog/expansion.mjs`, `server/test/catalog-expansion.test.mjs` |
| Imported Kenney library (1,676 models / 21 kits; 1,627 net-new catalog rows; 49 re-skins) | Done | `shared/catalog/kenney-library.mjs`, `server/test/kenney-library.test.mjs`, `docs/KENNEY-ASSET-LIBRARY.md` |
| Real previews + searchable gallery for imported models | Done | `npm run assets:kenney`, `npm run assets:gallery`, `public/asset-gallery.html` |
| Runtime GLB loading (lazy, deduped, LRU, pending rebuild, R2-ready URLs) | Done | `src/game/assets/kenneyRuntime.ts`, `RoomViewport.tsx`, `BuildPanel.tsx` |
| Character library (51 records; pedestrian/service/accessibility separation) | Done | `shared/catalog/character-library.mjs`, `server/test/character-vehicle-libraries.test.mjs` |
| City crowd (50 agents, sidewalk loops, corner crossings, venue visits, reactions, LOD/recycling) | Done | `shared/city-crowd.mjs`, `src/game/cityCrowd.ts`, `npm run check:people` |
| Animation foundation (13 states, distance-driven stride, server validation) | Done | `shared/animation.mjs`, `src/game/avatar.ts`, `server/realtime.mjs` |
| Vehicle library (134 models / 12 groups, real previews, group filters) | Done | `shared/catalog/vehicle-library.mjs`, `src/game/kenneyCatalog.ts`, gallery |
| In-world traffic + transit (16 cars, 4 buses, 2 metro trains, 6 parked cars; server-owned LoftLine preserved) | Done | `src/game/cityTraffic.ts`, `server/transit.mjs`, `RoomViewport.tsx` |
| Vehicle enter/exit animation and seating metadata | Done | `shared/animation.mjs`, `src/game/avatar.ts`; free driving is not implemented |
| Weapon/gambling exclusion + full 49-kit classification | Done | `KENNEY_SUMMARY`, `docs/KENNEY-ASSET-LIBRARY.md` |
| Placement persistence (online-mount autosave gate, integer cell snapping) | Done | `src/App.tsx`, `src/game/gridMath.ts`; verified by live place → PUT 200 → reload |
| 1,434 transparent previews rendered from the actual models | Done | `npm run assets:check` |
| Preview ↔ model provenance (signature + image hash) | Done | `shared/catalog/preview-manifest.json` + manifest tests |
| Catalog search, filters, collections, live 3D inspector | Done | `src/hud/BuildPanel.tsx`, `src/components/ShopModal.tsx`, `ModelInspector.tsx` |
| One price table for client, Node API and Cloudflare edge | Done | `server/economy.mjs`, `src/cloudflare/{economy,worker,worlds}.ts` |
| Multi-storey construction (4 levels, per-floor styles, rooftop) | Done | `shared/building.mjs`, `src/game/floorShells.ts`, `docs/BUILDING-MULTIFLOOR.md` |
| Stairs as storey transitions + storey-local collision | Done | `src/components/RoomViewport.tsx`, transition tests |
| Multi-storey persistence incl. Worker parity | Done | `server/validate.mjs`, `server/test/multifloor.test.mjs`, API round-trip test |
| Wall-run joining for structural pieces | Partial | bounding-box alignment only; no mitred curves |
| Catalog schema + generated seed | Done, not applied | `migrations/0009_catalog_expansion.sql`, `scripts/export-catalog-sql.mjs` |
| R2 upload (previews + GLBs + textures + manifests) | Blocked | `npm run assets:upload` needs `CATALOG_R2_BUCKET` + `CLOUDFLARE_API_TOKEN`; script is dry-run verified |
| Production build excludes R2-hosted assets | Done | `vite.config.ts` + `VITE_ASSET_BASE_URL`; verified `dist/` has no `models/` or `catalog-previews/` and the gallery points at the base |
| Neon migration + seed | Blocked | `npm run db:seed` needs `DATABASE_URL` |
| Cloudflare deployment | Blocked | no token here; `wrangler deploy --dry-run` passes |

### Next

1. Apply the R2 upload and point `VITE_ASSET_BASE_URL` at the bucket/CDN root, then repeat the
   production asset check on the deployed origin (and confirm CORS/public access). The importer,
   previews, uploader and the build-time asset split are ready; only credentials are missing here.
2. Split the 1.7 MB imported catalog metadata into a lazily fetched JSON module to trim the initial
   client chunk on low-end phones.
3. Commission or author rigged, animated character models and clips; Kenney's available kits have
   no skeletons, so imported characters are static and deliberately limited to distant crowd LOD.
4. Add player-driven vehicles: vehicle physics, server authority, camera and collision handling. The
   catalogue metadata, enter/exit poses and passenger transit already exist to build on.
5. Expand the clothing catalog with new garment rig geometry (shoes, swimwear, outerwear) plus
   character-rendered previews; wire records through `shared/character.mjs`.
6. Mitred geometry for curved/angled wall corners.
7. Per-storey room outlines, atriums, animated stair traversal.
8. Broadcast storey with player presence so visitors render on the right floor.
9. Apply Neon migration/seed and upload previews to R2 once credentials exist; serve preview URLs
   from R2 in the Worker.
10. Physical-device validation of the storey controls, crowd LOD and HUD on Android phones/tablets.
