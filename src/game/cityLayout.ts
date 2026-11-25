export const DIAGONAL_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''); // 26: A St .. Z St
export const HORIZONTAL_COUNT = 30; // 1st St .. 30th St
export const CITY_SLOPE = 0.44; // Diagonal slant dx/dz for A-Z streets

export interface CityBlock {
  col: number; // 0..24 (between letter col and col+1)
  row: number; // 0..28 (between row+1 and row+2)
  uMin: number;
  uMax: number;
  zMin: number;
  zMax: number;
  kind: 'loft_plaza' | 'park' | 'building';
  height: number;
  paletteIndex: number;
  hasTowerCrown: boolean;
}

export interface CityLayout {
  uLines: number[]; // length 26 (A..Z)
  zLines: number[]; // length 30 (1st..30th)
  uHalfWidths: number[];
  zHalfWidths: number[];
  blocks: CityBlock[];
  loftCenter: { x: number; z: number };
  loftDoorPos: { x: number; z: number };
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
  // Generate uneven spacing for 26 diagonal streets (A..Z)
  const rawU: number[] = [0];
  const uHalfWidths: number[] = [];
  for (let i = 0; i < DIAGONAL_LETTERS.length; i++) {
    const isMajor = i === 0 || i === 12 || i === 25 || i % 6 === 0;
    uHalfWidths.push(isMajor ? 2.5 : 1.85);
    if (i < DIAGONAL_LETTERS.length - 1) {
      // Uneven block widths ranging from 9.5m to 20.5m
      const isCentralPlazas = i === 12 || i === 11;
      const span = isCentralPlazas
        ? 17.5
        : 9.5 + seededRand(i * 19 + 3) * 11.0;
      rawU.push(rawU[rawU.length - 1] + span);
    }
  }
  // Center around M St (index 12) so Loft sits near x = 0
  const uCenterOffset = rawU[12];
  const uLines = rawU.map((u) => u - uCenterOffset);

  // Generate uneven spacing for 30 horizontal streets (1st..30th)
  const rawZ: number[] = [0];
  const zHalfWidths: number[] = [];
  for (let j = 0; j < HORIZONTAL_COUNT; j++) {
    const isMajor = j === 0 || j === 14 || j === 29 || (j + 1) % 5 === 0;
    zHalfWidths.push(isMajor ? 2.5 : 1.85);
    if (j < HORIZONTAL_COUNT - 1) {
      // Uneven block depths ranging from 8.5m to 18.5m
      const isCentralPlazas = j === 14 || j === 13;
      const span = isCentralPlazas
        ? 16.5
        : 8.5 + seededRand(j * 31 + 7) * 10.0;
      rawZ.push(rawZ[rawZ.length - 1] + span);
    }
  }
  // Center around 15th St (index 14) so 15th St is near z = 0
  const zCenterOffset = rawZ[14];
  const zLines = rawZ.map((z) => z - zCenterOffset);

  const blocks: CityBlock[] = [];
  for (let col = 0; col < DIAGONAL_LETTERS.length - 1; col++) {
    for (let row = 0; row < HORIZONTAL_COUNT - 1; row++) {
      const uMin = uLines[col] + uHalfWidths[col];
      const uMax = uLines[col + 1] - uHalfWidths[col + 1];
      const zMin = zLines[row] + zHalfWidths[row];
      const zMax = zLines[row + 1] - zHalfWidths[row + 1];

      let kind: CityBlock['kind'] = 'building';
      // Central Loft & Fountain Plaza block between M St (12) -> N St (13) and 15th St (14) -> 16th St (15)
      if (col === 12 && row === 14) {
        kind = 'loft_plaza';
      } else if (
        (col === 11 && row === 14) ||
        (col === 6 && row === 8) ||
        (col === 18 && row === 20) ||
        (col === 7 && row === 22) ||
        (col === 19 && row === 7) ||
        seededRand(col * 97 + row * 53) > 0.89
      ) {
        kind = 'park';
      }

      const distFromCenter = Math.hypot(col - 12, row - 14);
      const baseH =
        4.5 +
        seededRand(col * 41 + row * 73) * 12.0 +
        Math.max(0, 8 - distFromCenter * 0.55);

      blocks.push({
        col,
        row,
        uMin,
        uMax,
        zMin,
        zMax,
        kind,
        height: baseH,
        paletteIndex: Math.floor(seededRand(col * 17 + row * 29) * 5),
        hasTowerCrown: baseH > 13.5 && seededRand(col * 13 + row * 19) > 0.45,
      });
    }
  }

  // Loft Plaza block center
  const plazaBlock = blocks.find((b) => b.kind === 'loft_plaza')!;
  const plazaMidZ = (plazaBlock.zMin + plazaBlock.zMax) / 2;
  const plazaMidU = (plazaBlock.uMin + plazaBlock.uMax) / 2;
  const loftCenterX = plazaMidU + CITY_SLOPE * plazaMidZ;
  const loftCenterZ = plazaMidZ;

  // Loft building sits at north edge of the Loft Plaza block, facing south into the plaza
  const loftDoorZ = plazaBlock.zMin + 2.35;
  const loftDoorX = plazaMidU + CITY_SLOPE * loftDoorZ;

  return {
    uLines,
    zLines,
    uHalfWidths,
    zHalfWidths,
    blocks,
    loftCenter: { x: loftCenterX, z: loftCenterZ },
    loftDoorPos: { x: loftDoorX, z: loftDoorZ },
    bounds: {
      uMin: uLines[0] - 4.0,
      uMax: uLines[uLines.length - 1] + 4.0,
      zMin: zLines[0] - 4.0,
      zMax: zLines[zLines.length - 1] + 4.0,
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

  const onDiag = minUDist <= uHalfWidths[nearestCol] + 1.8;
  const onHoriz = minZDist <= zHalfWidths[nearestRow] + 1.8;

  const letterName = `${DIAGONAL_LETTERS[nearestCol]} St`;
  const numName = ordinalStreet(nearestRow + 1);

  if (onDiag && onHoriz) return `${letterName} & ${numName}`;
  if (onDiag) return `${letterName} near ${numName}`;
  if (onHoriz) return `${numName} near ${letterName}`;
  return `Near ${letterName} & ${numName}`;
}
