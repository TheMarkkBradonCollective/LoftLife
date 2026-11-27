# Kenney 3D asset library

LoftLife's furniture, architecture, city, nature, vehicle, food, arcade and character-prop
catalogs now include the relevant parts of Kenney's CC0 3D collection. This document records what
was imported, what was excluded and why, how the assets are stored and loaded, how existing
procedural pieces were replaced, and exactly what was verified.

Source: <https://github.com/shorepine/kenney> (mirror of <https://kenney.nl>)
License: **CC0 1.0 Universal (public domain)** — see
[`public/models/kenney/LICENSE.txt`](../public/models/kenney/LICENSE.txt).

---

## 1. What shipped

| | Count |
| --- | --- |
| GLB models in the source `3d/` tree | **4,812 across 49 kits** |
| Kits inspected and classified | **49** |
| Kits imported | **21** |
| **Models imported into LoftLife** | **1,676** |
| Kits excluded as unsuitable for the world | **28** |
| Models excluded with their kits | **3,131** |
| Individual models excluded from imported kits | **5** (4 weapon/gambling, 1 unrenderable) |
| Imported GLB payload | ~52 MB including per-kit textures |
| Preview PNGs rendered from those GLBs | **1,676** at 512×512, transparent |
| Existing catalog items given a Kenney visual | **49** |
| Additive library rows in the shop/build catalog | **1,627** |
| Total placeable catalog after integration | **1,971** (344 existing + 1,627 imported, with 49 existing items re-skinned) |
| Classified character/accessibility records | **51** (44 Blocky/Mini, 7 from other kits) |

Every record is generated into [`shared/catalog/kenney-library.mjs`](../shared/catalog/kenney-library.mjs)
by [`scripts/import-kenney-library.mjs`](../scripts/import-kenney-library.mjs). The generated header,
`KENNEY_SOURCE`, each record's `asset.sourceUrl`/`license`, and `shared/catalog/kenney-summary.json`
are the provenance record. The summary is the machine-readable audit of kits, exclusions and counts.

---

## 2. Kit classification

### Imported (21 kits)

| Style group | Kits | Models | Use |
| --- | --- | --- | --- |
| **LoftLife Home** | `furniture` | 140 | Seating, tables, beds, kitchen, bath, lighting, rugs, plants, office |
| **LoftLife City** | `building`, `modular-buildings`, `city-commercial`, `city-suburban`, `city-industrial`, `city-roads`, `car`, `train`, `watercraft` | 564 | Walls, doors, windows, storefronts, homes, towers, roads, street furniture, cars, rail, boats |
| **LoftLife Nature** | `nature`, `mini-forest`, `mini-skate` | 369 | Trees, plants, rocks, bridges, fences, paths, skate-park pieces |
| **LoftLife Hospitality** | `food`, `mini-market`, `mini-arcade`, `holiday`, `factory`, `survival` | 560 | Food props, retail shelving, arcade cabinets, seasonal decor, industrial fittings |
| **LoftLife Characters** | `blocky-characters`, `mini-characters` | 44 | Static character props and accessibility pieces |

### Excluded (28 kits, 3,131 models)

Weapons, gambling and incompatible art directions are excluded before a model reaches the catalog:

| Reason | Kits |
| --- | --- |
| Weapons (policy) | `weapon`, `blaster`, `mini-arena` |
| Gambling (policy) | `gambling-machine` and `prize-wheel` inside `mini-arcade` (the other 18 arcade models are kept) |
| Fantasy / medieval / sci-fi | `castle`, `fantasy-town`, `retro-fantasy`, `pirate`, `modular-dungeon`, `modular-cave`, `mini-dungeon`, `graveyard`, `space`, `space-station`, `modular-space`, `tower-defense`, `tower-defense-classic` |
| Toy / board-game scale | `toy-car`, `coaster`, `minigolf`, `racing`, `marble`, `hexagon`, `brick`, `cube-pets` |
| Abstract / prototype | `platformer`, `prototype` |
| Pixel-art style | `retro-urban` |
| Redundant | `road` (294 generic `tile000`–`tile293` tiles with no semantic identity; `city-roads` covers roads) |

