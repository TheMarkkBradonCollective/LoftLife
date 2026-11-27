#!/usr/bin/env node
/**
 * Regenerate the character and vehicle catalogues from the imported Kenney
 * library.
 *
 * These are classification layers only: they never copy or modify model files,
 * and every record points at the preview rendered from that model's own GLB.
 * Run after `npm run assets:import`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { KENNEY_ITEMS, KENNEY_SUMMARY } from '../shared/catalog/kenney-library.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const outDir = path.join(root, 'shared', 'catalog');

const source = (item) => ({
  id: item.id,
  name: item.name,
  preview: item.asset.preview,
  path: item.asset.path,
  r2Key: item.asset.r2Key,
  previewR2Key: item.asset.previewR2Key,
  kit: item.asset.kit,
  kitLabel: item.asset.kitLabel,
  styleGroup: item.asset.styleGroup,
  triangles: item.asset.triangles,
  heightM: Math.round(item.asset.bounds[1] * 100) / 100,
  license: item.asset.license,
  sourceUrl: item.asset.sourceUrl,
});

/* ------------------------------- characters ------------------------------ */

const CHARACTER_ROLE_LABELS = {
  pedestrian: 'NPC pedestrians',
  service: 'Service and venue staff',
  accessibility: 'Accessibility aids and mobility props',
  out_of_world: 'Out-of-world fantasy props',
  npc: 'Other character props',
};

function characterRole(item) {
  const name = item.asset.originalName ?? '';
  const kit = item.asset.kit;
  if (kit === 'mini-forest') return 'out_of_world';
  if (kit === 'mini-arcade' || kit === 'mini-market') return 'service';
  if (/wheelchair|aid-|cane|crutch|glasses|mask|sunglasses|hearing/.test(name)) return 'accessibility';
  if (kit === 'blocky-characters' || kit === 'mini-characters' || kit === 'mini-skate') return 'pedestrian';
  return 'npc';
}

const characterItems = KENNEY_ITEMS.filter((item) => item.category === 'characters')
  .map((item) => {
    const role = characterRole(item);
    return {
      ...source(item),
      role,
      roleLabel: CHARACTER_ROLE_LABELS[role],
      /** Static mesh: not rig-compatible, so never a player avatar. */
      playerCompatible: false,
      npcEligible: role === 'pedestrian' || role === 'service',
      use: role === 'pedestrian'
        ? 'Distant city crowd and background extras (LOD tier)'
        : role === 'service'
          ? 'Venue staff and arcade/market background props'
          : role === 'accessibility'
            ? 'Seated/standing accessibility props in public interiors'
            : 'Not used in the contemporary city',
    };
  })
  .sort((a, b) => a.role.localeCompare(b.role) || a.name.localeCompare(b.name));

const characterCounts = characterItems.reduce((counts, item) => {
  counts[item.role] = (counts[item.role] ?? 0) + 1;
  return counts;
}, {});

const characterLibrary = {
  generatedAt: new Date().toISOString(),
  source: KENNEY_SUMMARY.source ?? 'Kenney',
  license: 'CC0-1.0',
  kitsInspected: [...new Set(characterItems.map((item) => item.kit))].sort(),
  count: characterItems.length,
  counts: characterCounts,
  roleLabels: CHARACTER_ROLE_LABELS,
  /** The Kenney character kits shipped in this repository are static meshes. */
  animationResources: [],
  animationNote:
    'No rigged or animated character kit is present in the imported collection. The LoftLife avatar rig is the animation foundation for players and NPCs; imported static characters are used only as distant crowd LOD.',
  animationSets: [
    { id: 'idle', label: 'Idle', use: 'Standing, breathing, blinking' },
    { id: 'walk', label: 'Walk', use: 'Sidewalk strolling at 1.2–2.2 m/s' },
    { id: 'run', label: 'Run', use: 'Sprint input above 4.6 m/s' },
    { id: 'sit', label: 'Sit', use: 'Chairs, benches, venue seats and transit' },
    { id: 'stand', label: 'Stand up', use: 'Blends out of a seat into idle' },
    { id: 'wave', label: 'Wave', use: 'Greeting a nearby player or NPC' },
    { id: 'talk', label: 'Talk', use: 'Counter staff and seated conversation' },
    { id: 'gesture', label: 'Gesture', use: 'Pointing and social emphasis' },
    { id: 'dance', label: 'Dance', use: 'Dance pads and parties' },
    { id: 'cheer', label: 'Cheer', use: 'Celebrations' },
    { id: 'jump', label: 'Jump', use: 'Airborne pose' },
    { id: 'enter_vehicle', label: 'Enter vehicle', use: 'Transition into a seat' },
    { id: 'exit_vehicle', label: 'Exit vehicle', use: 'Transition onto the kerb' },
  ],
  items: characterItems,
};

/* -------------------------------- vehicles ------------------------------- */

const VEHICLE_GROUP_LABELS = {
  passenger_cars: 'Passenger cars',
  suv_vans: 'SUVs and vans',
  commercial: 'Commercial vehicles',
  service: 'Service and emergency vehicles',
  taxis: 'Taxis',
  sports: 'Sports and performance cars',
  karts: 'Karts (not everyday traffic)',
  buses_transit: 'Buses and rail transit',
  rail_infrastructure: 'Rail infrastructure (not vehicles)',
  watercraft: 'Watercraft',
  watercraft_support: 'Cargo and dock support',
  parts: 'Wheels and vehicle parts',
  other: 'Other',
};

