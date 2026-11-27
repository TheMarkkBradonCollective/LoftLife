import * as THREE from 'three';
import { createAvatarRig, type AvatarRig } from './avatar';
import {
  CITY_LAYOUT,
  CITY_SLOPE,
  DIAGONAL_LETTERS,
  HORIZONTAL_COUNT,
  M_STREET_INDEX,
  STREET_HIERARCHY,
  ordinalStreet,
  uzToWorldX,
  worldToU,
} from './cityLayout';
import { createCityTraffic } from './cityTraffic';
import { buildCityVenues } from './venueBuilder';
import { CITY_VENUES, type VenueInteractionPoint } from './venues';
import {
  createAsphaltTexture,
  createBuildingFacadeTextures,
  createSidewalkTexture,
} from './textures';
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

export interface CityCameraBox {
  u0: number;
  u1: number;
  z0: number;
  z1: number;
  y0: number;
  y1: number;
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
  /** Counters, racks and desks in the public destinations. */
  venueInteractions: VenueInteractionPoint[];
  /** Building shell boxes for every public destination (u/z space). */
  venueFootprints: ReturnType<typeof buildCityVenues>['occluders'];
  obstacles: WorldObstacle[];
  cameraOccluders: CityCameraBox[];
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
  uvs: number[];
  indices: number[];
}

function createAccumulator(): MeshAccumulator {
  return { positions: [], normals: [], uvs: [], indices: [] };
}

function pushQuadUV(
  acc: MeshAccumulator,
  p0: [number, number, number],
  p1: [number, number, number],
  p2: [number, number, number],
  p3: [number, number, number],
  uv0: [number, number],
  uv1: [number, number],
  uv2: [number, number],
  uv3: [number, number]
) {
  const base = acc.positions.length / 3;
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
  acc.uvs.push(...uv0, ...uv1, ...uv2, ...uv3);
  acc.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

function pushSlantedPrism(
  acc: MeshAccumulator,
  u0: number,
  u1: number,
  z0: number,
  z1: number,
  y0: number,
  y1: number,
  uvScaleU = 1,
  uvScaleV = 1,
  includeTop = true
) {
  const x00 = uzToWorldX(u0, z0);
  const x10 = uzToWorldX(u1, z0);
  const x11 = uzToWorldX(u1, z1);
  const x01 = uzToWorldX(u0, z1);

  const wSpan = (u1 - u0) / uvScaleU;
  const dSpan = (Math.hypot(x01 - x00, z1 - z0)) / uvScaleU;
  const hSpan = (y1 - y0) / uvScaleV;

  if (includeTop) {
    pushQuadUV(
      acc,
      [x01, y1, z1],
      [x11, y1, z1],
      [x10, y1, z0],
      [x00, y1, z0],
      [0, dSpan],
      [wSpan, dSpan],
      [wSpan, 0],
      [0, 0]
    );
  }
  // South (+Z)
  pushQuadUV(
    acc,
    [x01, y0, z1],
    [x11, y0, z1],
    [x11, y1, z1],
    [x01, y1, z1],
    [0, 0],
    [wSpan, 0],
    [wSpan, hSpan],
    [0, hSpan]
  );
  // North (-Z)
  pushQuadUV(
    acc,
    [x10, y0, z0],
    [x00, y0, z0],
    [x00, y1, z0],
    [x10, y1, z0],
    [0, 0],
    [wSpan, 0],
    [wSpan, hSpan],
    [0, hSpan]
  );
  // East (+U)
  pushQuadUV(
    acc,
    [x11, y0, z1],
    [x10, y0, z0],
    [x10, y1, z0],
    [x11, y1, z1],
    [0, 0],
    [dSpan, 0],
    [dSpan, hSpan],
    [0, hSpan]
  );
  // West (-U)
  pushQuadUV(
    acc,
    [x00, y0, z0],
    [x01, y0, z1],
    [x01, y1, z1],
    [x00, y1, z0],
    [0, 0],
    [dSpan, 0],
    [dSpan, hSpan],
    [0, hSpan]
  );
}

/** Appends only the top quad of a slanted box (zero side walls, ideal for lane markings & crosswalks) */
function pushSlantedTopQuad(
  acc: MeshAccumulator,
  u0: number,
  u1: number,
  z0: number,
  z1: number,
  y: number
) {
  const x00 = uzToWorldX(u0, z0);
  const x10 = uzToWorldX(u1, z0);
  const x11 = uzToWorldX(u1, z1);
  const x01 = uzToWorldX(u0, z1);
  pushQuadUV(
    acc,
    [x01, y, z1],
    [x11, y, z1],
    [x10, y, z0],
    [x00, y, z0],
    [0, 1],
    [1, 1],
    [1, 0],
    [0, 0]
  );
}

function finalizeAccumulator(acc: MeshAccumulator): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(acc.positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(acc.normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(acc.uvs, 2));
  geo.setIndex(acc.indices);
  geo.computeBoundingSphere();
  return geo;
}

function createSkyDome(): {
  mesh: THREE.Mesh;
  setMood: (mood: LightingMood) => void;
} {
  const uniforms = {
    uTopColor: { value: new THREE.Color(0x5b9bd5) },
    uHorizonColor: { value: new THREE.Color(0xdbeafe) },
    uSunColor: { value: new THREE.Color(0xfff7dc) },
    uSunDir: { value: new THREE.Vector3(-0.45, 0.55, 0.65).normalize() },
  };

  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms,
    vertexShader: `
      varying vec3 vWorldDir;
      void main() {
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldDir = normalize(position);
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: `
      uniform vec3 uTopColor;
      uniform vec3 uHorizonColor;
      uniform vec3 uSunColor;
      uniform vec3 uSunDir;
      varying vec3 vWorldDir;
      void main() {
        float h = clamp(vWorldDir.y, 0.0, 1.0);
        vec3 col = mix(uHorizonColor, uTopColor, pow(h, 0.55));
        float sunAmt = max(dot(normalize(vWorldDir), uSunDir), 0.0);
        col += uSunColor * pow(sunAmt, 24.0) * 0.45;
        col += uSunColor * smoothstep(0.996, 0.9992, sunAmt) * 0.95;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });

  const mesh = new THREE.Mesh(new THREE.SphereGeometry(520, 28, 18), skyMat);

  function setMood(mood: LightingMood) {
    if (mood === 'morning') {
      uniforms.uTopColor.value.set(0x4b89cc);
      uniforms.uHorizonColor.value.set(0xd7e7f5);
      uniforms.uSunColor.value.set(0xfff6d8);
      uniforms.uSunDir.value.set(-0.48, 0.52, 0.62).normalize();
    } else if (mood === 'golden') {
      uniforms.uTopColor.value.set(0x3a4870);
      uniforms.uHorizonColor.value.set(0xf5a97f);
      uniforms.uSunColor.value.set(0xffd082);
      uniforms.uSunDir.value.set(-0.72, 0.18, 0.55).normalize();
    } else {
      uniforms.uTopColor.value.set(0x070b18);
      uniforms.uHorizonColor.value.set(0x162038);
      uniforms.uSunColor.value.set(0xcbd5e1);
      uniforms.uSunDir.value.set(0.35, 0.48, -0.6).normalize();
    }
  }

  return { mesh, setMood };
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
    metalness: 0.78,
  });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 2.85, 8), poleMat);
  pole.position.y = 1.425;
  g.add(pole);

  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 96;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#0f3d21';
  ctx.fillRect(0, 0, 256, 96);
  ctx.strokeStyle = '#39ff14';
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
    new THREE.MeshStandardMaterial({ map: tex, roughness: 0.4 })
  );
  board.position.y = 2.72;
  g.add(board);
  return g;
}

function buildParkBench(): THREE.Group {
  const bench = new THREE.Group();
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x8c5c38, roughness: 0.56 });
  const ironMat = new THREE.MeshStandardMaterial({
    color: 0x22262e,
    roughness: 0.36,
    metalness: 0.76,
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

function buildBusShelter(maxAnisotropy: number): THREE.Group {
  const g = new THREE.Group();
  const steelMat = new THREE.MeshStandardMaterial({
    color: 0x20252d,
    roughness: 0.35,
    metalness: 0.75,
  });
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0xdff4ff,
    roughness: 0.08,
    transparent: true,
    opacity: 0.38,
  });

  // 2 Upright posts
  for (const px of [-1.4, 1.4]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.5, 10), steelMat);
    post.position.set(px, 1.25, -0.35);
    g.add(post);
  }
  // Curved/angled glass roof canopy
  const roof = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.09, 1.4), steelMat);
  roof.position.set(0, 2.52, 0.12);
  roof.rotation.x = 0.08;
  g.add(roof);

  // Back glass windscreen
  const backGlass = new THREE.Mesh(new THREE.BoxGeometry(2.7, 2.1, 0.04), glassMat);
  backGlass.position.set(0, 1.25, -0.35);
  g.add(backGlass);

  // Ad / Route Sign Board
  const signCanvas = document.createElement('canvas');
  signCanvas.width = 192;
  signCanvas.height = 384;
  const ctx = signCanvas.getContext('2d')!;
  ctx.fillStyle = '#09100c';
  ctx.fillRect(0, 0, 192, 384);
  ctx.strokeStyle = '#39ff14';
  ctx.lineWidth = 6;
  ctx.strokeRect(6, 6, 180, 372);
  ctx.fillStyle = '#39ff14';
  ctx.font = 'bold 28px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('LOFTLINE', 96, 74);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 24px sans-serif';
  ctx.fillText('BUS STOP', 96, 120);
  ctx.fillStyle = '#94a3b8';
  ctx.font = '18px sans-serif';
  ctx.fillText('15TH · M ST', 96, 200);
  const tex = new THREE.CanvasTexture(signCanvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;

  const totem = new THREE.Mesh(
    new THREE.BoxGeometry(0.14, 2.2, 0.95),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 0.35 })
  );
  totem.position.set(1.55, 1.2, 0.1);
  g.add(totem);

  // Waiting bench
  const benchSeat = new THREE.Mesh(
    new THREE.BoxGeometry(1.9, 0.07, 0.42),
    new THREE.MeshStandardMaterial({ color: 0x8c5c38, roughness: 0.6 })
  );
  benchSeat.position.set(-0.2, 0.48, -0.05);
  g.add(benchSeat);

  return g;
}

