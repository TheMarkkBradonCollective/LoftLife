import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CROWD_DETAIL_LIMITS,
  CROWD_ROLES,
  assignCrowdDetail,
  buildCrowdRoute,
  createCrowd,
  crowdStats,
  crowdToWorld,
  crowdWorldToU,
  crossingsFor,
  recycleDistantCrowd,
  sidewalkLoop,
  stepCrowd,
} from '../../shared/city-crowd.mjs';

const SPACING = 44;
const BLOCK_SIZE = 30;

function block(col, row, kind = 'building') {
  return {
    col,
    row,
    uMin: col * SPACING,
    uMax: col * SPACING + BLOCK_SIZE,
    zMin: row * SPACING,
    zMax: row * SPACING + BLOCK_SIZE,
    kind,
    district: 'downtown',
    sidewalk: 4,
    setback: 2,
    walkHeight: 0.05,
    height: 24,
    setbackHeight: 0,
    facadeStyle: 0,
    paletteIndex: 0,
    hasTowerCrown: false,
    subSplit: 'none',
    illuminated: false,
  };
}

function city(size = 8) {
  const blocks = [];
  for (let col = 0; col < size; col += 1) {
    for (let row = 0; row < size; row += 1) blocks.push(block(col, row));
  }
  const venueBlock = blocks.find((entry) => entry.col === 2 && entry.row === 2);
  const venue = {
    id: 'cafe',
    name: 'Test Café',
    block: venueBlock,
    u0: 90,
    u1: 116,
    z0: 90,
    z1: 116,
    iu0: 91,
    iu1: 115,
    iz0: 91,
    iz1: 115,
    doorPos: crowdToWorld(103, 117),
    insidePos: crowdToWorld(103, 114),
    arrivalPos: crowdToWorld(103, 118),
  };
  const seat = { id: 'seat-cafe-1', label: 'Café seat', ...crowdToWorld(104, 104), facingYaw: Math.PI };
  const center = crowdToWorld(103, 103);
  return { blocks, venues: [venue], seats: [seat], center, venueBlock, venue, seat };
}

function crowdAt(seed = 11, count = 40, size = 8) {
  const data = city(size);
  const crowd = createCrowd({
    blocks: data.blocks,
    venues: data.venues,
    seats: data.seats,
    count,
    seed,
    center: data.center,
    radius: 400,
  });
  return { crowd, ...data };
}

function insideAnyBlock(blocks, x, z, margin = 0.35) {
  const u = crowdWorldToU(x, z);
  return blocks.some(
    (entry) =>
      u >= entry.uMin - margin &&
      u <= entry.uMax + margin &&
      z >= entry.zMin - margin &&
      z <= entry.zMax + margin
  );
}

test('sidewalk rings sit inside the block and keep every corner', () => {
  const b = block(1, 1);
  const loop = sidewalkLoop(b);
  assert.equal(loop.length, 8);
  assert.equal(loop.filter((point) => point.corner).length, 4);
  for (const point of loop) {
    assert.ok(point.u > b.uMin && point.u < b.uMax);
    assert.ok(point.z > b.zMin && point.z < b.zMax);
  }
});

test('crosswalks only exist where a real neighbour block is adjacent', () => {
  const blocks = city(3).blocks;
  const map = new Map(blocks.map((entry) => [`${entry.col}:${entry.row}`, entry]));
  const middle = map.get('1:1');
  const crossings = crossingsFor(middle, map);
  assert.ok(crossings.length >= 4);
  for (const crossing of crossings) {
    assert.ok(['letter-street', 'numbered-street'].includes(crossing.axis));
    assert.notEqual(crossing.block, middle);
    assert.ok([0, 2, 4, 6].includes(crossing.fromCorner));
    assert.ok([0, 2, 4, 6].includes(crossing.toCorner));
  }
  // A corner block has only two possible neighbours.
  assert.ok(crossingsFor(map.get('0:0'), map).length <= 4);
});

test('population is deterministic for a seed and uses every role', () => {
  const a = crowdAt(31, 60);
  const b = crowdAt(31, 60);
  assert.deepEqual(
    a.crowd.agents.map((agent) => [agent.id, agent.role, agent.x.toFixed(3), agent.z.toFixed(3), agent.avatar.hairStyle]),
    b.crowd.agents.map((agent) => [agent.id, agent.role, agent.x.toFixed(3), agent.z.toFixed(3), agent.avatar.hairStyle])
  );
  const roles = crowdStats(a.crowd.agents).byRole;
  for (const role of CROWD_ROLES) assert.ok((roles[role] ?? 0) > 0, `role ${role} missing from population`);
  const appearances = new Set(a.crowd.agents.map((agent) => `${agent.avatar.skinTone}|${agent.avatar.topColor}|${agent.avatar.hairStyle}`));
  assert.ok(appearances.size > 20, 'crowd should not repeat one appearance');
});

