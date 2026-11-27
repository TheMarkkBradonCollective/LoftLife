/**
 * Long-distance travel: intercity rail and airport flights.
 *
 * The gateway owns the departure, the arrival time and the destination check.
 * A client can only start a journey when it is physically standing at the
 * matching gateway (LoftLife Central Station, or inside the airport), and every
 * destination is re-checked here — including private worlds, using the same
 * access rules as entering the world normally. Ineligible destinations are
 * never returned and cannot be started.
 *
 * The journey itself is a scheduled server event: the client may draw the
 * cutscene, but the time, destination and final landing belong to the server.
 */
import { badRequest, conflict, notFound } from './errors.mjs';
import { travelWorlds } from './worlds.mjs';
import { TRANSIT_HUBS } from './transit.mjs';

const RAIL_DEPART_MS = 2_500;
const RAIL_TRAVEL_MS = 6_000;
const AIR_DEPART_MS = 3_000;
const AIR_TRAVEL_MS = 8_000;
const HUB_RADIUS = 18;

/** Public city destinations reachable by intercity rail or flight. */
export const CITY_TRAVEL_DESTINATIONS = [
  {
    id: 'city-plaza',
    label: 'LoftLife Plaza',
    kind: 'city',
    location: 'world',
    spawn: { x: 26.56, z: 24, yaw: Math.PI },
    blurb: 'The downtown civic plaza and LoftLife Tower.',
  },
  {
    id: 'city-hotel',
    label: 'Grand Hotel Lobby',
    kind: 'city',
    location: 'lobby',
    blurb: 'LoftLife\'s seven-floor flagship hotel.',
  },
  {
    id: 'city-airport',
    label: 'TheCity International Airport',
    kind: 'city',
    location: 'airport',
    blurb: 'Terminal 1, Concourse A and B.',
  },
  {
    id: 'city-threads',
    label: 'LoftLife Threads',
    kind: 'city',
    location: 'clothing_store',
    blurb: 'Clothing and accessories in the Main City.',
  },
];

const cityById = new Map(CITY_TRAVEL_DESTINATIONS.map((entry) => [entry.id, entry]));

function worldDestination(world) {
  return {
    id: `world:${world.id}`,
    label: world.name,
    kind: 'world',
    worldId: world.id,
    worldName: world.name,
    ownerHandle: world.ownerHandle,
    access: world.access,
    blurb: `${world.kind.replace(/_/g, ' ')} by @${world.ownerHandle}`,
  };
}

/** Every destination this account may actually enter, city first. */
export function travelDestinations(player) {
  const city = CITY_TRAVEL_DESTINATIONS.map((entry) => ({
    ...entry,
    spawn: entry.spawn ? { ...entry.spawn } : undefined,
  }));
  if (!player || player.isGuest) return { city, worlds: [] };
  let worlds = [];
  try {
    worlds = travelWorlds(player.userId).map(worldDestination);
  } catch {
    // A destination listing failure must not break the rest of the city.
    worlds = [];
  }
  return { city, worlds };
}

function destinationFor(player, destinationId) {
  const id = String(destinationId ?? '');
  const city = cityById.get(id);
  if (city) return { ...city, spawn: city.spawn ? { ...city.spawn } : undefined };
  if (id.startsWith('world:')) {
    if (player.isGuest) throw conflict('Guest sessions cannot visit player worlds');
    const worldId = id.slice('world:'.length);
    const world = travelWorlds(player.userId).find((entry) => entry.id === worldId);
    if (!world) throw notFound('That destination is not available');
    return worldDestination(world);
  }
  throw badRequest('Unknown travel destination');
}

function nearestHub(player) {
  let best = null;
  let bestDistance = Infinity;
  for (const hub of TRANSIT_HUBS) {
    if (hub.mode !== 'rail') continue;
    const distance = Math.hypot(player.x - hub.x, player.z - hub.z);
    if (distance < bestDistance) {
      best = hub;
      bestDistance = distance;
    }
  }
  return { hub: best, distance: bestDistance };
}

/**
 * Start a journey. Throws when the player is not at the right gateway or the
 * destination would be unavailable to them.
 */
export function startJourney(player, { mode, destinationId } = {}) {
  const kind = String(mode ?? '');
  if (kind !== 'rail' && kind !== 'air') throw badRequest('Unknown travel mode');
  if (player.riding) throw conflict('Step off transit before starting a journey');
  if (player.journey) throw conflict('You are already travelling');

  if (kind === 'rail') {
    if (player.location !== 'world') throw conflict('Walk to LoftLife Central Station first');
    const { hub, distance } = nearestHub(player);
    if (!hub || distance > HUB_RADIUS) {
      throw conflict('Walk to LoftLife Central Station to board the train');
    }
  } else if (player.location !== 'airport') {
    throw conflict('Check in at the airport before boarding a flight');
  }

  const destination = destinationFor(player, destinationId);
  const nowMs = Date.now();
  const departMs = kind === 'rail' ? RAIL_DEPART_MS : AIR_DEPART_MS;
  const travelMs = kind === 'rail' ? RAIL_TRAVEL_MS : AIR_TRAVEL_MS;
  const journey = {
    id: `j_${Math.random().toString(36).slice(2, 10)}`,
    mode: kind,
    phase: 'boarding',
    destination,
    startedAt: nowMs,
    departAt: nowMs + departMs,
    arriveAt: nowMs + departMs + travelMs,
    vehicleId: `${kind}_${nowMs}`,
    label: kind === 'rail' ? 'LoftLife Intercity' : 'LoftLife Air',
  };
  player.journey = journey;
  // Travelling players leave the street scene; their pose is server-owned until
  // they arrive, so a client cannot walk around the map mid-cutscene.
  player.location = 'transit';
  player.riding = null;
  player.transitLineId = null;
  player.transitSeat = null;
  return journey;
}

/** Advance one player's journey; returns a travel event when one is due. */
export function advanceJourney(player, nowMs = Date.now()) {
  const journey = player.journey;
  if (!journey) return null;
  if (journey.phase === 'boarding' && nowMs >= journey.departAt) {
    journey.phase = 'enroute';
    return { t: 'travel', action: 'departed', journey: { ...journey } };
  }
  if (journey.phase === 'enroute' && nowMs >= journey.arriveAt) {
    journey.phase = 'arrived';
    const destination = journey.destination;
    player.journey = null;
    player.location =
      destination.kind === 'city' ? destination.location : 'world';
    if (destination.kind === 'city' && destination.spawn) {
      player.x = destination.spawn.x;
      player.z = destination.spawn.z;
    } else if (destination.kind === 'world') {
      // The world socket will replace this position after the client switches.
      const hub = TRANSIT_HUBS[0];
      player.x = hub.x;
      player.z = hub.z;
    }
    player.y = 0;
    player.lastSeen = nowMs;
    return {
      t: 'travel',
      action: 'arrived',
      journey: { ...journey, phase: 'arrived', destination },
    };
  }
  return null;
}

/** Called when a socket closes or leaves: no journey survives a disconnect. */
export function releaseJourney(player) {
  player.journey = null;
}
