/**
 * Edge-side transit data. Must stay in step with server/transit.mjs: the cloud
 * gateway and the local API expose the same routes, taxi destinations, hub and
 * city travel destinations. Vehicle simulation remains server/edge-authoritative.
 */
const SLOPE = 0.42;

export interface TransitStop {
  id: string;
  name: string;
  x: number;
  z: number;
}

export interface TransitLine {
  id: string;
  label: string;
  kind: 'bus' | 'rail';
  color: string;
  speed: number;
  dwellMs: number;
  seats: number;
  stops: TransitStop[];
}

export interface TaxiDestination {
  id: string;
  label: string;
  x: number;
  z: number;
  arrival: { x: number; z: number };
}

export interface CityTravelDestination {
  id: string;
  label: string;
  kind: 'city';
  location: string;
  spawn?: { x: number; z: number; yaw?: number };
  blurb: string;
}

export interface WorldTravelDestination {
  id: string;
  label: string;
  kind: 'world';
  location: 'world';
  worldId: string;
  access?: string;
  blurb?: string;
}

export type TravelDestination = CityTravelDestination | WorldTravelDestination;

export const TRANSIT_LINES: TransitLine[] = [
  {
    id: 'loftline-15',
    label: '15th Street Bus',
    kind: 'bus',
    color: '#39ff14',
    speed: 9,
    dwellMs: 4500,
    seats: 6,
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
    label: 'M Street Bus',
    kind: 'bus',
    color: '#39ff14',
    speed: 9,
    dwellMs: 4500,
    seats: 6,
    stops: [
      { id: 'm-12', name: 'M St & 12th St', x: -39.23, z: -93.4 },
      { id: 'm-14', name: 'M St & 14th St', x: -19.14, z: -34 },
      { id: 'm-15', name: 'M St & 15th St', x: -4.86, z: 0 },
      { id: 'm-16', name: 'M St & 16th St', x: 9.42, z: 34 },
      { id: 'm-18', name: 'M St & 18th St', x: 33.15, z: 90.49 },
    ],
  },
  {
    id: 'loftline-loop',
    label: 'Downtown Loop Bus',
    kind: 'bus',
    color: '#22d3ee',
    speed: 9,
    dwellMs: 4500,
    seats: 6,
    stops: [
      { id: 'loop-plaza', name: 'Loft Plaza', x: 0 + SLOPE * 5.85, z: 5.85 },
      { id: 'loop-library', name: 'Library', x: 0 + SLOPE * 90.5, z: 90.5 },
      { id: 'loop-market', name: 'Market Hall', x: 36 + SLOPE * 64.8, z: 64.8 },
      { id: 'loop-cinema', name: 'Cinema', x: 72.98 + SLOPE * 34, z: 34 },
      { id: 'loop-med', name: 'The Med Deck', x: 109 + SLOPE * 34, z: 34 },
    ],
  },
  {
    id: 'rail-green',
    label: 'Green Line · Airport Express',
    kind: 'rail',
    color: '#22c55e',
    speed: 16,
    dwellMs: 5500,
    seats: 8,
    stops: [
      { id: 'rail-m', name: 'M St & 16th Station', x: 0 + SLOPE * 30.5, z: 30.5 },
      { id: 'rail-o', name: 'O St Station', x: 73 + SLOPE * 30.5, z: 30.5 },
      { id: 'rail-t', name: 'T St Station', x: 207.7 + SLOPE * 30.5, z: 30.5 },
      { id: 'rail-w', name: 'W St Station', x: 361.9 + SLOPE * 30.5, z: 30.5 },
      { id: 'rail-hotel', name: 'Grand Hotel Station', x: 402 + SLOPE * 400.5, z: 400.5 },
      { id: 'rail-airport', name: 'Airport Station', x: 430 + SLOPE * 421, z: 421 },
    ],
  },
  {
    id: 'rail-blue',
    label: 'Blue Line · Downtown Loop',
    kind: 'rail',
    color: '#3b82f6',
    speed: 16,
    dwellMs: 5500,
    seats: 8,
    stops: [
      { id: 'blue-12', name: '12th St Station', x: 0 + SLOPE * -93.4, z: -93.4 },
      { id: 'blue-15', name: '15th St Station', x: 0, z: 0 },
      { id: 'blue-16', name: '16th St Station', x: 0 + SLOPE * 34, z: 34 },
      { id: 'blue-cinema', name: 'Cinema Station', x: 73 + SLOPE * 64.8, z: 64.8 },
      { id: 'blue-o', name: 'O St Station', x: 73, z: 0 },
    ],
  },
];

export const TRANSIT_HUBS = [
  { id: 'central-station', label: 'LoftLife Central Station', mode: 'rail', x: 26.56, z: 10.5 },
];

export const TAXI_DESTINATIONS: TaxiDestination[] = [
  { id: 'plaza', label: 'LoftLife Plaza', x: 26.56, z: 18, arrival: { x: 26.56, z: 24 } },
  { id: 'hotel', label: 'Grand Hotel', x: 552.15, z: 406.49, arrival: { x: 552.15, z: 406.49 } },
  { id: 'airport', label: 'TheCity Airport', x: 598.81, z: 397.89, arrival: { x: 598.81, z: 397.89 } },
  { id: 'clothing-store', label: 'LoftLife Threads', x: 79.12, z: 58.64, arrival: { x: 79.12, z: 62.5 } },
  { id: 'library', label: 'Public Library', x: -2.33, z: 39.7, arrival: { x: -2.33, z: 41.2 } },
  { id: 'med-deck', label: 'The Med Deck', x: 107.65, z: 39.7, arrival: { x: 107.65, z: 41.2 } },
];

