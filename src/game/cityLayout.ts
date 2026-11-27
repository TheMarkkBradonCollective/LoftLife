export const DIAGONAL_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''); // 26: A St .. Z St
export const HORIZONTAL_COUNT = 30; // 1st St .. 30th St
export const CITY_SLOPE = 0.42; // Diagonal slant dx/dz for A-Z streets
export const M_STREET_INDEX = 12;
export const FIFTEENTH_STREET_INDEX = 14;

/**
 * TheCity master plan.
 *
 * The city keeps its diagonal lettered avenues (A–Z) crossed by numbered
 * streets (1st–30th) so every existing coordinate system, traffic path and
 * player save keeps working. What changed is the *plan*: blocks are now
 * assigned to districts, streets carry a real hierarchy, and every landmark
 * sits inside the district that gives it context.
 *
 *   north      Arts & Culture · Residential North · Luxury East
 *   centre     Civic Core · Downtown CBD · Entertainment · Retail & Food · Medical
 *   south      Residential South · Industrial Service · Airport/Transport
 *   east edge  Riverfront Esplanade
 */

export type DistrictId =
  | 'downtown'
  | 'civic'
  | 'arts'
  | 'entertainment'
  | 'retail'
  | 'medical'
  | 'residential_north'
  | 'residential_west'
  | 'residential_south'
  | 'luxury'
  | 'industrial'
  | 'transport'
  | 'parks';

export type StreetClass = 'boulevard' | 'avenue' | 'street' | 'residential';

export interface StreetSpec {
  /** Curb-to-curb width in metres. */
  width: number;
  /** Half of the curb-to-curb width, in metres. */
  halfWidth: number;
  lanes: number;
  /** Raised landscaped centre median (M Street boulevard only). */
  median: number;
  parking: boolean;
  bikeLane: boolean;
  class: StreetClass;
}

export interface CityDistrict {
  id: DistrictId;
  name: string;
  shortName: string;
  tagline: string;
  /** Fill used by the in-game city map. */
  color: string;
  /** Accent stroke used by the in-game city map. */
  stroke: string;
  /** Inclusive block-coordinate rectangle (cols 0..24, rows 0..28). */
  bounds: { col0: number; col1: number; row0: number; row1: number };
  /** Sidewalk depth in metres. */
  sidewalk: number;
  /** Building setback behind the sidewalk, in metres. */
  setback: number;
  height: { min: number; max: number };
  facadeStyles: number[];
  /** Street trees per block edge. */
  treeDensity: number;
  /** Street furniture / lighting intensity multiplier. */
  furniture: number;
  description: string;
}

export interface CityBlock {
  col: number; // 0..24 (between letter col and col+1)
  row: number; // 0..28 (between row+1 and row+2)
  uMin: number;
  uMax: number;
  zMin: number;
  zMax: number;
  kind:
    | 'loft_plaza'
    | 'loft_hotel'
    | 'airport'
    | 'clothing_store'
    | 'park'
    | 'venue'
    | 'plaza'
    | 'promenade'
    | 'parking'
    | 'building';
  /** Public destination that owns this block (see src/game/venues.ts). */
  venueId?: string;
  district: DistrictId;
  /** Sidewalk depth on this block, in metres. */
  sidewalk: number;
  /** Building setback behind the sidewalk, in metres. */
  setback: number;
  /** Walkable surface height for this block. */
  walkHeight: number;
  height: number;
  /** Secondary upper setback height (0 if single volume) */
  setbackHeight: number;
  /** Architectural facade style index (0..5) */
  facadeStyle: number;
  paletteIndex: number;
  hasTowerCrown: boolean;
  /** Sub-buildings inside large blocks (1 or 2 buildings for realistic skyline) */
  subSplit: 'none' | 'split_u' | 'split_z';
  /** Tall buildings get lit window bands at night. */
  illuminated: boolean;
}

export interface TrafficSignalIntersection {
  col: number;
  row: number;
  u: number;
  z: number;
  x: number;
  uHalfWidth: number;
  zHalfWidth: number;
}

export interface BusStopSpot {
  x: number;
  z: number;
  rotY: number;
  streetLabel: string;
}

export interface Waterfront {
  /** East edge of the city where the river begins (u coordinate). */
  uEdge: number;
  /** Extent of the visible river along z. */
  z0: number;
  z1: number;
  level: number;
}

