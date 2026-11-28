/**
 * Rideable city transit.
 *
 * All vehicles are owned by this module: the route, timetable, taxi dispatch,
 * seats and passenger poses live on the server. Two players who board the same
 * vehicle in the same instance ride together, and a modified client cannot
 * steer, teleport or drive any of it: poses from riders are ignored.
 *
 * Three families share the fleet:
 *  - bus   scheduled LoftLine routes with fixed stops
 *  - rail  scheduled light-rail lines with stations
 *  - taxi  autonomous cars that cruise the road grid, pause for nearby
 *          pedestrians, and drive a hired passenger to a valid destination
 *
 * There are no driver or conductor NPCs anywhere in this system.
 */
import { badRequest, conflict, notFound } from './errors.mjs';

const SLOPE = 0.42; // matches CITY_SLOPE: world x = u + slope * z
const BUS_SPEED = 9; // m/s
const RAIL_SPEED = 16;
const TAXI_SPEED = 12;
const BUS_DWELL_MS = 4500;
const RAIL_DWELL_MS = 5500;
const MAX_RIDE_MS = 300_000;
const BOARD_RADIUS = 10;
const TAXI_BOARD_RADIUS = 9;
const BUS_SEATS = 6;
const RAIL_SEATS = 8;
const TAXI_SEATS = 3;
const TAXI_PAUSE_MS = 4200;
const TAXI_PAUSE_COOLDOWN_MS = 14_000;
const TAXI_WAIT_MS = 45_000;

/** Full street grid, used to keep hired taxis on roads. */
const ROAD_U = [
  -487.06, -446.88, -409.76, -370.44, -331.55, -288.2,
  -249.31, -210.44, -174.45, -138.8, -97.13, -54.93,
  0, 56.96, 98.34, 139.01, 173.89, 212.43,
  254.27, 298.6, 343.33, 382.86, 424.35, 467.19,
  504.86, 543.87,
];
const ROAD_Z = [
  -532.76, -493.66, -461.29, -426.6, -387.62, -347.76,
  -316.18, -278.55, -248.88, -215.15, -168.95, -129.64,
  -87.84, -43.05, 0, 40.02, 84.09, 115.6,
  161.12, 206.23, 237.12, 270.93, 303.2, 334.84,
  372.44, 405.49, 443.43, 487.17, 525.39, 562.76,
];

/** World x for a diagonal (u) street at a given z. */
const stop = (id, name, u, z) => ({ id, name, x: Math.round((u + SLOPE * z) * 100) / 100, z });
const VIADUCT_Z = 40.02; // 16th Street elevated line

export const TRANSIT_LINES = [
  {
    id: 'loftline-15',
    label: '15th Street Bus',
    kind: 'bus',
    color: '#39ff14',
    // North-side kerb of 15th Street, linking the civic and retail spines.
    stops: [
      stop('15-l', '15th & L St', -54.93, -9.5),
      stop('15-m', '15th & M St', 0, -9.5),
      stop('15-n', '15th & N St', 56.96, -9.5),
      stop('15-p', '15th & P St', 139.01, -9.5),
      stop('15-r', '15th & R St', 212.43, -9.5),
      stop('15-s', '15th & S St', 254.27, -9.5),
    ],
  },
  {
    id: 'loftline-m',
    label: 'M Street Boulevard Bus',
    kind: 'bus',
    color: '#39ff14',
    // East-side bus lane on the eight-lane M Street boulevard.
    stops: [
      stop('m-12', 'M St & 12th St', 16.4, -129.64),
      stop('m-14', 'M St & 14th St', 16.4, -43.05),
      stop('m-15', 'M St & 15th St', 16.4, 0),
      stop('m-18', 'M St & 18th St', 16.4, 115.6),
      stop('m-22', 'M St & 22nd St', 16.4, 270.93),
      stop('m-28', 'M St & 28th St', 16.4, 487.17),
    ],
  },
  {
    id: 'loftline-loop',
    label: 'Downtown Loop Bus',
    kind: 'bus',
    color: '#22d3ee',
    // A road rectangle around the civic core: M/O × 12th/18th.
    stops: [
      stop('loop-m12', 'M St & 12th St', 0, -129.64),
      stop('loop-m18', 'M St & 18th St', 0, 115.6),
      stop('loop-o18', 'O St & 18th St', 98.34, 115.6),
      stop('loop-o12', 'O St & 12th St', 98.34, -129.64),
    ],
  },
  {
    id: 'airport-express',
    label: 'Airport Express Bus',
    kind: 'bus',
    color: '#38bdf8',
    // Central Station → O St → 20th St → W St → 28th St → terminal kerb.
    stops: [
      stop('air-central', 'Central Station', 0, 0),
      stop('air-o15', 'O St & 15th St', 98.34, 0),
      stop('air-o20', 'O St & 20th St', 98.34, 206.23),
      stop('air-w20', 'W St & 20th St', 424.35, 206.23),
      stop('air-w28', 'W St & 28th St', 424.35, 487.17),
      stop('air-terminal', 'Airport Terminal', 504.83, 487.17),
    ],
  },
  {
    id: 'rail-green',
    label: 'Green Line · 16th Street Express',
    kind: 'rail',
    color: '#22c55e',
    // Runs entirely on the elevated 16th Street viaduct.
    stops: [
      stop('rail-a', 'A St · 16th Station', -487.06, 40.02),
      stop('rail-m', 'M St · 16th Station', 0, 40.02),
      stop('rail-q', 'Q St · 16th Station', 173.89, 40.02),
      stop('rail-u', 'U St · 16th Station', 343.33, 40.02),
      stop('rail-z', 'Z St · 16th Station', 543.87, 40.02),
    ],
  },
  {
    id: 'rail-blue',
    label: 'Blue Line · Downtown Crosstown',
    kind: 'rail',
    color: '#3b82f6',
    stops: [
      stop('blue-m', 'M St · 16th Station', 0, 40.02),
      stop('blue-o', 'O St · 16th Station', 98.34, 40.02),
      stop('blue-p', 'P St · 16th Station', 139.01, 40.02),
      stop('blue-t', 'T St · 16th Station', 298.6, 40.02),
      stop('blue-w', 'W St · 16th Station', 424.35, 40.02),
    ],
  },
];

