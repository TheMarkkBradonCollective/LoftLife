import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FLOOR_HEIGHT,
  MAX_LEVELS,
  clampLevel,
  itemsOnLevel,
  joinWallRun,
  levelCount,
  levelElevation,
  levelLabel,
  normalizeFloors,
  stairTargetLevel,
  stairTransitionFor,
} from '../../shared/building.mjs';
import { sanitizeItems, sanitizeRoomState } from '../validate.mjs';

const base = (over = {}) => ({
  uid: 'a',
  catalogId: 'plush_sofa',
  gx: 2,
  gz: 2,
  rot: 0,
  color: '#e6dfd3',
  ...over,
});

test('levels clamp to the supported stack and keep fixed storey heights', () => {
  assert.equal(clampLevel(-4), 0);
  assert.equal(clampLevel(99), MAX_LEVELS - 1);
  assert.equal(clampLevel('2'), 2);
  assert.equal(levelElevation(0), 0);
  assert.equal(levelElevation(2), FLOOR_HEIGHT * 2);
  assert.equal(levelLabel(0, 3), 'Ground');
  assert.equal(levelLabel(1, 3), 'Level 2');
  assert.equal(levelLabel(2, 3), 'Rooftop (3)');
});

test('older single-storey rooms keep their surfaces and gain no extra floors', () => {
  const floors = normalizeFloors({ floor: 'terrazzo', wall: 'slate_blue' }, []);
  assert.equal(floors.length, 1);
  assert.deepEqual(floors[0], { floor: 'terrazzo', wall: 'slate_blue' });
});

test('multi-storey styles pad from the level below', () => {
  const floors = normalizeFloors(
    { floor: 'terrazzo', wall: 'slate_blue', floors: [{ floor: 'terrazzo', wall: 'slate_blue' }] },
    [{ uid: 'x', level: 2 }]
  );
  assert.equal(floors.length, 3);
  assert.deepEqual(floors[2], { floor: 'terrazzo', wall: 'slate_blue' });
  assert.equal(levelCount([{ level: 1 }], []), 2);
});

test('stairs lead to the next storey but not above the last one', () => {
  assert.equal(stairTargetLevel(0, 3), 1);
  assert.equal(stairTargetLevel(1, 3), 2);
  assert.equal(stairTargetLevel(2, 3), null);
  assert.equal(stairTransitionFor({ level: 0 }, 0, 'stairs', 3), 1);
  assert.equal(stairTransitionFor({ level: 1 }, 0, 'stairs', 3), null);
  assert.equal(stairTransitionFor({ level: 0 }, 0, 'sofa', 3), null);
});

test('wall pieces join their neighbours exactly instead of leaving gaps', () => {
  const left = { uid: 'w1', size: [2, 0.2], gx: 2, gz: 4, rot: 0, level: 0 };
  const right = { uid: 'w2', size: [2, 0.2], gx: 4.4, gz: 4.05, rot: 0, level: 0 };
  const joined = joinWallRun(right, [left]);
  assert.equal(joined.gx, 4);
  assert.equal(joined.gz, 4.05);
  assert.equal(joined.level, 0);
});

test('joining never mixes storeys or walks a piece outside the grid', () => {
  const upstairs = { uid: 'w1', size: [2, 0.2], gx: 2, gz: 4, rot: 0, level: 1 };
  const ground = { uid: 'w2', size: [2, 0.2], gx: 4.4, gz: 4, rot: 0, level: 0 };
  assert.equal(joinWallRun(ground, [upstairs]).gx, 4.4);
  const edge = { uid: 'w3', size: [2, 0.2], gx: 12.4, gz: 4, rot: 0, level: 0 };
  const neighbour = { uid: 'w4', size: [2, 0.2], gx: 10.2, gz: 4, rot: 0, level: 0 };
  assert.equal(joinWallRun(edge, [neighbour]).gx, 12.4);
});

test('collision and rendering can filter to a single storey', () => {
  const items = [{ uid: 'a', level: 0 }, { uid: 'b', level: 2 }, { uid: 'c' }];
  assert.deepEqual(itemsOnLevel(items, 0).map((i) => i.uid), ['a', 'c']);
  assert.deepEqual(itemsOnLevel(items, 2).map((i) => i.uid), ['b']);
});

test('the API accepts levels, per-level styles and defaults legacy builds to ground', () => {
  const state = sanitizeRoomState({
    items: [base({ uid: 'a', level: 2 }), base({ uid: 'b', gx: 6 })],
    surfaces: {
      floor: 'terrazzo',
      wall: 'slate_blue',
      floors: [
        { floor: 'terrazzo', wall: 'slate_blue' },
        { floor: 'concrete', wall: 'charcoal_loft' },
        { floor: 'oak_parquet', wall: 'sage_plaster' },
      ],
    },
    mood: 'night',
  });
  assert.equal(state.items[0].level, 2);
  assert.equal(state.items[1].level, 0);
  assert.equal(state.surfaces.floors.length, 3);
  assert.equal(state.surfaces.floors[1].floor, 'concrete');
});

test('the API rejects out-of-range levels and malformed floor lists', () => {
  assert.throws(() => sanitizeItems([base({ level: MAX_LEVELS })]), /level/);
  assert.throws(() => sanitizeItems([base({ level: 1.5 })]), /level/);
  assert.throws(
    () => sanitizeRoomState({ items: [], surfaces: { floor: 'terrazzo', wall: 'warm_chalk', floors: 'x' } }),
    /floors/
  );
  assert.throws(
    () =>
      sanitizeRoomState({
        items: [],
        surfaces: { floor: 'terrazzo', wall: 'warm_chalk', floors: [{ floor: 'bogus', wall: 'warm_chalk' }] },
      }),
    /floors/
  );
});
