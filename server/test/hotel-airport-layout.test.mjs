import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HOTEL_FLOOR_COUNT,
  HOTEL_TOTAL_ROOMS,
  ROOM_SLOTS_PER_FLOOR,
  firstFreeRoomNumber,
  hotelRoomSlots,
  roomForAllocationIndex,
} from '../../shared/hotel-layout.mjs';
import { doorbellAvailability } from '../../shared/doorbell-rules.mjs';
import {
  AIRPORT_BOUNDS,
  AIRPORT_GATE_COUNT,
  AIRPORT_GATES,
  AIRPORT_SPACES,
  CHECK_IN_COUNTER_COUNT,
} from '../../shared/airport-layout.mjs';

test('hotel is seven floors with eleven door slots and 65 suites', () => {
  assert.equal(HOTEL_FLOOR_COUNT, 7);
  assert.equal(HOTEL_TOTAL_ROOMS, 65);
  assert.equal(ROOM_SLOTS_PER_FLOOR, 11);
  assert.equal(hotelRoomSlots().length, 65);
  assert.equal(new Set(hotelRoomSlots().map((slot) => slot.number)).size, 65);
});

test('every new account gets a unique hotel suite', () => {
  assert.equal(roomForAllocationIndex(1).number, '402');
  assert.equal(roomForAllocationIndex(2).number, '201');
  assert.equal(roomForAllocationIndex(65).number, '710');
  assert.equal(firstFreeRoomNumber([]).number, '402');
  assert.equal(firstFreeRoomNumber(['402']).number, '201');
  assert.equal(firstFreeRoomNumber(['402', '201', '202']).number, '203');
});

test('doorbell permission requires the owner online and physically inside the room', () => {
  const suite = { owner_id: 'owner_1' };
  const base = { suite, requesterId: 'visitor_1' };
  assert.equal(doorbellAvailability({ ...base, ownerOnline: false }).reason, 'offline');
  assert.equal(
    doorbellAvailability({ ...base, ownerOnline: true, ownerLocation: 'room' }).ok,
    true
  );
  for (const location of ['world', 'lobby', 'hallway', 'airport']) {
    assert.equal(
      doorbellAvailability({ ...base, ownerOnline: true, ownerLocation: location }).reason,
      'not_in_room'
    );
  }
  assert.equal(
    doorbellAvailability({ suite: { owner_id: 'visitor_1' }, requesterId: 'visitor_1', ownerOnline: true, ownerLocation: 'room' }).reason,
    'own_room'
  );
  assert.equal(
    doorbellAvailability({ ...base, requesterIsGuest: true, ownerOnline: true, ownerLocation: 'room' }).reason,
    'guest'
  );
});

test('airport terminal has four spaces, twelve gates and fifteen counters', () => {
  assert.equal(Object.keys(AIRPORT_SPACES).length, 4);
  assert.equal(AIRPORT_GATE_COUNT, 12);
  assert.equal(CHECK_IN_COUNTER_COUNT, 15);
  const width = AIRPORT_BOUNDS.maxX - AIRPORT_BOUNDS.minX;
  const depth = AIRPORT_BOUNDS.maxZ - AIRPORT_BOUNDS.minZ;
  assert.equal(width, 112);
  assert.equal(depth, 76);
  for (const gate of AIRPORT_GATES) {
    assert.ok(gate.x > AIRPORT_BOUNDS.minX && gate.x < AIRPORT_BOUNDS.maxX);
    assert.ok(gate.z > AIRPORT_BOUNDS.minZ && gate.z < AIRPORT_BOUNDS.maxZ);
  }
});
