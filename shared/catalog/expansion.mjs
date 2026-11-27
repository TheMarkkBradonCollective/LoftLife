/**
 * LoftLife expanded asset catalog — the single source of truth.
 *
 * Plain ESM with no imports so it can be read by the browser bundle, the Node
 * API (prices, ownership validation), the preview renderer and the tests. Every
 * entry names a real model kind from src/game/models plus its parameters, so
 * the 3D model, its rendered preview and its shop record all come from one
 * record. Ids are permanent; changing geometry bumps `version` and marks the
 * preview for regeneration.
 */

export const PREVIEW_SIZE = 512;
export const PREVIEW_DIR = 'catalog-previews';

export const CATALOG_CATEGORIES = [
  {
    id: 'structure',
    label: 'Construction',
    subcategories: [
      { id: 'walls', label: 'Walls & Columns' },
      { id: 'floors', label: 'Floors' },
      { id: 'ceilings', label: 'Ceilings & Fixtures' },
      { id: 'stairs', label: 'Stairs & Elevation' },
      { id: 'doors', label: 'Doors & Windows' },
      { id: 'roofs', label: 'Roofs & Exterior' },
      { id: 'grounds', label: 'Grounds & Street' },
      { id: 'exterior', label: 'Exterior Modules' },
      { id: 'industrial', label: 'Industrial Modules' },
    ],
  },
  {
    id: 'living',
    label: 'Living',
    subcategories: [
      { id: 'living', label: 'Living Rooms' },
      { id: 'seating', label: 'Seating' },
      { id: 'tables', label: 'Tables' },
      { id: 'electronics', label: 'Electronics' },
      { id: 'laundry', label: 'Laundry & Storage' },
    ],
  },
  {
    id: 'seating',
    label: 'Seating',
    subcategories: [{ id: 'seating', label: 'Seating' }],
  },
  {
    id: 'tables',
    label: 'Tables',
    subcategories: [{ id: 'tables', label: 'Tables' }],
  },
  {
    id: 'bedroom',
    label: 'Bedroom',
    subcategories: [{ id: 'bedroom', label: 'Bedroom' }],
  },
  {
    id: 'kitchen',
    label: 'Kitchen',
    subcategories: [{ id: 'kitchen', label: 'Kitchen & Dining' }],
  },
  {
    id: 'bathroom',
    label: 'Bathroom',
    subcategories: [{ id: 'bathroom', label: 'Bathroom' }],
  },
  {
    id: 'office',
    label: 'Office',
    subcategories: [
      { id: 'office', label: 'Home Office' },
      { id: 'electronics', label: 'Electronics' },
      { id: 'workspace', label: 'Workspace' },
    ],
  },
  {
    id: 'commercial',
    label: 'Business',
    subcategories: [
      { id: 'restaurant', label: 'Restaurant' },
      { id: 'cafe', label: 'Café' },
      { id: 'bar', label: 'Bar' },
      { id: 'retail', label: 'Retail' },
      { id: 'salon', label: 'Salon & Beauty' },
      { id: 'hotel', label: 'Hotel' },
      { id: 'workspace', label: 'Office & Studio' },
      { id: 'gym', label: 'Gym' },
      { id: 'library', label: 'Library & Gallery' },
      { id: 'medical', label: 'Medical' },
      { id: 'warehouse', label: 'Warehouse' },
      { id: 'food', label: 'Food & Table Props' },
      { id: 'industrial', label: 'Industrial' },
      { id: 'retail', label: 'Retail' },
    ],
  },
  {
    id: 'nightlife',
    label: 'Nightlife',
    subcategories: [
      { id: 'dj', label: 'DJ & Audio' },
      { id: 'lighting', label: 'Lighting & Stage' },
      { id: 'stage', label: 'Stage & Screens' },
      { id: 'club_seating', label: 'Club Seating' },
      { id: 'entry', label: 'Entry & Service' },
      { id: 'arcade', label: 'Arcade & Games' },
    ],
  },
  {
    id: 'specialty',
    label: 'Specialty Lounges',
    subcategories: [
      { id: 'hookah', label: 'Hookah Lounge' },
      { id: 'cannabis', label: 'Cannabis Lounge' },
    ],
  },
  {
    id: 'events',
    label: 'Events & Weddings',
    subcategories: [
      { id: 'wedding', label: 'Wedding' },
      { id: 'banquet', label: 'Banquet & Conference' },
      { id: 'ticketing', label: 'Ticketing & Entrance' },
      { id: 'holiday', label: 'Holiday & Seasonal' },
    ],
  },
  {
    id: 'outdoor',
    label: 'Outdoor',
    subcategories: [
      { id: 'landscaping', label: 'Landscaping' },
      { id: 'water', label: 'Pools & Water' },
      { id: 'structures', label: 'Outdoor Structures' },
      { id: 'street', label: 'Street & Public Space' },
      { id: 'water', label: 'Waterfront' },
      { id: 'props', label: 'Outdoor Props' },
      { id: 'skatepark', label: 'Skate Park' },
    ],
  },
  {
    id: 'vehicles',
    label: 'Vehicles',
    subcategories: [
      { id: 'cars', label: 'Cars' },
      { id: 'two_wheelers', label: 'Motorcycles & Bikes' },
      { id: 'commercial_vehicles', label: 'Vans & Buses' },
      { id: 'water', label: 'Boats & Watercraft' },
      { id: 'rail', label: 'Rail' },
      { id: 'parts', label: 'Parts & Debris' },
    ],
  },
  {
    id: 'decor',
    label: 'Decor',
    subcategories: [
      { id: 'rugs', label: 'Rugs' },
      { id: 'art', label: 'Art & Mirrors' },
      { id: 'lighting', label: 'Lighting' },
      { id: 'electronics', label: 'Electronics' },
      { id: 'vases', label: 'Vases & Books' },
      { id: 'curtains', label: 'Curtains' },
    ],
  },
  {
    id: 'lighting',
    label: 'Lighting',
    subcategories: [{ id: 'lighting', label: 'Indoor & Outdoor Lighting' }],
  },
  {
    id: 'plants_rugs',
    label: 'Plants & Rugs',
    subcategories: [
      { id: 'plants', label: 'Plants' },
      { id: 'rugs', label: 'Rugs' },
    ],
  },
  {
    id: 'wall',
    label: 'Wall Decor',
    subcategories: [
      { id: 'wall', label: 'Wall Pieces' },
      { id: 'art', label: 'Art & Mirrors' },
      { id: 'lighting', label: 'Neon & Lighting' },
      { id: 'electronics', label: 'Electronics' },
    ],
  },
  {
    id: 'buildings',
    label: 'Buildings',
    subcategories: [
      { id: 'residential', label: 'Homes & Apartments' },
      { id: 'commercial', label: 'Shops & Storefronts' },
      { id: 'industrial', label: 'Industrial' },
      { id: 'skyscrapers', label: 'Towers' },
      { id: 'storefronts', label: 'Storefronts' },
    ],
  },
  {
    id: 'roads',
    label: 'Roads & Streets',
    subcategories: [
      { id: 'roads', label: 'Road Tiles' },
      { id: 'street_furniture', label: 'Street Furniture' },
      { id: 'lighting', label: 'Street Lighting' },
      { id: 'bridges', label: 'Bridges' },
      { id: 'construction', label: 'Construction' },
      { id: 'rail', label: 'Rail & Transit' },
      { id: 'sidewalks', label: 'Sidewalks' },
    ],
  },
  {
    id: 'characters',
    label: 'Characters',
    subcategories: [
      { id: 'static_characters', label: 'Static Character Props' },
      { id: 'accessibility', label: 'Accessibility Props' },
    ],
  },
];

export const COLLECTIONS = [
  { id: 'modern_home', label: 'Modern Home' },
  { id: 'luxury_home', label: 'Luxury Home' },
  { id: 'industrial_loft', label: 'Industrial Loft' },
  { id: 'contemporary_apartment', label: 'Contemporary Apartment' },
  { id: 'traditional_home', label: 'Traditional Home' },
  { id: 'restaurant', label: 'Restaurant' },
  { id: 'coffee_shop', label: 'Coffee Shop' },
  { id: 'sports_bar', label: 'Sports Bar' },
  { id: 'nightclub', label: 'Nightclub' },
  { id: 'hookah_lounge', label: 'Hookah Lounge' },
  { id: 'cannabis_lounge', label: 'Cannabis Lounge' },
  { id: 'concert_venue', label: 'Concert Venue' },
  { id: 'wedding_venue', label: 'Wedding Venue' },
  { id: 'corporate_office', label: 'Corporate Office' },
  { id: 'retail_store', label: 'Retail Store' },
  { id: 'hotel', label: 'Hotel' },
  { id: 'outdoor_entertainment', label: 'Outdoor Entertainment' },
  { id: 'garden_patio', label: 'Garden & Patio' },
];

const FINISH = [
  { label: 'Chalk White', hex: '#efeae1' },
  { label: 'Warm Greige', hex: '#cfc3b2' },
  { label: 'Charcoal', hex: '#3a3d44' },
  { label: 'Clay', hex: '#b9705a' },
];
const MASONRY = [
  { label: 'Terracotta Red', hex: '#a65a44' },
  { label: 'Limewash White', hex: '#e3ddd1' },
  { label: 'Slate Grey', hex: '#6b7079' },
  { label: 'Sandstone', hex: '#c9b294' },
];
const WOOD = [
  { label: 'Natural Oak', hex: '#c89e6d' },
  { label: 'Smoked Walnut', hex: '#684730' },
  { label: 'Ash Blonde', hex: '#dfd0b8' },
  { label: 'Ebony', hex: '#2f2b28' },
];
const PAINT = [
  { label: 'Chalk White', hex: '#efeae1' },
  { label: 'Sage', hex: '#7c9a82' },
  { label: 'Terracotta', hex: '#c86b51' },
  { label: 'Midnight', hex: '#39465c' },
  { label: 'Ochre', hex: '#d49a45' },
];
const FABRIC = [
  { label: 'Oat Bouclé', hex: '#e8e1d4' },
  { label: 'Forest Velvet', hex: '#3f6b56' },
  { label: 'Cognac Leather', hex: '#a66238' },
  { label: 'Slate Weave', hex: '#4a5b6e' },
  { label: 'Blush Linen', hex: '#d7a8a6' },
];
const STONE = [
  { label: 'Carrara', hex: '#ece8e0' },
  { label: 'Basalt', hex: '#3a3d45' },
  { label: 'Travertine', hex: '#cbbba4' },
  { label: 'Terrazzo Rose', hex: '#d8b9ad' },
];
const METAL = [
  { label: 'Brushed Brass', hex: '#d4af5a' },
  { label: 'Matte Black', hex: '#262930' },
  { label: 'Brushed Steel', hex: '#b8bec7' },
  { label: 'Copper', hex: '#c77852' },
];
const NEON = [
  { label: 'Electric Green', hex: '#39ff14' },
  { label: 'Hot Pink', hex: '#ff3ea5' },
  { label: 'Cyan Pulse', hex: '#22d3ee' },
  { label: 'Amber Gold', hex: '#fbbf24' },
  { label: 'Violet Haze', hex: '#a855f7' },
];
const NATURE = [
  { label: 'Forest Green', hex: '#3f6b46' },
  { label: 'Olive', hex: '#7b8a4e' },
  { label: 'Sage', hex: '#8fae91' },
  { label: 'Autumn Amber', hex: '#b5762f' },
];
const CAR = [
  { label: 'Pearl White', hex: '#e9e7e2' },
  { label: 'Obsidian', hex: '#1d2026' },
  { label: 'Midnight Blue', hex: '#243a5e' },
  { label: 'Racing Red', hex: '#9d2f2f' },
  { label: 'Silver', hex: '#b6bcc4' },
];
const TILE = [
  { label: 'Carrara Tile', hex: '#e8e5de' },
  { label: 'Graphite Tile', hex: '#3b3f46' },
  { label: 'Sandstone Tile', hex: '#cabfa9' },
  { label: 'Blush Terrazzo', hex: '#dcc0b4' },
];
const CARPET = [
  { label: 'Warm Grey', hex: '#a9a49a' },
  { label: 'Deep Navy', hex: '#2f3c50' },
  { label: 'Oat', hex: '#d8cfbe' },
  { label: 'Forest', hex: '#455c48' },
];

const BASE = {
  currency: 'yuanzi',
  availability: 'available',
  ownership: 'purchase',
  version: 1,
  placement: 'both',
  layer: 'floor',
};

let counter = 0;
function mk(entry) {
  counter += 1;
  const colors = entry.colors && entry.colors.length ? entry.colors : PAINT;
  return {
    ...BASE,
    ...entry,
    id: entry.id,
    slug: entry.id,
    colors,
    defaultColor: entry.defaultColor ?? colors[0].hex,
    price: entry.price ?? 100,
    previewBase: `${PREVIEW_DIR}/${entry.id}`,
    sizes: entry.sizes ?? null,
    order: counter,
  };
}

const items = [];
const add = (entry) => {
  items.push(mk(entry));
  return entry.id;
};
// Each family mapper calls add() itself, so addAll only drives the loop.
const addAll = (list, mapper) => {
  for (const entry of list) mapper(entry);
};

/* ─────────────────────────── Construction: walls ─────────────────────────── */

