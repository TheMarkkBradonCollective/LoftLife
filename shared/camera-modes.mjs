/**
 * Camera behaviour shared by the two gameplay modes.
 *
 * Isometric: WASD pans the camera, the orbit target can follow the avatar, and
 * the four walls hide themselves when the camera crosses outside them.
 * Play: the chase camera is separate and untouched by these helpers.
 *
 * Everything here is pure so pan/follow/cutaway behaviour can be tested in
 * node without WebGL.
 */

/** @typedef {{x: number, y: number, z: number}} Vec3 */

export const CAMERA_LIMITS = {
  /** Camera must be this far outside a wall before it is hidden. */
  cutMargin: 0.35,
  /** Extra distance before a hidden wall returns, to stop cutaway flicker. */
  cutDeadband: 0.22,
  /** Metres per second for isometric WASD panning at the default zoom. */
  panSpeed: 6.5,
  /** How quickly the follow target eases back to the avatar. */
  followRate: 8,
};

/**
 * Which walls sit between the camera and the room.
 *
 * `previous` supplies hysteresis: a wall that is already hidden stays hidden a
 * little longer, so orbiting along a boundary cannot strobe.
 *
 * @param {{x: number, z: number, half: number, margin?: number, deadband?: number}} input
 * @param {{north?: boolean, south?: boolean, east?: boolean, west?: boolean}} [previous]
 * @returns {{north: boolean, south: boolean, east: boolean, west: boolean}}
 */
export function cutawayForCamera(input, previous = {}) {
  const half = Number.isFinite(input.half) ? input.half : 7;
  const margin = Number.isFinite(input.margin) ? Number(input.margin) : CAMERA_LIMITS.cutMargin;
  const deadband = Number.isFinite(input.deadband) ? Number(input.deadband) : CAMERA_LIMITS.cutDeadband;
  const low = -half + margin;
  const high = half - margin;
  const isLow = (value, was) => (was ? value < low + deadband : value < low);
  const isHigh = (value, was) => (was ? value > high - deadband : value > high);
  return {
    north: isLow(input.z, previous.north === true),
    south: isHigh(input.z, previous.south === true),
    east: isHigh(input.x, previous.east === true),
    west: isLow(input.x, previous.west === true),
  };
}

/**
 * Move the orbit camera and its target together, so rotation and zoom distance
 * are untouched. The target is clamped to the playable bounds; the camera moves
 * by exactly the applied delta.
 *
 * @param {{
 *   camera: Vec3,
 *   target: Vec3,
 *   forward: {x: number, z: number},
 *   right: {x: number, z: number},
 *   moveX: number,
 *   moveZ: number,
 *   speed?: number,
 *   delta: number,
 *   bounds?: {minX: number, maxX: number, minZ: number, maxZ: number},
 * }} input
 * @returns {{camera: Vec3, target: Vec3, moved: number}}
 */
export function panCamera(input) {
  const speed = Number.isFinite(input.speed) ? Number(input.speed) : CAMERA_LIMITS.panSpeed;
  const delta = Math.max(0, Number(input.delta) || 0);
  const length = Math.hypot(input.moveX, input.moveZ);
  if (length < 1e-6 || delta === 0) {
    return {
      camera: { ...input.camera },
      target: { ...input.target },
      moved: 0,
    };
  }
  // Same convention as character movement: W is negative moveZ (forward).
  const dirX = (input.right.x * input.moveX - input.forward.x * input.moveZ) / length;
  const dirZ = (input.right.z * input.moveX - input.forward.z * input.moveZ) / length;
  const step = speed * delta;

  let targetX = input.target.x + dirX * step;
  let targetZ = input.target.z + dirZ * step;
  const bounds = input.bounds;
  if (bounds) {
    targetX = Math.max(bounds.minX, Math.min(bounds.maxX, targetX));
    targetZ = Math.max(bounds.minZ, Math.min(bounds.maxZ, targetZ));
  }
  const dx = targetX - input.target.x;
  const dz = targetZ - input.target.z;
  return {
    camera: { x: input.camera.x + dx, y: input.camera.y, z: input.camera.z + dz },
    target: { x: targetX, y: input.target.y, z: targetZ },
    moved: Math.hypot(dx, dz),
  };
}

/**
 * Ease the orbit target toward a focus point while translating the camera by
 * the same delta: the viewing direction and distance stay exactly as the player
 * left them.
 *
 * @param {{camera: Vec3, target: Vec3, focus: Vec3, rate?: number, delta: number}} input
 * @returns {{camera: Vec3, target: Vec3, offset: Vec3}}
 */
export function followCamera(input) {
  const rate = Number.isFinite(input.rate) ? Number(input.rate) : CAMERA_LIMITS.followRate;
  const delta = Math.max(0, Number(input.delta) || 0);
  const k = 1 - Math.exp(-rate * delta);
  const dx = (input.focus.x - input.target.x) * k;
  const dy = (input.focus.y - input.target.y) * k;
  const dz = (input.focus.z - input.target.z) * k;
  return {
    camera: { x: input.camera.x + dx, y: input.camera.y + dy, z: input.camera.z + dz },
    target: {
      x: input.target.x + dx,
      y: input.target.y + dy,
      z: input.target.z + dz,
    },
    offset: {
      x: input.camera.x - input.target.x,
      y: input.camera.y - input.target.y,
      z: input.camera.z - input.target.z,
    },
  };
}

/**
 * Pan bounds for the orbit target, per location. The camera itself may sit
 * outside; only the focus is clamped so WASD cannot lose the room.
 * @param {string} location
 */
export function panBoundsFor(location) {
  switch (location) {
    case 'room':
    case 'resident_room':
      return { minX: -5.8, maxX: 5.8, minZ: -5.8, maxZ: 5.8 };
    case 'lobby':
      return { minX: -7, maxX: 7, minZ: -6, maxZ: 6 };
    case 'hallway':
      return { minX: -10.5, maxX: 10.5, minZ: -2.6, maxZ: 2.2 };
    case 'world':
    default:
      return { minX: -90, maxX: 90, minZ: -90, maxZ: 90 };
  }
}

/**
 * Round-trip helper for the two zoom levels. Z changes only the distance, so a
 * caller can restore the previous wide distance without touching the follow
 * state or the camera angle.
 * @param {number} wideDistance
 * @param {number} factor
 * @param {number} minDistance
 */
export function closeDistanceFor(wideDistance, factor = 0.45, minDistance = 3.2) {
  return Math.max(minDistance, wideDistance * factor);
}

/**
 * Distance and clamped value for the chase camera in Play View.
 * @param {number} baseDistance
 * @param {boolean} close
 */
export function playViewDistance(baseDistance, close) {
  const base = Number.isFinite(baseDistance) ? baseDistance : 3.7;
  return close ? Math.max(1.5, base * 0.45) : base;
}
