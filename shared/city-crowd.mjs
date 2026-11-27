/**
 * Deterministic city population simulation.
 *
 * Pure data + maths, shared by the Three.js crowd renderer and the automated
 * tests. Nothing here touches the DOM, Three.js, React or the network, so the
 * same agent update can be unit-tested and (later) replayed on an authority.
 *
 * Design rules:
 *  - Pedestrians walk the sidewalk ring of a city block, never through the
 *    building footprint. Street crossings happen at block corners, which are
 *    the city's crosswalk locations.
 *  - Venue visits use the destination's real door and interior points.
 *  - Sitting uses a real venue seat, so the avatar's sit pose lands on geometry.
 *  - Nearby players are noticed: the agent pauses, faces them and waves/talks.
 *  - Distant agents are frozen and can be recycled to a block near the player,
 *    so a bounded population always feels present without simulating the whole
 *    city.
 */

export const CROWD_ROLES = Object.freeze(['pedestrian', 'sitter', 'loiterer', 'worker']);

export const ROLE_WEIGHTS = Object.freeze({
  pedestrian: 0.62,
  sitter: 0.14,
  loiterer: 0.14,
  worker: 0.1,
});

/** Detail budgets by graphics quality. Rig avatars are the expensive tier. */
export const CROWD_DETAIL_LIMITS = Object.freeze({
  high: { rigs: 8, props: 22, range: 155, rigRange: 44, activeRange: 185 },
  medium: { rigs: 5, props: 14, range: 120, rigRange: 34, activeRange: 155 },
  low: { rigs: 3, props: 8, range: 88, rigRange: 24, activeRange: 120 },
});

export const CROWD_NAMES = Object.freeze([
  'Avery', 'Bea', 'Caleb', 'Dani', 'Eli', 'Fern', 'Gabe', 'Hana', 'Iris', 'Jules',
  'Kira', 'Lena', 'Miles', 'Noor', 'Omar', 'Priya', 'Quinn', 'Rosa', 'Sam', 'Tess',
  'Umar', 'Vera', 'Wes', 'Xena', 'Yara', 'Zane', 'Mika', 'Theo', 'Nadia', 'Ravi',
]);

const SKIN_TONES = ['#f5d6c0', '#e8b48f', '#d3976d', '#ae7248', '#8a5636', '#5f3a24', '#f0c9a8', '#c98858'];
const HAIR_COLORS = ['#2f2119', '#171513', '#5a3a24', '#8a5a34', '#b55436', '#7482b8', '#d9c7a8', '#3b2a3f'];
const TOP_COLORS = ['#e6dfd3', '#39465c', '#c86b51', '#456799', '#6d8b72', '#2f2f34', '#b08d57', '#785874', '#d49a45', '#8fa9b4'];
const BOTTOM_COLORS = ['#2b3a2a', '#26282e', '#364152', '#c7b08e', '#5a3f2c', '#44506b', '#6f6a63'];
const SHOE_COLORS = ['#1b1b1b', '#eae4d8', '#32363f', '#8a5a34', '#d697a0'];
const HAIR_STYLES = ['bob', 'afro', 'ponytail', 'sidepart', 'buns', 'spiky', 'long_waves', 'buzz', 'curls', 'locs', 'pixie', 'middle_part', 'top_knot', 'shoulder_waves', 'braids', 'undercut', 'fade', 'curtain'];
const TOP_STYLES = ['hoodie', 'blazer', 'tee', 'turtleneck', 'button_shirt', 'sweater', 'jacket', 'tank', 'varsity', 'raincoat', 'suit', 'dress', 'crop_hoodie', 'cardigan'];
const BOTTOM_STYLES = ['jeans', 'chinos', 'shorts', 'skirt', 'joggers', 'dress_pants', 'cargo'];
const ACCESSORIES = ['none', 'none', 'glasses', 'headphones', 'beanie', 'cap', 'bucket_hat', 'sunglasses', 'scarf'];
const BODY_PRESETS = ['balanced', 'soft', 'athletic', 'broad'];
const HEIGHTS = ['petite', 'average', 'average', 'tall'];
const BUILDS = ['slim', 'average', 'average', 'athletic', 'curvy'];
const FACE_SHAPES = ['oval', 'square', 'heart', 'round'];
const EYE_SHAPES = ['almond', 'round', 'hooded', 'upturned'];
const EYE_STYLES = ['warm_brown', 'deep_brown', 'hazel', 'green', 'blue', 'gray'];
const FACIAL_DETAILS = ['none', 'none', 'none', 'freckles', 'beauty_mark', 'blush'];
const JEWELRY = ['none', 'none', 'none', 'earrings', 'watch', 'chain'];
const CARRY = ['none', 'none', 'none', 'backpack', 'tote', 'purse'];
const FACIAL_HAIR = ['none', 'none', 'none', 'stubble', 'beard', 'goatee', 'mustache'];