export const TRANSIT_HUBS = [
  {
    id: 'central-station',
    label: 'LoftLife Central Station',
    mode: 'rail',
    // South-west corner of LoftLife Plaza, clear of the fountain and stage.
    x: 32.1,
    z: 30,
  },
];

export const TAXI_DESTINATIONS = [
  {
    id: 'plaza',
    label: 'LoftLife Plaza',
    x: 32.6,
    z: 30,
    arrival: { x: 32.6, z: 30 },
  },
  {
    id: 'hotel',
    label: 'Grand Hotel',
    x: 655.93,
    z: 505.37,
    arrival: { x: 655.93, z: 505.37 },
  },
  {
    id: 'airport',
    label: 'TheCity Airport',
    x: 710.3,
    z: 485.67,
    arrival: { x: 710.3, z: 485.67 },
  },
  {
    id: 'clothing-store',
    label: 'LoftLife Threads',
    x: 158.89,
    z: 196.23,
    arrival: { x: 158.89, z: 196.23 },
  },
  {
    id: 'community-center',
    label: 'LoftLife Community Center',
    x: -34.93,
    z: -7.3,
    arrival: { x: -34.93, z: -7.3 },
  },
  {
    id: 'cafe',
    label: 'Bean & Loft Café',
    x: 29.82,
    z: -7.3,
    arrival: { x: 29.82, z: -7.3 },
  },
  {
    id: 'library',
    label: 'LoftLife Public Library',
    x: -12.58,
    z: 45.92,
    arrival: { x: -12.58, z: 45.92 },
  },
  {
    id: 'cinema',
    label: 'LoftLife Cinema',
    x: -140.99,
    z: -190.85,
    arrival: { x: -140.99, z: -190.85 },
  },
  {
    id: 'event-hall',
    label: 'The Loft Hall',
    x: -129.19,
    z: -190.85,
    arrival: { x: -129.19, z: -190.85 },
  },
  {
    id: 'nightclub',
    label: 'Neon Loft Nightclub',
    x: 116.38,
    z: -93.74,
    arrival: { x: 116.38, z: -93.74 },
  },
  {
    id: 'bar',
    label: 'The Brass Tap',
    x: 153.71,
    z: -65.44,
    arrival: { x: 153.71, z: -65.44 },
  },
  {
    id: 'toke-lounge',
    label: 'Cloud Nine Toke Lounge',
    x: 105.62,
    z: -65.44,
    arrival: { x: 105.62, z: -65.44 },
  },
  {
    id: 'market',
    label: 'Market Hall',
    x: 169.7,
    z: 121.5,
    arrival: { x: 169.7, z: 121.5 },
  },
  {
    id: 'restaurant',
    label: 'The Copper Fork',
    x: 257.83,
    z: 182.47,
    arrival: { x: 257.83, z: 182.47 },
  },
  {
    id: 'med-deck',
    label: 'The Med Deck',
    x: 362.82,
    z: 138.86,
    arrival: { x: 362.82, z: 138.86 },
  },
];