function vehicleGroup(item) {
  const name = item.asset.originalName ?? '';
  const kit = item.asset.kit;
  if (kit === 'train') {
    return /track|spline|connector|railroad/.test(name) ? 'rail_infrastructure' : 'buses_transit';
  }
  if (kit === 'watercraft') {
    return /cargo/.test(name) ? 'watercraft_support' : 'watercraft';
  }
  if (kit !== 'car') return 'other';
  if (/wheel|debris/.test(name)) return 'parts';
  if (/^kart-/.test(name)) return 'karts';
  if (/taxi/.test(name)) return 'taxis';
  if (/ambulance|firetruck|police|tractor/.test(name)) return 'service';
  if (/delivery|truck|garbage/.test(name)) return 'commercial';
  if (/suv|van/.test(name)) return 'suv_vans';
  if (/race/.test(name)) return 'sports';
  if (/sedan|hatchback/.test(name)) return 'passenger_cars';
  return 'other';
}

const TRAFFIC_GROUPS = new Set(['passenger_cars', 'suv_vans', 'commercial', 'taxis']);

const vehicleItems = KENNEY_ITEMS.filter((item) => item.category === 'vehicles')
  .map((item) => {
    const group = vehicleGroup(item);
    return {
      ...source(item),
      group,
      groupLabel: VEHICLE_GROUP_LABELS[group],
      trafficEligible: TRAFFIC_GROUPS.has(group),
      toyStyle: group === 'karts',
      use:
        group === 'parts'
          ? 'Placeable parts and workshop decoration; not a vehicle'
          : group === 'rail_infrastructure'
            ? 'Placeable track and rail pieces; not a vehicle'
            : group === 'karts'
              ? 'Arcade/kart experience only — excluded from realistic city traffic'
              : group === 'buses_transit'
                ? 'Placeable rail stock; the in-world LoftLine fleet is a runtime mesh'
                : group === 'watercraft' || group === 'watercraft_support'
                  ? 'Placeable waterfront models'
                  : 'Placeable vehicle, also usable by the vehicle catalogue',
    };
  })
  .sort((a, b) => a.group.localeCompare(b.group) || a.name.localeCompare(b.name));

const vehicleCounts = vehicleItems.reduce((counts, item) => {
  counts[item.group] = (counts[item.group] ?? 0) + 1;
  return counts;
}, {});

const vehicleLibrary = {
  generatedAt: new Date().toISOString(),
  source: KENNEY_SUMMARY.source ?? 'Kenney',
  license: 'CC0-1.0',
  count: vehicleItems.length,
  counts: vehicleCounts,
  groupLabels: VEHICLE_GROUP_LABELS,
  trafficGroups: [...TRAFFIC_GROUPS],
  inWorldFleet: [
    {
      id: 'loftline-bus',
      label: 'LoftLine Bus',
      group: 'buses_transit',
      kind: 'bus',
      source: 'runtime mesh',
      note: 'Six scheduled routes; riders sit on the server-assigned deck.',
    },
    {
      id: 'loftline-taxi',
      label: 'Autonomous Taxi',
      group: 'taxis',
      kind: 'taxi',
      source: 'runtime mesh',
      note: 'Cruises the road grid, pauses near pedestrians and drives hired riders.',
    },
    {
      id: 'loftline-rail',
      label: 'LoftLine Rail Car',
      group: 'buses_transit',
      kind: 'rail',
      source: 'runtime mesh',
      note: 'Elevated 16th Street lines with scheduled station dwell.',
    },
    {
      id: 'city-traffic',
      label: 'City Traffic',
      group: 'passenger_cars',
      kind: 'traffic',
      source: 'runtime mesh',
      note: 'Sedans, SUVs, coupes, taxis and buses with signals, braking and kerbside stops.',
    },
  ],
  items: vehicleItems,
};

/* --------------------------------- write --------------------------------- */

function moduleText(name, doc, object) {
  return `/**\n * ${doc}\n *\n * Generated by scripts/build-people-vehicle-libraries.mjs — do not hand-edit.\n * Source models: Kenney (CC0-1.0), previews rendered from each shipped GLB.\n */\n\nexport const ${name} = ${JSON.stringify(object, null, 2)};\n`;
}

fs.writeFileSync(
  path.join(outDir, 'character-library.mjs'),
  moduleText(
    'CHARACTER_LIBRARY',
    'Classified character assets: player-avatar resources (none — the custom rig is authoritative), NPC/pedestrian resources, accessibility props and animation resources.',
    characterLibrary
  )
);
fs.writeFileSync(
  path.join(outDir, 'vehicle-library.mjs'),
  moduleText(
    'VEHICLE_LIBRARY',
    'Classified vehicle catalogue with real previews and the runtime LoftLife fleet.',
    vehicleLibrary
  )
);

console.log(
  `Characters: ${characterLibrary.count} (${Object.entries(characterCounts).map(([k, v]) => `${k} ${v}`).join(', ')})`
);
console.log(
  `Vehicles: ${vehicleLibrary.count} (${Object.entries(vehicleCounts).map(([k, v]) => `${k} ${v}`).join(', ')})`
);
