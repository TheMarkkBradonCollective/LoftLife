# Catalog expansion & asset pipeline

This document covers the world-building catalog: what exists, how each item's transparent
preview is produced, how the catalog reaches the shop/build UI and the server, what was verified,
and what is still missing. It is written to be accurate about the last part.

## What shipped

| | Count |
| --- | --- |
| Catalog items in game | **344** (73 pre-existing + 271 new) |
| New parametric model kinds | **95** |
| Unique preview PNGs | **1,434** (one per item, plus one per colour variant) |
| Preview resolution / format | 512×512, 8-bit RGBA PNG, transparent |
| Themed collections | 18 (Modern Home → Garden & Patio) |
| Categories | 20 (structure, living, seating, tables, bedroom, kitchen, bath, commercial, nightlife, specialty, events, outdoor, vehicles, decor, lighting, plants, wall, office, gaming, laundry) |
| Server-priced shop entries | 344 world assets + 6 wardrobe pieces |

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
search across name/description/style tags, a themed-collection filter, a live "N shown" count, and
a card per item with its transparent render, price, footprint and sit/use hint. Cards lazy-load
(`loading="lazy"`, `decoding="async"`) so a 344-item list costs only the visible images.

**Market** (`src/components/ShopModal.tsx`): search, category chips, preview thumbnails, owned
counts, affordability state, and a detail panel that mounts `ModelInspector` — a real WebGL view of
the same model, drag to rotate, wheel to zoom, auto-spin at rest — plus colour swatches that swap
the inspector *and* the transparent variant render. Wardrobe items intentionally show no image:
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

- Geometry is procedural and shared: 95 builders generate ~1–2 k triangles per item rather than
  shipping binary assets, and only the items placed in a room are built at runtime.
- Preview PNGs sit in `public/` (20 MB total, ~14 kB average) and are served as static files with
  browser caching; they are never imported into the JS bundle.
- `ModelInspector` is only mounted when an item is selected, and disposes geometry, materials and
  the WebGL context on unmount or item change.
- Catalog filtering is memoised and runs over a plain array; no per-render allocations of models.

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

Also run: `npx tsc --noEmit` (clean), `npm run build` (clean), `npm test` (**157 passing** including
the 9 above and all pre-existing API/multiplayer/permissions checks), `npm run assets:check`
(344/344 items validated).

## Known limitations

- **Multi-floor editing is not implemented.** Stairs, mezzanines, balconies and railings exist as
  correctly-scaled, placeable models, but the room editor still has one 14×14 floor per suite and
  three placement layers (floor, rug, wall). There is no second storey, no stair-to-floor link and
  no vertical navigation in build mode. Ceiling fixtures mount at wall height via `mount:'ceiling'`
  rather than a real ceiling layer.
- **Clothing was not expanded.** The 6 wardrobe pieces, rig and outfit flow are untouched; no new
  garments, shoes or accessories were added, and clothing shows no catalog image.
- **Curved/angled walls do not auto-join.** They place and rotate on the grid, but there is no
  automatic corner/edge snapping or trimming.
- **Escalators and elevators are static models**, not moving transport. The existing tram/taxi
  transit system is unchanged.
- **Legacy texture maps are not sampled by the preview renderer.** It renders base colours and
  material parameters; where a legacy item used a canvas texture, the preview shows its base
  colour. New catalog items are built from flat PBR colours, so their previews are exact.
- **R2 upload was not executed.** The preview set is small enough to ship as static assets
  (`public/`), which is what the build does. `catalog_items.preview_r2_key` and
  `catalog_seed.generated.sql` are ready for an R2/Neon mirror, but no bucket credentials were
  available in this environment, so no deployment was performed and the migration was not applied.
- **Live in-game screenshots were captured from the running dev build** (see the PR), not from a
  production deployment.