const WALL_FINISHES = [
  ['wall_plaster', 'Chalk Plaster Wall', 'plaster', PAINT, 120, ['modern_home', 'contemporary_apartment']],
  ['wall_brick', 'Exposed Brick Wall', 'brick', MASONRY, 140, ['industrial_loft', 'sports_bar']],
  ['wall_concrete', 'Board-Form Concrete Wall', 'concrete', FINISH, 150, ['industrial_loft', 'concert_venue']],
  ['wall_stone', 'Cut Stone Wall', 'stone', MASONRY, 190, ['traditional_home', 'luxury_home']],
  ['wall_wood_panel', 'Oak Panel Wall', 'wood', WOOD, 165, ['luxury_home', 'traditional_home']],
  ['wall_metal_clad', 'Ribbed Metal Cladding', 'metal', METAL, 155, ['industrial_loft', 'nightclub']],
  ['wall_glass', 'Glass Partition Wall', 'glass', METAL, 210, ['corporate_office', 'contemporary_apartment']],
  ['wall_decorative', 'Decorative Panel Wall', 'decorative', FINISH, 175, ['luxury_home', 'hotel']],
];
addAll(WALL_FINISHES, ([id, name, variant, colors, price, themes]) =>
  add({
    id,
    name,
    category: 'structure',
    subcategory: 'walls',
    layer: 'floor',
    size: [3, 0.35],
    description: `Modular 3 m ${name.toLowerCase().replace(' wall', '')} section with baseboard, built to align with floors and ceilings.`,
    model: { kind: 'wall', params: { variant, width: 3, height: 2.9, thickness: 0.18 } },
    colors,
    price,
    themes,
    styles: ['modern', 'industrial', 'traditional'],
  })
);

add({
  id: 'wall_curved',
  name: 'Curved Feature Wall',
  category: 'structure',
  subcategory: 'walls',
  size: [3, 2.2],
  description: 'Curved plaster wall segment for rounded rooms, reception curves and nightclub shells.',
  model: { kind: 'curved_wall', params: { radius: 2.4, arc: 1.2, height: 2.9 } },
  colors: PAINT,
  price: 260,
  themes: ['nightclub', 'luxury_home', 'hotel'],
  styles: ['contemporary'],
});
add({
  id: 'wall_corner_outer',
  name: 'Outer Corner Wall Module',
  category: 'structure',
  subcategory: 'walls',
  size: [1.2, 1.2],
  description: 'Right-angle outer corner that joins two 3 m wall runs without a seam.',
  model: { kind: 'corner_wall', params: { arm: 1.2, height: 2.9, outer: true } },
  colors: PAINT,
  price: 145,
});
add({
  id: 'wall_corner_inner',
  name: 'Inner Corner Wall Module',
  category: 'structure',
  subcategory: 'walls',
  size: [1.2, 1.2],
  description: 'Right-angle inner corner for L-shaped rooms and alcoves.',
  model: { kind: 'corner_wall', params: { arm: 1.2, height: 2.9, outer: false } },
  colors: PAINT,
  price: 145,
});
add({
  id: 'wall_half',
  name: 'Half-Height Divider',
  category: 'structure',
  subcategory: 'walls',
  size: [2.4, 0.3],
  description: 'Waist-high wall with a stone cap: divides open-plan kitchens, lounges and offices.',
  model: { kind: 'half_wall', params: { width: 2.4, height: 1.1 } },
  colors: PAINT,
  price: 110,
});
add({
  id: 'wall_half_glass',
  name: 'Half Wall with Glass Top',
  category: 'structure',
  subcategory: 'walls',
  size: [2.4, 0.3],
  description: 'Half wall topped with a glass screen so light still travels between spaces.',
  model: { kind: 'half_wall', params: { width: 2.4, height: 1.1, glassTop: true } },
  colors: FINISH,
  price: 190,
});
add({
  id: 'partition_slatted',
  name: 'Slatted Timber Partition',
  category: 'structure',
  subcategory: 'walls',
  size: [2, 0.3],
  description: 'Open slatted screen that zones a lounge without blocking the view.',
  model: { kind: 'partition', params: { variant: 'slatted', width: 2, height: 2.2 } },
  colors: WOOD,
  price: 135,
  themes: ['restaurant', 'hookah_lounge'],
});
add({
  id: 'partition_fabric',
  name: 'Acoustic Fabric Partition',
  category: 'structure',
  subcategory: 'walls',
  size: [2, 0.3],
  description: 'Upholstered acoustic divider for studios, offices and event suites.',
  model: { kind: 'partition', params: { variant: 'panel', width: 2, height: 2.2, fabric: true } },
  colors: FABRIC,
  price: 160,
  themes: ['corporate_office'],
});
add({
  id: 'storefront_glass',
  name: 'Glass Storefront Wall',
  category: 'structure',
  subcategory: 'walls',
  size: [3.6, 0.35],
  description: 'Aluminium-mullion storefront with bulkhead and transom — the frontage of a shop or café.',
  model: { kind: 'storefront', params: { width: 3.6, height: 3 } },
  colors: METAL,
  price: 380,
  themes: ['retail_store', 'coffee_shop'],
});

const COLUMNS = [
  ['column_round', 'Round Plaster Column', 'round', PAINT, 150],
  ['column_square', 'Square Structural Column', 'square', FINISH, 150],
  ['column_fluted', 'Fluted Classical Column', 'fluted', STONE, 220],
  ['column_steel', 'Exposed Steel Column', 'steel', METAL, 180],
];
addAll(COLUMNS, ([id, name, variant, colors, price]) =>
  add({
    id,
    name,
    category: 'structure',
    subcategory: 'walls',
    size: [1, 1],
    description: 'Load-bearing column that meets floors and beams at standard 3.1 m height.',
    model: { kind: 'column', params: { variant, height: 3.1 } },
    colors,
    price,
    themes: ['luxury_home', 'industrial_loft'],
  })
);

add({
  id: 'beam_steel',
  name: 'Steel I-Beam',
  category: 'structure',
  subcategory: 'walls',
  size: [3, 0.4],
  description: 'Exposed steel beam for industrial ceilings and mezzanine edges.',
  model: { kind: 'beam', params: { variant: 'steel', length: 3 } },
  colors: METAL,
  price: 130,
  themes: ['industrial_loft'],
});
add({
  id: 'beam_wood',
  name: 'Timber Ceiling Beam',
  category: 'structure',
  subcategory: 'walls',
  size: [3, 0.4],
  description: 'Solid timber beam with end caps, sized to match vaulted and rustic ceilings.',
  model: { kind: 'beam', params: { variant: 'wood', length: 3 } },
  colors: WOOD,
  price: 120,
  themes: ['traditional_home', 'garden_patio'],
});
add({
  id: 'archway',
  name: 'Arched Doorway',
  category: 'structure',
  subcategory: 'walls',
  size: [2.4, 0.4],
  description: 'Arched opening that frames a transition between rooms or a wedding aisle.',
  model: { kind: 'archway', params: { width: 2.4, height: 2.8 } },
  colors: FINISH,
  price: 240,
  themes: ['traditional_home', 'wedding_venue'],
  styles: ['traditional', 'mediterranean'],
});
add({
  id: 'trim_baseboard',
  name: 'Baseboard Run',
  category: 'structure',
  subcategory: 'walls',
  size: [2.4, 0.15],
  layer: 'wall',
  wallHeight: 0.08,
  description: 'Paintable baseboard that closes the wall-to-floor joint.',
  model: { kind: 'trim', params: { variant: 'baseboard', width: 2.4 } },
  colors: FINISH,
  price: 35,
});
add({
  id: 'trim_crown',
  name: 'Crown Molding Run',
  category: 'structure',
  subcategory: 'walls',
  size: [2.4, 0.15],
  layer: 'wall',
  wallHeight: 3.0,
  description: 'Crown molding that meets the ceiling line.',
  model: { kind: 'trim', params: { variant: 'crown', width: 2.4 } },
  colors: FINISH,
  price: 40,
  themes: ['luxury_home', 'traditional_home'],
});
add({
  id: 'trim_wainscot',
  name: 'Wainscot Panel Run',
  category: 'structure',
  subcategory: 'walls',
  size: [2.4, 0.15],
  layer: 'wall',
  wallHeight: 0.55,
  description: 'Panelled wainscot with chair rail for dining rooms, bars and libraries.',
  model: { kind: 'trim', params: { variant: 'wainscot', width: 2.4 } },
  colors: WOOD,
  price: 95,
  themes: ['sports_bar', 'traditional_home'],
});
add({
  id: 'built_in_shelving',
  name: 'Recessed Built-In Shelving',
  category: 'structure',
  subcategory: 'walls',
  size: [1.8, 0.4],
  layer: 'wall',
  wallHeight: 0.65,
  description: 'Recessed shelving bay with three shelves and dressed books.',
  model: { kind: 'built_in_shelf', params: { width: 1.8, height: 1.4 } },
  colors: WOOD,
  price: 210,
  themes: ['luxury_home', 'library'],
});

/* ─────────────────────────── Construction: floors ────────────────────────── */

const FLOORS = [
  ['floor_oak_planks', 'Oak Plank Flooring', 'hardwood', WOOD, 90],
  ['floor_walnut_planks', 'Walnut Plank Flooring', 'hardwood', WOOD, 110],
  ['floor_laminate', 'Wide-Plank Laminate', 'laminate', WOOD, 70],
  ['floor_porcelain_tile', 'Porcelain Tile Flooring', 'tile', TILE, 95],
  ['floor_marble', 'Honed Marble Flooring', 'marble', STONE, 180],
  ['floor_stone', 'Limestone Flagstone', 'stone', STONE, 140],
  ['floor_polished_concrete', 'Polished Concrete Floor', 'concrete', FINISH, 120],
  ['floor_carpet', 'Wool Carpet Flooring', 'carpet', CARPET, 85],
  ['floor_vinyl', 'Commercial Vinyl Flooring', 'vinyl', FINISH, 65],
  ['floor_patterned', 'Patterned Encaustic Tile', 'patterned', TILE, 130],
  ['floor_commercial', 'Retail Grade Flooring', 'commercial', FINISH, 100],
  ['floor_dance_led', 'LED Dance Floor', 'dance', NEON, 420],
  ['floor_deck', 'Outdoor Decking', 'hardwood', WOOD, 90],
  ['floor_paver', 'Stone Paver Patio', 'paver', STONE, 95],
  ['floor_grass', 'Lawn Grass Panel', 'grass', NATURE, 45],
];
addAll(FLOORS, ([id, name, variant, colors, price]) =>
  add({
    id,
    name,
    category: 'structure',
    subcategory: 'floors',
    layer: 'rug',
    walkable: true,
    size: [4, 4],
    description: `${name} in a 4×4 m lay-in panel; edges align with adjacent panels.`,
    model: { kind: 'floor_slab', params: { variant, width: 4, depth: 4 } },
    colors,
    price,
    placement: variant === 'grass' || variant === 'paver' || variant === 'hardwood' ? 'both' : 'indoor',
    themes: [variant === 'dance' ? 'nightclub' : 'modern_home'],
    interactive: variant === 'dance',
  })
);

/* ────────────────────────── Construction: ceilings ───────────────────────── */

const CEILINGS = [
  ['ceiling_flat', 'Flat Plaster Ceiling', 'flat', FINISH, 160],
  ['ceiling_suspended', 'Suspended Acoustic Ceiling', 'suspended', FINISH, 220],
  ['ceiling_beams', 'Exposed Beam Ceiling', 'beams', WOOD, 260],
  ['ceiling_industrial', 'Industrial Service Ceiling', 'industrial', METAL, 240],
  ['ceiling_vaulted', 'Vaulted Ceiling', 'vaulted', FINISH, 320],
  ['ceiling_coffer', 'Coffered Decorative Ceiling', 'coffer', FINISH, 340],
];
addAll(CEILINGS, ([id, name, variant, colors, price]) =>
  add({
    id,
    name,
    category: 'structure',
    subcategory: 'ceilings',
    size: [4, 4],
    walkable: true,
    description: `${name} panel at 3.35 m, sized to meet wall tops.`,
    model: { kind: 'ceiling', params: { variant, width: 4, depth: 4 } },
    colors,
    price,
    themes: [variant === 'beams' || variant === 'industrial' ? 'industrial_loft' : 'modern_home'],
  })
);

const CEILING_FIXTURES = [
  ['recessed_light', 'Recessed Downlight', 'downlight', 45],
  ['ceiling_panel_light', 'LED Ceiling Panel', 'panel', 90],
  ['ceiling_vent', 'HVAC Ceiling Vent', 'vent', 40],
  ['smoke_detector', 'Smoke Detector', 'detector', 25],
];
addAll(CEILING_FIXTURES, ([id, name, variant, price]) =>
  add({
    id,
    name,
    category: 'structure',
    subcategory: 'ceilings',
    size: [1, 1],
    walkable: true,
    mount: 'ceiling',
    interactive: variant === 'downlight' || variant === 'panel',
    description: `${name} that mounts to the ceiling grid at 3.3 m.`,
    model: { kind: 'ceiling_fixture', params: { variant } },
    colors: [{ label: 'Warm White', hex: '#fff4dc' }, { label: 'Cool White', hex: '#e8f2ff' }, { label: 'Amber', hex: '#ffd79a' }],
    price,
    themes: ['modern_home'],
  })
);

/* ────────────────────── Construction: stairs & elevation ─────────────────── */

