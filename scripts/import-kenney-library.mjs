#!/usr/bin/env node
/**
 * Import the relevant Kenney 3D kits into LoftLife.
 *
 * Source: https://github.com/shorepine/kenney (mirror of kenney.nl, CC0-1.0)
 *
 * The importer copies the selected kit GLBs and their relative textures into
 * public/models/kenney/<kit>/, parses every model for real bounds/materials,
 * classifies it into LoftLife's catalog taxonomy, and writes
 * shared/catalog/kenney-library.mjs — the single generated record the client,
 * server, preview renderer and tests all read.
 *
 * Usage:
 *   node scripts/import-kenney-library.mjs [--source=.cache/kenney]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseGlbFile, boundsSize } from '../shared/kenney/glb.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const sourceArg = process.argv.find((arg) => arg.startsWith('--source='));
const sourceRoot = path.resolve(root, sourceArg ? sourceArg.split('=')[1] : '.cache/kenney');
const destRoot = path.join(root, 'public', 'models', 'kenney');

const LICENSE = 'CC0-1.0';
const SOURCE = 'Kenney';
const SOURCE_REPO = 'https://github.com/shorepine/kenney';
const KIT_VERSION = 1;

/** Kits that belong in a warm contemporary social world. */
const KITS = {
  furniture: { label: 'Furniture', styleGroup: 'loftlife-home', styleLabel: 'LoftLife Home' },
  building: { label: 'Building', styleGroup: 'loftlife-city', styleLabel: 'LoftLife City' },
  'modular-buildings': { label: 'Modular Buildings', styleGroup: 'loftlife-city', styleLabel: 'LoftLife City' },
  'city-commercial': { label: 'City Commercial', styleGroup: 'loftlife-city', styleLabel: 'LoftLife City' },
  'city-suburban': { label: 'City Suburban', styleGroup: 'loftlife-city', styleLabel: 'LoftLife City' },
  'city-industrial': { label: 'City Industrial', styleGroup: 'loftlife-city', styleLabel: 'LoftLife City' },
  'city-roads': { label: 'City Roads', styleGroup: 'loftlife-city', styleLabel: 'LoftLife City' },
  car: { label: 'Cars', styleGroup: 'loftlife-city', styleLabel: 'LoftLife City' },
  train: { label: 'Rail', styleGroup: 'loftlife-city', styleLabel: 'LoftLife City' },
  watercraft: { label: 'Watercraft', styleGroup: 'loftlife-city', styleLabel: 'LoftLife City' },
  nature: { label: 'Nature', styleGroup: 'loftlife-nature', styleLabel: 'LoftLife Nature' },
  'mini-forest': { label: 'Forest', styleGroup: 'loftlife-nature', styleLabel: 'LoftLife Nature' },
  'mini-skate': { label: 'Skate Park', styleGroup: 'loftlife-nature', styleLabel: 'LoftLife Nature' },
  food: { label: 'Food', styleGroup: 'loftlife-hospitality', styleLabel: 'LoftLife Hospitality' },
  'mini-market': { label: 'Market', styleGroup: 'loftlife-hospitality', styleLabel: 'LoftLife Hospitality' },
  'mini-arcade': { label: 'Arcade', styleGroup: 'loftlife-hospitality', styleLabel: 'LoftLife Hospitality' },
  holiday: { label: 'Holiday', styleGroup: 'loftlife-hospitality', styleLabel: 'LoftLife Hospitality' },
  factory: { label: 'Factory', styleGroup: 'loftlife-hospitality', styleLabel: 'LoftLife Hospitality' },
  survival: { label: 'Rustic', styleGroup: 'loftlife-hospitality', styleLabel: 'LoftLife Hospitality' },
  'blocky-characters': { label: 'Blocky Characters', styleGroup: 'loftlife-characters', styleLabel: 'LoftLife Characters' },
  'mini-characters': { label: 'Mini Characters', styleGroup: 'loftlife-characters', styleLabel: 'LoftLife Characters' },
};

/**
 * Kits inspected and deliberately excluded, with the reason recorded in the
 * generated source. Weapons and gambling are removed at the model level as
 * well, so a future kit added to KITS cannot reintroduce them silently.
 */
