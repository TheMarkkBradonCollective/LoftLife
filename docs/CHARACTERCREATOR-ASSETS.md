# CharacterCreator wardrobe assets

## Imported collection

LoftLife imports exported **data assets only** from [kblood/CharacterCreator](https://github.com/kblood/CharacterCreator), pinned to source revision `852e48f316b90a0937234886630e4fb4cdfd1f78`.

The import includes:

- The rigged `base_body.glb` character.
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

## Runtime compatibility — integration gate

These GLBs are not drop-in clothing for LoftLife's current avatar. CharacterCreator garments and hair are skinned to its included MakeHuman `game_engine` skeleton (53 bones) and share 92 body morph targets. LoftLife's current `src/game/avatar.ts` builds a procedural avatar from Three.js groups and primitive meshes rather than that skeleton.

Therefore this import stage deliberately stores the real assets and their catalog metadata without falsely marking them as wearable in the live closet. The next integration stage must introduce a compatible GLTF avatar rig (or a tested retarget/skin-weight adapter), preserve LoftLife's current animation and avatar configuration contracts, and validate every garment against the configured body presets before enabling purchase/equip. Keep the existing procedural avatar as a fallback until that work passes mobile and desktop checks.
