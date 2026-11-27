/**
 * Programmatic hotel + airport invariants.
 *
 * `npm run check:hotel` prints the floor-by-floor suite table and fails if the
 * hotel stops being 7 floors / 11 door slots / exactly 65 suites, or if the
 * terminal layout loses a space, a gate, a counter or a carousel.
 */
import assert from 'node:assert/strict';
import {
  HOTEL_FLOOR_COUNT,
  HOTEL_FLOORS,
  HOTEL_LOBBY_FLOOR,
  HOTEL_TOTAL_ROOMS,
  HOUSEKEEPING_FLOOR,
  ROOM_SLOTS_PER_FLOOR,
  firstFreeRoomNumber,
  hotelRoomSlots,
  roomForAllocationIndex,
  roomNumberForSlot,
  roomNumbersForFloor,
  roomsOnFloor,
} from '../shared/hotel-layout.mjs';
import {
  AIRPORT_ARRIVAL_SPAWN,
  AIRPORT_BOUNDS,
  AIRPORT_CAROUSEL_COUNT,
  AIRPORT_GATE_COUNT,
  AIRPORT_GATES,
  AIRPORT_SPACES,
  BAGGAGE_CAROUSELS,
  CHECK_IN_COUNTER_COUNT,
  CHECK_IN_ISLANDS,
  CHECK_IN_SELF_SERVICE,
  SECURITY_LANES,
} from '../shared/airport-layout.mjs';
import { doorbellAvailability } from '../shared/doorbell-rules.mjs';

const failures = [];
function check(label, fn) {
  try {
    fn();
    console.log(`  ok  ${label}`);
  } catch (error) {
    failures.push(`${label}: ${error.message}`);
    console.error(`  FAIL ${label}: ${error.message}`);
  }
}

console.log('LoftLife Grand Hotel');
console.log(`  floors: ${HOTEL_FLOOR_COUNT} (floor ${HOTEL_LOBBY_FLOOR} is the lobby)`);
for (const floor of [HOTEL_LOBBY_FLOOR, ...HOTEL_FLOORS]) {
  if (floor === HOTEL_LOBBY_FLOOR) {
    console.log(`  floor ${floor}: main lobby (reception, concierge, lounges, café, elevators)`);
    continue;
  }
  const end = roomNumberForSlot(floor, ROOM_SLOTS_PER_FLOOR - 1);
  console.log(
    `  floor ${floor}: ${roomsOnFloor(floor)} suites · ${roomRangeLabelSafe(floor)}` +
      (end ? '' : ' · east end = housekeeping')
  );
}
console.log(`  total enterable suites: ${HOTEL_TOTAL_ROOMS}`);

function roomRangeLabelSafe(floor) {
  const rooms = roomNumbersForFloor(floor);
  return rooms.length ? `${rooms[0]} – ${rooms[rooms.length - 1]}` : 'none';
}

check('hotel has exactly 7 floors and 65 rooms', () => {
  assert.equal(HOTEL_FLOOR_COUNT, 7);
  assert.equal(HOTEL_TOTAL_ROOMS, 65);
  assert.deepEqual(HOTEL_FLOORS, [2, 3, 4, 5, 6, 7]);
});

check('every residential floor has 11 door slots', () => {
  for (const floor of HOTEL_FLOORS) {
    assert.equal(roomNumbersForFloor(floor).length, floor === HOUSEKEEPING_FLOOR ? 10 : 11);
    assert.equal(roomNumberForSlot(floor, ROOM_SLOTS_PER_FLOOR - 1) === null, floor === HOUSEKEEPING_FLOOR);
  }
});

check('all 65 room numbers are unique and inside floors 2–7', () => {
  const slots = hotelRoomSlots();
  assert.equal(slots.length, 65);
  assert.equal(new Set(slots.map((slot) => slot.number)).size, 65);
  for (const slot of slots) {
    assert.match(slot.number, /^[2-7](0[1-9]|1[01])$/);
    assert.equal(Number(slot.number.slice(0, 1)), slot.floor);
  }
});

