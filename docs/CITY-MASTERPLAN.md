# TheCity master plan

TheCity is the public world around LoftLife Plaza. This document is the design
brief, the geography, and the validation record for the 2026 world rebuild.

The grid itself is unchanged on purpose: A–Z diagonal streets still cross
1st–30th Streets at the same coordinates, so existing saves, collision
polygons, multiplayer positions, taxi paths and the hotel/airport geometry all
keep working. What changed is the **plan on top of the grid** — the hierarchy of
the streets, which district owns each block, and where every destination sits.

---

## 1. Design approach

The city was planned as three concentric bands around the civic core, crossed by
an east–west civic axis and a north–south nightlife/retail axis:

- **Centre** — LoftLife Plaza, the civic institutions and the M Street
  boulevard. Everything a new player needs is within a two-minute walk.
- **Inner ring** — Downtown towers, Arts & Culture, Entertainment, Retail & Food
  and the Medical campus. Dense, walkable, mixed-use, with landmarks on every
  major corner.
- **Outer ring** — three residential neighbourhoods, the industrial service
  yards in the south-west, luxury waterfront towers on the east edge, and the
  airport/transport campus in the south-east.

Transitions are deliberate: towers step down to 4–6 storey rowhouses as you
leave downtown; retail spills into a pedestrian market promenade; the southern
residential edge is buffered from industry by South Gardens and a school block;
the waterfront is reached through the luxury esplanade rather than a back alley.

The city is deliberately larger than the current destination list. Several
blocks are plain buildings or reserved open space so future destinations can be
added without another geometry rewrite.

## 2. Geography

The playable grid is 25 × 29 blocks (725 blocks) inside a footprint of roughly
**1.05 km × 1.10 km**. Blocks keep varied dimensions (32–45 m on the diagonal,
29–49 m on the numbered axis) rather than a uniform tile.

| District | Blocks | Grid bounds (col × row) | Character |
| --- | ---: | --- | --- |
| Civic Core | 18 | 10–13 × 12–16 | Plaza, library, community centre, cafés, public lawns |
| Arts & Culture | 30 | 9–13 × 6–11 | Cinema, event hall, galleries, sculpture plaza |
| Entertainment District | 30 | 14–18 × 10–15 | Nightclub, bar, toke lounge, neon frontages |
| Retail & Food District | 30 | 13–18 × 16–20 | Market hall, restaurants, standalone clothing store |
| Medical District | 18 | 19–21 × 15–20 | Med Deck hospital, clinics, recovery gardens, parking |
| Downtown Core | 84 | 8–20 × 8–22 | Glass towers, offices, transit spine, M Street |
| Luxury Waterfront | 86 | 21–25 × 0–22 | Residential towers, river esplanade, marina walk |
| North Residential | 100 | 7–20 × 0–7 | Rowhouses, walk-ups, neighbourhood parks |
| West Residential | 138 | 0–7 × 0–18 | Townhouses, garden apartments, corner shops |
| South Residential | 87 | 7–20 × 21–29 | Family blocks, schools, community gardens |
| Industrial & Service | 70 | 0–6 × 19–29 | Warehouses, depots, container yards |
| Airport & Transport | 24 | 21–25 × 23–29 | Terminal, apron, long-stay parking, Grand Hotel |
| Parks & Recreation | 10 | distributed | Central Park, West Commons, pocket parks |

Landmarks anchor the mental map:

- **LoftLife Tower and Plaza** at the centre of the grid.
- **M Street** as the eight-lane spine running north-west to south-east.
- **Central Park** directly west of the plaza, with a lake, gazebo, playground
  and paths.
- **West Commons** as a two-block superpark in the western neighbourhoods.
- **The river** along the east edge beyond Z Street, with a planted esplanade.
- **TheCity International Airport** as a three-block campus in the south-east,
  with the Grand Hotel on its approach road.

## 3. Street hierarchy

Street width, lane count, markings and furniture are derived from the street's
role, not applied uniformly.

