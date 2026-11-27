# Player World Building

LoftLife's player worlds now use a city-scale layout layer on top of the existing
world, membership and realtime system. The hotel-suite furniture editor is
untouched; this is an additive foundation for player-created cities.

## 1. Foundations

`shared/world-layout.mjs` owns the registered foundations:

| Foundation | Default | Contents |
| --- | --- | --- |
| `TG-MapDefault` | **Yes** | 64 × 64 grass map plus the generated street/road grid. No houses, parks, businesses or filled neighbourhoods. |
| `TG-MapRiverside` | No | Open road grid with a river along the west edge. Empty lots only. |
| `TG-MapHarbor` | No | Coastal road grid with open water on the east edge. Empty lots only. |

The street network is generated from the foundation definition and is never
stored as player objects. A new world therefore starts with `layout.objects = []`,
and tests assert that no foundation declares prebuilt structures.

Custom map-file uploads are intentionally not implemented. World layouts are
selected at creation (`POST /api/worlds` with `foundation`); the default is
`TG-MapDefault`.

## 2. Building tools

The studio (`src/components/WorldStudio.tsx`) is an isometric map editor. Every
click sends one operation to the server and adopts the returned authoritative
layout.

| Category | Tools |
| --- | --- |
| Roads & paths | road, street, sidewalk, pedestrian path |
| Buildings | house, apartment, commercial building, business |
| Parks | park |
| Decorations | tree, bench, fountain, street lamp, statue, flower bed |
| Landscaping | lawn, garden, plaza paving, pond water |

Every tool accepts only its approved colour palette and materials (brick, wood,
stucco, concrete, glass, stone, asphalt, gravel, etc.). Placement supports
rotation, moving, removing and recolouring. Structures and props cannot overlap,
must fit inside the 64 × 64 map, and the layout cap is 600 objects.

World-specific settings (terrain, terrain colour, climate, time of day) are
validated server-side and saved with the layout.

## 3. Roles and permissions

| Action | Owner | Co-owner | Builder | Member | Visitor |
| --- | --- | --- | --- | --- | --- |
| Enter and play a Live world | yes | yes | yes | yes | per access |
| Open the city studio | yes | yes | yes | no | no |
| Change world settings | yes | yes | no | no | no |
| Change world status (Live / Available / Offline) | yes | yes | no | no | no |
| Place roads / streets / sidewalks / paths | yes | yes | no | no | no |
| Create and approve build areas | yes | yes | no | no | no |
| Build inside an approved build area | yes (anywhere) | yes (anywhere) | own approved plot only | no | no |
| Publish a new layout | yes | no | no | no | no |
| Undo / redo | yes | yes | yes | no | no |
| Restore a saved revision | yes | yes | no | no | no |

Role assignment stays in the existing Worlds panel and API. Only the owner can
appoint a co-owner; owners and co-owners can assign builders and members.

### Build-area workflow

1. The owner or co-owner draws/creates a build area (minimum 3 × 3 tiles, areas
   cannot overlap, at most 24 per world).
2. A builder selects an available area and submits a construction request.
3. The owner or co-owner approves or denies it.
4. Approved areas are assigned to that builder. The server rejects any placement
   whose footprint leaves the approved area (`plot_required` /
   `plot_not_approved`), even if the client is modified.
5. The owner can release an area for another builder.

## 4. Live, Available, Build Mode

The established state machine is preserved:

- **Live** — players can enter and explore; structural edits are disabled.
- **Available** — the city is prepared and enterable by its access rules, but not
  in Build Mode; structural edits are disabled.
- **Offline** — the owner or co-owner prepares Build Mode.
- **Build Mode** — requires the live player count to reach zero. Authorised
  builders collaborate in a separate editing session; visitors cannot enter.
- **Build pending** — a queued Build Mode request while players remain; it starts
  automatically when the last player leaves.
- **Maintenance** — closed.

