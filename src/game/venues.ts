import { CITY_LAYOUT, CITY_SLOPE, type CityBlock } from './cityLayout';

/**
 * The named public destinations of TheCity, grouped by district.
 *
 * Civic Core   — community centre, café, library around LoftLife Plaza
 * Arts         — cinema and event hall on the cultural corridor
 * Nightlife    — nightclub, bar and toke lounge in the Entertainment District
 * Retail/Food  — market hall and restaurant beside the clothing store
 * Medical      — The Med Deck campus
 */
export type VenueId =
  | 'library'
  | 'med_deck'
  | 'community_center'
  | 'cafe'
  | 'market'
  | 'cinema'
  | 'event_hall'
  | 'nightclub'
  | 'bar'
  | 'toke_lounge'
  | 'restaurant';

export type DoorSide = 'north' | 'south' | 'east' | 'west';

export type VenueInteractionKind = 'shop_furniture' | 'inspect';

export interface VenueInteractionPoint {
  id: string;
  venueId: VenueId;
  /** World position of the counter / rack the player presses E at. */
  x: number;
  z: number;
  radius: number;
  label: string;
  kind: VenueInteractionKind;
  hint?: string;
}

export interface VenueSeat {
  id: string;
  label: string;
  x: number;
  z: number;
  facingYaw: number;
}

export interface CityVenue {
  id: VenueId;
  name: string;
  tagline: string;
  district: string;
  sign: string;
  block: CityBlock;
  /** Building shell footprint in diagonal (u, z) space. */
  u0: number;
  u1: number;
  z0: number;
  z1: number;
  /** Interior floor footprint (inside the shell walls). */
  iu0: number;
  iu1: number;
  iz0: number;
  iz1: number;
  /** Interior clear height. */
  ceiling: number;
  /** Exterior parapet height. */
  height: number;
  doorSide: DoorSide;
  /** Centre of the storefront opening, in (u, z). */
  doorU: number;
  doorZ: number;
  /** Storefront opening width along the facade. */
  doorWidth: number;
  /** Spot on the sidewalk just outside the doors. */
  doorPos: { x: number; z: number };
  /** Street-side arrival point with room for the chase camera. */
  arrivalPos: { x: number; z: number };
  /** Spot just inside the doors. */
  insidePos: { x: number; z: number };
  palette: {
    body: string;
    trim: string;
    glass: string;
    accent: string;
    floor: string;
    awning: string;
  };
}