| Class | Curb-to-curb | Lanes | Parking | Notes |
| --- | ---: | ---: | --- | --- |
| Boulevard (M St) | 28.8 m | 8 (4 each way) | No | 3.2 m planted centre median, bike lanes, dedicated bus lane, signalised every block |
| Avenue (A, E, I, Q, U, Z / 1st, 5th, 10th, 15th, 20th, 25th, 30th) | 14.0 m | 4 | No | Turning pockets at signals, wider crossings |
| Street (most lettered/numbered) | 11.2 m | 2 | Both sides | Parallel parking bays, bike racks, shelters |
| Residential street (every fourth numbered street) | 9.2 m | 2 | Both sides | Low-speed neighbourhood profile, tree lawns |

Supporting infrastructure:

- **Sidewalks** are 2.8–6.4 m depending on district, widened along M Street and
  the 15th Street civic axis, with curbs and corner ramps.
- **Crosswalks** at 232 signalised intersections (all downtown blocks, the
  civic axis and every avenue meeting).
- **Alleys and service access** are expressed as loading bays and yard strips on
  industrial and retail blocks rather than extra drivable grid lines.
- **Pedestrian streets** are the plaza, the market promenade (13,16), the four
  riverfront esplanade blocks (24,10–13) and the civic forecourts; these are
  raised 0.17 m and closed to traffic.
- **Parking** is surface lot or structure on six dedicated blocks, plus curbside
  bays on street-class roads.

## 4. Destination register

Every existing destination is placed in the district that gives it context.
All 11 walk-up venues have interiors, a signed entrance and a sidewalk arrival
point on the correct side of the shell.

| Destination | Block | District | Access |
| --- | --- | --- | --- |
| LoftLife Plaza / Tower | 12,14 | Civic Core | Open plaza, all four sides |
| Grand Hotel | 22,27 | Airport & Transport | North forecourt off the airport approach |
| TheCity International Airport | 24,27 · 23,28 · 24,28 | Airport & Transport | Terminal doors face the north drop-off |
| LoftLife Threads (clothing) | 13,18 | Retail & Food | South sidewalk, standalone store |
| Community Center | 11,13 | Civic Core | East door to the plaza |
| Bean & Loft Café | 12,13 | Civic Core | East door, terrace on the plaza |
| Public Library | 11,15 | Civic Core | East door to the civic lawn |
| LoftLife Cinema | 10,9 | Arts & Culture | East door to the arts plaza |
| The Loft Hall (events) | 11,9 | Arts & Culture | East door to the arts plaza |
| Neon Loft (nightclub) | 15,11 | Entertainment | South door to the nightlife strip |
| The Brass Tap (bar) | 16,12 | Entertainment | South door |
| Cloud Nine (toke lounge) | 14,12 | Entertainment | South door |
| Market Hall | 14,17 | Retail & Food | North door to the market promenade |
| The Copper Fork (restaurant) | 16,18 | Retail & Food | North door |
| The Med Deck (hospital) | 19,17 | Medical | North door, ambulance bay and parking |
| Central Park | 11,14 | Parks & Recreation | Paths from the plaza and 15th Street |
| West Commons | 5–6, 9–10 | Parks & Recreation | Paths from L/M Streets |
| Riverfront Esplanade | 24,10–13 | Luxury Waterfront | Promenade and railing at the river |
| Central Station | Plaza south-west | Civic Core | Rail hub, bus interchange, taxi rank |

Residential buildings fill the three residential districts, and every remaining
block is a buildable/expandable city block. Player-created worlds are separate
from TheCity and are unaffected.

## 5. Architecture and public realm

- **Massing** is per block: podium, optional tower, upper setback, parapet,
  rooftop plant, water tanks and, on some blocks, a mechanical crown. Large
  downtown/retail blocks split into two buildings with a service gap.
- **Facades** use six authored materials with window bands, pilasters,
  storefront glazing, awnings, entrance steps and canvas-generated signage.
  Cornices, balconies, green roofs and loading docks break up the skyline.
- **Landscaping** adds instanced street trees (density per district), planted
  median, sidewalk planters, benches, bins, bike racks, lamps with district
  spacing, lawns, ponds, gazebos, playgrounds, fountains, public art, string
  lights on the promenades and a waterfront railing.
- **Scale** is metric: 3.0 m storeys, 1.8 m car width, 4.2 m car length,
  2.4–3.0 m sidewalks on residential blocks, 6.4 m maximum on the boulevard.
  Buildings sit on their block surface at 0.14–0.17 m, never floating or buried.

