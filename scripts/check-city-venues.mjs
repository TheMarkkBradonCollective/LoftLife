// City master-plan invariants.
//
// Bundles the layout + venue modules with esbuild (the same tool the CI build
// uses) and asserts the properties the world redesign relies on:
//
//   • street hierarchy — M Street is a real 8-lane boulevard, avenues are wider
//     than streets, residential streets are the narrowest;
//   • district plan — every block belongs to a district, all districts exist,
//     and landmarks sit in the district that gives them context;
//   • destinations — one per block, inside their block, plausible massing,
//     doors on the facade, arrivals on the sidewalk;
//   • footprints — buildings stay inside their blocks and clear of venues;
//   • transit — every stop lies on a road centreline and the taxi grid matches
//     the layout's lettered/numbered streets.
//
// Run with: npm run check:city

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'loftlife-city-'));
const bundle = (entry, name) => {
  const out = join(dir, name);
  execFileSync(
    'npx',
    ['esbuild', entry, '--bundle', '--format=esm', '--platform=node', `--outfile=${out}`, '--log-level=error'],
    { stdio: 'inherit' }
  );
  return out;
};

let venues;
let layout;
try {
  venues = await import(bundle('src/game/venues.ts', 'venues.mjs'));
  layout = await import(bundle('src/game/cityLayout.ts', 'layout.mjs'));
} finally {
  setTimeout(() => rmSync(dir, { recursive: true, force: true }), 0);
}

const { CITY_VENUES } = venues;
const { CITY_LAYOUT, CITY_DISTRICTS, M_STREET_INDEX, STREET_HIERARCHY, VENUE_BLOCKS } = layout;
const CITY_SLOPE = 0.42;
const problems = [];
const note = (message) => problems.push(message);

// ── Street hierarchy ────────────────────────────────────────────────────────
const boulevard = STREET_HIERARCHY.boulevard;
const avenue = STREET_HIERARCHY.avenue;
const street = STREET_HIERARCHY.street;
const residential = STREET_HIERARCHY.residential;

if (boulevard.lanes !== 8) note(`M Street must be 8 lanes, found ${boulevard.lanes}`);
if (boulevard.width < 26) note(`M Street carriageway is too narrow: ${boulevard.width}m`);
if (boulevard.median <= 0) note('M Street has no planted median');
if (!(boulevard.width > avenue.width && avenue.width > street.width && street.width > residential.width)) {
  note('street hierarchy widths are not ordered boulevard > avenue > street > residential');
}
if (CITY_LAYOUT.uClasses[M_STREET_INDEX] !== 'boulevard') {
  note(`M Street class is "${CITY_LAYOUT.uClasses[M_STREET_INDEX]}"`);
}
if (CITY_LAYOUT.uHalfWidths[M_STREET_INDEX] * 2 !== boulevard.width) {
  note('M Street half-width does not match its carriageway width');
}
if (CITY_LAYOUT.uLines.length !== 26) note(`lettered streets changed: ${CITY_LAYOUT.uLines.length}`);
if (CITY_LAYOUT.zLines.length !== 30) note(`numbered streets changed: ${CITY_LAYOUT.zLines.length}`);
for (let i = 1; i < CITY_LAYOUT.zLines.length; i += 1) {
  if (!(CITY_LAYOUT.zLines[i] > CITY_LAYOUT.zLines[i - 1])) note(`numbered street order broken at ${i}`);
}
for (let i = 1; i < CITY_LAYOUT.uLines.length; i += 1) {
  if (!(CITY_LAYOUT.uLines[i] > CITY_LAYOUT.uLines[i - 1])) note(`lettered street order broken at ${i}`);
}
const allClasses = new Set([...CITY_LAYOUT.uClasses, ...CITY_LAYOUT.zClasses]);
for (const cls of ['boulevard', 'avenue', 'street', 'residential']) {
  if (!allClasses.has(cls)) note(`street class "${cls}" is never used`);
}

// ── District plan ──────────────────────────────────────────────────────────
const districtIds = new Set(CITY_DISTRICTS.map((d) => d.id));
if (CITY_DISTRICTS.length < 12) note(`only ${CITY_DISTRICTS.length} districts defined`);
const usedDistricts = new Set(CITY_LAYOUT.blocks.map((b) => b.district));
for (const id of usedDistricts) {
  if (!districtIds.has(id)) note(`block references undefined district "${id}"`);
}
for (const district of CITY_DISTRICTS) {
  const count = CITY_LAYOUT.blocks.filter((b) => b.district === district.id).length;
  if (district.id !== 'parks' && count === 0) note(`district "${district.id}" has no blocks`);
  if (district.sidewalk < 2) note(`district "${district.id}" has an implausibly narrow sidewalk`);
}