const STAIRS = [
  ['stairs_straight', 'Straight Staircase', 'straight', WOOD, 480],
  ['stairs_spiral', 'Spiral Staircase', 'spiral', METAL, 620],
  ['stairs_curved', 'Curved Staircase', 'curved', WOOD, 580],
  ['stairs_floating', 'Floating Staircase', 'floating', WOOD, 540],
  ['stairs_modular', 'Modular Staircase', 'modular', METAL, 500],
];
addAll(STAIRS, ([id, name, variant, colors, price]) =>
  add({
    id,
    name,
    category: 'structure',
    subcategory: 'stairs',
    size: [2, 4],
    description: `${name} with 12 risers at a 0.2 m step, connecting floors at 2.4 m.`,
    model: { kind: 'stairs', params: { variant, steps: 12 } },
    colors,
    price,
    themes: ['luxury_home', 'industrial_loft'],
  })
);

const RAILINGS = [
  ['railing_metal', 'Metal Balustrade', 'metal', METAL, 120],
  ['railing_glass', 'Frameless Glass Railing', 'glass', METAL, 220],
  ['railing_wood', 'Timber Railing', 'wood', WOOD, 140],
];
addAll(RAILINGS, ([id, name, variant, colors, price]) =>
  add({
    id,
    name,
    category: 'structure',
    subcategory: 'stairs',
    size: [2, 0.25],
    description: `${name} at 1.05 m guarding balconies, stairs and mezzanine edges.`,
    model: { kind: 'railing', params: { variant, length: 2, height: 1.05 } },
    colors,
    price,
  })
);

add({
  id: 'platform_landing',
  name: 'Stair Landing Platform',
  category: 'structure',
  subcategory: 'stairs',
  size: [2, 2],
  description: 'Landing deck that ties a stair run to the next floor level.',
  model: { kind: 'platform', params: { variant: 'landing', width: 2, depth: 2, height: 0.45 } },
  colors: WOOD,
  price: 180,
});
add({
  id: 'balcony_deck',
  name: 'Balcony Deck',
  category: 'structure',
  subcategory: 'stairs',
  size: [3, 1.6],
  description: 'Cantilevered balcony deck with steel edge and a railing post line.',
  model: { kind: 'platform', params: { variant: 'balcony', width: 3, depth: 1.6, height: 0.35 } },
  colors: WOOD,
  price: 320,
  themes: ['luxury_home'],
});
add({
  id: 'mezzanine_deck',
  name: 'Mezzanine Deck',
  category: 'structure',
  subcategory: 'stairs',
  size: [4, 3],
  description: 'Upper mezzanine floor with guard rail — the second level of a loft or club.',
  model: { kind: 'platform', params: { variant: 'mezzanine', width: 4, depth: 3, height: 2.6 } },
  colors: WOOD,
  price: 560,
  themes: ['industrial_loft', 'nightclub'],
});
add({
  id: 'elevator_cab',
  name: 'Elevator Cab',
  category: 'structure',
  subcategory: 'stairs',
  size: [1.6, 1.6],
  description: 'Brushed-metal elevator cab with sliding doors and a call plate.',
  model: { kind: 'elevator', params: { width: 1.5, depth: 1.4 } },
  colors: METAL,
  price: 720,
  themes: ['hotel', 'corporate_office'],
});
add({
  id: 'escalator_run',
  name: 'Escalator Run',
  category: 'structure',
  subcategory: 'stairs',
  size: [2, 5],
  description: 'Inclined escalator with glass balustrades, serving two commercial levels.',
  model: { kind: 'escalator', params: { run: 4.4 } },
  colors: METAL,
  price: 950,
  themes: ['retail_store', 'hotel'],
});

/* ───────────────────── Construction: doors & windows ─────────────────────── */

const DOORS = [
  ['door_single', 'Interior Single Door', 'single', PAINT, 160, 1],
  ['door_double', 'Double Entry Doors', 'double', PAINT, 260, 1.8],
  ['door_sliding', 'Sliding Door', 'sliding', WOOD, 240, 1.6],
  ['door_glass', 'Glass Door', 'glass', METAL, 220, 1],
  ['door_automatic', 'Automatic Commercial Door', 'automatic', METAL, 420, 1.8],
  ['door_garage', 'Sectional Garage Door', 'garage', FINISH, 380, 3],
];
addAll(DOORS, ([id, name, variant, colors, price, width]) =>
  add({
    id,
    name,
    category: 'structure',
    subcategory: 'doors',
    layer: 'wall',
    wallHeight: 1.2,
    size: [width, 0.5],
    description: `${name} with frame, sized to fit a standard wall opening.`,
    model: { kind: 'door', params: { variant, width } },
    colors,
    price,
    placement: variant === 'garage' ? 'outdoor' : 'both',
    themes: ['modern_home', variant === 'automatic' ? 'retail_store' : 'contemporary_apartment'],
    styles: ['modern', 'traditional'],
  })
);

const WINDOWS = [
  ['window_standard', 'Standard Window', 'standard', 1.5, 1.3, 150],
  ['window_bay', 'Bay Window', 'bay', 2.2, 1.5, 320],
  ['window_arched', 'Arched Window', 'arched', 1.5, 1.5, 280],
  ['window_floor_ceiling', 'Floor-to-Ceiling Window', 'floor_to_ceiling', 2.4, 2.6, 380],
  ['window_storefront', 'Storefront Display Window', 'storefront', 3, 1.8, 420],
];
addAll(WINDOWS, ([id, name, variant, width, height, price]) =>
  add({
    id,
    name,
    category: 'structure',
    subcategory: 'doors',
    layer: 'wall',
    wallHeight: 1.4,
    size: [width, 0.4],
    description: `${name} with glazing, frame and sill; fits its wall section.`,
    model: { kind: 'window', params: { variant, width, height } },
    colors: METAL,
    price,
    themes: ['modern_home', 'contemporary_apartment'],
  })
);

add({
  id: 'blinds_venetian',
  name: 'Venetian Blinds',
  category: 'structure',
  subcategory: 'doors',
  layer: 'wall',
  wallHeight: 2.1,
  size: [1.8, 0.2],
  description: 'Aluminium venetian blinds with tiltable slats and a headrail.',
  model: { kind: 'blinds', params: { variant: 'blinds', width: 1.8, height: 1.6 } },
  colors: FINISH,
  price: 90,
});
add({
  id: 'blinds_blackout',
  name: 'Blackout Roller Blind',
  category: 'structure',
  subcategory: 'doors',
  layer: 'wall',
  wallHeight: 2.1,
  size: [1.8, 0.2],
  description: 'Dense roller blind for bedrooms, home cinemas and hotel rooms.',
  model: { kind: 'blinds', params: { variant: 'roller', width: 1.8, height: 1.8 } },
  colors: FABRIC,
  price: 80,
});

/* ───────────────────── Construction: roofs & exterior ────────────────────── */

add({
  id: 'roof_flat',
  name: 'Flat Roof with Parapet',
  category: 'structure',
  subcategory: 'roofs',
  size: [4, 4],
  description: 'Flat roof slab with parapet wall and rooftop units.',
  model: { kind: 'roof', params: { variant: 'flat', width: 4, depth: 4 } },
  colors: FINISH,
  price: 480,
  placement: 'outdoor',
});
add({
  id: 'roof_pitched',
  name: 'Pitched Shingle Roof',
  category: 'structure',
  subcategory: 'roofs',
  size: [4, 4],
  description: 'Two-slope pitched roof with ridge cap and gable ends.',
  model: { kind: 'roof', params: { variant: 'pitched', width: 4, depth: 4 } },
  colors: MASONRY,
  price: 520,
  placement: 'outdoor',
});
add({
  id: 'rooftop_deck',
  name: 'Rooftop Terrace Deck',
  category: 'structure',
  subcategory: 'roofs',
  size: [4, 4],
  description: 'Rooftop deck boards with a steel guard rail and planter shelf.',
  model: { kind: 'roof', params: { variant: 'deck', width: 4, depth: 4 } },
  colors: WOOD,
  price: 420,
  placement: 'outdoor',
  themes: ['outdoor_entertainment'],
});

const FENCES = [
  ['fence_wood', 'Timber Picket Fence', 'wood', WOOD, 110],
  ['fence_metal', 'Metal Garden Fence', 'metal', METAL, 150],
  ['fence_hedge', 'Clipped Hedge Screen', 'hedge', NATURE, 120],
];
addAll(FENCES, ([id, name, variant, colors, price]) =>
  add({
    id,
    name,
    category: 'structure',
    subcategory: 'roofs',
    size: [2.4, 0.4],
    description: `${name} section, 1.2 m tall with posts and rails.`,
    model: { kind: 'fence', params: { variant, length: 2.4, height: 1.2 } },
    colors,
    price,
    placement: 'outdoor',
    themes: ['garden_patio'],
  })
);

add({
  id: 'gate_garden',
  name: 'Garden Gate',
  category: 'structure',
  subcategory: 'roofs',
  size: [1.6, 0.2],
  description: 'Double-leaf garden gate with hinges, latch and posts.',
  model: { kind: 'gate', params: { width: 1.6 } },
  colors: WOOD,
  price: 160,
  placement: 'outdoor',
});
add({
  id: 'porch_sheltered',
  name: 'Sheltered Front Porch',
  category: 'structure',
  subcategory: 'roofs',
  size: [3, 2],
  description: 'Timber porch with deck boards, columns and a protective canopy.',
  model: { kind: 'porch', params: { variant: 'porch', width: 3, depth: 2 } },
  colors: WOOD,
  price: 380,
  placement: 'outdoor',
  themes: ['traditional_home', 'garden_patio'],
});
add({
  id: 'patio_stone',
  name: 'Stone Patio',
  category: 'structure',
  subcategory: 'roofs',
  size: [3, 2],
  layer: 'rug',
  walkable: true,
  description: 'Stone-flag patio surface for gardens and restaurant terraces.',
  model: { kind: 'porch', params: { variant: 'patio', width: 3, depth: 2 } },
  colors: STONE,
  price: 150,
  placement: 'outdoor',
  themes: ['garden_patio', 'outdoor_entertainment'],
});
add({
  id: 'deck_elevated',
  name: 'Elevated Timber Deck',
  category: 'structure',
  subcategory: 'roofs',
  size: [3, 2],
  apiOnly: false,
  description: 'Raised deck with fascia boards and a toe rail.',
  model: { kind: 'porch', params: { variant: 'deck', width: 3, depth: 2 } },
  colors: WOOD,
  price: 280,
  placement: 'outdoor',
});

/* ─────────────────────────── Grounds & street ───────────────────────────── */

const GROUNDS = [
  ['driveway_concrete', 'Concrete Driveway', 'driveway', FINISH, 90, 4, 4],
  ['sidewalk_pavers', 'Paved Sidewalk', 'sidewalk', STONE, 70, 4, 2],
  ['road_asphalt', 'Two-Lane Road', 'road', FINISH, 110, 4, 4],
  ['curb_stone', 'Stone Curb', 'curb', STONE, 45, 4, 0.5],
  ['parking_bays', 'Marked Parking Bays', 'parking', FINISH, 100, 4, 4],
];
addAll(GROUNDS, ([id, name, variant, colors, price, width, depth]) =>
  add({
    id,
    name,
    category: 'structure',
    subcategory: 'grounds',
    layer: 'rug',
    walkable: true,
    size: [width, depth],
    description: `${name} lay-in section for streets, lots and public space.`,
    model: { kind: 'ground', params: { variant, width, depth } },
    colors,
    price,
    placement: 'outdoor',
    themes: ['outdoor_entertainment'],
  })
);

const STREET = [
  ['streetlight_lamp', 'City Streetlight', 'streetlight', 180],
  ['traffic_light', 'Traffic Signal', 'traffic_light', 260],
  ['street_sign', 'Street Name Sign', 'street_sign', 90],
  ['bus_stop_shelter', 'Bus Stop Shelter', 'bus_stop', 420],
];
addAll(STREET, ([id, name, variant, price]) =>
  add({
    id,
    name,
    category: 'structure',
    subcategory: 'grounds',
    size: variant === 'bus_stop' ? [3.4, 1.8] : [1, 1],
    description: `${name} for public streets and venue entrances.`,
    model: { kind: 'street_furniture', params: { variant } },
    colors: METAL,
    price,
    placement: 'outdoor',
    interactive: variant === 'streetlight',
    themes: ['outdoor_entertainment'],
  })
);

/* ───────────────────────── Residential additions ───────────────────────── */

