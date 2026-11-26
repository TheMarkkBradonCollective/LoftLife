/**
 * Four-wall room layout rules.
 *
 * The suite has four physical walls. Wall-mounted furniture stores its side and
 * a position along that wall; this module owns the mapping from wall + grid
 * coordinate to a world transform, and the door/window openings that cannot be
 * covered. It is shared by the renderer, the editor's placement validation and
 * the node:test suite so the three can never disagree.
 */

/** @typedef {'north'|'east'|'south'|'west'} WallSide */

/** @type {WallSide[]} */
export const WALL_SIDES = ['north', 'east', 'south', 'west'];

/**
 * Rotation (in 90° steps) applied to a wall item's local +Z face so it looks
 * into the room from that wall.
 * @type {Record<WallSide, number>}
 */
export const WALL_ROT_STEPS = { north: 0, east: 3, south: 2, west: 1 };

/**
 * Openings measured in 1 m grid tiles along the wall.
 * The west wall keeps the existing panoramic window (3..10) and suite door
 * (11..13); the south wall gets a matching window (3..10) so the room has
 * glazing on two sides. North and east stay solid for wall decor.
 * @type {Record<WallSide, {from: number, to: number, kind: 'window'|'door'}[]>}
 */
export const WALL_OPENINGS = {
  north: [],
  east: [],
  south: [{ from: 3, to: 10, kind: 'window' }],
  west: [
    { from: 3, to: 10, kind: 'window' },
    { from: 11, to: 13, kind: 'door' },
  ],
};

/**
 * @param {unknown} value
 * @returns {WallSide}
 */
export function normalizeWallSide(value) {
  return typeof value === 'string' && WALL_SIDES.includes(value)
    ? /** @type {WallSide} */ (value)
    : 'north';
}

/**
 * North/south walls run along X (grid `gx`); east/west run along Z (`gz`).
 * @param {WallSide} wall
 * @returns {'x'|'z'}
 */
export function wallAxis(wall) {
  const side = normalizeWallSide(wall);
  return side === 'north' || side === 'south' ? 'x' : 'z';
}

/**
 * True when a wall item can cover `[start, start + span)` on that wall.
 * Openings (windows, the suite door) are excluded.
 * @param {WallSide} wall
 * @param {number} start 1 m tile coordinate along the wall
 * @param {number} span width in tiles
 * @param {number} [gridSize]
 */
export function wallAllowsPlacement(wall, start, span, gridSize = 14) {
  if (!Number.isFinite(start) || !Number.isFinite(span) || span <= 0) return false;
  if (start < 0 || start + span > gridSize + 0.001) return false;
  const end = start + span;
  for (const opening of WALL_OPENINGS[normalizeWallSide(wall)]) {
    if (start < opening.to - 0.001 && end > opening.from + 0.001) return false;
  }
  return true;
}

/**
 * World transform for a wall-mounted item. `rotY` turns its front (+Z) toward
 * the room; the item sits just inside the wall face.
 * @param {{wall: WallSide, start: number, span: number, height?: number, gridSize?: number}} input
 * @returns {{x: number, y: number, z: number, rotY: number}}
 */
export function wallItemTransform(input) {
  const wall = normalizeWallSide(input.wall);
  const gridSize = Number.isFinite(input.gridSize) ? Number(input.gridSize) : 14;
  const span = Number.isFinite(input.span) ? Number(input.span) : 1;
  const start = Number.isFinite(input.start) ? Number(input.start) : 0;
  const height = Number.isFinite(input.height) ? Number(input.height) : 1.85;
  const half = gridSize / 2;
  const center = -half + start + span / 2;
  switch (wall) {
    case 'south':
      return { x: center, y: height, z: half - 0.06, rotY: Math.PI };
    case 'east':
      return { x: half - 0.06, y: height, z: center, rotY: -Math.PI / 2 };
    case 'west':
      return { x: -half + 0.06, y: height, z: center, rotY: Math.PI / 2 };
    case 'north':
    default:
      return { x: center, y: height, z: -half + 0.06, rotY: 0 };
  }
}

/**
 * Clamp a wall item's start coordinate so it stays on its wall.
 * @param {WallSide} wall
 * @param {number} start
 * @param {number} span
 * @param {number} [gridSize]
 */
export function clampWallStart(wall, start, span, gridSize = 14) {
  const max = Math.max(0, gridSize - span);
  return Math.max(0, Math.min(max, start));
}

/**
 * Nearest wall for a ground-plane direction, used to turn a floor hit into a
 * wall placement when the pointer is outside the room.
 * @param {number} x world X
 * @param {number} z world Z
 * @param {number} [gridSize]
 * @returns {WallSide}
 */
export function nearestWall(x, z, gridSize = 14) {
  const half = gridSize / 2;
  const distances = [
    { wall: /** @type {WallSide} */ ('north'), d: Math.abs(z + half) },
    { wall: /** @type {WallSide} */ ('south'), d: Math.abs(z - half) },
    { wall: /** @type {WallSide} */ ('west'), d: Math.abs(x + half) },
    { wall: /** @type {WallSide} */ ('east'), d: Math.abs(x - half) },
  ];
  distances.sort((a, b) => a.d - b.d);
  return distances[0].wall;
}