const lineById = new Map(TRANSIT_LINES.map((line) => [line.id, line]));
const taxiDestinationById = new Map(TAXI_DESTINATIONS.map((entry) => [entry.id, entry]));

/** @type {Map<string, Map<string, any>>} instanceId -> vehicleId -> vehicle */
const vehiclesByInstance = new Map();

function seatsFor(kind) {
  return kind === 'rail' ? RAIL_SEATS : kind === 'taxi' ? TAXI_SEATS : BUS_SEATS;
}

function speedFor(kind) {
  return kind === 'rail' ? RAIL_SPEED : kind === 'taxi' ? TAXI_SPEED : BUS_SPEED;
}

export function transitLines() {
  return TRANSIT_LINES.map((line) => ({
    id: line.id,
    label: line.label,
    kind: line.kind,
    color: line.color,
    stops: line.stops.map((entry) => ({ ...entry })),
  }));
}

export function taxiDestinations() {
  return TAXI_DESTINATIONS.map((entry) => ({
    id: entry.id,
    label: entry.label,
    x: entry.x,
    z: entry.z,
    arrival: { ...entry.arrival },
  }));
}

export function transitHubs() {
  return TRANSIT_HUBS.map((entry) => ({ ...entry }));
}

export function taxiDestination(destinationId) {
  return taxiDestinationById.get(String(destinationId ?? '')) ?? null;
}

export function transitLine(lineId) {
  return lineById.get(String(lineId ?? '')) ?? null;
}

function segmentDistance(a, b) {
  return Math.hypot(b.x - a.x, b.z - a.z);
}

function routeDuration(line) {
  const dwell = line.kind === 'rail' ? RAIL_DWELL_MS : BUS_DWELL_MS;
  let total = line.stops.length * dwell;
  for (let i = 0; i < line.stops.length; i++) {
    const next = line.stops[(i + 1) % line.stops.length];
    total += (segmentDistance(line.stops[i], next) / speedFor(line.kind)) * 1000;
  }
  return total;
}

/** Deterministic route position for a scheduled vehicle. */
export function routePosition(line, startStop, elapsedMs) {
  const stops = line.stops;
  const n = stops.length;
  const dwell = line.kind === 'rail' ? RAIL_DWELL_MS : BUS_DWELL_MS;
  let remaining = Math.max(0, elapsedMs) % routeDuration(line);
  let heading = 0;

  const start = stops[startStop % n];
  if (remaining < dwell) {
    return { x: start.x, z: start.z, heading, stopIndex: startStop % n, dwelling: true };
  }
  remaining -= dwell;

  for (let step = 0; step < n; step++) {
    const from = stops[(startStop + step) % n];
    const to = stops[(startStop + step + 1) % n];
    const dist = segmentDistance(from, to);
    const duration = (dist / speedFor(line.kind)) * 1000;
    heading = Math.atan2(to.x - from.x, to.z - from.z);

    if (remaining < duration) {
      const progress = duration === 0 ? 1 : remaining / duration;
      return {
        x: from.x + (to.x - from.x) * progress,
        z: from.z + (to.z - from.z) * progress,
        heading,
        stopIndex: (startStop + step + 1) % n,
        dwelling: false,
      };
    }
    remaining -= duration;

    const arrivedIndex = (startStop + step + 1) % n;
    if (remaining < dwell) {
      return { x: to.x, z: to.z, heading, stopIndex: arrivedIndex, dwelling: true };
    }
    remaining -= dwell;
  }

  return { x: start.x, z: start.z, heading, stopIndex: startStop % n, dwelling: true };
}

function instancesFor(instanceId) {
  let map = vehiclesByInstance.get(instanceId);
  if (!map) {
    map = new Map();
    vehiclesByInstance.set(instanceId, map);
  }
  return map;
}

