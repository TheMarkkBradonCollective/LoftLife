/**
 * Avatar zoom maths.
 *
 * Z is a camera *distance* toggle, never a camera reset: the view direction is
 * kept exactly, the orbit target moves to the avatar, and the distance is
 * shortened by a factor. Zooming out restores the exact position and target
 * that were captured on the way in.
 *
 * Pure functions so the camera behaviour can be tested without WebGL.
 */

/** @typedef {{x: number, y: number, z: number}} Point3 */

export const AVATAR_ZOOM_FACTOR = 0.42;
/** Never closer than this to the avatar, so the near plane cannot clip it. */
export const AVATAR_ZOOM_MIN_DISTANCE = 3.2;

/**
 * @param {Point3} a
 * @param {Point3} b
 */
export function distanceBetween(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

/**
 * @param {Point3} point
 * @param {Point3} origin
 * @returns {Point3} unit vector, or straight up when the points coincide
 */
function direction(point, origin) {
  const dx = point.x - origin.x;
  const dy = point.y - origin.y;
  const dz = point.z - origin.z;
  const length = Math.hypot(dx, dy, dz);
  if (length < 1e-6) return { x: 0, y: 1, z: 0 };
  return { x: dx / length, y: dy / length, z: dz / length };
}

/**
 * @param {number} value
 * @param {number} min
 * @param {number} max
 */
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

/**
 * Frame the avatar from the current viewing direction.
 *
 * @param {{
 *   position: Point3,
 *   target: Point3,
 *   avatar: Point3,
 *   factor?: number,
 *   minDistance?: number,
 *   maxDistance?: number,
 * }} input
 * @returns {{
 *   position: Point3,
 *   target: Point3,
 *   distance: number,
 *   previousDistance: number,
 *   direction: Point3,
 *   restore: {position: Point3, target: Point3},
 * }}
 */
export function zoomTowardAvatar(input) {
  const { position, target, avatar } = input;
  const factor = Number.isFinite(input.factor) ? Number(input.factor) : AVATAR_ZOOM_FACTOR;
  const minDistance = Number.isFinite(input.minDistance)
    ? Number(input.minDistance)
    : AVATAR_ZOOM_MIN_DISTANCE;
  const maxDistance = Number.isFinite(input.maxDistance)
    ? Number(input.maxDistance)
    : Number.POSITIVE_INFINITY;

  const axis = direction(position, target);
  const previousDistance = distanceBetween(position, target);
  // Never zoom *out* when the user is already closer than the zoom distance.
  const wanted = Math.min(previousDistance, previousDistance * clamp(factor, 0.05, 1));
  // Already inside the safe radius (the player scrolled right up to the
  // avatar): zooming must never push the camera out. A degenerate camera that
  // sits exactly on the avatar is placed at the safe distance instead.
  const distance =
    previousDistance < 1e-6
      ? clamp(minDistance, minDistance, maxDistance)
      : previousDistance <= minDistance
      ? previousDistance
      : clamp(wanted, minDistance, maxDistance);
  const origin = { x: avatar.x, y: avatar.y, z: avatar.z };

  return {
    position: {
      x: origin.x + axis.x * distance,
      y: origin.y + axis.y * distance,
      z: origin.z + axis.z * distance,
    },
    target: { ...origin },
    distance,
    previousDistance,
    direction: axis,
    restore: {
      position: { x: position.x, y: position.y, z: position.z },
      target: { x: target.x, y: target.y, z: target.z },
    },
  };
}

/**
 * @param {{position: Point3, target: Point3}} saved
 * @returns {{position: Point3, target: Point3}}
 */
export function restoreZoom(saved) {
  return {
    position: { x: saved.position.x, y: saved.position.y, z: saved.position.z },
    target: { x: saved.target.x, y: saved.target.y, z: saved.target.z },
  };
}

/**
 * Frame-rate independent damping used for the zoom transition. Monotonic and
 * never overshoots, so the camera eases in without jitter.
 * @param {number} current
 * @param {number} goal
 * @param {number} rate
 * @param {number} delta seconds
 */
export function dampValue(current, goal, rate, delta) {
  if (!Number.isFinite(current)) return goal;
  const t = 1 - Math.exp(-Math.max(0, rate) * Math.max(0, delta));
  return current + (goal - current) * t;
}
