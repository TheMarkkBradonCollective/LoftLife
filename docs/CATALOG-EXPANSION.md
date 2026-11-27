# Catalog expansion & asset pipeline

This document covers the world-building catalog: what exists, how each item's transparent
preview is produced, how the catalog reaches the shop/build UI and the server, what was verified,
and what is still missing. It is written to be accurate about the last part.

## What shipped

| | Count |
| --- | --- |
| Catalog items in game | **1,971** (73 pre-existing + 271 authored + 1,627 imported net-new; 49 existing pieces re-skinned) |
| New authored parametric model kinds | **95** |
| Imported GLB models | **1,676** across 21 CC0 Kenney kits |
| Unique preview PNGs | **3,110** (1,434 procedural incl. colour variants + 1,676 imported) |
| Preview resolution / format | 512×512, 8-bit RGBA PNG, transparent |
| Themed collections | 18 (Modern Home → Garden & Patio) |
| Categories | 23 (structure, living, seating, tables, bedroom, kitchen, bath, commercial, nightlife, specialty, events, outdoor, vehicles, decor, lighting, plants, wall, office, gaming, laundry, buildings, roads, characters) |
| Server-priced shop entries | 1,971 world assets + 6 wardrobe pieces |

Every item has: unique id, display name, category, subcategory, description, model kind + params,
layer (`floor` / `rug` / `wall`), footprint in metres, price + currency, colour variants, themes,
placement (`indoor` / `outdoor` / `both`), availability, and asset version. The record lives in
`shared/catalog/expansion.mjs` and is imported by the browser, the Node API, the Cloudflare Worker,
the preview renderer and the tests — there is no second copy to drift.

Construction includes brick/glass/concrete/wood walls, half walls, storefront glass, columns,
beams, arches, doors, windows, stairs (straight, spiral, floating), railings, mezzanines, roofs,
fences, decks, dance floors, ceilings and ceiling fixtures. Commercial covers restaurant, café,
bar, retail, salon, gym, office, hotel and gallery fixtures. Nightlife covers DJ booths, decks,
mixers, subs, truss, moving heads, LED walls, VIP booths and bottle service. Specialty covers the
hookah and cannabis lounge collections, events cover banquet/wedding/photo-backdrop pieces,
outdoor covers landscaping, street furniture and pools, vehicles add ten road vehicles.

The **imported Kenney library** adds 1,676 GLB models in 21 classified kits: residential furniture
and appliances, modular buildings and storefronts, roads and street furniture, cars/trains/boats,
nature and landscaping, food and restaurant props, retail and market shelving, arcade cabinets,
seasonal decor, industrial fittings, and static character/accessibility props. Weapon, gambling and
incompatible art-direction kits are excluded and recorded. Full classification, counts,
replacement mapping, loader behaviour and R2 layout: [KENNEY-ASSET-LIBRARY.md](KENNEY-ASSET-LIBRARY.md).

## The model is the source of truth

`src/game/models/` contains the builders the game itself runs (`MODEL_BUILDERS`, keyed by model
kind). `buildCatalogModel(record, { color, active })` turns a catalog record into a
`THREE.Object3D`; placement in `src/game/furniture.ts` calls exactly that function. There are no
catalog-only meshes.

`scripts/render-catalog-previews.mjs` imports the same registry (bundled with esbuild), builds each
model with the item's default and variant colours, frames its bounds in an orthographic
product-shot camera, lights it with key/fill/rim lights, rasterises it with a CPU renderer
(`scripts/lib/raster.mjs` — z-buffer, 2×2 supersampling, straight alpha) and writes the PNG with
`scripts/lib/png.mjs`. A headless DOM shim (`scripts/lib/dom-stub.mjs`) lets legacy canvas-texture
builders run in Node.

Output naming is deterministic:

- `public/catalog-previews/<id>.png` — default colour
- `public/catalog-previews/<id>-<variantIndex>.png` — each additional colour