The exclusion reasons are stored in `KENNEY_SUMMARY.excludedKits` and in the importer's
`EXCLUDED_KITS` table, with model counts.

### Individual model exclusions

| Model | Reason |
| --- | --- |
| `mini-forest/weapon-arrow`, `mini-forest/weapon-bow` | Weapons |
| `mini-arcade/gambling-machine`, `mini-arcade/prize-wheel` | Gambling |
| `city-roads/road-crossroad-barrier` | Collision-proxy geometry with no visible silhouette at any camera angle; cannot produce an honest preview |

The importer applies a token-boundary weapon/gambling filter to **every** file, so a future kit
cannot reintroduce those assets silently.

---

## 3. Catalog record

Each item has:

- `id` — stable, kit-prefixed (`kenney_<kit>_<slug>`), unique across the catalog;
- display `name`, `description`, `category`, `subcategory`;
- `layer` (`floor`/`rug`/`wall`), footprint `size` in metres, `wallHeight` for wall pieces;
- `colors`/`defaultColor` in LoftLife's palette, `price`, `currency`, `themes`, `styles`, `tags`;
- optional `sittable`/`seatOffset`/`seatApproach` for seating and beds, `interactive` for lamps,
  arcade cabinets and screens;
- `asset`:
  - `path` (`/models/kenney/<kit>/<file>.glb`), `r2Key`;
  - `preview` (`/catalog-previews/<id>.png`), `previewR2Key`;
  - `kit`, `styleGroup`, `originalName`, `scale`, raw and real-world `bounds`, `triangles`;
  - `materials`, `textures`, `tintRoles`, `license`, `source`, `sourceUrl`, `licenseUrl`.

Global constants: `CATALOG_CATEGORIES` gains **Buildings**, **Roads & Streets** and **Characters**,
plus the subcategories the imported records use. `KENNEY_STYLE_GROUPS` powers the art-style filter.

Prices are generated from category, footprint and triangle count, then served from
`KENNEY_PRICES` by the Node API and the Cloudflare Worker. The client never decides a price.

### Scale and orientation

Kenney kits use different diorama scales. The importer computes world bounds per model and applies
a documented per-category target: furniture and modular architecture stay at their authored metric
scale, buildings target 8–14 m, road modules 4 m, cars 4.4 m, watercraft 5 m, trees 4 m, food props
0.35 m, characters 1.7 m. The resulting footprint is stored per item; the runtime grounds the model
at Y=0 and centres its footprint. Models are **never stretched** — replacements are uniformly fitted
inside the existing item's footprint.

---

## 4. Preview pipeline and provenance

`scripts/render-kenney-previews.mjs`:

1. reads each catalog record and its GLB hash;
2. parses the GLB with the dependency-free reader in `shared/kenney/glb.mjs` (node hierarchy,
   world-space vertices, UVs, materials, image references);
3. decodes the kit's indexed-colour `colormap.png` with `shared/kenney/png.mjs`;
4. applies the **same** LoftLife material-role styling the runtime uses;
5. frames the real geometry in the product-shot camera and rasterises it with the existing
   deterministic CPU renderer (`scripts/lib/raster.mjs`, now with UV texture sampling and
   double-sided material support);
6. writes `public/catalog-previews/<id>.png` and records item → GLB hash → image hash in
   `shared/catalog/kenney-preview-manifest.json`;
7. validates alpha, centring, coverage and edge clearance, retrying a wider/planer angle before
   reporting a model as unusable.

```bash
npm run assets:kenney                 # render missing/stale previews (incremental)
npm run assets:kenney -- --force      # re-render all 1,676
npm run assets:kenney -- --kit=furniture --limit=10
npm run assets:check                  # validate procedural + Kenney manifests
npm run assets:gallery                # rebuild public/asset-gallery.html
```

