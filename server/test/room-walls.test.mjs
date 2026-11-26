import test from 'node:test';
import assert from 'node:assert/strict';

import {
  WALL_OPENINGS,
  WALL_SIDES,
  clampWallStart,
  nearestWall,
  normalizeWallSide,
  wallAllowsPlacement,
  wallAxis,
  wallItemTransform,
} from '../../shared/room-walls.mjs';

const GRID = 14;

test('all four walls exist and each has a usable transform', () => {
  assert.deepEqual(WALL_SIDES, ['north', 'east', 'south', 'west']);
  const transforms = WALL_SIDES.map((wall) => wallItemTransform({ wall, start: 4, span: 2, height: 1.85 }));
  assert.equal(transforms.length, 4);
  for (const t of transforms) assert.ok(Number.isFinite(t.x) && Number.isFinite(t.z));
  // Every wall transform stays inside the room footprint.
  for (const t of transforms) {
    assert.ok(Math.abs(t.x) <= GRID / 2 && Math.abs(t.z) <= GRID / 2);
  }
});

test('wall transforms face into the room from the correct side', () => {
  const north = wallItemTransform({ wall: 'north', start: 4, span: 2 });
  const south = wallItemTransform({ wall: 'south', start: 4, span: 2 });
  const west = wallItemTransform({ wall: 'west', start: 4, span: 2 });
  const east = wallItemTransform({ wall: 'east', start: 4, span: 2 });

  assert.equal(north.z, -GRID / 2 + 0.06);
  assert.equal(north.rotY, 0);
  assert.equal(south.z, GRID / 2 - 0.06);
  assert.equal(south.rotY, Math.PI);
  assert.equal(west.x, -GRID / 2 + 0.06);
  assert.equal(west.rotY, Math.PI / 2);
  assert.equal(east.x, GRID / 2 - 0.06);
  assert.equal(east.rotY, -Math.PI / 2);

  // A 2 m item at tile 4 is centred on tile 5 along the wall.
  assert.equal(north.x, -GRID / 2 + 5);
  assert.equal(south.x, -GRID / 2 + 5);
  assert.equal(west.z, -GRID / 2 + 5);
  assert.equal(east.z, -GRID / 2 + 5);
});

test('wall axes: north/south use gx, east/west use gz', () => {
  assert.equal(wallAxis('north'), 'x');
  assert.equal(wallAxis('south'), 'x');
  assert.equal(wallAxis('east'), 'z');
  assert.equal(wallAxis('west'), 'z');
});

test('windows and the suite door reject overlapping wall furniture', () => {
  // West: window 3..10, door 11..13.
  assert.equal(wallAllowsPlacement('west', 3, 2, GRID), false);
  assert.equal(wallAllowsPlacement('west', 11, 2, GRID), false);
  assert.equal(wallAllowsPlacement('west', 0, 3, GRID), true);
  assert.equal(wallAllowsPlacement('west', 2, 0.5, GRID), true);
  assert.equal(wallAllowsPlacement('west', 3, 0.5, GRID), false, 'edge of the glazing is covered');

  // South: window 3..10 only.
  assert.equal(wallAllowsPlacement('south', 3, 2, GRID), false);
  assert.equal(wallAllowsPlacement('south', 9, 2, GRID), false);
  assert.equal(wallAllowsPlacement('south', 10, 2, GRID), true);
  assert.equal(wallAllowsPlacement('south', 0, 3, GRID), true);
  assert.equal(wallAllowsPlacement('south', 11, 2, GRID), true);

  // North and east are solid all the way across.
  assert.equal(wallAllowsPlacement('north', 0, 6, GRID), true);
  assert.equal(wallAllowsPlacement('east', 5, 3, GRID), true);
});

test('wall placement stays on the wall', () => {
  assert.equal(wallAllowsPlacement('north', -1, 2, GRID), false);
  assert.equal(wallAllowsPlacement('north', 13, 2, GRID), false);
  assert.equal(wallAllowsPlacement('east', 0, GRID, GRID), true);
  assert.equal(wallAllowsPlacement('east', 0, GRID + 1, GRID), false);
});

test('openings never cover the walls that must stay solid', () => {
  assert.deepEqual(WALL_OPENINGS.north, []);
  assert.deepEqual(WALL_OPENINGS.east, []);
  assert.ok(WALL_OPENINGS.south.length > 0);
  assert.ok(WALL_OPENINGS.west.some((o) => o.kind === 'door'));
});

test('legacy saved walls normalise to north; unknown sides are safe', () => {
  assert.equal(normalizeWallSide(undefined), 'north');
  assert.equal(normalizeWallSide('garden'), 'north');
  assert.equal(normalizeWallSide('south'), 'south');
});

test('clampWallStart keeps the full item span on the wall', () => {
  assert.equal(clampWallStart('north', 20, 2, GRID), 12);
  assert.equal(clampWallStart('north', -4, 2, GRID), 0);
  assert.equal(clampWallStart('north', 5, 2, GRID), 5);
});

test('nearestWall picks the side the pointer is closest to', () => {
  assert.equal(nearestWall(0, -8, GRID), 'north');
  assert.equal(nearestWall(0, 8, GRID), 'south');
  assert.equal(nearestWall(-9, 0, GRID), 'west');
  assert.equal(nearestWall(9, 0, GRID), 'east');
});
