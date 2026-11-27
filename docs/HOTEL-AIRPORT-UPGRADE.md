# Main Hotel & Airport Upgrade

This pass rebuilds the two largest interiors in LoftLife. It keeps the existing
account, suite, furniture, camera, movement and multiplayer contracts; no map
coordinates, spawn points or world transitions moved.

## Part A — LoftLife Grand Hotel

### Locked configuration

The authoritative rules live in `shared/hotel-layout.mjs` and are shared by the
hallway builder, the elevator panel, the city map, registration on both
runtimes, and `npm run check:hotel`.

| Floor | Use | Door slots | Enterable suites |
| --- | --- | --- | --- |
| 1 | Main lobby | — | — |
| 2 | Residential | 11 | 11 · 201–211 |
| 3 | Residential | 11 | 11 · 301–311 |
| 4 | Residential | 11 | 11 · 401–411 |
| 5 | Residential | 11 | 11 · 501–511 |
| 6 | Residential | 11 | 11 · 601–611 |
| 7 | Residential + housekeeping | 11 | 10 · 701–710 |
| **Total** | **7 floors** | **66 door slots** | **65 suites** |

Each residential floor has five north doors, five south doors and one east-end
door. Floor 7's east-end door is the housekeeping room, which is what makes the
requested total exactly 65 while keeping the eleven-slot floor plan identical
on every floor. The check script prints this table and fails if any number
drifts.

### Lobby

The lobby grew from 18 × 16 m to 32 × 24 m and now contains:

- A 4.8 m glazed main entrance with swinging leaves and a canopy sign.
- A seven-and-a-half metre reception desk with three agent stations, monitors,
  card terminals, a bell, a 24-slot key cubby wall and the hotel crest.
- A separate concierge desk with a globe, luggage scale and concierge NPC.
- A three-car brass elevator bank with an illuminated floor indicator, call
  plate, animated centre doors and a "Floors 2–7 · Residential" header.
- Two furnished lounges (fireside and window), a café counter with espresso and
  pastry case, a business nook, limestone columns, two chandeliers, eight wall
  sconces, framed art, palms, a compass-rose floor inlay, luggage cart and a
  grandfather clock.
- Directional signage for elevators, reception, concierge, restrooms, the
  business centre, The Copper Room restaurant and the Fitness & Spa.
- Three NPCs (concierge, front desk, bellhop) with proximity dialogue.
- Eight sittable seats registered with the existing seat system.

The walkable volume, desk/seat/column collision and the entrance/elevator
corridors were rebuilt for the larger footprint.

### Physical floor navigation

1. Enter through the main street doors (keycard terminal at the entrance).
2. Walk across the lobby to the brass elevator bank.
3. The centre car opens as you approach; selecting a floor opens the existing
   elevator panel and plays the existing ride animation.
4. You arrive at the selected floor's elevator lobby, facing the corridor.
5. Walk the corridor; suite doors carry illuminated plaques, keycard readers
   and a floor directory beside the lift.
6. Your own suite door opens with your keycard. Entering it loads your saved
   room (`location: 'room'`).

The corridor also gained an elevator-lobby bench and rug, console tables with
lamps between doors, framed art on both sides, an end window with a reading
bench, and an ice/vending alcove. This is still walking, not a teleport menu:
the elevator is the only vertical connector and the doors are physical.

### Personal rooms and permissions

- Registration now allocates a **unique** suite from the 65-room hotel. Suite
  402 is handed to the first account as before; every later account receives
  the next free suite in hotel order, then a `PH1` overflow code if all 65 are
  owned. Previously every account received Suite 402.
- The Node server, the Cloudflare Worker and the edge-account provisioning path
  all use the same allocator.
- `room` is the owner's editable suite. `resident_room` is a visitor view: the
  App refuses to enter edit mode there and shows "Only the owner can decorate
  and edit this room."
- Guest accounts continue to save their local guest room on the device and are
  never allocated a hotel suite, so guest rooms cannot be visited.
- The closet, bathroom mirror, wardrobe and saved-outfit flow are unchanged.

### Doorbell system

The demo "ring a resident" shortcut was removed from the lobby terminal. Room
access is now one of:

1. The owner's keycard for their own suite.
2. A doorbell the owner accepts from inside the suite.

Protocol (`{ t: 'hotel', ... }` over the existing city socket, implemented in
both `server/realtime.mjs` and `src/cloudflare/realtime.ts`):