test('pedestrians stay on sidewalks, cross at corners and visit venues', () => {
  const { crowd, blocks } = crowdAt(7, 44);
  let crossings = 0;
  let seated = 0;
  let inside = 0;
  const crossedBlocks = new Set();

  for (let frame = 0; frame < 5500; frame += 1) {
    stepCrowd(crowd, 1 / 30, crowd.center, { quality: 'high' });
    for (const agent of crowd.agents) {
      const onCrossing = agent.goals[0]?.kind === 'cross';
      if (onCrossing) {
        crossings += 1;
        crossedBlocks.add(`${agent.goals[0].crossing.block.col}:${agent.goals[0].crossing.block.row}`);
        continue;
      }
      assert.ok(
        insideAnyBlock(blocks, agent.x, agent.z),
        `${agent.id} (${agent.role}, ${agent.mode}) left the sidewalk at ${agent.x.toFixed(1)},${agent.z.toFixed(1)}`
      );
      if (agent.seated) seated += 1;
      if (agent.mode === 'inside') inside += 1;
    }
  }

  assert.ok(crossings > 0, 'no street crossings were scheduled');
  assert.ok(crossedBlocks.size > 0, 'no pedestrian reached a neighbouring block');
  assert.ok(seated > 0, 'no NPC ever sat on a venue seat');
  assert.ok(inside > 0, 'no NPC ever entered a public destination');
});

test('nearby players are noticed, faced and greeted', () => {
  const { crowd } = crowdAt(3, 24);
  const agent = crowd.agents.find((entry) => entry.role === 'pedestrian');
  assert.ok(agent);
  agent.reactCooldown = 0;
  let reacted = false;
  for (let frame = 0; frame < 900 && !reacted; frame += 1) {
    agent.reactCooldown = Math.max(0, agent.reactCooldown - 1 / 30);
    stepCrowd(crowd, 1 / 30, { x: agent.x + 0.4, z: agent.z + 0.4 }, { quality: 'high' });
    if (agent.mode === 'react') {
      assert.ok(agent.emote === 'wave' || agent.emote === 'talk');
      reacted = true;
    }
  }
  assert.ok(reacted, 'a pedestrian never reacted to a player standing beside it');
});

test('render tiers respect each graphics budget', () => {
  const { crowd } = crowdAt(5, 40);
  stepCrowd(crowd, 1 / 30, crowd.center, { quality: 'high' });
  const high = crowdStats(crowd.agents).byDetail;
  assert.ok((high.rig ?? 0) <= CROWD_DETAIL_LIMITS.high.rigs);
  assert.ok((high.prop ?? 0) <= CROWD_DETAIL_LIMITS.high.props);
  assert.ok((high.hidden ?? 0) > 0);

  assignCrowdDetail(crowd, crowd.center, 'low');
  const low = crowdStats(crowd.agents).byDetail;
  assert.ok((low.rig ?? 0) <= CROWD_DETAIL_LIMITS.low.rigs);
  assert.ok((low.prop ?? 0) <= CROWD_DETAIL_LIMITS.low.props);
  assert.ok((low.rig ?? 0) < (high.rig ?? 0));
});

test('distant agents are recycled near the player without popping in view', () => {
  const { crowd, blocks, center } = crowdAt(13, 40);
  stepCrowd(crowd, 1 / 30, center, { quality: 'high' });
  const far = { x: crowdToWorld(7 * SPACING + 15, 7 * SPACING + 15).x, z: 7 * SPACING + 15 };
  stepCrowd(crowd, 1 / 30, far, { quality: 'high' });
  const moved = recycleDistantCrowd(crowd, far, { minDistance: 150, maxMoves: 6, radius: 120 });
  assert.ok(moved.length > 0, 'no distant agents were recycled');
  for (const agent of moved) {
    const distance = Math.hypot(agent.x - far.x, agent.z - far.z);
    assert.ok(distance >= 20 && distance <= 125, `recycled agent landed ${distance.toFixed(1)}m away`);
    assert.ok(insideAnyBlock(blocks, agent.x, agent.z));
  }
});

test('routes regenerate from a stranded agent and never return an empty walk', () => {
  const { crowd } = crowdAt(17, 8);
  const agent = crowd.agents[0];
  const route = buildCrowdRoute(agent, crowd.context, crowd.rng);
  assert.ok(Array.isArray(route));
  assert.ok(route.length > 0);
  assert.ok(route.every((goal) => Number.isFinite(goal.x) && Number.isFinite(goal.z)));
});
