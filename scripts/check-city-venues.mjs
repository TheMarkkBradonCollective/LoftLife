// City venue layout invariants.
//
// Bundles the venue + layout modules with esbuild (the same tool the CI build
// uses) and asserts the properties the city upgrade relies on: every public
// destination sits on its own venue block, stays inside it, has a plausible
// massing, keeps its doors on the facade, and arrives players on the street
// side rather than inside a wall.
//
// Run with: npm run check:city

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
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
  // Modules are already loaded into memory; the temp files can go.
  setTimeout(() => rmSync(dir, { recursive: true, force: true }), 0);
}

const { CITY_VENUES } = venues;
// Mirrors CITY_SLOPE in src/game/cityLayout.ts (diagonal lettered streets).
const CITY_SLOPE = 0.42;
const { CITY_LAYOUT } = layout;
const problems = [];

const ids = new Set();
const blocks = new Set();
for (const v of CITY_VENUES) {
  const at = (msg) => problems.push(`${v.id}: ${msg}`);

  if (ids.has(v.id)) at('duplicate id');
  ids.add(v.id);

  const blockKey = `${v.block.col},${v.block.row}`;
  if (blocks.has(blockKey)) at(`shares block ${blockKey} with another venue`);
  blocks.add(blockKey);

  if (v.block.kind !== 'venue') at(`block kind is "${v.block.kind}", expected "venue"`);
  if (!(v.u0 > v.block.uMin && v.u1 < v.block.uMax && v.z0 > v.block.zMin && v.z1 < v.block.zMax)) {
    at('shell does not fit inside its block');
  }
  if (!(v.iu0 > v.u0 && v.iu1 > v.iu0 && v.iz0 > v.z0 && v.iz1 > v.iz0)) at('interior footprint is inverted');

  if (v.doorSide === 'north' || v.doorSide === 'south') {
    if (v.doorU < v.u0 + 1 || v.doorU > v.u1 - 1) at('door is not on the facade');
  } else if (v.doorZ < v.z0 + 1 || v.doorZ > v.z1 - 1) {
    at('door is not on the facade');
  }

  const arrivalU = v.arrivalPos.x - CITY_SLOPE * v.arrivalPos.z;
  const outside =
    arrivalU < v.u0 - 1 || arrivalU > v.u1 + 1 || v.arrivalPos.z < v.z0 - 1 || v.arrivalPos.z > v.z1 + 1;
  if (!outside) at('arrival point lands inside the shell');

  if (v.height < 6 || v.height > 26) at(`implausible parapet height ${v.height}`);
  if (v.ceiling < 3.6) at(`ceiling too low for a walkable room (${v.ceiling})`);
  if (v.ceiling >= v.height) at('ceiling is at or above the parapet');
  if (v.doorWidth < 1.6 || v.doorWidth > v.u1 - v.u0) at(`implausible door width ${v.doorWidth}`);
}

// Landmarks that must survive the upgrade.
const kindCounts = CITY_LAYOUT.blocks.reduce((acc, b) => ({ ...acc, [b.kind]: (acc[b.kind] || 0) + 1 }), {});
for (const kind of ['loft_hotel', 'airport', 'loft_plaza']) {
  if (!kindCounts[kind]) problems.push(`reserved landmark "${kind}" is missing from the layout`);
}

// Street grid order and extents.
if (CITY_LAYOUT.uLines.length !== 26) problems.push(`lettered streets changed: ${CITY_LAYOUT.uLines.length} lines`);
if (CITY_LAYOUT.zLines.length !== 30) problems.push(`numbered streets changed: ${CITY_LAYOUT.zLines.length} lines`);
for (let i = 1; i < CITY_LAYOUT.zLines.length; i += 1) {
  if (!(CITY_LAYOUT.zLines[i] > CITY_LAYOUT.zLines[i - 1])) problems.push(`numbered street order broken at index ${i}`);
}
for (let i = 1; i < CITY_LAYOUT.uLines.length; i += 1) {
  if (!(CITY_LAYOUT.uLines[i] > CITY_LAYOUT.uLines[i - 1])) problems.push(`lettered street order broken at index ${i}`);
}

const summary = CITY_VENUES.map((v) => `${v.id} "${v.sign}" h${v.height}m on block ${v.block.col},${v.block.row}`);

if (problems.length) {
  console.error('City venue layout check FAILED');
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

console.log(`City venue layout check passed (${CITY_VENUES.length} destinations)`);
for (const line of summary) console.log(`  - ${line}`);