Only the owner and co-owner can move a world between Live, Available and other
management states. A live world cannot be closed while players remain inside
(`players_present`), and going Live requires the owner/co-owner to be present in
the instance.

Publishing copies the draft layout into the published layout, records the
published revision and returns the city to **Available**. The owner/co-owner then
enters the city and sets it Live. Structural edits remain blocked outside Build
Mode, so a reopened city always shows the last published layout.

## 5. Collaboration, history and recovery

- Each operation is server-authoritative and increments `layout_version`.
- The studio polls every 2.5 s and adopts newer revisions, so two builders see
  each other's changes without a manual refresh.
- The realtime gateway also broadcasts `world_edit` with the new revision to
  everyone in the world instance.
- Undo and redo are persisted per world (`undo_json` / `redo_json`), not just in
  the browser.
- Every revision is written to `world_snapshots` with actor, action and detail,
  capped at 40 revisions per world.
- Owners and co-owners can restore any saved revision; restoration creates a new
  revision rather than rewriting history.

## 6. Official Main City

The official city is a separate record (`is_official = TRUE`) with no player
ownership semantics:

- `GET /api/official/main-city` requires an account with the `admin`/staff role.
- The workspace is created on first staff access and can be edited with the same
  studio once Build Mode is opened.
- Regular players receive `403` from both the studio and world-entry APIs, even
  with the world id.
- The official city cannot be deleted by players.
- Staff do not gain implicit build rights in player-owned worlds.

## 7. API

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/api/worlds/foundations` | Registry (default `TG-MapDefault`) |
| POST | `/api/worlds` | Create with optional `foundation` |
| GET | `/api/worlds/:id/build` | Studio state, plots, history |
| POST | `/api/worlds/:id/build/op` | One structural/plot/settings operation |
| POST | `/api/worlds/:id/build/undo` / `redo` | Persisted history |
| POST | `/api/worlds/:id/build/restore` | Restore a revision |
| POST | `/api/worlds/:id/build/publish` | Publish draft (owner only) |
| POST | `/api/worlds/:id/status` | Live / Available / Offline |
| POST | `/api/worlds/:id/build-mode` | Open or queue Build Mode |
| GET | `/api/official/main-city` | Staff-only workspace |

Both the Node authority (`server/worldBuild.mjs`) and the Cloudflare edge
(`src/cloudflare/worldBuild.ts`) import the same shared rules. Edge writes are
optimistic on `layout_version` and return `revision_conflict` instead of
overwriting another builder's revision.

## 8. Persistence

Node SQLite creates the columns and tables in `server/db.mjs`; Neon production
adds them through `migrations/0008_world_building.sql` and the Worker's
idempotent schema statements.

New storage:

- `worlds.foundation`, `layout_json`, `published_layout_json`, `settings_json`,
  `layout_version`, `published_version`, `undo_json`, `redo_json`, `is_official`
- `world_plots` / `ll_world_plots`
- `world_snapshots` / `ll_world_snapshots`

## 9. Verification

- `server/test/world-build.test.mjs` covers the registry/default emptiness,
  every role boundary, plot request/approval, builder containment, streets,
  approved colours/materials, two builders sharing revisions, undo/redo,
  revision restoration, publish ownership, live-world shutdown protection and
  the staff-only official city.
- `scripts/check-world-layout.mjs` (`npm run check:worlds`) is the fast shared
  engine guard used in CI.
- `npm test`, `npm run lint`, `npm run build` and the Wrangler dry-run run in CI.

## 10. Current limits

- The studio is a 2D isometric city planner. It is fully interactive, but the
  live 3D player-world scene still uses the existing world room renderer; the
  city layout is not yet extruded into 3D meshes inside the walking scene.
- Foundation switching after creation, terrain auto-tiling, traffic simulation
  in player cities and custom map uploads are not included.
- Realtime layout broadcast is available to clients in the world instance; the
  studio's polling fallback is what guarantees sync for builders who have the
  studio open outside the instance.