check('allocation hands out a different suite and skips owned rooms', () => {
  assert.equal(roomForAllocationIndex(1).number, '402');
  assert.equal(roomForAllocationIndex(2).number, '201');
  assert.equal(roomForAllocationIndex(65).number, '710');
  assert.equal(roomForAllocationIndex(66).number, 'PH1');
  assert.equal(firstFreeRoomNumber([]).number, '402');
  assert.equal(firstFreeRoomNumber(['402']).number, '201');
  assert.equal(firstFreeRoomNumber(['402', '201', '202']).number, '203');
});

check('suite 402 remains a floor-4 suite', () => {
  assert.ok(roomNumbersForFloor(4).includes('402'));
  assert.equal(roomForAllocationIndex(1).number, '402');
});

check('doorbell refuses absent owners and accepts only owners inside their room', () => {
  const suite = { owner_id: 'owner' };
  const base = { suite, requesterId: 'visitor' };
  assert.equal(doorbellAvailability({ ...base, ownerOnline: false }).ok, false);
  assert.equal(doorbellAvailability({ ...base, ownerOnline: true, ownerLocation: 'lobby' }).reason, 'not_in_room');
  assert.equal(doorbellAvailability({ ...base, ownerOnline: true, ownerLocation: 'world' }).ok, false);
  assert.equal(doorbellAvailability({ ...base, ownerOnline: true, ownerLocation: 'room' }).ok, true);
  assert.equal(doorbellAvailability({ suite: { owner_id: 'visitor' }, requesterId: 'visitor', ownerOnline: true, ownerLocation: 'room' }).reason, 'own_room');
  assert.equal(doorbellAvailability({ ...base, requesterIsGuest: true, ownerOnline: true, ownerLocation: 'room' }).reason, 'guest');
  assert.equal(doorbellAvailability({ ...base, suite: null, ownerOnline: true, ownerLocation: 'room' }).reason, 'not_found');
});

console.log('\nTheCity International Airport');
check('terminal is a large four-space building', () => {
  const width = AIRPORT_BOUNDS.maxX - AIRPORT_BOUNDS.minX;
  const depth = AIRPORT_BOUNDS.maxZ - AIRPORT_BOUNDS.minZ;
  assert.equal(width, 112);
  assert.equal(depth, 76);
  assert.equal(Object.keys(AIRPORT_SPACES).length, 4);
  assert.ok(AIRPORT_SPACES.departures.z1 > AIRPORT_SPACES.departures.z0);
  assert.ok(AIRPORT_SPACES.arrivals.x1 > AIRPORT_SPACES.arrivals.x0);
});

check('two concourses with 12 gates inside the pier', () => {
  assert.equal(AIRPORT_GATE_COUNT, 12);
  assert.equal(AIRPORT_GATES.filter((gate) => gate.concourse === 'A').length, 6);
  assert.equal(AIRPORT_GATES.filter((gate) => gate.concourse === 'B').length, 6);
  for (const gate of AIRPORT_GATES) {
    assert.ok(gate.x > AIRPORT_BOUNDS.minX && gate.x < AIRPORT_BOUNDS.maxX);
    assert.ok(gate.z > AIRPORT_BOUNDS.minZ && gate.z < AIRPORT_BOUNDS.maxZ);
  }
});

check('check-in, security and baggage capacity', () => {
  assert.equal(CHECK_IN_ISLANDS.length, 3);
  assert.equal(CHECK_IN_COUNTER_COUNT, 15);
  assert.ok(CHECK_IN_SELF_SERVICE >= 4);
  assert.ok(SECURITY_LANES.length >= 6);
  assert.equal(AIRPORT_CAROUSEL_COUNT, 3);
  assert.equal(BAGGAGE_CAROUSELS.length, 3);
});

check('arrivals spawn sits inside the terminal', () => {
  assert.ok(AIRPORT_ARRIVAL_SPAWN.z < AIRPORT_BOUNDS.maxZ);
  assert.ok(AIRPORT_ARRIVAL_SPAWN.z > AIRPORT_BOUNDS.minZ);
  assert.ok(Math.abs(AIRPORT_ARRIVAL_SPAWN.x) < AIRPORT_BOUNDS.maxX);
});

if (failures.length) {
  console.error(`\n${failures.length} check(s) failed`);
  process.exit(1);
}
console.log('\nAll hotel and airport checks passed.');