export const CITY_TRAVEL_DESTINATIONS: CityTravelDestination[] = [
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
    blurb: "LoftLife's seven-floor flagship hotel.",
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

export const TAXI_SPEED = 12;
export const TAXI_SEATS = 3;
export const TAXI_LOOP = [
  { x: 0, z: 0 },
  { x: SLOPE * 34, z: 34 },
  { x: 73 + SLOPE * 34, z: 34 },
  { x: 73, z: 0 },
];

const ROAD_U = [
  -410.9, -375.6, -344.5, -310.4, -276.9, -237.1, -203.6, -170.1, -140.6,
  -111.5, -74.1, -36.0, 0.0, 36.0, 73.0, 109.0, 137.0, 170.0, 207.7, 248.7,
  290.3, 324.8, 361.9, 400.9, 432.8, 460.9,
];
const ROAD_Z = [
  -444.7, -408.0, -381.1, -350.8, -314.3, -276.5, -250.7, -216.2, -193.2,
  -164.3, -130.4, -93.4, -65.9, -34.0, 0.0, 34.0, 64.8, 90.5, 123.4, 155.8,
  180.5, 209.5, 236.3, 262.1, 296.6, 324.5, 359.5, 395.7, 423.8, 458.0,
];

function segmentDistance(a: { x: number; z: number }, b: { x: number; z: number }) {
  return Math.hypot(b.x - a.x, b.z - a.z);
}

export function routeDuration(line: TransitLine): number {
  let total = line.stops.length * line.dwellMs;
  for (let i = 0; i < line.stops.length; i++) {
    const next = line.stops[(i + 1) % line.stops.length];
    total += (segmentDistance(line.stops[i], next) / line.speed) * 1000;
  }
  return total;
}

export function taxiLoopPoint(distance: number) {
  const segments = TAXI_LOOP.map((from, index) => {
    const to = TAXI_LOOP[(index + 1) % TAXI_LOOP.length];
    return { from, to, length: segmentDistance(from, to) };
  });
  const total = segments.reduce((sum, segment) => sum + segment.length, 0);
  let at = ((distance % total) + total) % total;
  for (const segment of segments) {
    if (at <= segment.length) {
      const t = segment.length === 0 ? 1 : at / segment.length;
      return {
        x: segment.from.x + (segment.to.x - segment.from.x) * t,
        z: segment.from.z + (segment.to.z - segment.from.z) * t,
        heading: Math.atan2(segment.to.x - segment.from.x, segment.to.z - segment.from.z),
        total,
      };
    }
    at -= segment.length;
  }
  return { ...TAXI_LOOP[0], heading: 0, total };
}

function nearest(value: number, list: number[]) {
  let best = list[0];
  let gap = Math.abs(value - list[0]);
  for (const entry of list) {
    if (Math.abs(value - entry) < gap) {
      best = entry;
      gap = Math.abs(value - entry);
    }
  }
  return best;
}

function roadPoint(u: number, z: number) {
  return { x: u + SLOPE * z, z };
}

export function taxiPath(
  from: { x: number; z: number },
  destination: TaxiDestination
): Array<{ x: number; z: number }> {
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
  const cleaned: Array<{ x: number; z: number }> = [];
  for (const point of points) {
    const previous = cleaned[cleaned.length - 1];
    if (previous && segmentDistance(point, previous) < 0.4) continue;
    cleaned.push(point);
  }
  return cleaned;
}

export function pathPointAt(path: Array<{ x: number; z: number }>, distance: number) {
  let left = distance;
  for (let i = 1; i < path.length; i++) {
    const from = path[i - 1];
    const to = path[i];
    const length = segmentDistance(from, to);
    if (left <= length) {
      const t = length === 0 ? 1 : left / length;
      return {
        x: from.x + (to.x - from.x) * t,
        z: from.z + (to.z - from.z) * t,
        heading: Math.atan2(to.x - from.x, to.z - from.z),
      };
    }
    left -= length;
  }
  const last = path[path.length - 1] ?? { x: 0, z: 0 };
  const previous = path[path.length - 2] ?? last;
  return {
    x: last.x,
    z: last.z,
    heading: Math.atan2(last.x - previous.x, last.z - previous.z),
  };
}

export function pathLength(path: Array<{ x: number; z: number }>) {
  return path.reduce(
    (total, point, index) =>
      index === 0 ? 0 : total + segmentDistance(path[index - 1], point),
    0
  );
}

export function handleTransitRoute(request: Request): Response | null {
  if (new URL(request.url).pathname !== '/api/transit' || request.method !== 'GET') return null;
  return new Response(
    JSON.stringify({
      lines: TRANSIT_LINES.map((line) => ({
        id: line.id,
        label: line.label,
        kind: line.kind,
        color: line.color,
        stops: line.stops,
      })),
      taxis: TAXI_DESTINATIONS,
      hubs: TRANSIT_HUBS,
    }),
    { headers: { 'content-type': 'application/json', 'cache-control': 'public,max-age=300' } }
  );
}

export function cityTravelDestinations() {
  return CITY_TRAVEL_DESTINATIONS.map((entry) => ({ ...entry, spawn: entry.spawn ? { ...entry.spawn } : undefined }));
}
