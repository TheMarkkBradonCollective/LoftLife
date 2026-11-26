export const DIAGONAL_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''); // 26: A St .. Z St
export const HORIZONTAL_COUNT = 30; // 1st St .. 30th St
export const CITY_SLOPE = 0.42; // Diagonal slant dx/dz for A-Z streets

export interface CityBlock {
  col: number; // 0..24 (between letter col and col+1)
  row: number; // 0..28 (between row+1 and row+2)
  uMin: number;
  uMax: number;
  zMin: number;
  zMax: number;
  kind: 'loft_plaza' | 'loft_hotel' | 'airport' | 'park' | 'building';
  height: number;
  /** Secondary upper setback height (0 if single volume) */
  setbackHeight: number;
  /** Architectural facade style index (0..5) */
  facadeStyle: number;
  paletteIndex: number;
  hasTowerCrown: boolean;
  /** Sub-buildings inside large blocks (1 or 2 buildings for realistic skyline) */
  subSplit: 'none' | 'split_u' | 'split_z';
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

export interface CityLayout {
  uLines: number[]; // length 26 (A..Z)
  zLines: number[]; // length 30 (1st..30th)
  uHalfWidths: number[];
  zHalfWidths: number[];
  uIsMajor: boolean[];
  zIsMajor: boolean[];
  blocks: CityBlock[];
  signalIntersections: TrafficSignalIntersection[];
  busStops: BusStopSpot[];
  metroLineZ: number; // Elevated metro viaduct Z coordinate (16th St corridor)
  loftCenter: { x: number; z: number };
  loftDoorPos: { x: number; z: number };
  hotelCenter: { x: number; z: number };
  airportCenter: { x: number; z: number };
  airportArrivalPos: { x: number; z: number };
  airportDeparturePos: { x: number; z: number };
  airportShopPos: { x: number; z: number };
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

export function buildCityLayout(): CityLayout {
  // Normal-scale city streets:
  // Major 4-lane boulevards: 6.4m half-width (12.8m curb-to-curb, 4 x 3.2m lanes)
  // Standard 2-lane streets: 4.4m half-width (8.8m curb-to-curb, 2 x 4.4m lanes w/ shoulder)
  const rawU: number[] = [0];
  const uHalfWidths: number[] = [];
  const uIsMajor: boolean[] = [];

  for (let i = 0; i < DIAGONAL_LETTERS.length; i++) {
    const isMajor = i === 0 || i === 12 || i === 25 || i % 6 === 0;
    uIsMajor.push(isMajor);
    uHalfWidths.push(isMajor ? 6.4 : 4.4);
    if (i < DIAGONAL_LETTERS.length - 1) {
      const isCentral = i === 12 || i === 11;
      // Uneven realistic city block widths between street centerlines (24m .. 42m)
      const span = isCentral
        ? 36.0
        : 24.0 + seededRand(i * 19 + 3) * 18.0;
      rawU.push(rawU[rawU.length - 1] + span);
    }
  }
  const uCenterOffset = rawU[12]; // Center on M St
  const uLines = rawU.map((u) => u - uCenterOffset);

  const rawZ: number[] = [0];
  const zHalfWidths: number[] = [];
  const zIsMajor: boolean[] = [];

  for (let j = 0; j < HORIZONTAL_COUNT; j++) {
    const isMajor = j === 0 || j === 14 || j === 29 || (j + 1) % 5 === 0;
    zIsMajor.push(isMajor);
    zHalfWidths.push(isMajor ? 6.4 : 4.4);
    if (j < HORIZONTAL_COUNT - 1) {
      const isCentral = j === 14 || j === 13;
      // Uneven realistic city block depths between street centerlines (22m .. 38m)
      const span = isCentral
        ? 34.0
        : 22.0 + seededRand(j * 31 + 7) * 16.0;
      rawZ.push(rawZ[rawZ.length - 1] + span);
    }
  }
  const zCenterOffset = rawZ[14]; // Center on 15th St
  const zLines = rawZ.map((z) => z - zCenterOffset);

  const blocks: CityBlock[] = [];
  for (let col = 0; col < DIAGONAL_LETTERS.length - 1; col++) {
    for (let row = 0; row < HORIZONTAL_COUNT - 1; row++) {
      const uMin = uLines[col] + uHalfWidths[col];
      const uMax = uLines[col + 1] - uHalfWidths[col + 1];
      const zMin = zLines[row] + zHalfWidths[row];
      const zMax = zLines[row + 1] - zHalfWidths[row + 1];

      let kind: CityBlock['kind'] = 'building';
      // Central LoftLife Grand Hotel & Plaza between M St (12)->N St (13) and 15th St (14)->16th St (15)
      if (col === 12 && row === 14) {
        kind = 'loft_plaza';
      } else if (col === 23 && row === 27) {
        kind = 'loft_hotel';
      } else if (col === 24 && row === 28) {
        kind = 'airport';
      } else if (
        (col === 11 && row === 14) ||
        (col === 6 && row === 8) ||
        (col === 18 && row === 20) ||
        (col === 7 && row === 22) ||
        (col === 19 && row === 7) ||
        (col === 13 && row === 13) ||
        seededRand(col * 97 + row * 53) > 0.88
      ) {
        kind = 'park';
      }

      const distFromCenter = Math.hypot(col - 12, row - 14);
      const r1 = seededRand(col * 41 + row * 73);
      const r2 = seededRand(col * 61 + row * 37);
      // Realistic urban skyline: taller downtown skyscrapers near center, varied mid-rise neighborhoods
      const downtownBoost = Math.max(0, 26 - distFromCenter * 1.6);
      const height = 11.0 + r1 * 22.0 + (r2 > 0.65 ? downtownBoost : downtownBoost * 0.45);
      const setbackHeight =
        height > 26 && seededRand(col * 23 + row * 83) > 0.35
          ? 6.0 + seededRand(col * 11 + row * 47) * 10.0
          : 0;

      const uSpan = uMax - uMin;
      const zSpan = zMax - zMin;
      let subSplit: CityBlock['subSplit'] = 'none';
      if (uSpan > 22 && seededRand(col * 7 + row * 13) > 0.45) {
        subSplit = 'split_u';
      } else if (zSpan > 20 && seededRand(col * 17 + row * 29) > 0.52) {
        subSplit = 'split_z';
      }

      blocks.push({
        col,
        row,
        uMin,
        uMax,
        zMin,
        zMax,
        kind,
        height,
        setbackHeight,
        facadeStyle: Math.floor(seededRand(col * 29 + row * 43) * 6),
        paletteIndex: Math.floor(seededRand(col * 17 + row * 29) * 5),
        hasTowerCrown: height > 28 && seededRand(col * 13 + row * 19) > 0.4,
        subSplit,
      });
    }
  }

  // Loft Plaza block center
  const plazaBlock = blocks.find((b) => b.kind === 'loft_plaza')!;
  const plazaMidZ = (plazaBlock.zMin + plazaBlock.zMax) / 2;
  const plazaMidU = (plazaBlock.uMin + plazaBlock.uMax) / 2;
  const loftCenterX = plazaMidU + CITY_SLOPE * plazaMidZ;
  const loftCenterZ = plazaMidZ;

  // Relocate the Grand Hotel to the edge of TheCity beside the airport.
  const hotelBlock = blocks.find((b) => b.kind === 'loft_hotel')!;
  const hotelMidU = (hotelBlock.uMin + hotelBlock.uMax) / 2;
  const hotelMidZ = (hotelBlock.zMin + hotelBlock.zMax) / 2;
  const hotelCenterX = hotelMidU + CITY_SLOPE * hotelMidZ;
  const loftDoorZ = hotelBlock.zMin + 6.4;
  const loftDoorX = hotelMidU + CITY_SLOPE * loftDoorZ;
  const airportBlock = blocks.find((b) => b.kind === 'airport')!;
  const airportMidU = (airportBlock.uMin + airportBlock.uMax) / 2;
  const airportMidZ = (airportBlock.zMin + airportBlock.zMax) / 2;
  const airportCenterX = airportMidU + CITY_SLOPE * airportMidZ;
  const airportArrivalPos = { x: airportCenterX, z: airportMidZ + 7.2 };
  const airportDeparturePos = { x: airportCenterX + 4.4, z: airportMidZ + 6.5 };
  const airportShopPos = { x: airportCenterX - 4.4, z: airportMidZ + 6.5 };
  const salonPos = { x: loftCenterX - 7.4, z: loftCenterZ + 5.4 };

  // Major intersections get working Traffic Lights
  const signalIntersections: TrafficSignalIntersection[] = [];
  for (let col = 0; col < DIAGONAL_LETTERS.length; col++) {
    for (let row = 0; row < HORIZONTAL_COUNT; row++) {
      if ((uIsMajor[col] && zIsMajor[row]) || (col === 12 && (row >= 12 && row <= 17)) || (row === 14 && (col >= 10 && col <= 15))) {
        const u = uLines[col];
        const z = zLines[row];
        signalIntersections.push({
          col,
          row,
          u,
          z,
          x: u + CITY_SLOPE * z,
          uHalfWidth: uHalfWidths[col],
          zHalfWidth: zHalfWidths[row],
        });
      }
    }
  }

  // Bus stop shelters along 15th St & M St near downtown blocks
  const busStops: BusStopSpot[] = [
    {
      x: uzToWorldX(uLines[12] + 9.5, zLines[14] + zHalfWidths[14] - 0.55),
      z: zLines[14] + zHalfWidths[14] - 0.55,
      rotY: Math.PI,
      streetLabel: '15th St & M St',
    },
    {
      x: uzToWorldX(uLines[14] - 8.0, zLines[14] - zHalfWidths[14] + 0.55),
      z: zLines[14] - zHalfWidths[14] + 0.55,
      rotY: 0,
      streetLabel: '15th St & O St',
    },
    {
      x: uzToWorldX(uLines[12] - uHalfWidths[12] + 0.55, zLines[15] - 8.5),
      z: zLines[15] - 8.5,
      rotY: Math.PI / 2,
      streetLabel: 'M St & 16th St',
    },
    {
      x: uzToWorldX(uLines[12] + uHalfWidths[12] - 0.55, zLines[13] + 8.5),
      z: zLines[13] + 8.5,
      rotY: -Math.PI / 2,
      streetLabel: 'M St & 14th St',
    },
  ];

  return {
    uLines,
    zLines,
    uHalfWidths,
    zHalfWidths,
    uIsMajor,
    zIsMajor,
    blocks,
    signalIntersections,
    busStops,
    metroLineZ: zLines[15], // Elevated Metro Viaduct runs along 16th St (just south of Hotel Plaza!)
    loftCenter: { x: loftCenterX, z: loftCenterZ },
    loftDoorPos: { x: loftDoorX, z: loftDoorZ },
    hotelCenter: { x: hotelCenterX, z: hotelMidZ },
    airportCenter: { x: airportCenterX, z: airportMidZ },
    airportArrivalPos,
    airportDeparturePos,
    airportShopPos,
    salonPos,
    bounds: {
      uMin: uLines[0] - 8.0,
      uMax: uLines[uLines.length - 1] + 8.0,
      zMin: zLines[0] - 8.0,
      zMax: zLines[zLines.length - 1] + 8.0,
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

/** Returns human-readable street or intersection name for HUD */
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

  const onDiag = minUDist <= uHalfWidths[nearestCol] + 2.2;
  const onHoriz = minZDist <= zHalfWidths[nearestRow] + 2.2;

  const letterName = `${DIAGONAL_LETTERS[nearestCol]} St`;
  const numName = ordinalStreet(nearestRow + 1);

  if (onDiag && onHoriz) return `${letterName} & ${numName}`;
  if (onDiag) return `${letterName} near ${numName}`;
  if (onHoriz) return `${numName} near ${letterName}`;
  return `Near ${letterName} & ${numName}`;
}
