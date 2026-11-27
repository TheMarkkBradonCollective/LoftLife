/**
 * Canonical layout for TheCity International Airport.
 *
 * The terminal is one building with four connected passenger spaces:
 *
 *   - Departures Hall  (landside, south-west)  check-in, security, shops, café
 *   - Arrivals Hall    (landside, south-east)  baggage claim, customs, ground transport
 *   - Concourse A      (airside, north-west)   gates A1–A6
 *   - Concourse B      (airside, north-east)   gates B1–B6
 *
 * Both the terminal builder and `npm run check:hotel` read these numbers, so the
 * geometry, the walkable bounds, the gate signs and the verification script
 * cannot drift apart. Dimensions are metres in the terminal's local space
 * (x east, z south) with the entrance at +Z.
 */

export const AIRPORT_BOUNDS = { minX: -56, maxX: 56, minZ: -38, maxZ: 38 };

export const AIRPORT_SPACES = {
  departures: { id: 'departures', label: 'Departures Hall · Terminal 1', z0: 6, z1: 38 },
  arrivals: { id: 'arrivals', label: 'Arrivals Hall · Terminal 2', x0: 16, x1: 56, z0: 6, z1: 38 },
  concourseA: { id: 'concourse_a', label: 'Concourse A', x0: -56, x1: 0, z0: -38, z1: 6 },
  concourseB: { id: 'concourse_b', label: 'Concourse B', x0: 0, x1: 56, z0: -38, z1: 6 },
};

export const AIRPORT_ENTRANCE = { x: 0, z: 36.4 };
export const AIRPORT_ARRIVAL_SPAWN = { x: 0, z: 34.6 };

/** Three check-in islands of five counters each, plus four self-service kiosks. */
export const CHECK_IN_ISLANDS = [
  { id: 'A', x: -44, z: 25 },
  { id: 'B', x: -29, z: 25 },
  { id: 'C', x: -14, z: 25 },
];
export const CHECK_IN_COUNTERS_PER_ISLAND = 5;
export const CHECK_IN_SELF_SERVICE = 4;
export const CHECK_IN_COUNTER_COUNT =
  CHECK_IN_ISLANDS.length * CHECK_IN_COUNTERS_PER_ISLAND;

/** Screening lanes: five standard lanes plus one priority/accessible lane. */
export const SECURITY_LANES = [-44, -36, -28, -20, -12, -2];
export const SECURITY_PRIORITY_LANE = -2;

export const BAGGAGE_CAROUSELS = [
  { id: 'C1', x: 27, z: 31, label: 'Carousel 1 · Domestic' },
  { id: 'C2', x: 43, z: 31, label: 'Carousel 2 · International' },
  { id: 'C3', x: 35, z: 18, label: 'Carousel 3 · Regional' },
];

/**
 * Gate podiums along the north pier. A-gates sit west of the central walkway,
 * B-gates east of it. `bridge` is the jet-bridge door in the north glass wall.
 */
export const AIRPORT_GATES = [
  ...Array.from({ length: 6 }, (_, i) => ({
    id: `A${i + 1}`,
    concourse: 'A',
    x: -50 + i * 8,
    z: -35,
    wide: i === 0 || i === 5,
  })),
  ...Array.from({ length: 6 }, (_, i) => ({
    id: `B${i + 1}`,
    concourse: 'B',
    x: 10 + i * 8,
    z: -35,
    wide: i === 0 || i === 5,
  })),
];

export const AIRPORT_GATE_COUNT = AIRPORT_GATES.length;
export const AIRPORT_CAROUSEL_COUNT = BAGGAGE_CAROUSELS.length;

/** Seats the terminal builder registers as sittable anchors. */
export const AIRPORT_SEAT_ANCHORS = [
  { id: 'airport_departures_wait', label: 'Departures Waiting Area', x: -6, z: 16, facing: 'north' },
  { id: 'airport_cafe_seat', label: 'Skyline Café Seat', x: -48.8, z: 16, facing: 'east' },
  { id: 'airport_gate_a2', label: 'Gate A2 Seat', x: -42, z: -28.6, facing: 'north' },
  { id: 'airport_gate_b3', label: 'Gate B3 Seat', x: 26, z: -28.6, facing: 'north' },
  { id: 'airport_arrivals_wait', label: 'Arrivals Meeting Point Seat', x: 30, z: 12, facing: 'south' },
];

/** Interactive points used by the viewport prompts. */
export const AIRPORT_INTERACTIONS = {
  checkIn: { x: -29, z: 21.4 },
  security: { x: -12, z: 6.8 },
  gateA: { x: -34, z: -32.4 },
  gateB: { x: 26, z: -32.4 },
  baggage: { x: 35, z: 24 },
  cafe: { x: -46, z: 12.4 },
  transport: { x: 45, z: 10.4 },
};

export function gateAt(id) {
  return AIRPORT_GATES.find((gate) => gate.id === id) ?? null;
}
