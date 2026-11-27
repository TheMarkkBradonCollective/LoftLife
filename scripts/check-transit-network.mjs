// Transit network invariants + a cheap performance measurement.
//
// Bundles the server transit/travel modules with esbuild (the same tool CI
// uses) and checks that the city really has multiple bus routes, multiple
// light-rail lines, an autonomous taxi fleet with no driver seats, valid
// destinations, and a server-side tick that stays cheap.
//
// Run with: npm run check:transit

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'loftlife-transit-'));
const bundle = (entry, name) => {
  const out = join(dir, name);
  execFileSync(
    'npx',
    ['esbuild', entry, '--bundle', '--format=esm', '--platform=node', `--outfile=${out}`, '--log-level=error'],
    { stdio: 'inherit' }
  );
  return out;
};

let transit;
let travel;
try {
  transit = await import(bundle('server/transit.mjs', 'transit.mjs'));
  travel = await import(bundle('server/travel.mjs', 'travel.mjs'));
} finally {
  setTimeout(() => rmSync(dir, { recursive: true, force: true }), 0);
}

const problems = [];
const check = (condition, message) => {
  if (!condition) problems.push(message);
};

const lines = transit.TRANSIT_LINES;
const buses = lines.filter((line) => line.kind === 'bus');
const rails = lines.filter((line) => line.kind === 'rail');
check(buses.length >= 3, `expected at least 3 bus routes, found ${buses.length}`);
check(rails.length >= 2, `expected at least 2 light-rail lines, found ${rails.length}`);
check(rails.every((line) => line.stops.length >= 5), 'each rail line needs at least 5 stations');
check(new Set(lines.map((line) => line.id)).size === lines.length, 'line ids must be unique');
check(transit.TRANSIT_HUBS.length >= 1, 'an intercity rail hub is required');
check(transit.TAXI_DESTINATIONS.length >= 5, 'taxis need at least 5 valid destinations');
check(travel.CITY_TRAVEL_DESTINATIONS.length >= 4, 'intercity travel needs city destinations');

const stopKeys = new Set();
for (const line of lines) {
  check(line.stops.length === 0 || line.stops.every((stop) => stop.id), `${line.id} has an unnamed stop`);
  for (const stop of line.stops) {
    const key = `${line.id}:${stop.id}`;
    check(!stopKeys.has(key), `duplicate stop ${key}`);
    stopKeys.add(key);
    check(Number.isFinite(stop.x) && Number.isFinite(stop.z), `${key} has no coordinates`);
  }
}
for (const destination of transit.TAXI_DESTINATIONS) {
  check(destination.arrival, `${destination.id} has no arrival point`);
}

transit.resetTransit();
const fleet = transit.ensureFleet('check-city');
const taxis = [...fleet.values()].filter((vehicle) => vehicle.kind === 'taxi');
check(taxis.length === 3, `expected 3 autonomous taxis, found ${taxis.length}`);
check(taxis.every((taxi) => taxi.riders.size === 0), 'taxis must not have NPC drivers');

const started = Date.now();
const origin = new Map(taxis.map((taxi) => [taxi.id, { x: taxi.x, z: taxi.z }]));
let previous = started;
for (let i = 0; i < 900; i++) {
  const now = started + i * 100;
  transit.stepTransit(now, previous, () => []);
  previous = now;
}
const elapsed = Date.now() - started;
const moved = taxis.filter((taxi) => {
  const start = origin.get(taxi.id);
  return Math.hypot(taxi.x - start.x, taxi.z - start.z) > 2;
});
check(moved.length === 3, 'autonomous taxis should cruise the loop with no riders');
check(elapsed < 2_000, `fleet update is too slow: ${elapsed} ms for 900 ticks`);

const vehicles = transit.vehiclesFor('check-city', started + 60_000);
const kinds = new Set(vehicles.map((vehicle) => vehicle.kind));
for (const kind of ['bus', 'rail', 'taxi']) check(kinds.has(kind), `ambient fleet is missing ${kind}`);
transit.resetTransit();

if (problems.length) {
  console.error('Transit network check failed:');
  for (const problem of problems) console.error(` - ${problem}`);
  process.exit(1);
}

console.log('Transit network OK');
console.log(`  bus routes:  ${buses.length} (${buses.map((line) => line.id).join(', ')})`);
console.log(`  rail lines:  ${rails.length} (${rails.map((line) => line.id).join(', ')})`);
console.log(`  stations:    ${rails.reduce((total, line) => total + line.stops.length, 0)}`);
console.log(`  taxi stops:  ${transit.TAXI_DESTINATIONS.length}`);
console.log(`  intercity:   ${travel.CITY_TRAVEL_DESTINATIONS.length} city destinations`);
console.log(`  fleet tick:  ${elapsed} ms for 900 ticks (90 s simulated, ambient fleet)`);