/** Block coordinates for each destination (col, row), matching VENUE_BLOCKS. */
const SPECS: Array<{
  id: VenueId;
  col: number;
  row: number;
  doorSide: DoorSide;
  height: number;
  name: string;
  tagline: string;
  district: string;
  sign: string;
  palette: CityVenue['palette'];
}> = [
  // ── Civic Core ────────────────────────────────────────────────────────────
  {
    id: 'community_center',
    col: 11,
    row: 13,
    doorSide: 'south',
    height: 10.8,
    name: 'LoftLife Community Center',
    tagline: 'Classes, workshops and the neighbourhood noticeboard.',
    district: 'Civic Core',
    sign: 'COMMUNITY CENTER',
    palette: {
      body: '#a4623f',
      trim: '#6d4a34',
      glass: '#8fa9b4',
      accent: '#39ff14',
      floor: '#cbb79c',
      awning: '#2f6b4a',
    },
  },
  {
    id: 'cafe',
    col: 12,
    row: 13,
    doorSide: 'south',
    height: 8.6,
    name: 'Bean & Loft Café',
    tagline: 'Pour-over coffee, pastries and a sunlit terrace on the plaza.',
    district: 'Civic Core',
    sign: 'BEAN & LOFT CAFÉ',
    palette: {
      body: '#c8b49a',
      trim: '#5a3f2c',
      glass: '#7e9aa6',
      accent: '#e6b35a',
      floor: '#b98f63',
      awning: '#7a2f2a',
    },
  },
  {
    id: 'library',
    col: 11,
    row: 15,
    doorSide: 'north',
    height: 14.6,
    name: 'LoftLife Public Library',
    tagline: 'Reading rooms, study tables and public computers.',
    district: 'Civic Core',
    sign: 'PUBLIC LIBRARY',
    palette: {
      body: '#cbbda4',
      trim: '#8c7a5e',
      glass: '#5d7f93',
      accent: '#d8b45e',
      floor: '#a88b62',
      awning: '#3d4a3a',
    },
  },
  // ── Arts & Culture ───────────────────────────────────────────────────────
  {
    id: 'cinema',
    col: 10,
    row: 9,
    doorSide: 'east',
    height: 13.8,
    name: 'LoftLife Cinema',
    tagline: 'Two screens, an arcade cabinet and a popcorn counter.',
    district: 'Arts & Culture',
    sign: 'LOFTLIFE CINEMA',
    palette: {
      body: '#3a2a2f',
      trim: '#181113',
      glass: '#6d5560',
      accent: '#ffcf5a',
      floor: '#4a2f36',
      awning: '#8c2b3a',
    },
  },
  {
    id: 'event_hall',
    col: 11,
    row: 9,
    doorSide: 'west',
    height: 15.2,
    name: 'The Loft Hall',
    tagline: 'Concerts, launches and community events under one roof.',
    district: 'Arts & Culture',
    sign: 'THE LOFT HALL',
    palette: {
      body: '#d8d2c4',
      trim: '#6a6252',
      glass: '#6f8fa3',
      accent: '#e3c15a',
      floor: '#b9a98c',
      awning: '#2f4858',
    },
  },
  // ── Entertainment & Nightlife ────────────────────────────────────────────
  {
    id: 'nightclub',
    col: 15,
    row: 11,
    doorSide: 'south',
    height: 13.4,
    name: 'Neon Loft Nightclub',
    tagline: 'Bass, lasers and a dance floor that never quite closes.',
    district: 'Entertainment District',
    sign: 'NEON LOFT',
    palette: {
      body: '#2a2233',
      trim: '#120d18',
      glass: '#7b5cff',
      accent: '#ff3bd4',
      floor: '#221a29',
      awning: '#3b1f4a',
    },
  },
  {
    id: 'bar',
    col: 16,
    row: 12,
    doorSide: 'west',
    height: 10.2,
    name: 'The Brass Tap',
    tagline: 'Neighbourhood bar with booths, taps and a corner stage.',
    district: 'Entertainment District',
    sign: 'THE BRASS TAP',
    palette: {
      body: '#3b2a22',
      trim: '#1a100c',
      glass: '#6f8a7a',
      accent: '#ffb347',
      floor: '#2e211b',
      awning: '#7a3b23',
    },
  },
  {
    id: 'toke_lounge',
    col: 14,
    row: 12,
    doorSide: 'east',
    height: 8.8,
    name: 'Cloud Nine Toke Lounge',
    tagline: 'Low light, deep sofas and a plant-filled patio.',
    district: 'Entertainment District',
    sign: 'CLOUD NINE',
    palette: {
      body: '#2f3a2c',
      trim: '#181f16',
      glass: '#8fae8a',
      accent: '#c8ff5a',
      floor: '#26301f',
      awning: '#43553a',
    },
  },
  // ── Retail & Food ───────────────────────────────────────────────────────
  {
    id: 'market',
    col: 14,
    row: 17,
    doorSide: 'north',
    height: 9.6,
    name: 'Market Hall',
    tagline: 'Groceries, housewares and furniture for your loft.',
    district: 'Retail & Food District',
    sign: 'MARKET HALL',
    palette: {
      body: '#b9c2ae',
      trim: '#4d5a48',
      glass: '#80998c',
      accent: '#e3d05a',
      floor: '#b7b0a1',
      awning: '#33553c',
    },
  },
  {
    id: 'restaurant',
    col: 16,
    row: 18,
    doorSide: 'west',
    height: 10.4,
    name: 'The Copper Fork',
    tagline: 'All-day dining, a long bar and pavement tables.',
    district: 'Retail & Food District',
    sign: 'THE COPPER FORK',
    palette: {
      body: '#c9b79c',
      trim: '#5c4632',
      glass: '#7d9aa0',
      accent: '#e8b04b',
      floor: '#a9855d',
      awning: '#8a3030',
    },
  },
  // ── Medical ─────────────────────────────────────────────────────────────
  {
    id: 'med_deck',
    col: 19,
    row: 17,
    doorSide: 'west',
    height: 18.4,
    name: 'The Med Deck',
    tagline: "TheCity's hospital — reception, triage and recovery beds.",
    district: 'Medical District',
    sign: 'THE MED DECK',
    palette: {
      body: '#e6ebee',
      trim: '#9aa8b0',
      glass: '#7fb4c4',
      accent: '#e04a4a',
      floor: '#dfe6e8',
      awning: '#2f6f86',
    },
  },
];

/** Diagonal u -> world x for a given z (the letter streets run diagonally). */
export function venueWorldX(u: number, z: number): number {
  return u + CITY_SLOPE * z;
}

function blockFor(col: number, row: number): CityBlock | undefined {
  return CITY_LAYOUT.blocks.find((b) => b.col === col && b.row === row);
}