| Step | Message | Rule |
| --- | --- | --- |
| Visitor rings | `action: 'ring', roomNumber` | Suite must exist and belong to an account |
| Gateway checks | — | Owner must be online **and** their live location must be `room` |
| Owner notified | `action: 'ring'` | Includes visitor id, handle and display name |
| Owner answers | `action: 'respond', requestId, accept` | Only the suite owner can answer |
| Accept | `action: 'granted'` to visitor | Carries a read-only suite snapshot (name, number, floor, avatar, items, surfaces, mood) |
| Decline | `action: 'declined'` | Door stays locked |
| Timeout | `action: 'expired'` after 45 s | No request can summon an owner who left |
| Cancel | `action: 'cancel'` | Visitor can withdraw while waiting |

One pending request per visitor; guest accounts are refused. The owner dialog
(`HotelDoorbellModal`) accepts with Enter and declines with Escape, and tells
the owner exactly what visitor access means. The visitor gets a "Ringing Suite
…" toast with a cancel button. On a grant the visitor is placed in the owner's
suite as `resident_room` with walk-only controls.

## Part B — TheCity International Airport

`src/game/airportBuilder.ts` was rebuilt as a 112 × 76 m terminal (from
50 × 30 m) with four connected passenger spaces:

| Space | Contents |
| --- | --- |
| Departures Hall (Terminal 1) | 3 check-in islands × 5 counters, baggage belts, 4 self-service kiosks, 2 FIDS boards, 9-seat waiting rows, Skyline Café, travel retail, restrooms |
| Security | 6 screening lanes (5 standard + priority), arches, X-ray conveyors, queue stanchions, signage |
| Concourse A | Gates A1–A6 with podiums, seating runs and jet bridges; Horizon Lounge; restrooms |
| Concourse B | Gates B1–B6 with podiums, seating runs and jet bridges; Sky Club; restrooms |
| Arrivals Hall (Terminal 2) | 3 baggage carousels, customs lane, car-rental desks, meeting point, taxi/shuttle/rail desks, seating |
| Airside common | Duty-free/market/tech islands, two travelators, glazed north pier, apron with two aircraft |

The building shell has a glazed south entrance with animated doors, high
clerestory glazing, structural ribs, skylight coves and columns. The terminal is
significantly larger than any other walkable interior.

Everything static is merged into one mesh per material (≈12 draw calls for the
whole building), while the entrance doors, luggage belt and NPCs stay separate.
Signage uses runtime canvas textures; no binary assets were added.

Travel remains honest: check-in and gate desks open the existing departure
dialog, which exits the city/platform. There is no simulated flight or fake
destination list. The layout module (`shared/airport-layout.mjs`) is ready for a
future flight/session integration.

The clothing store remains a separate destination on its own city block. It is
not inside the airport and no airport counter opens it.

## Verification

| Check | Result |
| --- | --- |
| `npm run lint` (`tsc --noEmit`) | pass |
| `npm test` | 133 pass, 0 fail |
| `npm run check:city` | pass |
| `npm run check:hotel` | pass — prints 7 floors / 65 suites / 12 gates |
| `npm run build` | pass |
| Room count | **65** suites across floors 2–7; 11 door slots per floor; floor 7 end = housekeeping |

New automated coverage:

- `server/test/hotel-airport-layout.test.mjs` — 7 floors, 65 unique rooms,
  allocation order, doorbell authorisation rules (offline / not-in-room /
  own-room / guest refused), terminal capacity.
- `server/test/api.test.mjs` — two new accounts receive different, valid suites, plus
  a live two-account socket test: ring → owner notified → accept → visitor gets the
  suite snapshot; decline; and "owner left the room" refusal.
- `scripts/check-hotel-airport.mjs` — CI gate wired as `npm run check:hotel`.

### Limitations

- Android/desktop frame rate was not measured on physical hardware. The merged
  geometry is designed to keep draw calls low, but a real-device FPS pass is
  still outstanding.
- The doorbell flow is exercised end-to-end over two real sockets against the Node
  gateway. The Cloudflare Durable Object implementation mirrors it and compiles, but
  no live two-account accept was run against the deployed Worker.
- The app was loaded in the Cloud browser and the scene built with no console
  errors; the interiors themselves were not visually inspected or walked through
  in this pass. Build, typecheck, socket integration and the room/gate
  invariants are the verified gates.