const EXCLUDED_KITS = {
  weapon: 'Weapons — excluded by product policy.',
  blaster: 'Weapons — excluded by product policy.',
  'mini-arena': 'Weapons and fantasy arena pieces; incompatible with the contemporary world.',
  'toy-car': 'Toy racing track, not a city vehicle or furniture asset.',
  road: 'Generic tile000–tile293 road atlas with no semantic identity; city-roads covers roads.',
  castle: 'Medieval fantasy architecture; incompatible.',
  'fantasy-town': 'Medieval fantasy architecture; incompatible.',
  'retro-fantasy': 'Medieval pixel-art architecture; incompatible.',
  pirate: 'Pirate fantasy props; incompatible.',
  'modular-dungeon': 'Dungeon fantasy modules; incompatible.',
  'modular-cave': 'Cave fantasy modules; incompatible.',
  'mini-dungeon': 'Dungeon fantasy modules; incompatible.',
  graveyard: 'Graveyard/horror props; incompatible.',
  space: 'Science-fiction space kit; incompatible.',
  'space-station': 'Science-fiction space kit; incompatible.',
  'modular-space': 'Science-fiction space kit; incompatible.',
  platformer: 'Abstract platformer blocks; no place in a believable world.',
  survival: null,
  hexagon: 'Abstract hex board tiles; incompatible.',
  marble: 'Tabletop marble-run game; incompatible.',
  coaster: 'Roller-coaster toy track; incompatible.',
  minigolf: 'Mini-golf toy course; activity-specific, not a world asset.',
  racing: 'Race-track toy kit; incompatible with the city scale.',
  'tower-defense': 'Fantasy tower-defence kit; incompatible.',
  'tower-defense-classic': 'Fantasy tower-defence kit; incompatible.',
  prototype: 'Untextured grey-box prototyping kit; not a finished asset.',
  brick: 'Toy brick construction system; wrong scale and visual language for the world.',
  'cube-pets': 'Stylised cube pets; incompatible with the character direction.',
  'retro-urban': 'Pixel-art urban kit; incompatible with the contemporary visual identity.',
};

const WEAPON_GAMBLING = /(^|[-_])(weapon|weapons|gun|guns|rifle|pistol|sword|swords|gambling|casino|slot|slots|poker|roulette|bet|bets)([-_]|$)/i;
const NAMED_EXCLUSIONS = new Set(['prize-wheel']);
// Models whose geometry cannot produce a meaningful catalog preview (the
// crossroad barrier is an invisible collision proxy with 112 triangles and no
// visible silhouette at any camera angle). Recorded in the summary rather than
// shipped as a broken card.
const UNRENDERABLE = new Set(['road-crossroad-barrier']);

const PALETTES = {
  fabric: [
    { label: 'Oat Bouclé', hex: '#e8e1d4' },
    { label: 'Sage Linen', hex: '#7c9a82' },
    { label: 'Terracotta', hex: '#c86b51' },
    { label: 'Charcoal Weave', hex: '#3a3d44' },
    { label: 'Cognac Leather', hex: '#a66238' },
  ],
  wood: [
    { label: 'Natural Oak', hex: '#c89e6d' },
    { label: 'Smoked Walnut', hex: '#684730' },
    { label: 'Ash Blonde', hex: '#dfd0b8' },
    { label: 'Ebony', hex: '#2f2b28' },
  ],
  stone: [
    { label: 'Carrara', hex: '#ece8e0' },
    { label: 'Basalt', hex: '#3a3d45' },
    { label: 'Travertine', hex: '#cbbba4' },
    { label: 'Terrazzo Rose', hex: '#d8b9ad' },
  ],
  metal: [
    { label: 'Brushed Brass', hex: '#b08d57' },
    { label: 'Matte Charcoal', hex: '#3a3d44' },
    { label: 'Brushed Steel', hex: '#9aa1aa' },
    { label: 'Chrome', hex: '#c9ced6' },
  ],
  finish: [
    { label: 'Chalk White', hex: '#efeae1' },
    { label: 'Warm Greige', hex: '#cfc3b2' },
    { label: 'Charcoal', hex: '#3a3d44' },
    { label: 'Sage', hex: '#7c9a82' },
  ],
  nature: [
    { label: 'Forest Green', hex: '#3f6b46' },
    { label: 'Olive', hex: '#7b8a4e' },
    { label: 'Sage', hex: '#8fae91' },
    { label: 'Autumn Amber', hex: '#b5762f' },
  ],
  car: [
    { label: 'Pearl White', hex: '#e9e7e2' },
    { label: 'Obsidian', hex: '#1d2026' },
    { label: 'Midnight Blue', hex: '#243a5e' },
    { label: 'Racing Red', hex: '#9d2f2f' },
    { label: 'Silver', hex: '#b6bcc4' },
  ],
  accent: [
    { label: 'Warm Chalk', hex: '#efeae1' },
    { label: 'Ochre', hex: '#d49a45' },
    { label: 'Terracotta', hex: '#c86b51' },
    { label: 'Midnight', hex: '#39465c' },
  ],
};

