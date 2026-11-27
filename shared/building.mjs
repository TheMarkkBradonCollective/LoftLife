/**
 * Multi-floor building rules shared by the room editor, the API, the Cloudflare
 * Worker and the tests.
 *
 * A property is a stack of levels at fixed elevations. Items carry a `level`
 * integer; surfaces carry a per-level style list. Level 0 is always the ground
 * floor, and the last level of a stack may be a rooftop (open to the sky).
 */

export const FLOOR_HEIGHT = 3.45;
export const MAX_LEVELS = 4;

export const LEVEL_KINDS = ['ground', 'upper', 'rooftop'];

export function clampLevel(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(MAX_LEVELS - 1, Math.trunc(n)));
}

export function levelElevation(level) {
  return clampLevel(level) * FLOOR_HEIGHT;
}

export function levelKind(level, levelCount = 1) {
  const index = clampLevel(level);
  if (index === 0) return 'ground';
  if (index === Math.max(1, Math.min(MAX_LEVELS, levelCount)) - 1 && index > 0) return 'rooftop';
  return 'upper';
}

export function levelLabel(level, levelCount = 1) {
  const index = clampLevel(level);
  if (index === 0) return 'Ground';
  if (levelKind(index, levelCount) === 'rooftop') return `Rooftop (${index + 1})`;
  return `Level ${index + 1}`;
}

/** Number of levels a saved property actually uses, at least one. */
export function levelCount(items = [], floors = []) {
  let max = Array.isArray(floors) && floors.length ? floors.length - 1 : 0;
  for (const item of items) max = Math.max(max, clampLevel(item?.level ?? 0));
  return Math.max(1, Math.min(MAX_LEVELS, max + 1));
}

/**
 * Fill a per-level style list from whatever was saved. Older rooms only have a
 * single `surfaces` pair, which becomes the ground floor and is repeated up the
 * stack.
 */
export function normalizeFloors(surfaces = {}, items = []) {
  const base = {
    floor: surfaces?.floor ?? 'oak_parquet',
    wall: surfaces?.wall ?? 'warm_chalk',
  };
  const count = levelCount(items, surfaces?.floors);
  const source = Array.isArray(surfaces?.floors) ? surfaces.floors : [];
  const floors = [];
  for (let level = 0; level < count; level += 1) {
    const entry = source[level] ?? (level === 0 ? base : floors[level - 1] ?? base);
    floors.push({
      floor: entry?.floor ?? base.floor,
      wall: entry?.wall ?? base.wall,
    });
  }
  return floors;
}

/** The level that a staircase placed on `level` leads to. */
export function stairTargetLevel(level, levelCount = MAX_LEVELS) {
  const next = clampLevel(level) + 1;
  return next < Math.max(1, levelCount) ? next : null;
}

export function isStairKind(modelKind) {
  return modelKind === 'stairs' || modelKind === 'escalator' || modelKind === 'elevator';
}

/**
 * A stair is a transition when it sits on the level the player is walking on
 * and the property has a level above it.
 */
export function stairTransitionFor(item, playerLevel, modelKind, levelTotal = MAX_LEVELS) {
  if (!item || item.level !== playerLevel) return null;
  if (!isStairKind(modelKind)) return null;
  return stairTargetLevel(playerLevel, levelTotal);
}

/**
 * Wall-run joining.
 *
 * Floor-placed structural pieces are boxes on the metre grid. When a new piece
 * lands within one snap step of an existing piece on the same level, its edge
 * is aligned exactly with that piece and its rotation is matched, which removes
 * the hairline gaps and overlapping geometry that free placement leaves behind.
 * Returns a new candidate; never mutates the input list.
 */
export function joinWallRun(candidate, existing, { tolerance = 0.55, maxLevels = MAX_LEVELS } = {}) {
  if (!candidate) return candidate;
  const size = candidate.size ?? [1, 1];
  const rotated = (candidate.rot ?? 0) % 2 === 1;
  const width = rotated ? size[1] : size[0];
  const depth = rotated ? size[0] : size[1];
  const level = clampLevel(candidate.level ?? 0);
  if (level >= maxLevels) return candidate;

  let best = null;
  for (const other of existing ?? []) {
    if (!other || other.uid === candidate.uid) continue;
    if (clampLevel(other.level ?? 0) !== level) continue;
    const otherSize = other.size ?? [1, 1];
    const otherRotated = (other.rot ?? 0) % 2 === 1;
    const ow = otherRotated ? otherSize[1] : otherSize[0];
    const od = otherRotated ? otherSize[0] : otherSize[1];

    const sameRow = Math.abs(candidate.gz - other.gz) <= tolerance;
    const sameColumn = Math.abs(candidate.gx - other.gx) <= tolerance;
    if (!sameRow && !sameColumn) continue;

    if (sameRow) {
      const gapLeft = other.gx - (candidate.gx + width);
      const gapRight = candidate.gx - (other.gx + ow);
      if (Math.abs(gapLeft) <= tolerance) {
        best = { axis: 'x', value: other.gx - width, rot: other.rot ?? 0 };
      } else if (Math.abs(gapRight) <= tolerance) {
        best = { axis: 'x', value: other.gx + ow, rot: other.rot ?? 0 };
      }
    }
    if (!best && sameColumn) {
      const gapBehind = other.gz - (candidate.gz + depth);
      const gapFront = candidate.gz - (other.gz + od);
      if (Math.abs(gapBehind) <= tolerance) {
        best = { axis: 'z', value: other.gz - depth, rot: other.rot ?? 0 };
      } else if (Math.abs(gapFront) <= tolerance) {
        best = { axis: 'z', value: other.gz + od, rot: other.rot ?? 0 };
      }
    }
    if (best) break;
  }

  if (!best) return { ...candidate, level };
  const joined = { ...candidate, level };

  // Recompute the extent after adopting the neighbour's rotation.
  const joinedRotated = (best.rot ?? 0) % 2 === 1;
  const joinedWidth = joinedRotated ? size[1] : size[0];
  const joinedDepth = joinedRotated ? size[0] : size[1];
  joined.rot = best.rot ?? 0;

  if (best.axis === 'x') {
    joined.gx = Number(best.value.toFixed(3));
    if (joined.gx < -0.001 || joined.gx + joinedWidth > 14.001) return { ...candidate, level };
  } else {
    joined.gz = Number(best.value.toFixed(3));
    if (joined.gz < -0.001 || joined.gz + joinedDepth > 14.001) return { ...candidate, level };
  }
  return joined;
}

/** Items a player can collide with while walking on one storey. */
export function itemsOnLevel(items = [], level = 0) {
  return items.filter((item) => clampLevel(item?.level ?? 0) === clampLevel(level));
}

/** Strip a build down to what the server will accept, level by level. */
export function splitByLevel(items = []) {
  const map = new Map();
  for (const item of items) {
    const level = clampLevel(item?.level ?? 0);
    if (!map.has(level)) map.set(level, []);
    map.get(level).push({ ...item, level });
  }
  return [...map.entries()].sort((a, b) => a[0] - b[0]);
}