add({
  id: 'kitchen_sink',
  name: 'Undermount Kitchen Sink',
  category: 'kitchen',
  subcategory: 'kitchen',
  size: [1, 1],
  description: 'Stainless undermount sink with gooseneck tap and cabinet base.',
  model: { kind: 'kitchen_detail', params: { variant: 'sink' } },
  colors: STONE,
  price: 180,
  interactive: true,
});
add({
  id: 'range_hood',
  name: 'Canopy Range Hood',
  category: 'kitchen',
  subcategory: 'kitchen',
  size: [1, 1],
  description: 'Stainless canopy hood with baffle filters and task light.',
  model: { kind: 'kitchen_detail', params: { variant: 'hood' } },
  colors: METAL,
  price: 260,
  interactive: true,
});
add({
  id: 'dishwasher',
  name: 'Integrated Dishwasher',
  category: 'kitchen',
  subcategory: 'kitchen',
  size: [1, 1],
  description: 'Panel-ready dishwasher with a status light.',
  model: { kind: 'kitchen_detail', params: { variant: 'dishwasher' } },
  colors: METAL,
  price: 300,
  interactive: true,
});
add({
  id: 'espresso_machine',
  name: 'Espresso Machine',
  category: 'commercial',
  subcategory: 'cafe',
  size: [1, 1],
  description: 'Two-group espresso machine with portafilter and cup rail.',
  model: { kind: 'kitchen_detail', params: { variant: 'coffee_machine' } },
  colors: METAL,
  price: 340,
  interactive: true,
  themes: ['coffee_shop'],
});
add({
  id: 'toilet_modern',
  name: 'Modern Toilet',
  category: 'bathroom',
  subcategory: 'bathroom',
  size: [1, 1],
  description: 'Wall-hung toilet with soft-close seat and flush plate.',
  model: { kind: 'bathroom_fixture', params: { variant: 'toilet' } },
  colors: STONE,
  price: 220,
});
add({
  id: 'pedestal_sink',
  name: 'Pedestal Bathroom Sink',
  category: 'bathroom',
  subcategory: 'bathroom',
  size: [1, 1],
  description: 'Pedestal basin with mixer tap for bathrooms and powder rooms.',
  model: { kind: 'bathroom_fixture', params: { variant: 'sink' } },
  colors: STONE,
  price: 150,
});
add({
  id: 'towel_rack',
  name: 'Heated Towel Rack',
  category: 'bathroom',
  subcategory: 'bathroom',
  layer: 'wall',
  wallHeight: 1.3,
  size: [1, 0.2],
  description: 'Wall-mounted towel rack with folded towels.',
  model: { kind: 'bathroom_fixture', params: { variant: 'towel_rack' } },
  colors: METAL,
  price: 90,
});
add({
  id: 'walk_in_closet',
  name: 'Walk-In Closet System',
  category: 'bedroom',
  subcategory: 'bedroom',
  size: [2, 1],
  description: 'Open closet with hanging rail, folded stacks and shoe shelves.',
  model: { kind: 'closet', params: { width: 2.2 } },
  colors: WOOD,
  price: 420,
  interactive: true,
  themes: ['luxury_home'],
});
add({
  id: 'washer',
  name: 'Front-Load Washer',
  category: 'living',
  subcategory: 'laundry',
  size: [1, 1],
  description: 'Front-load washing machine with a chrome door and control panel.',
  model: { kind: 'laundry', params: { variant: 'washer' } },
  colors: METAL,
  price: 280,
  interactive: true,
});
add({
  id: 'dryer',
  name: 'Front-Load Dryer',
  category: 'living',
  subcategory: 'laundry',
  size: [1, 1],
  description: 'Matching front-load dryer for laundry rooms.',
  model: { kind: 'laundry', params: { variant: 'dryer' } },
  colors: FINISH,
  price: 270,
  interactive: true,
});
add({
  id: 'printer_office',
  name: 'Office Laser Printer',
  category: 'office',
  subcategory: 'workspace',
  size: [1, 1],
  description: 'Floor-standing laser printer with output tray and status screen.',
  model: { kind: 'office_machine', params: { variant: 'printer' } },
  colors: FINISH,
  price: 240,
  interactive: true,
  themes: ['corporate_office'],
});
add({
  id: 'gaming_pc',
  name: 'Gaming PC Tower',
  category: 'office',
  subcategory: 'workspace',
  size: [1, 1],
  description: 'Glass-panel gaming tower with lit fans and a display strip.',
  model: { kind: 'office_machine', params: { variant: 'pc' } },
  colors: NEON,
  price: 320,
  interactive: true,
});
add({
  id: 'games_console',
  name: 'Game Console Set',
  category: 'living',
  subcategory: 'living',
  size: [1, 1],
  description: 'Console with two controllers and a charging dock.',
  model: { kind: 'office_machine', params: { variant: 'console' } },
  colors: [{ label: 'Chalk', hex: '#efeae1' }, { label: 'Graphite', hex: '#2d3036' }, { label: 'Electric Green', hex: '#39ff14' }],
  price: 220,
  interactive: true,
});

/* ─────────────────────────── Commercial: restaurant ─────────────────────── */

add({
  id: 'restaurant_table',
  name: 'Restaurant Dining Table',
  category: 'commercial',
  subcategory: 'restaurant',
  size: [2, 1],
  description: 'Two-top restaurant table with stone top and sturdy legs.',
  model: { kind: 'dining_table', params: { variant: 'restaurant', width: 1.4, depth: 0.9 } },
  colors: WOOD,
  price: 240,
  sittable: true,
  seatOffset: [0, 0.46, 0.55],
  seatApproach: [0, 1.2],
  themes: ['restaurant'],
});
add({
  id: 'restaurant_booth',
  name: 'Restaurant Booth',
  category: 'commercial',
  subcategory: 'restaurant',
  size: [2, 1],
  description: 'Padded booth bench with a high back and stitched cushions.',
  model: { kind: 'booth_seating', params: { variant: 'restaurant', width: 2.2, depth: 0.8 } },
  colors: FABRIC,
  price: 380,
  sittable: true,
  seatOffset: [0, 0.46, 0],
  seatApproach: [0, 1.1],
  themes: ['restaurant', 'sports_bar'],
});
add({
  id: 'host_station',
  name: 'Host Station',
  category: 'commercial',
  subcategory: 'restaurant',
  size: [1, 1],
  description: 'Compact host stand with a menu ledge and reservation tablet.',
  model: { kind: 'counter', params: { variant: 'host', width: 1, depth: 0.55 } },
  colors: WOOD,
  price: 260,
});
add({
  id: 'prep_counter',
  name: 'Stainless Prep Counter',
  category: 'commercial',
  subcategory: 'restaurant',
  size: [2, 1],
  description: 'Commercial prep counter with a raised shelf and cutting board.',
  model: { kind: 'counter', params: { variant: 'prep', width: 2, depth: 0.7 } },
  colors: METAL,
  price: 320,
});
const FRIDGES = [
  ['fridge_display', 'Refrigerated Display Case', 'display', 1.4, 420],
  ['fridge_reach_in', 'Reach-In Commercial Fridge', 'reach_in', 1.8, 520],
  ['freezer_chest', 'Commercial Chest Freezer', 'freezer', 1.2, 460],
];
addAll(FRIDGES, ([id, name, variant, width, price]) =>
  add({
    id,
    name,
    category: 'commercial',
    subcategory: 'restaurant',
    size: [width, 0.8],
    description: `${name} with lit shelves and stainless body.`,
    model: { kind: 'commercial_fridge', params: { variant, width } },
    colors: METAL,
    price,
    interactive: true,
  })
);
const COOKING = [
  ['grill_station', 'Commercial Grill Station', 'grill', 620],
  ['pizza_oven', 'Stone Pizza Oven', 'pizza', 720],
  ['commercial_oven', 'Commercial Range Oven', 'oven', 580],
  ['commercial_hood', 'Commercial Extraction Hood', 'hood', 460],
];
addAll(COOKING, ([id, name, variant, price]) =>
  add({
    id,
    name,
    category: 'commercial',
    subcategory: 'restaurant',
    size: [2, 1],
    description: `${name} built for restaurant kitchens.`,
    model: { kind: 'cooking_line', params: { variant } },
    colors: METAL,
    price,
    interactive: true,
    themes: ['restaurant'],
  })
);
add({
  id: 'menu_board',
  name: 'Menu Display Stand',
  category: 'commercial',
  subcategory: 'restaurant',
  size: [1, 1],
  description: 'Table menu stand with a printed card and weighted base.',
  model: { kind: 'dining_table', params: { variant: 'menu', width: 0.8, depth: 0.5 } },
  colors: WOOD,
  price: 70,
});
add({
  id: 'buffet_table',
  name: 'Buffet Service Table',
  category: 'events',
  subcategory: 'banquet',
  size: [3, 1],
  description: 'Long buffet table with chafing dishes and a stone top.',
  model: { kind: 'counter', params: { variant: 'buffet', width: 2.8, depth: 0.8 } },
  colors: WOOD,
  price: 520,
  themes: ['wedding_venue', 'hotel'],
});
add({
  id: 'pastry_display',
  name: 'Pastry Display Case',
  category: 'commercial',
  subcategory: 'cafe',
  size: [1, 1],
  description: 'Glass pastry case on a timber plinth with warm lighting.',
  model: { kind: 'display_case', params: { variant: 'pastry', width: 1.2 } },
  colors: WOOD,
  price: 380,
  themes: ['coffee_shop'],
});

/* ───────────────────────────── Commercial: bar ──────────────────────────── */

add({
  id: 'bar_counter',
  name: 'Modular Bar Counter',
  category: 'commercial',
  subcategory: 'bar',
  size: [3, 1],
  description: 'Bar counter with stone top, panelled front, foot rail and beer taps.',
  model: { kind: 'counter', params: { variant: 'bar', width: 3, depth: 0.65 } },
  colors: WOOD,
  price: 620,
  themes: ['sports_bar', 'nightclub'],
});
add({
  id: 'back_bar_shelving',
  name: 'Back-Bar Bottle Shelving',
  category: 'commercial',
  subcategory: 'bar',
  size: [2, 1],
  description: 'Back-bar unit with four lit shelves of bottles and glassware.',
  model: { kind: 'shelving_unit', params: { variant: 'back_bar', width: 1.8, height: 2.1 } },
  colors: WOOD,
  price: 460,
  interactive: true,
  themes: ['sports_bar', 'nightclub'],
});
add({
  id: 'bottle_display',
  name: 'Bottle Display Cabinet',
  category: 'commercial',
  subcategory: 'bar',
  size: [1, 1],
  description: 'Locked display cabinet for premium bottles, lit from below.',
  model: { kind: 'display_case', params: { variant: 'bottle', width: 1.4 } },
  colors: WOOD,
  price: 420,
  interactive: true,
});
add({
  id: 'high_top_table',
  name: 'High-Top Cocktail Table',
  category: 'commercial',
  subcategory: 'bar',
  size: [1, 1],
  description: 'Bar-height cocktail table with a stone top and weighted base.',
  model: { kind: 'dining_table', params: { variant: 'cocktail', width: 0.8, depth: 0.8 } },
  colors: STONE,
  price: 190,
});
add({
  id: 'glassware_set',
  name: 'Glassware & Bottle Set',
  category: 'commercial',
  subcategory: 'bar',
  size: [1, 1],
  description: 'Tray of bar glasses and a bottle for table service.',
  model: { kind: 'bar_glassware', params: {} },
  colors: [{ label: 'Clear Glass', hex: '#dfeef3' }, { label: 'Smoked Glass', hex: '#8fa0a8' }, { label: 'Amber Glass', hex: '#c98b45' }],
  price: 80,
});
add({
  id: 'bottle_service_table',
  name: 'Bottle Service Table',
  category: 'commercial',
  subcategory: 'bar',
  size: [1, 1],
  description: 'VIP bottle-service table with ice bucket, bottle and sparkler.',
  model: { kind: 'dining_table', params: { variant: 'bottle', width: 0.8, depth: 0.8 } },
  colors: STONE,
  price: 320,
  interactive: true,
  themes: ['nightclub'],
});
add({
  id: 'bar_menu_stand',
  name: 'Bar Menu Stand',
  category: 'commercial',
  subcategory: 'bar',
  size: [1, 1],
  description: 'Freestanding drinks menu for bar tops and host stands.',
  model: { kind: 'dining_table', params: { variant: 'menu', width: 0.7, depth: 0.45 } },
  colors: PAINT,
  price: 65,
});

/* ──────────────────────────── Commercial: retail ────────────────────────── */

add({
  id: 'clothing_rack',
  name: 'Clothing Display Rack',
  category: 'commercial',
  subcategory: 'retail',
  size: [2, 1],
  description: 'Retail clothing rack with hanging garments and a shoe shelf.',
  model: { kind: 'shelving_unit', params: { variant: 'retail', width: 1.8, height: 1.9 } },
  colors: METAL,
  price: 320,
  themes: ['retail_store'],
});
add({
  id: 'retail_display_shelf',
  name: 'Retail Display Shelf',
  category: 'commercial',
  subcategory: 'retail',
  size: [1, 1],
  description: 'Stepped display shelf stocked with packaged goods.',
  model: { kind: 'shelving_unit', params: { variant: 'display', width: 1.4, height: 1.8 } },
  colors: WOOD,
  price: 280,
  themes: ['retail_store'],
});
add({
  id: 'checkout_counter',
  name: 'Checkout Counter',
  category: 'commercial',
  subcategory: 'retail',
  size: [2, 1],
  description: 'Point-of-sale counter with card terminal and receipt stand.',
  model: { kind: 'counter', params: { variant: 'checkout', width: 1.8, depth: 0.7 } },
  colors: WOOD,
  price: 380,
  interactive: true,
  themes: ['retail_store'],
});
add({
  id: 'mannequin_display',
  name: 'Full-Body Mannequin',
  category: 'commercial',
  subcategory: 'retail',
  size: [1, 1],
  description: 'Dressable mannequin on a weighted stand for window displays.',
  model: { kind: 'mannequin', params: {} },
  colors: [{ label: 'Ivory', hex: '#f0ebe1' }, { label: 'Matte Black', hex: '#2c2f35' }, { label: 'Blush', hex: '#dcb9b2' }],
  price: 240,
  themes: ['retail_store'],
});
add({
  id: 'shoe_display',
  name: 'Shoe Display Stand',
  category: 'commercial',
  subcategory: 'retail',
  size: [1, 1],
  description: 'Three-tier shoe stand with paired trainers.',
  model: { kind: 'shoe_display', params: {} },
  colors: WOOD,
  price: 220,
  themes: ['retail_store'],
});
add({
  id: 'fitting_room',
  name: 'Fitting Room',
  category: 'commercial',
  subcategory: 'retail',
  size: [1.4, 1.4],
  description: 'Fitting cubicle with curtain rail, drape and hooks.',
  model: { kind: 'fitting_room', params: { width: 1.4, depth: 1.4 } },
  colors: FABRIC,
  price: 360,
  themes: ['retail_store'],
});
add({
  id: 'store_sign',
  name: 'Storefront Neon Sign',
  category: 'commercial',
  subcategory: 'retail',
  size: [1.6, 0.4],
  layer: 'wall',
  wallHeight: 2.3,
  description: 'Illuminated shop sign with a shaped neon wordmark.',
  model: { kind: 'neon_sign', params: { shape: 'word', width: 1.4 } },
  colors: NEON,
  price: 260,
  interactive: true,
  themes: ['retail_store', 'coffee_shop'],
});