## 6. Transit

The server owns the network; the client draws it. Coordinates are generated
from the same layout constants, so stops always sit on a road centreline or the
16th Street viaduct.

- **15th Street Bus** — L, M, N, P, R, S Street stops on the civic axis.
- **M Street Boulevard Bus** — six stops in the kerbside bus lane.
- **Downtown Loop** — M/O × 12th/18th rectangle around the core.
- **Airport Express** — Central Station → O Street → 20th Street → W Street →
  28th Street → terminal kerb.
- **Green Line** — elevated 16th Street express, five stations.
- **Blue Line** — elevated downtown crosstown, five stations.
- **Central Station** hub at the south-west corner of the plaza, clear of the
  fountain and stage.
- **Taxis** serve 15 destinations, including all 11 venues, the hotel, airport,
  clothing store and plaza; arrivals land outside the venue shell.

## 7. Technical implementation

- `src/game/cityLayout.ts` is the single source of truth: street lines, widths,
  classes, district assignment, block kinds, landmark anchors, signals, bus
  stops, waterfront and bounds.
- `src/game/venues.ts` derives each shell, door, interior and arrival from its
  block, so a layout change cannot leave a venue floating or its door inside a
  wall.
- `src/game/worldBuilder.ts` builds merged geometry per material, instanced
  trees/lamps/benches/planters/cars/containers/tanks, and reuses shared
  materials on mobile-quality settings.
- Collision and walkability use the same block data (`sidewalk`, `setback`,
  `walkHeight`), so visuals and physics cannot diverge.
- `src/components/CityMapModal.tsx` renders districts, street classes, the river
  and landmark addresses from the same layout.
- `server/transit.mjs` carries the generated road grid, six lines, hub and taxi
  destinations; `server/test/api.test.mjs` validates taxi arrivals against the
  server-declared destination rather than hard-coded coordinates.
- `scripts/check-city-venues.mjs` (`npm run check:city`) is the master-plan
  gate: street hierarchy, district coverage, venue fit, doors and arrivals,
  overlaps, landmark districts, river edge and transit geometry.

## 8. Validation record

Run on the final geometry:

| Check | Command | Result |
| --- | --- | --- |
| Master plan | `npm run check:city` | **Pass** — 11 destinations, 13 districts, 725 blocks |
| Types | `npm run lint` | **Pass** (exit 0) |
| Production build | `npm run build` | **Pass** (only the pre-existing chunk-size warning) |
| Server + multiplayer suite | `npm test` | **Pass** — 155/155 |

The master-plan gate asserts, among other things:

- every venue block has a real shell (≥ 4 m each side after sidewalks/setback)
  and its interior is not inverted;
- every door sits on the frontage and every arrival point is outside the shell
  but within the block's sidewalk;
- no venue, park, plaza, promenade or parking block overlaps another;
- every landmark is in its intended district;
- the river begins outside the eastern street line and no block extends into
  it;
- every transit stop lies on a road centreline, the metro line or a station
  hub, and taxi arrivals are not inside venue shells.

**Manual inspection** — the city was rendered in a desktop browser through the
Vite dev server and inspected with the isometric camera and the in-game map.
Checked directly: the Grand Hotel forecourt and airport-edge spawn, the civic
core around the community centre, the M Street / 15th Street intersection, the
Nightclub frontage in the Entertainment District, and the full city map
(30 numbered streets, A–Z diagonals, river, district colours, landmark markers).
Grounding, street widths, sidewalk/furniture placement, venue signage and the
map's landmark positions were reviewed; a rendering probe reported 231 draw
calls and about 732k triangles in the isometric city view. The remaining
districts, interiors and mobile/software-GL rendering were **not** visually
reviewed in this pass, and this was not a frame-rate benchmark on physical
devices.

## 9. Expansion

Reserved capacity: plain blocks in every district, the two undeveloped blocks
between the retail district and the Medical campus, the industrial yard strip,
and the empty riverfront south of the esplanade. Adding a destination means
adding one entry to `VENUE_BLOCKS` and one spec in `venues.ts`; the layout,
collision, map and `check:city` all pick it up automatically.
