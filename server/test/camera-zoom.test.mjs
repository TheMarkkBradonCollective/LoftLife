/**
 * Avatar zoom camera maths: angle preservation, exact restore, clipping guard
 * and smooth damping.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AVATAR_ZOOM_MIN_DISTANCE,
  dampValue,
  distanceBetween,
  restoreZoom,
  zoomTowardAvatar,
} from '../../shared/camera-zoom.mjs';

const camera = { x: 14.5, y: 12, z: 14.5 };
const target = { x: 0, y: 0.85, z: 0 };
const avatar = { x: 0.8, y: 1.0, z: 1.6 };

/** Direction from target to camera, which is the viewing angle. */
const viewDir = (position, lookAt) => {
  const dx = position.x - lookAt.x;
  const dy = position.y - lookAt.y;
  const dz = position.z - lookAt.z;
  const length = Math.hypot(dx, dy, dz);
  return { x: dx / length, y: dy / length, z: dz / length };
};

const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;

test('first zoom comes closer to the avatar and keeps the viewing direction', () => {
  const before = distanceBetween(camera, target);
  const zoom = zoomTowardAvatar({ position: camera, target, avatar });
  const after = distanceBetween(zoom.position, zoom.target);
  assert.ok(after < before, 'zoom must shorten the camera distance');
  assert.deepEqual(zoom.target, avatar, 'the orbit target moves to the avatar');

  const beforeDir = viewDir(camera, target);
  const afterDir = viewDir(zoom.position, zoom.target);
  assert.ok(dot(beforeDir, afterDir) > 0.9999, 'camera angle must not change');
  // Polar angle (height above the target) is unchanged too.
  assert.ok(Math.abs(Math.asin(beforeDir.y) - Math.asin(afterDir.y)) < 1e-9);
});

test('second zoom restores the exact previous distance, target and angle', () => {
  const zoom = zoomTowardAvatar({ position: camera, target, avatar });
  const restored = restoreZoom(zoom.restore);
  assert.deepEqual(restored.position, camera);
  assert.deepEqual(restored.target, target);
  assert.equal(
    distanceBetween(restored.position, restored.target),
    distanceBetween(camera, target)
  );
});

test('zoom is a distance toggle, not a reset: a custom angle is preserved', () => {
  const customCamera = { x: -9, y: 7.5, z: 3.2 };
  const zoom = zoomTowardAvatar({ position: customCamera, target, avatar });
  const angleBefore = viewDir(customCamera, target);
  const angleAfter = viewDir(zoom.position, zoom.target);
  assert.ok(dot(angleBefore, angleAfter) > 0.9999);
  assert.ok(zoom.position.x < 0, 'the camera stays on the same side of the room');
});

test('zoom never clips through the avatar', () => {
  const normal = zoomTowardAvatar({ position: camera, target, avatar });
  assert.ok(normal.distance >= AVATAR_ZOOM_MIN_DISTANCE - 1e-9);
  assert.ok(distanceBetween(normal.position, avatar) >= AVATAR_ZOOM_MIN_DISTANCE - 1e-9);
  assert.equal(normal.distance <= normal.previousDistance, true, 'zoom in must not push out');

  // Already closer than the safe radius: leave the camera exactly where it is
  // rather than snapping it backward.
  const veryClose = { x: 0.9, y: 1.5, z: 1.7 };
  const zoom = zoomTowardAvatar({ position: veryClose, target: avatar, avatar });
  assert.equal(zoom.distance, distanceBetween(veryClose, avatar));
});

test('zoom handles a camera exactly on the target without NaNs', () => {
  const zoom = zoomTowardAvatar({ position: avatar, target: avatar, avatar });
  for (const value of Object.values(zoom.position)) assert.ok(Number.isFinite(value));
  assert.ok(zoom.distance >= AVATAR_ZOOM_MIN_DISTANCE - 1e-9);
});

test('the zoom transition eases in monotonically and never overshoots', () => {
  let value = 17;
  const goal = 3.2;
  let previous = value;
  for (let i = 0; i < 60; i += 1) {
    value = dampValue(value, goal, 10, 1 / 60);
    assert.ok(value <= previous + 1e-12, 'distance must only shrink while zooming in');
    assert.ok(value >= goal - 1e-9, 'must not pass the goal');
    previous = value;
  }
  assert.ok(Math.abs(value - goal) < 0.01, 'reaches the target within a second');
});
