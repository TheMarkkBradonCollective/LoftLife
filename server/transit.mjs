/**
 * Rideable city transit.
 *
 * LoftLife's ambient traffic is decorative, but the LoftLine is real: the
 * server owns the route, the timetable and the seats. A player boards at a
 * stop, the server assigns a seat on the vehicle for that instance, and every
 * tick it writes the rider's authoritative position. Two players who board the
 * same line in the same instance therefore ride the same bus and see each other.
 *
 * Riders send no poses while aboard (the gateway ignores them), so the vehicle
 * cannot be steered by a modified client.
 */
import { badRequest, conflict, notFound } from './errors.mjs';

const DWELL_MS = 4500;
const SPEED = 9; // metres per second
const SEATS = 6;
const MAX_RIDE_MS = 180_000;
const BOARD_RADIUS = 10;

/** Stop coordinates come from the city grid: 15th St is z≈0, M St is u≈0. */
export const TRANSIT_LINES = [
  {
    id: 'loftline-15',
    label: '15th Street LoftLine',
    kind: 'bus',
    stops: [
      { id: '15-l', name: '15th & L St', x: -36, z: 5.85 },
      { id: '15-m', name: '15th & M St', x: 0, z: 5.85 },
      { id: '15-n', name: '15th & N St', x: 36, z: 5.85 },
      { id: '15-o', name: '15th & O St', x: 72.98, z: 5.85 },
      { id: '15-p', name: '15th & P St', x: 108.98, z: 5.85 },
    ],
  },
  {
    id: 'loftline-m',
    label: 'M Street LoftLine',
    kind: 'bus',
    stops: [
      { id: 'm-12', name: 'M St & 12th St', x: -39.23, z: -93.4 },
      { id: 'm-14', name: 'M St & 14th St', x: -19.14, z: -34 },
      { id: 'm-15', name: 'M St & 15th St', x: -4.86, z: 0 },
      { id: 'm-16', name: 'M St & 16th St', x: 9.42, z: 34 },
      { id: 'm-18', name: 'M St & 18th St', x: 33.15, z: 90.49 },
    ],
  },
];

const lineById = new Map(TRANSIT_LINES.map((line) => [line.id, line]));

/** @type {Map<string, Map<string, any>>} instanceId -> lineId -> vehicle */
const vehiclesByInstance = new Map();

export function transitLines() {
  return TRANSIT_LINES.map((line) => ({
    id: line.id,
    label: line.label,
    kind: line.kind,
    stops: line.stops.map((stop) => ({ ...stop })),
  }));
}

export function transitLine(lineId) {
  return lineById.get(String(lineId ?? '')) ?? null;
}

function segmentDistance(a, b) {
  return Math.hypot(b.x - a.x, b.z - a.z);
}

function routeDuration(line) {
  let total = line.stops.length * DWELL_MS;
  for (let i = 0; i < line.stops.length; i++) {
    const next = line.stops[(i + 1) % line.stops.length];
    total += (segmentDistance(line.stops[i], next) / SPEED) * 1000;
  }
  return total;
}

