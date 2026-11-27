import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HOTEL_FLOORS,
  HOTEL_TOTAL_ROOMS,
  HOUSEKEEPING_FLOOR,
  PLAYER_SUITE_NUMBER,
  roomNumberForSlot,
  roomNumbersForFloor,
  roomRangeLabel,
  roomsOnFloor,
} from '../../shared/hotel-layout.mjs';

test('hotel has seven floors and exactly 65 rooms', () => {
  assert.equal(HOTEL_FLOORS.length, 6, 'six residential floors above the lobby');
  assert.equal(HOTEL_TOTAL_ROOMS, 65);
  assert.equal(HOTEL_FLOORS.reduce((sum, floor) => sum + roomsOnFloor(floor), 0), 65);
});

test('standard floors have eleven rooms and floor 7 has ten', () => {
  for (const floor of HOTEL_FLOORS) {
    assert.equal(roomsOnFloor(floor), floor === HOUSEKEEPING_FLOOR ? 10 : 11);
    assert.equal(roomNumbersForFloor(floor).length, floor === HOUSEKEEPING_FLOOR ? 10 : 11);
  }
});

test('existing suite 402 keeps its number and floor', () => {
  assert.equal(roomNumberForSlot(4, 1), PLAYER_SUITE_NUMBER);
  assert.ok(roomNumbersForFloor(4).includes(PLAYER_SUITE_NUMBER));
});

test('floor 7 end slot is housekeeping, not a suite', () => {
  assert.equal(roomNumberForSlot(HOUSEKEEPING_FLOOR, 10), null);
  assert.equal(roomRangeLabel(HOUSEKEEPING_FLOOR), '701 – 710');
  assert.equal(roomRangeLabel(4), '401 – 411');
});