/* ───────────────────────── Commercial: salon & hotel ────────────────────── */

add({
  id: 'salon_station',
  name: 'Salon Styling Station',
  category: 'commercial',
  subcategory: 'salon',
  size: [2, 1],
  description: 'Styling station with mirror, bulb lighting, tools and dryer.',
  model: { kind: 'salon_station', params: {} },
  colors: WOOD,
  price: 460,
  interactive: true,
});
add({
  id: 'salon_chair',
  name: 'Salon Styling Chair',
  category: 'commercial',
  subcategory: 'salon',
  size: [1, 1],
  description: 'Hydraulic styling chair with a padded back and footrest.',
  model: { kind: 'salon_chair', params: {} },
  colors: FABRIC,
  price: 260,
  sittable: true,
  seatOffset: [0, 0.6, 0],
  seatApproach: [0, 1],
});
add({
  id: 'reception_counter',
  name: 'Reception Counter',
  category: 'commercial',
  subcategory: 'hotel',
  size: [2, 1],
  description: 'Guest reception counter with a lit logo panel and terminal.',
  model: { kind: 'counter', params: { variant: 'reception', width: 2, depth: 0.65 } },
  colors: WOOD,
  price: 520,
  interactive: true,
  themes: ['hotel', 'corporate_office', 'salon'],
});
add({
  id: 'hotel_reception',
  name: 'Hotel Front Desk',
  category: 'commercial',
  subcategory: 'hotel',
  size: [3, 1],
  description: 'Long hotel front desk with key-card terminal and bell.',
  model: { kind: 'counter', params: { variant: 'hotel', width: 2.8, depth: 0.7 } },
  colors: STONE,
  price: 720,
  interactive: true,
  themes: ['hotel'],
});
add({
  id: 'luggage_cart',
  name: 'Hotel Luggage Cart',
  category: 'commercial',
  subcategory: 'hotel',
  size: [1, 1],
  description: 'Brass luggage trolley stacked with cases.',
  model: { kind: 'luggage_cart', params: {} },
  colors: [{ label: 'Brass', hex: '#c9a65a' }, { label: 'Steel', hex: '#b8bec7' }, { label: 'Black', hex: '#262930' }],
  price: 280,
  themes: ['hotel'],
});
add({
  id: 'waiting_sofa',
  name: 'Waiting Area Sofa',
  category: 'commercial',
  subcategory: 'hotel',
  size: [2, 1],
  description: 'Compact waiting sofa with a side ledge for forms.',
  model: { kind: 'wait_area', params: { width: 1.8 } },
  colors: FABRIC,
  price: 300,
  sittable: true,
  seatOffset: [0, 0.48, 0],
  seatApproach: [0, 1.2],
});

/* ──────────────────── Commercial: office, gym, library ──────────────────── */

add({
  id: 'conference_table',
  name: 'Conference Table',
  category: 'commercial',
  subcategory: 'workspace',
  size: [3, 1],
  description: 'Boardroom table with laptops, screens and cable ports.',
  model: { kind: 'dining_table', params: { variant: 'conference', width: 2.8, depth: 1.1 } },
  colors: WOOD,
  price: 640,
  themes: ['corporate_office'],
});
add({
  id: 'presentation_podium',
  name: 'Presentation Podium',
  category: 'events',
  subcategory: 'banquet',
  size: [1, 1],
  description: 'Curved podium with microphone and presentation light.',
  model: { kind: 'podium', params: {} },
  colors: WOOD,
  price: 300,
  interactive: true,
  themes: ['corporate_office', 'wedding_venue'],
});
add({
  id: 'gym_rack',
  name: 'Power Rack',
  category: 'commercial',
  subcategory: 'gym',
  size: [1, 1],
  description: 'Steel power rack with barbell, plates and pull-up bar.',
  model: { kind: 'gym_equipment', params: { variant: 'rack' } },
  colors: METAL,
  price: 560,
});
add({
  id: 'gym_treadmill',
  name: 'Commercial Treadmill',
  category: 'commercial',
  subcategory: 'gym',
  size: [1, 1],
  description: 'Treadmill with running belt, console and handrails.',
  model: { kind: 'gym_equipment', params: { variant: 'treadmill' } },
  colors: METAL,
  price: 720,
  interactive: true,
});
add({
  id: 'gym_bench',
  name: 'Weight Bench',
  category: 'commercial',
  subcategory: 'gym',
  size: [1, 1],
  description: 'Flat weight bench with barbell and plate pair.',
  model: { kind: 'gym_equipment', params: { variant: 'bench' } },
  colors: FABRIC,
  price: 300,
});
add({
  id: 'library_shelving',
  name: 'Library Shelving',
  category: 'commercial',
  subcategory: 'library',
  size: [2, 1],
  description: 'Tall bookcase packed with colour-coded books.',
  model: { kind: 'shelving_unit', params: { variant: 'library', width: 1.8, height: 2.4 } },
  colors: WOOD,
  price: 380,
  themes: ['library'],
});
add({
  id: 'art_plinth',
  name: 'Gallery Art Plinth',
  category: 'commercial',
  subcategory: 'library',
  size: [1, 1],
  description: 'Museum plinth with a bronze abstract on top.',
  model: { kind: 'art_plinth', params: { variant: 'sculpture' } },
  colors: STONE,
  price: 200,
  themes: ['library'],
});
add({
  id: 'medical_bed',
  name: 'Examination Bed',
  category: 'commercial',
  subcategory: 'medical',
  size: [1, 2],
  description: 'Adjustable examination bed with paper roll and steel frame.',
  model: { kind: 'medical_bed', params: {} },
  colors: STONE,
  price: 520,
  themes: ['medical'],
});
add({
  id: 'warehouse_shelving',
  name: 'Warehouse Pallet Shelving',
  category: 'commercial',
  subcategory: 'warehouse',
  size: [2, 1],
  description: 'Heavy-duty pallet racking loaded with cartons.',
  model: { kind: 'shelving_unit', params: { variant: 'warehouse', width: 2.4, height: 2.6 } },
  colors: METAL,
  price: 420,
  themes: ['warehouse'],
});

/* ────────────────────────────── Nightlife: DJ ───────────────────────────── */

add({
  id: 'dj_booth',
  name: 'Club DJ Booth',
  category: 'nightlife',
  subcategory: 'dj',
  size: [3, 1],
  description: 'Lit DJ booth with LED front, monitor screen and cable tidy.',
  model: { kind: 'dj_booth', params: { variant: 'booth', width: 2.6 } },
  colors: NEON,
  price: 760,
  interactive: true,
  themes: ['nightclub', 'concert_venue'],
});
add({
  id: 'dj_deck',
  name: 'DJ Deck & Mixer',
  category: 'nightlife',
  subcategory: 'dj',
  size: [2, 1],
  description: 'Two turntables, a four-channel mixer and headphone hooks on a road case.',
  model: { kind: 'dj_booth', params: { variant: 'deck', width: 1.8 } },
  colors: NEON,
  price: 620,
  interactive: true,
  themes: ['nightclub'],
});
add({
  id: 'speaker_stack',
  name: 'Line Array Speaker Stack',
  category: 'nightlife',
  subcategory: 'dj',
  size: [1, 1],
  description: 'Stacked PA cabinets with drivers and a top box.',
  model: { kind: 'speaker', params: { variant: 'stack' } },
  colors: METAL,
  price: 480,
  interactive: true,
  themes: ['concert_venue', 'nightclub'],
});
add({
  id: 'subwoofer',
  name: 'Club Subwoofer',
  category: 'nightlife',
  subcategory: 'dj',
  size: [1, 1],
  description: 'Floor sub with a large driver and steel grille.',
  model: { kind: 'speaker', params: { variant: 'sub' } },
  colors: METAL,
  price: 380,
  interactive: true,
});
add({
  id: 'monitor_speaker',
  name: 'Stage Monitor Wedge',
  category: 'nightlife',
  subcategory: 'dj',
  size: [1, 1],
  description: 'Angled stage monitor for performers.',
  model: { kind: 'speaker', params: { variant: 'monitor' } },
  colors: METAL,
  price: 260,
});
add({
  id: 'microphone_stand',
  name: 'Microphone & Stand',
  category: 'nightlife',
  subcategory: 'dj',
  size: [1, 1],
  description: 'Tripod boom stand with a dynamic microphone.',
  model: { kind: 'mic_stand', params: { height: 1.55 } },
  colors: METAL,
  price: 110,
  themes: ['concert_venue'],
});
add({
  id: 'dance_floor_led',
  name: 'LED Club Dance Floor',
  category: 'nightlife',
  subcategory: 'dj',
  size: [4, 4],
  layer: 'rug',
  walkable: true,
  description: 'Twelve-tile illuminated dance floor in a 4×4 m section.',
  model: { kind: 'floor_slab', params: { variant: 'dance', width: 4, depth: 4 } },
  colors: NEON,
  price: 880,
  interactive: true,
  themes: ['nightclub', 'concert_venue'],
});

/* ────────────────────────── Nightlife: lighting & stage ─────────────────── */

const STAGE_LIGHTS = [
  ['moving_head_light', 'Moving-Head Light', 'moving_head', 320],
  ['stage_spotlight', 'Stage Spotlight', 'spotlight', 240],
  ['led_light_bar', 'LED Light Bar', 'led_bar', 220],
  ['laser_fixture', 'Laser Effect Fixture', 'laser', 380],
];
addAll(STAGE_LIGHTS, ([id, name, variant, price]) =>
  add({
    id,
    name,
    category: 'nightlife',
    subcategory: 'lighting',
    size: [1, 1],
    description: `${name} with a real yoke/fixture body and a lit lens.`,
    model: { kind: 'stage_light', params: { variant } },
    colors: NEON,
    price,
    interactive: true,
    themes: ['nightclub', 'concert_venue'],
  })
);
add({
  id: 'lighting_truss',
  name: 'Lighting Truss',
  category: 'nightlife',
  subcategory: 'lighting',
  size: [4, 1],
  description: 'Ground-supported 4 m truss with four mounted fixtures.',
  model: { kind: 'light_truss', params: { length: 4, tall: 1 } },
  colors: METAL,
  price: 640,
  interactive: true,
  themes: ['concert_venue'],
});
add({
  id: 'stage_platform',
  name: 'Performance Stage',
  category: 'nightlife',
  subcategory: 'stage',
  size: [4, 3],
  description: 'Raised performance stage with LED edge lighting and skirt.',
  model: { kind: 'platform', params: { variant: 'stage', width: 4, depth: 3, height: 0.5 } },
  colors: FINISH,
  price: 720,
  interactive: true,
  themes: ['concert_venue', 'wedding_venue'],
});
add({
  id: 'led_video_wall',
  name: 'LED Video Wall',
  category: 'nightlife',
  subcategory: 'stage',
  size: [3, 1],
  description: 'Tiled LED wall with animated colour blocks and steel frame.',
  model: { kind: 'screen_fixture', params: { variant: 'led_wall', width: 3.2, height: 1.9 } },
  colors: NEON,
  price: 940,
  interactive: true,
  themes: ['nightclub', 'concert_venue'],
});
add({
  id: 'projection_screen',
  name: 'Projection Screen',
  category: 'nightlife',
  subcategory: 'stage',
  size: [3, 1],
  description: 'Pull-down projection screen with tension frame.',
  model: { kind: 'screen_fixture', params: { variant: 'projection', width: 2.6, height: 1.5 } },
  colors: FINISH,
  price: 420,
  interactive: true,
  themes: ['concert_venue', 'sports_bar'],
});
add({
  id: 'backstage_vanity',
  name: 'Backstage Vanity',
  category: 'nightlife',
  subcategory: 'stage',
  size: [2, 1],
  description: 'Backstage mirror station with bulbs, towels and makeup trays.',
  model: { kind: 'salon_station', params: {} },
  colors: WOOD,
  price: 380,
  themes: ['concert_venue'],
});

/* ───────────────────────── Nightlife: club seating & entry ──────────────── */