/** Deterministic route position for a vehicle that started at `startStop`. */
export function routePosition(line, startStop, elapsedMs) {
  const stops = line.stops;
  const n = stops.length;
  let remaining = Math.max(0, elapsedMs) % routeDuration(line);
  let heading = 0;

  const start = stops[startStop % n];
  if (remaining < DWELL_MS) {
    return { x: start.x, z: start.z, heading, stopIndex: startStop % n, dwelling: true };
  }
  remaining -= DWELL_MS;

  for (let step = 0; step < n; step++) {
    const from = stops[(startStop + step) % n];
    const to = stops[(startStop + step + 1) % n];
    const dist = segmentDistance(from, to);
    const duration = (dist / SPEED) * 1000;
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
    if (remaining < DWELL_MS) {
      return { x: to.x, z: to.z, heading, stopIndex: arrivedIndex, dwelling: true };
    }
    remaining -= DWELL_MS;
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

function seatOffset(seat) {
  const side = seat % 2 === 0 ? -1 : 1;
  const row = Math.floor(seat / 2);
  return { lateral: side * 0.62, along: 1.35 - row * 1.25 };
}

function riderPosition(route, seat) {
  const forwardX = Math.sin(route.heading);
  const forwardZ = Math.cos(route.heading);
  const rightX = Math.cos(route.heading);
  const rightZ = -Math.sin(route.heading);
  const { lateral, along } = seatOffset(seat);
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
  for (let seat = 0; seat < SEATS; seat++) {
    if (!used.has(seat)) return seat;
  }
  return -1;
}

export function vehicleView(vehicle, nowMs = Date.now()) {
  const line = lineById.get(vehicle.lineId);
  if (!line) return null;
  const route = routePosition(line, vehicle.startStop, nowMs - vehicle.startedAt);
  return {
    id: vehicle.id,
    lineId: vehicle.lineId,
    label: line.label,
    kind: line.kind,
    x: Math.round(route.x * 100) / 100,
    z: Math.round(route.z * 100) / 100,
    heading: Math.round(route.heading * 1000) / 1000,
    stopIndex: route.stopIndex,
    dwelling: route.dwelling,
    seats: SEATS,
    riders: [...vehicle.riders.values()].map((rider) => ({
      userId: rider.player.userId,
      handle: rider.player.handle,
      seat: rider.seat,
    })),
  };
}

export function vehiclesFor(instanceId, nowMs = Date.now()) {
  const map = vehiclesByInstance.get(instanceId);
  if (!map) return [];
  return [...map.values()].map((vehicle) => vehicleView(vehicle, nowMs)).filter(Boolean);
}

/**
 * Board the next vehicle on `lineId` at `stopId`.
 * Returns { vehicle, seat, line }; throws an ApiError the gateway can forward.
 */
export function boardRider(player, instanceId, { lineId, stopId }) {
  const line = transitLine(lineId);
  if (!line) throw notFound('Unknown transit line');
  const stopIndex = line.stops.findIndex((stop) => stop.id === String(stopId ?? ''));
  if (stopIndex === -1) throw badRequest('Unknown transit stop');
  const stop = line.stops[stopIndex];

  if (player.riding) throw conflict('You are already riding transit');
  if (player.location !== 'world') throw conflict('Walk to a transit stop first');
  const distance = Math.hypot(player.x - stop.x, player.z - stop.z);
  if (distance > BOARD_RADIUS) throw badRequest('Walk closer to the stop to board');

  const map = instancesFor(instanceId);
  let vehicle = map.get(line.id);
  if (!vehicle) {
    vehicle = {
      id: `bus_${line.id}_${Math.random().toString(36).slice(2, 8)}`,
      instanceId,
      lineId: line.id,
      startStop: stopIndex,
      startedAt: Date.now(),
      riders: new Map(),
    };
    map.set(line.id, vehicle);
  }

  const seat = freeSeat(vehicle);
  if (seat === -1) throw conflict('This bus is full');
  vehicle.riders.set(player.userId, {
    player,
    seat,
    boardedAt: Date.now(),
  });
  player.riding = vehicle.id;
  player.transitLineId = line.id;
  player.transitSeat = seat;
  player.location = 'transit';

  return { vehicle: vehicleView(vehicle), seat, line: { id: line.id, label: line.label } };
}

/** Leave the current vehicle at its current position. */
export function exitRider(player) {
  if (!player.riding) return null;
  const map = vehiclesByInstance.get(player.instanceId);
  const vehicle = map ? [...map.values()].find((entry) => entry.id === player.riding) : null;
  const line = transitLine(player.transitLineId);
  let dropX = player.x;
  let dropZ = player.z;
  if (vehicle && line) {
    const route = routePosition(line, vehicle.startStop, Date.now() - vehicle.startedAt);
    dropX = route.x;
    dropZ = route.z;
    vehicle.riders.delete(player.userId);
    if (vehicle.riders.size === 0) map.delete(vehicle.lineId);
  }
  player.riding = null;
  player.transitLineId = null;
  player.transitSeat = null;
  player.location = 'world';
  player.x = dropX;
  player.z = dropZ;
  player.y = 0;
  return { x: dropX, z: dropZ, lineId: line?.id ?? null, label: line?.label ?? null };
}

/**
 * Advance every vehicle: write rider positions, drop expired riders.
 * Returns per-instance info the gateway can broadcast.
 */
export function stepTransit(nowMs = Date.now()) {
  const touched = new Set();
  for (const [instanceId, map] of vehiclesByInstance) {
    for (const [lineId, vehicle] of [...map]) {
      const line = lineById.get(lineId);
      if (!line) {
        map.delete(lineId);
        continue;
      }
      const route = routePosition(line, vehicle.startStop, nowMs - vehicle.startedAt);
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
        const position = riderPosition(route, rider.seat);
        rider.player.x = position.x;
        rider.player.z = position.z;
        // Riders stand on the tram deck (matches TRANSIT_DECK_Y client-side).
        rider.player.y = 0.34;
        rider.player.yaw = route.heading;
        rider.player.location = 'transit';
        rider.player.lastSeen = nowMs;
      }
      if (vehicle.riders.size === 0) {
        map.delete(lineId);
        continue;
      }
      touched.add(instanceId);
    }
    if (map.size === 0) vehiclesByInstance.delete(instanceId);
  }
  return touched;
}

/** Clear transit state for a player who disconnects or changes instance. */
export function releasePlayer(player) {
  if (!player.riding) return;
  const map = vehiclesByInstance.get(player.instanceId);
  if (map) {
    for (const [lineId, vehicle] of [...map]) {
      vehicle.riders.delete(player.userId);
      if (vehicle.riders.size === 0) map.delete(lineId);
    }
  }
  player.riding = null;
  player.transitLineId = null;
  player.transitSeat = null;
}

/** Test helper. */
export function resetTransit() {
  vehiclesByInstance.clear();
}
