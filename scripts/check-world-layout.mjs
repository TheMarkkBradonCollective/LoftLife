/**
 * Fast CI guard for the shared city-layout engine.
 *
 * It verifies what both authorities rely on: TG-MapDefault is the default and
 * contains no prebuilt structures, the tool catalog covers every required
 * building action, roles resolve to the documented matrix, builder operations
 * stay inside approved plots, collisions and unapproved colours are rejected,
 * and the 600-object cap holds.
 */
import assert from 'node:assert/strict';
import {
  DEFAULT_FOUNDATION_ID,
  FOUNDATIONS,
  MAX_LAYOUT_OBJECTS,
  WORLD_TOOLS,
  applyWorldOp,
  emptyLayout,
  foundationRoads,
  plotContaining,
  worldPermissions,
} from '../shared/world-layout.mjs';

assert.equal(DEFAULT_FOUNDATION_ID, 'TG-MapDefault');
assert.equal(FOUNDATIONS.find((entry) => entry.default).id, 'TG-MapDefault');
assert.ok(foundationRoads(DEFAULT_FOUNDATION_ID).length > 0);
for (const foundation of FOUNDATIONS) {
  assert.equal(foundation.structures, undefined, `${foundation.id} must not prebuild structures`);
}

const toolIds = new Set(WORLD_TOOLS.map((tool) => tool.id));
for (const required of [
  'road', 'street', 'sidewalk', 'path',
  'house', 'apartment', 'commercial', 'business',
  'park', 'tree', 'bench', 'fountain', 'lamp', 'statue', 'flowerbed',
  'lawn', 'garden', 'plaza', 'water',
]) {
  assert.ok(toolIds.has(required), `missing required tool: ${required}`);
}

const owner = worldPermissions({ role: 'owner', isOwner: true, status: 'build_mode' });
assert.equal(owner.canManage, true);
assert.equal(owner.canPlaceStreets, true);
assert.equal(owner.canPublish, true);
assert.equal(owner.canApprovePlots, true);

const coOwner = worldPermissions({ role: 'co_owner', status: 'build_mode' });
assert.equal(coOwner.canManage, true);
assert.equal(coOwner.canPublish, false, 'publishing structure is owner-only');

const builder = worldPermissions({ role: 'builder', status: 'build_mode' });
assert.equal(builder.canBuild, true);
assert.equal(builder.canPlaceStreets, false);
assert.equal(builder.canApprovePlots, false);

for (const role of ['member', 'moderator']) {
  const member = worldPermissions({ role, status: 'build_mode' });
  assert.equal(member.canBuild, false);
  assert.equal(member.canViewStudio, false);
}
assert.equal(worldPermissions({ status: 'live' }).canBuild, false);
assert.equal(worldPermissions({ isOfficial: true, status: 'build_mode' }).canViewStudio, false);
assert.equal(
  worldPermissions({ isStaff: true, isOfficial: true, status: 'offline' }).canAccessOfficialWorkspace,
  true
);

const layout = emptyLayout();
const plots = [{ id: 'plot_a', name: 'Lot', x: 10, z: 10, w: 8, d: 8, status: 'approved', assignedTo: 'u1' }];

const house = applyWorldOp({
  layout,
  plots,
  permissions: builder,
  userId: 'u1',
  op: { action: 'place', tool: 'house', x: 11, z: 11, color: '#c98f6b', material: 'wood' },
});
assert.equal(house.layout.objects.length, 1);
assert.ok(plotContaining(plots, house.layout.objects[0]));

// Edge returns camelCase plot rows; builders must still be contained.
const edgePlot = [{ id: 'plot_b', name: 'Edge lot', x: 30, z: 30, w: 6, d: 6,
  status: 'approved', requestedBy: 'u2', assignedTo: 'u2' }];
const edgeHouse = applyWorldOp({
  layout,
  plots: edgePlot,
  permissions: builder,
  userId: 'u2',
  op: { action: 'place', tool: 'house', x: 31, z: 31 },
});
assert.equal(edgeHouse.layout.objects.length, 1);

assert.throws(
  () => applyWorldOp({
    layout,
    plots,
    permissions: builder,
    userId: 'u1',
    op: { action: 'place', tool: 'house', x: 2, z: 2 },
  }),
  (error) => error.code === 'plot_required'
);

assert.throws(
  () => applyWorldOp({
    layout,
    plots,
    permissions: builder,
    userId: 'u1',
    op: { action: 'place', tool: 'street', x: 11, z: 11 },
  }),
  (error) => error.code === 'street_permission'
);

assert.throws(
  () => applyWorldOp({
    layout,
    plots,
    permissions: owner,
    userId: 'u1',
    op: { action: 'place', tool: 'house', x: 2, z: 2, color: '#123456' },
  }),
  (error) => error.code === 'invalid_color'
);

const first = applyWorldOp({
  layout,
  plots,
  permissions: owner,
  userId: 'u1',
  op: { action: 'place', tool: 'house', x: 20, z: 20 },
});
assert.throws(
  () => applyWorldOp({
    layout: first.layout,
    plots,
    permissions: owner,
    userId: 'u1',
    op: { action: 'place', tool: 'apartment', x: 21, z: 21 },
  }),
  (error) => error.code === 'occupied'
);

// Every operation returns a new layout; the input is never mutated.
assert.equal(layout.objects.length, 0);

const full = { ...emptyLayout(), objects: Array.from({ length: MAX_LAYOUT_OBJECTS }, (_, index) => ({
  id: `wo_${index}`,
  tool: 'street',
  x: index % 60,
  z: Math.floor(index / 60),
  rot: 0,
  color: '#454a52',
  material: 'asphalt',
})) };
assert.throws(
  () => applyWorldOp({
    layout: full,
    plots: [],
    permissions: owner,
    userId: 'u1',
    op: { action: 'place', tool: 'tree', x: 0, z: 40 },
  }),
  (error) => error.code === 'layout_full'
);

console.log(
  `[world-layout] ${WORLD_TOOLS.length} tools, ${FOUNDATIONS.length} foundations, ` +
  `${MAX_LAYOUT_OBJECTS}-object cap, permissions and plot rules verified`
);