`shared/catalog/preview-manifest.json` records, per item, the model kind, the model-params,
a signature hash over `{kind, params, kitVersion}`, triangle count, and each image's path, colour
and SHA-256. `catalogPreviewUrl(item, colour)` resolves the same convention in the client, so the
thumbnail, the shop card and the placed object can never disagree about the finish.

Commands:

```bash
npm run assets:previews            # render whatever is missing or stale
npm run assets:previews -- --force # re-render all 1,434 images (~2 min)
npm run assets:previews -- --only=dj_booth --force
npm run assets:check               # validate images against the manifest
```

Rendering is incremental: an image is skipped when its recorded signature still matches the model.
Changing a model kind's params therefore regenerates exactly the affected previews.

## UI

**Build panel → Catalogue** (`src/hud/BuildPanel.tsx`): category tabs for all 20 categories, text
search across name/description/style tags/kit name, a themed-collection filter, an art-style filter,
a live "N shown" count, and a card per item with its transparent render, price, footprint and
sit/use hint. Cards lazy-load (`loading="lazy"`, `decoding="async"`) and render in pages of 72 with
**Show more**, so a 1,971-item list never mounts more than the visible images.

**Market** (`src/components/ShopModal.tsx`): search, category chips, preview thumbnails, owned
counts, affordability state, and a detail panel that mounts `ModelInspector` — a real WebGL view of
the same model, drag to rotate, wheel to zoom, auto-spin at rest — plus colour swatches that swap
the inspector *and* the transparent variant render. Imported items show the preview rendered from
their GLB and are paged (60 + 60) rather than mounting every card. Wardrobe items intentionally show no image:
the clothing system is unchanged and a garment render would misrepresent it.

## Server and database

- `server/economy.mjs` spreads `EXPANSION_PRICES` into `FURNITURE_PRICES`, so `/api/shop`,
  purchase validation and room saving accept the new ids at catalog prices, with label, category,
  description and preview path in the payload.
- `server/validate.mjs` accepts any catalog id through `isKnownFurniture`.
- The Cloudflare Worker, its edge economy module and its world sanitizer read the same price table
  (`src/cloudflare/{worker,economy,worlds}.ts`), so items bought at the edge are placeable.
- `migrations/0009_catalog_expansion.sql` adds `catalog_items` and `catalog_preview_renders`
  (metadata mirror + render provenance). `migrations/catalog-seed.generated.sql` is generated by
  `node scripts/export-catalog-sql.mjs` — never edited by hand.

## Performance

- The 95 authored builders generate ~1–2 k triangles per item; imported models average ~27 kB per
  GLB (largest 920 kB) and are loaded only for items actually placed or inspected in a room, through
  one cached GLTFLoader with in-flight dedupe and a 240-model LRU.
- Preview PNGs sit in `public/` (procedural 20 MB; imported 40 MB) and are served as static files
  with browser caching; they are never imported into the JS bundle. The library metadata (~2.4 MB
  raw, part of the main gzip chunk) loads once with the catalog, not per room.
- `ModelInspector` is only mounted when an item is selected, and disposes geometry, materials and
  the WebGL context on unmount or item change.
- Catalog filtering is memoised and runs over a plain array; no per-render allocations of models.

## Storage pipeline

- `npm run db:seed` applies `migrations/0009_catalog_expansion.sql` and the generated seed
  (`migrations/catalog-seed.generated.sql`) row by row, using upserts keyed on `id`. Re-running is
  idempotent and never touches wallets, inventory or purchases.