export function buildMainWorld(maxAnisotropy: number, isSoftwareGl: boolean): MainWorldHandles {
  const worldGroup = new THREE.Group();
  const obstacles: WorldObstacle[] = [];
  const seats: WorldSeatTarget[] = [];
  const cameraOccluders: CityCameraBox[] = [];

  const {
    uLines,
    zLines,
    uHalfWidths,
    zHalfWidths,
    uIsMajor,
    zIsMajor,
    uClasses,
    zClasses,
    blocks,
    bounds,
    signalIntersections,
    busStops,
    metroLineZ,
    waterfront,
    loftCenter,
    loftDoorPos,
    airportCenter,
    airportDoorPos,
    airportEntrancePos,
    clothingStoreCenter,
    clothingStoreDoorPos,
    salonPos,
  } = CITY_LAYOUT;

  // 0. Atmospheric Sky Dome
  const skyDome = createSkyDome();
  worldGroup.add(skyDome.mesh);

  // 1. Ground plate, river and district surface layers.
  const outerGround = new THREE.Mesh(
    new THREE.PlaneGeometry(1800, 1800),
    new THREE.MeshStandardMaterial({ color: 0x33402f, roughness: 0.97 })
  );
  outerGround.rotation.x = -Math.PI / 2;
  outerGround.position.y = -0.09;
  worldGroup.add(outerGround);

  const citySpanU = bounds.uMax - bounds.uMin + 24;
  const citySpanZ = bounds.zMax - bounds.zMin + 24;

  const asphaltTex = createAsphaltTexture(maxAnisotropy);
  const asphaltAcc = createAccumulator();
  pushSlantedPrism(
    asphaltAcc,
    bounds.uMin - 12,
    waterfront.uEdge,
    bounds.zMin - 14,
    bounds.zMax + 14,
    -0.07,
    0.0,
    12,
    12,
    true
  );
  const asphaltMesh = new THREE.Mesh(
    finalizeAccumulator(asphaltAcc),
    new THREE.MeshStandardMaterial({
      map: asphaltTex,
      roughness: 0.86,
      metalness: 0.04,
    })
  );
  asphaltMesh.receiveShadow = true;
  worldGroup.add(asphaltMesh);

  // The river runs the full length of the eastern edge beyond Z Street.
  const waterAcc = createAccumulator();
  pushSlantedTopQuad(
    waterAcc,
    waterfront.uEdge + 0.1,
    waterfront.uEdge + 320,
    waterfront.z0,
    waterfront.z1,
    waterfront.level
  );
  const riverMesh = new THREE.Mesh(
    finalizeAccumulator(waterAcc),
    new THREE.MeshPhysicalMaterial({
      color: 0x2f6f86,
      roughness: 0.16,
      metalness: 0.28,
      clearcoat: 0.9,
      transparent: true,
      opacity: 0.92,
    })
  );
  riverMesh.receiveShadow = true;
  worldGroup.add(riverMesh);

  // Stone river wall and promenade railing.
  const riverWallAcc = createAccumulator();
  pushSlantedPrism(
    riverWallAcc,
    waterfront.uEdge - 1.6,
    waterfront.uEdge + 0.1,
    waterfront.z0,
    waterfront.z1,
    -1.6,
    0.08,
    3,
    3,
    true
  );
  const riverWall = new THREE.Mesh(
    finalizeAccumulator(riverWallAcc),
    new THREE.MeshStandardMaterial({ color: 0x6f7168, roughness: 0.9 })
  );
  riverWall.receiveShadow = true;
  worldGroup.add(riverWall);

  // Invisible raycast plane covering the whole walkable city.
  const groundRaycastPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(citySpanU + 450, citySpanZ + 120),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  groundRaycastPlane.rotation.x = -Math.PI / 2;
  groundRaycastPlane.position.set(0, 0.02, 0);
  worldGroup.add(groundRaycastPlane);

  // 2. Street hierarchy markings: boulevard lanes, avenue turn lanes,
  //    residential parking bays, crosswalks and the M Street median.
  const yellowLineAcc = createAccumulator();
  const whiteLineAcc = createAccumulator();
  const medianCurbAcc = createAccumulator();
  const medianGreenAcc = createAccumulator();
  const treeCoords: { x: number; z: number; scale: number }[] = [];
  const lampCoords: { x: number; z: number; rotY: number }[] = [];
  const benchCoords: { x: number; z: number; rotY: number }[] = [];
  const planterCoords: { x: number; z: number; scale: number }[] = [];
  const shrubCoords: { x: number; z: number; scale: number }[] = [];
  const parkedCarCoords: { x: number; z: number; rotY: number; color: number }[] = [];
  const containerCoords: { x: number; z: number; rotY: number; color: number }[] = [];
  const waterTankCoords: { x: number; z: number; y: number; scale: number }[] = [];
  const playgroundAcc = createAccumulator();
  const plazaArtAcc = createAccumulator();
  const greenRoofAcc = createAccumulator();
  const balconyAcc = createAccumulator();
  const loadingDockAcc = createAccumulator();
  const stringLightCoords: { x: number; y: number; z: number }[] = [];
  const detailLineAcc = createAccumulator();

  const M_U = uLines[M_STREET_INDEX];
  const BOULEVARD_MEDIAN_HALF = 1.6;

  function dashAlongU(
    acc: MeshAccumulator,
    u: number,
    z0: number,
    z1: number,
    dash = 2.8,
    gap = 4.2,
    width = 0.12
  ) {
    for (let z = z0; z < z1 - 1.2; z += dash + gap) {
      pushSlantedTopQuad(acc, u - width / 2, u + width / 2, z, Math.min(z + dash, z1), 0.013);
    }
  }

  function dashAlongZ(
    acc: MeshAccumulator,
    z: number,
    u0: number,
    u1: number,
    dash = 2.8,
    gap = 4.2,
    width = 0.12
  ) {
    for (let u = u0; u < u1 - 1.2; u += dash + gap) {
      pushSlantedTopQuad(acc, u, Math.min(u + dash, u1), z - width / 2, z + width / 2, 0.013);
    }
  }

  for (let i = 0; i < DIAGONAL_LETTERS.length; i++) {
    const u = uLines[i];
    const hw = uHalfWidths[i];
    const cls = uClasses[i];

    for (let row = 0; row < HORIZONTAL_COUNT - 1; row++) {
      const zStart = zLines[row] + zHalfWidths[row] + 2.8;
      const zEnd = zLines[row + 1] - zHalfWidths[row + 1] - 2.8;
      if (zEnd <= zStart) continue;

      if (cls === 'boulevard') {
        // Four lanes each way with a planted median; lane separators + shoulder.
        for (const offset of [-5.3, -8.8, 5.3, 8.8]) {
          dashAlongU(whiteLineAcc, u + offset, zStart, zEnd, 3.0, 4.8);
        }
        for (const offset of [-12.3, 12.3]) {
          pushSlantedTopQuad(whiteLineAcc, u + offset - 0.07, u + offset + 0.07, zStart, zEnd, 0.013);
        }
      } else if (cls === 'avenue') {
        pushSlantedTopQuad(yellowLineAcc, u - 0.14, u - 0.04, zStart, zEnd, 0.012);
        pushSlantedTopQuad(yellowLineAcc, u + 0.04, u + 0.14, zStart, zEnd, 0.012);
        for (const offset of [-3.5, 3.5]) {
          dashAlongU(whiteLineAcc, u + offset, zStart, zEnd, 3.0, 5.0);
        }
      } else {
        pushSlantedTopQuad(yellowLineAcc, u - 0.12, u - 0.03, zStart, zEnd, 0.012);
        pushSlantedTopQuad(yellowLineAcc, u + 0.03, u + 0.12, zStart, zEnd, 0.012);
      }

      // Parallel parking bays on every street that allows kerbside parking.
      if (STREET_HIERARCHY[cls].parking) {
        for (const side of [-1, 1]) {
          const edge = u + side * (hw - 2.1);
          for (let z = zStart + 1.0; z < zEnd - 1.8; z += 6.2) {
            pushSlantedTopQuad(
              whiteLineAcc,
              edge - 2.0,
              edge - 1.9,
              z,
              z + 2.5,
              0.012
            );
          }
        }
      }
    }
  }

  for (let j = 0; j < HORIZONTAL_COUNT; j++) {
    const z = zLines[j];
    const hw = zHalfWidths[j];
    const cls = zClasses[j];

    for (let col = 0; col < DIAGONAL_LETTERS.length - 1; col++) {
      const uStart = uLines[col] + uHalfWidths[col] + 2.8;
      const uEnd = uLines[col + 1] - uHalfWidths[col + 1] - 2.8;
      if (uEnd <= uStart) continue;

      if (cls === 'avenue') {
        pushSlantedTopQuad(yellowLineAcc, uStart, uEnd, z - 0.14, z - 0.04, 0.012);
        pushSlantedTopQuad(yellowLineAcc, uStart, uEnd, z + 0.04, z + 0.14, 0.012);
        for (const offset of [-3.5, 3.5]) {
          dashAlongZ(whiteLineAcc, z + offset, uStart, uEnd, 3.0, 5.0);
        }
      } else if (cls !== 'boulevard') {
        pushSlantedTopQuad(yellowLineAcc, uStart, uEnd, z - 0.12, z - 0.03, 0.012);
        pushSlantedTopQuad(yellowLineAcc, uStart, uEnd, z + 0.03, z + 0.12, 0.012);
      }

      if (STREET_HIERARCHY[cls].parking) {
        for (const side of [-1, 1]) {
          const edge = z + side * (hw - 2.1);
          for (let u = uStart + 1.0; u < uEnd - 1.8; u += 6.2) {
            pushSlantedTopQuad(whiteLineAcc, u, u + 2.5, edge - 2.0, edge - 1.9, 0.012);
          }
        }
      }
    }
  }

  // Crosswalks and stop bars at every signalised junction.
  for (const sig of signalIntersections) {
    const { u, z, uHalfWidth, zHalfWidth } = sig;
    for (const dirZ of [-1, 1]) {
      const cz0 = z + dirZ * (zHalfWidth + 0.45);
      const cz1 = z + dirZ * (zHalfWidth + 2.35);
      const zMinC = Math.min(cz0, cz1);
      const zMaxC = Math.max(cz0, cz1);
      for (let su = -uHalfWidth + 0.9; su <= uHalfWidth - 1.3; su += 1.4) {
        pushSlantedTopQuad(whiteLineAcc, u + su, u + su + 0.68, zMinC, zMaxC, 0.014);
      }
      // Stop bar across the approaching lanes.
      const barZ = dirZ > 0 ? cz1 + 1.6 : cz1 - 1.8;
      pushSlantedTopQuad(
        whiteLineAcc,
        u - uHalfWidth + 0.6,
        u + uHalfWidth - 0.6,
        Math.min(barZ, barZ + 0.35),
        Math.max(barZ, barZ + 0.35),
        0.014
      );
    }
    for (const dirU of [-1, 1]) {
      const cu0 = u + dirU * (uHalfWidth + 0.45);
      const cu1 = u + dirU * (uHalfWidth + 2.35);
      const uMinC = Math.min(cu0, cu1);
      const uMaxC = Math.max(cu0, cu1);
      for (let sz = -zHalfWidth + 0.9; sz <= zHalfWidth - 1.3; sz += 1.4) {
        pushSlantedTopQuad(whiteLineAcc, uMinC, uMaxC, z + sz, z + sz + 0.68, 0.014);
      }
    }
  }

  // M Street's planted median: raised kerb, soil, trees and shrubs, with
  // turning bays left open at every signalised junction.
  for (let row = 0; row < HORIZONTAL_COUNT - 1; row++) {
    const zStart = zLines[row] + zHalfWidths[row] + 8.5;
    const zEnd = zLines[row + 1] - zHalfWidths[row + 1] - 8.5;
    if (zEnd - zStart < 8) continue;
    pushSlantedPrism(
      medianCurbAcc,
      M_U - BOULEVARD_MEDIAN_HALF - 0.25,
      M_U + BOULEVARD_MEDIAN_HALF + 0.25,
      zStart,
      zEnd,
      0.0,
      0.17,
      4,
      4,
      true
    );
    pushSlantedTopQuad(
      medianGreenAcc,
      M_U - BOULEVARD_MEDIAN_HALF,
      M_U + BOULEVARD_MEDIAN_HALF,
      zStart + 0.25,
      zEnd - 0.25,
      0.18
    );
    for (let z = zStart + 3.2; z <= zEnd - 2.4; z += 9.5) {
      treeCoords.push({ x: uzToWorldX(M_U, z), z, scale: 0.78 });
    }
    for (let z = zStart + 7.4; z <= zEnd - 2.0; z += 19) {
      shrubCoords.push({ x: uzToWorldX(M_U, z), z, scale: 0.7 });
    }
  }

  if (yellowLineAcc.positions.length > 0) {
    const yellowMesh = new THREE.Mesh(
      finalizeAccumulator(yellowLineAcc),
      new THREE.MeshBasicMaterial({ color: 0xeab308 })
    );
    worldGroup.add(yellowMesh);
  }
  if (whiteLineAcc.positions.length > 0) {
    const whiteMesh = new THREE.Mesh(
      finalizeAccumulator(whiteLineAcc),
      new THREE.MeshBasicMaterial({ color: 0xe2e8f0 })
    );
    worldGroup.add(whiteMesh);
  }
  const medianCurbMesh = new THREE.Mesh(
    finalizeAccumulator(medianCurbAcc),
    new THREE.MeshStandardMaterial({ color: 0xb8b2a4, roughness: 0.86 })
  );
  medianCurbMesh.receiveShadow = true;
  worldGroup.add(medianCurbMesh);
  const medianGreenMesh = new THREE.Mesh(
    finalizeAccumulator(medianGreenAcc),
    new THREE.MeshStandardMaterial({ color: 0x3f6b3d, roughness: 0.95 })
  );
  medianGreenMesh.receiveShadow = true;
  worldGroup.add(medianGreenMesh);

  // 3. Blocks: sidewalks, district architecture, parks, plazas, parking,
  //    waterfront promenades and industrial service yards.
  const sidewalkAcc = createAccumulator();
  const parkGrassAcc = createAccumulator();
  const plazaPavingAcc = createAccumulator();
  const parkingAcc = createAccumulator();
  const storefrontAcc = createAccumulator();
  const roofAcc = createAccumulator();
  const crownAcc = createAccumulator();
  const facadeAccs = Array.from({ length: 6 }, () => createAccumulator());

  function addCityBuilding(
    u0: number,
    u1: number,
    z0: number,
    z1: number,
    totalH: number,
    setbackH: number,
    styleIdx: number,
    hasCrown: boolean,
    district: string
  ) {
    if (u1 - u0 < 3.2 || z1 - z0 < 3.2) return;

    const commercial = district === 'downtown' || district === 'retail' || district === 'entertainment' || district === 'medical';
    const podiumTop = commercial ? 4.4 : district.startsWith('residential') ? 3.2 : 3.8;

    // Ground floor podium (retail frontage downtown, stoops in neighbourhoods).
    pushSlantedPrism(storefrontAcc, u0, u1, z0, z1, 0.14, podiumTop, 6, 4, true);

    const mainAcc = facadeAccs[styleIdx % facadeAccs.length];
    pushSlantedPrism(mainAcc, u0 + 0.12, u1 - 0.12, z0 + 0.12, z1 - 0.12, podiumTop, totalH, 10, 9, false);
    pushSlantedTopQuad(roofAcc, u0 + 0.12, u1 - 0.12, z0 + 0.12, z1 - 0.12, totalH);
    cameraOccluders.push({ u0, u1, z0, z1, y0: 0, y1: totalH });

    let topY = totalH;
    let topU0 = u0 + 0.12;
    let topU1 = u1 - 0.12;
    let topZ0 = z0 + 0.12;
    let topZ1 = z1 - 0.12;

    if (setbackH > 2 && u1 - u0 > 8 && z1 - z0 > 8) {
      const insetU = (u1 - u0) * 0.18;
      const insetZ = (z1 - z0) * 0.18;
      topU0 = u0 + insetU;
      topU1 = u1 - insetU;
      topZ0 = z0 + insetZ;
      topZ1 = z1 - insetZ;
      topY = totalH + setbackH;
      pushSlantedPrism(mainAcc, topU0, topU1, topZ0, topZ1, totalH, topY, 10, 9, false);
      pushSlantedTopQuad(roofAcc, topU0, topU1, topZ0, topZ1, topY);
      cameraOccluders.push({ u0: topU0, u1: topU1, z0: topZ0, z1: topZ1, y0: totalH, y1: topY });
    }

    if (hasCrown && topU1 - topU0 > 4 && topZ1 - topZ0 > 4) {
      const cu0 = topU0 + (topU1 - topU0) * 0.24;
      const cu1 = topU1 - (topU1 - topU0) * 0.24;
      const cz0 = topZ0 + (topZ1 - topZ0) * 0.24;
      const cz1 = topZ1 - (topZ1 - topZ0) * 0.24;
      pushSlantedPrism(crownAcc, cu0, cu1, cz0, cz1, topY, topY + 3.0, 5, 5, true);
    }

    // Balcony bands on residential blocks give the street a human scale.
    if (district.startsWith('residential') || district === 'luxury') {
      const bands = district === 'luxury' ? 3 : 2;
      for (let b = 0; b < bands; b++) {
        const y = podiumTop + 2.4 + b * 3.2;
        if (y > totalH - 2.0) break;
        pushSlantedPrism(balconyAcc, u0 - 0.28, u1 + 0.28, z0 - 0.28, z1 + 0.28, y, y + 0.12, 4, 4, true);
      }
    }

    // Rooftop water tanks are a New York-style silhouette detail.
    if (district.startsWith('residential') && totalH < 40 && (topU1 - topU0) > 5) {
      waterTankCoords.push({
        x: uzToWorldX((topU0 + topU1) / 2, (topZ0 + topZ1) / 2),
        z: (topZ0 + topZ1) / 2,
        y: topY + 1.3,
        scale: 1,
      });
    }

    // Green roofs for the newest downtown and luxury towers.
    if ((district === 'downtown' || district === 'luxury') && totalH > 45) {
      pushSlantedTopQuad(
        greenRoofAcc,
        topU0 + 1.0,
        topU1 - 1.0,
        topZ0 + 1.0,
        topZ1 - 1.0,
        topY + 0.03
      );
    }
  }

  function addIndustrialBuilding(blk: (typeof blocks)[number]) {
    const inset = blk.sidewalk + blk.setback + 1.4;
    const yard = 7.0;
    const u0 = blk.uMin + inset;
    const u1 = blk.uMax - inset;
    const z0 = blk.zMin + inset;
    const z1 = blk.zMax - inset - yard;
    if (u1 - u0 < 6 || z1 - z0 < 6) return;
    const h = blk.height;
    const acc = facadeAccs[3];
    pushSlantedPrism(acc, u0, u1, z0, z1, 0.14, h, 10, 6, false);
    pushSlantedTopQuad(roofAcc, u0, u1, z0, z1, h);
    // Saw-tooth roof lights.
    const teeth = Math.max(2, Math.floor((u1 - u0) / 7));
    for (let t = 0; t < teeth; t += 1) {
      const tu = u0 + 2.0 + (t * (u1 - u0 - 4.0)) / Math.max(1, teeth - 1);
      pushSlantedPrism(acc, tu - 1.6, tu + 1.6, z0 + 1.2, z1 - 1.2, h, h + 1.3, 5, 5, true);
    }
    // Loading dock canopy and roll-up doors facing the street.
    const dockZ = z0 - 1.9;
    pushSlantedPrism(
      loadingDockAcc,
      u0 + 1.0,
      u1 - 1.0,
      dockZ,
      z0 + 0.4,
      4.2,
      4.55,
      3,
      3,
      true
    );
    for (let d = 0; d < 3; d += 1) {
      const du = u0 + 3.0 + d * 6.0;
      pushSlantedPrism(loadingDockAcc, du - 1.8, du + 1.8, z0 - 0.05, z0 + 0.8, 0.14, 3.8, 3, 3, true);
    }
    // Container yard in the reserved strip behind the shed.
    for (let c = 0; c < 4; c += 1) {
      const cu = u0 + 2.0 + c * 3.6;
      const cz = blk.zMax - 4.2;
      if (cu > u1 - 2.0) break;
      containerCoords.push({
        x: uzToWorldX(cu, cz),
        z: cz,
        rotY: 0,
        color: [0x9a4b3a, 0x2f6f86, 0xb08c3c, 0x3f6b52][c % 4],
      });
    }
    cameraOccluders.push({ u0, u1, z0, z1, y0: 0, y1: h + 1.3 });
  }

  function addPark(blk: (typeof blocks)[number]) {
    const { uMin, uMax, zMin, zMax } = blk;
    const width = uMax - uMin;
    const depth = zMax - zMin;
    const midU = (uMin + uMax) / 2;
    const midZ = (zMin + zMax) / 2;
    pushSlantedPrism(parkGrassAcc, uMin + 1.4, uMax - 1.4, zMin + 1.4, zMax - 1.4, 0.12, 0.16, 8, 8, true);
    // Perimeter walking path and a crossing path.
    const path = 1.9;
    pushSlantedPrism(plazaPavingAcc, uMin + 1.4, uMax - 1.4, zMin + 1.4, zMin + 1.4 + path, 0.14, 0.19, 5, 5, true);
    pushSlantedPrism(plazaPavingAcc, uMin + 1.4, uMax - 1.4, zMax - 1.4 - path, zMax - 1.4, 0.14, 0.19, 5, 5, true);
    pushSlantedPrism(plazaPavingAcc, uMin + 1.4, uMin + 1.4 + path, zMin + 1.4, zMax - 1.4, 0.14, 0.19, 5, 5, true);
    pushSlantedPrism(plazaPavingAcc, uMax - 1.4 - path, uMax - 1.4, zMin + 1.4, zMax - 1.4, 0.14, 0.19, 5, 5, true);
    pushSlantedPrism(plazaPavingAcc, midU - 1.2, midU + 1.2, zMin + 1.4, zMax - 1.4, 0.14, 0.19, 5, 5, true);

    const large = width > 34 && depth > 32;
    if (large) {
      // Pond with a stone rim and a small fountain jet.
      const pondU = midU - width * 0.18;
      const pondZ = midZ - depth * 0.12;
      const pond = new THREE.Mesh(
        new THREE.CylinderGeometry(5.2, 5.4, 0.34, 28),
        new THREE.MeshStandardMaterial({ color: 0x5b6f6a, roughness: 0.9 })
      );
      pond.position.set(uzToWorldX(pondU, pondZ), 0.18, pondZ);
      worldGroup.add(pond);
      const pondWater = new THREE.Mesh(
        new THREE.CylinderGeometry(4.8, 4.8, 0.2, 28),
        new THREE.MeshPhysicalMaterial({
          color: 0x4d94a8,
          roughness: 0.12,
          clearcoat: 0.9,
          transparent: true,
          opacity: 0.9,
        })
      );
      pondWater.position.set(uzToWorldX(pondU, pondZ), 0.36, pondZ);
      worldGroup.add(pondWater);
      obstacles.push({ type: 'circle', x: uzToWorldX(pondU, pondZ), z: pondZ, r: 5.4 });

      // Timber gazebo at the other corner.
      const gazeboU = midU + width * 0.22;
      const gazeboZ = midZ + depth * 0.2;
      const gazebo = new THREE.Group();
      gazebo.position.set(uzToWorldX(gazeboU, gazeboZ), 0.16, gazeboZ);
      const timber = new THREE.MeshStandardMaterial({ color: 0x7a5636, roughness: 0.72 });
      for (const [gx, gz] of [
        [-2.4, -2.4],
        [2.4, -2.4],
        [-2.4, 2.4],
        [2.4, 2.4],
      ]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.22, 3.0, 0.22), timber);
        post.position.set(gx, 1.5, gz);
        gazebo.add(post);
      }
      const gazeboRoof = new THREE.Mesh(new THREE.ConeGeometry(4.2, 1.5, 4), timber);
      gazeboRoof.position.y = 3.75;
      gazeboRoof.rotation.y = Math.PI / 4;
      gazebo.add(gazeboRoof);
      worldGroup.add(gazebo);
      obstacles.push({ type: 'box', x: uzToWorldX(gazeboU, gazeboZ), z: gazeboZ, hw: 2.8, hd: 2.8 });
    }

    // Playground corner with colourful equipment.
    const playU = uMax - 5.2;
    const playZ = zMax - 5.2;
    pushSlantedPrism(playgroundAcc, playU - 3.0, playU + 2.4, playZ - 2.6, playZ + 2.4, 0.18, 0.2, 2, 2, true);
    pushSlantedPrism(playgroundAcc, playU - 2.2, playU - 0.4, playZ - 2.4, playZ - 0.8, 0.2, 1.6, 2, 2, true);
    pushSlantedPrism(playgroundAcc, playU + 0.4, playU + 2.2, playZ - 2.4, playZ - 0.8, 0.2, 1.0, 2, 2, true);
    pushSlantedPrism(playgroundAcc, playU - 1.6, playU + 1.6, playZ + 1.4, playZ + 1.9, 0.2, 2.4, 2, 2, true);

    // Benches and trees around the park edges.
    for (const [u, z, rotY] of [
      [midU - 6, zMin + 4.0, 0],
      [midU + 6, zMin + 4.0, 0],
      [midU - 6, zMax - 4.0, Math.PI],
      [midU + 6, zMax - 4.0, Math.PI],
    ] as const) {
      benchCoords.push({ x: uzToWorldX(u, z), z, rotY });
    }
    const treeCount = large ? 10 : 5;
    for (let i = 0; i < treeCount; i += 1) {
      const angle = (i / treeCount) * Math.PI * 2;
      const tu = midU + Math.cos(angle) * width * 0.32;
      const tz = midZ + Math.sin(angle) * depth * 0.3;
      if (Math.abs(tu - midU) < 2.6) continue;
      treeCoords.push({ x: uzToWorldX(tu, tz), z: tz, scale: 1.05 + (i % 3) * 0.12 });
    }
  }

  function addParkingLot(blk: (typeof blocks)[number]) {
    const { uMin, uMax, zMin, zMax } = blk;
    pushSlantedPrism(parkingAcc, uMin + 0.6, uMax - 0.6, zMin + 0.6, zMax - 0.6, 0.0, 0.06, 10, 10, true);
    const midU = (uMin + uMax) / 2;
    const midZ = (zMin + zMax) / 2;
    // Two rows of stalls with a drive aisle between them.
    const stallWidth = 2.7;
    for (const side of [-1, 1]) {
      const rowU = midU + side * 5.2;
      for (let z = zMin + 3.0; z < zMax - 3.0; z += stallWidth) {
        pushSlantedTopQuad(detailLineAcc, rowU - 4.6, rowU + 4.6, z, z + 0.12, 0.07);
        if ((Math.round(z) / stallWidth) % 2 === 0) {
          parkedCarCoords.push({
            x: uzToWorldX(rowU, z + 1.35),
            z: z + 1.35,
            rotY: Math.PI / 2,
            color: [0x9aa4ad, 0x2f5a8a, 0x8f2d2d, 0xe6ebe7, 0x39465c][Math.abs(Math.round(z)) % 5],
          });
        }
      }
    }
    // Kiosk + lighting.
    const kioskU = uMax - 3.4;
    const kioskZ = zMax - 3.4;
    pushSlantedPrism(storefrontAcc, kioskU - 1.6, kioskU + 1.6, kioskZ - 1.6, kioskZ + 1.6, 0.06, 3.2, 4, 4, true);
    pushSlantedPrism(loadingDockAcc, kioskU - 2.0, kioskU + 2.0, kioskZ - 2.0, kioskZ + 2.0, 3.2, 3.4, 3, 3, true);
    for (const [lu, lz] of [
      [uMin + 3, zMin + 3],
      [uMax - 3, zMin + 3],
      [uMin + 3, zMax - 3],
    ] as const) {
      lampCoords.push({ x: uzToWorldX(lu, lz), z: lz, rotY: Math.PI / 2 });
    }
  }

  function addPlaza(blk: (typeof blocks)[number]) {
    const { uMin, uMax, zMin, zMax } = blk;
    const midU = (uMin + uMax) / 2;
    const midZ = (zMin + zMax) / 2;
    pushSlantedPrism(plazaPavingAcc, uMin + 0.8, uMax - 0.8, zMin + 0.8, zMax - 0.8, 0.12, 0.17, 6, 6, true);
    // Public art plinth and sculpture.
    pushSlantedPrism(plazaArtAcc, midU - 1.1, midU + 1.1, midZ - 1.1, midZ + 1.1, 0.17, 1.1, 3, 3, true);
    pushSlantedPrism(plazaArtAcc, midU - 0.45, midU + 0.45, midZ - 0.45, midZ + 0.45, 1.1, 4.4, 3, 3, true);
    pushSlantedPrism(plazaArtAcc, midU - 1.5, midU + 1.5, midZ - 0.18, midZ + 0.18, 3.4, 3.9, 3, 3, true);
    obstacles.push({ type: 'box', x: uzToWorldX(midU, midZ), z: midZ, hw: 1.4, hd: 1.4 });
    // Planters and benches around the square.
    for (const [du, dz, rotY] of [
      [0, -3.6, Math.PI],
      [0, 3.6, 0],
      [-4.0, 0, Math.PI / 2],
      [4.0, 0, -Math.PI / 2],
    ] as const) {
      const u = midU + du;
      const z = midZ + dz;
      benchCoords.push({ x: uzToWorldX(u, z), z, rotY });
      planterCoords.push({ x: uzToWorldX(u - 2.2, z - 1.6), z: z - 1.6, scale: 1 });
    }
    for (const corner of [
      [uMin + 3, zMin + 3],
      [uMax - 3, zMin + 3],
      [uMin + 3, zMax - 3],
      [uMax - 3, zMax - 3],
    ] as const) {
      treeCoords.push({ x: uzToWorldX(corner[0], corner[1]), z: corner[1], scale: 0.95 });
    }
  }

  function addPromenade(blk: (typeof blocks)[number]) {
    const { uMin, uMax, zMin, zMax } = blk;
    const midU = (uMin + uMax) / 2;
    pushSlantedPrism(plazaPavingAcc, uMin, uMax, zMin, zMax, 0.14, 0.17, 5, 5, true);
    // Planted centre line with benches facing the water or the shops.
    const facingWater = uMax > waterfront.uEdge - 40;
    for (let z = zMin + 4; z < zMax - 2; z += 7.5) {
      treeCoords.push({ x: uzToWorldX(midU, z), z, scale: 0.9 });
      benchCoords.push({
        x: uzToWorldX(facingWater ? uMax - 3.6 : midU, z + 2.6),
        z: z + 2.6,
        rotY: facingWater ? -Math.PI / 2 : Math.PI,
      });
    }
    for (let z = zMin + 6; z < zMax - 4; z += 10) {
      stringLightCoords.push({ x: uzToWorldX(midU + 2.2, z), y: 3.6, z });
      stringLightCoords.push({ x: uzToWorldX(midU - 2.2, z), y: 3.6, z });
    }
    // Market promenade gets stalls; the river esplanade gets a railing.
    if (!facingWater) {
      for (let s = 0; s < 3; s += 1) {
        const su = uMin + 4.0 + s * 6.4;
        const sz = zMax - 4.0;
        pushSlantedPrism(storefrontAcc, su - 2.0, su + 2.0, sz - 1.4, sz + 1.4, 0.17, 2.6, 3, 3, true);
        pushSlantedPrism(loadingDockAcc, su - 2.5, su + 2.5, sz - 1.8, sz + 1.8, 2.6, 2.8, 3, 3, true);
      }
    }
  }

  for (const blk of blocks) {
    if (blk.kind === 'park') {
      addPark(blk);
      continue;
    }
    if (blk.kind === 'parking') {
      addParkingLot(blk);
      continue;
    }
    if (blk.kind === 'plaza') {
      addPlaza(blk);
      continue;
    }
    if (blk.kind === 'promenade') {
      addPromenade(blk);
      continue;
    }

    // Every built block rests on a continuous raised sidewalk.
    pushSlantedPrism(
      sidewalkAcc,
      blk.uMin,
      blk.uMax,
      blk.zMin,
      blk.zMax,
      0.0,
      blk.walkHeight,
      6,
      6,
      true
    );

    if (blk.kind === 'loft_plaza') {
      pushSlantedPrism(
        plazaPavingAcc,
        blk.uMin + 0.4,
        blk.uMax - 0.4,
        blk.zMin + 0.4,
        blk.zMax - 0.4,
        blk.walkHeight,
        blk.walkHeight + 0.03,
        6,
        6,
        true
      );
      for (const [du, dz] of [
        [-0.34, -0.34],
        [0.34, -0.34],
        [-0.34, 0.34],
        [0.34, 0.34],
      ] as const) {
        treeCoords.push({
          x: uzToWorldX((blk.uMin + blk.uMax) / 2 + (blk.uMax - blk.uMin) * du, (blk.zMin + blk.zMax) / 2 + (blk.zMax - blk.zMin) * dz),
          z: (blk.zMin + blk.zMax) / 2 + (blk.zMax - blk.zMin) * dz,
          scale: 1.0,
        });
      }
      continue;
    }

    if (blk.kind === 'venue' || blk.kind === 'loft_hotel' || blk.kind === 'airport' || blk.kind === 'clothing_store') {
      // These landmarks build their own facades, forecourts and landscaping.
      continue;
    }

    // Ordinary city block: one or two buildings behind the sidewalk.
    const inset = blk.sidewalk + blk.setback;
    const bu0 = blk.uMin + inset;
    const bu1 = blk.uMax - inset;
    const bz0 = blk.zMin + inset;
    const bz1 = blk.zMax - inset;

    if (blk.district === 'industrial') {
      addIndustrialBuilding(blk);
    } else if (blk.subSplit === 'split_u' && bu1 - bu0 > 13) {
      const midU = (bu0 + bu1) / 2;
      addCityBuilding(bu0, midU - 0.7, bz0, bz1, blk.height, blk.setbackHeight, blk.facadeStyle, blk.hasTowerCrown, blk.district);
      addCityBuilding(midU + 0.7, bu1, bz0, bz1, Math.max(8, blk.height * 0.76), 0, (blk.facadeStyle + 2) % 6, false, blk.district);
    } else if (blk.subSplit === 'split_z' && bz1 - bz0 > 13) {
      const midZ = (bz0 + bz1) / 2;
      addCityBuilding(bu0, bu1, bz0, midZ - 0.7, blk.height, blk.setbackHeight, blk.facadeStyle, blk.hasTowerCrown, blk.district);
      addCityBuilding(bu0, bu1, midZ + 0.7, bz1, Math.max(8, blk.height * 0.8), 0, (blk.facadeStyle + 3) % 6, false, blk.district);
    } else {
      addCityBuilding(bu0, bu1, bz0, bz1, blk.height, blk.setbackHeight, blk.facadeStyle, blk.hasTowerCrown, blk.district);
    }

    // Street trees and lamps scale with the district.
    const dist = CITY_LAYOUT.districts.find((d) => d.id === blk.district)!;
    const spacing = dist.treeDensity >= 1.2 ? 11 : dist.treeDensity >= 0.8 ? 14 : 20;
    const treeEdgeU = blk.uMin + Math.max(1.0, blk.sidewalk * 0.45);
    for (let z = blk.zMin + 4.0; z < blk.zMax - 3.0; z += spacing) {
      if ((Math.round(z * 3) + blk.col) % 3 === 0) continue;
      treeCoords.push({ x: uzToWorldX(treeEdgeU, z), z, scale: 0.9 + ((blk.col + blk.row) % 3) * 0.08 });
    }
    if (dist.furniture > 0.8) {
      lampCoords.push({ x: uzToWorldX(blk.uMin + 1.2, blk.zMin + 1.2), z: blk.zMin + 1.2, rotY: 0 });
      lampCoords.push({ x: uzToWorldX(blk.uMax - 1.2, blk.zMax - 1.2), z: blk.zMax - 1.2, rotY: Math.PI });
    } else {
      lampCoords.push({ x: uzToWorldX(blk.uMin + 1.2, blk.zMin + 1.2), z: blk.zMin + 1.2, rotY: 0 });
    }
    if (dist.furniture >= 1.4 && (blk.col + blk.row) % 3 === 0) {
      benchCoords.push({
        x: uzToWorldX(blk.uMax - 1.5, (blk.zMin + blk.zMax) / 2),
        z: (blk.zMin + blk.zMax) / 2,
        rotY: -Math.PI / 2,
      });
      planterCoords.push({
        x: uzToWorldX(blk.uMin + 1.6, blk.zMin + 1.6),
        z: blk.zMin + 1.6,
        scale: 1,
      });
    }
  }

  // Street furniture along the M Street boulevard frontage.
  for (let row = 0; row < HORIZONTAL_COUNT - 1; row++) {
    for (const side of [-1, 1]) {
      const u = M_U + side * (uHalfWidths[M_STREET_INDEX] + 2.2);
      for (let z = zLines[row] + 6; z < zLines[row + 1] - 6; z += 16) {
        planterCoords.push({ x: uzToWorldX(u, z), z, scale: 1.05 });
        if ((Math.round(z) + side) % 3 === 0) {
          benchCoords.push({ x: uzToWorldX(u + side * 1.4, z + 4.2), z: z + 4.2, rotY: side > 0 ? -Math.PI / 2 : Math.PI / 2 });
        }
      }
    }
  }

  // Riverfront railing along the esplanade.
  const railingAcc = createAccumulator();
  const railZ0 = zLines[10] - 4;
  const railZ1 = zLines[14] + 4;
  pushSlantedPrism(railingAcc, waterfront.uEdge - 1.0, waterfront.uEdge - 0.8, railZ0, railZ1, 0.95, 1.05, 2, 2, true);
  for (let z = railZ0; z <= railZ1; z += 3.4) {
    pushSlantedPrism(railingAcc, waterfront.uEdge - 1.02, waterfront.uEdge - 0.78, z - 0.06, z + 0.06, 0.17, 1.0, 2, 2, true);
  }

  // Surface meshes.
  const sidewalkTex = createSidewalkTexture(maxAnisotropy);
  const sidewalkMesh = new THREE.Mesh(
    finalizeAccumulator(sidewalkAcc),
    new THREE.MeshStandardMaterial({ map: sidewalkTex, roughness: 0.84, metalness: 0.02 })
  );
  sidewalkMesh.receiveShadow = true;
  worldGroup.add(sidewalkMesh);

  const parkGrassMesh = new THREE.Mesh(
    finalizeAccumulator(parkGrassAcc),
    new THREE.MeshStandardMaterial({ color: 0x4f7d4a, roughness: 0.94 })
  );
  parkGrassMesh.receiveShadow = true;
  worldGroup.add(parkGrassMesh);

  const plazaPavingMesh = new THREE.Mesh(
    finalizeAccumulator(plazaPavingAcc),
    new THREE.MeshStandardMaterial({ map: sidewalkTex, color: 0xd8cdb8, roughness: 0.82 })
  );
  plazaPavingMesh.receiveShadow = true;
  worldGroup.add(plazaPavingMesh);

  const parkingMesh = new THREE.Mesh(
    finalizeAccumulator(parkingAcc),
    new THREE.MeshStandardMaterial({ map: asphaltTex, color: 0x8d8f8a, roughness: 0.9 })
  );
  parkingMesh.receiveShadow = true;
  worldGroup.add(parkingMesh);

  if (detailLineAcc.positions.length > 0) {
    const detailLineMesh = new THREE.Mesh(
      finalizeAccumulator(detailLineAcc),
      new THREE.MeshBasicMaterial({ color: 0xe2e8f0 })
    );
    worldGroup.add(detailLineMesh);
  }

  if (storefrontAcc.positions.length > 0) {
    const sfMesh = new THREE.Mesh(
      finalizeAccumulator(storefrontAcc),
      new THREE.MeshStandardMaterial({ color: 0x1e242c, roughness: 0.32, metalness: 0.45 })
    );
    sfMesh.castShadow = true;
    sfMesh.receiveShadow = true;
    worldGroup.add(sfMesh);
  }

  if (roofAcc.positions.length > 0) {
    const roofMesh = new THREE.Mesh(
      finalizeAccumulator(roofAcc),
      new THREE.MeshStandardMaterial({ color: 0x626872, roughness: 0.9 })
    );
    roofMesh.receiveShadow = true;
    worldGroup.add(roofMesh);
  }

  if (loadingDockAcc.positions.length > 0) {
    const dockMesh = new THREE.Mesh(
      finalizeAccumulator(loadingDockAcc),
      new THREE.MeshStandardMaterial({ color: 0x59616a, roughness: 0.82, metalness: 0.16 })
    );
    dockMesh.castShadow = true;
    dockMesh.receiveShadow = true;
    worldGroup.add(dockMesh);
  }

  if (balconyAcc.positions.length > 0) {
    const balconyMesh = new THREE.Mesh(
      finalizeAccumulator(balconyAcc),
      new THREE.MeshStandardMaterial({ color: 0xb7ab98, roughness: 0.78 })
    );
    balconyMesh.castShadow = true;
    balconyMesh.receiveShadow = true;
    worldGroup.add(balconyMesh);
  }

  if (greenRoofAcc.positions.length > 0) {
    const greenRoofMesh = new THREE.Mesh(
      finalizeAccumulator(greenRoofAcc),
      new THREE.MeshStandardMaterial({ color: 0x4b7a4d, roughness: 0.92 })
    );
    greenRoofMesh.receiveShadow = true;
    worldGroup.add(greenRoofMesh);
  }

  if (plazaArtAcc.positions.length > 0) {
    const artMesh = new THREE.Mesh(
      finalizeAccumulator(plazaArtAcc),
      new THREE.MeshStandardMaterial({ color: 0xc9a95a, roughness: 0.42, metalness: 0.62 })
    );
    artMesh.castShadow = true;
    artMesh.receiveShadow = true;
    worldGroup.add(artMesh);
  }

  if (playgroundAcc.positions.length > 0) {
    const playMesh = new THREE.Mesh(
      finalizeAccumulator(playgroundAcc),
      new THREE.MeshStandardMaterial({ color: 0xd07a3a, roughness: 0.55 })
    );
    playMesh.castShadow = true;
    playMesh.receiveShadow = true;
    worldGroup.add(playMesh);
  }

  if (railingAcc.positions.length > 0) {
    const railingMesh = new THREE.Mesh(
      finalizeAccumulator(railingAcc),
      new THREE.MeshStandardMaterial({ color: 0x2f3740, roughness: 0.35, metalness: 0.8 })
    );
    worldGroup.add(railingMesh);
  }

  const facadeMaterials: THREE.MeshStandardMaterial[] = [];
  facadeAccs.forEach((acc, styleIdx) => {
    if (acc.positions.length === 0) return;
    const { map, emissiveMap, roughnessMap } = createBuildingFacadeTextures(styleIdx, maxAnisotropy);
    const mat = new THREE.MeshStandardMaterial({
      map,
      emissiveMap,
      emissive: new THREE.Color(0xffe4ad),
      emissiveIntensity: 0.25,
      roughnessMap,
      roughness: styleIdx === 0 || styleIdx === 3 || styleIdx === 5 ? 0.55 : 0.78,
      metalness: styleIdx === 0 || styleIdx === 5 ? 0.42 : 0.12,
    });
    facadeMaterials.push(mat);
    const m = new THREE.Mesh(finalizeAccumulator(acc), mat);
    m.castShadow = true;
    m.receiveShadow = true;
    worldGroup.add(m);
  });

  if (crownAcc.positions.length > 0) {
    const crownMesh = new THREE.Mesh(
      finalizeAccumulator(crownAcc),
      new THREE.MeshStandardMaterial({ color: 0x353b45, roughness: 0.55, metalness: 0.4 })
    );
    worldGroup.add(crownMesh);
  }

  // 4. Instanced trees, streetlights, benches, planters, parked cars,
  //    containers and rooftop water tanks.
  if (treeCoords.length > 0) {
    const trunkInst = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.14, 0.24, 2.2, 8),
      new THREE.MeshStandardMaterial({ color: 0x5c3e2a, roughness: 0.92 }),
      treeCoords.length
    );
    const canopyLower = new THREE.InstancedMesh(
      new THREE.SphereGeometry(1.15, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0x3e6e44, roughness: 0.85 }),
      treeCoords.length
    );
    const canopyUpper = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.88, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0x4d8252, roughness: 0.82 }),
      treeCoords.length
    );
    const dummy = new THREE.Object3D();
    treeCoords.forEach((tc, i) => {
      dummy.rotation.set(0, (i * 1.37) % Math.PI, 0);
      dummy.position.set(tc.x, 1.1 * tc.scale, tc.z);
      dummy.scale.setScalar(tc.scale);
      dummy.updateMatrix();
      trunkInst.setMatrixAt(i, dummy.matrix);

      dummy.position.set(tc.x, 2.65 * tc.scale, tc.z);
      dummy.scale.set(tc.scale * 1.1, tc.scale * 0.9, tc.scale * 1.1);
      dummy.updateMatrix();
      canopyLower.setMatrixAt(i, dummy.matrix);

      dummy.position.set(tc.x + 0.25 * tc.scale, 3.35 * tc.scale, tc.z - 0.15 * tc.scale);
      dummy.scale.setScalar(tc.scale);
      dummy.updateMatrix();
      canopyUpper.setMatrixAt(i, dummy.matrix);
    });
    trunkInst.computeBoundingSphere();
    canopyLower.computeBoundingSphere();
    canopyUpper.computeBoundingSphere();
    worldGroup.add(trunkInst, canopyLower, canopyUpper);
  }

  const lampGlobeMat = new THREE.MeshStandardMaterial({
    color: 0xfff8e6,
    emissive: 0xffd07a,
    emissiveIntensity: 0.35,
    roughness: 0.2,
  });
  if (lampCoords.length > 0) {
    const poleInst = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.055, 0.095, 4.6, 8),
      new THREE.MeshStandardMaterial({ color: 0x1e232b, roughness: 0.35, metalness: 0.78 }),
      lampCoords.length
    );
    const armInst = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.07, 0.08, 1.15),
      new THREE.MeshStandardMaterial({ color: 0x1e232b, roughness: 0.35, metalness: 0.78 }),
      lampCoords.length
    );
    const globeInst = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.24, 0.12, 0.42),
      lampGlobeMat,
      lampCoords.length
    );
    const dummy = new THREE.Object3D();
    lampCoords.forEach((lc, i) => {
      dummy.rotation.set(0, lc.rotY, 0);
      dummy.position.set(lc.x, 2.3, lc.z);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      poleInst.setMatrixAt(i, dummy.matrix);

      const offZ = Math.cos(lc.rotY) * 0.45;
      const offX = Math.sin(lc.rotY) * 0.45;
      dummy.position.set(lc.x + offX, 4.55, lc.z + offZ);
      dummy.updateMatrix();
      armInst.setMatrixAt(i, dummy.matrix);

      dummy.position.set(lc.x + offX * 1.9, 4.46, lc.z + offZ * 1.9);
      dummy.updateMatrix();
      globeInst.setMatrixAt(i, dummy.matrix);
    });
    poleInst.computeBoundingSphere();
    armInst.computeBoundingSphere();
    globeInst.computeBoundingSphere();
    worldGroup.add(poleInst, armInst, globeInst);
  }

  // Public benches (instanced seat/back/leg set) across parks and plazas.
  if (benchCoords.length > 0) {
    const seatMat = new THREE.MeshStandardMaterial({ color: 0x8c5c38, roughness: 0.62 });
    const ironMat = new THREE.MeshStandardMaterial({ color: 0x22262e, roughness: 0.4, metalness: 0.7 });
    const seatInst = new THREE.InstancedMesh(new THREE.BoxGeometry(1.5, 0.08, 0.46), seatMat, benchCoords.length);
    const backInst = new THREE.InstancedMesh(new THREE.BoxGeometry(1.5, 0.42, 0.07), seatMat, benchCoords.length);
    const legInst = new THREE.InstancedMesh(new THREE.BoxGeometry(0.09, 0.42, 0.42), ironMat, benchCoords.length);
    const legInst2 = new THREE.InstancedMesh(new THREE.BoxGeometry(0.09, 0.42, 0.42), ironMat, benchCoords.length);
    const dummy = new THREE.Object3D();
    benchCoords.forEach((bc, i) => {
      dummy.rotation.set(0, bc.rotY, 0);
      dummy.position.set(bc.x, 0.6, bc.z);
      dummy.updateMatrix();
      seatInst.setMatrixAt(i, dummy.matrix);
      dummy.position.set(bc.x - Math.sin(bc.rotY) * 0.2, 0.84, bc.z - Math.cos(bc.rotY) * 0.2);
      dummy.updateMatrix();
      backInst.setMatrixAt(i, dummy.matrix);
      dummy.position.set(bc.x + Math.cos(bc.rotY) * 0.6, 0.39, bc.z - Math.sin(bc.rotY) * 0.6);
      dummy.updateMatrix();
      legInst.setMatrixAt(i, dummy.matrix);
      dummy.position.set(bc.x - Math.cos(bc.rotY) * 0.6, 0.39, bc.z + Math.sin(bc.rotY) * 0.6);
      dummy.updateMatrix();
      legInst2.setMatrixAt(i, dummy.matrix);
    });
    [seatInst, backInst, legInst, legInst2].forEach((m) => {
      m.computeBoundingSphere();
      m.receiveShadow = true;
      worldGroup.add(m);
    });
  }

  if (planterCoords.length > 0) {
    const planterInst = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1.5, 0.55, 1.5),
      new THREE.MeshStandardMaterial({ color: 0x8b8578, roughness: 0.9 }),
      planterCoords.length
    );
    const plantInst = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(0.7, 1),
      new THREE.MeshStandardMaterial({ color: 0x467a4a, roughness: 0.9 }),
      planterCoords.length
    );
    const dummy = new THREE.Object3D();
    planterCoords.forEach((p, i) => {
      dummy.rotation.set(0, 0, 0);
      dummy.position.set(p.x, 0.44, p.z);
      dummy.scale.setScalar(p.scale);
      dummy.updateMatrix();
      planterInst.setMatrixAt(i, dummy.matrix);
      dummy.position.set(p.x, 0.95, p.z);
      dummy.scale.setScalar(p.scale * 1.1);
      dummy.updateMatrix();
      plantInst.setMatrixAt(i, dummy.matrix);
    });
    planterInst.computeBoundingSphere();
    plantInst.computeBoundingSphere();
    worldGroup.add(planterInst, plantInst);
  }

  if (shrubCoords.length > 0) {
    const shrubInst = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(0.8, 1),
      new THREE.MeshStandardMaterial({ color: 0x3c6841, roughness: 0.92 }),
      shrubCoords.length
    );
    const dummy = new THREE.Object3D();
    shrubCoords.forEach((s, i) => {
      dummy.position.set(s.x, 0.62, s.z);
      dummy.scale.setScalar(s.scale * 1.1);
      dummy.updateMatrix();
      shrubInst.setMatrixAt(i, dummy.matrix);
    });
    shrubInst.computeBoundingSphere();
    worldGroup.add(shrubInst);
  }

  if (parkedCarCoords.length > 0) {
    const bodyInst = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1.8, 0.72, 4.2),
      new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.35 }),
      parkedCarCoords.length
    );
    const cabinInst = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1.6, 0.55, 2.1),
      new THREE.MeshStandardMaterial({ color: 0x18242f, roughness: 0.15, metalness: 0.3 }),
      parkedCarCoords.length
    );
    bodyInst.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(parkedCarCoords.length * 3), 3);
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    parkedCarCoords.forEach((car, i) => {
      dummy.rotation.set(0, car.rotY, 0);
      dummy.position.set(car.x, 0.45, car.z);
      dummy.updateMatrix();
      bodyInst.setMatrixAt(i, dummy.matrix);
      bodyInst.setColorAt(i, color.setHex(car.color));
      dummy.position.set(car.x, 1.02, car.z);
      dummy.updateMatrix();
      cabinInst.setMatrixAt(i, dummy.matrix);
    });
    bodyInst.computeBoundingSphere();
    cabinInst.computeBoundingSphere();
    worldGroup.add(bodyInst, cabinInst);
  }

  if (containerCoords.length > 0) {
    const containerInst = new THREE.InstancedMesh(
      new THREE.BoxGeometry(2.6, 2.5, 6.2),
      new THREE.MeshStandardMaterial({ roughness: 0.7, metalness: 0.25 }),
      containerCoords.length
    );
    containerInst.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(containerCoords.length * 3), 3);
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    containerCoords.forEach((c, i) => {
      dummy.rotation.set(0, c.rotY, 0);
      dummy.position.set(c.x, 1.25, c.z);
      dummy.updateMatrix();
      containerInst.setMatrixAt(i, dummy.matrix);
      containerInst.setColorAt(i, color.setHex(c.color));
    });
    containerInst.computeBoundingSphere();
    worldGroup.add(containerInst);
  }

  if (waterTankCoords.length > 0) {
    const tankInst = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(1.05, 1.05, 2.2, 12),
      new THREE.MeshStandardMaterial({ color: 0x5b4b3a, roughness: 0.85 }),
      waterTankCoords.length
    );
    const roofInst = new THREE.InstancedMesh(
      new THREE.ConeGeometry(1.15, 0.75, 12),
      new THREE.MeshStandardMaterial({ color: 0x3f352b, roughness: 0.8 }),
      waterTankCoords.length
    );
    const dummy = new THREE.Object3D();
    waterTankCoords.forEach((t, i) => {
      dummy.position.set(t.x, t.y, t.z);
      dummy.scale.setScalar(t.scale);
      dummy.updateMatrix();
      tankInst.setMatrixAt(i, dummy.matrix);
      dummy.position.set(t.x, t.y + 1.45, t.z);
      dummy.updateMatrix();
      roofInst.setMatrixAt(i, dummy.matrix);
    });
    tankInst.computeBoundingSphere();
    roofInst.computeBoundingSphere();
    worldGroup.add(tankInst, roofInst);
  }

  if (stringLightCoords.length > 0) {
    const bulbInst = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.1, 8, 6),
      new THREE.MeshStandardMaterial({ color: 0xffe9a8, emissive: 0xffd27a, emissiveIntensity: 1.2 }),
      stringLightCoords.length
    );
    const dummy = new THREE.Object3D();
    stringLightCoords.forEach((p, i) => {
      dummy.position.set(p.x, p.y, p.z);
      dummy.updateMatrix();
      bulbInst.setMatrixAt(i, dummy.matrix);
    });
    bulbInst.computeBoundingSphere();
    worldGroup.add(bulbInst);
  }

  // 5. Working Traffic Signal Gantries at Major Intersections
  const ewRedMat = new THREE.MeshStandardMaterial({ color: 0x3b0a0a, emissive: 0xef4444, emissiveIntensity: 0 });
  const ewYellowMat = new THREE.MeshStandardMaterial({ color: 0x3b2a06, emissive: 0xf59e0b, emissiveIntensity: 0 });
  const ewGreenMat = new THREE.MeshStandardMaterial({ color: 0x063b14, emissive: 0x39ff14, emissiveIntensity: 1.5 });
  const nsRedMat = new THREE.MeshStandardMaterial({ color: 0x3b0a0a, emissive: 0xef4444, emissiveIntensity: 1.5 });
  const nsYellowMat = new THREE.MeshStandardMaterial({ color: 0x3b2a06, emissive: 0xf59e0b, emissiveIntensity: 0 });
  const nsGreenMat = new THREE.MeshStandardMaterial({ color: 0x063b14, emissive: 0x39ff14, emissiveIntensity: 0 });

  const signalDarkMat = new THREE.MeshStandardMaterial({
    color: 0x181c22,
    roughness: 0.38,
    metalness: 0.72,
  });

  if (signalIntersections.length > 0) {
    const count = signalIntersections.length * 2;
    const postInst = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.08, 0.11, 5.2, 8),
      signalDarkMat,
      count
    );
    const armInst = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.12, 0.14, 3.8),
      signalDarkMat,
      count
    );
    const boxInst = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.28, 0.76, 0.28),
      signalDarkMat,
      count
    );

    const bulbGeo = new THREE.SphereGeometry(0.085, 8, 8);
    const ewRInst = new THREE.InstancedMesh(bulbGeo, ewRedMat, signalIntersections.length);
    const ewYInst = new THREE.InstancedMesh(bulbGeo, ewYellowMat, signalIntersections.length);
    const ewGInst = new THREE.InstancedMesh(bulbGeo, ewGreenMat, signalIntersections.length);
    const nsRInst = new THREE.InstancedMesh(bulbGeo, nsRedMat, signalIntersections.length);
    const nsYInst = new THREE.InstancedMesh(bulbGeo, nsYellowMat, signalIntersections.length);
    const nsGInst = new THREE.InstancedMesh(bulbGeo, nsGreenMat, signalIntersections.length);

    const dummy = new THREE.Object3D();
    signalIntersections.forEach((sig, i) => {
      // Corner A (governs East-West 1st-30th traffic)
      const az = sig.z - sig.zHalfWidth - 0.5;
      const ax = uzToWorldX(sig.u - sig.uHalfWidth - 0.5, az);

      dummy.rotation.set(0, 0, 0);
      dummy.position.set(ax, 2.6, az);
      dummy.updateMatrix();
      postInst.setMatrixAt(i * 2, dummy.matrix);

      dummy.position.set(ax, 5.15, az + 1.85);
      dummy.updateMatrix();
      armInst.setMatrixAt(i * 2, dummy.matrix);

      dummy.position.set(ax, 5.1, az + 3.2);
      dummy.updateMatrix();
      boxInst.setMatrixAt(i * 2, dummy.matrix);

      dummy.position.set(ax, 5.32, az + 3.2);
      dummy.updateMatrix();
      ewRInst.setMatrixAt(i, dummy.matrix);
      dummy.position.set(ax, 5.1, az + 3.2);
      dummy.updateMatrix();
      ewYInst.setMatrixAt(i, dummy.matrix);
      dummy.position.set(ax, 4.88, az + 3.2);
      dummy.updateMatrix();
      ewGInst.setMatrixAt(i, dummy.matrix);

      // Corner B (governs Diagonal A-Z traffic)
      const bz = sig.z + sig.zHalfWidth + 0.5;
      const bx = uzToWorldX(sig.u + sig.uHalfWidth + 0.5, bz);
      dummy.rotation.set(0, Math.PI / 2, 0);
      dummy.position.set(bx, 2.6, bz);
      dummy.updateMatrix();
      postInst.setMatrixAt(i * 2 + 1, dummy.matrix);

      dummy.position.set(bx - 1.85, 5.15, bz);
      dummy.updateMatrix();
      armInst.setMatrixAt(i * 2 + 1, dummy.matrix);

      dummy.position.set(bx - 3.2, 5.1, bz);
      dummy.updateMatrix();
      boxInst.setMatrixAt(i * 2 + 1, dummy.matrix);

      dummy.position.set(bx - 3.2, 5.32, bz);
      dummy.updateMatrix();
      nsRInst.setMatrixAt(i, dummy.matrix);
      dummy.position.set(bx - 3.2, 5.1, bz);
      dummy.updateMatrix();
      nsYInst.setMatrixAt(i, dummy.matrix);
      dummy.position.set(bx - 3.2, 4.88, bz);
      dummy.updateMatrix();
      nsGInst.setMatrixAt(i, dummy.matrix);
    });

    [postInst, armInst, boxInst, ewRInst, ewYInst, ewGInst, nsRInst, nsYInst, nsGInst].forEach((im) => {
      im.computeBoundingSphere();
      worldGroup.add(im);
    });
  }

  // 6. Bus Stop Shelters along 15th St & M St
  for (const bs of busStops) {
    const shelter = buildBusShelter(maxAnisotropy);
    // Offset slightly onto sidewalk edge cleanly
    const sbZ = bs.z + (bs.rotY === Math.PI ? 1.2 : bs.rotY === 0 ? -1.2 : 0);
    const sbX = bs.x + (bs.rotY === Math.PI / 2 ? -1.2 : bs.rotY === -Math.PI / 2 ? 1.2 : 0);
    shelter.position.set(sbX, 0.14, sbZ);
    shelter.rotation.y = bs.rotY;
    worldGroup.add(shelter);
    obstacles.push({ type: 'box', x: sbX, z: sbZ, hw: 1.65, hd: 0.75 });
  }

  // 7. Elevated Metro Viaduct & Central M St Station along 16th St (metroLineZ)
  const viaductMinX = bounds.uMin + CITY_SLOPE * metroLineZ - 35;
  const viaductMaxX = bounds.uMax + CITY_SLOPE * metroLineZ + 35;
  const viaductLen = viaductMaxX - viaductMinX;
  const viaductMidX = (viaductMinX + viaductMaxX) / 2;

  const concreteViaductMat = new THREE.MeshStandardMaterial({
    color: 0x7c848e,
    roughness: 0.85,
    metalness: 0.05,
  });
  const railSteelMat = new THREE.MeshStandardMaterial({
    color: 0x334155,
    roughness: 0.35,
    metalness: 0.82,
  });

  // Elevated concrete deck girder (y = 5.85 .. 6.45, clear 5.85m above 16th St cars/buses!)
  const deck = new THREE.Mesh(
    new THREE.BoxGeometry(viaductLen, 0.75, 7.8),
    concreteViaductMat
  );
  deck.position.set(viaductMidX, 6.08, metroLineZ);
  deck.castShadow = true;
  deck.receiveShadow = true;
  worldGroup.add(deck);

  // Side concrete safety parapets
  for (const pz of [-3.75, 3.75]) {
    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(viaductLen, 0.65, 0.28),
      concreteViaductMat
    );
    wall.position.set(viaductMidX, 6.72, metroLineZ + pz);
    worldGroup.add(wall);
  }

  // Dual Eastbound & Westbound steel rail tracks
  for (const trackZ of [metroLineZ - 1.85, metroLineZ + 1.85]) {
    for (const rz of [-0.72, 0.72]) {
      const rail = new THREE.Mesh(
        new THREE.BoxGeometry(viaductLen, 0.14, 0.12),
        railSteelMat
      );
      rail.position.set(viaductMidX, 6.52, trackZ + rz);
      worldGroup.add(rail);
    }
  }

  // Viaduct median support piers placed safely between intersections (in street center median)
  const pierCoords: { x: number; z: number }[] = [];
  for (let col = 0; col < DIAGONAL_LETTERS.length - 1; col++) {
    const midU = (uLines[col] + uLines[col + 1]) / 2;
    const px = uzToWorldX(midU, metroLineZ);
    pierCoords.push({ x: px, z: metroLineZ });
    obstacles.push({ type: 'box', x: px, z: metroLineZ, hw: 0.72, hd: 0.72 });
  }
  if (pierCoords.length > 0) {
    const pierInst = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.55, 0.68, 5.75, 12),
      concreteViaductMat,
      pierCoords.length
    );
    const capInst = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1.4, 0.55, 6.8),
      concreteViaductMat,
      pierCoords.length
    );
    const dummy = new THREE.Object3D();
    pierCoords.forEach((pc, i) => {
      dummy.position.set(pc.x, 2.88, pc.z);
      dummy.updateMatrix();
      pierInst.setMatrixAt(i, dummy.matrix);

      dummy.position.set(pc.x, 5.65, pc.z);
      dummy.updateMatrix();
      capInst.setMatrixAt(i, dummy.matrix);
    });
    pierInst.computeBoundingSphere();
    capInst.computeBoundingSphere();
    worldGroup.add(pierInst, capInst);
  }

  // M St Elevated Metro Station platform right south of Loft Plaza!
  const stationX = uzToWorldX(uLines[12], metroLineZ);
  const stationCanopy = new THREE.Mesh(
    new THREE.BoxGeometry(28, 0.25, 10.6),
    new THREE.MeshStandardMaterial({ color: 0x161c24, roughness: 0.38, metalness: 0.65 })
  );
  stationCanopy.position.set(stationX, 9.9, metroLineZ);
  worldGroup.add(stationCanopy);
  const stationNeon = new THREE.Mesh(
    new THREE.BoxGeometry(28.1, 0.14, 10.7),
    new THREE.MeshStandardMaterial({ color: 0x39ff14, emissive: 0x39ff14, emissiveIntensity: 1.1 })
  );
  stationNeon.position.set(stationX, 9.8, metroLineZ);
  worldGroup.add(stationNeon);

  // 8. Street Name Signs around Central District & City Corners
  const signIntersections: [number, number][] = [
    [12, 14], // M St & 15th St
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
    const sz = zLines[row] - zHalfWidths[row] - 0.85;
    const sx = uzToWorldX(uLines[col] - uHalfWidths[col] - 0.85, sz);
    const sign = createStreetSignMesh(
      `${DIAGONAL_LETTERS[col]} St`,
      ordinalStreet(row + 1),
      maxAnisotropy
    );
    sign.position.set(sx, 0.14, sz);
    worldGroup.add(sign);
  }

  // 9. Central Loft Plaza Features (M-N St & 15th-16th St)
  const fX = loftCenter.x - 0.8;
  const fZ = loftCenter.z + 2.4;
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0xe6dfd3, roughness: 0.58 });
  const basinOuter = new THREE.Mesh(new THREE.CylinderGeometry(1.85, 2.0, 0.46, 28), stoneMat);
  basinOuter.position.set(fX, 0.37, fZ);
  basinOuter.castShadow = true;
  basinOuter.receiveShadow = true;
  worldGroup.add(basinOuter);

  const waterPool = new THREE.Mesh(
    new THREE.CylinderGeometry(1.6, 1.6, 0.34, 28),
    new THREE.MeshPhysicalMaterial({
      color: 0x38bdf8,
      roughness: 0.08,
      clearcoat: 1.0,
      transparent: true,
      opacity: 0.86,
    })
  );
  waterPool.position.set(fX, 0.4, fZ);
  worldGroup.add(waterPool);

  const fountainCol = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.38, 1.35, 16), stoneMat);
  fountainCol.position.set(fX, 0.84, fZ);
  worldGroup.add(fountainCol);

  const droplets: THREE.Mesh[] = [];
  const dropMat = new THREE.MeshStandardMaterial({
    color: 0xd0f4ff,
    emissive: 0x38bdf8,
    emissiveIntensity: 0.35,
    transparent: true,
    opacity: 0.85,
  });
  for (let i = 0; i < 12; i++) {
    const drop = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), dropMat);
    worldGroup.add(drop);
    droplets.push(drop);
  }
  obstacles.push({ type: 'circle', x: fX, z: fZ, r: 2.15 });

  // Sittable Park Benches near Fountain
  const benchOffsets: { dx: number; dz: number; rotY: number; ax: number; az: number }[] = [
    { dx: 0, dz: 3.65, rotY: Math.PI, ax: 0, az: 2.72 },
    { dx: 3.65, dz: 0, rotY: -Math.PI / 2, ax: 2.72, az: 0 },
    { dx: -3.65, dz: 0, rotY: Math.PI / 2, ax: -2.72, az: 0 },
  ];
  benchOffsets.forEach((bo, idx) => {
    const bx = fX + bo.dx;
    const bz = fZ + bo.dz;
    const b = buildParkBench();
    b.position.set(bx, 0.16, bz);
    b.rotation.y = bo.rotY;
    b.userData.worldSeatId = `plaza_bench_${idx}`;
    worldGroup.add(b);
    seats.push({
      id: `plaza_bench_${idx}`,
      label: 'Plaza Bench',
      mesh: b,
      seatPos: { x: bx, y: 0.58, z: bz },
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

  // 10. Upgraded Realistic LoftLife Grand Hotel Exterior Tower & Walk-Through Vestibule
  const loftPortalGroup = new THREE.Group();
  loftPortalGroup.position.set(loftDoorPos.x, 0.16, loftDoorPos.z);
  loftPortalGroup.userData.isLoftPortal = true;

  const limestoneMat = new THREE.MeshStandardMaterial({ color: 0xe3dacb, roughness: 0.65 });
  const hotelDarkMat = new THREE.MeshStandardMaterial({
    color: 0x1e242c,
    roughness: 0.3,
    metalness: 0.55,
  });
  const hotelTex = createBuildingFacadeTextures(0, maxAnisotropy);
  const hotelFacadeMat = new THREE.MeshStandardMaterial({
    map: hotelTex.map,
    emissiveMap: hotelTex.emissiveMap,
    emissive: new THREE.Color(0xffe5b0),
    emissiveIntensity: 0.45,
    roughnessMap: hotelTex.roughnessMap,
    roughness: 0.45,
    metalness: 0.35,
  });
  const brassMat = new THREE.MeshStandardMaterial({
    color: 0xd8b45a,
    roughness: 0.22,
    metalness: 0.88,
  });

  // Ground-floor left & right grand limestone piers leaving walk-through 2.0m doorway
  for (const px of [-3.35, 3.35]) {
    const pier = new THREE.Mesh(new THREE.BoxGeometry(4.5, 4.2, 4.4), limestoneMat);
    pier.position.set(px, 2.1, -2.0);
    pier.castShadow = true;
    pier.receiveShadow = true;
    loftPortalGroup.add(pier);

    // Ground storefront glass windows on each side of hotel entrance
    const storeWin = new THREE.Mesh(
      new THREE.BoxGeometry(3.2, 2.5, 0.12),
      new THREE.MeshStandardMaterial({
        color: 0xffe4b2,
        emissive: 0xffc875,
        emissiveIntensity: 0.42,
        roughness: 0.15,
      })
    );
    storeWin.position.set(px, 1.7, 0.22);
    loftPortalGroup.add(storeWin);
  }

  // Upper Hotel Tower: floors 2..7 (six residential storeys) over the lobby.
  // 3.4 m per storey plus the ground-floor lobby gives a believable 7-floor
  // landmark rather than the old four-storey block.
  const hotelUpper = new THREE.Mesh(new THREE.BoxGeometry(11.6, 20.5, 4.6), hotelFacadeMat);
  hotelUpper.position.set(0, 14.45, -2.1);
  hotelUpper.castShadow = true;
  hotelUpper.receiveShadow = true;
  loftPortalGroup.add(hotelUpper);

  // Balcony ledges mark each of the six residential floors.
  for (let floor = 0; floor < 6; floor++) {
    const y = 4.45 + floor * 3.4;
    const ledge = new THREE.Mesh(new THREE.BoxGeometry(12.0, 0.16, 0.42), limestoneMat);
    ledge.position.set(0, y, 0.22);
    loftPortalGroup.add(ledge);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(11.9, 0.5, 0.06), brassMat);
    rail.position.set(0, y + 0.35, 0.4);
    loftPortalGroup.add(rail);
  }
  // Vertical limestone/brass mullions give the tower a vertical rhythm.
  for (const sx of [-5.7, 5.7]) {
    const mullion = new THREE.Mesh(new THREE.BoxGeometry(0.22, 20.2, 0.18), brassMat);
    mullion.position.set(sx, 14.45, 0.24);
    loftPortalGroup.add(mullion);
  }

  // Setback Penthouse Floor & Crown
  const hotelPenthouse = new THREE.Mesh(new THREE.BoxGeometry(8.8, 3.8, 3.6), hotelFacadeMat);
  hotelPenthouse.position.set(0, 27.0, -2.1);
  loftPortalGroup.add(hotelPenthouse);

  const hotelCornice = new THREE.Mesh(new THREE.BoxGeometry(12.1, 0.65, 4.9), limestoneMat);
  hotelCornice.position.set(0, 25.05, -2.1);
  loftPortalGroup.add(hotelCornice);

  const rooftopBeacon = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 10, 10),
    new THREE.MeshStandardMaterial({ color: 0x39ff14, emissive: 0x39ff14, emissiveIntensity: 1.2 })
  );
  rooftopBeacon.position.set(0, 29.1, -2.1);
  loftPortalGroup.add(rooftopBeacon);

  // Marquee Sign
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
    new THREE.BoxGeometry(4.8, 0.85, 0.28),
    new THREE.MeshStandardMaterial({ map: marqueeTex, roughness: 0.3 })
  );
  marqueeMesh.position.set(0, 3.55, 0.42);
  loftPortalGroup.add(marqueeMesh);

  // Seven-floor / 65-suite plaque under the marquee.
  const hotelPlaqueCanvas = document.createElement('canvas');
  hotelPlaqueCanvas.width = 512;
  hotelPlaqueCanvas.height = 64;
  const hpctx = hotelPlaqueCanvas.getContext('2d')!;
  hpctx.fillStyle = '#101613';
  hpctx.fillRect(0, 0, 512, 64);
  hpctx.fillStyle = '#e8dcc2';
  hpctx.font = '600 24px sans-serif';
  hpctx.textAlign = 'center';
  hpctx.fillText('7 FLOORS  ·  65 SUITES  ·  LOBBY & RESIDENCES', 256, 40);
  const plaque = new THREE.Mesh(
    new THREE.PlaneGeometry(4.9, 0.62),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(hotelPlaqueCanvas) })
  );
  plaque.position.set(0, 3.02, 0.44);
  loftPortalGroup.add(plaque);

  // Warm interior lobby vestibule glow
  const lobbyBack = new THREE.Mesh(
    new THREE.BoxGeometry(2.2, 2.7, 0.16),
    new THREE.MeshStandardMaterial({
      color: 0xffe4b8,
      emissive: 0xffc570,
      emissiveIntensity: 0.65,
      roughness: 0.5,
    })
  );
  lobbyBack.position.set(0, 1.35, -1.6);
  loftPortalGroup.add(lobbyBack);

  // Openable Glass Double Doors
  const doorGlassMat = new THREE.MeshPhysicalMaterial({
    color: 0xdff2ff,
    roughness: 0.08,
    metalness: 0.1,
    transparent: true,
    opacity: 0.55,
  });
  const loftDoorLeftPivot = new THREE.Group();
  loftDoorLeftPivot.position.set(-0.98, 0, 0.12);
  const leftFrame = new THREE.Mesh(new THREE.BoxGeometry(0.96, 2.55, 0.08), hotelDarkMat);
  leftFrame.position.set(0.48, 1.275, 0);
  loftDoorLeftPivot.add(leftFrame);
  const leftGlass = new THREE.Mesh(new THREE.BoxGeometry(0.74, 2.1, 0.1), doorGlassMat);
  leftGlass.position.set(0.48, 1.3, 0);
  loftDoorLeftPivot.add(leftGlass);
  const leftHandle = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.45, 0.12), brassMat);
  leftHandle.position.set(0.84, 1.12, 0.05);
  loftDoorLeftPivot.add(leftHandle);
  loftPortalGroup.add(loftDoorLeftPivot);

  const loftDoorRightPivot = new THREE.Group();
  loftDoorRightPivot.position.set(0.98, 0, 0.12);
  const rightFrame = new THREE.Mesh(new THREE.BoxGeometry(0.96, 2.55, 0.08), hotelDarkMat);
  rightFrame.position.set(-0.48, 1.275, 0);
  loftDoorRightPivot.add(rightFrame);
  const rightGlass = new THREE.Mesh(new THREE.BoxGeometry(0.74, 2.1, 0.1), doorGlassMat);
  rightGlass.position.set(-0.48, 1.3, 0);
  loftDoorRightPivot.add(rightGlass);
  const rightHandle = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.45, 0.12), brassMat);
  rightHandle.position.set(-0.84, 1.12, 0.05);
  loftDoorRightPivot.add(rightHandle);
  loftPortalGroup.add(loftDoorRightPivot);

  // Brass & Obsidian Keycard + Guest Directory Intercom Pedestal right beside Main Doors
  const intercomGroup = new THREE.Group();
  intercomGroup.position.set(1.48, 0, 0.72);
  intercomGroup.userData.isHotelIntercom = true;

  const kioskPost = new THREE.Mesh(
    new THREE.BoxGeometry(0.24, 1.18, 0.18),
    hotelDarkMat
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

  // Architectural Glass & Steel Entrance Canopy
  const awning = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.16, 1.9), hotelDarkMat);
  awning.position.set(0, 2.86, 0.92);
  loftPortalGroup.add(awning);

  const entryMat = new THREE.Mesh(
    new THREE.BoxGeometry(2.0, 0.03, 1.8),
    new THREE.MeshStandardMaterial({
      color: 0x8c1d1d,
      roughness: 0.9,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    })
  );
  entryMat.position.set(0, 0.018, 0.95);
  loftPortalGroup.add(entryMat);

  // Hotel forecourt: pale stone paving, clipped topiary, brass bollards,
  // benches and flagpoles. The entrance used to open onto a bare sidewalk
  // slab; this gives the porte-cochere a readable, lived-in arrival court.
  const forecourtMat = new THREE.MeshStandardMaterial({
    color: 0xb9b1a2,
    roughness: 0.88,
    metalness: 0.02,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const forecourtPaving = new THREE.Mesh(new THREE.PlaneGeometry(11.4, 6.6), forecourtMat);
  forecourtPaving.rotation.x = -Math.PI / 2;
  forecourtPaving.position.set(0, 0.025, 3.35);
  forecourtPaving.receiveShadow = true;
  loftPortalGroup.add(forecourtPaving);

  const planterMat = new THREE.MeshStandardMaterial({ color: 0x8e8578, roughness: 0.82 });
  const hedgeMat = new THREE.MeshStandardMaterial({ color: 0x315b3c, roughness: 0.92 });
  for (const sx of [-4.6, 4.6]) {
    const planter = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.68, 1.25), planterMat);
    planter.position.set(sx, 0.34, 2.0);
    planter.castShadow = true;
    planter.receiveShadow = true;
    loftPortalGroup.add(planter);
    const hedge = new THREE.Mesh(new THREE.IcosahedronGeometry(0.62, 1), hedgeMat);
    hedge.scale.set(1, 1.15, 1);
    hedge.position.set(sx, 1.05, 2.0);
    hedge.castShadow = true;
    loftPortalGroup.add(hedge);
    obstacles.push({ type: 'circle', x: loftDoorPos.x + sx, z: loftDoorPos.z + 2.0, r: 0.78 });
  }

  for (const sx of [-2.65, 2.65]) {
    for (const pz of [1.15, 2.45, 3.75]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.07, 0.92, 10), brassMat);
      post.position.set(sx, 0.46, pz);
      post.castShadow = true;
      loftPortalGroup.add(post);
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.085, 10, 8), brassMat);
      cap.position.set(sx, 0.94, pz);
      loftPortalGroup.add(cap);
    }
  }

  const benchWoodMat = new THREE.MeshStandardMaterial({ color: 0x4a3427, roughness: 0.8 });
  for (const sx of [-5.7, 5.7]) {
    const bench = new THREE.Group();
    bench.position.set(sx, 0.16, 3.55);
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.09, 2.0), benchWoodMat);
    seat.position.y = 0.4;
    seat.castShadow = true;
    bench.add(seat);
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.5, 2.0), benchWoodMat);
    back.position.set(sx > 0 ? 0.27 : -0.27, 0.72, 0);
    back.castShadow = true;
    bench.add(back);
    for (const lz of [-0.78, 0.78]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.4, 0.08), brassMat);
      leg.position.set(0, 0.2, lz);
      bench.add(leg);
    }
    loftPortalGroup.add(bench);
    obstacles.push({ type: 'box', x: loftDoorPos.x + sx, z: loftDoorPos.z + 3.55, hw: 0.4, hd: 1.05 });
  }

  const flagMatGreen = new THREE.MeshStandardMaterial({
    color: 0x1f4232,
    roughness: 0.7,
    side: THREE.DoubleSide,
  });
  for (const sx of [-6.9, 6.9]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 6.2, 10), brassMat);
    pole.position.set(sx, 3.1, 1.2);
    pole.castShadow = true;
    loftPortalGroup.add(pole);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.85), flagMatGreen);
    flag.position.set(sx + (sx > 0 ? 0.78 : -0.78), 5.55, 1.2);
    flag.rotation.y = Math.PI / 2;
    loftPortalGroup.add(flag);
  }

  // Brass bellhop luggage cart beside the entrance.
  const cart = new THREE.Group();
  cart.position.set(4.05, 0.16, 3.55);
  const cartDeck = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.08, 0.62), hotelDarkMat);
  cartDeck.position.y = 0.24;
  cart.add(cartDeck);
  for (const cx of [-0.46, 0.46]) {
    for (const cz of [-0.27, 0.27]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.06, 12), hotelDarkMat);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(cx, 0.11, cz);
      cart.add(wheel);
    }
  }
  for (const cx of [-0.46, 0.46]) {
    const upright = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.2, 8), brassMat);
    upright.position.set(cx, 0.84, -0.27);
    cart.add(upright);
  }
  const cartHandle = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.95, 8), brassMat);
  cartHandle.rotation.z = Math.PI / 2;
  cartHandle.position.set(0, 1.42, -0.27);
  cart.add(cartHandle);
  const caseMat = new THREE.MeshStandardMaterial({ color: 0x7d5b3a, roughness: 0.7 });
  const suitcase = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.4, 0.44), caseMat);
  suitcase.position.set(0, 0.48, 0.02);
  suitcase.castShadow = true;
  cart.add(suitcase);
  loftPortalGroup.add(cart);
  obstacles.push({ type: 'box', x: loftDoorPos.x + 4.05, z: loftDoorPos.z + 3.55, hw: 0.55, hd: 0.4 });

  worldGroup.add(loftPortalGroup);

  // Obstacles & Camera Occluders for Hotel Piers + Tower
  obstacles.push({ type: 'box', x: loftDoorPos.x - 3.35, z: loftDoorPos.z - 2.0, hw: 2.28, hd: 2.25 });
  obstacles.push({ type: 'box', x: loftDoorPos.x + 3.35, z: loftDoorPos.z - 2.0, hw: 2.28, hd: 2.25 });
  obstacles.push({ type: 'box', x: loftDoorPos.x + 1.48, z: loftDoorPos.z + 0.72, hw: 0.22, hd: 0.22 });

  const hotelU = worldToU(loftDoorPos.x, loftDoorPos.z - 2.1);
  cameraOccluders.push(
    {
      u0: hotelU - 5.6,
      u1: hotelU - 1.1,
      z0: loftDoorPos.z - 4.2,
      z1: loftDoorPos.z + 0.2,
      y0: 0,
      y1: 4.2,
    },
    {
      u0: hotelU + 1.1,
      u1: hotelU + 5.6,
      z0: loftDoorPos.z - 4.2,
      z1: loftDoorPos.z + 0.2,
      y0: 0,
      y1: 4.2,
    },
    {
      u0: hotelU - 5.8,
      u1: hotelU + 5.8,
      z0: loftDoorPos.z - 4.4,
      z1: loftDoorPos.z + 0.2,
      y0: 4.2,
      y1: 28.5,
    }
  );

  // Dance Pad & DJ Booth in East Plaza Corner
  const djX = loftCenter.x + 6.4;
  const djZ = loftCenter.z - 0.5;
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
      tile.position.set(djX + gx * 0.86, 0.175, djZ + 1.4 + gz * 0.86);
      worldGroup.add(tile);
      danceTiles.push(mat);
    }
  }

  const djDeckGroup = new THREE.Group();
  djDeckGroup.position.set(djX, 0.16, djZ - 0.2);
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


  // 10a. TheCity International Airport — a three-block terminal complex.
  // The entrance faces north toward the city; the building and apron extend
  // south beyond the street grid. The interior is a separate walkable scene.
  const airportGroup = new THREE.Group();
  airportGroup.position.set(airportDoorPos.x, 0.15, airportDoorPos.z);
  airportGroup.rotation.y = Math.PI;
  airportGroup.userData.isAirportTerminal = true;
  const airportWallMat = new THREE.MeshStandardMaterial({ color: 0xe4e7e6, roughness: 0.62, metalness: 0.08 });
  const airportGlassMat = new THREE.MeshPhysicalMaterial({ color: 0x9fc4d4, roughness: 0.08, metalness: 0.16, transparent: true, opacity: 0.55 });
  const airportRoofMat = new THREE.MeshStandardMaterial({ color: 0x2b343b, roughness: 0.4, metalness: 0.32 });
  const airportSteelMat = new THREE.MeshStandardMaterial({ color: 0x9aa3ab, roughness: 0.28, metalness: 0.82 });
  const airportGreenMat = new THREE.MeshStandardMaterial({ color: 0x39ff14, emissive: 0x39ff14, emissiveIntensity: 0.55, roughness: 0.3 });
  const airportBlueMat = new THREE.MeshStandardMaterial({ color: 0x2a6f9e, emissive: 0x1d5c86, emissiveIntensity: 0.35, roughness: 0.4 });
  const airportAdd = (mesh: THREE.Object3D, x: number, y: number, z: number, ry = 0) => {
    mesh.position.set(x, y, z);
    mesh.rotation.y = ry;
    airportGroup.add(mesh);
    return mesh;
  };

  // Main terminal volume (50 m wide, 14 m tall, 27 m deep).
  airportAdd(new THREE.Mesh(new THREE.BoxGeometry(50, 14, 27), airportWallMat), 0, 7, -16.5);
  airportAdd(new THREE.Mesh(new THREE.BoxGeometry(54, 0.7, 31), airportRoofMat), 0, 14.4, -16.5);
  airportAdd(new THREE.Mesh(new THREE.BoxGeometry(38, 3.2, 20), airportGlassMat), 0, 16.0, -18.5);
  airportAdd(new THREE.Mesh(new THREE.BoxGeometry(40, 0.5, 22), airportRoofMat), 0, 17.8, -18.5);
  // Curved-ish front glass, split around the 5.2 m entrance.
  for (const [x0, x1] of [
    [-24, -2.6],
    [2.6, 24],
  ]) {
    const pane = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 6.4, 0.16), airportGlassMat);
    airportAdd(pane, (x0 + x1) / 2, 4.5, -2.92);
    for (let x = x0 + 2.4; x < x1; x += 2.6) {
      airportAdd(new THREE.Mesh(new THREE.BoxGeometry(0.1, 6.5, 0.22), airportSteelMat), x, 4.5, -2.84);
    }
  }
  airportAdd(new THREE.Mesh(new THREE.BoxGeometry(52, 0.22, 0.28), airportSteelMat), 0, 1.4, -2.84);
  airportAdd(new THREE.Mesh(new THREE.BoxGeometry(52, 0.22, 0.28), airportSteelMat), 0, 7.5, -2.84);
  // Entrance doors, animated in updateWorld.
  const airportDoorLeftPivot = new THREE.Group();
  airportDoorLeftPivot.position.set(-2.6, 0, -2.8);
  const airportDoorRightPivot = new THREE.Group();
  airportDoorRightPivot.position.set(2.6, 0, -2.8);
  for (const [pivot, dir] of [
    [airportDoorLeftPivot, 1],
    [airportDoorRightPivot, -1],
  ] as const) {
    const glass = new THREE.Mesh(new THREE.BoxGeometry(2.5, 3.4, 0.12), airportGlassMat);
    glass.position.set(dir * 1.25, 1.7, 0);
    pivot.add(glass);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.1, 0.16), airportSteelMat);
    rail.position.set(dir * 1.25, 3.4, 0);
    pivot.add(rail);
    airportGroup.add(pivot);
  }

  // Canopy, sign and drop-off lane.
  airportAdd(new THREE.Mesh(new THREE.BoxGeometry(16, 0.5, 6.2), airportRoofMat), 0, 6.4, 0.6);
  for (const sx of [-6.4, 6.4]) {
    airportAdd(new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 6.2, 10), airportSteelMat), sx, 3.1, 2.2);
  }
  const airportSignCanvas = document.createElement('canvas');
  airportSignCanvas.width = 1024;
  airportSignCanvas.height = 160;
  const asignCtx = airportSignCanvas.getContext('2d')!;
  asignCtx.fillStyle = '#101c23';
  asignCtx.fillRect(0, 0, 1024, 160);
  asignCtx.strokeStyle = '#39ff14';
  asignCtx.lineWidth = 8;
  asignCtx.strokeRect(6, 6, 1012, 148);
  asignCtx.fillStyle = '#ffffff';
  asignCtx.font = 'bold 62px sans-serif';
  asignCtx.textAlign = 'center';
  asignCtx.fillText('THECITY INTERNATIONAL', 512, 78);
  asignCtx.fillStyle = '#39ff14';
  asignCtx.font = '600 30px sans-serif';
  asignCtx.fillText('TERMINAL 1  ·  DEPARTURES  ·  ARRIVALS', 512, 126);
  const airportSign = new THREE.Mesh(
    new THREE.PlaneGeometry(11, 1.7),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(airportSignCanvas) })
  );
  airportAdd(airportSign, 0, 6.0, 3.72);
  airportAdd(new THREE.Mesh(new THREE.BoxGeometry(11.2, 0.1, 0.12), airportGreenMat), 0, 5.15, 3.78);

  // Drop-off road and parked cars north of the entrance.
  airportAdd(new THREE.Mesh(new THREE.BoxGeometry(46, 0.04, 6.0), new THREE.MeshStandardMaterial({ color: 0x353b40, roughness: 0.92 })), 0, 0.02, 7.0);
  for (let i = 0; i < 5; i++) {
    const car = new THREE.Group();
    const carColor = [0x39465c, 0xb9bec4, 0x2f5d3f, 0x9e5440, 0x262930][i];
    const carMat = new THREE.MeshStandardMaterial({ color: carColor, roughness: 0.32, metalness: 0.42 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.8, 1.8), carMat);
    body.position.y = 0.6;
    car.add(body);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.7, 1.55), airportGlassMat);
    cabin.position.set(-0.2, 1.25, 0);
    car.add(cabin);
    for (const sx of [-1.4, 1.4]) for (const sz of [-0.85, 0.85]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.22, 12), airportRoofMat);
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(sx, 0.32, sz);
      car.add(wheel);
    }
    airportAdd(car, -17 + i * 8.5, 0.02, 8.2);
  }

  // Control tower.
  airportAdd(new THREE.Mesh(new THREE.BoxGeometry(5.2, 28, 5.2), airportWallMat), -20, 14, -29);
  airportAdd(new THREE.Mesh(new THREE.BoxGeometry(8.4, 3.2, 8.4), airportGlassMat), -20, 29.2, -29);
  airportAdd(new THREE.Mesh(new THREE.BoxGeometry(9.2, 0.6, 9.2), airportRoofMat), -20, 31.0, -29);
  airportAdd(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 5.0, 8), airportSteelMat), -20, 33.8, -29);
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 10), airportGreenMat);
  airportAdd(beacon, -20, 36.4, -29);

  // Apron, two aircraft and jet bridges behind the terminal.
  airportAdd(new THREE.Mesh(new THREE.PlaneGeometry(90, 34), new THREE.MeshStandardMaterial({ color: 0x6f767a, roughness: 0.94 })), 0, 0.01, -39, 0);
  const planeMat = new THREE.MeshStandardMaterial({ color: 0xf2f4f3, roughness: 0.34, metalness: 0.22 });
  const airlineMat = new THREE.MeshStandardMaterial({ color: 0x2a6f9e, roughness: 0.4, metalness: 0.2 });
  const buildAircraft = (x: number, z: number) => {
    const plane = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(1.55, 1.8, 26, 16), planeMat);
    body.rotation.z = Math.PI / 2;
    body.position.y = 2.0;
    plane.add(body);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(1.6, 4.2, 16), planeMat);
    nose.rotation.z = -Math.PI / 2;
    nose.position.set(15.0, 2.0, 0);
    plane.add(nose);
    const wing = new THREE.Mesh(new THREE.BoxGeometry(8.2, 0.3, 2.6), planeMat);
    wing.position.set(0, 1.9, 0);
    plane.add(wing);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.4, 4.2, 5.4), airlineMat);
    tail.position.set(-12.0, 3.6, 0);
    plane.add(tail);
    const stabilizer = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.22, 6.2), planeMat);
    stabilizer.position.set(-11.0, 2.2, 0);
    plane.add(stabilizer);
    // Engines
    for (const sz of [-2.0, 2.0]) {
      const engine = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.9, 3.0, 12), airportSteelMat);
      engine.rotation.x = Math.PI / 2;
      engine.position.set(2.0, 1.0, sz);
      plane.add(engine);
    }
    plane.position.set(x, 0, z);
    return plane;
  };
  airportGroup.add(buildAircraft(14, -38), buildAircraft(-16, -42));
  for (const sx of [-10, 10]) {
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.8, 9), airportWallMat);
    airportAdd(bridge, sx, 2.0, -31);
    const bridgeGlass = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.4, 8.6), airportGlassMat);
    airportAdd(bridgeGlass, sx, 2.2, -31);
  }

  // Rooftop mechanical plant and signage masts.
  for (const [x, z] of [
    [-14, -20],
    [8, -22],
    [18, -12],
  ]) {
    airportAdd(new THREE.Mesh(new THREE.BoxGeometry(4, 2.2, 3.4), airportSteelMat), x, 15.7, z);
  }
  for (const x of [-8, 8]) {
    airportAdd(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 7, 8), airportSteelMat), x, 18.2, -6);
  }

  worldGroup.add(airportGroup);
  obstacles.push({ type: 'box', x: airportDoorPos.x, z: airportDoorPos.z + 16.5, hw: 25.5, hd: 14.2 });
  for (const sx of [-6.4, 6.4]) {
    obstacles.push({ type: 'box', x: airportDoorPos.x - sx, z: airportDoorPos.z - 2.2, hw: 0.3, hd: 0.3 });
  }
  // Camera occluder covering the terminal mass.
  const airportU = worldToU(airportDoorPos.x, airportDoorPos.z + 16.5);
  cameraOccluders.push({
    u0: airportU - 26,
    u1: airportU + 26,
    z0: airportDoorPos.z + 2.4,
    z1: airportDoorPos.z + 31,
    y0: 0,
    y1: 18,
  });

  // 10b. LoftLife Threads — separate retail building and entrance.
  const storeGroup = new THREE.Group();
  storeGroup.position.set(clothingStoreDoorPos.x, 0.15, clothingStoreDoorPos.z);
  storeGroup.userData.isClothingStore = true;
  const storeWallMat = new THREE.MeshStandardMaterial({ color: 0xe8dfd2, roughness: 0.68 });
  const storeAccentMat = new THREE.MeshStandardMaterial({ color: 0x23302a, roughness: 0.5, metalness: 0.18 });
  const storeGlassMat = new THREE.MeshPhysicalMaterial({ color: 0xcfe7ef, roughness: 0.06, metalness: 0.1, transparent: true, opacity: 0.48 });
  const storeWoodMat = new THREE.MeshStandardMaterial({ color: 0x6b4730, roughness: 0.48 });
  const storeAdd = (mesh: THREE.Object3D, x: number, y: number, z: number, ry = 0) => {
    mesh.position.set(x, y, z);
    mesh.rotation.y = ry;
    storeGroup.add(mesh);
  };
  storeAdd(new THREE.Mesh(new THREE.BoxGeometry(15, 8.6, 10), storeWallMat), 0, 4.3, -5.2);
  storeAdd(new THREE.Mesh(new THREE.BoxGeometry(12.6, 2.8, 8.2), storeWallMat), 0, 10.0, -5.2);
  storeAdd(new THREE.Mesh(new THREE.BoxGeometry(15.4, 0.45, 10.4), storeAccentMat), 0, 8.7, -5.2);
  // Ground-floor glazing with a central door.
  for (const [x0, x1] of [
    [-6.6, -1.7],
    [1.7, 6.6],
  ]) {
    storeAdd(new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 3.4, 0.14), storeGlassMat), (x0 + x1) / 2, 2.1, -0.24);
    for (let x = x0 + 1.1; x < x1; x += 1.6) {
      storeAdd(new THREE.Mesh(new THREE.BoxGeometry(0.09, 3.5, 0.2), storeAccentMat), x, 2.1, -0.18);
    }
  }
  storeAdd(new THREE.Mesh(new THREE.BoxGeometry(3.4, 3.5, 0.12), storeGlassMat), 0, 1.8, -0.2);
  storeAdd(new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.16, 0.2), storeAccentMat), 0, 3.55, -0.14);
  // Half-open door leaves.
  for (const sx of [-1, 1]) {
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(1.5, 3.2, 0.08), storeGlassMat);
    storeAdd(leaf, sx * 1.5, 1.65, 0.05, sx * 0.55);
  }
  // Storefront sign, awning and window mannequins.
  const storeSignCanvas = document.createElement('canvas');
  storeSignCanvas.width = 768;
  storeSignCanvas.height = 192;
  const sctx = storeSignCanvas.getContext('2d')!;
  sctx.fillStyle = '#1b2620';
  sctx.fillRect(0, 0, 768, 192);
  sctx.strokeStyle = '#d9c8a6';
  sctx.lineWidth = 7;
  sctx.strokeRect(7, 7, 754, 178);
  sctx.fillStyle = '#f7f3ea';
  sctx.font = 'bold 58px sans-serif';
  sctx.textAlign = 'center';
  sctx.fillText('LOFTLIFE THREADS', 384, 88);
  sctx.fillStyle = '#39ff14';
  sctx.font = '600 26px sans-serif';
  sctx.fillText('CITY STYLE  ·  EVERYDAY WEAR', 384, 136);
  const storeSign = new THREE.Mesh(
    new THREE.PlaneGeometry(9.4, 2.35),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(storeSignCanvas) })
  );
  storeAdd(storeSign, 0, 4.4, 0.52);
  storeAdd(new THREE.Mesh(new THREE.BoxGeometry(10.2, 0.2, 2.4), storeAccentMat), 0, 3.25, 0.72);
  for (const sx of [-4.2, 4.2]) {
    storeAdd(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 3.2, 8), storeAccentMat), sx, 1.6, 1.5);
  }
  // Simple window mannequins.
  for (const [mx, color] of [
    [-4.6, 0xc86b51],
    [-2.8, 0x3f6b56],
    [3.2, 0x39465c],
    [4.8, 0xd49a45],
  ] as const) {
    const mannequin = new THREE.Group();
    const garment = new THREE.MeshStandardMaterial({ color, roughness: 0.8 });
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.16, 0.65, 10), garment);
    torso.position.y = 1.3;
    mannequin.add(torso);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 10), new THREE.MeshStandardMaterial({ color: 0xe7ddd2, roughness: 0.5 }));
    head.position.y = 1.75;
    mannequin.add(head);
    const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.18, 1.0, 10), storeAccentMat);
    stand.position.y = 0.5;
    mannequin.add(stand);
    storeAdd(mannequin, mx, 0.05, 0.3);
  }
  // Planter and bench beside the doors.
  for (const sx of [-6.9, 6.9]) {
    storeAdd(new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.3, 0.6, 12), storeWoodMat), sx, 0.3, 1.5);
    storeAdd(new THREE.Mesh(new THREE.IcosahedronGeometry(0.62, 1), new THREE.MeshStandardMaterial({ color: 0x4f7d4a, roughness: 0.82 })), sx, 1.1, 1.5);
  }
  worldGroup.add(storeGroup);
  obstacles.push({ type: 'box', x: clothingStoreDoorPos.x, z: clothingStoreDoorPos.z - 5.2, hw: 7.6, hd: 5.2 });
  storeAdd(new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.12, 0.5), storeWoodMat), 8.4, 0.5, 0.4);
  obstacles.push({ type: 'box', x: clothingStoreDoorPos.x + 8.4, z: clothingStoreDoorPos.z + 0.4, hw: 0.9, hd: 0.3 });
  const storeU = worldToU(clothingStoreDoorPos.x, clothingStoreDoorPos.z - 5.2);
  cameraOccluders.push({
    u0: storeU - 8,
    u1: storeU + 8,
    z0: clothingStoreDoorPos.z - 10.4,
    z1: clothingStoreDoorPos.z,
    y0: 0,
    y1: 11.5,
  });

  // Store entrance threshold marking.
  const storeThreshold = new THREE.Mesh(
    new THREE.BoxGeometry(3.4, 0.03, 1.4),
    new THREE.MeshStandardMaterial({ color: 0x39ff14, emissive: 0x39ff14, emissiveIntensity: 0.25 })
  );
  storeThreshold.position.set(clothingStoreDoorPos.x, 0.16, clothingStoreDoorPos.z + 0.7);
  worldGroup.add(storeThreshold);

  // Airport pavement threshold stripe.
  const airportThreshold = new THREE.Mesh(
    new THREE.BoxGeometry(4.8, 0.03, 1.6),
    new THREE.MeshStandardMaterial({ color: 0x39ff14, emissive: 0x39ff14, emissiveIntensity: 0.25 })
  );
  airportThreshold.position.set(airportDoorPos.x, 0.16, airportDoorPos.z - 1.2);
  worldGroup.add(airportThreshold);


  // 10b. Walk-up salon in the central plaza district.
  const salonGroup = new THREE.Group();
  salonGroup.position.set(salonPos.x, 0.12, salonPos.z);
  const salonWall = new THREE.MeshStandardMaterial({ color: 0xe9e3dc, roughness: 0.72 });
  const salonDark = new THREE.MeshStandardMaterial({ color: 0x263038, roughness: 0.42, metalness: 0.18 });
  const salonGlass = new THREE.MeshPhysicalMaterial({ color: 0xb7d7dc, roughness: 0.12, metalness: 0.12, transparent: true, opacity: 0.72 });
  const salonBody = new THREE.Mesh(new THREE.BoxGeometry(5.2, 3.4, 3.4), salonWall);
  salonBody.position.set(0, 1.7, -0.45); salonBody.castShadow = true; salonGroup.add(salonBody);
  const salonRoof = new THREE.Mesh(new THREE.BoxGeometry(5.5, 0.24, 3.7), salonDark);
  salonRoof.position.set(0, 3.45, -0.45); salonGroup.add(salonRoof);
  const salonWindow = new THREE.Mesh(new THREE.BoxGeometry(3.5, 1.8, 0.08), salonGlass);
  salonWindow.position.set(0, 1.9, 1.28); salonGroup.add(salonWindow);
  const salonSignCanvas = document.createElement('canvas'); salonSignCanvas.width = 512; salonSignCanvas.height = 128;
  const salonSignCtx = salonSignCanvas.getContext('2d')!; salonSignCtx.fillStyle = '#263038'; salonSignCtx.fillRect(0,0,512,128);
  salonSignCtx.fillStyle = '#ffffff'; salonSignCtx.font = 'bold 62px sans-serif'; salonSignCtx.textAlign = 'center'; salonSignCtx.fillText('THE SALON',256,84);
  const salonSign = new THREE.Mesh(new THREE.PlaneGeometry(3.2,0.8),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(salonSignCanvas)}));
  salonSign.position.set(0,2.95,1.34); salonGroup.add(salonSign);
  const salonAccent = new THREE.Mesh(new THREE.BoxGeometry(3.7,0.07,0.1),new THREE.MeshStandardMaterial({color:0x39ff14,emissive:0x39ff14,emissiveIntensity:0.45}));
  salonAccent.position.set(0,2.43,1.36); salonGroup.add(salonAccent);
  worldGroup.add(salonGroup);
  obstacles.push({type:'box',x:salonPos.x,z:salonPos.z-0.45,hw:2.65,hd:1.75});

  // 11. Animated City Visitors / NPCs
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
      greeting: 'Welcome to Main City! Watch out for traffic on 15th & M St, and check out the elevated Metro on 16th St!',
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
        { x: fX - 2.4, z: fZ - 1.2 },
        { x: fX + 2.4, z: fZ - 1.2 },
        { x: fX + 2.4, z: fZ + 2.6 },
        { x: fX - 2.4, z: fZ + 2.6 },
      ],
      idleEmote: 'wave',
    },
    {
      id: 'npc_sora',
      name: 'Sora',
      greeting: 'Holding Shift lets you sprint down the multi-lane diagonal avenues! Explore all the way from A St to Z St!',
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
      greeting: 'The LoftLine buses cruise right along 15th St and M St while the Metro glides overhead on 16th St!',
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
        { x: uzToWorldX(uLines[12] + uHalfWidths[12] + 1.2, zLines[14] + zHalfWidths[14] + 1.2), z: zLines[14] + zHalfWidths[14] + 1.2 },
        { x: uzToWorldX(uLines[13] - uHalfWidths[13] - 1.2, zLines[14] + zHalfWidths[14] + 1.2), z: zLines[14] + zHalfWidths[14] + 1.2 },
        { x: uzToWorldX(uLines[13] - uHalfWidths[13] - 1.2, zLines[15] - zHalfWidths[15] - 1.2), z: zLines[15] - zHalfWidths[15] - 1.2 },
      ],
      idleEmote: 'idle',
    },
    {
      id: 'npc_kai',
      name: 'Kai',
      greeting: 'Press V for third-person Play View — the camera follows smoothly behind you and dodges skyscrapers!',
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
        { x: uzToWorldX(uLines[11] + uHalfWidths[11] + 1.4, zLines[14] + zHalfWidths[14] + 1.4), z: zLines[14] + zHalfWidths[14] + 1.4 },
        { x: uzToWorldX(uLines[11] + uHalfWidths[11] + 1.4, zLines[15] - zHalfWidths[15] - 1.4), z: zLines[15] - zHalfWidths[15] - 1.4 },
      ],
      idleEmote: 'cheer',
    },
  ];

  const npcs: WorldNpc[] = npcSpecs.map((spec) => {
    const rig = createAvatarRig(spec.config);
    const start = spec.waypoints[0];
    rig.root.position.set(start.x, 0.14, start.z);
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

  // 12. Real-time Cars, Buses & Elevated Metro Trains
  const traffic = createCityTraffic(maxAnisotropy);
  // 10d. Public destinations: library, Med Deck, community centre, café, market,
  // clothing store and cinema, each with a walkable interior.
  const cityVenues = buildCityVenues(maxAnisotropy);
  worldGroup.add(cityVenues.group);
  for (const s of cityVenues.seats) {
    const anchor = new THREE.Group();
    anchor.position.set(s.x, 0.14, s.z);
    worldGroup.add(anchor);
    seats.push({
      id: s.id,
      label: s.label,
      mesh: anchor,
      seatPos: { x: s.x, y: 0.14, z: s.z },
      approachPos: {
        x: s.x + Math.sin(s.facingYaw) * 0.75,
        z: s.z + Math.cos(s.facingYaw) * 0.75,
      },
      facingYaw: s.facingYaw,
    });
  }
  obstacles.push(...cityVenues.obstacles.map((o) => ({ ...o })));
  // Venue shells are intentionally not camera occluders: the front wall is a
  // cutaway, and treating the whole block as an occluder snapped the chase
  // camera into the facade whenever a player stood at a door.

  worldGroup.add(traffic.trafficGroup);

  let partyMode = true;
  function togglePartyMode() {
    partyMode = !partyMode;
    return partyMode;
  }

  let mainDoorUnlocked = false;
  function setMainDoorUnlocked(unlocked: boolean) {
    mainDoorUnlocked = unlocked;
    const hex = unlocked ? 0x39ff14 : 0xf59e0b;
    mainDoorLedMat.color.setHex(hex);
    mainDoorLedMat.emissive.setHex(hex);
  }
  function isMainDoorUnlocked() {
    return mainDoorUnlocked;
  }

  const loftDoorEntryPos = { x: loftDoorPos.x, z: loftDoorPos.z + 2.2 };
  const loftDoorThresholdPos = { x: loftDoorPos.x, z: loftDoorPos.z - 0.18 };

  function updateWorld(
    elapsed: number,
    delta: number,
    playerX: number,
    playerZ: number,
    mood: LightingMood
  ) {
    skyDome.setMood(mood);

    // Public destinations open their roof and ceiling while you are inside so
    // the chase camera can see the interior instead of a solid lid.
    cityVenues.update(playerX, playerZ);

    // 1. Fountain water droplets
    droplets.forEach((drop, idx) => {
      const phase = (elapsed * 0.95 + idx / droplets.length) % 1;
      const angle = (idx / droplets.length) * Math.PI * 2 + elapsed * 0.35;
      const radius = 0.1 + phase * 1.05;
      const height = 1.54 + Math.sin(phase * Math.PI) * 0.85 - phase * 0.85;
      drop.position.set(
        fX + Math.cos(angle) * radius,
        Math.max(0.46, height),
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

    // 3. Streetlamps, Skyscraper Windows & Hotel Glow
    const nightBoost = mood === 'night' ? 1.0 : mood === 'golden' ? 0.55 : 0.1;
    lampGlobeMat.emissiveIntensity = 0.2 + nightBoost * 1.85;
    hotelFacadeMat.emissiveIntensity = 0.25 + nightBoost * 0.95;
    for (const fMat of facadeMaterials) {
      fMat.emissiveIntensity = 0.18 + nightBoost * 0.85;
    }

    // 4. Cars, Buses, Metro Trains & Traffic Signal Phase
    const phase = traffic.updateTraffic(delta, playerX, playerZ, mood);
    ewRedMat.emissiveIntensity = !phase.ewGreen && !phase.ewYellow ? 1.8 : 0.08;
    ewYellowMat.emissiveIntensity = phase.ewYellow ? 1.8 : 0.08;
    ewGreenMat.emissiveIntensity = phase.ewGreen ? 1.8 : 0.08;
    nsRedMat.emissiveIntensity = !phase.nsGreen && !phase.nsYellow ? 1.8 : 0.08;
    nsYellowMat.emissiveIntensity = phase.nsYellow ? 1.8 : 0.08;
    nsGreenMat.emissiveIntensity = phase.nsGreen ? 1.8 : 0.08;

    // 5. Auto-swing Hotel Main Double Doors when UNLOCKED
    const doorDist = Math.hypot(playerX - loftDoorPos.x, playerZ - loftDoorPos.z);
    const targetDoorAngle = mainDoorUnlocked && doorDist < 2.8 ? 1.25 : 0;
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

    // 6. NPC strolling
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

      npc.rig.root.position.set(npc.x, getCityGroundY(npc.x, npc.z), npc.z);
      npc.rig.root.rotation.y = npc.yaw;
      npc.rig.updateAnimation(emote, isMoving, elapsed + npc.id.length, delta, 0);
    }
  }

  const plazaAtm = {
    id: 'hotel_plaza_atm',
    x: loftDoorPos.x + 3.2,
    z: loftDoorPos.z + 2.0,
    radius: 2.2,
    label: 'Use TG-Bank ATM',
    kind: 'atm' as const,
    atmId: 'hotel_plaza',
  };

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
    venueInteractions: [...cityVenues.interactions, plazaAtm],
    venueFootprints: cityVenues.occluders,
    obstacles,
    cameraOccluders,
    updateWorld,
    togglePartyMode,
    setMainDoorUnlocked,
    isMainDoorUnlocked,
  };
}

/**
 * Analytical spring-arm ray-vs-AABB occlusion test in slanted (U, Y, Z) city space.
 * Returns normalized ray fraction t in [0.22, 1.0] so Play View camera stays clear of all buildings.
 */
export function resolveCityCameraScale(
  tx: number,
  ty: number,
  tz: number,
  cx: number,
  cy: number,
  cz: number,
  occluders: CityCameraBox[]
): number {
  const tu = worldToU(tx, tz);
  const cu = worldToU(cx, cz);
  const du = cu - tu;
  const dy = cy - ty;
  const dz = cz - tz;

  const minRayU = Math.min(tu, cu) - 0.5;
  const maxRayU = Math.max(tu, cu) + 0.5;
  const minRayZ = Math.min(tz, cz) - 0.5;
  const maxRayZ = Math.max(tz, cz) + 0.5;
  const pad = 0.36;

  let bestT = 1.0;

  for (let i = 0; i < occluders.length; i++) {
    const b = occluders[i];
    if (b.u1 + pad < minRayU || b.u0 - pad > maxRayU || b.z1 + pad < minRayZ || b.z0 - pad > maxRayZ) {
      continue;
    }

    let tMin = 0;
    let tMax = bestT;

    const uMinB = b.u0 - pad;
    const uMaxB = b.u1 + pad;
    if (Math.abs(du) < 1e-6) {
      if (tu < uMinB || tu > uMaxB) continue;
    } else {
      let t1 = (uMinB - tu) / du;
      let t2 = (uMaxB - tu) / du;
      if (t1 > t2) {
        const tmp = t1;
        t1 = t2;
        t2 = tmp;
      }
      tMin = Math.max(tMin, t1);
      tMax = Math.min(tMax, t2);
      if (tMin > tMax) continue;
    }

    const zMinB = b.z0 - pad;
    const zMaxB = b.z1 + pad;
    if (Math.abs(dz) < 1e-6) {
      if (tz < zMinB || tz > zMaxB) continue;
    } else {
      let t1 = (zMinB - tz) / dz;
      let t2 = (zMaxB - tz) / dz;
      if (t1 > t2) {
        const tmp = t1;
        t1 = t2;
        t2 = tmp;
      }
      tMin = Math.max(tMin, t1);
      tMax = Math.min(tMax, t2);
      if (tMin > tMax) continue;
    }

    const yMinB = b.y0 - pad;
    const yMaxB = b.y1 + pad;
    if (Math.abs(dy) < 1e-6) {
      if (ty < yMinB || ty > yMaxB) continue;
    } else {
      let t1 = (yMinB - ty) / dy;
      let t2 = (yMaxB - ty) / dy;
      if (t1 > t2) {
        const tmp = t1;
        t1 = t2;
        t2 = tmp;
      }
      tMin = Math.max(tMin, t1);
      tMax = Math.min(tMax, t2);
      if (tMin > tMax) continue;
    }

    if (tMin > 0.02 && tMin < bestT) {
      bestT = tMin;
    }
  }

  // Also avoid Elevated Metro Viaduct girder along 16th St
  const vz0 = CITY_LAYOUT.metroLineZ - 4.1;
  const vz1 = CITY_LAYOUT.metroLineZ + 4.1;
  if (maxRayZ >= vz0 && minRayZ <= vz1) {
    let tMin = 0;
    let tMax = bestT;
    if (Math.abs(dz) >= 1e-6) {
      let tz1 = (vz0 - tz) / dz;
      let tz2 = (vz1 - tz) / dz;
      if (tz1 > tz2) [tz1, tz2] = [tz2, tz1];
      tMin = Math.max(tMin, tz1);
      tMax = Math.min(tMax, tz2);
    } else if (tz < vz0 || tz > vz1) {
      tMin = 2;
    }
    if (tMin <= tMax) {
      if (Math.abs(dy) >= 1e-6) {
        let ty1 = (5.5 - ty) / dy;
        let ty2 = (7.2 - ty) / dy;
        if (ty1 > ty2) [ty1, ty2] = [ty2, ty1];
        tMin = Math.max(tMin, ty1);
        tMax = Math.min(tMax, ty2);
      } else if (ty < 5.5 || ty > 7.2) {
        tMin = 2;
      }
      if (tMin <= tMax && tMin > 0.02 && tMin < bestT) {
        bestT = tMin;
      }
    }
  }

  return Math.max(0.22, bestT);
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
    z < loftDoorPos.z + 0.55 &&
    z > loftDoorPos.z - 2.6 &&
    Math.abs(x - loftDoorPos.x) < 1.25
  ) {
    return false;
  }

  for (const ob of obstacles) {
    if (ob.type === 'circle' && ob.r !== undefined) {
      if (Math.hypot(x - ob.x, z - ob.z) < ob.r + radius) return false;
    } else if (ob.type === 'box' && ob.hw !== undefined && ob.hd !== undefined) {
      if (Math.abs(x - ob.x) < ob.hw + radius && Math.abs(z - ob.z) < ob.hd + radius) {
        return false;
      }
    }
  }

  // Public destinations: you may walk the interior floor and through the
  // storefront doorway, but the rest of the shell is solid.
  for (const blk of blocks) {
    if (blk.kind !== 'venue') continue;
    const venue = CITY_VENUES.find((v) => v.id === blk.venueId);
    if (!venue) continue;
    const inShell = u > venue.u0 - radius && u < venue.u1 + radius && z > venue.z0 - radius && z < venue.z1 + radius;
    if (!inShell) continue;
    const inInterior =
      u > venue.iu0 + radius && u < venue.iu1 - radius && z > venue.iz0 + radius && z < venue.iz1 - radius;
    if (inInterior) continue;
    const halfDoor = Math.max(0.6, venue.doorWidth / 2 - radius);
    const nearDoorU = Math.abs(u - venue.doorU) < halfDoor;
    const nearDoorZ = Math.abs(z - venue.doorZ) < halfDoor;
    const inDoorway =
      (venue.doorSide === 'north' && nearDoorU && z >= venue.z0 - 1.4 && z <= venue.iz0 + 0.7) ||
      (venue.doorSide === 'south' && nearDoorU && z <= venue.z1 + 1.4 && z >= venue.iz1 - 0.7) ||
      (venue.doorSide === 'west' && nearDoorZ && u >= venue.u0 - 1.4 && u <= venue.iu0 + 0.7) ||
      (venue.doorSide === 'east' && nearDoorZ && u <= venue.u1 + 1.4 && u >= venue.iu1 - 0.7);
    if (inDoorway) continue;
    return false;
  }

  // Check building footprints. The walkable band matches the district
  // sidewalk + setback that the renderer uses, so collisions always agree
  // with what the player can see.
  for (const blk of blocks) {
    if (blk.kind !== 'building') continue;
    const inset = blk.sidewalk + blk.setback - radius;
    const bu0 = blk.uMin + inset;
    const bu1 = blk.uMax - inset;
    const bz0 = blk.zMin + inset;
    const bz1 = blk.zMax - inset;
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
      return blk.walkHeight;
    }
  }
  return 0;
}