add({
  id: 'vip_booth',
  name: 'VIP Booth',
  category: 'nightlife',
  subcategory: 'club_seating',
  size: [2, 1],
  description: 'Padded VIP banquette with lit plinth and side table.',
  model: { kind: 'booth_seating', params: { variant: 'vip', width: 2.2, depth: 0.9 } },
  colors: FABRIC,
  price: 560,
  sittable: true,
  seatOffset: [0, 0.5, 0],
  seatApproach: [0, 1.1],
  themes: ['nightclub'],
});
add({
  id: 'club_lounge_chair',
  name: 'Club Lounge Chair',
  category: 'nightlife',
  subcategory: 'club_seating',
  size: [1, 1],
  description: 'Tub lounge chair on a swivel base.',
  model: { kind: 'booth_seating', params: { variant: 'club' } },
  colors: FABRIC,
  price: 240,
  sittable: true,
  seatOffset: [0, 0.55, 0],
  seatApproach: [0, 1],
});
add({
  id: 'club_cocktail_table',
  name: 'Club Cocktail Table',
  category: 'nightlife',
  subcategory: 'club_seating',
  size: [1, 1],
  description: 'Small high table with a chrome stem for standing drinks.',
  model: { kind: 'dining_table', params: { variant: 'cocktail', width: 0.75, depth: 0.75 } },
  colors: STONE,
  price: 180,
});
add({
  id: 'coat_check',
  name: 'Coat Check Counter',
  category: 'nightlife',
  subcategory: 'entry',
  size: [2, 1],
  description: 'Coat check with numbered rail, hangers and jackets.',
  model: { kind: 'coat_check', params: { width: 1.6 } },
  colors: WOOD,
  price: 320,
  themes: ['nightclub', 'concert_venue'],
});
add({
  id: 'security_desk',
  name: 'Security & Entry Desk',
  category: 'nightlife',
  subcategory: 'entry',
  size: [2, 1],
  description: 'Compact security desk with monitor, scanner and phone.',
  model: { kind: 'counter', params: { variant: 'checkout', width: 1.6, depth: 0.6 } },
  colors: FINISH,
  price: 340,
  interactive: true,
  themes: ['nightclub'],
});
add({
  id: 'entry_ticket_counter',
  name: 'Ticket Counter',
  category: 'events',
  subcategory: 'ticketing',
  size: [2, 1],
  description: 'Ticket window with glass screen and queue ledge.',
  model: { kind: 'counter', params: { variant: 'ticket', width: 1.8, depth: 0.6 } },
  colors: WOOD,
  price: 360,
  interactive: true,
  themes: ['concert_venue'],
});

/* ──────────────────────────── Specialty: hookah ─────────────────────────── */

add({
  id: 'hookah_deluxe',
  name: 'Deluxe Hookah',
  category: 'specialty',
  subcategory: 'hookah',
  size: [1, 1],
  description: 'Full hookah with glass vase, brass stem, clay bowl, tray and three hoses.',
  model: { kind: 'hookah', params: {} },
  colors: [
    { label: 'Brass & Teal', hex: '#4f9aa3' },
    { label: 'Brass & Rose', hex: '#b9768a' },
    { label: 'Brass & Amber', hex: '#c58a45' },
    { label: 'Gunmetal & Smoke', hex: '#4c545e' },
  ],
  price: 240,
  interactive: true,
  themes: ['hookah_lounge'],
  styles: ['contemporary', 'traditional'],
});
add({
  id: 'hookah_lounge_sofa',
  name: 'Hookah Lounge Sofa',
  category: 'specialty',
  subcategory: 'hookah',
  size: [2, 1],
  description: 'Low deep sofa with bolster cushions for lounge floor seating.',
  model: { kind: 'booth_seating', params: { variant: 'hookah', width: 2.2, depth: 0.9 } },
  colors: FABRIC,
  price: 440,
  sittable: true,
  seatOffset: [0, 0.48, 0],
  seatApproach: [0, 1.15],
  themes: ['hookah_lounge'],
});
add({
  id: 'hookah_table',
  name: 'Hookah Lounge Table',
  category: 'specialty',
  subcategory: 'hookah',
  size: [1, 1],
  description: 'Low table with a hookah ring, tray recess and cup holders.',
  model: { kind: 'dining_table', params: { variant: 'hookah', width: 0.9, depth: 0.9 } },
  colors: WOOD,
  price: 220,
  themes: ['hookah_lounge'],
});
add({
  id: 'privacy_partition',
  name: 'Lounge Privacy Partition',
  category: 'specialty',
  subcategory: 'hookah',
  size: [1.8, 0.2],
  description: 'Freestanding woven privacy screen for booths and cabanas.',
  model: { kind: 'portable_partition', params: { width: 1.8 } },
  colors: FABRIC,
  price: 190,
  themes: ['hookah_lounge', 'wedding_venue'],
});
add({
  id: 'hookah_display',
  name: 'Hookah Display Stand',
  category: 'specialty',
  subcategory: 'hookah',
  size: [2, 1],
  description: 'Illuminated display of hookahs, bowls and flavours.',
  model: { kind: 'shelving_unit', params: { variant: 'display', width: 1.6, height: 1.8 } },
  colors: WOOD,
  price: 420,
  interactive: true,
  themes: ['hookah_lounge'],
});
add({
  id: 'lounge_reception',
  name: 'Lounge Reception Desk',
  category: 'specialty',
  subcategory: 'hookah',
  size: [2, 1],
  description: 'Reception counter with lit brand panel for lounge entry.',
  model: { kind: 'counter', params: { variant: 'reception', width: 1.8, depth: 0.6 } },
  colors: WOOD,
  price: 440,
  themes: ['hookah_lounge', 'cannabis_lounge'],
});

/* ─────────────────────────── Specialty: cannabis ────────────────────────── */

add({
  id: 'cannabis_display_case',
  name: 'Cannabis Display Case',
  category: 'specialty',
  subcategory: 'cannabis',
  size: [2, 1],
  description: 'Locked glass display case with lit shelves of labelled jars.',
  model: { kind: 'display_case', params: { variant: 'cannabis', width: 1.4 } },
  colors: WOOD,
  price: 480,
  interactive: true,
  themes: ['cannabis_lounge'],
});
add({
  id: 'product_jar_display',
  name: 'Product Jar Display',
  category: 'specialty',
  subcategory: 'cannabis',
  size: [2, 1],
  description: 'Stepped retail display holding sealed product jars.',
  model: { kind: 'shelving_unit', params: { variant: 'display', width: 1.4, height: 1.7 } },
  colors: WOOD,
  price: 320,
  interactive: true,
  themes: ['cannabis_lounge'],
});
add({
  id: 'cannabis_lounge_chair',
  name: 'Cannabis Lounge Chair',
  category: 'specialty',
  subcategory: 'cannabis',
  size: [1, 1],
  description: 'Deep lounge chair with a curved back for dispensary waiting areas.',
  model: { kind: 'booth_seating', params: { variant: 'club' } },
  colors: FABRIC,
  price: 260,
  sittable: true,
  seatOffset: [0, 0.55, 0],
  seatApproach: [0, 1],
  themes: ['cannabis_lounge'],
});
add({
  id: 'cannabis_storage_cabinet',
  name: 'Secure Storage Cabinet',
  category: 'specialty',
  subcategory: 'cannabis',
  size: [1, 1],
  description: 'Lockable storage cabinet with shelving and bundled inventory.',
  model: { kind: 'closet', params: { width: 1.2 } },
  colors: METAL,
  price: 340,
  themes: ['cannabis_lounge'],
});
add({
  id: 'cannabis_wall_art',
  name: 'Botanical Wall Art',
  category: 'specialty',
  subcategory: 'cannabis',
  size: [1.4, 0.2],
  layer: 'wall',
  wallHeight: 1.7,
  description: 'Triptych botanical print set for a calm lounge interior.',
  model: { kind: 'framed_art', params: { variant: 'triptych', width: 1.4, height: 0.6 } },
  colors: NATURE,
  price: 140,
  themes: ['cannabis_lounge', 'hookah_lounge'],
});
add({
  id: 'lounge_led_lighting',
  name: 'Mood LED Wall Strip',
  category: 'specialty',
  subcategory: 'cannabis',
  size: [2, 0.2],
  layer: 'wall',
  wallHeight: 2.2,
  description: 'Three-ribbon LED strip that washes a lounge wall in colour.',
  model: { kind: 'lighting_fixture', params: { variant: 'led_strip', length: 2 } },
  colors: NEON,
  price: 180,
  interactive: true,
  themes: ['cannabis_lounge', 'nightclub'],
});

/* ──────────────────────────────── Events ───────────────────────────────── */

add({
  id: 'banquet_table',
  name: 'Banquet Round Table',
  category: 'events',
  subcategory: 'banquet',
  size: [2, 2],
  description: 'Eight-seat banquet table dressed with linen, plates and candles.',
  model: { kind: 'dining_table', params: { variant: 'banquet', width: 1.8, depth: 1.8 } },
  colors: FABRIC,
  price: 380,
  themes: ['wedding_venue'],
});
add({
  id: 'folding_chair',
  name: 'Folding Event Chair',
  category: 'events',
  subcategory: 'banquet',
  size: [1, 1],
  description: 'Stackable folding chair for ceremonies and conferences.',
  model: { kind: 'event_seating', params: { variant: 'folding' } },
  colors: FINISH,
  price: 45,
  sittable: true,
  seatOffset: [0, 0.45, 0],
  seatApproach: [0, 0.8],
  themes: ['wedding_venue'],
});
add({
  id: 'wedding_arch',
  name: 'Floral Wedding Arch',
  category: 'events',
  subcategory: 'wedding',
  size: [2.4, 1],
  description: 'Timber arch dressed with flowers, foliage and an aisle runner.',
  model: { kind: 'wedding_arch', params: { width: 2.2 } },
  colors: [{ label: 'Blush Bloom', hex: '#e8c9c2' }, { label: 'Ivory Bloom', hex: '#f0e7d8' }, { label: 'Sage Bloom', hex: '#c5d3bd' }],
  price: 420,
  themes: ['wedding_venue'],
});
add({
  id: 'photo_backdrop',
  name: 'Photo Backdrop',
  category: 'events',
  subcategory: 'wedding',
  size: [2.6, 1],
  description: 'Three-panel fabric backdrop on a pipe frame for photos.',
  model: { kind: 'photo_backdrop', params: { width: 2.6, neon: true } },
  colors: NEON,
  price: 320,
  interactive: true,
  themes: ['wedding_venue', 'nightclub'],
});
add({
  id: 'portable_partition_event',
  name: 'Portable Event Partition',
  category: 'events',
  subcategory: 'banquet',
  size: [1.8, 0.2],
  description: 'Freestanding slatted partition to divide event spaces.',
  model: { kind: 'portable_partition', params: { width: 1.8 } },
  colors: FABRIC,
  price: 210,
});

/* ─────────────────────────────── Outdoor ───────────────────────────────── */