const THEMES = {
  seating: ['modern_home', 'contemporary_apartment'],
  tables: ['modern_home', 'contemporary_apartment'],
  bedroom: ['modern_home', 'luxury_home'],
  living: ['modern_home', 'industrial_loft'],
  kitchen: ['modern_home'],
  bathroom: ['luxury_home', 'hotel'],
  lighting: ['modern_home', 'nightclub'],
  plants_rugs: ['garden_patio', 'modern_home'],
  wall: ['modern_home', 'luxury_home'],
  decor: ['modern_home', 'contemporary_apartment'],
  structure: ['contemporary_apartment', 'industrial_loft'],
  commercial: ['restaurant', 'retail_store'],
  nightlife: ['nightclub', 'sports_bar'],
  events: ['wedding_venue', 'hotel'],
  outdoor: ['garden_patio', 'outdoor_entertainment'],
  vehicles: ['outdoor_entertainment'],
  buildings: ['contemporary_apartment', 'retail_store'],
  roads: ['outdoor_entertainment'],
  characters: [],
  specialty: ['hookah_lounge'],
  office: ['corporate_office'],
};

function tokens(name) {
  return name
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/[_\s]+/g, '-')
    .toLowerCase()
    .split('-')
    .filter(Boolean);
}

function prettyName(name) {
  const words = name
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  return words
    .map((word) => {
      const lower = word.toLowerCase();
      if (lower === 'tv') return 'TV';
      if (lower === 'dj') return 'DJ';
      if (lower === 'a') return 'A';
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ')
    .replace(/\b([A-Z])\b/g, '$1');
}

function slug(name) {
  return tokens(name).join('-');
}

function classify(kit, name) {
  const n = name.toLowerCase();
  const t = tokens(name);
  const has = (re) => re.test(n);
  let category = 'decor';
  let subcategory = 'decor';
  let layer = 'floor';

  if (kit === 'furniture') {
    if (has(/^(bathroom|bathtub|shower|toilet)/)) return ['bathroom', 'bathroom', 'floor'];
    if (has(/^(bed|pillow|cabinetbed)/)) return ['bedroom', 'bedroom', 'floor'];
    if (has(/chair|bench|sofa|lounge|stool|ottoman/)) return ['seating', 'seating', 'floor'];
    if (has(/^table|^desk|sidetable|kitchenbar/)) return ['tables', 'tables', 'floor'];
    if (has(/^kitchen|fridge|stove|oven|^hood|microwave|toaster|blender|washer|dryer|coffeemachine/))
      return ['kitchen', 'kitchen', 'floor'];
    if (has(/^lamp|ceilingfan/)) return ['lighting', 'lighting', 'floor'];
    if (has(/^plant|potted/)) return ['plants_rugs', 'plants', 'floor'];
    if (has(/^rug/)) return ['plants_rugs', 'rugs', 'rug'];
    if (has(/^bookcase|^books|^television|^radio|^speaker|computer|laptop|coattrack|coatrack/))
      return ['living', 'living', 'floor'];
    if (has(/^floor/)) return ['structure', 'floors', 'rug'];
    if (has(/^stairs/)) return ['structure', 'stairs', 'floor'];
    if (has(/^doorway/)) return ['structure', 'doors', 'wall'];
    if (has(/^wall/)) return ['structure', 'walls', 'wall'];
    if (has(/paneling|mirror/)) return ['wall', 'wall', 'wall'];
    if (has(/trashcan|cardboard|bear/)) return ['decor', 'decor', 'floor'];
    return ['living', 'living', 'floor'];
  }

  if (kit === 'building' || kit === 'modular-buildings') {
    if (has(/door/)) return ['structure', 'doors', 'wall'];
    if (has(/window/)) return ['structure', 'doors', 'wall'];
    if (has(/floor/)) return ['structure', 'floors', 'rug'];
    if (has(/stairs|steps/)) return ['structure', 'stairs', 'floor'];
    if (has(/roof|ceiling/)) return ['structure', 'ceilings', 'floor'];
    if (has(/wall|border|panel/)) return ['structure', 'walls', 'wall'];
    if (has(/column|pillar/)) return ['structure', 'walls', 'floor'];
    if (has(/building-sample/)) return ['buildings', 'residential', 'floor'];
    if (has(/building/)) return ['structure', 'walls', 'floor'];
    return ['structure', 'exterior', 'floor'];
  }

  if (kit === 'city-commercial') {
    if (has(/building|skyscraper/)) return ['buildings', has(/skyscraper/) ? 'skyscrapers' : 'commercial', 'floor'];
    return ['roads', 'street_furniture', 'floor'];
  }

  if (kit === 'city-suburban') {
    if (has(/building/)) return ['buildings', 'residential', 'floor'];
    if (has(/tree|planter|path|driveway|fence/)) return ['outdoor', 'landscaping', 'floor'];
    return ['outdoor', 'landscaping', 'floor'];
  }

  if (kit === 'city-industrial') {
    if (has(/building/)) return ['buildings', 'industrial', 'floor'];
    return ['structure', 'exterior', 'floor'];
  }

  if (kit === 'city-roads') {
    if (has(/^bridge|bridge/)) return ['roads', 'bridges', 'floor'];
    if (has(/light/)) return ['roads', 'lighting', 'floor'];
    if (has(/construction/)) return ['roads', 'construction', 'floor'];
    if (has(/road|sidewalk|crossing|crossroad|roundabout|driveway/)) return ['roads', 'roads', 'rug'];
    return ['roads', 'street_furniture', 'floor'];
  }

  if (kit === 'car') {
    if (has(/debris/)) return ['vehicles', 'parts', 'floor'];
    if (has(/cone|box/)) return ['roads', 'construction', 'floor'];
    return ['vehicles', 'cars', 'floor'];
  }

  if (kit === 'train') {
    if (has(/railroad/)) return ['roads', 'rail', 'rug'];
    return ['vehicles', 'rail', 'floor'];
  }

  if (kit === 'watercraft') {
    if (has(/boat|ship|cargo|tug|canoe|raft/)) return ['vehicles', 'water', 'floor'];
    return ['outdoor', 'waterfront', 'floor'];
  }

  if (kit === 'nature') {
    if (has(/tree|plant|bush|flower|mushroom|cactus|grass|log|stump|leaf|vine|root|crop|corn|wheat|pumpkin/))
      return ['plants_rugs', 'plants', 'floor'];
    if (has(/rock|stone|cliff|boulder|pebble/)) return ['outdoor', 'landscaping', 'floor'];
    if (has(/water|river|lake|pond|waterfall|shore|dock|pier/)) return ['outdoor', 'water', 'floor'];
    if (has(/bridge|fence|gate|path|steps|platform|wall|ground/)) return ['outdoor', 'landscaping', 'floor'];
    if (has(/campfire|tent|bedroll|chair|table|bench|crate|barrel|cook/)) return ['outdoor', 'props', 'floor'];
    return ['outdoor', 'landscaping', 'floor'];
  }

  if (kit === 'food') {
    return ['commercial', 'food', 'floor'];
  }

  if (kit === 'mini-market' || kit === 'mini-arcade') {
    if (has(/character/)) return ['characters', 'static_characters', 'floor'];
    if (has(/wall|floor|column|^fence/)) return ['structure', 'walls', 'floor'];
    if (kit === 'mini-arcade') return ['nightlife', 'arcade', 'floor'];
    return ['commercial', 'retail', 'floor'];
  }

  if (kit === 'mini-forest') {
    if (has(/character/)) return ['characters', 'static_characters', 'floor'];
    if (has(/tree|plant|rocks|stones|patch/)) return ['plants_rugs', 'plants', 'floor'];
    return ['outdoor', 'landscaping', 'floor'];
  }

  if (kit === 'mini-skate') {
    if (has(/character|skateboard/)) return ['characters', 'static_characters', 'floor'];
    if (has(/^floor/)) return ['outdoor', 'skatepark', 'rug'];
    return ['outdoor', 'skatepark', 'floor'];
  }

  if (kit === 'holiday') {
    if (has(/cabin|gingerbread/)) return ['buildings', 'residential', 'floor'];
    if (has(/roof|wall|door|window/)) return ['structure', 'exterior', 'floor'];
    if (has(/^floor/)) return ['structure', 'floors', 'rug'];
    if (has(/bench/)) return ['seating', 'seating', 'floor'];
    if (has(/table/)) return ['tables', 'tables', 'floor'];
    if (has(/tree|candy|snow|gift|light|wreath|ornament|decor/)) return ['events', 'holiday', 'floor'];
    return ['decor', 'holiday', 'floor'];
  }

  if (kit === 'factory') {
    if (has(/catwalk|rail|floor|wall|stairs|platform/)) return ['structure', 'industrial', 'floor'];
    return ['commercial', 'industrial', 'floor'];
  }

  if (kit === 'survival') {
    if (has(/fence|wall|floor|gate/)) return ['structure', 'exterior', 'floor'];
    if (has(/tree|rock|grass|patch|fish|plant/)) return ['outdoor', 'landscaping', 'floor'];
    if (has(/barrel|box|chest|crate|resource|bucket|metal/)) return ['commercial', 'industrial', 'floor'];
    return ['outdoor', 'props', 'floor'];
  }

  if (kit === 'blocky-characters' || kit === 'mini-characters') {
    return ['characters', has(/wheelchair|cane|crutch|aid|glasses|mask/) ? 'accessibility' : 'static_characters', 'floor'];
  }

  return [category, subcategory, layer];
}

function palettesFor(category, subcategory) {
  if (['seating', 'bedroom', 'events'].includes(category)) return { colors: PALETTES.fabric, tintRoles: [] };
  if (['tables', 'office'].includes(category)) return { colors: PALETTES.wood, tintRoles: ['wood'] };
  if (['kitchen', 'bathroom'].includes(category)) return { colors: PALETTES.stone, tintRoles: ['stone'] };
  if (category === 'lighting') return { colors: PALETTES.metal, tintRoles: [] };
  if (category === 'plants_rugs') return { colors: PALETTES.nature, tintRoles: [] };
  if (category === 'vehicles') return { colors: PALETTES.car, tintRoles: [] };
  if (category === 'nightlife' || subcategory === 'food') return { colors: PALETTES.accent, tintRoles: [] };
  if (['outdoor', 'roads', 'buildings', 'structure'].includes(category)) {
    return { colors: PALETTES.finish, tintRoles: [] };
  }
  return { colors: PALETTES.accent, tintRoles: [] };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function scaleFor(kit, category, subcategory, name, raw) {
  const maxXZ = Math.max(raw[0], raw[2]) || 1;
  const height = raw[1] || 1;
  const n = name.toLowerCase();
  if (kit === 'furniture' || kit === 'building' || kit === 'modular-buildings') return 1;
  if (category === 'characters') return clamp(1.7 / height, 0.4, 3);
  if (category === 'buildings') {
    const target = subcategory === 'skyscrapers' ? 14 : 8;
    return clamp(target / maxXZ, 0.2, 20);
  }
  if (category === 'roads') {
    if (subcategory === 'rail') return clamp(4 / maxXZ, 0.2, 8);
    if (subcategory === 'lighting' || subcategory === 'street_furniture') return clamp(3 / height, 0.2, 8);
    return clamp(4 / maxXZ, 0.2, 8);
  }
  if (category === 'vehicles') {
    if (subcategory === 'water') return clamp(5 / maxXZ, 0.2, 12);
    if (subcategory === 'parts') return clamp(0.8 / maxXZ, 0.2, 4);
    return clamp((n.includes('truck') || n.includes('bus') ? 7 : 4.4) / maxXZ, 0.2, 6);
  }
  if (subcategory === 'food') return clamp(0.35 / maxXZ, 0.05, 3);
  if (category === 'plants_rugs' && /tree|palm|pine|oak/.test(n)) return clamp(4 / height, 0.1, 12);
  if (kit === 'nature') return clamp(1.2 / maxXZ, 0.1, 8);
  if (kit === 'mini-market') return clamp(1.4 / maxXZ, 0.2, 6);
  if (kit === 'mini-arcade') return clamp(1.8 / maxXZ, 0.2, 6);
  if (kit === 'mini-forest' || kit === 'mini-skate') return clamp(2.4 / maxXZ, 0.2, 8);
  if (kit === 'holiday') return clamp((category === 'buildings' ? 5 : 1.4) / maxXZ, 0.2, 10);
  if (kit === 'factory') return clamp(2 / maxXZ, 0.2, 8);
  if (kit === 'survival') return clamp(0.9 / maxXZ, 0.15, 6);
  if (kit === 'train') return clamp(4 / maxXZ, 0.2, 8);
  if (kit === 'watercraft') return clamp(5 / maxXZ, 0.2, 12);
  return 1;
}

function priceFor(category, area, triangles) {
  const base = {
    buildings: 1200,
    roads: 90,
    vehicles: 900,
    characters: 220,
    seating: 190,
    tables: 170,
    bedroom: 280,
    kitchen: 260,
    bathroom: 220,
    living: 160,
    lighting: 80,
    plants_rugs: 90,
    decor: 55,
    structure: 150,
    commercial: 200,
    nightlife: 320,
    events: 140,
    specialty: 200,
    office: 170,
    outdoor: 120,
    wall: 85,
  }[category] ?? 120;
  const value = base * (0.72 + Math.min(4, area) * 0.18) + Math.min(600, triangles / 180);
  return Math.max(10, Math.round(value / 5) * 5);
}

function worldBounds(parsed, scale) {
  const size = boundsSize(parsed.bounds).map((value) => value * scale);
  return size;
}

function dimensionsFor(layer, size, scale) {
  const width = size[0] * scale;
  const depth = size[2] * scale;
  if (layer === 'wall') return [clamp(Math.ceil(width - 0.02), 1, 8), 1];
  if (layer === 'rug') return [clamp(Math.round(width), 1, 8), clamp(Math.round(depth), 1, 8)];
  return [clamp(Math.ceil(width - 0.02), 1, 8), clamp(Math.ceil(depth - 0.02), 1, 8)];
}

function copyKit(kit) {
  const from = path.join(sourceRoot, '3d', kit);
  const to = path.join(destRoot, kit);
  if (!fs.existsSync(from)) throw new Error(`Missing Kenney kit at ${from}`);
  fs.mkdirSync(to, { recursive: true });
  let copied = 0;
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.toLowerCase().endsWith('.glb')) {
      fs.copyFileSync(path.join(from, entry.name), path.join(to, entry.name));
      copied += 1;
    }
  }
  const textureDir = path.join(from, 'Textures');
  if (fs.existsSync(textureDir)) {
    fs.cpSync(textureDir, path.join(to, 'Textures'), { recursive: true });
  }
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    if (entry.isFile() && /licen[cs]e|readme/i.test(entry.name)) {
      fs.copyFileSync(path.join(from, entry.name), path.join(to, entry.name));
    }
  }
  return copied;
}

