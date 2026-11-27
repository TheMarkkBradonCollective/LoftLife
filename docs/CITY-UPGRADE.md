# Main City environment upgrade

This document describes the city environment that replaced the placeholder
blocks around LoftLife Plaza, what is explorable, and how it was checked.

## What changed

- **Six new public destinations** now occupy their own downtown blocks and are
  authored as real buildings with interiors, not decorative shells. Together with
  the LoftLife Threads clothing store and Central Park that makes eight
  walk-up destinations around the plaza.
- **Streets** keep the original ordered grid: A–Z lettered streets run diagonally,
  1st–26th+ numbered streets stay in numeric order, and blocks keep their varied
  dimensions. Roadway, curbs, crosswalks, parking bays and lane markings were
  reworked so intersections read as a connected city instead of separate tiles.
- **Architecture** uses merged geometry per material with pilasters, window
  bands, parapets, awnings, storefront glazing, entrance steps and canvas-drawn
  signage, so each block has its own massing while draw calls stay low.
- **Landscaping** adds street trees, planters, benches, lamps, bike racks and
  paved plazas along the venue frontages.

## Destinations

| Destination | Block (col,row) | Interior |
| --- | --- | --- |
| LoftLife Community Center | 11,13 | Stage, folding tables, notice board |
| Bean & Loft Café | 12,13 | Espresso bar, stools, terrace tables |
| LoftLife Cinema | 13,14 | Box office, arcade cabinet, raked seats, screen |
| Public Library | 11,15 | Shelving, reading tables, public computers |
| Market Hall | 12,15 | Produce aisles, crates, checkout |
| The Med Deck (hospital) | 14,15 | Reception, waiting seats, treatment beds |
| Central Park | 11,14 | Paths, lawns, seating (retained) |
| LoftLife Threads (clothing) | 13,15 | Separate store location: racks, fitting rooms, checkout, stylist |

The hotel, airport, transit and plaza blocks keep their coordinates, and the
city map still lists every landmark in the same place.

## How you get in and interact

- Every venue has a storefront opening on its street frontage. Walk through it to
  enter; the roof, ceiling, front wall and awning of the venue you are inside are
  hidden (a cutaway) so the chase camera can see the room.
- Seats, counters and kiosks are interaction points. The Market Hall counter
  opens the furniture catalogue; the rest raise an inspect prompt.
- **Clothing is its own city destination, not an airport kiosk.** LoftLife
  Threads has a dedicated storefront on N St and its own interior location; the
  checkout opens the existing `ShopModal` clothing tab, so purchases land in the
  same wardrobe/inventory as before.
- The city map (`Open city map`) gained a **Public destinations** directory. Its
  buttons fast-travel the player to the street in front of the venue, facing the
  doors.

## Performance notes

- Each venue is merged into a handful of meshes by material; interiors, props and
  signage are part of those merges rather than individual objects.
- Cutaway groups only toggle `visible`, so hiding a roof costs nothing per frame.
- Interior plaster, furniture and floor materials carry a small emissive lift so
  rooms stay legible without adding per-venue lights (no extra shadow casters).
- Venue shells are deliberately **not** camera occluders: the chase camera would
  otherwise snap into a facade whenever a player stood at a door.

## Verification

Ran in this change:

- `npm run lint` (tsc) — pass.
- `npm run build` (vite) — pass.
- `npm test` — 124/124 pass.
- `npm run check:city` — new layout-invariant check (venue on its own venue block,
  shell inside the block, interior inside the shell, doors on the facade, arrival
  point on the street side, plausible heights/ceiling, hotel/airport/plaza blocks
  intact, street counts and ordering unchanged).
- In-browser (cloud Chromium preview): the city map lists every public destination,
  fast travel lands on the correct street (HUD reads e.g. `15th St near N St`),
  the storefront/sign/awning/tree frontage renders, walking through the opening
  enters the shop and the cutaway reveals the checkout counter, racks and shelving.

Not verified here: sustained frame-rate on a physical Android device and desktop
GPU (the cloud preview has no reliable frame timing), and a full walk-through of
every interior door-to-door. The layout script and unit tests cover geometry and
server behaviour, not rendering performance.