export interface CityLayout {
  uLines: number[]; // length 26 (A..Z)
  zLines: number[]; // length 30 (1st..30th)
  uHalfWidths: number[];
  zHalfWidths: number[];
  uIsMajor: boolean[];
  zIsMajor: boolean[];
  uClasses: StreetClass[];
  zClasses: StreetClass[];
  uStreetNames: string[];
  zStreetNames: string[];
  districts: CityDistrict[];
  blocks: CityBlock[];
  signalIntersections: TrafficSignalIntersection[];
  busStops: BusStopSpot[];
  metroLineZ: number; // Elevated metro viaduct Z coordinate (16th St corridor)
  waterfront: Waterfront;
  loftCenter: { x: number; z: number };
  loftDoorPos: { x: number; z: number };
  hotelCenter: { x: number; z: number };
  airportCenter: { x: number; z: number };
  airportDoorPos: { x: number; z: number };
  airportEntrancePos: { x: number; z: number };
  airportArrivalPos: { x: number; z: number };
  airportDeparturePos: { x: number; z: number };
  clothingStoreCenter: { x: number; z: number };
  clothingStoreDoorPos: { x: number; z: number };
  clothingStoreArrivalPos: { x: number; z: number };
  salonPos: { x: number; z: number };
  bounds: { zMin: number; zMax: number; uMin: number; uMax: number };
}