const TREES = [
  ['tree_oak', 'Oak Tree', 'oak', 260],
  ['tree_pine', 'Pine Tree', 'pine', 240],
  ['tree_palm', 'Palm Tree', 'palm', 300],
  ['tree_birch', 'Birch Tree', 'birch', 250],
  ['tree_cherry', 'Cherry Blossom Tree', 'cherry', 320],
];
addAll(TREES, ([id, name, variant, price]) =>
  add({
    id,
    name,
    category: 'outdoor',
    subcategory: 'landscaping',
    size: [2, 2],
    description: `${name} modelled with trunk, branching and layered canopy.`,
    model: { kind: 'tree', params: { variant, scale: 1 } },
    colors: NATURE,
    price,
    placement: 'outdoor',
    themes: ['garden_patio'],
  })
);
add({
  id: 'bush_shrub',
  name: 'Garden Shrub',
  category: 'outdoor',
  subcategory: 'landscaping',
  size: [1, 1],
  description: 'Rounded shrub cluster in a low planter ring.',
  model: { kind: 'bush', params: { variant: 'bush' } },
  colors: NATURE,
  price: 60,
  placement: 'outdoor',
});
add({
  id: 'flower_bed',
  name: 'Flower Bed',
  category: 'outdoor',
  subcategory: 'landscaping',
  size: [1, 1],
  description: 'Stone-edged flower bed with stems and mixed blooms.',
  model: { kind: 'bush', params: { variant: 'flower_bed' } },
  colors: [{ label: 'Mixed Bloom', hex: '#d85b6b' }, { label: 'White Bloom', hex: '#e8ece9' }, { label: 'Lavender', hex: '#9d86c4' }],
  price: 80,
  placement: 'outdoor',
  themes: ['garden_patio', 'wedding_venue'],
});
const PLANTERS = [
  ['planter_ceramic', 'Ceramic Planter', 'ceramic', 90],
  ['planter_long', 'Long Planter Box', 'long', 140],
  ['planter_raised', 'Raised Garden Bed', 'raised', 200],
];
addAll(PLANTERS, ([id, name, variant, price]) =>
  add({
    id,
    name,
    category: 'outdoor',
    subcategory: 'landscaping',
    size: [1, 1],
    description: `${name} with soil and mature planting.`,
    model: { kind: 'planter', params: { variant, height: 0.6 } },
    colors: [
      { label: 'Terracotta', hex: '#c46c4e' },
      { label: 'Chalk Ceramic', hex: '#ece7de' },
      { label: 'Slate', hex: '#4a525e' },
      { label: 'Cedar', hex: '#b5854f' },
    ],
    price,
    placement: 'both',
  })
);
add({
  id: 'garden_fountain',
  name: 'Tiered Garden Fountain',
  category: 'outdoor',
  subcategory: 'water',
  size: [2, 2],
  description: 'Stone fountain with three tiers and moving water surfaces.',
  model: { kind: 'water_feature', params: { variant: 'fountain' } },
  colors: STONE,
  price: 520,
  placement: 'outdoor',
  interactive: true,
  themes: ['garden_patio'],
});
add({
  id: 'swimming_pool',
  name: 'Swimming Pool',
  category: 'outdoor',
  subcategory: 'water',
  size: [4, 3],
  description: 'Rectangular pool with stone coping, water and return jets.',
  model: { kind: 'water_feature', params: { variant: 'pool', width: 4, depth: 2.6 } },
  colors: [{ label: 'Aqua', hex: '#64b6d2' }, { label: 'Lagoon', hex: '#4a9aa8' }, { label: 'Midnight', hex: '#2f5f74' }],
  price: 1200,
  placement: 'outdoor',
  themes: ['luxury_home', 'outdoor_entertainment'],
});
add({
  id: 'hot_tub',
  name: 'Cedar Hot Tub',
  category: 'outdoor',
  subcategory: 'water',
  size: [2, 2],
  description: 'Round cedar hot tub with water surface and steamy bubbles.',
  model: { kind: 'water_feature', params: { variant: 'hot_tub' } },
  colors: WOOD,
  price: 780,
  placement: 'outdoor',
  interactive: true,
  themes: ['luxury_home', 'outdoor_entertainment'],
});
add({
  id: 'gazebo_canopy',
  name: 'Garden Gazebo',
  category: 'outdoor',
  subcategory: 'structures',
  size: [3, 3],
  description: 'Octagonal gazebo with posts, railings and a shingled roof.',
  model: { kind: 'gazebo', params: { variant: 'gazebo', width: 3.2 } },
  colors: WOOD,
  price: 620,
  placement: 'outdoor',
  themes: ['garden_patio', 'wedding_venue'],
});
add({
  id: 'pergola_shade',
  name: 'Timber Pergola',
  category: 'outdoor',
  subcategory: 'structures',
  size: [3, 3],
  description: 'Open pergola with rafters, posts and climbing greenery.',
  model: { kind: 'gazebo', params: { variant: 'pergola', width: 3.2 } },
  colors: WOOD,
  price: 540,
  placement: 'outdoor',
  themes: ['garden_patio', 'outdoor_entertainment'],
});
add({
  id: 'patio_umbrella',
  name: 'Patio Umbrella',
  category: 'outdoor',
  subcategory: 'structures',
  size: [1, 1],
  description: 'Cantilever-free patio umbrella with eight ribs and weighted base.',
  model: { kind: 'umbrella', params: {} },
  colors: [
    { label: 'Cream Canvas', hex: '#e8ddc9' },
    { label: 'Forest Canvas', hex: '#3f6b56' },
    { label: 'Terracotta', hex: '#c0705a' },
  ],
  price: 190,
  placement: 'outdoor',
  themes: ['garden_patio'],
});
add({
  id: 'outdoor_kitchen',
  name: 'Outdoor Kitchen',
  category: 'outdoor',
  subcategory: 'structures',
  size: [2, 1],
  description: 'Stone outdoor kitchen with sink, grill recess and prep shelf.',
  model: { kind: 'outdoor_kitchen', params: { variant: 'kitchen' } },
  colors: STONE,
  price: 720,
  placement: 'outdoor',
  themes: ['outdoor_entertainment'],
});
add({
  id: 'bbq_grill',
  name: 'Backyard BBQ Grill',
  category: 'outdoor',
  subcategory: 'structures',
  size: [1, 1],
  description: 'Lidded charcoal grill with side shelf and wheels.',
  model: { kind: 'outdoor_kitchen', params: { variant: 'grill' } },
  colors: METAL,
  price: 280,
  placement: 'outdoor',
  interactive: true,
});
add({
  id: 'playground_set',
  name: 'Playground Set',
  category: 'outdoor',
  subcategory: 'structures',
  size: [3, 3],
  description: 'Play structure with slide, climbing wall and swing.',
  model: { kind: 'playground', params: {} },
  colors: [{ label: 'Primary', hex: '#d85b5b' }, { label: 'Sunshine', hex: '#e0b23c' }, { label: 'Ocean', hex: '#4b86c7' }],
  price: 640,
  placement: 'outdoor',
});
add({
  id: 'park_bench',
  name: 'Park Bench',
  category: 'outdoor',
  subcategory: 'street',
  size: [2, 1],
  description: 'Slatted park bench with steel frame and armrests.',
  model: { kind: 'public_bench', params: { variant: 'park' } },
  colors: WOOD,
  price: 170,
  placement: 'outdoor',
  sittable: true,
  seatOffset: [0, 0.46, 0],
  seatApproach: [0, 0.9],
});
add({
  id: 'garden_sculpture',
  name: 'Garden Sculpture',
  category: 'outdoor',
  subcategory: 'street',
  size: [1, 1],
  description: 'Abstract bronze sculpture on a stone plinth.',
  model: { kind: 'sculpture', params: { variant: 'abstract' } },
  colors: [{ label: 'Bronze', hex: '#8a6c46' }, { label: 'Blackened Steel', hex: '#3a3d42' }, { label: 'Patina', hex: '#5f8a76' }],
  price: 380,
  placement: 'outdoor',
  themes: ['garden_patio'],
});
add({
  id: 'stone_obelisk',
  name: 'Stone Obelisk',
  category: 'outdoor',
  subcategory: 'street',
  size: [1, 1],
  description: 'Tapered stone obelisk with a metal finial for plazas.',
  model: { kind: 'sculpture', params: { variant: 'obelisk' } },
  colors: STONE,
  price: 320,
  placement: 'outdoor',
  themes: ['outdoor_entertainment'],
});

/* ─────────────────────────────── Vehicles ──────────────────────────────── */

const CARS = [
  ['car_sedan', 'Sedan', 'sedan', 900, 'cars'],
  ['car_suv', 'SUV', 'suv', 1250, 'cars'],
  ['car_sports', 'Sports Car', 'sports', 1900, 'cars'],
  ['car_luxury', 'Luxury Saloon', 'luxury', 2100, 'cars'],
  ['car_taxi', 'City Taxi', 'taxi', 1100, 'cars'],
];
addAll(CARS, ([id, name, variant, price, subcategory]) =>
  add({
    id,
    name,
    category: 'vehicles',
    subcategory,
    size: variant === 'suv' ? [2, 5] : [2, 5],
    description: `${name} with body panels, glazing, wheels, lights and trim.`,
    model: { kind: 'car', params: { variant } },
    colors: CAR,
    price,
    placement: 'outdoor',
    interactive: true,
    themes: ['outdoor_entertainment'],
    styles: ['modern'],
  })
);
add({
  id: 'limousine',
  name: 'Stretch Limousine',
  category: 'vehicles',
  subcategory: 'cars',
  size: [2, 7],
  description: 'Extended luxury limousine for events and venue transfers.',
  model: { kind: 'car', params: { variant: 'limo' } },
  colors: CAR,
  price: 3200,
  placement: 'outdoor',
  interactive: true,
  themes: ['wedding_venue', 'hotel'],
});
const UTILITY = [
  ['van_cargo', 'Cargo Van', 'van', 1400, 5],
  ['delivery_van', 'Delivery Van', 'delivery', 1500, 5],
  ['city_bus', 'City Bus', 'bus', 4200, 7],
  ['service_truck', 'Service Truck', 'truck', 2800, 6],
];
addAll(UTILITY, ([id, name, variant, price, length]) =>
  add({
    id,
    name,
    category: 'vehicles',
    subcategory: 'commercial_vehicles',
    size: [2, length],
    description: `${name} with cab, cargo body, wheels and work lights.`,
    model: { kind: 'car', params: { variant } },
    colors: CAR,
    price,
    placement: 'outdoor',
    interactive: true,
    themes: ['outdoor_entertainment'],
  })
);
add({
  id: 'motorcycle_cruiser',
  name: 'Cruiser Motorcycle',
  category: 'vehicles',
  subcategory: 'two_wheelers',
  size: [1, 2],
  description: 'Motorcycle with tank, seat, forks, exhaust and spoked wheels.',
  model: { kind: 'two_wheeler', params: { variant: 'motorcycle' } },
  colors: CAR,
  price: 780,
  placement: 'outdoor',
  interactive: true,
});
add({
  id: 'bicycle_city',
  name: 'City Bicycle',
  category: 'vehicles',
  subcategory: 'two_wheelers',
  size: [1, 2],
  description: 'Step-through city bike with spoked wheels, basket and bell.',
  model: { kind: 'two_wheeler', params: { variant: 'bicycle' } },
  colors: [{ label: 'Cream', hex: '#e8e0d0' }, { label: 'Forest', hex: '#3f6b56' }, { label: 'Navy', hex: '#2f4560' }],
  price: 320,
  placement: 'outdoor',
});
add({
  id: 'scooter_urban',
  name: 'Urban Scooter',
  category: 'vehicles',
  subcategory: 'two_wheelers',
  size: [1, 1],
  description: 'Kick scooter with deck, stem, grips and wheels.',
  model: { kind: 'two_wheeler', params: { variant: 'scooter' } },
  colors: CAR,
  price: 260,
  placement: 'outdoor',
});

/* ───────────────────────────── Decor & lighting ─────────────────────────── */

