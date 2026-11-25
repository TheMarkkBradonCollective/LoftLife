import * as THREE from 'three';
import { createAvatarRig, type AvatarRig } from './avatar';
import {
  CITY_LAYOUT,
  CITY_SLOPE,
  DIAGONAL_LETTERS,
  HORIZONTAL_COUNT,
  ordinalStreet,
  uzToWorldX,
  worldToU,
} from './cityLayout';
import type { AvatarConfig, EmoteType, LightingMood } from './types';

export interface WorldObstacle {
  type: 'circle' | 'box';
  x: number;
  z: number;
  r?: number;
  hw?: number;
  hd?: number;
}

export interface WorldSeatTarget {
  id: string;
  label: string;
  mesh: THREE.Group;
  seatPos: { x: number; y: number; z: number };
  approachPos: { x: number; z: number };
  facingYaw: number;
}

export interface WorldNpc {
  id: string;
  name: string;
  greeting: string;
  rig: AvatarRig;
  x: number;
  z: number;
  yaw: number;
  waypoints: { x: number; z: number }[];
  wpIndex: number;
  waitTimer: number;
  idleEmote: EmoteType;
  greetTimer: number;
}

export interface MainWorldHandles {
  worldGroup: THREE.Group;
  groundRaycastPlane: THREE.Mesh;
  loftPortalGroup: THREE.Group;
  intercomGroup: THREE.Group;
  loftDoorLeftPivot: THREE.Group;
  loftDoorRightPivot: THREE.Group;
  loftDoorEntryPos: { x: number; z: number };
  loftDoorThresholdPos: { x: number; z: number };
  djDeckGroup: THREE.Group;
  seats: WorldSeatTarget[];
  npcs: WorldNpc[];
  obstacles: WorldObstacle[];
  updateWorld: (
    elapsed: number,
    delta: number,
    playerX: number,
    playerZ: number,
    mood: LightingMood
  ) => void;
  togglePartyMode: () => boolean;
  setMainDoorUnlocked: (unlocked: boolean) => void;
  isMainDoorUnlocked: () => boolean;
}

interface MeshAccumulator {
  positions: number[];
  normals: number[];
  indices: number[];
}

function createAccumulator(): MeshAccumulator {
  return { positions: [], normals: [], indices: [] };
}

function pushQuad(
  acc: MeshAccumulator,
  p0: [number, number, number],
  p1: [number, number, number],
  p2: [number, number, number],
  p3: [number, number, number]
) {
  const base = acc.positions.length / 3;
  // Compute face normal (p1 - p0) x (p2 - p0)
  const ax = p1[0] - p0[0];
  const ay = p1[1] - p0[1];
  const az = p1[2] - p0[2];
  const bx = p2[0] - p0[0];
  const by = p2[1] - p0[1];
  const bz = p2[2] - p0[2];
  let nx = ay * bz - az * by;
  let ny = az * bx - ax * bz;
  let nz = ax * by - ay * bx;
  const len = Math.hypot(nx, ny, nz) || 1;
  nx /= len;
  ny /= len;
  nz /= len;

  acc.positions.push(...p0, ...p1, ...p2, ...p3);
  acc.normals.push(nx, ny, nz, nx, ny, nz, nx, ny, nz, nx, ny, nz);
  acc.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

/** Appends a slanted parallelogram prism aligned with diagonal CITY_SLOPE */
function pushSlantedPrism(
  acc: MeshAccumulator,
  u0: number,
  u1: number,
  z0: number,
  z1: number,
  y0: number,
  y1: number
) {
  const x00 = uzToWorldX(u0, z0);
  const x10 = uzToWorldX(u1, z0);
  const x11 = uzToWorldX(u1, z1);
  const x01 = uzToWorldX(u0, z1);

  // Top (+Y)
  pushQuad(acc, [x01, y1, z1], [x11, y1, z1], [x10, y1, z0], [x00, y1, z0]);
  // South (+Z)
  pushQuad(acc, [x01, y0, z1], [x11, y0, z1], [x11, y1, z1], [x01, y1, z1]);
  // North (-Z)
  pushQuad(acc, [x10, y0, z0], [x00, y0, z0], [x00, y1, z0], [x10, y1, z0]);
  // East (+U)
  pushQuad(acc, [x11, y0, z1], [x10, y0, z0], [x10, y1, z0], [x11, y1, z1]);
  // West (-U)
  pushQuad(acc, [x00, y0, z0], [x01, y0, z1], [x01, y1, z1], [x00, y1, z0]);
}

function finalizeAccumulator(acc: MeshAccumulator): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(acc.positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(acc.normals, 3));
  geo.setIndex(acc.indices);
  geo.computeBoundingSphere();
  return geo;
}

function createStreetSignMesh(
  labelTop: string,
  labelBottom: string,
  maxAnisotropy: number
): THREE.Group {
  const g = new THREE.Group();
  const poleMat = new THREE.MeshStandardMaterial({
    color: 0x262a33,
    roughness: 0.35,
    metalness: 0.75,
  });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 2.75, 8), poleMat);
  pole.position.y = 1.375;
  g.add(pole);

  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 96;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#14532d';
  ctx.fillRect(0, 0, 256, 96);
  ctx.strokeStyle = '#ecfdf5';
  ctx.lineWidth = 4;
  ctx.strokeRect(4, 4, 248, 88);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 28px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(labelTop, 128, 40);
  ctx.fillStyle = '#bbf7d0';
  ctx.font = '600 22px sans-serif';
  ctx.fillText(labelBottom, 128, 72);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;

  const board = new THREE.Mesh(
    new THREE.BoxGeometry(1.18, 0.44, 0.06),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 0.45 })
  );
  board.position.y = 2.62;
  g.add(board);
  return g;
}

