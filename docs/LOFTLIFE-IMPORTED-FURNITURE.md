# LoftLife imported furniture — first curated set

## Visual direction

The first imported collection is **LoftLife Warm Contemporary**: modern and mid-century silhouettes, warm natural wood, restrained stone and metal, upholstered seating, and a small shared finish palette. The existing catalog palette remains the source of LoftLife colors: chalk, warm greige, natural oak, smoked walnut, charcoal, brushed brass and sage.

We intentionally do not mix unrelated low-poly packs into this collection. Every model in this first wave comes from the Poly Haven CC0 source collection, surfaced through the open-source `nirholas/three.ws` object library.

## First-wave model mapping

| LoftLife catalog item | Source model | Finish |
| --- | --- | --- |
| `coffee_table` | `modern_coffee_table_01` | Wood |
| `coffee_table_round` | `coffee_table_round_01` | Mixed |
| `lounge_chair` | `mid_century_lounge_chair` | Upholstery |
| `armchair` | `modern_arm_chair_01` | Upholstery |
| `dining_chair_wood` | `dining_chair_02` | Upholstery |
| `side_table` | `side_table_01` | Wood |
| `bookshelf` | `wooden_display_shelves_01` | Wood |
| `bookshelf_tall` | `steel_frame_shelves_03` | Mixed |

## Runtime behavior

- The game requests the public object manifest from `https://three.ws/api/objects/library?limit=1000`.
- Only entries whose manifest says both `source: polyhaven` and `license: CC0` are accepted.
- Only the eight explicit slugs in `shared/catalog/imported-furniture.mjs` are loaded; this is not an unrestricted third-party catalog.
- GLB models are loaded with Three.js `GLTFLoader`, normalized with uniform scaling (never stretched), grounded and centered, then cloned per placed object.
- Original PBR textures and material maps are preserved. LoftLife finish swatches apply a restrained tint, while metal details are protected from broad recoloring.
- Existing placement, seat anchors, item IDs, pricing, inventory and room persistence remain unchanged.
- If the remote manifest or a model is unavailable, the existing procedural LoftLife builder remains the fallback.
- The first successful preload rebuilds current furniture, the placement ghost and the live 3D inspector so imported models appear without a page refresh.
- Existing static catalog PNGs are intentionally not overwritten by this first integration; their thumbnails still use the established renderer until a dedicated GLB thumbnail pass is added.

## Source and licensing

- Open-source library: https://github.com/nirholas/three.ws
- Library documentation: https://github.com/nirholas/three.ws/blob/main/docs/object-library.md
- Model source collection: Poly Haven, CC0.
- The runtime checks each manifest entry's source and license before downloading it. Do not remove that check or broaden the source filter without reviewing the individual license.

## Performance notes

The loader fetches only the eight approved furniture models, with three concurrent downloads. Models are cached as source scenes and cloned for room instances. Textures and geometry are shared by Three.js clones; materials are cloned so each placed object's color selection does not recolor other copies. The existing procedural catalog remains available as an offline and error fallback.