function seatOffset(kind, seat) {
  if (kind === 'taxi') {
    const spots = [
      { lateral: 0, along: 1.25 },
      { lateral: -0.68, along: -0.35 },
      { lateral: 0.68, along: -0.35 },
    ];
    return spots[seat % 3];
  }
  if (kind === 'rail') {
    const side = seat % 2 === 0 ? -1 : 1;
    const row = Math.floor(seat / 2);
    return { lateral: side * 0.72, along: 4.6 - row * 1.35 };
  }
  const side = seat % 2 === 0 ? -1 : 1;
  const row = Math.floor(seat / 2);
  return { lateral: side * 0.62, along: 1.35 - row * 1.25 };
}

function riderPosition(route, seat, kind) {
  const forwardX = Math.sin(route.heading);
  const forwardZ = Math.cos(route.heading);
  const rightX = Math.cos(route.heading);
  const rightZ = -Math.sin(route.heading);
  const { lateral, along } = seatOffset(kind, seat);
  return {
    x: route.x + rightX * lateral + forwardX * along,
    z: route.z + rightZ * lateral + forwardZ * along,
  };
}

function usedSeats(vehicle) {
  const used = new Set();
  for (const rider of vehicle.riders.values()) used.add(rider.seat);
  return used;
}

function freeSeat(vehicle) {
  const used = usedSeats(vehicle);
  for (let seat = 0; seat < seatsFor(vehicle.kind); seat++) {
    if (!used.has(seat)) return seat;
  }
  return -1;
}

function vehicleRoute(vehicle, nowMs) {
  if (vehicle.kind === 'taxi') {
    return { x: vehicle.x, z: vehicle.z, heading: vehicle.heading, stopIndex: 0, dwelling: vehicle.state !== 'driving' };
  }
  const line = lineById.get(vehicle.lineId);
  if (!line) return null;
  return routePosition(line, vehicle.startStop, nowMs - vehicle.startedAt);
}

export function vehicleView(vehicle, nowMs = Date.now()) {
  const route = vehicleRoute(vehicle, nowMs);
  if (!route) return null;
  return {
    id: vehicle.id,
    lineId: vehicle.lineId,
    label: vehicle.label,
    kind: vehicle.kind,
    color: vehicle.color ?? '#39ff14',
    x: Math.round(route.x * 100) / 100,
    z: Math.round(route.z * 100) / 100,
    heading: Math.round(route.heading * 1000) / 1000,
    stopIndex: route.stopIndex,
    dwelling: route.dwelling,
    state: vehicle.state ?? null,
    destinationId: vehicle.destinationId ?? null,
    destinationLabel: vehicle.destination?.label ?? null,
    seats: seatsFor(vehicle.kind),
    riders: [...vehicle.riders.values()].map((rider) => ({
      userId: rider.player.userId,
      handle: rider.player.handle,
      seat: rider.seat,
    })),
  };
}

/** Create the ambient fleet for an instance: one bus/rail per line, 3 taxis. */
export function ensureFleet(instanceId) {
  const map = instancesFor(instanceId);
  for (const line of TRANSIT_LINES) {
    if (map.has(line.id)) continue;
    map.set(line.id, {
      id: `${line.kind === 'rail' ? 'rail' : 'bus'}_${line.id}`,
      instanceId,
      lineId: line.id,
      label: line.label,
      kind: line.kind,
      color: line.color,
      startStop: 0,
      startedAt: Date.now(),
      riders: new Map(),
    });
  }
  // Autonomous taxis are intentionally disabled; players travel via scheduled transit.

  return map;
}

function taxiLoop() {
  const corners = [
    { u: 0, z: 0 },
    { u: 0, z: 40.02 },
    { u: 98.34, z: 40.02 },
    { u: 98.34, z: 0 },
  ].map((node) => ({ x: node.u + SLOPE * node.z, z: node.z }));
  const segments = [];
  let total = 0;
  for (let i = 0; i < corners.length; i++) {
    const from = corners[i];
    const to = corners[(i + 1) % corners.length];
    const length = segmentDistance(from, to);
    segments.push({ from, to, length, start: total });
    total += length;
  }
  return { corners, segments, total };
}

function loopPoint(loop, distance) {
  const at = ((distance % loop.total) + loop.total) % loop.total;
  for (const segment of loop.segments) {
    if (at <= segment.start + segment.length) {
      const t = segment.length === 0 ? 1 : (at - segment.start) / segment.length;
      return {
        x: segment.from.x + (segment.to.x - segment.from.x) * t,
        z: segment.from.z + (segment.to.z - segment.from.z) * t,
        heading: Math.atan2(segment.to.x - segment.from.x, segment.to.z - segment.from.z),
      };
    }
  }
  return { ...loop.corners[0], heading: 0 };
}