function seededRand(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

export function ordinalStreet(num: number): string {
  const mod100 = num % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${num}th St`;
  switch (num % 10) {
    case 1:
      return `${num}st St`;
    case 2:
      return `${num}nd St`;
    case 3:
      return `${num}rd St`;
    default:
      return `${num}th St`;
  }
}

/** Street hierarchy: lanes and widths follow the role of each street. */
const STREET_SPECS: Record<StreetClass, StreetSpec> = {
  // 8 lanes total (4 each way) + planted median + bike lanes.
  boulevard: {
    width: 28.8,
    halfWidth: 14.4,
    lanes: 8,
    median: 3.2,
    parking: false,
    bikeLane: true,
    class: 'boulevard',
  },
  // 4 lanes, turning lane pockets at signals.
  avenue: {
    width: 14.0,
    halfWidth: 7.0,
    lanes: 4,
    median: 0,
    parking: false,
    bikeLane: false,
    class: 'avenue',
  },
  // 2 travel lanes + parallel parking both sides.
  street: {
    width: 11.2,
    halfWidth: 5.6,
    lanes: 2,
    median: 0,
    parking: true,
    bikeLane: false,
    class: 'street',
  },
  // Narrow neighbourhood street: 2 lanes, parking, low speed.
  residential: {
    width: 9.2,
    halfWidth: 4.6,
    lanes: 2,
    median: 0,
    parking: true,
    bikeLane: false,
    class: 'residential',
  },
};

/** The five street classes in order of importance. */
export const STREET_HIERARCHY = STREET_SPECS;

const DISTRICT_DEFS: Omit<CityDistrict, 'bounds'>[] = [
  {
    id: 'downtown',
    name: 'Downtown Core',
    shortName: 'Downtown',
    tagline: 'Towers, offices and the main transit spine.',
    color: '#1d2d3a',
    stroke: 'rgba(125,211,252,0.30)',
    sidewalk: 3.8,
    setback: 0.8,
    height: { min: 34, max: 92 },
    facadeStyles: [0, 5, 2, 0],
    treeDensity: 0.55,
    furniture: 1.15,
    description:
      'High-rise commercial core wrapped around the civic blocks, with glass towers, plazas and the M Street boulevard.',
  },
  {
    id: 'civic',
    name: 'Civic Core',
    shortName: 'Civic',
    tagline: 'The plaza, library, community centre and city hall.',
    color: '#24352a',
    stroke: 'rgba(74,222,128,0.30)',
    sidewalk: 4.2,
    setback: 1.6,
    height: { min: 12, max: 26 },
    facadeStyles: [1, 3, 1, 4],
    treeDensity: 1.2,
    furniture: 1.6,
    description:
      'Civic institutions set around LoftLife Plaza with broad walkable sidewalks, lawns, benches and public art.',
  },
  {
    id: 'arts',
    name: 'Arts & Culture',
    shortName: 'Arts',
    tagline: 'Cinema, galleries, theatres and sculpture gardens.',
    color: '#2b2438',
    stroke: 'rgba(196,181,253,0.30)',
    sidewalk: 3.8,
    setback: 1.2,
    height: { min: 12, max: 28 },
    facadeStyles: [1, 4, 2],
    treeDensity: 0.95,
    furniture: 1.5,
    description:
      'A low-rise cultural quarter north of downtown: cinemas, an event hall, studios and a sculpture plaza.',
  },
  {
    id: 'entertainment',
    name: 'Entertainment District',
    shortName: 'Entertainment',
    tagline: 'Nightclubs, bars, live stages and late-night food.',
    color: '#3a1f33',
    stroke: 'rgba(244,114,182,0.35)',
    sidewalk: 4.0,
    setback: 1.0,
    height: { min: 14, max: 34 },
    facadeStyles: [2, 4, 0],
    treeDensity: 0.6,
    furniture: 1.35,
    description:
      'The neon quarter east of downtown: nightclub, bar and toke lounge frontages, wide pavements and bright signage.',
  },
  {
    id: 'retail',
    name: 'Retail & Food District',
    shortName: 'Retail',
    tagline: 'Shopping, market halls, restaurants and cafés.',
    color: '#3a2d1d',
    stroke: 'rgba(251,191,36,0.30)',
    sidewalk: 4.0,
    setback: 1.0,
    height: { min: 10, max: 22 },
    facadeStyles: [4, 1, 3],
    treeDensity: 1.0,
    furniture: 1.5,
    description:
      'A pedestrian-friendly shopping and dining district south of the plaza, including the standalone clothing store and market hall.',
  },
  {
    id: 'medical',
    name: 'Medical District',
    shortName: 'Medical',
    tagline: 'The Med Deck campus and recovery gardens.',
    color: '#1c3338',
    stroke: 'rgba(125,211,252,0.28)',
    sidewalk: 3.8,
    setback: 1.4,
    height: { min: 18, max: 42 },
    facadeStyles: [1, 3, 5],
    treeDensity: 1.05,
    furniture: 1.1,
    description:
      'A calm medical campus east of the retail district, with the hospital tower, clinics, parking and landscaped recovery gardens.',
  },
  {
    id: 'residential_north',
    name: 'North Residential',
    shortName: 'North Homes',
    tagline: 'Rowhouses, walk-ups and neighbourhood parks.',
    color: '#2c2b24',
    stroke: 'rgba(214,211,209,0.20)',
    sidewalk: 2.8,
    setback: 1.6,
    height: { min: 9, max: 22 },
    facadeStyles: [4, 2, 3],
    treeDensity: 1.25,
    furniture: 0.95,
    description:
      'Tree-lined residential blocks north of downtown with rowhouses, corner shops, schools and pocket parks.',
  },
  {
    id: 'residential_west',
    name: 'West Residential',
    shortName: 'West Homes',
    tagline: 'Low-rise neighbourhoods west of the core.',
    color: '#2b2922',
    stroke: 'rgba(214,211,209,0.18)',
    sidewalk: 2.8,
    setback: 1.6,
    height: { min: 8, max: 18 },
    facadeStyles: [4, 2, 2],
    treeDensity: 1.15,
    furniture: 0.9,
    description:
      'The quiet western neighbourhoods: townhouses, garden apartments, corner stores and small parks.',
  },
  {
    id: 'residential_south',
    name: 'South Residential',
    shortName: 'South Homes',
    tagline: 'Family blocks, schools and community gardens.',
    color: '#2d2a22',
    stroke: 'rgba(214,211,209,0.18)',
    sidewalk: 2.8,
    setback: 1.6,
    height: { min: 9, max: 20 },
    facadeStyles: [4, 2, 3],
    treeDensity: 1.2,
    furniture: 0.9,
    description:
      'Residential streets south of the retail district, buffered from industry by parks and schools.',
  },
  {
    id: 'luxury',
    name: 'Luxury Waterfront',
    shortName: 'Luxury',
    tagline: 'High-end towers, marina and the river promenade.',
    color: '#1d3030',
    stroke: 'rgba(94,234,212,0.30)',
    sidewalk: 4.0,
    setback: 2.0,
    height: { min: 38, max: 84 },
    facadeStyles: [5, 0, 5],
    treeDensity: 1.1,
    furniture: 1.35,
    description:
      'Glass residential towers along the eastern waterfront, with a river esplanade, marina walk and planted setbacks.',
  },
  {
    id: 'industrial',
    name: 'Industrial & Service',
    shortName: 'Industrial',
    tagline: 'Warehouses, depots and service yards.',
    color: '#2a2723',
    stroke: 'rgba(180,170,150,0.18)',
    sidewalk: 3.0,
    setback: 1.0,
    height: { min: 7, max: 15 },
    facadeStyles: [3, 3, 4],
    treeDensity: 0.2,
    furniture: 0.45,
    description:
      'Wide low blocks and loading yards in the southwest, kept clear of homes and reached by service roads.',
  },
  {
    id: 'transport',
    name: 'Airport & Transport',
    shortName: 'Airport',
    tagline: 'Terminal, runways, hotels and parking.',
    color: '#1b3140',
    stroke: 'rgba(56,189,248,0.35)',
    sidewalk: 3.2,
    setback: 1.2,
    height: { min: 10, max: 24 },
    facadeStyles: [5, 3, 0],
    treeDensity: 0.35,
    furniture: 0.8,
    description:
      'TheCity International Airport district in the southeast: terminal, apron, long-stay parking, airport hotel and the Grand Hotel forecourt.',
  },
  {
    id: 'parks',
    name: 'Parks & Recreation',
    shortName: 'Parks',
    tagline: 'Lawns, lakes, courts and gathering places.',
    color: '#17351f',
    stroke: 'rgba(74,222,128,0.30)',
    sidewalk: 2.4,
    setback: 0,
    height: { min: 0, max: 0 },
    facadeStyles: [1],
    treeDensity: 1.8,
    furniture: 1.8,
    description:
      'Public green space: Central Park, the west commons, neighbourhood parks and the riverfront lawns.',
  },
];

const DISTRICT_RECTS: Array<{ id: DistrictId; col0: number; col1: number; row0: number; row1: number }> = [
  { id: 'civic', col0: 10, col1: 13, row0: 12, row1: 16 },
  { id: 'arts', col0: 9, col1: 13, row0: 6, row1: 11 },
  { id: 'entertainment', col0: 14, col1: 18, row0: 10, row1: 15 },
  { id: 'medical', col0: 19, col1: 21, row0: 15, row1: 20 },
  { id: 'retail', col0: 13, col1: 18, row0: 16, row1: 20 },
  { id: 'downtown', col0: 8, col1: 20, row0: 8, row1: 22 },
  { id: 'transport', col0: 21, col1: 25, row0: 23, row1: 29 },
  { id: 'industrial', col0: 0, col1: 6, row0: 19, row1: 29 },
  { id: 'luxury', col0: 21, col1: 25, row0: 0, row1: 22 },
  { id: 'residential_north', col0: 7, col1: 20, row0: 0, row1: 7 },
  { id: 'residential_west', col0: 0, col1: 7, row0: 0, row1: 18 },
  { id: 'residential_south', col0: 7, col1: 20, row0: 21, row1: 29 },
];

export const CITY_DISTRICTS: CityDistrict[] = DISTRICT_DEFS.map((def) => ({
  ...def,
  bounds: DISTRICT_RECTS.find((rect) => rect.id === def.id) ?? {
    col0: 0,
    col1: 24,
    row0: 0,
    row1: 28,
  },
}));

const DISTRICT_BY_ID = new Map(CITY_DISTRICTS.map((d) => [d.id, d]));

export function districtForBlock(col: number, row: number): DistrictId {
  for (const rect of DISTRICT_RECTS) {
    if (col >= rect.col0 && col <= rect.col1 && row >= rect.row0 && row <= rect.row1) {
      return rect.id;
    }
  }
  return 'residential_south';
}

/** Public destination blocks — kept in one map so venues and layout cannot drift. */
export const VENUE_BLOCKS: Record<string, string> = {
  '11,13': 'community_center',
  '12,13': 'cafe',
  '11,15': 'library',
  '10,9': 'cinema',
  '11,9': 'event_hall',
  '14,17': 'market',
  '16,18': 'restaurant',
  '15,11': 'nightclub',
  '16,12': 'bar',
  '14,12': 'toke_lounge',
  '19,17': 'med_deck',
};

const PARK_BLOCKS = new Set([
  '11,14', // Central Park next to the plaza
  '5,9',
  '6,9',
  '5,10',
  '6,10', // West Commons superpark
  '3,15', // neighbourhood park
  '9,24', // South Gardens
  '18,6', // North park
  '20,4', // North-east park
  '1,12', // West pocket park
]);

const PLAZA_BLOCKS: Record<string, string> = {
  '13,13': 'Civic Steps',
  '12,10': 'Arts Plaza',
  '22,26': 'Grand Hotel Forecourt',
  '19,22': 'Med Deck Green',
  '6,17': 'West Market Square',
};

const PROMENADE_BLOCKS: Record<string, string> = {
  '13,16': 'Market Promenade',
  '24,10': 'Riverfront Esplanade',
  '24,11': 'Riverfront Esplanade',
  '24,12': 'Riverfront Esplanade',
  '24,13': 'Riverfront Esplanade',
};

const PARKING_BLOCKS = new Set([
  '13,19', // retail garage
  '20,26', // airport long-stay
  '17,22', // downtown south garage
  '2,20', // industrial yard
  '21,17', // medical parking
  '23,26', // terminal parking
]);

const LETTER_AVENUES = new Set([0, 4, 8, 16, 20, 25]); // A, E, I, Q, U, Z
const NUMBER_AVENUES = new Set([0, 4, 9, 14, 19, 24, 29]); // 1st, 5th, 10th, 15th, 20th, 25th, 30th

function letterStreetClass(i: number): StreetClass {
  if (i === M_STREET_INDEX) return 'boulevard';
  if (LETTER_AVENUES.has(i)) return 'avenue';
  return 'street';
}

function numberedStreetClass(j: number): StreetClass {
  if (NUMBER_AVENUES.has(j)) return 'avenue';
  // Every fourth non-avenue street is a quieter residential street.
  return j % 4 === 2 ? 'residential' : 'street';
}

function sidewalkFor(district: DistrictId, col: number, row: number): number {
  const base = DISTRICT_BY_ID.get(district)?.sidewalk ?? 3.2;
  let width = base;
  // Wider pavements fronting the boulevard and the 15th Street civic axis.
  if (col === M_STREET_INDEX - 1 || col === M_STREET_INDEX) width += 1.2;
  if (row === FIFTEENTH_STREET_INDEX - 1 || row === FIFTEENTH_STREET_INDEX) width += 0.6;
  return Math.min(6.4, width);
}

export function buildCityLayout(): CityLayout {
  // 1. Street centre lines. Widths now follow the street hierarchy.
  const uHalfWidths: number[] = [];
  const uIsMajor: boolean[] = [];
  const uClasses: StreetClass[] = [];
  const rawU: number[] = [0];

  for (let i = 0; i < DIAGONAL_LETTERS.length; i++) {
    const cls = letterStreetClass(i);
    const spec = STREET_SPECS[cls];
    uClasses.push(cls);
    uHalfWidths.push(spec.halfWidth);
    uIsMajor.push(cls === 'avenue' || cls === 'boulevard');
    if (i < DIAGONAL_LETTERS.length - 1) {
      let span = 32.0 + seededRand(i * 19 + 3) * 13.0; // 32..45 m blocks
      // The boulevard is 28.8 m wide, so the blocks on either side need extra
      // frontage to keep a real buildable footprint behind the sidewalks.
      if (i === M_STREET_INDEX - 1) span += 22.0;
      if (i === M_STREET_INDEX) span += 14.0;
      if (i === 24) span += 4.0;
      rawU.push(rawU[rawU.length - 1] + span);
    }
  }
  const uCenterOffset = rawU[M_STREET_INDEX];
  const uLines = rawU.map((u) => u - uCenterOffset);

  const zHalfWidths: number[] = [];
  const zIsMajor: boolean[] = [];
  const zClasses: StreetClass[] = [];
  const rawZ: number[] = [0];

  for (let j = 0; j < HORIZONTAL_COUNT; j++) {
    const cls = numberedStreetClass(j);
    const spec = STREET_SPECS[cls];
    zClasses.push(cls);
    zHalfWidths.push(spec.halfWidth);
    zIsMajor.push(cls === 'avenue');
    if (j < HORIZONTAL_COUNT - 1) {
      let span = 29.0 + seededRand(j * 31 + 7) * 11.0; // 29..40 m blocks
      if (j === FIFTEENTH_STREET_INDEX - 1 || j === FIFTEENTH_STREET_INDEX) span += 2.0;
      // Destination blocks carry deep interiors, so their rows get more depth.
      if ([9, 11, 12, 13, 15, 17, 18].includes(j)) span += 9.0;
      if (j === 26 || j === 27) span += 5.0; // hotel and airport forecourts
      rawZ.push(rawZ[rawZ.length - 1] + span);
    }
  }
  const zCenterOffset = rawZ[FIFTEENTH_STREET_INDEX];
  const zLines = rawZ.map((z) => z - zCenterOffset);

  const blocks: CityBlock[] = [];
  for (let col = 0; col < DIAGONAL_LETTERS.length - 1; col++) {
    for (let row = 0; row < HORIZONTAL_COUNT - 1; row++) {
      const uMin = uLines[col] + uHalfWidths[col];
      const uMax = uLines[col + 1] - uHalfWidths[col + 1];
      const zMin = zLines[row] + zHalfWidths[row];
      const zMax = zLines[row + 1] - zHalfWidths[row + 1];
      const key = `${col},${row}`;

      let kind: CityBlock['kind'] = 'building';
      let venueId: string | undefined;
      let district = districtForBlock(col, row);

      if (col === 12 && row === 14) {
        kind = 'loft_plaza';
        district = 'civic';
      } else if (col === 22 && row === 27) {
        kind = 'loft_hotel';
        district = 'transport';
      } else if (
        (col === 24 && row === 27) ||
        (col === 23 && row === 28) ||
        (col === 24 && row === 28)
      ) {
        // Terminal + apron occupy the south-east corner of the grid.
        kind = 'airport';
        district = 'transport';
      } else if (col === 13 && row === 18) {
        kind = 'clothing_store';
        district = 'retail';
      } else if (VENUE_BLOCKS[key]) {
        kind = 'venue';
        venueId = VENUE_BLOCKS[key];
      } else if (PARK_BLOCKS.has(key)) {
        kind = 'park';
        district = 'parks';
      } else if (PROMENADE_BLOCKS[key]) {
        kind = 'promenade';
        district = key.startsWith('24,') ? 'luxury' : 'retail';
      } else if (PLAZA_BLOCKS[key]) {
        kind = 'plaza';
      } else if (PARKING_BLOCKS.has(key)) {
        kind = 'parking';
      }

      const def = DISTRICT_BY_ID.get(district)!;
      const sidewalk = sidewalkFor(district, col, row);
      const setback = def.setback;

      const distFromCenter = Math.hypot(col - M_STREET_INDEX, row - FIFTEENTH_STREET_INDEX);
      const r1 = seededRand(col * 41 + row * 73);
      const r2 = seededRand(col * 61 + row * 37);

      let height = 0;
      if (kind === 'building' || kind === 'venue') {
        const band = def.height;
        const centrality = Math.max(0, 1 - distFromCenter / 18);
        height = band.min + r1 * (band.max - band.min);
        // Landmark height punctuation in the commercial core.
        if (district === 'downtown' && r2 > 0.94) height = Math.max(height, 100 + r1 * 18);
        if (district === 'luxury' && r2 > 0.9) height = Math.max(height, 72 + r1 * 16);
        if (district === 'civic' && r2 > 0.93) height = Math.max(height, 24 + r1 * 6);
        if (district === 'downtown') height += centrality * 10;
      }

      const setbackHeight =
        height > 42 && seededRand(col * 23 + row * 83) > 0.32
          ? 5.0 + seededRand(col * 11 + row * 47) * 12.0
          : 0;

      const uSpan = uMax - uMin;
      const zSpan = zMax - zMin;
      let subSplit: CityBlock['subSplit'] = 'none';
      if (kind === 'building') {
        if (district === 'downtown' || district === 'retail' || district === 'entertainment') {
          if (uSpan > 30 && seededRand(col * 7 + row * 13) > 0.42) subSplit = 'split_u';
          else if (zSpan > 28 && seededRand(col * 17 + row * 29) > 0.5) subSplit = 'split_z';
        } else if (district.startsWith('residential') && uSpan > 30 && seededRand(col * 5 + row * 11) > 0.62) {
          subSplit = 'split_u';
        } else if (uSpan > 34 && seededRand(col * 7 + row * 13) > 0.58) {
          subSplit = 'split_u';
        }
      }

      const facadeStyles = def.facadeStyles;
      const walkHeight =
        kind === 'loft_plaza' || kind === 'plaza' || kind === 'promenade'
          ? 0.17
          : kind === 'park'
          ? 0.13
          : kind === 'parking'
          ? 0.05
          : 0.14;

      blocks.push({
        col,
        row,
        uMin,
        uMax,
        zMin,
        zMax,
        kind,
        venueId,
        district,
        sidewalk,
        setback,
        walkHeight,
        height,
        setbackHeight,
        facadeStyle: facadeStyles[Math.floor(seededRand(col * 29 + row * 43) * facadeStyles.length)],
        paletteIndex: Math.floor(seededRand(col * 17 + row * 29) * 5),
        hasTowerCrown: height > 48 && seededRand(col * 13 + row * 19) > 0.35,
        subSplit,
        illuminated: height > 22,
      });
    }
  }

  // 2. Landmark anchors.
  const plazaBlock = blocks.find((b) => b.kind === 'loft_plaza')!;
  const plazaMidZ = (plazaBlock.zMin + plazaBlock.zMax) / 2;
  const plazaMidU = (plazaBlock.uMin + plazaBlock.uMax) / 2;
  const loftCenterX = uzToWorldX(plazaMidU, plazaMidZ);
  const loftCenterZ = plazaMidZ;

  const hotelBlock = blocks.find((b) => b.kind === 'loft_hotel')!;
  const hotelMidU = (hotelBlock.uMin + hotelBlock.uMax) / 2;
  const hotelMidZ = (hotelBlock.zMin + hotelBlock.zMax) / 2;
  const hotelCenterX = uzToWorldX(hotelMidU, hotelMidZ);
  // The Grand Hotel entrance faces its forecourt on the north side of the block.
  const loftDoorZ = hotelBlock.zMin + Math.min(7.6, (hotelBlock.zMax - hotelBlock.zMin) * 0.3);
  const loftDoorX = uzToWorldX(hotelMidU, loftDoorZ);

  const airportBlocks = blocks.filter((b) => b.kind === 'airport');
  const airportU0 = Math.min(...airportBlocks.map((b) => b.uMin));
  const airportU1 = Math.max(...airportBlocks.map((b) => b.uMax));
  const airportZ0 = Math.min(...airportBlocks.map((b) => b.zMin));
  const airportZ1 = Math.max(...airportBlocks.map((b) => b.zMax));
  const airportMidU = (airportU0 + airportU1) / 2;
  const airportMidZ = (airportZ0 + airportZ1) / 2;
  const airportCenterX = uzToWorldX(airportMidU, airportMidZ);
  // Terminal doors face north toward the airport drop-off and parking decks.
  const airportDoorZ = airportZ0 + 2.4;
  const airportDoorX = uzToWorldX(airportMidU, airportDoorZ);
  const airportDoorPos = { x: airportDoorX, z: airportDoorZ };
  const airportEntrancePos = { x: airportDoorX, z: airportDoorZ - 5.0 };
  const airportArrivalPos = { x: airportDoorX - 2.5, z: airportDoorZ - 9.5 };
  const airportDeparturePos = { ...airportEntrancePos };

  const storeBlock = blocks.find((b) => b.kind === 'clothing_store')!;
  const storeMidU = (storeBlock.uMin + storeBlock.uMax) / 2;
  const storeDoorZ = storeBlock.zMax - storeBlock.sidewalk - 1.8;
  const storeDoorX = uzToWorldX(storeMidU, storeDoorZ);
  const clothingStoreCenter = {
    x: uzToWorldX(storeMidU, (storeBlock.zMin + storeBlock.zMax) / 2),
    z: (storeBlock.zMin + storeBlock.zMax) / 2,
  };
  const clothingStoreDoorPos = { x: storeDoorX, z: storeDoorZ };
  const clothingStoreArrivalPos = {
    x: storeDoorX,
    z: storeDoorZ + storeBlock.sidewalk - 1.2,
  };

  const salonPos = { x: loftCenterX - 7.2, z: loftCenterZ + 5.2 };

  // 3. Signals: every avenue intersection plus the walkable cores.
  const signalIntersections: TrafficSignalIntersection[] = [];
  for (let col = 0; col < DIAGONAL_LETTERS.length; col++) {
    for (let row = 0; row < HORIZONTAL_COUNT; row++) {
      const inDowntown = col >= 8 && col <= 20 && row >= 8 && row <= 22;
      const civicAxis = (col === M_STREET_INDEX && row >= 11 && row <= 17) ||
        (row === FIFTEENTH_STREET_INDEX && col >= 9 && col <= 15);
      if ((uIsMajor[col] && zIsMajor[row]) || inDowntown || civicAxis) {
        const u = uLines[col];
        const z = zLines[row];
        signalIntersections.push({
          col,
          row,
          u,
          z,
          x: uzToWorldX(u, z),
          uHalfWidth: uHalfWidths[col],
          zHalfWidth: zHalfWidths[row],
        });
      }
    }
  }

  // 4. Bus shelters across the districts.
  const busStops: BusStopSpot[] = [
    {
      x: uzToWorldX(uLines[M_STREET_INDEX] + uHalfWidths[M_STREET_INDEX] + 2.1, zLines[14] + 7.0),
      z: zLines[14] + 7.0,
      rotY: -Math.PI / 2,
      streetLabel: 'M St & 15th St',
    },
    {
      x: uzToWorldX(uLines[M_STREET_INDEX] - uHalfWidths[M_STREET_INDEX] - 2.1, zLines[14] - 8.0),
      z: zLines[14] - 8.0,
      rotY: Math.PI / 2,
      streetLabel: 'M St & 15th St',
    },
    {
      x: uzToWorldX(uLines[13] - uHalfWidths[13] - 2.0, zLines[FIFTEENTH_STREET_INDEX] + 8.5),
      z: zLines[FIFTEENTH_STREET_INDEX] + 8.5,
      rotY: 0,
      streetLabel: '15th St & N St',
    },
    {
      x: uzToWorldX(uLines[10] + uHalfWidths[10] + 2.0, zLines[14] - 8.5),
      z: zLines[14] - 8.5,
      rotY: Math.PI,
      streetLabel: '15th St & K St',
    },
    {
      x: uzToWorldX(uLines[15] + uHalfWidths[15] + 2.0, zLines[11] + 6.5),
      z: zLines[11] + 6.5,
      rotY: -Math.PI / 2,
      streetLabel: 'P St & Entertainment District',
    },
    {
      x: uzToWorldX(uLines[16] - uHalfWidths[16] - 2.0, zLines[17] + 6.5),
      z: zLines[17] + 6.5,
      rotY: Math.PI / 2,
      streetLabel: 'Q St & Retail District',
    },
    {
      x: uzToWorldX(uLines[20] + uHalfWidths[20] + 2.0, zLines[17] + 5.0),
      z: zLines[17] + 5.0,
      rotY: -Math.PI / 2,
      streetLabel: 'U St & Medical District',
    },
    {
      x: uzToWorldX(uLines[22] + uHalfWidths[22] + 2.0, zLines[26] + 6.0),
      z: zLines[26] + 6.0,
      rotY: -Math.PI / 2,
      streetLabel: 'W St & Airport District',
    },
  ];

  const waterfront: Waterfront = {
    uEdge: uLines[uLines.length - 1] + uHalfWidths[uLines.length - 1] + 9,
    z0: zLines[0] - 60,
    z1: zLines[zLines.length - 1] + 60,
    level: -0.35,
  };

  return {
    uLines,
    zLines,
    uHalfWidths,
    zHalfWidths,
    uIsMajor,
    zIsMajor,
    uClasses,
    zClasses,
    uStreetNames: DIAGONAL_LETTERS.map((letter) => `${letter} St`),
    zStreetNames: Array.from({ length: HORIZONTAL_COUNT }, (_, j) => ordinalStreet(j + 1)),
    districts: CITY_DISTRICTS,
    blocks,
    signalIntersections,
    busStops,
    metroLineZ: zLines[15], // Elevated metro viaduct runs along 16th St
    waterfront,
    loftCenter: { x: loftCenterX, z: loftCenterZ },
    loftDoorPos: { x: loftDoorX, z: loftDoorZ },
    hotelCenter: { x: hotelCenterX, z: hotelMidZ },
    airportCenter: { x: airportCenterX, z: airportMidZ },
    airportDoorPos,
    airportEntrancePos,
    airportArrivalPos,
    airportDeparturePos,
    clothingStoreCenter,
    clothingStoreDoorPos,
    clothingStoreArrivalPos,
    salonPos,
    bounds: {
      uMin: uLines[0] - 8.0,
      uMax: uLines[uLines.length - 1] + uHalfWidths[uLines.length - 1] + 8.0,
      zMin: zLines[0] - 8.0,
      zMax: zLines[zLines.length - 1] + zHalfWidths[zHalfWidths.length - 1] + 8.0,
    },
  };
}

export const CITY_LAYOUT = buildCityLayout();

/** Convert diagonal coordinate u and world z -> world x */
export function uzToWorldX(u: number, z: number): number {
  return u + CITY_SLOPE * z;
}

/** Convert world (x, z) -> diagonal coordinate u */
export function worldToU(x: number, z: number): number {
  return x - CITY_SLOPE * z;
}

/** The district that owns a world position. */
export function districtAt(x: number, z: number): CityDistrict {
  const u = worldToU(x, z);
  const block = CITY_LAYOUT.blocks.find(
    (b) => u >= b.uMin && u <= b.uMax && z >= b.zMin && z <= b.zMax
  );
  const id = block?.district ?? 'downtown';
  return DISTRICT_BY_ID.get(id) ?? CITY_DISTRICTS[0];
}

/**
 * Human-readable street / district label for the HUD and the city map.
 * District context is what lets a player know where they are, so it is always
 * present: `M St & 15th St · Civic Core`.
 */
export function getCityLocationLabel(x: number, z: number): string {
  const u = worldToU(x, z);
  const { uLines, zLines, uHalfWidths, zHalfWidths } = CITY_LAYOUT;

  let nearestCol = 0;
  let minUDist = Infinity;
  for (let i = 0; i < uLines.length; i++) {
    const d = Math.abs(u - uLines[i]);
    if (d < minUDist) {
      minUDist = d;
      nearestCol = i;
    }
  }

  let nearestRow = 0;
  let minZDist = Infinity;
  for (let j = 0; j < zLines.length; j++) {
    const d = Math.abs(z - zLines[j]);
    if (d < minZDist) {
      minZDist = d;
      nearestRow = j;
    }
  }

  const onDiag = minUDist <= uHalfWidths[nearestCol] + 2.6;
  const onHoriz = minZDist <= zHalfWidths[nearestRow] + 2.6;
  const letterName = `${DIAGONAL_LETTERS[nearestCol]} St`;
  const numName = ordinalStreet(nearestRow + 1);
  const district = districtAt(x, z).shortName;

  if (onDiag && onHoriz) return `${letterName} & ${numName} · ${district}`;
  if (onDiag) return `${letterName} near ${numName} · ${district}`;
  if (onHoriz) return `${numName} near ${letterName} · ${district}`;
  return `Near ${letterName} & ${numName} · ${district}`;
}
