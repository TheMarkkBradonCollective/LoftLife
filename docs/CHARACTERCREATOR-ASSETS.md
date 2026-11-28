# CharacterCreator wardrobe assets

## Imported collection

LoftLife imports exported **data assets only** from [kblood/CharacterCreator](https://github.com/kblood/CharacterCreator), pinned to source revision `852e48f316b90a0937234886630e4fb4cdfd1f78`.

The import includes:

- The rigged `base_body.glb` character and its animated counterpart `base_body_anim.glb`.\n- The MakeHuman joint/skeleton sidecar (`base_body.joints.json`) and body collider metadata (`body_colliders.json`).
- Visible clothing: T-shirt, long-sleeve shirt, hoodie, jacket, trench coat, dress, jeans, shorts, skirt, shoes and boots.
- Eight hair meshes.
- The source clothing/hair catalogs and asset-license evidence.

Underwear and bra catalog entries are intentionally excluded from the LoftLife storefront import.

## Licensing and provenance

The source project's `LICENSE-NOTES.md` identifies the generated GLB exports and generated catalogs as **CC0-1.0**, including commercial use. The source generator code is GPL-3.0-or-later; LoftLife does **not** import or bundle that generator code. Original MakeHuman system asset credits are retained in `asset_licenses.json`, and each imported item retains its source description in `manifest.json`.

Keep `manifest.json`, `LICENSE-NOTES.md`, and `asset_licenses.json` with the models when moving them to object storage. Do not strip provenance metadata.

## Import and upload

```bash
npm run assets:charactercreator:dry
npm run assets:charactercreator
npm run assets:upload -- --dry-run
```

A manual GitHub Actions workflow named **Import CharacterCreator wardrobe assets** can run the import and publish the files to R2. It requires repository variable `CATALOG_R2_BUCKET` and secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.

The import writes to `public/models/charactercreator/`. The existing R2 uploader publishes this directory to:

`catalog/v1/models/charactercreator/`

The public asset base URL remains the existing `VITE_ASSET_BASE_URL` ending in `/catalog/v1`.

## Runtime integration

LoftLife now uses a runtime adapter in `src/game/characterCreatorAvatar.ts`. It loads the animated CC0 base body, applies supported body/face morphs, plays the embedded idle/walk/run clips, and loads the visible clothing and hair GLBs as skinned wearables. Garment bone indices are remapped by bone name onto the loaded body skeleton. The existing procedural avatar remains only as a load-failure fallback.

The adapter resolves models from `/models/charactercreator/` (or the configured R2 asset base) first, then falls back to the pinned public source revision. Run the import workflow to mirror the models to R2 for production. Current LoftLife appearance settings map onto the available CharacterCreator sliders and eight hair meshes; settings for which the source pack has no matching feature retain their existing UI state but are not represented as new morphs.
