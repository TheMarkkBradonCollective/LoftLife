import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { CHARACTER_LIBRARY } from '../../shared/catalog/character-library.mjs';
import { VEHICLE_LIBRARY } from '../../shared/catalog/vehicle-library.mjs';
import { ANIMATION_STATES } from '../../shared/animation.mjs';

const publicFile = (assetPath) => path.join(process.cwd(), 'public', assetPath.replace(/^\//, ''));

test('character library separates pedestrians, staff, accessibility and out-of-world props', () => {
  assert.equal(CHARACTER_LIBRARY.count, CHARACTER_LIBRARY.items.length);
  assert.ok(CHARACTER_LIBRARY.count >= 50);
  assert.ok(CHARACTER_LIBRARY.counts.pedestrian >= 30);
  assert.ok(CHARACTER_LIBRARY.counts.service >= 3);
  assert.ok(CHARACTER_LIBRARY.counts.accessibility >= 10);
  assert.equal(CHARACTER_LIBRARY.counts.out_of_world, 1);
  for (const item of CHARACTER_LIBRARY.items) {
    assert.ok(item.preview.endsWith('.png'));
    assert.ok(item.path.endsWith('.glb'));
    assert.ok(fs.existsSync(publicFile(item.preview)), `missing preview ${item.preview}`);
    assert.ok(fs.existsSync(publicFile(item.path)), `missing model ${item.path}`);
    // The imported character kits are static meshes. They must never silently
    // become a player avatar model, because that would bypass the customization
    // rig (makeover, mirror, closet, saved outfits).
    assert.equal(item.playerCompatible, false);
  }
  const pedestrians = CHARACTER_LIBRARY.items.filter((item) => item.role === 'pedestrian');
  assert.ok(pedestrians.every((item) => item.npcEligible));
  const fantasy = CHARACTER_LIBRARY.items.find((item) => item.role === 'out_of_world');
  assert.equal(fantasy.npcEligible, false);
});

test('the animation foundation covers every requested everyday action', () => {
  const ids = new Set(CHARACTER_LIBRARY.animationSets.map((set) => set.id));
  for (const state of ANIMATION_STATES) assert.ok(ids.has(state), `animation set ${state} missing from the library`);
  for (const state of ['idle', 'walk', 'run', 'sit', 'stand', 'wave', 'talk', 'gesture', 'enter_vehicle', 'exit_vehicle']) {
    assert.ok(ids.has(state), `required animation ${state} missing`);
  }
  assert.equal(CHARACTER_LIBRARY.animationResources.length, 0);
  assert.match(CHARACTER_LIBRARY.animationNote, /static|rigged|rig/i);
});

test('vehicle catalogue groups every imported vehicle with a real preview', () => {
  assert.equal(VEHICLE_LIBRARY.count, VEHICLE_LIBRARY.items.length);
  assert.ok(VEHICLE_LIBRARY.count >= 130);
  const groups = VEHICLE_LIBRARY.counts;
  for (const group of ['passenger_cars', 'suv_vans', 'commercial', 'taxis', 'buses_transit', 'watercraft', 'rail_infrastructure', 'parts']) {
    assert.ok((groups[group] ?? 0) > 0, `vehicle group ${group} is empty`);
  }
  for (const item of VEHICLE_LIBRARY.items) {
    assert.ok(item.preview.endsWith('.png'));
    assert.ok(fs.existsSync(publicFile(item.preview)), `missing vehicle preview ${item.preview}`);
    assert.ok(fs.existsSync(publicFile(item.path)), `missing vehicle model ${item.path}`);
    assert.ok(VEHICLE_LIBRARY.groupLabels[item.group]);
  }
});

test('only street-appropriate models are marked for everyday traffic', () => {
  const eligible = VEHICLE_LIBRARY.items.filter((item) => item.trafficEligible);
  assert.ok(eligible.length >= 10);
  for (const item of eligible) {
    assert.ok(['passenger_cars', 'suv_vans', 'commercial', 'taxis'].includes(item.group));
    assert.equal(item.toyStyle, false);
  }
  const karts = VEHICLE_LIBRARY.items.filter((item) => item.group === 'karts');
  assert.equal(karts.length, 5);
  assert.ok(karts.every((item) => item.toyStyle && !item.trafficEligible));
  const taxis = VEHICLE_LIBRARY.items.filter((item) => item.group === 'taxis');
  assert.equal(taxis.length, 1);
  assert.equal(taxis[0].name, 'Taxi');
  for (const item of VEHICLE_LIBRARY.items) {
    if (['parts', 'rail_infrastructure'].includes(item.group)) assert.equal(item.trafficEligible, false);
  }
});

test('the runtime fleet is documented separately from the imported models', () => {
  const ids = new Set(VEHICLE_LIBRARY.inWorldFleet.map((entry) => entry.id));
  for (const id of ['loftline-bus', 'loftline-taxi', 'loftline-rail', 'city-traffic']) assert.ok(ids.has(id));
  for (const entry of VEHICLE_LIBRARY.inWorldFleet) {
    assert.equal(entry.source, 'runtime mesh');
    assert.ok(entry.label && entry.note);
  }
});