`public/asset-gallery.html` is the inspectable gallery requested for review: every tile is that
model's actual preview, with search, kit/category/art-style filters, triangle counts, footprints and
a "replaces `<catalog id>`" marker for replacement models.

---

## 5. Runtime integration

`src/game/assets/kenneyRuntime.ts`:

- one shared `GLTFLoader`;
- one in-flight promise per model (no duplicate downloads);
- an LRU cap of **240** resident models;
- only the models a room actually contains are preloaded (`RoomViewport` maps `activeItems` to
  catalog records); the library itself never loads when a player opens a room;
- placed items that are still downloading are marked `assetPending` and rebuilt when the loader's
  subscription fires — no old placeholder is drawn while waiting;
- clones share geometry; materials are cloned and styled per instance;
- failures are logged and cached so a broken asset cannot spam the network.

`src/game/assets/kenneyStyle.ts` is the visual identity layer:

- untextured furniture materials are mapped by **role** (wood → natural oak, woodDark → smoked
  walnut, metal variants → charcoal/steel/brass/chrome, fabric → the selected LoftLife finish,
  plant → sage, glass → glass, lamp → warm emissive);
- textured city/nature/food kits keep their authored colormap and receive only a 12–22 % palette
  tint, preserving detail while bringing them into the same warm world;
- the selected catalog colour drives upholstery for seating/beds and wood/stone finishes for
  tables and bathrooms (`tintRoles`), so colour swatches really change the model;
- ghost placement uses the existing translucent green treatment.

The styling is shared by previews and the runtime, so a thumbnail cannot disagree with the placed
object.

### Editor and economy integration

- `src/game/catalog.ts` appends `KENNEY_CATALOG` and applies `KENNEY_REPLACEMENTS`.
- `buildFurnitureGroup` resolves an imported visual before the procedural switch; if it is not
  loaded yet it returns an empty pending group and requests it.
- Build panel: all imported items appear in their real categories; search covers descriptions, tags
  and kit names; new art-style filter; results render in pages of 72 with a **Show more** control so
  a 1,971-item catalog never mounts thousands of images on a phone.
- Market: server-driven list, paged cards, live 3D inspector, colour variants, preview from the
  actual GLB render.
- Placement, rotation, movement, collision, selection, saving/loading and multiplayer sync all
  continue to use `catalogId` + transform, so imported items need no protocol change.
- `server/economy.mjs`, `src/cloudflare/economy.ts` and `src/cloudflare/worlds.ts` accept the new
  ids at the shared prices.

---

## 6. Replacing existing procedural models

[`shared/catalog/kenney-replacements.mjs`](../shared/catalog/kenney-replacements.mjs) maps **49**
existing catalog ids to imported models. The existing id, price, footprint, layer, sitting and
interaction metadata are preserved, so inventories, saved rooms and multiplayer state are unchanged.

Examples: `plush_sofa` → `lounge-sofa`, `cozy_bed` → `bed-double`, `coffee_table` → `table-coffee`,
`bookshelf` → `bookcase-open`, `kitchen_sink` → `kitchen-sink`, `toilet_modern` → `toilet`,
`washer`/`dryer`, `restaurant_table`, `clinic/waiting` seating, `library_shelving`, `park_bench`,
`bush_shrub`, `patio_umbrella`.

The matching library row is withheld from the shop so the same asset is not sold twice.

**Deliberately not replaced** (their geometry is their behaviour and the behaviour is preserved):
`record_console` (spinning vinyl), `fireplace` (animated flames + light), `media_tv` (live canvas
screen), `monstera_plant` (swaying leaves), `neon_sign` (pulsing emissive), `dual_desk` (lit screens),
and venue equipment with no faithful Kenney equivalent (DJ booth, stage truss, bar back, hookah,
salon, medical, retail counters, custom signage).

---

## 7. Cloudflare R2 storage

The repository keeps catalog metadata, loader code and integration logic. Binary assets are laid out
locally exactly as they are in R2:

```
public/catalog-previews/<file>.png          → catalog/v1/catalog-previews/<file>.png
public/models/kenney/<kit>/<file>.glb       → catalog/v1/models/kenney/<kit>/<file>.glb
public/models/kenney/<kit>/Textures/*.png   → catalog/v1/models/kenney/<kit>/Textures/*.png
shared/catalog/*-manifest.json              → catalog/v1/manifest/*-manifest.json
```

### Exact upload commands

Credentials are read from the environment only and are never committed:

```bash
export CATALOG_R2_BUCKET="loftlife-assets"          # target bucket
export CLOUDFLARE_API_TOKEN="..."                    # R2 write access
export CLOUDFLARE_ACCOUNT_ID="..."                   # only if the token spans accounts

npm run assets:upload -- --dry-run                   # list count + first keys, upload nothing
npm run assets:upload                                # 3,036 objects: 1,676 GLB, 1,676 preview, textures, manifests
```

The script refuses to run without `CATALOG_R2_BUCKET` and `CLOUDFLARE_API_TOKEN`, prints every
failed key with its Wrangler error, and sets a non-zero exit status if any object fails. Re-running
it is safe: keys are immutable and content-addressed by path. `-- --limit=50` uploads a prefix first
for a smoke test.

### Public access and CORS

Enable public read access on the bucket (R2 → Settings → Public access: the `r2.dev` URL or a custom
domain). Because the GLB and texture requests come from the app origin, add a CORS policy allowing
`GET`/`HEAD`:

```json
[{"AllowedOrigins":["https://app.example.com"],"AllowedMethods":["GET","HEAD"],"AllowedHeaders":["*"],"MaxAgeSeconds":86400}]
```

### Production build

```bash
VITE_ASSET_BASE_URL="https://assets.example.com/catalog/v1" npm run build
```

`assetUrl()` (`src/game/assets/assetUrl.ts`) prefixes every relative catalog path with that base, and
`vite.config.ts` switches `publicDir` off for that build: `public/models/` and
`public/catalog-previews/` are **not** copied into `dist/`, so the build drops the ~112 MB of binary
assets. The gallery page is still shipped, with its preview paths rewritten to the bucket. A build
without the variable keeps the previous behaviour (assets inlined into `dist/`) and prints a warning,
so an offline/local build still works. Development never uses the variable and is unchanged.

The base is baked in at build time, so change it by rebuilding, not by editing `dist/`. If it is set
to a non-absolute value the build fails fast with an explanatory error.

**Status:** the uploader and the build split are implemented and verified locally (a build with
`VITE_ASSET_BASE_URL` set produces no `dist/models` or `dist/catalog-previews`). No R2 bucket or
Cloudflare token is available in this environment, so **the upload was not executed and the deployed
origin has not been checked**. The blocker and exact commands are recorded in [`plan.md`](../plan.md).

---

## 8. Character and animation audit

The imported character kits (`blocky-characters` ×18, `mini-characters` ×26, plus 7 character
records from `mini-arcade`, `mini-market`, `mini-forest` and `mini-skate`) are **static props** with
no skeleton, skinning, rig or animation clips. `shared/catalog/character-library.mjs` classifies all
51 records into pedestrians (33), service staff (3), accessibility props (14) and one out-of-world
fantasy archer. They can be placed in builds and used as the **distant** city-crowd LOD; they are never
player avatars. Accessibility props (wheelchairs, canes, crutches, glasses, masks) are not randomly
assigned to pedestrians.

**Toon Characters and Animated Characters are absent from the available collection.** The source
`3d/` directory has no toon or animated character kit, so there were no animation clips to import.
Nearby NPCs therefore use LoftLife's own rig (`createAvatarRig`) with generated `AvatarConfig`s, and
share the 13-state animation vocabulary with players. LoftLife's avatar customization system is
untouched: `src/game/avatar.ts`, the makeover service, mirror/salon, clothing shops, inventory,
closet outfits and multiplayer animation state all continue to use the procedural rig. Every imported
character record has `playerCompatible: false`.