// Block dimensions must stay buildable after sidewalk + setback.
for (const blk of CITY_LAYOUT.blocks) {
  const usableU = blk.uMax - blk.uMin - (blk.sidewalk + blk.setback) * 2;
  const usableZ = blk.zMax - blk.zMin - (blk.sidewalk + blk.setback) * 2;
  if (blk.kind === 'building' && (usableU < 4 || usableZ < 4)) {
    note(`block ${blk.col},${blk.row} has no buildable footprint after setbacks`);
  }
}

// ── Destinations ───────────────────────────────────────────────────────────
const ids = new Set();
const blockKeys = new Set();
for (const v of CITY_VENUES) {
  const at = (msg) => note(`${v.id}: ${msg}`);

  if (ids.has(v.id)) at('duplicate id');
  ids.add(v.id);

  const blockKey = `${v.block.col},${v.block.row}`;
  if (blockKeys.has(blockKey)) at(`shares block ${blockKey} with another venue`);
  blockKeys.add(blockKey);

  if (VENUE_BLOCKS[blockKey] !== v.id) at('layout venue map does not point at this destination');
  if (v.block.kind !== 'venue') at(`block kind is "${v.block.kind}", expected "venue"`);
  if (v.block.venueId !== v.id) at('block venueId does not match the destination');
  if (!(v.u0 > v.block.uMin && v.u1 < v.block.uMax && v.z0 > v.block.zMin && v.z1 < v.block.zMax)) {
    at('shell does not fit inside its block');
  }
  if (v.u0 < v.block.uMin + v.block.sidewalk) at('shell intrudes into the sidewalk');
  if (!(v.iu0 > v.u0 && v.iu1 > v.iu0 && v.iz0 > v.z0 && v.iz1 > v.iz0)) at('interior footprint is inverted');

  if (v.doorSide === 'north' || v.doorSide === 'south') {
    if (v.doorU < v.u0 + 1 || v.doorU > v.u1 - 1) at('door is not on the facade');
  } else if (v.doorZ < v.z0 + 1 || v.doorZ > v.z1 - 1) {
    at('door is not on the facade');
  }

  const arrivalU = v.arrivalPos.x - CITY_SLOPE * v.arrivalPos.z;
  const insideShell =
    arrivalU > v.u0 && arrivalU < v.u1 && v.arrivalPos.z > v.z0 && v.arrivalPos.z < v.z1;
  if (insideShell) at('arrival point lands inside the shell');
  const insideBlock =
    arrivalU > v.block.uMin && arrivalU < v.block.uMax &&
    v.arrivalPos.z > v.block.zMin && v.arrivalPos.z < v.block.zMax;
  if (!insideBlock) at('arrival point is outside its block (in a traffic lane)');

  if (v.height < 6 || v.height > 28) at(`implausible parapet height ${v.height}`);
  if (v.ceiling < 3.6) at(`ceiling too low for a walkable room (${v.ceiling})`);
  if (v.ceiling >= v.height) at('ceiling is at or above the parapet');
  if (v.doorWidth < 1.6 || v.doorWidth > v.u1 - v.u0) at(`implausible door width ${v.doorWidth}`);
}

// Every venue shell must be clear of every other venue shell.
for (let i = 0; i < CITY_VENUES.length; i += 1) {
  for (let j = i + 1; j < CITY_VENUES.length; j += 1) {
    const a = CITY_VENUES[i];
    const b = CITY_VENUES[j];
    const overlap =
      a.u0 < b.u1 && a.u1 > b.u0 && a.z0 < b.z1 && a.z1 > b.z0;
    if (overlap) note(`venue shells overlap: ${a.id} / ${b.id}`);
  }
}

// Landmarks must exist and sit in the right district.
const kindCounts = CITY_LAYOUT.blocks.reduce(
  (acc, b) => ({ ...acc, [b.kind]: (acc[b.kind] || 0) + 1 }),
  {}
);
for (const kind of ['loft_hotel', 'airport', 'loft_plaza', 'clothing_store', 'promenade', 'parking', 'plaza']) {
  if (!kindCounts[kind]) note(`reserved landmark "${kind}" is missing from the layout`);
}
const blockAt = (col, row) => CITY_LAYOUT.blocks.find((b) => b.col === col && b.row === row);
const districtExpectations = {
  '11,13': 'civic',
  '12,13': 'civic',
  '11,15': 'civic',
  '10,9': 'arts',
  '11,9': 'arts',
  '14,17': 'retail',
  '16,18': 'retail',
  '15,11': 'entertainment',
  '16,12': 'entertainment',
  '14,12': 'entertainment',
  '19,17': 'medical',
  '13,18': 'retail',
  '22,27': 'transport',
};
for (const [key, district] of Object.entries(districtExpectations)) {
  const [col, row] = key.split(',').map(Number);
  const blk = blockAt(col, row);
  if (!blk) {
    note(`landmark block ${key} is missing`);
    continue;
  }
  if (blk.district !== district) note(`block ${key} is in "${blk.district}", expected "${district}"`);
}

