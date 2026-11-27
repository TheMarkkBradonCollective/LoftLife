#!/usr/bin/env node
/**
 * Real-city validation for the crowd system.
 *
 * Uses the actual 725-block city and all eleven public destinations, not test
 * fixtures, and reports population, crossings, venue visits, LOD tiers and the
 * simulation cost. Run with `npm run check:people` (Node 22+ with type
 * stripping; this workspace runs Node 24).
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import {
  assignCrowdDetail,
  createCrowd,
  crowdStats,
  crowdToWorld,
  crowdWorldToU,
  recycleDistantCrowd,
  stepCrowd,
} from '../shared/city-crowd.mjs';
import { CHARACTER_LIBRARY } from '../shared/catalog/character-library.mjs';
import { VEHICLE_LIBRARY } from '../shared/catalog/vehicle-library.mjs';

// The city modules are TypeScript with extensionless imports (Vite resolves
// them); bundle only the pure layout data so a plain Node check can import it.
const cacheDir = path.join(process.cwd(), 'node_modules', '.cache');
fs.mkdirSync(cacheDir, { recursive: true });
const bundlePath = path.join(cacheDir, `loftlife-city-data-${process.pid}.mjs`);
await build({
  stdin: {
    contents:
      "import { CITY_LAYOUT } from './src/game/cityLayout';\nimport { CITY_VENUES } from './src/game/venues';\nexport { CITY_LAYOUT, CITY_VENUES };\n",
    resolveDir: process.cwd(),
    loader: 'ts',
  },
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: bundlePath,
  logLevel: 'silent',
});
const { CITY_LAYOUT, CITY_VENUES } = await import(pathToFileURL(bundlePath).href);
fs.rmSync(bundlePath, { force: true });

const seats = CITY_VENUES.map((venue) => ({
  id: `${venue.id}-check-seat`,
  label: `${venue.name} seat`,
  x: venue.insidePos.x,
  z: venue.insidePos.z,
  facingYaw: 0,
}));

const crowd = createCrowd({
  blocks: CITY_LAYOUT.blocks,
  venues: CITY_VENUES,
  seats,
  count: 30,
  seed: 20261127,
  center: CITY_LAYOUT.loftCenter,
  radius: 260,
});

const player = { x: CITY_LAYOUT.loftCenter.x, z: CITY_LAYOUT.loftCenter.z };
const start = performance.now();
let crossings = 0;
let venueVisits = 0;
let sitFrames = 0;
let outside = 0;
let maxDistance = 0;

for (let frame = 0; frame < 3600; frame += 1) {
  stepCrowd(crowd, 1 / 30, player, { quality: 'high' });
  for (const agent of crowd.agents) {
    if (agent.distance > maxDistance) maxDistance = agent.distance;
    if (agent.goals[0]?.kind === 'cross') crossings += 1;
    if (agent.mode === 'inside') venueVisits += 1;
    if (agent.seated) sitFrames += 1;
    if (agent.goals[0]?.kind !== 'cross') {
      const u = crowdWorldToU(agent.x, agent.z);
      const inside = CITY_LAYOUT.blocks.some(
        (block) => u >= block.uMin - 0.4 && u <= block.uMax + 0.4 && agent.z >= block.zMin - 0.4 && agent.z <= block.zMax + 0.4
      );
      if (!inside) outside += 1;
    }
  }
}
const elapsed = performance.now() - start;

assignCrowdDetail(crowd, player, 'high');
const high = crowdStats(crowd.agents);
assignCrowdDetail(crowd, player, 'low');
const low = crowdStats(crowd.agents);

const farBlock = CITY_LAYOUT.blocks.find((block) => block.col === 20 && block.row === 24);
const far = crowdToWorld((farBlock.uMin + farBlock.uMax) / 2, (farBlock.zMin + farBlock.zMax) / 2);
stepCrowd(crowd, 1 / 30, far, { quality: 'high' });
const recycled = recycleDistantCrowd(crowd, far, { minDistance: 150, maxMoves: 4 });

const result = {
  blocks: CITY_LAYOUT.blocks.length,
  venues: CITY_VENUES.length,
  agents: crowd.count,
  roles: high.byRole,
  highTier: high.byDetail,
  lowTier: low.byDetail,
  crossingsObserved: crossings,
  venueVisitFrames: venueVisits,
  seatedFrames: sitFrames,
  sidewalkViolations: outside,
  farthestAgentM: Math.round(maxDistance),
  recycledAgents: recycled.length,
  simulatedSeconds: 120,
  simulationMs: Math.round(elapsed * 10) / 10,
  msPerFrame: Math.round((elapsed / 3600) * 1000) / 1000,
  characters: { total: CHARACTER_LIBRARY.count, counts: CHARACTER_LIBRARY.counts, animationSets: CHARACTER_LIBRARY.animationSets.length },
  vehicles: { total: VEHICLE_LIBRARY.count, counts: VEHICLE_LIBRARY.counts, inWorldFleet: VEHICLE_LIBRARY.inWorldFleet.map((entry) => entry.id) },
};

console.log(JSON.stringify(result, null, 2));

if (outside > 0) {
  console.error(`FAIL: ${outside} agent frames left a city block`);
  process.exit(1);
}
if (crossings === 0) {
  console.error('FAIL: no pedestrian used a crosswalk');
  process.exit(1);
}
if (venueVisits === 0 || sitFrames === 0) {
  console.error('FAIL: no NPC visited or sat inside a venue');
  process.exit(1);
}
if ((high.byDetail.rig ?? 0) > 8 || (high.byDetail.prop ?? 0) > 22) {
  console.error('FAIL: high-quality crowd exceeded its render budget');
  process.exit(1);
}
if (recycled.length === 0) {
  console.error('FAIL: distant population was not recycled');
  process.exit(1);
}
console.log('PASS: real-city crowd stayed on sidewalks, crossed at corners, visited venues and respected the LOD budget.');
