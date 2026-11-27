# Multi-floor building

This document describes the storey system added after the 344-item catalog expansion, what is
actually implemented, how it persists, and what is still missing.

## Model

A property is a stack of up to **4 storeys** (ground + up to three more), each **3.45 m** apart.
The rules live in `shared/building.mjs` and are imported by the editor, the API, the Cloudflare
Worker and the tests:

- `FLOOR_HEIGHT = 3.45`, `MAX_LEVELS = 4`.
- Every placed item may carry `level` (0 = ground). Missing `level` means 0, so every room saved
  before this change loads unchanged.
- `surfaces.floors` is a per-storey list of `{ floor, wall }`. `surfaces.floor` / `surfaces.wall`
  always mirror the ground storey, so older clients and existing code keep working.
- The top storey of a multi-storey property is built as a rooftop: slab, parapet and railings
  instead of walls and ceiling.

## Building

In **Edit Room** the build panel has a Storey row: `Ground`, `Level 2`, `Roof 3`, `Roof 4`, plus
`+` / `−` to grow or shrink the stack. Selecting a storey:

- places, moves, rotates, duplicates and deletes items on that storey only;
- applies the floor finish and wall paint to that storey only (Surfaces tab);
- raycasts against that storey's floor and wall planes, so wall art hangs on the right walls;
- renders that storey plus the ones beneath it, hiding the storeys above so they never occlude the
  camera;
- adds real geometry: slab, perimeter walls with a glazed band, mullions, ceiling and, on the top
  level, a parapet/railing rooftop. Removing a storey deletes the items on it (undo restores the
  whole build).

Grid placement is storey-local: two items can sit on the same tile on different floors.

## Walking between floors

Storeys are physically stacked, and the avatar is elevated to the active storey. Walking onto a
`stairs_*` piece climbs one storey (with a hint); standing on the tile above the stair on an upper
storey descends. Stair pieces are the catalog's `stairs_straight`, `stairs_spiral`, `stairs_curved`,
`stairs_floating`, `stairs_modular` and `escalator_run` models.

Collision and pathfinding use only the storey the player is on, so furniture upstairs does not block
the ground floor and vice versa.

## Persistence

`PUT /api/suite` and `PUT /api/worlds/:id/state` accept and return:

```json
{
  "items": [{ "uid": "a", "catalogId": "plush_sofa", "gx": 2, "gz": 3, "rot": 0,
              "color": "#e6dfd3", "level": 1 }],
  "surfaces": { "floor": "terrazzo", "wall": "sage_plaster",
                "floors": [{ "floor": "terrazzo", "wall": "sage_plaster" },
                           { "floor": "concrete", "wall": "charcoal_loft" }] },
  "mood": "night"
}
```

Levels are validated server-side (`0..3`, integers; floor list `1..4` entries, known styles) and the
Cloudflare Worker enforces the same limits, so a multi-storey build survives page reloads, device
switches and a suite/world round-trip. No schema migration is needed because floors live inside the
existing `surfaces_json` and `items_json` columns; the existing rows stay valid.

## Wall joining

`joinWallRun()` in `shared/building.mjs` aligns a newly placed structural piece to the neighbour it
touches: it adopts that piece's rotation and puts its edge exactly on the neighbour's edge, on the
same storey. This is applied when placing `structure`-category floor pieces, removing hairline gaps
between wall runs. Pieces that would be pushed outside the 14×14 m grid are left where the player
put them. Curved/angled pieces join at their bounding boxes, not with mitred geometry — see the
limitations.

## Verification

- `shared/building.mjs` unit tests + API round-trip: `server/test/multifloor.test.mjs` and the
  `multi-storey suites persist levels and per-storey finishes` case in `server/test/api.test.mjs`.
- `npm run lint`, `npm run build`, `npm test`.

## Limitations

- Storeys are room-sized (14×14 m) and share one footprint; there are no per-storey room outlines,
  holes/atriums or split-level mezzanines. Mezzanine and balcony pieces are placeable models.
- Stairs teleport the avatar one storey while keeping its ground position; there is no animated
  stair traversal or slope collision.
- Elevators and escalators are static models, not moving transport.
- Remote players are rendered at ground elevation: presence does not yet broadcast a storey.
- Curved and angled walls connect at bounding boxes; no mitred/trimmed geometry.
- Roof access is through the top storey only; there is no exterior ladder/scaffold.