// The airport owns a multi-block transportation campus.
const airportBlocks = CITY_LAYOUT.blocks.filter((b) => b.kind === 'airport');
if (airportBlocks.length < 3) note(`airport only owns ${airportBlocks.length} blocks`);
const airportDistrict = CITY_DISTRICTS.find((d) => d.id === 'transport');
if (!airportDistrict || airportDistrict.bounds.col0 > 21) note('airport district does not surround the terminal');

// ── Security of the world edge ────────────────────────────────────────────
if (!(CITY_LAYOUT.waterfront.uEdge > CITY_LAYOUT.bounds.uMax)) {
  note('river overlaps the walkable east edge');
}
if (!(CITY_LAYOUT.bounds.uMax > CITY_LAYOUT.uLines[25])) note('east bounds do not include Z Street');

// ── Transit geometry ──────────────────────────────────────────────────────
const transitSource = readFileSync(new URL('../server/transit.mjs', import.meta.url), 'utf8');
const extractArray = (name) => {
  const match = transitSource.match(new RegExp(`const ${name} = \\[([\\s\\S]*?)\\];`));
  if (!match) return null;
  return match[1]
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .map((entry) => Number(entry))
    .filter((value) => Number.isFinite(value));
};
const roadU = extractArray('ROAD_U');
const roadZ = extractArray('ROAD_Z');
if (!roadU || !roadZ) {
  note('could not read ROAD_U / ROAD_Z from server/transit.mjs');
} else {
  const close = (a, b) => Math.abs(a - b) < 0.35;
  if (roadU.length !== CITY_LAYOUT.uLines.length) note(`ROAD_U has ${roadU.length} entries, layout has 26`);
  if (roadZ.length !== CITY_LAYOUT.zLines.length) note(`ROAD_Z has ${roadZ.length} entries, layout has 30`);
  CITY_LAYOUT.uLines.forEach((u, i) => {
    if (roadU[i] !== undefined && !close(roadU[i], u)) note(`ROAD_U[${i}] is ${roadU[i]}, layout ${u.toFixed(2)}`);
  });
  CITY_LAYOUT.zLines.forEach((z, i) => {
    if (roadZ[i] !== undefined && !close(roadZ[i], z)) note(`ROAD_Z[${i}] is ${roadZ[i]}, layout ${z.toFixed(2)}`);
  });

  const transit = await import(bundle('server/transit.mjs', 'transit.mjs'));
  for (const line of transit.TRANSIT_LINES) {
    for (const stop of line.stops) {
      const u = stop.x - CITY_SLOPE * stop.z;
      const onU = roadU.some((value) => close(value, u));
      const onZ = roadZ.some((value) => close(value, stop.z));
      if (!onU && !onZ) note(`${line.id} stop "${stop.name}" is not on a street centreline`);
      if (line.kind === 'rail' && !close(stop.z, CITY_LAYOUT.metroLineZ)) {
        note(`${line.id} rail stop "${stop.name}" is off the 16th Street viaduct`);
      }
      if (stop.x < CITY_LAYOUT.bounds.uMin - 30 || stop.z < CITY_LAYOUT.bounds.zMin - 30) {
        note(`${line.id} stop "${stop.name}" is outside the city`);
      }
    }
  }
  for (const destination of transit.TAXI_DESTINATIONS) {
    const u = destination.arrival.x - CITY_SLOPE * destination.arrival.z;
    if (u < CITY_LAYOUT.bounds.uMin || u > CITY_LAYOUT.bounds.uMax) {
      note(`taxi destination "${destination.id}" is outside the city`);
    }
    const inVenue = CITY_VENUES.find(
      (v) =>
        u > v.u0 && u < v.u1 && destination.arrival.z > v.z0 && destination.arrival.z < v.z1
    );
    if (inVenue) note(`taxi destination "${destination.id}" drops off inside ${inVenue.id}`);
  }
  if (!transit.TAXI_DESTINATIONS.some((entry) => entry.id === 'airport')) {
    note('no taxi destination serves the airport');
  }
  if (!transit.TRANSIT_LINES.some((line) => line.id === 'airport-express')) {
    note('no airport transit service is defined');
  }
}

const summary = CITY_VENUES.map(
  (v) => `${v.id} "${v.sign}" h${v.height}m in ${v.district} on block ${v.block.col},${v.block.row}`
);

if (problems.length) {
  console.error('City master-plan check FAILED');
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

console.log(
  `City master-plan check passed (${CITY_VENUES.length} destinations, ${CITY_DISTRICTS.length} districts, ${CITY_LAYOUT.blocks.length} blocks)`
);
for (const line of summary) console.log(`  - ${line}`);