function nearest(value, list) {
  let best = list[0];
  let bestDistance = Math.abs(value - list[0]);
  for (const entry of list) {
    const distance = Math.abs(value - entry);
    if (distance < bestDistance) {
      best = entry;
      bestDistance = distance;
    }
  }
  return best;
}

function roadPoint(u, z) {
  return { x: u + SLOPE * z, z };
}

/** Plan a road-following taxi route: short pull-out, grid legs, then driveway. */
function taxiPath(from, destination) {
  const fromU = from.x - SLOPE * from.z;
  const nearU = nearest(fromU, ROAD_U);
  const nearZ = nearest(from.z, ROAD_Z);
  const destU = nearest(destination.x - SLOPE * destination.z, ROAD_U);
  const destZ = nearest(destination.z, ROAD_Z);
  const points = [
    { x: from.x, z: from.z },
    roadPoint(nearU, nearZ),
    roadPoint(destU, nearZ),
    roadPoint(destU, destZ),
    { x: destination.arrival.x, z: destination.arrival.z },
  ];
  const cleaned = [];
  for (const point of points) {
    const previous = cleaned[cleaned.length - 1];
    if (previous && Math.hypot(point.x - previous.x, point.z - previous.z) < 0.4) continue;
    cleaned.push(point);
  }
  return cleaned;
}

export function vehiclesFor(instanceId, nowMs = Date.now()) {
  const map = ensureFleet(instanceId);
  return [...map.values()].map((vehicle) => vehicleView(vehicle, nowMs)).filter(Boolean);
}

function beginRoam(vehicle) {
  vehicle.state = 'roam';
  vehicle.destinationId = null;
  vehicle.destination = null;
  vehicle.path = [];
  vehicle.pathIndex = 0;
  vehicle.speed = 0;
  vehicle.waitingSince = 0;
  vehicle.arrivedAt = 0;
  // Continue from the nearest point of the loop instead of snapping away.
  let best = 0;
  let bestDistance = Infinity;
  for (let distance = 0; distance < vehicle.loop.total; distance += 2) {
    const point = loopPoint(vehicle.loop, distance);
    const gap = Math.hypot(point.x - vehicle.x, point.z - vehicle.z);
    if (gap < bestDistance) {
      bestDistance = gap;
      best = distance;
    }
  }
  vehicle.loopDistance = best;
  vehicle.x = loopPoint(vehicle.loop, best).x;
  vehicle.z = loopPoint(vehicle.loop, best).z;
}

/** Drive an idle taxi back to its downtown loop without teleporting it. */
function sendTaxiHome(vehicle) {
  let best = 0;
  let bestDistance = Infinity;
  for (let distance = 0; distance < vehicle.loop.total; distance += 2) {
    const point = loopPoint(vehicle.loop, distance);
    const gap = Math.hypot(point.x - vehicle.x, point.z - vehicle.z);
    if (gap < bestDistance) {
      bestDistance = gap;
      best = distance;
    }
  }
  const target = loopPoint(vehicle.loop, best);
  vehicle.loopDistance = best;
  vehicle.state = 'returning';
  vehicle.destination = null;
  vehicle.destinationId = null;
  vehicle.path = taxiPath({ x: vehicle.x, z: vehicle.z }, {
    x: target.x,
    z: target.z,
    arrival: { x: target.x, z: target.z },
  });
  vehicle.pathIndex = 0;
  vehicle.segmentStart = null;
  vehicle.speed = 0;
}

function stopTaxi(vehicle) {
  vehicle.speed = 0;
  vehicle.path = [];
  vehicle.pathIndex = 0;
}

/**
 * Board a scheduled bus or light-rail vehicle at a stop.
 * Returns { vehicle, seat, line }; throws an ApiError the gateway forwards.
 */