- `npm run assets:upload` uploads every preview (procedural and imported), every Kenney GLB and
texture, and both manifests to the unified `r2://<bucket>/catalog/v1/...` layout with immutable
cache headers (see [KENNEY-ASSET-LIBRARY.md](KENNEY-ASSET-LIBRARY.md#7-cloudflare-r2-storage)).
- Both scripts refuse to run without their credentials and print the exact blocker; neither has
  been applied in this environment (`DATABASE_URL`, `CATALOG_R2_BUCKET` and
  `CLOUDFLARE_API_TOKEN` are unset), so production storage remains outstanding.

## Verification

`server/test/catalog-expansion.test.mjs` (9 checks) fails the suite when any of the following is
untrue:

1. Catalog validation is clean and ids are unique.
2. Every expanded item appears in the manifest with a matching model kind, `rendered` status and
   non-zero triangle count.
3. Every manifest signature equals the hash of that item's model kind/params — proving the image is
   linked to the model, not just to the id.
4. Every item's previews are 512×512 8-bit RGBA PNGs, exist on disk, and match their recorded hash.
5. A 40+ image sample decodes with real transparency, sub-1% edge contact, centred bounds, >1%
   object coverage and antialiasing.
6. Each item has one distinct image per colour variant, tagged with that variant's colour.
7. Server prices, `isKnownFurniture` and shop payloads match the catalog exactly.
8. Every required category has ≥6 pieces and every one of the 18 collections has ≥2.
9. No item relies on a missing or invented preview.

Also run: `npm run lint` (clean), `npm run build` (clean), `npm test` (all passing, including this
file and the 9 imported-library checks), `npm run assets:check` (3,110/3,110 previews validated).

A live editor pass also confirmed an imported item places, saves (`PUT /api/suite` 200) and survives
a full reload. That pass exposed and fixed two persistence defects: the autosave gate never opened
when the game mounted into an already-online session, and half-grid snapping could emit a
non-integer cell that the server rejected. See
[KENNEY-ASSET-LIBRARY.md](KENNEY-ASSET-LIBRARY.md#9-verification).

## Known limitations

- **Multi-floor editing is implemented** for up to four storeys: per-storey finishes, real slab and
  wall geometry, a rooftop level, storey-local collision and stairs that move the avatar between
  floors. Remaining multi-floor limits: every storey shares the 14×14 m footprint (no atriums or
  per-storey outlines), stair traversal is a one-storey step rather than animated climbing, and
  visitor presence does not yet carry a storey. See
  [BUILDING-MULTIFLOOR.md](BUILDING-MULTIFLOOR.md).
- **Clothing was not expanded.** The existing wardrobe (14 tops, 7 bottoms, 8 accessories, 5
  jewellery pieces, 4 bags), rig and outfit flow are untouched; no new garments, shoes, swimwear or
  outerwear were added, and clothing shows no catalog image. This is tracked as the first *Next*
  item in [plan.md](../plan.md).
- **Curved/angled walls do not auto-join.** They place and rotate on the grid, but there is no
  automatic corner/edge snapping or trimming.
- **Escalators and elevators are static models**, not moving transport. The existing tram/taxi
  transit system is unchanged.
- **Legacy texture maps are not sampled by the preview renderer.** It renders base colours and
  material parameters; where a legacy item used a canvas texture, the preview shows its base
  colour. New catalog items are built from flat PBR colours, so their previews are exact.
- **R2 upload was not executed.** All 3,110 previews and 1,676 GLBs ship as static assets from
  `public/`, which is what the build does. `catalog_items.preview_r2_key` and
  `catalog_seed.generated.sql` are ready for an R2/Neon mirror, but no bucket credentials were
  available in this environment, so no deployment was performed and the migration was not applied.
- **Imported catalog metadata is not in the Neon seed.** The 1,676 Kenney rows are generated into
  `shared/catalog/kenney-library.mjs` and served by the Node API and Worker from that shared module;
  `scripts/export-catalog-sql.mjs` still exports only the authored 344. The game does not read
  catalog rows from Postgres, so this affects reporting/admin mirrors, not play.
- **Live in-game screenshots were captured from the running dev build** (see the PR), not from a
  production deployment.