The city crowd itself is documented in [CHARACTERS-NPCS-VEHICLES.md](CHARACTERS-NPCS-VEHICLES.md):
sidewalk loops, corner crossings, venue visits, reactions, LOD budgets and recycling.

**Missing character/animation coverage to track:** rigged humanoid characters with a skeleton,
shared animation clips (idle/walk/sit/dance/emotes), facial rigs, and clothing meshes authored for
LoftLife's rig. Kenney's available 3D collection does not provide these, so they remain a future
custom or commissioned asset task rather than something this import can misrepresent.

---

## 9. Verification

```bash
npm run lint                 # tsc --noEmit, clean
npm run build                # production build, clean
npm test                     # 208 API/realtime/catalog/crowd checks
npm run check:people         # 120 s real-city crowd simulation
npm run assets:check         # procedural + Kenney manifest validation
npm run assets:gallery       # rebuild the visual gallery
```

`server/test/kenney-library.test.mjs` (9 checks) proves:

1. 1,676 unique records across 21 kits with CC0 source records and positive prices;
2. no weapon/gambling model or id, with exclusions recorded;
3. every record points at a shipped GLB that parses with real bounds and the recorded triangle count;
4. every referenced texture is present and is a PNG;
5. manifest and catalog describe the same set; every preview is 512×512 RGBA with a matching image
   hash and a matching GLB hash;
6. sampled previews have real transparency, object coverage and centring;
7. all 49 replacements target real models and do not duplicate one visual;
8. server prices/shop expose every imported record exactly once at the catalog price;
9. R2 keys mirror the local layout.

`server/test/catalog-expansion.test.mjs` was updated so a replaced existing item is expected to show
the preview rendered from its imported model; all 1,434 procedural previews remain valid.

**End-to-end editor check (live dev server, signed-in suite):** searched the imported
`Lounge Sofa Ottoman`, placed it in suite Build Mode, and observed `PUT /api/suite` return **200**.
After a full page reload the suite still reported **15 items** and the imported model was rebuilt
from its GLB locally; the server copy also retained the item. The gallery page loaded all **1,676**
previews with **0** broken images.

Two save-path defects surfaced during that check and were fixed:

- the game mounts with an already-online session when the platform opens a suite, so the
  `onlineReadyRef` save gate never opened and autosave was silently skipped; it now initialises from
  the adopted server suite (and still blocks writes while a device/account conflict is unresolved);
- placement snapped to **half-grid** steps while persistence only accepts integer cells, so an edge
  placement could produce `gx=15` and the whole save was rejected with `400`. Snapping is now to
  whole cells (0–`GRID_SIZE - size`), matching the server contract.

---

## 10. Known limitations

- **R2 upload was not executed** (no bucket/token here). The script and keys are ready.
- The imported metadata is about 2.4 MB raw in the main client bundle (roughly 280 kB gzip for the
  whole index chunk). It is loaded once with the catalog, not per room; a future refinement is to
  split the library metadata into a lazily fetched JSON module.
- **Lighting and scale are close but not identical across kits.** Style groups keep incompatible
  art directions apart and the material-role mapping unifies colour, but a Kenney low-poly chair
  will never match a hand-modelled hero prop one-to-one. The procedural models that carry bespoke
  animation were intentionally kept.
- **Static characters are not avatars** (see §8). They are used as distant city-crowd LOD and as
  placeable props; nearby NPCs use the animated LoftLife rig.
- **No per-model LODs or Draco compression.** GLBs are already small (26.8 kB mean, 920 kB max);
  previews dominate storage. Meshopt/Draco can be added to the importer if payload grows.
- **Texture recolouring is a tint, not a repaint.** City/food/nature colormaps keep their authored
  detail; remapping every palette entry would change signage and food colours unrealistically.
- **Room item cap** remains 320 per property (server validation); the catalog is larger than any one
  build, by design.
- The gallery is a review surface, not a second editor; all placement happens in the real LoftLife
  build mode.