export function boardRider(player, instanceId, { lineId, stopId }) {
  const line = transitLine(lineId);
  if (!line) throw notFound('Unknown transit line');
  const stopIndex = line.stops.findIndex((entry) => entry.id === String(stopId ?? ''));
  if (stopIndex === -1) throw badRequest('Unknown transit stop');
  const at = line.stops[stopIndex];

  if (player.riding) throw conflict('You are already riding transit');
  if (player.journey) throw conflict('Finish your journey first');
  if (player.location !== 'world') throw conflict('Walk to a transit stop first');
  const distance = Math.hypot(player.x - at.x, player.z - at.z);
  if (distance > BOARD_RADIUS) throw badRequest('Walk closer to the stop to board');

  const map = ensureFleet(instanceId);
  const vehicle = map.get(line.id);
  if (!vehicle) throw notFound('That vehicle is not running');

  const seat = freeSeat(vehicle);
  if (seat === -1) throw conflict(`This ${line.kind === 'rail' ? 'train' : 'bus'} is full`);
  vehicle.riders.set(player.userId, {
    player,
    seat,
    boardedAt: Date.now(),
  });
  player.riding = vehicle.id;
  player.transitLineId = line.id;
  player.transitSeat = seat;
  player.location = 'transit';

  return {
    vehicle: vehicleView(vehicle),
    seat,
    line: { id: line.id, label: line.label, kind: line.kind },
  };
}

/** Hail and board an autonomous taxi that is stopped or cruising nearby. */
export function boardTaxi(player, instanceId, vehicleId) {
  if (player.riding) throw conflict('You are already riding transit');
  if (player.journey) throw conflict('Finish your journey first');
  if (player.location !== 'world') throw conflict('Walk to a taxi first');
  const map = ensureFleet(instanceId);
  const taxi = map.get(String(vehicleId ?? ''));
  if (!taxi || taxi.kind !== 'taxi') throw notFound('That taxi is not available');
  const distance = Math.hypot(player.x - taxi.x, player.z - taxi.z);
  if (distance > TAXI_BOARD_RADIUS) throw badRequest('Walk closer to the taxi');

  if (taxi.state === 'driving' || taxi.state === 'returning') {
    throw conflict('This taxi is already driving');
  }
  const seat = freeSeat(taxi);
  if (seat === -1) throw conflict('This taxi is full');
  taxi.riders.set(player.userId, { player, seat, boardedAt: Date.now() });
  if (taxi.state === 'roam' || taxi.state === 'paused') {
    taxi.state = 'waiting';
    taxi.waitingSince = Date.now();
    stopTaxi(taxi);
  }
  player.riding = taxi.id;
  player.transitLineId = 'taxi';
  player.transitSeat = seat;
  player.location = 'transit';

  return {
    vehicle: vehicleView(taxi),
    seat,
    line: { id: 'taxi', label: taxi.label, kind: 'taxi' },
    taxi: {
      state: taxi.state,
      destinationId: taxi.destinationId,
      destinations: taxiDestinations(),
    },
  };
}

/** A rider chooses where the hired taxi should drive. */
export function assignTaxiDestination(player, destinationId) {
  if (!player.riding) throw conflict('You are not in a taxi');
  const map = vehiclesByInstance.get(player.instanceId);
  const taxi = map?.get(player.riding);
  if (!taxi || taxi.kind !== 'taxi') throw badRequest('That is not a taxi');
  const destination = taxiDestination(destinationId);
  if (!destination) throw badRequest('Unknown taxi destination');
  if (taxi.state === 'driving') throw conflict('This taxi is already driving');
  if (taxi.state !== 'waiting' && taxi.state !== 'arrived') {
    throw conflict('This taxi is not taking passengers');
  }
  if (taxi.state === 'arrived') {
    beginRoam(taxi);
    taxi.state = 'waiting';
  }
  taxi.destinationId = destination.id;
  taxi.destination = destination;
  taxi.path = taxiPath({ x: taxi.x, z: taxi.z }, destination);
  taxi.pathIndex = 0;
  taxi.state = 'driving';
  taxi.speed = 0;
  taxi.waitingSince = 0;
  return {
    taxi: vehicleView(taxi),
    destination: { ...destination, arrival: { ...destination.arrival } },
    etaSeconds: Math.ceil(
      taxi.path.reduce((total, point, index) => {
        if (index === 0) return total;
        const previous = taxi.path[index - 1];
        return total + Math.hypot(point.x - previous.x, point.z - previous.z);
      }, 0) / TAXI_SPEED
    ),
  };
}

function seatRidersAtCurrentPose(vehicle, nowMs) {
  const route = vehicleRoute(vehicle, nowMs);
  if (!route) return;
  for (const rider of vehicle.riders.values()) {
    const position = riderPosition(route, rider.seat, vehicle.kind);
    rider.player.x = position.x;
    rider.player.z = position.z;
    rider.player.y = 0.34;
    rider.player.yaw = route.heading;
    rider.player.location = 'transit';
    rider.player.lastSeen = nowMs;
  }
}