function buildVenue(spec: (typeof SPECS)[number]): CityVenue {
  const block = blockFor(spec.col, spec.row);
  if (!block) throw new Error(`No city block for venue ${spec.id}`);
  if (block.kind !== 'venue') {
    throw new Error(`Venue ${spec.id} is placed on a "${block.kind}" block`);
  }
  // Keep the full sidewalk clear: the shell starts behind the paving and the
  // doors open onto the walkable frontage.
  const inset = block.sidewalk + 1.0;
  const u0 = block.uMin + inset;
  const u1 = block.uMax - inset;
  const z0 = block.zMin + inset;
  const z1 = block.zMax - inset;
  const wall = 0.55;
  const iu0 = u0 + wall;
  const iu1 = u1 - wall;
  const iz0 = z0 + wall;
  const iz1 = z1 - wall;

  const midU = (u0 + u1) / 2;
  const midZ = (z0 + z1) / 2;
  const doorWidth = Math.min(3.6, Math.max(2.8, (u1 - u0) * 0.16));
  let doorU = midU;
  let doorZ = midZ;
  if (spec.doorSide === 'north') doorZ = z0;
  if (spec.doorSide === 'south') doorZ = z1;
  if (spec.doorSide === 'west') doorU = u0;
  if (spec.doorSide === 'east') doorU = u1;

  const outward = 1.7;
  const inward = 1.5;
  let doorPos = { x: venueWorldX(doorU, doorZ), z: doorZ };
  let insidePos = { x: venueWorldX(doorU, doorZ), z: doorZ };
  if (spec.doorSide === 'north') {
    doorPos = { x: venueWorldX(doorU, doorZ - outward), z: doorZ - outward };
    insidePos = { x: venueWorldX(doorU, doorZ + inward), z: doorZ + inward };
  } else if (spec.doorSide === 'south') {
    doorPos = { x: venueWorldX(doorU, doorZ + outward), z: doorZ + outward };
    insidePos = { x: venueWorldX(doorU, doorZ - inward), z: doorZ - inward };
  } else if (spec.doorSide === 'west') {
    doorPos = { x: venueWorldX(doorU - outward, doorZ), z: doorZ };
    insidePos = { x: venueWorldX(doorU + inward, doorZ), z: doorZ };
  } else {
    doorPos = { x: venueWorldX(doorU + outward, doorZ), z: doorZ };
    insidePos = { x: venueWorldX(doorU - inward, doorZ), z: doorZ };
  }

  // Arrival point stays on the sidewalk in front of the doors (never in a
  // traffic lane) and keeps enough room for the chase camera.
  const outwardArrival = Math.min(7.4, block.sidewalk + 0.7);
  let arrivalPos = doorPos;
  if (spec.doorSide === 'north') {
    arrivalPos = { x: venueWorldX(doorU, doorZ - outwardArrival), z: doorZ - outwardArrival };
  } else if (spec.doorSide === 'south') {
    arrivalPos = { x: venueWorldX(doorU, doorZ + outwardArrival), z: doorZ + outwardArrival };
  } else if (spec.doorSide === 'west') {
    arrivalPos = { x: venueWorldX(doorU - outwardArrival, doorZ), z: doorZ };
  } else {
    arrivalPos = { x: venueWorldX(doorU + outwardArrival, doorZ), z: doorZ };
  }

  return {
    id: spec.id,
    name: spec.name,
    tagline: spec.tagline,
    district: spec.district,
    sign: spec.sign,
    block,
    u0,
    u1,
    z0,
    z1,
    iu0,
    iu1,
    iz0,
    iz1,
    ceiling:
      spec.id === 'event_hall'
        ? 7.2
        : spec.id === 'library'
        ? 5.4
        : spec.id === 'med_deck'
        ? 4.8
        : spec.id === 'nightclub'
        ? 6.2
        : 4.4,
    height: spec.height,
    doorSide: spec.doorSide,
    doorU,
    doorZ,
    doorWidth,
    doorPos,
    arrivalPos,
    insidePos,
    palette: spec.palette,
  };
}

export const CITY_VENUES: CityVenue[] = SPECS.map(buildVenue);

export const VENUES_BY_ID = new Map<VenueId, CityVenue>(CITY_VENUES.map((v) => [v.id, v]));

export function venueAt(x: number, z: number, margin = 0): CityVenue | undefined {
  const u = x - CITY_SLOPE * z;
  return CITY_VENUES.find(
    (v) => u > v.u0 - margin && u < v.u1 + margin && z > v.z0 - margin && z < v.z1 + margin
  );
}
