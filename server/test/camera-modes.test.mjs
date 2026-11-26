import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CAMERA_LIMITS,
  closeDistanceFor,
  cutawayForCamera,
  followCamera,
  panBoundsFor,
  panCamera,
  playViewDistance,
} from '../../shared/camera-modes.mjs';

const HALF = 7;

test('camera inside the room hides no walls', () => {
  const cut = cutawayForCamera({ x: 0, z: 0, half: HALF });
  assert.deepEqual(cut, { north: false, south: false, east: false, west: false });
});

test('camera beyond a wall hides exactly that wall', () => {
  assert.equal(cutawayForCamera({ x: 0, z: -8, half: HALF }).north, true);
  assert.equal(cutawayForCamera({ x: 0, z: -8, half: HALF }).south, false);
  assert.equal(cutawayForCamera({ x: 0, z: 8, half: HALF }).south, true);
  assert.equal(cutawayForCamera({ x: -8, z: 0, half: HALF }).west, true);
  assert.equal(cutawayForCamera({ x: 8, z: 0, half: HALF }).east, true);
});

test('diagonal cameras cut two walls, never the far side', () => {
  const cut = cutawayForCamera({ x: 8, z: -8, half: HALF });
  assert.deepEqual(cut, { north: true, south: false, east: true, west: false });
  const opposite = cutawayForCamera({ x: -8, z: 8, half: HALF });
  assert.deepEqual(opposite, { north: false, south: true, east: false, west: true });
});

test('cutaway hysteresis stops boundary flicker', () => {
  const limit = -HALF + CAMERA_LIMITS.cutMargin; // -6.65
  // Just inside the threshold: visible first.
  assert.equal(cutawayForCamera({ x: 0, z: limit + 0.02, half: HALF }).north, false);
  // Hiding needs a clear crossing.
  assert.equal(cutawayForCamera({ x: 0, z: limit - 0.05, half: HALF }).north, true);
  // Once hidden it stays hidden through the deadband while orbiting back.
  const stillHidden = cutawayForCamera(
    { x: 0, z: limit + 0.1, half: HALF },
    { north: true }
  );
  assert.equal(stillHidden.north, true);
  const restored = cutawayForCamera(
    { x: 0, z: limit + CAMERA_LIMITS.cutDeadband + 0.05, half: HALF },
    { north: true }
  );
  assert.equal(restored.north, false);
});

test('panning translates camera and target together, preserving the view offset', () => {
  const camera = { x: 10, y: 12, z: 10 };
  const target = { x: 0, y: 0.9, z: 0 };
  const forward = { x: -Math.SQRT1_2, z: -Math.SQRT1_2 };
  const right = { x: Math.SQRT1_2, z: -Math.SQRT1_2 };
  const steps = [
    { moveX: 0, moveZ: -1 },
    { moveX: 0, moveZ: 1 },
    { moveX: -1, moveZ: 0 },
    { moveX: 1, moveZ: 0 },
  ];
  for (const step of steps) {
    const result = panCamera({ camera, target, forward, right, ...step, delta: 0.5 });
    assert.ok(result.moved > 0, 'expected camera to pan');
    assert.ok(Math.abs(result.camera.x - result.target.x - 10) < 1e-9);
    assert.ok(Math.abs(result.camera.y - result.target.y - 11.1) < 1e-9);
    assert.ok(Math.abs(result.camera.z - result.target.z - 10) < 1e-9);
    assert.equal(result.camera.y, camera.y);
  }
});

test('W pans forward along the camera facing; D pans right', () => {
  const base = {
    camera: { x: 0, y: 10, z: 0 },
    target: { x: 0, y: 0, z: 0 },
    forward: { x: 0, z: -1 },
    right: { x: 1, z: 0 },
    delta: 1,
    speed: 2,
  };
  const forwardPan = panCamera({ ...base, moveX: 0, moveZ: -1 });
  assert.ok(Math.abs(forwardPan.target.z + 2) < 1e-9);
  assert.ok(Math.abs(forwardPan.target.x) < 1e-9);
  const rightPan = panCamera({ ...base, moveX: 1, moveZ: 0 });
  assert.ok(Math.abs(rightPan.target.x - 2) < 1e-9);
  assert.ok(Math.abs(rightPan.target.z) < 1e-9);
});