function dropTaxiRiders(taxi, nowMs) {
  const destination = taxi.destination;
  const arrival = destination?.arrival ?? { x: taxi.x, z: taxi.z };
  for (const rider of [...taxi.riders.values()]) {
    const player = rider.player;
    taxi.riders.delete(player.userId);
    player.riding = null;
    player.transitLineId = null;
    player.transitSeat = null;
    player.location = 'world';
    player.x = arrival.x;
    player.z = arrival.z;
    player.y = 0;
    player.lastSeen = nowMs;
    const ws = player.ws;
    if (ws && ws.readyState === 1) {
      ws.send(
        JSON.stringify({
          t: 'transit',
          riding: null,
          exited: {
            x: arrival.x,
            z: arrival.z,
            lineId: 'taxi',
            label: destination ? `Taxi · ${destination.label}` : 'Taxi',
          },
          taxiArrived: Boolean(destination),
          vehicles: vehiclesFor(player.instanceId, nowMs),
        })
      );
    }
  }
}

function stepTaxi(taxi, deltaMs, nowMs) {
  if (taxi.state === 'roam' || taxi.state === 'paused') {
    // Autonomous taxis pause for pedestrians near the curb, then move on.
    if (taxi.state === 'paused') {
      if (nowMs < taxi.pauseUntil) return;
      taxi.state = 'roam';
      taxi.lastPauseAt = nowMs;
    }
    taxi.loopDistance += (TAXI_SPEED * deltaMs) / 1000;
    const point = loopPoint(taxi.loop, taxi.loopDistance);
    taxi.x = point.x;
    taxi.z = point.z;
    taxi.heading = point.heading;
    taxi.speed = TAXI_SPEED;
    return;
  }

  if (taxi.state === 'waiting') {
    taxi.speed = 0;
    if (taxi.riders.size === 0) {
      sendTaxiHome(taxi);
      return;
    }
    if (nowMs - taxi.waitingSince > TAXI_WAIT_MS) {
      dropTaxiRiders(taxi, nowMs);
      sendTaxiHome(taxi);
    }
    return;
  }

  if (taxi.state === 'arrived') {
    taxi.speed = 0;
    if (nowMs - taxi.arrivedAt > 2600) {
      dropTaxiRiders(taxi, nowMs);
      sendTaxiHome(taxi);
    }
    return;
  }

  if (taxi.state === 'driving' || taxi.state === 'returning') {
    let remaining = (TAXI_SPEED * deltaMs) / 1000;
    while (remaining > 0 && taxi.pathIndex < taxi.path.length - 1) {
      const from = taxi.path[taxi.pathIndex];
      const to = taxi.path[taxi.pathIndex + 1];
      const distance = Math.hypot(to.x - from.x, to.z - from.z);
      if (distance < 0.05) {
        taxi.pathIndex += 1;
        continue;
      }
      const heading = Math.atan2(to.x - from.x, to.z - from.z);
      if (!taxi.segmentStart || taxi.segmentStart.index !== taxi.pathIndex) {
        taxi.segmentStart = { index: taxi.pathIndex, x: taxi.x, z: taxi.z, traveled: 0 };
      }
      const traveled = remaining;
      const segmentLeft = distance - (taxi.segmentStart.traveled ?? 0);
      const move = Math.min(traveled, segmentLeft);
      taxi.segmentStart.traveled = (taxi.segmentStart.traveled ?? 0) + move;
      const t = Math.min(1, (taxi.segmentStart.traveled ?? 0) / distance);
      taxi.x = from.x + (to.x - from.x) * t;
      taxi.z = from.z + (to.z - from.z) * t;
      taxi.heading = heading;
      remaining -= move;
      if (t >= 1) {
        taxi.pathIndex += 1;
        taxi.segmentStart = null;
      } else {
        break;
      }
    }
    if (taxi.pathIndex >= taxi.path.length - 1) {
      taxi.x = taxi.path[taxi.path.length - 1].x;
      taxi.z = taxi.path[taxi.path.length - 1].z;
      taxi.speed = 0;
      if (taxi.state === 'returning') {
        beginRoam(taxi);
      } else {
        taxi.state = 'arrived';
        taxi.arrivedAt = nowMs;
      }
    }
    return;
  }

  sendTaxiHome(taxi);
}