function main() {
  fs.mkdirSync(destRoot, { recursive: true });
  const items = [];
  const kitSummary = [];
  const excludedModels = [];
  const usedIds = new Set();
  let sourceCopied = 0;

  for (const [kit, config] of Object.entries(KITS)) {
    const copied = copyKit(kit);
    sourceCopied += copied;
    const kitDir = path.join(sourceRoot, '3d', kit);
    const files = fs
      .readdirSync(kitDir)
      .filter((name) => name.toLowerCase().endsWith('.glb'))
      .sort();
    let imported = 0;
    let skipped = 0;
    const categoryCounts = {};

    for (const file of files) {
      const originalName = file.slice(0, -4);
      const normalized = originalName.toLowerCase();
      if (WEAPON_GAMBLING.test(normalized) || NAMED_EXCLUSIONS.has(normalized)) {
        skipped += 1;
        excludedModels.push({ kit, name: originalName, reason: 'weapon or gambling content' });
        continue;
      }
      if (UNRENDERABLE.has(normalized)) {
        skipped += 1;
        excludedModels.push({ kit, name: originalName, reason: 'no renderable geometry for a catalog preview' });
        continue;
      }
      let parsed;
      try {
        parsed = parseGlbFile(path.join(kitDir, file), fs);
      } catch (error) {
        skipped += 1;
        excludedModels.push({ kit, name: originalName, reason: `unparseable GLB: ${String(error.message)}` });
        continue;
      }
      const raw = boundsSize(parsed.bounds);
      // Flat ground planes and decals legitimately have zero height on one
      // axis; only reject models with no measurable extent at all.
      if (!raw.every((value) => Number.isFinite(value) && value >= 0) || Math.max(...raw) <= 0) {
        skipped += 1;
        excludedModels.push({ kit, name: originalName, reason: 'zero or invalid bounds' });
        continue;
      }
      if (raw[1] <= 0) raw[1] = 0.001;
      const [category, subcategory, layer] = classify(kit, originalName);
      const scale = scaleFor(kit, category, subcategory, originalName, raw);
      const world = worldBounds(parsed, scale);
      const size = dimensionsFor(layer, world, 1);
      const name = prettyName(originalName);
      let id = `kenney_${kit}_${slug(originalName)}`;
      if (usedIds.has(id)) id = `${id}_2`;
      usedIds.add(id);

      const palette = palettesFor(category, subcategory);
      const area = size[0] * size[1];
      const textures = (parsed.images ?? []).map((image) => image.uri).filter(Boolean);
      const sittable = ['seating', 'bedroom'].includes(category) && !/bookcase|cabinet|dresser/.test(normalized);
      const realHeight = world[1];
      const item = {
        id,
        name,
        category,
        subcategory,
        layer,
        size,
        description: `${name} from the Kenney ${config.label} kit, restyled to LoftLife's ${config.styleLabel} material palette.`,
        colors: palette.colors,
        defaultColor: palette.colors[0].hex,
        price: priceFor(category, area, parsed.triangles),
        currency: 'yuanzi',
        themes: THEMES[category] ?? [],
        styles: [config.styleLabel, 'kenney'],
        tags: [
          ...new Set([
            'kenney',
            kit,
            config.styleGroup,
            category,
            subcategory,
            ...tokens(originalName),
          ]),
        ],
        availability: 'available',
        version: KIT_VERSION,
        asset: {
          path: `/models/kenney/${kit}/${file}`,
          r2Key: `catalog/v1/models/kenney/${kit}/${file}`,
          preview: `/catalog-previews/${id}.png`,
          previewR2Key: `catalog/v1/catalog-previews/${id}.png`,
          kit,
          kitLabel: config.label,
          styleGroup: config.styleGroup,
          styleLabel: config.styleLabel,
          originalName,
          scale: Number(scale.toFixed(5)),
          bounds: world.map((value) => Number(value.toFixed(3))),
          rawBounds: raw.map((value) => Number(value.toFixed(3))),
          triangles: parsed.triangles,
          materials: (parsed.materials ?? []).map((material) => material.name).filter(Boolean),
          textures,
          tintRoles: palette.tintRoles,
          license: LICENSE,
          source: SOURCE,
          sourceUrl: `${SOURCE_REPO}/blob/main/3d/${kit}/${file}`,
          licenseUrl: `${SOURCE_REPO}#license`,
        },
        ...(layer === 'wall' ? { wallHeight: clamp(realHeight * 0.8, 0.4, 3) } : {}),
        ...(layer === 'rug' ? { walkable: true } : {}),
        ...(sittable
          ? {
              sittable: true,
              seatOffset: [0, clamp(realHeight * 0.45, 0.3, 0.75), 0],
              seatApproach: [0, Math.max(0.7, size[1] * 0.5 + 0.45)],
            }
          : {}),
        ...(category === 'lighting' || /lamp/.test(normalized)
          ? { interactive: true }
          : category === 'nightlife' || /television|arcade/.test(normalized)
            ? { interactive: true }
            : {}),
        order: items.length + 1,
      };
      items.push(item);
      imported += 1;
      categoryCounts[category] = (categoryCounts[category] ?? 0) + 1;
    }
    kitSummary.push({ kit, label: config.label, copied, imported, skipped, categories: categoryCounts });
    console.log(`${kit.padEnd(20)} ${String(imported).padStart(4)} imported  ${String(skipped).padStart(3)} excluded`);
  }

  // Stable alphabetical ordering keeps the generated diff reviewable.
  items.sort((a, b) => a.id.localeCompare(b.id));
  items.forEach((item, index) => {
    item.order = index + 1;
  });

  const excludedKits = Object.entries(EXCLUDED_KITS)
    .filter(([kit, reason]) => reason && fs.existsSync(path.join(sourceRoot, '3d', kit)))
    .map(([kit, reason]) => ({
      kit,
      models: fs.readdirSync(path.join(sourceRoot, '3d', kit)).filter((name) => name.endsWith('.glb')).length,
      reason,
    }));

  const byCategory = {};
  const byStyleGroup = {};
  for (const item of items) {
    byCategory[item.category] = (byCategory[item.category] ?? 0) + 1;
    byStyleGroup[item.asset.styleGroup] = (byStyleGroup[item.asset.styleGroup] ?? 0) + 1;
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    source: SOURCE_REPO,
    license: LICENSE,
    kitsProcessed: Object.keys(KITS).length,
    kitsInspected: Object.keys(KITS).length + Object.keys(EXCLUDED_KITS).filter((kit) => EXCLUDED_KITS[kit]).length,
    sourceModels: sourceCopied,
    importedModels: items.length,
    excludedModels: excludedModels.length,
    excludedKits,
    excludedModelDetails: excludedModels,
    byCategory,
    byStyleGroup,
    kitSummary,
  };

  const header = `/**
 * LoftLife × Kenney 3D asset library — GENERATED FILE, DO NOT EDIT.
 *
 * Generated by scripts/import-kenney-library.mjs from https://github.com/shorepine/kenney
 * (Kenney, CC0-1.0). ${items.length} models across ${Object.keys(KITS).length} kits.
 *
 * Every record points at a GLB in public/models/kenney/<kit>/ and at a preview
 * rendered from that same GLB by scripts/render-kenney-previews.mjs. The client,
 * Node API, Cloudflare Worker and tests all read this one record.
 */
import { REPLACED_KENNEY_IDS } from './kenney-replacements.mjs';

export const KENNEY_SOURCE = ${JSON.stringify(
    {
      repository: SOURCE_REPO,
      author: 'Kenney',
      website: 'https://kenney.nl',
      license: LICENSE,
      licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
      importedAt: summary.generatedAt,
      generator: 'scripts/import-kenney-library.mjs',
    },
    null,
    2
  )};

export const KENNEY_SUMMARY = ${JSON.stringify(summary)};

export const KENNEY_ITEMS = ${JSON.stringify(items)};

export const KENNEY_BY_ID = Object.freeze(
  Object.fromEntries(KENNEY_ITEMS.map((item) => [item.id, item]))
);

/** Server-owned price table derived from the generated catalog. */
export const KENNEY_PRICES = Object.freeze(
  Object.fromEntries(
    KENNEY_ITEMS.filter((item) => !REPLACED_KENNEY_IDS.has(item.id)).map((item) => [
      item.id,
      { price: item.price, currency: item.currency },
    ])
  )
);

export const KENNEY_STYLE_GROUPS = ${JSON.stringify(
    [...new Set(items.map((item) => item.asset.styleGroup))].map((id) => ({
      id,
      label: items.find((item) => item.asset.styleGroup === id)?.asset.styleLabel ?? id,
    })),
    null,
    2
  )};

export function getKenneyItem(id) {
  return KENNEY_BY_ID[id] ?? null;
}
`;

  fs.writeFileSync(path.join(root, 'shared', 'catalog', 'kenney-library.mjs'), header);
  fs.writeFileSync(
    path.join(root, 'shared', 'catalog', 'kenney-summary.json'),
    `${JSON.stringify(summary, null, 2)}\n`
  );
  fs.writeFileSync(
    path.join(root, 'shared', 'catalog', 'kenney-library.d.mts'),
    `/** Types for the generated Kenney catalog (plain ESM read by browser and Node). */

export interface KenneyAsset {
  path: string;
  r2Key: string;
  preview: string;
  previewR2Key: string;
  kit: string;
  kitLabel: string;
  styleGroup: string;
  styleLabel: string;
  originalName: string;
  scale: number;
  bounds: [number, number, number];
  rawBounds: [number, number, number];
  triangles: number;
  materials: string[];
  textures: string[];
  tintRoles: string[];
  license: string;
  source: string;
  sourceUrl: string;
  licenseUrl: string;
}

export interface KenneyItem {
  id: string;
  name: string;
  category: string;
  subcategory: string;
  layer: 'floor' | 'rug' | 'wall';
  size: [number, number];
  description: string;
  colors: { label: string; hex: string }[];
  defaultColor: string;
  price: number;
  currency: 'yuanzi' | 'tongbao';
  themes: string[];
  styles: string[];
  tags: string[];
  availability: 'available' | 'incomplete' | 'retired';
  version: number;
  asset: KenneyAsset;
  wallHeight?: number;
  walkable?: boolean;
  sittable?: boolean;
  seatOffset?: [number, number, number];
  seatApproach?: [number, number];
  interactive?: boolean;
  order: number;
}

export const KENNEY_SOURCE: Record<string, string>;
export const KENNEY_SUMMARY: Record<string, unknown>;
export const KENNEY_ITEMS: KenneyItem[];
export const KENNEY_BY_ID: Record<string, KenneyItem>;
export const KENNEY_PRICES: Record<string, { price: number; currency: 'yuanzi' | 'tongbao' }>;
export const KENNEY_STYLE_GROUPS: { id: string; label: string }[];
export function getKenneyItem(id: string): KenneyItem | null;
`
  );

  console.log(
    `\nImported ${items.length} models across ${Object.keys(KITS).length} kits; ${excludedModels.length} model(s) excluded.`
  );
  console.log('Categories:', byCategory);
  console.log('Style groups:', byStyleGroup);
}

main();