const RUGS = [
  ['rug_woven', 'Woven Wool Rug', 'woven', 2.4, 1.8, 95],
  ['rug_round', 'Round Wool Rug', 'round', 2.2, 2.2, 110],
  ['rug_patterned', 'Patterned Kilim Rug', 'patterned', 2.6, 1.8, 130],
];
addAll(RUGS, ([id, name, variant, width, depth, price]) =>
  add({
    id,
    name,
    category: 'plants_rugs',
    subcategory: 'rugs',
    layer: 'rug',
    walkable: true,
    size: [width, depth],
    description: `${name} with woven border and fringed edges.`,
    model: { kind: 'rug', params: { variant, width, depth } },
    colors: [
      { label: 'Ivory Berber', hex: '#e7dfd1' },
      { label: 'Terracotta', hex: '#c47158' },
      { label: 'Sage', hex: '#88a18e' },
      { label: 'Indigo', hex: '#4b5f7e' },
    ],
    price,
    themes: ['modern_home', 'traditional_home'],
  })
);
const VASES = [
  ['vase_set_ceramic', 'Ceramic Vase Set', 'ceramic', 60],
  ['vase_set_glass', 'Glass Vase Set', 'glass', 75],
  ['vase_sculptural', 'Sculptural Vase', 'sculptural', 110],
  ['vase_single', 'Tall Stemmed Vase', 'single', 55],
];
addAll(VASES, ([id, name, variant, price]) =>
  add({
    id,
    name,
    category: 'decor',
    subcategory: 'vases',
    size: [1, 1],
    description: `${name} modelled with real thickness and stems where shown.`,
    model: { kind: variant === 'single' ? 'deco_vase' : 'vase_set', params: { variant } },
    colors: PAINT,
    price,
  })
);
add({
  id: 'book_stack',
  name: 'Stacked Coffee Table Books',
  category: 'decor',
  subcategory: 'vases',
  size: [1, 1],
  description: 'Seven hardback books with page blocks stacked on a table.',
  model: { kind: 'book_stack', params: { count: 7 } },
  colors: [{ label: 'Mixed Volumes', hex: '#8c3f35' }, { label: 'Neutral Set', hex: '#d6c7ad' }],
  price: 45,
});
const ART = [
  ['art_single', 'Framed Canvas', 'single', 1, 0.8, 0.6, 120],
  ['art_triptych', 'Triptych Wall Art', 'triptych', 3, 1.4, 0.6, 180],
];
addAll(ART, ([id, name, variant, frames, width, height, price]) =>
  add({
    id,
    name,
    category: 'wall',
    subcategory: 'art',
    layer: 'wall',
    wallHeight: 1.6,
    size: [width, 0.2],
    description: `${name} with a ${frames === 3 ? 'three-panel' : 'single'} frame and painted composition.`,
    model: { kind: 'framed_art', params: { variant, width, height } },
    colors: [
      { label: 'Sunset Abstract', hex: '#d87a56' },
      { label: 'Botanical Study', hex: '#6c8f77' },
      { label: 'Nordic Cobalt', hex: '#4e6f9c' },
      { label: 'Golden Ochre', hex: '#d4a34c' },
    ],
    price,
  })
);
const MIRRORS = [
  ['mirror_rect', 'Framed Wall Mirror', 'rect', 90],
  ['mirror_round', 'Round Wall Mirror', 'round', 100],
  ['mirror_arched', 'Arched Wall Mirror', 'arched', 140],
  ['mirror_full_length', 'Full-Length Mirror', 'full_length', 180],
];
addAll(MIRRORS, ([id, name, variant, price]) =>
  add({
    id,
    name,
    category: 'wall',
    subcategory: 'art',
    layer: 'wall',
    wallHeight: variant === 'full_length' ? 1.1 : 1.6,
    size: variant === 'full_length' ? [1, 0.2] : [1.2, 0.2],
    description: `${name} with a metal frame and reflective glass.`,
    model: { kind: 'mirror', params: { variant } },
    colors: METAL,
    price,
  })
);
add({
  id: 'wall_clock_round',
  name: 'Round Wall Clock',
  category: 'wall',
  subcategory: 'art',
  layer: 'wall',
  wallHeight: 2.1,
  size: [1, 0.15],
  description: 'Oversized round clock with hour markers and hands.',
  model: { kind: 'clock', params: { variant: 'round' } },
  colors: WOOD,
  price: 70,
});
add({
  id: 'digital_clock',
  name: 'Digital Wall Clock',
  category: 'wall',
  subcategory: 'electronics',
  layer: 'wall',
  wallHeight: 1.9,
  size: [1, 0.15],
  description: 'Slim digital clock with a lit display.',
  model: { kind: 'clock', params: { variant: 'digital' } },
  colors: NEON,
  price: 85,
  interactive: true,
});
add({
  id: 'plant_trio_set',
  name: 'Tabletop Plant Trio',
  category: 'plants_rugs',
  subcategory: 'plants',
  size: [1, 1],
  description: 'Three potted plants at staggered heights for shelves and tables.',
  model: { kind: 'plant_trio', params: {} },
  colors: [
    { label: 'Terracotta Set', hex: '#c46c4e' },
    { label: 'Chalk Set', hex: '#ece7de' },
    { label: 'Sage Set', hex: '#7b9984' },
  ],
  price: 60,
});
add({
  id: 'flat_screen_tv',
  name: 'Flat-Screen Television',
  category: 'living',
  subcategory: 'electronics',
  size: [2, 1],
  description: 'Media stand with a large flat-screen television and soundbar.',
  model: { kind: 'television', params: { variant: 'console', width: 1.6 } },
  colors: METAL,
  price: 420,
  interactive: true,
});
add({
  id: 'wall_mounted_tv',
  name: 'Wall-Mounted Television',
  category: 'living',
  subcategory: 'electronics',
  layer: 'wall',
  wallHeight: 1.7,
  size: [2, 0.2],
  description: 'Slim wall-mounted TV with a narrow bezel.',
  model: { kind: 'television', params: { variant: 'wall', width: 1.5 } },
  colors: METAL,
  price: 460,
  interactive: true,
});
add({
  id: 'desk_monitor',
  name: 'Desk Monitor on Arm',
  category: 'office',
  subcategory: 'electronics',
  size: [1, 1],
  description: 'Monitor on a gas-spring arm with a desk clamp.',
  model: { kind: 'television', params: { variant: 'monitor', width: 0.8 } },
  colors: METAL,
  price: 260,
  interactive: true,
});
add({
  id: 'bookshelf_speaker',
  name: 'Bookshelf Speaker',
  category: 'living',
  subcategory: 'electronics',
  size: [1, 1],
  description: 'Two-way bookshelf speaker with a fabric grille.',
  model: { kind: 'speaker_shelf', params: {} },
  colors: WOOD,
  price: 160,
  interactive: true,
});
const NEONS = [
  ['neon_word_sign', 'Neon Word Sign', 'word', 1.4, 220],
  ['neon_heart', 'Neon Heart Sign', 'heart', 0.7, 180],
  ['neon_house_number', 'Neon House Number', 'house_number', 0.5, 150],
];
addAll(NEONS, ([id, name, shape, width, price]) =>
  add({
    id,
    name,
    category: 'wall',
    subcategory: 'lighting',
    layer: 'wall',
    wallHeight: 2.0,
    size: [width, 0.2],
    description: `${name} with a lit gas-tube silhouette on a dark backing.`,
    model: { kind: 'neon_sign', params: { shape, width } },
    colors: NEON,
    price,
    interactive: true,
    themes: ['nightclub', 'retail_store'],
  })
);
add({
  id: 'smart_home_panel',
  name: 'Smart Home Panel',
  category: 'wall',
  subcategory: 'electronics',
  layer: 'wall',
  wallHeight: 1.4,
  size: [1, 0.15],
  description: 'Wall control panel with a lit screen and touch rows.',
  model: { kind: 'smart_panel', params: {} },
  colors: NEON,
  price: 120,
  interactive: true,
});
add({
  id: 'curtain_panels',
  name: 'Floor-Length Curtains',
  category: 'decor',
  subcategory: 'curtains',
  layer: 'wall',
  wallHeight: 2.55,
  size: [2.2, 0.3],
  description: 'Two gathered curtain panels on a metal rod with rings.',
  model: { kind: 'curtain_set', params: { width: 2.2, height: 2.4 } },
  colors: FABRIC,
  price: 120,
});
add({
  id: 'candle_set',
  name: 'Candle Centerpiece',
  category: 'decor',
  subcategory: 'vases',
  size: [1, 1],
  description: 'Three pillar candles on a stone tray with a small vase.',
  model: { kind: 'candle_set', params: {} },
  colors: [{ label: 'Ivory', hex: '#efe6d6' }, { label: 'Blush', hex: '#e3c7c2' }, { label: 'Sage', hex: '#cbd8c7' }],
  price: 55,
  interactive: true,
});
add({
  id: 'small_bronze',
  name: 'Bronze Table Sculpture',
  category: 'decor',
  subcategory: 'art',
  size: [1, 1],
  description: 'Small abstract bronze on a stone base.',
  model: { kind: 'small_sculpture', params: {} },
  colors: [{ label: 'Bronze', hex: '#8a6c46' }, { label: 'Blackened Steel', hex: '#3a3d42' }],
  price: 130,
});
const LAMPS = [
  ['lamp_globe', 'Globe Table Lamp', 'globe', 90],
  ['lamp_tripod', 'Tripod Table Lamp', 'tripod', 85],
  ['lamp_floor_tripod', 'Tripod Floor Lamp', 'floor_tripod', 150],
];
addAll(LAMPS, ([id, name, variant, price]) =>
  add({
    id,
    name,
    category: 'lighting',
    subcategory: 'lighting',
    size: [1, 1],
    description: `${name} with a lit shade and metal or wood base.`,
    model: { kind: 'desk_lamp_set', params: { variant } },
    colors: METAL,
    price,
    interactive: true,
  })
);
add({
  id: 'desk_accessories',
  name: 'Desk Accessory Set',
  category: 'office',
  subcategory: 'office',
  size: [1, 1],
  description: 'Desk tray with notebook, pens and a small plant pot.',
  model: { kind: 'desk_accessories', params: {} },
  colors: WOOD,
  price: 45,
});
const PENDANTS = [
  ['chandelier_brass', 'Brass Chandelier', 'chandelier', 420],
  ['pendant_dome', 'Dome Pendant Light', 'pendant', 160],
  ['wall_sconce', 'Wall Sconce', 'sconce', 110],
];
addAll(PENDANTS, ([id, name, variant, price]) =>
  add({
    id,
    name,
    category: 'lighting',
    subcategory: 'lighting',
    layer: variant === 'sconce' ? 'wall' : 'floor',
    wallHeight: variant === 'sconce' ? 1.8 : undefined,
    size: [1, 1],
    description: `${name} with real fixture geometry and warm bulbs.`,
    model: { kind: 'lighting_fixture', params: { variant } },
    colors: METAL,
    price,
    interactive: true,
    themes: ['luxury_home', 'hotel'],
  })
);
add({
  id: 'string_lights',
  name: 'Festoon String Lights',
  category: 'lighting',
  subcategory: 'lighting',
  layer: 'wall',
  wallHeight: 2.4,
  size: [2, 0.2],
  description: 'Nine warm bulbs on a draped cable for patios and courtyards.',
  model: { kind: 'lighting_fixture', params: { variant: 'led_strip', length: 2 } },
  colors: [{ label: 'Warm White', hex: '#ffcf8f' }, { label: 'Amber', hex: '#ffb15c' }, { label: 'Cool White', hex: '#dbe9ff' }],
  price: 130,
  interactive: true,
  placement: 'both',
  themes: ['garden_patio', 'outdoor_entertainment'],
});
add({
  id: 'recording_console',
  name: 'Recording Console',
  category: 'commercial',
  subcategory: 'workspace',
  size: [3, 1],
  description: 'Mixing console with fader banks, screen and seated producer desk.',
  model: { kind: 'recording_console', params: { width: 2.4 } },
  colors: WOOD,
  price: 980,
  interactive: true,
  themes: ['concert_venue'],
});
add({
  id: 'studio_mic',
  name: 'Studio Condenser Mic',
  category: 'commercial',
  subcategory: 'workspace',
  size: [1, 1],
  description: 'Condenser microphone on a shock mount and boom stand.',
  model: { kind: 'mic_stand', params: { height: 1.7 } },
  colors: METAL,
  price: 180,
  interactive: true,
  themes: ['concert_venue'],
});
add({
  id: 'camera_rig',
  name: 'Cinema Camera Rig',
  category: 'commercial',
  subcategory: 'workspace',
  size: [1, 1],
  description: 'Camera body with lens, top handle and monitor.',
  model: { kind: 'office_machine', params: { variant: 'camera' } },
  colors: METAL,
  price: 420,
  interactive: true,
});
add({
  id: 'studio_monitor_pair',
  name: 'Studio Monitor Pair',
  category: 'nightlife',
  subcategory: 'dj',
  size: [1, 1],
  description: 'Nearfield studio monitor on a foam isolation pad.',
  model: { kind: 'speaker', params: { variant: 'monitor' } },
  colors: METAL,
  price: 320,
  interactive: true,
});
add({
  id: 'hotel_bell_stand',
  name: 'Concierge Bell Stand',
  category: 'commercial',
  subcategory: 'hotel',
  size: [1, 1],
  description: 'Brass luggage stand with a service bell.',
  model: { kind: 'luggage_cart', params: {} },
  colors: [{ label: 'Brass', hex: '#c9a65a' }, { label: 'Steel', hex: '#b8bec7' }],
  price: 180,
});
add({
  id: 'backstage_mirror',
  name: 'Backstage Mirror Station',
  category: 'commercial',
  subcategory: 'salon',
  size: [2, 1],
  description: 'Bulb-lit mirror station with tools and a dryer.',
  model: { kind: 'salon_station', params: {} },
  colors: WOOD,
  price: 420,
  interactive: true,
});
add({
  id: 'gallery_spotlight',
  name: 'Gallery Spot Light',
  category: 'nightlife',
  subcategory: 'lighting',
  size: [1, 1],
  description: 'Track spotlight for highlighting artwork and displays.',
  model: { kind: 'stage_light', params: { variant: 'spotlight' } },
  colors: NEON,
  price: 190,
  interactive: true,
  themes: ['library', 'retail_store'],
});
add({
  id: 'waiting_bench',
  name: 'Clinic Waiting Bench',
  category: 'commercial',
  subcategory: 'medical',
  size: [2, 1],
  description: 'Padded waiting bench with a side ledge for forms.',
  model: { kind: 'wait_area', params: { width: 1.8 } },
  colors: FABRIC,
  price: 280,
  sittable: true,
  seatOffset: [0, 0.46, 0],
  seatApproach: [0, 1.1],
  themes: ['medical'],
});

export const EXPANSION_ITEMS = items;

/** Server-owned price table derived from the catalog, never hand-maintained. */
export const EXPANSION_PRICES = Object.freeze(
  Object.fromEntries(items.map((item) => [item.id, { price: item.price, currency: item.currency }]))
);

export const EXPANSION_BY_ID = Object.freeze(
  Object.fromEntries(items.map((item) => [item.id, item]))
);

export const CATALOG_CATEGORY_IDS = CATALOG_CATEGORIES.map((category) => category.id);

export function getExpansionItem(id) {
  return EXPANSION_BY_ID[id] ?? null;
}

export function itemsInCategory(categoryId) {
  return items.filter((item) => item.category === categoryId);
}

export function itemsInCollection(collectionId) {
  return items.filter((item) => Array.isArray(item.themes) && item.themes.includes(collectionId));
}

/** Validation used by tests and the preview pipeline. */
export function validateCatalogEntries() {
  const problems = [];
  const seen = new Set();
  const categoryIds = new Set(CATALOG_CATEGORY_IDS);
  for (const item of items) {
    const at = `item ${item.id}`;
    if (!item.id || typeof item.id !== 'string') problems.push('item with missing id');
    if (seen.has(item.id)) problems.push(`${at}: duplicate id`);
    seen.add(item.id);
    if (!item.name) problems.push(`${at}: missing name`);
    if (!item.description) problems.push(`${at}: missing description`);
    if (!categoryIds.has(item.category)) problems.push(`${at}: unknown category ${item.category}`);
    const declared = CATALOG_CATEGORIES.find((category) => category.id === item.category);
    if (declared && !declared.subcategories.some((sub) => sub.id === item.subcategory)) {
      problems.push(`${at}: unknown subcategory ${item.subcategory} for ${item.category}`);
    }
    if (!item.model || !item.model.kind) problems.push(`${at}: missing model kind`);
    if (!Array.isArray(item.size) || item.size.length !== 2 || item.size.some((n) => !(n > 0))) {
      problems.push(`${at}: invalid size`);
    }
    if (!Number.isInteger(item.price) || item.price <= 0) problems.push(`${at}: invalid price`);
    if (!['yuanzi', 'tongbao'].includes(item.currency)) problems.push(`${at}: invalid currency`);
    if (!Array.isArray(item.colors) || item.colors.length === 0) problems.push(`${at}: no colour variants`);
    if (!item.defaultColor) problems.push(`${at}: no default colour`);
    if (!['floor', 'rug', 'wall'].includes(item.layer)) problems.push(`${at}: invalid layer`);
    if (!['available', 'incomplete', 'retired'].includes(item.availability)) {
      problems.push(`${at}: invalid availability`);
    }
  }
  return problems;
}
