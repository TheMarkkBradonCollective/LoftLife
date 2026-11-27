import type { FurnitureCatalogItem } from './types';

/**
 * The second half of the furniture catalog.
 *
 * Kept separate so the original starter pieces stay byte-for-byte stable while
 * the catalog grows. Every id here has a builder in furnitureExtra.ts and a
 * server-owned price in server/economy.mjs.
 */

const FABRIC = [
  { label: 'Oat Bouclé', hex: '#e8e1d4' },
  { label: 'Forest Velvet', hex: '#3f6b56' },
  { label: 'Cognac Leather', hex: '#a66238' },
  { label: 'Slate Weave', hex: '#4a5b6e' },
  { label: 'Blush Linen', hex: '#d7a8a6' },
];
const WOOD = [
  { label: 'Natural Oak', hex: '#c89e6d' },
  { label: 'Smoked Walnut', hex: '#684730' },
  { label: 'Ash Blonde', hex: '#dfd0b8' },
  { label: 'Matte Ebony', hex: '#2e2d30' },
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
const PAINT = [
  { label: 'Chalk White', hex: '#efeae1' },
  { label: 'Sage', hex: '#7c9a82' },
  { label: 'Terracotta', hex: '#c86b51' },
  { label: 'Midnight', hex: '#39465c' },
  { label: 'Ochre', hex: '#d49a45' },
];
const LEAF = [
  { label: 'Terracotta Pot', hex: '#c46c4e' },
  { label: 'Chalk Ceramic', hex: '#ece7de' },
  { label: 'Slate Pot', hex: '#4a525e' },
  { label: 'Sage Glaze', hex: '#7b9984' },
];

type Extra = Partial<FurnitureCatalogItem>;

function floorItem(
  id: string,
  name: string,
  category: FurnitureCatalogItem['category'],
  size: [number, number],
  colors: { label: string; hex: string }[],
  extra: Extra = {}
): FurnitureCatalogItem {
  return {
    id,
    name,
    category,
    layer: 'floor',
    size,
    colors,
    defaultColor: colors[0].hex,
    ...extra,
  };
}

function wallItem(
  id: string,
  name: string,
  size: [number, number],
  height: number,
  colors: { label: string; hex: string }[],
  extra: Extra = {}
): FurnitureCatalogItem {
  return {
    id,
    name,
    category: 'wall',
    layer: 'wall',
    size,
    wallHeight: height,
    colors,
    defaultColor: colors[0].hex,
    ...extra,
  };
}

const seat = (y: number, z = 0.02): Extra => ({
  sittable: true,
  seatOffset: [0, y, z],
  seatApproach: [0, 0.95],
});

export const EXTRA_FURNITURE: FurnitureCatalogItem[] = [
  // ── Living room seating ──────────────────────────────────────────────────
  floorItem('loveseat', 'Linen Loveseat', 'seating', [2, 1], FABRIC, seat(0.44)),
  floorItem('armchair', 'Reading Armchair', 'seating', [1, 1], FABRIC, seat(0.44)),
  floorItem('chaise_lounge', 'Velvet Chaise', 'seating', [2, 1], FABRIC, seat(0.4, -0.1)),
  floorItem('ottoman', 'Bouclé Ottoman', 'seating', [1, 1], FABRIC, seat(0.4)),
  floorItem('dining_chair', 'Upholstered Dining Chair', 'seating', [1, 1], FABRIC, seat(0.47)),
  floorItem('office_chair', 'Ergonomic Office Chair', 'seating', [1, 1], METAL, seat(0.47)),
  floorItem('patio_loveseat', 'Teak Patio Loveseat', 'outdoor', [2, 1], FABRIC, seat(0.43)),
  floorItem('outdoor_lounge', 'Rope Outdoor Lounge', 'outdoor', [1, 1], FABRIC, seat(0.4)),

  // ── Bedroom ──────────────────────────────────────────────────────────────
  floorItem('king_bed', 'King Upholstered Bed', 'bedroom', [3, 2], FABRIC, {
    ...seat(0.55, 0.2),
    seatApproach: [0, 1.5],
  }),
  floorItem('twin_bed', 'Twin Guest Bed', 'bedroom', [2, 2], FABRIC, {
    ...seat(0.52, 0.15),
    seatApproach: [0, 1.4],
  }),
  floorItem('nightstand', 'Bedside Nightstand', 'bedroom', [1, 1], WOOD),
  floorItem('dresser', 'Six-Drawer Dresser', 'bedroom', [2, 1], WOOD),
  floorItem('wardrobe', 'Tall Wardrobe', 'bedroom', [2, 1], WOOD),
  floorItem('vanity_desk', 'Vanity & Stool', 'bedroom', [2, 1], PAINT, {
    ...seat(0.46, 0.1),
  }),
  floorItem('bedroom_bench', 'Upholstered Bed Bench', 'bedroom', [2, 1], FABRIC, seat(0.45)),

  // ── Kitchen & dining ─────────────────────────────────────────────────────
  floorItem('kitchen_island', 'Marble Kitchen Island', 'kitchen', [3, 1], STONE),
  floorItem('kitchen_cabinets', 'Shaker Cabinet Run', 'kitchen', [3, 1], PAINT),
  floorItem('fridge', 'French-Door Refrigerator', 'kitchen', [1, 1], METAL, {
    interactive: true,
  }),
  floorItem('oven_range', 'Professional Range', 'kitchen', [1, 1], METAL, {
    interactive: true,
  }),
  floorItem('microwave', 'Built-In Microwave', 'kitchen', [1, 1], METAL, {
    interactive: true,
  }),
  floorItem('dining_table', 'Round Dining Table', 'tables', [2, 2], WOOD),
  floorItem('dining_chair_wood', 'Oak Dining Chair', 'seating', [1, 1], WOOD, seat(0.47)),

  // ── Bathroom ─────────────────────────────────────────────────────────────
  floorItem('bathroom_vanity', 'Double Bathroom Vanity', 'bathroom', [2, 1], STONE),
  floorItem('bathtub', 'Freestanding Soaking Tub', 'bathroom', [2, 1], STONE),
  floorItem('shower_stall', 'Rain Shower Stall', 'bathroom', [1, 1], STONE),
  wallItem('bathroom_mirror', 'Backlit Bathroom Mirror', [1, 1], 1.55, METAL, {
    interactive: true,
  }),
  floorItem('linen_cabinet', 'Linen Storage Cabinet', 'bathroom', [1, 1], PAINT),

  // ── Office ───────────────────────────────────────────────────────────────
  floorItem('office_desk', 'Executive Office Desk', 'office', [2, 1], WOOD),
  floorItem('bookshelf_tall', 'Tall Library Bookcase', 'office', [1, 1], WOOD),
  floorItem('filing_cabinet', 'Two-Drawer File Cabinet', 'office', [1, 1], METAL),
  floorItem('computer_desk', 'Studio Workstation', 'office', [2, 1], WOOD, {
    interactive: true,
  }),

  // ── Outdoor ──────────────────────────────────────────────────────────────
  floorItem('patio_table', 'Round Patio Table', 'outdoor', [2, 2], WOOD),
  floorItem('garden_bench', 'Garden Bench', 'outdoor', [2, 1], WOOD, seat(0.45)),
  floorItem('planter_box', 'Cedar Planter Box', 'outdoor', [2, 1], WOOD),
  floorItem('fire_pit', 'Concrete Fire Pit', 'outdoor', [1, 1], STONE, {
    interactive: true,
  }),

  // ── Decor, lighting, rugs ────────────────────────────────────────────────
  floorItem('tv_wall', '75" Wall Television', 'living', [2, 1], METAL, {
    interactive: true,
  }),
  floorItem('floor_lamp', 'Sculptural Floor Lamp', 'lighting', [1, 1], METAL, {
    interactive: true,
  }),
  wallItem('wall_clock', 'Oversized Wall Clock', [1, 1], 2.05, WOOD),
  wallItem('curtains', 'Floor-Length Curtains', [2, 1], 2.35, FABRIC),
  floorItem('round_rug', 'Round Wool Rug', 'plants_rugs', [2, 2], FABRIC, {
    layer: 'rug',
    walkable: true,
  }),
  floorItem('decorative_vase', 'Ceramic Vase Set', 'decor', [1, 1], PAINT),
  wallItem('wall_mirror', 'Arched Wall Mirror', [1, 1], 1.75, METAL),
  floorItem('coffee_table_round', 'Round Coffee Table', 'tables', [2, 1], WOOD),
  floorItem('side_table', 'Tripod Side Table', 'tables', [1, 1], WOOD),
  floorItem('bar_cabinet', 'Walnut Bar Cabinet', 'living', [2, 1], WOOD, {
    interactive: true,
  }),
  floorItem('desk_lamp', 'Articulated Desk Lamp', 'lighting', [1, 1], METAL, {
    interactive: true,
  }),
  floorItem('plant_tall', 'Fiddle Leaf Fig', 'plants_rugs', [1, 1], LEAF),
  floorItem('plant_small', 'Tabletop Succulent', 'plants_rugs', [1, 1], LEAF),
  floorItem('tv_console', 'Media Console & TV', 'living', [2, 1], WOOD, {
    interactive: true,
  }),
  wallItem('wall_art_set', 'Triptych Wall Art', [2, 1], 1.95, PAINT),
];
