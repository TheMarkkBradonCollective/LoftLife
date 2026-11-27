/**
 * Curated first-wave LoftLife furniture imports.
 *
 * Every model is selected from the Poly Haven CC0 collection exposed by the
 * nirholas/three.ws open-source object library. We deliberately keep this first
 * set to one visual family: warm contemporary / mid-century furniture.
 *
 * The runtime verifies the live library entry is CC0 + Poly Haven before it
 * loads any model. If a model is unavailable, LoftLife keeps its existing
 * procedural model as a safe fallback.
 */
export const IMPORTED_FURNITURE_LIBRARY = {
  repository: 'nirholas/three.ws',
  api: 'https://three.ws/api/objects/library?limit=1000',
  source: 'polyhaven',
  license: 'CC0',
  style: 'LoftLife Warm Contemporary',
  palette: {
    chalk: '#efeae1',
    warmGreige: '#cfc3b2',
    naturalOak: '#c89e6d',
    smokedWalnut: '#684730',
    charcoal: '#3a3d44',
    brushedBrass: '#d4af5a',
    sage: '#7c9a82',
  },
};

export const IMPORTED_FURNITURE_ASSETS = [
  {
    catalogId: 'coffee_table',
    slug: 'modern_coffee_table_01',
    label: 'Modern Coffee Table',
    finish: 'wood',
    targetDimensions: [1.5, 0.46, 0.78],
    tintStrength: 0.1,
    styleTags: ['warm contemporary', 'wood', 'stone'],
  },
  {
    catalogId: 'coffee_table_round',
    slug: 'coffee_table_round_01',
    label: 'Round Contemporary Coffee Table',
    finish: 'mixed',
    targetDimensions: [0.98, 0.44, 0.98],
    tintStrength: 0.08,
    styleTags: ['warm contemporary', 'marble', 'metal'],
  },
  {
    catalogId: 'lounge_chair',
    slug: 'mid_century_lounge_chair',
    label: 'Mid-Century Lounge Chair',
    finish: 'fabric',
    targetDimensions: [0.9, 0.9, 0.88],
    tintStrength: 0.16,
    styleTags: ['mid-century', 'wood', 'leather'],
  },
  {
    catalogId: 'armchair',
    slug: 'modern_arm_chair_01',
    label: 'Modern Armchair',
    finish: 'fabric',
    targetDimensions: [0.92, 0.94, 0.9],
    tintStrength: 0.16,
    styleTags: ['warm contemporary', 'wood', 'leather'],
  },
  {
    catalogId: 'dining_chair_wood',
    slug: 'dining_chair_02',
    label: 'Contemporary Dining Chair',
    finish: 'fabric',
    targetDimensions: [0.52, 0.92, 0.58],
    tintStrength: 0.14,
    styleTags: ['contemporary', 'dining', 'leather'],
  },
  {
    catalogId: 'side_table',
    slug: 'side_table_01',
    label: 'Minimal Side Table',
    finish: 'wood',
    targetDimensions: [0.58, 0.58, 0.58],
    tintStrength: 0.1,
    styleTags: ['minimal', 'wood', 'contemporary'],
  },
  {
    catalogId: 'bookshelf',
    slug: 'wooden_display_shelves_01',
    label: 'Modern Wooden Display Shelves',
    finish: 'wood',
    targetDimensions: [0.94, 1.8, 0.38],
    tintStrength: 0.1,
    styleTags: ['modern', 'wood', 'display'],
  },
  {
    catalogId: 'bookshelf_tall',
    slug: 'steel_frame_shelves_03',
    label: 'Steel-Frame Display Shelving',
    finish: 'mixed',
    targetDimensions: [0.92, 1.92, 0.4],
    tintStrength: 0.08,
    styleTags: ['contemporary', 'minimal', 'steel', 'wood'],
  },
];

export const IMPORTED_FURNITURE_BY_ID = Object.fromEntries(
  IMPORTED_FURNITURE_ASSETS.map((asset) => [asset.catalogId, asset])
);