test('diagonal panning is not faster than straight panning', () => {
  const base = {
    camera: { x: 0, y: 10, z: 0 },
    target: { x: 0, y: 0, z: 0 },
    forward: { x: 0, z: -1 },
    right: { x: 1, z: 0 },
    delta: 1,
    speed: 2,
  };
  const straight = panCamera({ ...base, moveX: 0, moveZ: -1 });
  const diagonal = panCamera({ ...base, moveX: 1, moveZ: -1 });
  assert.ok(Math.abs(straight.moved - 2) < 1e-9);
  assert.ok(Math.abs(diagonal.moved - 2) < 1e-9);
});

test('panning clamps to the playable bounds and never moves the camera extra', () => {
  const camera = { x: 10, y: 10, z: 10 };
  const target = { x: 5.7, y: 1, z: 0 };
  const result = panCamera({
    camera,
    target,
    forward: { x: 0, z: -1 },
    right: { x: 1, z: 0 },
    moveX: 1,
    moveZ: 0,
    delta: 1,
    speed: 5,
    bounds: panBoundsFor('room'),
  });
  assert.equal(result.target.x, 5.8);
  assert.ok(Math.abs(result.camera.x - (10 + 0.1)) < 1e-9);
});

test('no pan input leaves the camera exactly where it was', () => {
  const camera = { x: 1, y: 2, z: 3 };
  const target = { x: 0, y: 1, z: 0 };
  const result = panCamera({
    camera,
    target,
    forward: { x: 0, z: -1 },
    right: { x: 1, z: 0 },
    moveX: 0,
    moveZ: 0,
    delta: 0.5,
  });
  assert.deepEqual(result.camera, camera);
  assert.deepEqual(result.target, target);
  assert.equal(result.moved, 0);
});

test('follow translates the camera with the focus, preserving rotation and distance', () => {
  const camera = { x: 12, y: 11, z: 12 };
  const target = { x: 0, y: 1, z: 0 };
  const focus = { x: 1, y: 1, z: 0 };
  const result = followCamera({ camera, target, focus, delta: 0.016, rate: 8 });
  const before = { x: camera.x - target.x, y: camera.y - target.y, z: camera.z - target.z };
  const after = {
    x: result.camera.x - result.target.x,
    y: result.camera.y - result.target.y,
    z: result.camera.z - result.target.z,
  };
  assert.ok(Math.abs(before.x - after.x) < 1e-9);
  assert.ok(Math.abs(before.y - after.y) < 1e-9);
  assert.ok(Math.abs(before.z - after.z) < 1e-9);
  // It eases toward the avatar without jumping there.
  assert.ok(result.target.x > 0 && result.target.x < 1);
});

test('follow converges on the avatar over time', () => {
  let state = {
    camera: { x: 10, y: 10, z: 10 },
    target: { x: 0, y: 1, z: 0 },
    focus: { x: 3, y: 1, z: -2 },
  };
  for (let i = 0; i < 200; i += 1) {
    state = { ...state, ...followCamera({ ...state, delta: 1 / 60, rate: 8 }) };
  }
  assert.ok(Math.hypot(state.target.x - 3, state.target.z + 2) < 1e-3);
  // The camera keeps the same 10 m western/southern offset throughout.
  assert.ok(Math.abs(state.camera.x - state.target.x - 10) < 1e-3);
  assert.ok(Math.abs(state.camera.z - state.target.z - 10) < 1e-3);
});

test('close zoom shortens distance but preserves the viewing direction', () => {
  const wide = 20;
  const close = closeDistanceFor(wide);
  assert.ok(close < wide);
  assert.ok(close >= 3.2);
  assert.equal(closeDistanceFor(4), 3.2);
});

test('play view close distance is shorter and both stay behind the avatar', () => {
  assert.equal(playViewDistance(3.7, false), 3.7);
  assert.ok(playViewDistance(3.7, true) < 3.7);
  assert.ok(playViewDistance(3.7, true) > 0);
});