function buildParkBench(): THREE.Group {
  const bench = new THREE.Group();
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x9b6840, roughness: 0.58 });
  const ironMat = new THREE.MeshStandardMaterial({
    color: 0x262932,
    roughness: 0.4,
    metalness: 0.72,
  });

  for (const bx of [-0.62, 0.62]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.44, 0.5), ironMat);
    leg.position.set(bx, 0.22, 0);
    bench.add(leg);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.26, 0.46), ironMat);
    arm.position.set(bx, 0.56, -0.02);
    bench.add(arm);
  }
  for (const sz of [-0.14, 0.02, 0.18]) {
    const slat = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.05, 0.12), woodMat);
    slat.position.set(0, 0.44, sz);
    bench.add(slat);
  }
  for (const by of [0.64, 0.8]) {
    const back = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.11, 0.05), woodMat);
    back.position.set(0, by, -0.23);
    back.rotation.x = -0.14;
    bench.add(back);
  }
  return bench;
}

export function buildMainWorld(maxAnisotropy: number, isSoftwareGl: boolean): MainWorldHandles {
  const worldGroup = new THREE.Group();
  const obstacles: WorldObstacle[] = [];
  const seats: WorldSeatTarget[] = [];

  const { uLines, zLines, uHalfWidths, zHalfWidths, blocks, bounds, loftCenter, loftDoorPos } =
    CITY_LAYOUT;

  // 1. Continuous Ground & Asphalt Street Bed extending to horizon fog
  const outerGround = new THREE.Mesh(
    new THREE.PlaneGeometry(900, 900),
    new THREE.MeshStandardMaterial({ color: 0x4b5848, roughness: 0.95 })
  );
  outerGround.rotation.x = -Math.PI / 2;
  outerGround.position.y = -0.08;
  worldGroup.add(outerGround);

  const citySpanU = bounds.uMax - bounds.uMin + 12;
  const citySpanZ = bounds.zMax - bounds.zMin + 12;
  const asphaltAcc = createAccumulator();
  pushSlantedPrism(
    asphaltAcc,
    bounds.uMin - 6,
    bounds.uMax + 6,
    bounds.zMin - 6,
    bounds.zMax + 6,
    -0.06,
    0.0
  );
  const asphaltMesh = new THREE.Mesh(
    finalizeAccumulator(asphaltAcc),
    new THREE.MeshStandardMaterial({ color: 0x353942, roughness: 0.88, metalness: 0.04 })
  );
  asphaltMesh.receiveShadow = true;
  worldGroup.add(asphaltMesh);

  // Invisible raycast plane covering entire A-Z & 1st-30th city
  const groundRaycastPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(citySpanU + 220, citySpanZ + 60),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  groundRaycastPlane.rotation.x = -Math.PI / 2;
  groundRaycastPlane.position.set(0, 0.02, 0);
  worldGroup.add(groundRaycastPlane);

  // 2. Street Center Dashes (26 Diagonal A-Z streets + 30 Horizontal 1st-30th streets)
  const stripeAcc = createAccumulator();
  for (let i = 0; i < DIAGONAL_LETTERS.length; i++) {
    const u = uLines[i];
    for (let z = bounds.zMin; z < bounds.zMax; z += 5.5) {
      pushSlantedPrism(stripeAcc, u - 0.08, u + 0.08, z, z + 2.6, 0.005, 0.015);
    }
  }
  for (let j = 0; j < HORIZONTAL_COUNT; j++) {
    const z = zLines[j];
    for (let u = bounds.uMin; u < bounds.uMax; u += 5.5) {
      pushSlantedPrism(stripeAcc, u, u + 2.6, z - 0.08, z + 0.08, 0.005, 0.015);
    }
  }
  const stripeMesh = new THREE.Mesh(
    finalizeAccumulator(stripeAcc),
    new THREE.MeshBasicMaterial({ color: 0xe2d5a8 })
  );
  worldGroup.add(stripeMesh);

  // 3. Merge Sidewalks, Park Grass, and Buildings for all 725 uneven blocks
  const sidewalkAcc = createAccumulator();
  const parkGrassAcc = createAccumulator();
  const crownAcc = createAccumulator();
  const bldgAccs = [
    createAccumulator(),
    createAccumulator(),
    createAccumulator(),
    createAccumulator(),
    createAccumulator(),
  ];

  const treeCoords: { x: number; z: number; scale: number }[] = [];
  const lampCoords: { x: number; z: number }[] = [];

  for (const blk of blocks) {
    // Full block sidewalk curb
    pushSlantedPrism(sidewalkAcc, blk.uMin, blk.uMax, blk.zMin, blk.zMax, 0.0, 0.1);

    if (blk.kind === 'loft_plaza') {
      // Special central plaza tile area
      pushSlantedPrism(
        sidewalkAcc,
        blk.uMin + 0.3,
        blk.uMax - 0.3,
        blk.zMin + 0.3,
        blk.zMax - 0.3,
        0.1,
        0.13
      );
      continue;
    }

    if (blk.kind === 'park') {
      pushSlantedPrism(
        parkGrassAcc,
        blk.uMin + 1.4,
        blk.uMax - 1.4,
        blk.zMin + 1.4,
        blk.zMax - 1.4,
        0.1,
        0.15
      );
      const midU = (blk.uMin + blk.uMax) / 2;
      const midZ = (blk.zMin + blk.zMax) / 2;
      treeCoords.push({ x: uzToWorldX(midU - 1.8, midZ - 1.4), z: midZ - 1.4, scale: 1.1 });
      treeCoords.push({ x: uzToWorldX(midU + 1.8, midZ + 1.5), z: midZ + 1.5, scale: 0.95 });
      continue;
    }

    // Building footprint inset by 2.1m walkable sidewalk
    const bu0 = blk.uMin + 2.1;
    const bu1 = blk.uMax - 2.1;
    const bz0 = blk.zMin + 2.1;
    const bz1 = blk.zMax - 2.1;
    if (bu1 - bu0 > 2.0 && bz1 - bz0 > 2.0) {
      pushSlantedPrism(bldgAccs[blk.paletteIndex], bu0, bu1, bz0, bz1, 0.1, blk.height);
      if (blk.hasTowerCrown) {
        const cu0 = bu0 + (bu1 - bu0) * 0.2;
        const cu1 = bu1 - (bu1 - bu0) * 0.2;
        const cz0 = bz0 + (bz1 - bz0) * 0.2;
        const cz1 = bz1 - (bz1 - bz0) * 0.2;
        pushSlantedPrism(crownAcc, cu0, cu1, cz0, cz1, blk.height, blk.height + 2.8);
      }
    }

    // Streetlamp on every 2nd block corner
    if ((blk.col + blk.row) % 3 === 0) {
      const lx = uzToWorldX(blk.uMin + 0.7, blk.zMin + 0.7);
      lampCoords.push({ x: lx, z: blk.zMin + 0.7 });
    }
  }

  const sidewalkMesh = new THREE.Mesh(
    finalizeAccumulator(sidewalkAcc),
    new THREE.MeshStandardMaterial({ color: 0xcbc4b8, roughness: 0.82 })
  );
  sidewalkMesh.receiveShadow = true;
  worldGroup.add(sidewalkMesh);

  const parkGrassMesh = new THREE.Mesh(
    finalizeAccumulator(parkGrassAcc),
    new THREE.MeshStandardMaterial({ color: 0x628e5c, roughness: 0.9 })
  );
  parkGrassMesh.receiveShadow = true;
  worldGroup.add(parkGrassMesh);

  const bldgPalettes = [0xd8c8b6, 0xa86452, 0x6d7d8f, 0xc9b59b, 0x4d5664];
  bldgAccs.forEach((acc, idx) => {
    if (acc.positions.length === 0) return;
    const m = new THREE.Mesh(
      finalizeAccumulator(acc),
      new THREE.MeshStandardMaterial({
        color: bldgPalettes[idx],
        roughness: idx === 2 || idx === 4 ? 0.35 : 0.74,
        metalness: idx === 2 || idx === 4 ? 0.25 : 0.04,
      })
    );
    m.castShadow = true;
    m.receiveShadow = true;
    worldGroup.add(m);
  });

  if (crownAcc.positions.length > 0) {
    const crownMesh = new THREE.Mesh(
      finalizeAccumulator(crownAcc),
      new THREE.MeshStandardMaterial({ color: 0x2a2f3a, roughness: 0.45, metalness: 0.3 })
    );
    worldGroup.add(crownMesh);
  }

  // 4. Instanced Park Trees & Streetlamps across the City
  if (treeCoords.length > 0) {
    const trunkInst = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.14, 0.22, 1.5, 8),
      new THREE.MeshStandardMaterial({ color: 0x6b4730, roughness: 0.9 }),
      treeCoords.length
    );
    const canopyInst = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(0.95, 1),
      new THREE.MeshStandardMaterial({ color: 0x4f8458, roughness: 0.8 }),
      treeCoords.length
    );
    const dummy = new THREE.Object3D();
    treeCoords.forEach((tc, i) => {
      dummy.position.set(tc.x, 0.85 * tc.scale, tc.z);
      dummy.scale.setScalar(tc.scale);
      dummy.updateMatrix();
      trunkInst.setMatrixAt(i, dummy.matrix);

      dummy.position.set(tc.x, 2.05 * tc.scale, tc.z);
      dummy.updateMatrix();
      canopyInst.setMatrixAt(i, dummy.matrix);
    });
    trunkInst.computeBoundingSphere();
    canopyInst.computeBoundingSphere();
    worldGroup.add(trunkInst, canopyInst);
  }

  const lampGlobeMat = new THREE.MeshStandardMaterial({
    color: 0xfff5d6,
    emissive: 0xffca70,
    emissiveIntensity: 0.3,
    roughness: 0.25,
  });
  if (lampCoords.length > 0) {
    const poleInst = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.05, 0.08, 2.8, 8),
      new THREE.MeshStandardMaterial({ color: 0x262932, roughness: 0.4, metalness: 0.7 }),
      lampCoords.length
    );
    const globeInst = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.18, 10, 10),
      lampGlobeMat,
      lampCoords.length
    );
    const dummy = new THREE.Object3D();
    lampCoords.forEach((lc, i) => {
      dummy.position.set(lc.x, 1.4, lc.z);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      poleInst.setMatrixAt(i, dummy.matrix);

      dummy.position.set(lc.x, 2.88, lc.z);
      dummy.updateMatrix();
      globeInst.setMatrixAt(i, dummy.matrix);
    });
    poleInst.computeBoundingSphere();
    globeInst.computeBoundingSphere();
    worldGroup.add(poleInst, globeInst);
  }

  // 5. Crisp Intersection Street Name Signs around Central District & Key Corners
  const signIntersections: [number, number][] = [
    [12, 14], // M St & 15th St (Home Corner!)
    [13, 14], // N St & 15th St
    [12, 15], // M St & 16th St
    [11, 14], // L St & 15th St
    [12, 13], // M St & 14th St
    [10, 14], // K St & 15th St
    [14, 14], // O St & 15th St
    [12, 17], // M St & 18th St
    [12, 11], // M St & 12th St
    [0, 0],   // A St & 1st St
    [25, 29], // Z St & 30th St
    [0, 29],  // A St & 30th St
    [25, 0],  // Z St & 1st St
  ];
  for (const [col, row] of signIntersections) {
    const sz = zLines[row] - zHalfWidths[row] + 0.5;
    const sx = uzToWorldX(uLines[col] - uHalfWidths[col] + 0.5, sz);
    const sign = createStreetSignMesh(
      `${DIAGONAL_LETTERS[col]} St`,
      ordinalStreet(row + 1),
      maxAnisotropy
    );
    sign.position.set(sx, 0.08, sz);
    worldGroup.add(sign);
  }

  // 6. Central Loft Plaza Features (on block M-N St & 15th-16th St)
  // Animated Fountain centered slightly south of Loft Entrance
  const fX = loftCenter.x + 0.6;
  const fZ = loftCenter.z + 1.6;
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0xe6dfd3, roughness: 0.62 });
  const basinOuter = new THREE.Mesh(new THREE.CylinderGeometry(1.75, 1.9, 0.44, 24), stoneMat);
  basinOuter.position.set(fX, 0.32, fZ);
  basinOuter.castShadow = true;
  basinOuter.receiveShadow = true;
  worldGroup.add(basinOuter);

  const waterPool = new THREE.Mesh(
    new THREE.CylinderGeometry(1.5, 1.5, 0.34, 24),
    new THREE.MeshPhysicalMaterial({
      color: 0x5ec8e8,
      roughness: 0.12,
      clearcoat: 0.9,
      transparent: true,
      opacity: 0.85,
    })
  );
  waterPool.position.set(fX, 0.35, fZ);
  worldGroup.add(waterPool);

  const fountainCol = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.36, 1.25, 14), stoneMat);
  fountainCol.position.set(fX, 0.78, fZ);
  worldGroup.add(fountainCol);

  const droplets: THREE.Mesh[] = [];
  const dropMat = new THREE.MeshStandardMaterial({
    color: 0xbef2ff,
    emissive: 0x38bdf8,
    emissiveIntensity: 0.35,
    transparent: true,
    opacity: 0.85,
  });
  for (let i = 0; i < 10; i++) {
    const drop = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), dropMat);
    worldGroup.add(drop);
    droplets.push(drop);
  }
  obstacles.push({ type: 'circle', x: fX, z: fZ, r: 2.0 });

  // Sittable Park Benches near Fountain
  const benchOffsets: { dx: number; dz: number; rotY: number; ax: number; az: number }[] = [
    { dx: 0, dz: 2.8, rotY: Math.PI, ax: 0, az: 2.0 },
    { dx: 2.8, dz: 0, rotY: -Math.PI / 2, ax: 2.0, az: 0 },
    { dx: -2.8, dz: 0, rotY: Math.PI / 2, ax: -2.0, az: 0 },
  ];
  benchOffsets.forEach((bo, idx) => {
    const bx = fX + bo.dx;
    const bz = fZ + bo.dz;
    const b = buildParkBench();
    b.position.set(bx, 0.12, bz);
    b.rotation.y = bo.rotY;
    b.userData.worldSeatId = `plaza_bench_${idx}`;
    worldGroup.add(b);
    seats.push({
      id: `plaza_bench_${idx}`,
      label: 'Plaza Bench',
      mesh: b,
      seatPos: { x: bx, y: 0.54, z: bz },
      approachPos: { x: fX + bo.ax, z: fZ + bo.az },
      facingYaw: bo.rotY,
    });
    const isHoriz = Math.abs(Math.cos(bo.rotY)) > 0.5;
    obstacles.push({
      type: 'box',
      x: bx,
      z: bz,
      hw: isHoriz ? 0.8 : 0.42,
      hd: isHoriz ? 0.42 : 0.8,
    });
  });

  // Multi-Story Grand Hotel Exterior Tower & Walk-Through Entrance on North edge of Plaza
  const loftPortalGroup = new THREE.Group();
  loftPortalGroup.position.set(loftDoorPos.x, 0.12, loftDoorPos.z);
  loftPortalGroup.userData.isLoftPortal = true;

  const limestoneMat = new THREE.MeshStandardMaterial({ color: 0xded4c6, roughness: 0.72 });
  const brickMat = new THREE.MeshStandardMaterial({ color: 0x8f5243, roughness: 0.78 });
  const timberMat = new THREE.MeshStandardMaterial({ color: 0x3b2a1e, roughness: 0.45 });
  const awningMat = new THREE.MeshStandardMaterial({ color: 0x1e352f, roughness: 0.65 });
  const brassMat = new THREE.MeshStandardMaterial({
    color: 0xd8b45a,
    roughness: 0.24,
    metalness: 0.88,
  });

  // Ground-floor left & right grand piers leaving a wide 1.8m openable lobby doorway!
  for (const px of [-2.45, 2.45]) {
    const pier = new THREE.Mesh(new THREE.BoxGeometry(3.1, 3.6, 3.2), limestoneMat);
    pier.position.set(px, 1.8, -1.5);
    pier.castShadow = true;
    pier.receiveShadow = true;
    loftPortalGroup.add(pier);
  }
  // Upper Hotel Tower (Floors 2-4 + Rooftop Crown)
  const hotelUpper = new THREE.Mesh(new THREE.BoxGeometry(8.2, 11.4, 3.4), brickMat);
  hotelUpper.position.set(0, 9.2, -1.6);
  hotelUpper.castShadow = true;
  hotelUpper.receiveShadow = true;
  loftPortalGroup.add(hotelUpper);

  const hotelCornice = new THREE.Mesh(new THREE.BoxGeometry(8.6, 0.55, 3.7), limestoneMat);
  hotelCornice.position.set(0, 15.05, -1.6);
  loftPortalGroup.add(hotelCornice);

  // Warm illuminated hotel suite windows across Floors 2-4
  const suiteWinMat = new THREE.MeshStandardMaterial({
    color: 0xffe8b8,
    emissive: 0xffc878,
    emissiveIntensity: 0.45,
    roughness: 0.2,
  });
  for (let floor = 0; floor < 3; floor++) {
    for (const wx of [-2.8, -1.0, 1.0, 2.8]) {
      const win = new THREE.Mesh(new THREE.BoxGeometry(1.15, 1.65, 0.1), suiteWinMat);
      win.position.set(wx, 5.2 + floor * 3.3, 0.1);
      loftPortalGroup.add(win);
    }
  }

  // Grand Hotel Marquee Sign above entrance canopy
  const marqueeCanvas = document.createElement('canvas');
  marqueeCanvas.width = 512;
  marqueeCanvas.height = 96;
  const mctx = marqueeCanvas.getContext('2d')!;
  mctx.fillStyle = '#090d0b';
  mctx.fillRect(0, 0, 512, 96);
  mctx.strokeStyle = '#39ff14';
  mctx.lineWidth = 6;
  mctx.strokeRect(5, 5, 502, 86);
  mctx.fillStyle = '#39ff14';
  mctx.font = 'bold 34px sans-serif';
  mctx.textAlign = 'center';
  mctx.fillText('LOFTLIFE GRAND HOTEL', 256, 58);
  const marqueeTex = new THREE.CanvasTexture(marqueeCanvas);
  marqueeTex.colorSpace = THREE.SRGBColorSpace;
  marqueeTex.anisotropy = maxAnisotropy;

  const marqueeMesh = new THREE.Mesh(
    new THREE.BoxGeometry(4.4, 0.8, 0.25),
    new THREE.MeshStandardMaterial({ map: marqueeTex, roughness: 0.35 })
  );
  marqueeMesh.position.set(0, 3.3, 0.32);
  loftPortalGroup.add(marqueeMesh);

  // Warm interior lobby vestibule glow behind entrance doors
  const lobbyBack = new THREE.Mesh(
    new THREE.BoxGeometry(2.05, 2.55, 0.15),
    new THREE.MeshStandardMaterial({
      color: 0xffe4b8,
      emissive: 0xffc570,
      emissiveIntensity: 0.65,
      roughness: 0.5,
    })
  );
  lobbyBack.position.set(0, 1.28, -1.25);
  loftPortalGroup.add(lobbyBack);

  // Openable Glass Double Doors (Left & Right Pivots)
  const doorGlassMat = new THREE.MeshPhysicalMaterial({
    color: 0xdff2ff,
    roughness: 0.1,
    metalness: 0.1,
    transparent: true,
    opacity: 0.55,
  });
  const loftDoorLeftPivot = new THREE.Group();
  loftDoorLeftPivot.position.set(-0.9, 0, 0.08);
  const leftFrame = new THREE.Mesh(new THREE.BoxGeometry(0.88, 2.4, 0.08), timberMat);
  leftFrame.position.set(0.44, 1.2, 0);
  loftDoorLeftPivot.add(leftFrame);
  const leftGlass = new THREE.Mesh(new THREE.BoxGeometry(0.66, 1.95, 0.1), doorGlassMat);
  leftGlass.position.set(0.44, 1.22, 0);
  loftDoorLeftPivot.add(leftGlass);
  const leftHandle = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.42, 0.12), brassMat);
  leftHandle.position.set(0.78, 1.08, 0.05);
  loftDoorLeftPivot.add(leftHandle);
  loftPortalGroup.add(loftDoorLeftPivot);

  const loftDoorRightPivot = new THREE.Group();
  loftDoorRightPivot.position.set(0.9, 0, 0.08);
  const rightFrame = new THREE.Mesh(new THREE.BoxGeometry(0.88, 2.4, 0.08), timberMat);
  rightFrame.position.set(-0.44, 1.2, 0);
  loftDoorRightPivot.add(rightFrame);
  const rightGlass = new THREE.Mesh(new THREE.BoxGeometry(0.66, 1.95, 0.1), doorGlassMat);
  rightGlass.position.set(-0.44, 1.22, 0);
  loftDoorRightPivot.add(rightGlass);
  const rightHandle = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.42, 0.12), brassMat);
  rightHandle.position.set(-0.78, 1.08, 0.05);
  loftDoorRightPivot.add(rightHandle);
  loftPortalGroup.add(loftDoorRightPivot);

  // Brass & Obsidian Keycard + Guest Directory Intercom Pedestal right beside Main Doors
  const intercomGroup = new THREE.Group();
  intercomGroup.position.set(1.38, 0, 0.58);
  intercomGroup.userData.isHotelIntercom = true;

  const kioskPost = new THREE.Mesh(
    new THREE.BoxGeometry(0.24, 1.18, 0.18),
    new THREE.MeshStandardMaterial({ color: 0x1e222a, roughness: 0.32, metalness: 0.72 })
  );
  kioskPost.position.y = 0.59;
  kioskPost.castShadow = true;
  intercomGroup.add(kioskPost);

  const kioskScreen = new THREE.Mesh(
    new THREE.BoxGeometry(0.19, 0.24, 0.03),
    new THREE.MeshStandardMaterial({
      color: 0x39ff14,
      emissive: 0x39ff14,
      emissiveIntensity: 0.85,
      roughness: 0.2,
    })
  );
  kioskScreen.position.set(0, 1.0, 0.095);
  intercomGroup.add(kioskScreen);

  const mainDoorLedMat = new THREE.MeshStandardMaterial({
    color: 0xf59e0b,
    emissive: 0xf59e0b,
    emissiveIntensity: 1.5,
    roughness: 0.2,
  });
  const kioskLed = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.04, 0.04), mainDoorLedMat);
  kioskLed.position.set(0, 1.15, 0.095);
  intercomGroup.add(kioskLed);
  loftPortalGroup.add(intercomGroup);

  // Canopy Awning & Red Carpet Runner
  const awning = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.16, 1.55), awningMat);
  awning.position.set(0, 2.68, 0.72);
  awning.rotation.x = 0.1;
  loftPortalGroup.add(awning);

  const entryMat = new THREE.Mesh(
    new THREE.BoxGeometry(1.8, 0.03, 1.4),
    new THREE.MeshStandardMaterial({
      color: 0x991b1b,
      roughness: 0.9,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    })
  );
  entryMat.position.set(0, 0.018, 0.78);
  loftPortalGroup.add(entryMat);

  worldGroup.add(loftPortalGroup);
  // Collide with left & right hotel facade piers & intercom pedestal so doorway is walk-through when unlocked!
  obstacles.push({ type: 'box', x: loftDoorPos.x - 2.45, z: loftDoorPos.z - 1.5, hw: 1.58, hd: 1.65 });
  obstacles.push({ type: 'box', x: loftDoorPos.x + 2.45, z: loftDoorPos.z - 1.5, hw: 1.58, hd: 1.65 });
  obstacles.push({ type: 'box', x: loftDoorPos.x + 1.38, z: loftDoorPos.z + 0.58, hw: 0.22, hd: 0.22 });

  // Dance Pad & DJ Booth in Plaza Corner
  const djX = loftCenter.x + 4.4;
  const djZ = loftCenter.z - 1.2;
  const danceTiles: THREE.MeshStandardMaterial[] = [];
  const danceColors = [0x39ff14, 0x00ff7f, 0x9eff14, 0x16e05b, 0x6bff3b];
  for (let gx = -1; gx <= 1; gx++) {
    for (let gz = -1; gz <= 1; gz++) {
      const mat = new THREE.MeshStandardMaterial({
        color: danceColors[(gx + gz + 4) % danceColors.length],
        emissive: danceColors[(gx + gz + 4) % danceColors.length],
        emissiveIntensity: 0.45,
        roughness: 0.25,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      });
      const tile = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.03, 0.82), mat);
      tile.position.set(djX + gx * 0.86, 0.135, djZ + 1.4 + gz * 0.86);
      worldGroup.add(tile);
      danceTiles.push(mat);
    }
  }

  const djDeckGroup = new THREE.Group();
  djDeckGroup.position.set(djX, 0.12, djZ - 0.2);
  djDeckGroup.userData.isDjDeck = true;
  const booth = new THREE.Mesh(
    new THREE.BoxGeometry(1.4, 0.94, 0.58),
    new THREE.MeshStandardMaterial({ color: 0x121814, roughness: 0.42, metalness: 0.35 })
  );
  booth.position.y = 0.47;
  djDeckGroup.add(booth);
  const speakerGlow = new THREE.Mesh(
    new THREE.BoxGeometry(1.1, 0.14, 0.05),
    new THREE.MeshStandardMaterial({
      color: 0x39ff14,
      emissive: 0x39ff14,
      emissiveIntensity: 1.4,
    })
  );
  speakerGlow.position.set(0, 0.54, 0.3);
  djDeckGroup.add(speakerGlow);
  worldGroup.add(djDeckGroup);
  obstacles.push({ type: 'box', x: djX, z: djZ - 0.2, hw: 0.8, hd: 0.4 });

  // 7. Animated City Visitors / NPCs walking across M St, N St, 15th St & Plaza
  const npcSpecs: {
    id: string;
    name: string;
    greeting: string;
    config: AvatarConfig;
    waypoints: { x: number; z: number }[];
    idleEmote: EmoteType;
  }[] = [
    {
      id: 'npc_aria',
      name: 'Aria',
      greeting: 'Welcome to Main City! Diagonal streets run A through Z and cross-streets run 1st through 30th!',
      config: {
        name: 'Aria',
        skinTone: '#e8b896',
        hairStyle: 'ponytail',
        hairColor: '#b55436',
        topStyle: 'blazer',
        topColor: '#c86b51',
        bottomColor: '#364152',
        shoeColor: '#eae4d8',
        accessory: 'glasses',
      },
      waypoints: [
        { x: fX - 2.3, z: fZ - 1.2 },
        { x: fX + 2.3, z: fZ - 1.2 },
        { x: fX + 2.3, z: fZ + 2.5 },
        { x: fX - 2.3, z: fZ + 2.5 },
      ],
      idleEmote: 'wave',
    },
    {
      id: 'npc_sora',
      name: 'Sora',
      greeting: 'Holding Shift lets you sprint down the diagonal avenues! Try exploring all the way to Z St!',
      config: {
        name: 'Sora',
        skinTone: '#f6d5be',
        hairStyle: 'buns',
        hairColor: '#7482b8',
        topStyle: 'hoodie',
        topColor: '#785874',
        bottomColor: '#26282e',
        shoeColor: '#d697a0',
        accessory: 'headphones',
      },
      waypoints: [
        { x: djX - 0.5, z: djZ + 1.2 },
        { x: djX + 0.6, z: djZ + 1.6 },
      ],
      idleEmote: 'dance',
    },
    {
      id: 'npc_leo',
      name: 'Leo',
      greeting: 'Your Loft Building sits right off M St & 15th St. Walk straight through the lobby doors anytime!',
      config: {
        name: 'Leo',
        skinTone: '#ae7248',
        hairStyle: 'afro',
        hairColor: '#2d2320',
        topStyle: 'turtleneck',
        topColor: '#eae4d8',
        bottomColor: '#c7b08e',
        shoeColor: '#32363f',
        accessory: 'none',
      },
      waypoints: [
        { x: uzToWorldX(uLines[12], zLines[14]), z: zLines[14] },
        { x: uzToWorldX(uLines[13], zLines[14]), z: zLines[14] },
        { x: uzToWorldX(uLines[13], zLines[15]), z: zLines[15] },
        { x: uzToWorldX(uLines[12], zLines[15]), z: zLines[15] },
      ],
      idleEmote: 'idle',
    },
    {
      id: 'npc_kai',
      name: 'Kai',
      greeting: 'Every block in the city has its own uneven shape because A–Z streets slant diagonally!',
      config: {
        name: 'Kai',
        skinTone: '#d3976d',
        hairStyle: 'spiky',
        hairColor: '#719178',
        topStyle: 'tee',
        topColor: '#456799',
        bottomColor: '#26282e',
        shoeColor: '#eae4d8',
        accessory: 'beanie',
      },
      waypoints: [
        { x: uzToWorldX(uLines[11], zLines[14]), z: zLines[14] },
        { x: uzToWorldX(uLines[11], zLines[15]), z: zLines[15] },
        { x: uzToWorldX(uLines[12], zLines[15]), z: zLines[15] },
      ],
      idleEmote: 'cheer',
    },
    {
      id: 'npc_nora',
      name: 'Nora',
      greeting: 'Press M to open the full A–Z / 1st–30th City Map and see your live GPS dot!',
      config: {
        name: 'Nora',
        skinTone: '#6f452d',
        hairStyle: 'bob',
        hairColor: '#2d2320',
        topStyle: 'hoodie',
        topColor: '#d49a45',
        bottomColor: '#556652',
        shoeColor: '#eae4d8',
        accessory: 'glasses',
      },
      waypoints: [
        { x: uzToWorldX(uLines[12], zLines[13]), z: zLines[13] },
        { x: uzToWorldX(uLines[14], zLines[13]), z: zLines[13] },
      ],
      idleEmote: 'idle',
    },
  ];

  const npcs: WorldNpc[] = npcSpecs.map((spec) => {
    const rig = createAvatarRig(spec.config);
    const start = spec.waypoints[0];
    rig.root.position.set(start.x, 0, start.z);
    rig.root.userData.npcId = spec.id;
    worldGroup.add(rig.root);
    return {
      id: spec.id,
      name: spec.name,
      greeting: spec.greeting,
      rig,
      x: start.x,
      z: start.z,
      yaw: 0,
      waypoints: spec.waypoints,
      wpIndex: 1 % spec.waypoints.length,
      waitTimer: 1.0 + Math.random() * 1.5,
      idleEmote: spec.idleEmote,
      greetTimer: 0,
    };
  });

  let partyMode = true;
  function togglePartyMode() {
    partyMode = !partyMode;
    return partyMode;
  }

  let mainDoorUnlocked = false;
  function setMainDoorUnlocked(unlocked: boolean) {
    mainDoorUnlocked = unlocked;
    const hex = unlocked ? 0x10b981 : 0xf59e0b;
    mainDoorLedMat.color.setHex(hex);
    mainDoorLedMat.emissive.setHex(hex);
  }
  function isMainDoorUnlocked() {
    return mainDoorUnlocked;
  }

  const loftDoorEntryPos = { x: loftDoorPos.x, z: loftDoorPos.z + 1.85 };
  const loftDoorThresholdPos = { x: loftDoorPos.x, z: loftDoorPos.z - 0.15 };

  function updateWorld(
    elapsed: number,
    delta: number,
    playerX: number,
    playerZ: number,
    mood: LightingMood
  ) {
    // 1. Fountain water droplets
    droplets.forEach((drop, idx) => {
      const phase = (elapsed * 0.95 + idx / droplets.length) % 1;
      const angle = (idx / droplets.length) * Math.PI * 2 + elapsed * 0.35;
      const radius = 0.1 + phase * 1.0;
      const height = 1.48 + Math.sin(phase * Math.PI) * 0.8 - phase * 0.8;
      drop.position.set(
        fX + Math.cos(angle) * radius,
        Math.max(0.42, height),
        fZ + Math.sin(angle) * radius
      );
    });

    // 2. Dance pad glow
    danceTiles.forEach((mat, idx) => {
      mat.emissiveIntensity = partyMode
        ? 0.45 + Math.max(0, Math.sin(elapsed * 5.2 + idx * 0.9)) * 0.85
        : 0.12;
    });
    speakerGlow.material.emissiveIntensity = partyMode
      ? 0.9 + Math.abs(Math.sin(elapsed * 6)) * 0.9
      : 0.15;

    // 3. Streetlamps & Hotel Suite Windows glow
    const nightBoost = mood === 'night' ? 1 : mood === 'golden' ? 0.5 : 0;
    lampGlobeMat.emissiveIntensity = 0.25 + nightBoost * 1.6;
    suiteWinMat.emissiveIntensity = 0.35 + nightBoost * 0.9;

    // 4. Auto-swing Hotel Main Double Doors only when UNLOCKED & player approaches!
    const doorDist = Math.hypot(playerX - loftDoorPos.x, playerZ - loftDoorPos.z);
    const targetDoorAngle = mainDoorUnlocked && doorDist < 2.6 ? 1.25 : 0;
    const dk = 1 - Math.exp(-9 * delta);
    loftDoorLeftPivot.rotation.y = THREE.MathUtils.lerp(
      loftDoorLeftPivot.rotation.y,
      -targetDoorAngle,
      dk
    );
    loftDoorRightPivot.rotation.y = THREE.MathUtils.lerp(
      loftDoorRightPivot.rotation.y,
      targetDoorAngle,
      dk
    );

    // 5. NPC strolling
    for (const npc of npcs) {
      let isMoving = false;
      let emote: EmoteType = npc.idleEmote;

      if (npc.greetTimer > 0) {
        npc.greetTimer -= delta;
        const targetYaw = Math.atan2(playerX - npc.x, playerZ - npc.z);
        let diff = ((targetYaw - npc.yaw + Math.PI) % (Math.PI * 2)) - Math.PI;
        if (diff < -Math.PI) diff += Math.PI * 2;
        npc.yaw += diff * (1 - Math.exp(-10 * delta));
        emote = 'wave';
      } else if (npc.waitTimer > 0) {
        npc.waitTimer -= delta;
      } else {
        const target = npc.waypoints[npc.wpIndex];
        const dx = target.x - npc.x;
        const dz = target.z - npc.z;
        const dist = Math.hypot(dx, dz);
        const speed = 1.55;

        if (dist < 0.16) {
          npc.wpIndex = (npc.wpIndex + 1) % npc.waypoints.length;
          npc.waitTimer = 1.8 + Math.random() * 2.2;
        } else {
          npc.x += (dx / dist) * speed * delta;
          npc.z += (dz / dist) * speed * delta;
          const targetYaw = Math.atan2(dx, dz);
          let diff = ((targetYaw - npc.yaw + Math.PI) % (Math.PI * 2)) - Math.PI;
          if (diff < -Math.PI) diff += Math.PI * 2;
          npc.yaw += diff * (1 - Math.exp(-8 * delta));
          isMoving = true;
          emote = 'walk';
        }
      }

      npc.rig.root.position.set(npc.x, 0.1, npc.z);
      npc.rig.root.rotation.y = npc.yaw;
      npc.rig.updateAnimation(emote, isMoving, elapsed + npc.id.length, delta, 0);
    }
  }

  return {
    worldGroup,
    groundRaycastPlane,
    loftPortalGroup,
    intercomGroup,
    loftDoorLeftPivot,
    loftDoorRightPivot,
    loftDoorEntryPos,
    loftDoorThresholdPos,
    djDeckGroup,
    seats,
    npcs,
    obstacles,
    updateWorld,
    togglePartyMode,
    setMainDoorUnlocked,
    isMainDoorUnlocked,
  };
}