/** Clear transit state for a player who disconnects or changes instance. */
export function releasePlayer(player) {
  if (!player.riding) return;
  const map = vehiclesByInstance.get(player.instanceId);
  if (map) {
    for (const [id, vehicle] of [...map]) {
      if (vehicle.riders.has(player.userId)) {
        vehicle.riders.delete(player.userId);
      }
      if (vehicle.riders.size === 0) {
        if (vehicle.kind === 'taxi' && vehicle.state !== 'roam') beginRoam(vehicle);
        // Scheduled vehicles stay in the ambient fleet.
        void id;
      }
    }
  }
  player.riding = null;
  player.transitLineId = null;
  player.transitSeat = null;
}

/** Leave the current vehicle at its current position (or the taxi's drop-off). */
export function exitRider(player) {
  if (!player.riding) return null;
  const map = vehiclesByInstance.get(player.instanceId);
  const vehicle = map?.get(player.riding) ?? null;
  if (!vehicle) {
    player.riding = null;
    player.transitLineId = null;
    player.transitSeat = null;
    player.location = 'world';
    return { x: player.x, z: player.z, lineId: null, label: null };
  }
  const line = transitLine(player.transitLineId);
  const route = vehicleRoute(vehicle, Date.now());
  vehicle.riders.delete(player.userId);
  let dropX = route?.x ?? player.x;
  let dropZ = route?.z ?? player.z;
  if (vehicle.kind === 'taxi' && vehicle.state === 'arrived' && vehicle.destination?.arrival) {
    dropX = vehicle.destination.arrival.x;
    dropZ = vehicle.destination.arrival.z;
  }
  if (vehicle.kind === 'taxi' && vehicle.riders.size === 0) {
    if (vehicle.state === 'waiting') sendTaxiHome(vehicle);
    else if (vehicle.state === 'arrived') sendTaxiHome(vehicle);
  }
  player.riding = null;
  player.transitLineId = null;
  player.transitSeat = null;
  player.location = 'world';
  player.x = dropX;
  player.z = dropZ;
  player.y = 0;
  return {
    x: dropX,
    z: dropZ,
    lineId: vehicle.kind === 'taxi' ? 'taxi' : line?.id ?? null,
    label: vehicle.kind === 'taxi' ? `Taxi · ${vehicle.destination?.label ?? 'City'}` : line?.label ?? null,
  };
}

/**
 * Advance every vehicle. Scheduled vehicles are deterministic; taxis advance
 * their dispatch state. Rider positions are written here and nowhere else.
 */
export function stepTransit(nowMs = Date.now(), lastMs = nowMs - 100, playersForInstance = () => []) {
  const deltaMs = Math.max(0, Math.min(500, nowMs - lastMs));
  const touched = new Set();
  for (const [instanceId, map] of vehiclesByInstance) {
    const cityPlayers =
      typeof playersForInstance === 'function' ? playersForInstance(instanceId) : playersForInstance;
    for (const vehicle of map.values()) {
      if (vehicle.kind === 'taxi') {
        if ((vehicle.state === 'roam' || vehicle.state === 'paused') && vehicle.riders.size === 0) {
          const near = cityPlayers.find(
            (player) =>
              player.location === 'world' &&
              Math.hypot(player.x - vehicle.x, player.z - vehicle.z) < 8.5
          );
          if (near && nowMs - vehicle.lastPauseAt > TAXI_PAUSE_COOLDOWN_MS) {
            vehicle.state = 'paused';
            vehicle.pauseUntil = nowMs + TAXI_PAUSE_MS;
            vehicle.lastPauseAt = nowMs;
          }
        }
        stepTaxi(vehicle, deltaMs, nowMs);
      }
      if (vehicle.riders.size === 0) continue;

      const route = vehicleRoute(vehicle, nowMs);
      if (!route) continue;
      for (const [userId, rider] of [...vehicle.riders]) {
        if (nowMs - rider.boardedAt > MAX_RIDE_MS) {
          const exited = exitRider(rider.player);
          const ws = rider.player.ws;
          if (ws && ws.readyState === 1) {
            ws.send(
              JSON.stringify({
                t: 'transit',
                riding: null,
                exited,
                vehicles: vehiclesFor(instanceId, nowMs),
              })
            );
          }
          continue;
        }
        const position = riderPosition(route, rider.seat, vehicle.kind);
        rider.player.x = position.x;
        rider.player.z = position.z;
        rider.player.y = 0.34;
        rider.player.yaw = route.heading;
        rider.player.location = 'transit';
        rider.player.lastSeen = nowMs;
      }
      touched.add(instanceId);
    }
  }
  return touched;
}

/** Test helper. */
export function resetTransit() {
  vehiclesByInstance.clear();
}
