/**
 * Canonical LoftLife Grand Hotel layout.
 *
 * Seven floors total: one lobby (floor 1) and six residential floors (2..7).
 * A standard residential floor has eleven suites: five on the north side,
 * five on the south side and one on the east end. Floor 7 trades its end suite
 * for a housekeeping room, which is what makes the requested total exactly 65
 * instead of 66. The client, the map, the elevator panel and the tests all read
 * these rules from here so the numbers cannot drift apart.
 *
 * Room numbers keep the existing scheme: floor + two-digit suite number, so
 * Suite 402 stays on floor 4 and existing account ownership is untouched.
 */

export const HOTEL_LOBBY_FLOOR = 1;
export const HOTEL_FLOORS = [2, 3, 4, 5, 6, 7];
export const HOTEL_TOP_FLOOR = 7;
export const HOTEL_FLOOR_COUNT = 7;

/** Five north + five south + one east-end suite. */
export const ROOMS_PER_STANDARD_FLOOR = 11;
/** Floor 7 has no east-end suite; it is the housekeeping room. */
export const HOUSEKEEPING_FLOOR = 7;
export const HOUSEKEEPING_ROOM = 'HOUSEKEEPING';

export const PLAYER_SUITE_FLOOR = 4;
export const PLAYER_SUITE_NUMBER = '402';

/** Five north doors, five south doors, one east-end door, in that order. */
export const ROOM_SLOTS_PER_FLOOR = 11;
export const NORTH_SLOTS = 5;
export const SOUTH_SLOTS = 5;
export const END_SLOT = 10;

/**
 * Number of enterable suites on a floor.
 * @param {number} floor
 * @returns {number}
 */
export function roomsOnFloor(floor) {
  const n = Number(floor);
  if (!HOTEL_FLOORS.includes(n)) return 0;
  return n === HOUSEKEEPING_FLOOR ? 10 : ROOMS_PER_STANDARD_FLOOR;
}

/**
 * Room number for a corridor slot, or null when the slot is the floor-7
 * housekeeping room.
 * @param {number} floor
 * @param {number} slot 0..10
 * @returns {string|null}
 */
export function roomNumberForSlot(floor, slot) {
  const n = Number(floor);
  const index = Number(slot);
  if (!HOTEL_FLOORS.includes(n) || !Number.isInteger(index) || index < 0 || index > END_SLOT) {
    return null;
  }
  if (n === HOUSEKEEPING_FLOOR && index === END_SLOT) return null;
  return `${n}${String(index + 1).padStart(2, '0')}`;
}

/** @param {number} floor */
export function roomNumbersForFloor(floor) {
  /** @type {string[]} */
  const rooms = [];
  for (let slot = 0; slot < ROOM_SLOTS_PER_FLOOR; slot++) {
    const room = roomNumberForSlot(floor, slot);
    if (room) rooms.push(room);
  }
  return rooms;
}

/**
 * "401 – 411" style range used by plaques and the elevator panel.
 * @param {number} floor
 */
export function roomRangeLabel(floor) {
  const count = roomsOnFloor(floor);
  if (!count) return 'No suites';
  const first = `${floor}01`;
  const last = `${floor}${String(count).padStart(2, '0')}`;
  return `${first} – ${last}`;
}

/** @param {number} roomNumber */
export function floorForRoom(roomNumber) {
  const n = Number(String(roomNumber).slice(0, 1));
  return HOTEL_FLOORS.includes(n) ? n : 0;
}

/** @param {number} floor */
export function isHousekeepingFloor(floor) {
  return Number(floor) === HOUSEKEEPING_FLOOR;
}

export const HOTEL_TOTAL_ROOMS = HOTEL_FLOORS.reduce(
  (sum, floor) => sum + roomsOnFloor(floor),
  0
);

/** Elevator stop list, highest floor first, then the lobby. */
export function elevatorStops() {
  return [
    ...HOTEL_FLOORS.slice()
      .reverse()
      .map((floor) => ({
        id: floor,
        label: `Floor ${floor}`,
        description:
          floor === HOUSEKEEPING_FLOOR
            ? `Suites ${roomRangeLabel(floor)} · Housekeeping`
            : `Suites ${roomRangeLabel(floor)}`,
      })),
    { id: 'L', label: 'Lobby (L)', description: 'Concierge · Reception · Main Street' },
  ];
}