export function isMainWorldPosWalkable(
  x: number,
  z: number,
  obstacles: WorldObstacle[],
  radius = 0.28,
  mainDoorOpen = true
): boolean {
  const u = worldToU(x, z);
  const { bounds, blocks, loftDoorPos } = CITY_LAYOUT;

  if (u < bounds.uMin || u > bounds.uMax || z < bounds.zMin || z > bounds.zMax) {
    return false;
  }

  if (
    !mainDoorOpen &&
    z < loftDoorPos.z + 0.5 &&
    z > loftDoorPos.z - 2.5 &&
    Math.abs(x - loftDoorPos.x) < 1.15
  ) {
    return false;
  }

  // Check central plaza prop obstacles
  for (const ob of obstacles) {
    if (ob.type === 'circle' && ob.r !== undefined) {
      if (Math.hypot(x - ob.x, z - ob.z) < ob.r + radius) return false;
    } else if (ob.type === 'box' && ob.hw !== undefined && ob.hd !== undefined) {
      if (Math.abs(x - ob.x) < ob.hw + radius && Math.abs(z - ob.z) < ob.hd + radius) {
        return false;
      }
    }
  }

  // Check building footprints (leaving 2.1m walkable sidewalk around every uneven block)
  for (const blk of blocks) {
    if (blk.kind !== 'building') continue;
    const bu0 = blk.uMin + 2.1 - radius;
    const bu1 = blk.uMax - 2.1 + radius;
    const bz0 = blk.zMin + 2.1 - radius;
    const bz1 = blk.zMax - 2.1 + radius;
    if (u > bu0 && u < bu1 && z > bz0 && z < bz1) {
      return false;
    }
  }

  return true;
}

export function getCityGroundY(x: number, z: number): number {
  const u = worldToU(x, z);
  const { blocks } = CITY_LAYOUT;
  for (const blk of blocks) {
    if (u >= blk.uMin && u <= blk.uMax && z >= blk.zMin && z <= blk.zMax) {
      return blk.kind === 'loft_plaza' ? 0.13 : 0.1;
    }
  }
  return 0;
}

