# LoftLife World Upgrade — Implementation Report

Branch: `main`  
Status: implemented, merged with the latest `main`, and pushed to `main`.

This pass extends the existing React 19 + Three.js client and Node/SQLite server. It does not
replace accounts, guest sessions, city hosting, room ownership, permissions, multiplayer,
camera modes, controls, or the existing furniture/clothing economy.

## Shipped in this pass

### 1. City environment

- Rebuilt the LoftLife Grand Hotel as a seven-storey landmark with a limestone and brass
  façade, glazed ground floor, balcony rails, penthouse setback, rooftop beacon, illuminated
  marquee, suite plaque, canopy, openable glass doors, keycard pedestal, and a furnished
  forecourt (paving, topiary planters, brass bollards, benches, flagpoles, bellhop cart).
- Replaced the old hotel footprint with a large airport terminal shared across three blocks,
  with a glazed landside façade, drop-off lanes, canopy, signage, and animated entrance doors.
- Opened LoftLife Threads as its own city storefront on a separate block, with display windows,
  mannequins, awning, and a direct street entrance.
- Extended the city map to show the hotel, airport, store and salon footprints, the updated
  hotel address (W St / 28th St), the new 65-suite directory, landmarks, legend, transit notes,
  and edge-aware labels.
- Fixed the hotel/airport overlap that previously placed the hotel spawn inside the airport's
  collision volume. The hotel now sits one block west, beside the terminal with clear
  sidewalks and sightlines.

### 2. Hotel — 7 floors, exactly 65 suites

The authoritative rules live in `shared/hotel-layout.mjs` and are shared by the client, map,
elevator panel, hallway builder and tests.

| Part | Result |
| --- | --- |
| Floors | 1 lobby + floors 2–7 |
| Standard floor | 5 north + 5 south + 1 east-end suite = 11 |
| Floor 7 | 10 suites; east end is housekeeping |
| Total enterable suites | **65** |
| Numbering | Floor + two digits; Suite 402 is unchanged |
| Ownership | Existing suite ownership and permissions preserved |

The physical flow is implemented and tested:

1. Approach the hotel on W St.
2. Use the intercom/keycard terminal at the entrance.
3. Walk through the doors into the lobby (no direct teleport).
4. Walk to the brass elevator and select a floor.
5. Arrive in that floor's hallway.
6. Walk to the suite door (or ring an active resident).

The lobby now includes the reception desk and concierge, chandelier, wall sconces, marble
floor and runner, two seating clusters with sittable sofa/club chairs, coffee and side tables,
rug, console, framed art, palms and elevator lobby.

### 3. Airport

`src/game/airportBuilder.ts` is a fully walkable interior, not a backdrop:

- Landside hall with check-in counters and queue lanes.
- Departures/arrivals FIDS boards and wayfinding.
- Security checkpoint with lanes and screening frames.
- Gate hold rooms, gate desks, lounges and seating.
- Baggage claim carousel and arrival hall.
- Café/restaurant counter and info desk.
- Large glazed façade, signage, columns, ceiling light coves and animated doors.
- Apron, taxiway and static aircraft visible airside.
- Collision for counters, seating, planters and security equipment.
- Check-in, gate and baggage-claim interactions are wired in `RoomViewport`.
- Travel buttons reuse the existing destination/travel modal.

The terminal and the clothing store are separate buildings. The store is not inside the airport.

### 4. LoftLife Threads clothing store

`src/game/clothingStoreBuilder.ts` is a separate walkable retail interior:

- Clothing racks and display tables with folded/hanging stock.
- Mannequins on plinths, shoe wall, accessory wall and mirrors.
- Fitting rooms with curtains and benches.
- Checkout counter, register, stylist NPC and store signage.
- Collision and proximity interactions.
- Checkout opens the existing `ShopModal` in clothing mode.
- Purchases still use the existing server-owned prices, wallet and ownership checks.
- Purchased clothing is still added to inventory.
- Outfit changes remain restricted to the home closet.

### 5. Character customization

Expanded `AvatarProfile` and the procedural rig in `src/game/avatar.ts`:

- **18 hairstyles**: bob, afro, ponytail, side part, buns, spiky, long waves, buzz, curls, locs,
  pixie, middle part, top knot, shoulder waves, braids, undercut, fade, curtain.
- **14 tops**: hoodie, blazer, tee, turtleneck, button shirt, sweater, jacket, tank, varsity,
  raincoat, suit, dress, crop hoodie, cardigan.
- **7 bottoms**: jeans, chinos, shorts, skirt, joggers, dress pants, cargo.
- **8 head accessories** including none, glasses, headphones, beanie, cap, bucket hat,
  sunglasses and scarf.
- **Jewelry** (chain, watch, earrings, bracelet), **carry** (backpack, purse, tote),
  **facial hair** (stubble, beard, goatee, mustache), four eyebrow styles, six eye colours,
  and four makeup levels including “none”.
- Full colour controls for hair, skin, tops/bottoms, shoes, eyes and makeup.
- Existing paid-makeover, salon/mirror and closet rules are retained.
- Server avatar validation and the Cloudflare worker defaults/allowlists were extended to match.
- Ownership locks in `AvatarModal` respect purchased clothing, jewelry, accessories and carry.

### 6. Furniture catalog and building

Added **50 new furniture items** with server-owned prices, builders and placement data:

- Living: loveseat, armchair, chaise, ottoman, media console/TV, bar cabinet, round tables.
- Bedroom: king and twin beds, nightstand, dresser, wardrobe, vanity, bed bench.
- Kitchen: island, cabinet run, refrigerator, range, microwave, dining table and chairs.
- Bathroom: double vanity, soaking tub, rain shower, backlit mirror, linen cabinet.
- Office: executive desk, library bookcase, filing cabinet, studio workstation.
- Outdoor: patio loveseat/lounge, patio table, garden bench, planter box, fire pit.
- Lighting/decor: floor lamp, desk lamp, wall clock, curtains, wall art, mirrors, rugs,
  plants, vases and more.

Existing browse / buy / store / place / rotate / move / recolour / remove / save-layout
controls are preserved. The new items use the same placement, collision, persistence and
multiplayer item sync paths as the original catalog. Sittable items declare seat offsets and
approach points so PC and mobile users can sit from either side.

### 7. Visual and animation work

- New procedural materials/textures for hotel façade, limestone, brass, marble, shop glazing,
  airport wayfinding and the hotel marquee; no binary texture downloads.
- Animated hotel and airport doors, elevator doors, NPCs, seating and existing avatar walk/idle
  animations retained.
- Interior lighting: chandelier bulbs, wall sconces, lamp shades, FIDS glow, store accent light.
- Cutaway walls and camera occlusion behavior preserved for interior visibility.
- Distances, fog, exposure and camera framing are set per location so the airport/store
  interiors read at the same scale as the hotel.

## Assets added

No external models or image files were added. Everything new is procedural Three.js geometry
and canvas-generated signage/texture work, which keeps the download small and avoids licence
or mobile-memory costs. The only new image-like resources are runtime canvases for the hotel
marquee, suite plaque and airport/retail signage.

## Verification performed

### Static gates

| Command | Result |
| --- | --- |
| `npm run lint` (`tsc --noEmit`) | pass |
| `npm test` (`node --test server/test/*.test.mjs`) | **128 pass, 0 fail** |
| `npm run build` (`vite build`) | pass |

The post-merge test run includes the new `hotel-layout.test.mjs` (7 floors, 11/10 split,
total 65, Suite 402 unchanged), the worker city/multiplayer suites, city capacity, session
expiry and the existing economy, voice and avatar tests.

### Browser checks (Cloud preview, desktop and phone viewport)

- Landing → guest entry → city: pass.
- City map opens, shows the rebuilt footprints/floors/legend: pass.
- Hotel exterior and forecourt render: pass.
- Online account keycard → lobby → elevator panel → Floor 4 hallway: pass.
- Elevator directory lists floors 2–7, Floor 7 as 10 suites + housekeeping, Lobby: pass.
- Guest room entry/exit (existing guest path) preserved: pass.
- Airport entry from the city, interior render, exit back to drop-off: pass.
- Clothing store entry, interior render, exit to storefront: pass.
- Avatar studio opens with the expanded hair, eyes, beard, makeup, jewelry and carry options,
  and updates the 3D rig: pass.
- Phone viewport 390×844: touch joystick, Emote, interaction button and mobile HUD render: pass.

### Multiplayer

Two independent guest tokens were connected to the live city socket and both received the same
snapshot. Moving one to `airport` and the other to `clothing_store` was reflected in both
clients' player lists, along with the existing `Tester` connection. This confirms the new
location allowlist and pose broadcast path on the server and realtime worker.

### Performance snapshot

Measured at the city entrance after the upgrade via the existing development probe:

| Metric | Value |
| --- | --- |
| Draw calls | 219 |
| Triangles | 339,270 |
| Geometries | 142 |
| Textures | 30 |
| `RoomViewport` production chunk | 835.6 kB / 220.0 kB gzip |
| App shell chunk | 247.3 kB / 62.3 kB gzip |

The new interiors reuse merged procedural geometry and shared materials. City draw calls and
texture count stayed in the same range as before the airport/store additions. No external
textures, LOD meshes or streaming assets were added, so mobile memory did not grow through a
large asset payload.

**Limit:** the Cloud browser reports only ~2 animation frames/second when the tab is not
focused, so a trustworthy FPS number could not be captured there. The values above are
geometry/draw-call counts, not an FPS claim. A real Android/desktop FPS pass remains open.

## Remaining work / known limitations

1. **Visual realism.** The world is more detailed and less repetitive, but character, traffic
   and some furniture still use stylised low-poly forms. A final art pass with authored models,
   normal maps and richer animation would be the next quality step.
2. **Full airport interaction pass.** The terminal, counters, FIDS, security, gates, baggage
   carousel and travel hooks are built and the entry/exit loop was tested. The check-in and
   gate dialogs should still be exercised end-to-end after the final layout freeze.
3. **Two-browser visual check.** A second incognito browser cannot pass the preview host's
   owner gate, so multiplayer was verified over two real guest WebSocket sessions rather than
   two rendered browser tabs. The existing worker two-guest test also passes.
4. **Android performance.** No physical Android device was available. Touch controls and the
   phone viewport were verified; FPS/memory on real hardware still needs a device pass.
5. **Lobby detail.** The cutaway lobby now has functional seating, lighting, art and a console,
   but a ceiling and a second full lounge are still candidates for a future art pass.
6. **Traffic.** Existing vehicles remain low-poly; no new vehicle models were introduced.

## Pull requests

None. At the user's explicit request this change set was committed and merged directly into
`main` instead of being opened as a pull request. The feature branch
`freebuff/0756ec6a1031b32441466a6b` is retained in history.