const BLOCK_KEY = (block) => `${block.col}:${block.row}`;
const VENUE_BLOCK_KEY = (venue) => `${venue.block.col}:${venue.block.row}`;

/** Seeded PRNG: same seed produces the same population on every device. */
export function createRng(seed = 1) {
  let state = seed >>> 0 || 1;
  return function rng() {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = (rng, list) => list[Math.floor(rng() * list.length) % list.length];

/** LoftLife's diagonal street slope: world x = u + slope * z. */
export const CITY_CROWD_SLOPE = 0.42;

/** Diagonal city (u, z) -> world (x, z). */
export function crowdToWorld(u, z) {
  return { x: u + CITY_CROWD_SLOPE * z, z };
}

const CITY_LAYOUT_SLOPE = CITY_CROWD_SLOPE;

export function crowdWorldToU(x, z) {
  return x - CITY_LAYOUT_SLOPE * z;
}

function blockUsable(block) {
  return block && block.kind !== 'airport' && (block.uMax - block.uMin) > 8 && (block.zMax - block.zMin) > 8;
}

/** Half-width of the sidewalk band, clamped so the path stays on the block. */
function sidewalkInset(block) {
  const depth = Number.isFinite(block.sidewalk) ? block.sidewalk : 2.4;
  const maxInset = Math.max(0.8, Math.min(block.uMax - block.uMin, block.zMax - block.zMin) / 2 - 0.7);
  return Math.max(0.9, Math.min(maxInset, depth * 0.55));
}

/**
 * The eight-point sidewalk ring of one block, inset into the sidewalk band.
 * Corners are at indices 0, 2, 4 and 6.
 */
export function sidewalkLoop(block) {
  if (!block) return [];
  const inset = sidewalkInset(block);
  const u0 = block.uMin + inset;
  const u1 = block.uMax - inset;
  const z0 = block.zMin + inset;
  const z1 = block.zMax - inset;
  const mu = (u0 + u1) / 2;
  const mz = (z0 + z1) / 2;
  return [
    { ...crowdToWorld(u0, z0), u: u0, z: z0, corner: true, name: 'north-west' },
    { ...crowdToWorld(mu, z0), u: mu, z: z0, corner: false, name: 'north' },
    { ...crowdToWorld(u1, z0), u: u1, z: z0, corner: true, name: 'north-east' },
    { ...crowdToWorld(u1, mz), u: u1, z: mz, corner: false, name: 'east' },
    { ...crowdToWorld(u1, z1), u: u1, z: z1, corner: true, name: 'south-east' },
    { ...crowdToWorld(mu, z1), u: mu, z: z1, corner: false, name: 'south' },
    { ...crowdToWorld(u0, z1), u: u0, z: z1, corner: true, name: 'south-west' },
    { ...crowdToWorld(u0, mz), u: u0, z: mz, corner: false, name: 'west' },
  ];
}

/**
 * Crosswalk options at each corner of a block.
 *
 * `toCorner` is the index of the matching corner on the neighbour's sidewalk
 * ring. Walking that straight segment crosses one street at the intersection,
 * exactly where the city paints its crossings.
 */
export function crossingsFor(block, blockMap) {
  const options = [];
  const uInset = sidewalkInset(block);
  const pairs = [
    { from: 2, du: 1, dz: 0, to: 0 }, // north-east -> east neighbour's north-west
    { from: 4, du: 1, dz: 0, to: 6 }, // south-east -> east neighbour's south-west
    { from: 2, du: 0, dz: -1, to: 6 }, // north-east -> north neighbour's south-west
    { from: 0, du: 0, dz: -1, to: 4 }, // north-west -> north neighbour's south-east
    { from: 4, du: 0, dz: 1, to: 0 }, // south-east -> south neighbour's north-east
    { from: 6, du: 0, dz: 1, to: 2 }, // south-west -> south neighbour's north-east corner
  ];
  for (const pair of pairs) {
    const neighbour = blockMap.get(`${block.col + pair.du}:${block.row + pair.dz}`);
    if (!neighbour || !blockUsable(neighbour)) continue;
    const loop = sidewalkLoop(neighbour);
    const target = loop[pair.to];
    if (!target) continue;
    options.push({
      fromCorner: pair.from,
      toCorner: pair.to,
      block: neighbour,
      x: target.x,
      z: target.z,
      u: target.u,
      name: target.name,
      axis: pair.du !== 0 ? 'letter-street' : 'numbered-street',
    });
  }
  return options;
}

/** Venue seats grouped by the block they sit on. */
function seatsByBlock(venues, seats) {
  const map = new Map();
  for (const seat of seats ?? []) {
    const u = crowdWorldToU(seat.x, seat.z);
    const venue = (venues ?? []).find(
      (entry) => u >= entry.iu0 - 0.6 && u <= entry.iu1 + 0.6 && seat.z >= entry.iz0 - 0.6 && seat.z <= entry.iz1 + 0.6
    );
    if (!venue) continue;
    const key = VENUE_BLOCK_KEY(venue);
    if (!map.has(key)) map.set(key, { venue, seats: [] });
    map.get(key).seats.push(seat);
  }
  return map;
}

function venuesByBlock(venues) {
  const map = new Map();
  for (const venue of venues ?? []) map.set(VENUE_BLOCK_KEY(venue), venue);
  return map;
}

/** A varied but always valid avatar configuration for a crowd role. */
export function randomCrowdAvatar(rng, role = 'pedestrian', name = '') {
  const formal = role === 'worker';
  const topStyle = formal ? pick(rng, ['blazer', 'button_shirt', 'suit', 'turtleneck', 'cardigan']) : pick(rng, TOP_STYLES);
  const bottomStyle = formal ? pick(rng, ['chinos', 'dress_pants', 'jeans']) : pick(rng, BOTTOM_STYLES);
  const maleFacialHair = rng() < (formal ? 0.12 : 0.2);
  return {
    name: name || pick(rng, CROWD_NAMES),
    skinTone: pick(rng, SKIN_TONES),
    bodyPreset: pick(rng, BODY_PRESETS),
    height: pick(rng, HEIGHTS),
    build: pick(rng, BUILDS),
    faceShape: pick(rng, FACE_SHAPES),
    eyeShape: pick(rng, EYE_SHAPES),
    eyeStyle: pick(rng, EYE_STYLES),
    eyebrows: pick(rng, ['natural', 'natural', 'bold', 'thin', 'arched']),
    facialDetail: pick(rng, FACIAL_DETAILS),
    facialHair: maleFacialHair ? pick(rng, FACIAL_HAIR) : 'none',
    hairStyle: pick(rng, HAIR_STYLES),
    hairColor: pick(rng, HAIR_COLORS),
    topStyle,
    topColor: pick(rng, TOP_COLORS),
    bottomStyle,
    bottomColor: pick(rng, BOTTOM_COLORS),
    shoeColor: pick(rng, SHOE_COLORS),
    accessory: formal ? pick(rng, ['none', 'none', 'glasses']) : pick(rng, ACCESSORIES),
    jewelry: pick(rng, JEWELRY),
    carry: role === 'pedestrian' ? pick(rng, CARRY) : pick(rng, ['none', 'none', 'none', 'backpack']),
    makeupStyle: rng() < 0.34 ? pick(rng, ['natural', 'soft', 'bold']) : 'none',
  };
}

/** Choose a role, renormalising when the city has no seats or venues. */
function chooseRole(rng, hasSeats, hasVenue) {
  const roll = rng();
  if (hasSeats && roll < ROLE_WEIGHTS.sitter) return 'sitter';
  if (hasVenue && roll < ROLE_WEIGHTS.sitter + ROLE_WEIGHTS.loiterer) return 'loiterer';
  if (hasVenue && roll < ROLE_WEIGHTS.sitter + ROLE_WEIGHTS.loiterer + ROLE_WEIGHTS.worker) return 'worker';
  return 'pedestrian';
}

function blocksSupporting(role, blocks, venueMap, seatMap) {
  if (role === 'sitter') return blocks.filter((block) => (seatMap.get(BLOCK_KEY(block))?.seats.length ?? 0) > 0);
  if (role === 'worker' || role === 'loiterer') return blocks.filter((block) => venueMap.has(BLOCK_KEY(block)));
  return blocks;
}

function goalAt(point, kind = 'walk', extra = {}) {
  return { x: point.x, z: point.z, kind, ...extra };
}

/** Keep a wandering point on its block's sidewalk band. */
function clampToBlock(block, x, z) {
  const margin = 0.9;
  const clampedZ = Math.min(block.zMax - margin, Math.max(block.zMin + margin, z));
  const u = Math.min(block.uMax - margin, Math.max(block.uMin + margin, crowdWorldToU(x, clampedZ)));
  return { x: u + CITY_CROWD_SLOPE * clampedZ, z: clampedZ, u, zU: clampedZ };
}

/**
 * Build the next set of goals for one agent.
 * `context` carries the block map, venues and seats for the whole city.
 */
export function buildCrowdRoute(agent, context, rng) {
  const { blockMap, venuesByBlock: venueMap, seatsByBlock: seatMap } = context;
  const key = BLOCK_KEY(agent.block);
  const venue = venueMap.get(key);
  const seatGroup = seatMap.get(key);

  if (agent.role === 'sitter' && seatGroup?.seats.length) {
    const seat = pick(rng, seatGroup.seats);
    const facing = Number.isFinite(seat.facingYaw) ? seat.facingYaw : 0;
    const approach = {
      x: seat.x + Math.sin(facing) * 0.75,
      z: seat.z + Math.cos(facing) * 0.75,
    };
    const goals = [
      goalAt(approach, 'walk'),
      goalAt(seat, 'sit', { wait: 45 + rng() * 75, emote: 'sit', seatId: seat.id, venueId: venue?.id }),
      goalAt(approach, 'walk'),
    ];
    const loop = sidewalkLoop(agent.block);
    if (loop.length) {
      const start = Math.floor(rng() * loop.length);
      goals.push(goalAt(loop[start], 'walk'), goalAt(loop[(start + 1) % loop.length], 'walk', { wait: 4 + rng() * 6, emote: 'idle' }));
    }
    return goals;
  }

  if (agent.role === 'worker' && venue) {
    const inside = { x: venue.insidePos.x, z: venue.insidePos.z };
    const offset = {
      x: inside.x + (rng() - 0.5) * 2.2,
      z: inside.z + (rng() - 0.5) * 2.2,
    };
    return [
      goalAt(venue.doorPos, 'walk'),
      goalAt(inside, 'walk'),
      goalAt(offset, 'inside', { wait: 18 + rng() * 34, emote: rng() < 0.5 ? 'talk' : 'idle', venueId: venue.id }),
      goalAt(venue.insidePos, 'walk'),
      goalAt(venue.doorPos, 'walk'),
    ];
  }

  if (agent.role === 'loiterer' && venue) {
    const door = venue.doorPos;
    const spot = clampToBlock(
      agent.block,
      door.x + (rng() - 0.5) * 4.2,
      door.z + (rng() - 0.5) * 4.2
    );
    const goals = [
      goalAt(spot, 'walk'),
      goalAt(spot, 'wait', { wait: 8 + rng() * 18, emote: rng() < 0.45 ? 'talk' : rng() < 0.4 ? 'gesture' : 'idle' }),
    ];
    if (rng() < 0.35) {
      goals.push(goalAt(venue.doorPos, 'walk'), goalAt(venue.insidePos, 'inside', { wait: 7 + rng() * 12, emote: 'talk', venueId: venue.id }), goalAt(venue.doorPos, 'walk'));
    }
    const loop = sidewalkLoop(agent.block);
    if (loop.length) goals.push(goalAt(loop[Math.floor(rng() * loop.length)], 'walk'));
    return goals;
  }

  // Pedestrian: walk a block ring, sometimes crossing at a corner, sometimes
  // dropping into the destination on this block.
  const loop = sidewalkLoop(agent.block);
  const start = agent.cornerIndex ?? Math.floor(rng() * loop.length);
  const direction = agent.direction ?? (rng() < 0.5 ? -1 : 1);
  const { goals, index, block } = walkLoopWithCrossings(agent.block, blockMap, start, direction, rng);
  agent.block = block;
  agent.blockKey = BLOCK_KEY(block);
  agent.cornerIndex = index;
  agent.direction = direction;
  if (venue && rng() < 0.28) {
    const insertAt = Math.min(goals.length, 1 + Math.floor(rng() * Math.max(1, goals.length - 1)));
    goals.splice(
      insertAt,
      0,
      goalAt(venue.doorPos, 'walk'),
      goalAt(venue.insidePos, 'inside', { wait: 8 + rng() * 16, emote: rng() < 0.6 ? 'talk' : 'idle', venueId: venue.id }),
      goalAt(venue.doorPos, 'walk')
    );
  }
  return goals;
}

/** Build up to eight sidewalk waypoints, following crossings where possible. */
function walkLoopWithCrossings(block, blockMap, startIndex, direction, rng) {
  let activeBlock = block;
  let loop = sidewalkLoop(activeBlock);
  let current = startIndex % loop.length;
  let dir = direction;
  const goals = [];
  for (let step = 0; step < 8; step += 1) {
    const point = loop[current];
    goals.push(goalAt(point, 'walk'));
    if (point.corner && rng() < 0.22) {
      const options = crossingsFor(activeBlock, blockMap).filter((option) => option.fromCorner === current);
      if (options.length) {
        const chosen = pick(rng, options);
        goals.push({ ...goalAt({ x: chosen.x, z: chosen.z }, 'cross'), crossing: chosen });
        activeBlock = chosen.block;
        loop = sidewalkLoop(activeBlock);
        current = chosen.toCorner;
        dir = rng() < 0.5 ? -1 : 1;
        continue;
      }
    }
    current = (current + dir + loop.length) % loop.length;
  }
  return { goals, index: current, block: activeBlock };
}

/** Pick a starting block near the player's spawn. */
function blocksNear(blocks, center, radius) {
  return blocks.filter((block) => {
    if (!blockUsable(block)) return false;
    const cx = (block.uMin + block.uMax) / 2;
    const cz = (block.zMin + block.zMax) / 2;
    return Math.hypot(cx + CITY_LAYOUT_SLOPE * cz - center.x, cz - center.z) <= radius;
  });
}

/**
 * Create a deterministic city population.
 *
 * @param {object} options
 * @param {Array} options.blocks city blocks (`CITY_LAYOUT.blocks`)
 * @param {Array} options.venues public destinations (`CITY_VENUES`)
 * @param {Array} options.seats venue seats from the venue builder
 * @param {number} [options.count]
 * @param {number} [options.seed]
 * @param {{x:number,z:number}} options.center player spawn / first focus
 * @param {number} [options.radius] spawn search radius in metres
 */
export function createCrowd({
  blocks = [],
  venues = [],
  seats = [],
  count = 26,
  seed = 1,
  center = { x: 0, z: 0 },
  radius = 230,
} = {}) {
  const rng = createRng(seed);
  const blockMap = new Map(blocks.map((block) => [BLOCK_KEY(block), block]));
  const venueMap = venuesByBlock(venues);
  const seatMap = seatsByBlock(venues, seats);
  const spawnBlocks = blocksNear(blocks, center, radius);
  const usable = spawnBlocks.length ? spawnBlocks : blocks.filter(blockUsable);
  const context = { blockMap, venuesByBlock: venueMap, seatsByBlock: seatMap };

  const seatBlocks = blocksSupporting('sitter', usable, venueMap, seatMap);
  const venueBlocks = blocksSupporting('loiterer', usable, venueMap, seatMap);
  const agents = [];
  for (let index = 0; index < count; index += 1) {
    const role = chooseRole(rng, seatBlocks.length > 0, venueBlocks.length > 0);
    const pool = blocksSupporting(role, usable, venueMap, seatMap);
    const block = pool[Math.floor(rng() * pool.length)] ?? usable[0];
    if (!block) break;
    const key = BLOCK_KEY(block);
    const name = CROWD_NAMES[(index * 7 + Math.floor(rng() * CROWD_NAMES.length)) % CROWD_NAMES.length];
    const loop = sidewalkLoop(block);
    const start = loop[Math.floor(rng() * loop.length)] ?? { x: block.uMin, z: block.zMin };
    const agent = {
      id: `crowd-${index + 1}`,
      name,
      role,
      block,
      blockKey: key,
      avatar: randomCrowdAvatar(rng, role, name),
      x: start.x,
      z: start.z,
      u: start.u,
      yaw: rng() * Math.PI * 2,
      speed: 0,
      baseSpeed: role === 'sitter' ? 0.9 : role === 'worker' ? 1.05 : 1.25 + rng() * 0.6,
      mode: 'walking',
      timer: 0,
      goals: [],
      seated: false,
      emote: 'idle',
      detail: 'hidden',
      active: false,
      distance: Infinity,
      reactCooldown: 2 + rng() * 8,
      personalPhase: rng() * Math.PI * 2,
      cornerIndex: Math.floor(rng() * loop.length),
      direction: rng() < 0.5 ? -1 : 1,
      homeBlockKey: key,
    };
    agent.goals = buildCrowdRoute(agent, context, rng);
    agents.push(agent);
  }

  return {
    seed,
    rng,
    center: { ...center },
    count: agents.length,
    agents,
    context,
    blockMap,
    quality: 'high',
  };
}

function distanceTo(agent, player) {
  return Math.hypot(agent.x - player.x, agent.z - player.z);
}

/** Move one agent toward its current goal with separation and arrival rules. */
function advanceAgent(agent, goal, delta, agents, player) {
  const dx = goal.x - agent.x;
  const dz = goal.z - agent.z;
  const dist = Math.hypot(dx, dz);
  const reach = Math.max(0.18, agent.baseSpeed * delta * 1.15);
  if (dist < reach) {
    agent.x = goal.x;
    agent.z = goal.z;
    return true;
  }
  const nx = dx / dist;
  const nz = dz / dist;

  // Separation from other characters, capped so it never shoves anybody off the
  // sidewalk. Sitting characters are anchors, not obstacles for walking.
  let pushX = 0;
  let pushZ = 0;
  for (const other of agents) {
    if (other === agent || !other.active) continue;
    const ox = agent.x - other.x;
    const oz = agent.z - other.z;
    const d = Math.hypot(ox, oz);
    if (d > 0 && d < 1.05) {
      const weight = (1.05 - d) / 1.05;
      pushX += (ox / d) * weight;
      pushZ += (oz / d) * weight;
    }
  }
  if (player) {
    const px = agent.x - player.x;
    const pz = agent.z - player.z;
    const pd = Math.hypot(px, pz);
    if (pd > 0 && pd < 0.9) {
      pushX += (px / pd) * (0.9 - pd);
      pushZ += (pz / pd) * (0.9 - pd);
    }
  }

  const speed = agent.baseSpeed * (goal.kind === 'cross' ? 1.2 : 1);
  agent.speed = speed;
  agent.x += (nx * speed + pushX * 0.6) * delta;
  agent.z += (nz * speed + pushZ * 0.6) * delta;
  const targetYaw = Math.atan2(nx, nz);
  let diff = ((targetYaw - agent.yaw + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (diff < -Math.PI) diff += Math.PI * 2;
  agent.yaw += diff * Math.min(1, delta * 9);
  agent.emote = 'walk';
  return false;
}

/**
 * Advance the crowd by one frame.
 *
 * @param {ReturnType<typeof createCrowd>} crowd
 * @param {number} delta seconds, clamped by the caller
 * @param {{x:number,z:number}} player
 * @param {{quality?: 'high'|'medium'|'low', activeRange?: number}} [options]
 */
export function stepCrowd(crowd, delta, player, options = {}) {
  const quality = options.quality ?? crowd.quality ?? 'high';
  const limits = CROWD_DETAIL_LIMITS[quality] ?? CROWD_DETAIL_LIMITS.high;
  const activeRange = options.activeRange ?? limits.activeRange;
  const step = Math.min(Math.max(0, delta), 0.1);
  crowd.quality = quality;

  for (const agent of crowd.agents) {
    const distance = distanceTo(agent, player);
    agent.distance = distance;
    agent.u = crowdWorldToU(agent.x, agent.z);
    agent.active = distance <= activeRange;
    agent.reactCooldown = Math.max(0, agent.reactCooldown - step);
    if (!agent.active) {
      agent.detail = 'hidden';
      agent.speed = 0;
      continue;
    }

    if (agent.mode === 'react') {
      agent.timer -= step;
      const targetYaw = Math.atan2(player.x - agent.x, player.z - agent.z);
      let diff = ((targetYaw - agent.yaw + Math.PI) % (Math.PI * 2)) - Math.PI;
      if (diff < -Math.PI) diff += Math.PI * 2;
      agent.yaw += diff * Math.min(1, step * 8);
      agent.speed = 0;
      agent.emote = agent.role === 'worker' || agent.role === 'sitter' ? 'talk' : 'wave';
      if (agent.timer <= 0) {
        agent.mode = 'walking';
        agent.reactCooldown = 16 + (agent.personalPhase % 6);
      }
      continue;
    }

    // Notice a nearby player once per cooldown, unless already busy sitting out
    // a long venue visit.
    if (distance < 3.3 && agent.reactCooldown <= 0 && agent.mode !== 'sitting' && agent.mode !== 'inside') {
      agent.mode = 'react';
      agent.timer = 1.4 + (agent.personalPhase % 0.8);
      agent.speed = 0;
      agent.emote = agent.role === 'worker' || agent.role === 'sitter' ? 'talk' : 'wave';
      continue;
    }

    if (agent.mode === 'sitting' || agent.mode === 'waiting' || agent.mode === 'inside') {
      agent.timer -= step;
      agent.speed = 0;
      agent.emote = agent.mode === 'sitting' ? 'sit' : agent.goals[0]?.emote ?? (agent.mode === 'inside' ? 'talk' : 'idle');
      if (agent.timer <= 0) {
        agent.seated = false;
        agent.mode = 'walking';
        agent.goals.shift();
      }
      continue;
    }

    if (!agent.goals.length) {
      agent.goals = buildCrowdRoute(agent, crowd.context, crowd.rng ?? createRng(crowd.seed));
      if (!agent.goals.length) {
        agent.emote = 'idle';
        agent.speed = 0;
        continue;
      }
    }

    const goal = agent.goals[0];
    const arrived = advanceAgent(agent, goal, step, crowd.agents, player);
    if (!arrived) continue;

    agent.speed = 0;
    agent.x = goal.x;
    agent.z = goal.z;
    if (goal.kind === 'cross') {
      agent.mode = 'walking';
      agent.goals.shift();
      continue;
    }
    if (goal.kind === 'sit') {
      agent.mode = 'sitting';
      agent.seated = true;
      agent.timer = goal.wait ?? 45;
      agent.emote = 'sit';
      agent.x = goal.x;
      agent.z = goal.z;
      continue;
    }
    if (goal.kind === 'inside') {
      agent.mode = 'inside';
      agent.timer = goal.wait ?? 12;
      agent.emote = goal.emote ?? 'talk';
      continue;
    }
    if (goal.kind === 'wait') {
      agent.mode = 'waiting';
      agent.timer = goal.wait ?? 3;
      agent.emote = goal.emote ?? 'idle';
      continue;
    }
    agent.goals.shift();
  }

  assignCrowdDetail(crowd, player, quality);
  return crowd;
}

/**
 * Choose the render tier for every agent by distance. The caller renders rig
 * avatars for `rig` and static Kenney pedestrians for `prop`; everything else
 * is hidden. This is what keeps a populated city inside a phone's budget.
 */
export function assignCrowdDetail(crowd, player, quality = crowd.quality ?? 'high') {
  const limits = CROWD_DETAIL_LIMITS[quality] ?? CROWD_DETAIL_LIMITS.high;
  const sorted = [...crowd.agents].sort((a, b) => a.distance - b.distance);
  let rigs = 0;
  let props = 0;
  for (const agent of sorted) {
    if (!agent.active || agent.distance > limits.range) {
      agent.detail = 'hidden';
      continue;
    }
    if (agent.distance <= limits.rigRange && rigs < limits.rigs) {
      agent.detail = 'rig';
      rigs += 1;
    } else if (props < limits.props) {
      agent.detail = 'prop';
      props += 1;
    } else {
      agent.detail = 'hidden';
    }
  }
  return crowd;
}

/**
 * Rehome agents that have been left far behind. Called at a low frequency by
 * the renderer. Only hidden agents move, so nothing pops out in view.
 */
export function recycleDistantCrowd(crowd, player, { minDistance = 150, maxMoves = 2, radius = 110 } = {}) {
  const moved = [];
  const candidates = crowd.agents
    .filter((agent) => agent.distance > minDistance && agent.detail === 'hidden')
    .sort((a, b) => b.distance - a.distance)
    .slice(0, maxMoves);
  if (!candidates.length) return moved;
  const rng = crowd.rng ?? createRng(crowd.seed);
  crowd.rng = rng;
  const blocks = [...crowd.blockMap.values()].filter(blockUsable);
  for (const agent of candidates) {
    const near = blocks.filter((block) => {
      const cx = (block.uMin + block.uMax) / 2;
      const cz = (block.zMin + block.zMax) / 2;
      const d = Math.hypot(cx + CITY_LAYOUT_SLOPE * cz - player.x, cz - player.z);
      return d >= 12 && d <= radius;
    });
    if (!near.length) continue;
    const nearSeats = blocksSupporting('sitter', near, crowd.context.venuesByBlock, crowd.context.seatsByBlock);
    const nearVenues = blocksSupporting('loiterer', near, crowd.context.venuesByBlock, crowd.context.seatsByBlock);
    // Keep the agent's role when the new district supports it. Re-rolling every
    // role on a long trip would slowly turn the whole population into
    // pedestrians whenever the player spends time away from the venues.
    let role = agent.role;
    let rolePool = blocksSupporting(role, near, crowd.context.venuesByBlock, crowd.context.seatsByBlock);
    if (!rolePool.length) {
      role = chooseRole(rng, nearSeats.length > 0, nearVenues.length > 0);
      rolePool = blocksSupporting(role, near, crowd.context.venuesByBlock, crowd.context.seatsByBlock);
    }
    const block = rolePool[Math.floor(rng() * rolePool.length)] ?? near[Math.floor(rng() * near.length)];
    const key = BLOCK_KEY(block);
    const loop = sidewalkLoop(block);
    // Check the actual spawn point, not just the block centre: a corner of the
    // block can be much closer to the player than the centre is. Keeping every
    // recycled agent at least 20 m away stops a new pedestrian appearing right
    // beside the camera after fast travel.
    const starts = loop.filter((point) => {
      const distance = Math.hypot(point.x - player.x, point.z - player.z);
      return distance >= 20 && distance <= radius;
    });
    if (!starts.length) continue;
    const start = starts[Math.floor(rng() * starts.length)];
    agent.block = block;
    agent.blockKey = key;
    agent.role = role;
    agent.avatar = randomCrowdAvatar(rng, role, agent.name);
    agent.x = start.x;
    agent.z = start.z;
    agent.u = start.u;
    agent.yaw = rng() * Math.PI * 2;
    agent.mode = 'walking';
    agent.timer = 0;
    agent.seated = false;
    agent.goals = [];
    agent.cornerIndex = Math.floor(rng() * loop.length);
    agent.direction = rng() < 0.5 ? -1 : 1;
    moved.push(agent);
  }
  return moved;
}

/** Counts used by the HUD, docs and verification scripts. */
export function crowdStats(agents) {
  const byRole = {};
  const byDetail = {};
  let seated = 0;
  let inside = 0;
  for (const agent of agents) {
    byRole[agent.role] = (byRole[agent.role] ?? 0) + 1;
    byDetail[agent.detail] = (byDetail[agent.detail] ?? 0) + 1;
    if (agent.seated) seated += 1;
    if (agent.mode === 'inside') inside += 1;
  }
  return { total: agents.length, byRole, byDetail, seated, inside };
}

/**
 * The animation set the LoftLife avatar rig provides. Exposed here (rather than
 * only in the renderer) so the asset gallery and tests can list what the
 * imported character library does *not* replace.
 */
export const AVATAR_ANIMATION_SETS = Object.freeze([
  { id: 'idle', label: 'Idle', use: 'Standing, breathing, blinking' },
  { id: 'walk', label: 'Walk', use: 'Sidewalk strolling at 1.2–2.2 m/s' },
  { id: 'run', label: 'Run', use: 'Sprint input above 4.6 m/s' },
  { id: 'sit', label: 'Sit', use: 'Chairs, benches, venue seats and transit' },
  { id: 'stand', label: 'Stand up', use: 'Blends out of a seat into idle' },
  { id: 'wave', label: 'Wave', use: 'Greeting a nearby player or NPC' },
  { id: 'talk', label: 'Talk', use: 'Counter staff, seated conversation' },
  { id: 'gesture', label: 'Gesture', use: 'Pointing and social emphasis' },
  { id: 'dance', label: 'Dance', use: 'Dance pads and parties' },
  { id: 'cheer', label: 'Cheer', use: 'Celebrations' },
  { id: 'jump', label: 'Jump', use: 'Airborne pose' },
  { id: 'enter_vehicle', label: 'Enter vehicle', use: 'Transition into a seat' },
  { id: 'exit_vehicle', label: 'Exit vehicle', use: 'Transition onto the kerb' },
]);
