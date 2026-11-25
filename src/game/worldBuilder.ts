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
import { createCityTraffic } from './cityTraffic';
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
    blocks,
    bounds,
    signalIntersections,
    busStops,
    metroLineZ,
    loftCenter,
    loftDoorPos,
  } = CITY_LAYOUT;

  // 0. Atmospheric Sky Dome
  const skyDome = createSkyDome();
  worldGroup.add(skyDome.mesh);

  // 1. Continuous Ground & Asphalt Street Bed
  const outerGround = new THREE.Mesh(
    new THREE.PlaneGeometry(1600, 1600),
    new THREE.MeshStandardMaterial({ color: 0x384339, roughness: 0.96 })
  );
  outerGround.rotation.x = -Math.PI / 2;
  outerGround.position.y = -0.08;
  worldGroup.add(outerGround);

  const citySpanU = bounds.uMax - bounds.uMin + 24;
  const citySpanZ = bounds.zMax - bounds.zMin + 24;

  const asphaltTex = createAsphaltTexture(maxAnisotropy);
  const asphaltAcc = createAccumulator();
  pushSlantedPrism(
    asphaltAcc,
    bounds.uMin - 12,
    bounds.uMax + 12,
    bounds.zMin - 12,
    bounds.zMax + 12,
    -0.06,
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

  // Invisible raycast plane covering entire A-Z & 1st-30th city
  const groundRaycastPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(citySpanU + 450, citySpanZ + 120),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  groundRaycastPlane.rotation.x = -Math.PI / 2;
  groundRaycastPlane.position.set(0, 0.02, 0);
  worldGroup.add(groundRaycastPlane);

  // 2. Realistic Lane Markings: Double Yellow Centerlines, White Dashed Multi-Lanes & Crosswalks
  const yellowLineAcc = createAccumulator();
  const whiteLineAcc = createAccumulator();

  for (let i = 0; i < DIAGONAL_LETTERS.length; i++) {
    const u = uLines[i];
    const hw = uHalfWidths[i];
    // Double yellow centerline (skip intersection boxes)
    for (let row = 0; row < HORIZONTAL_COUNT - 1; row++) {
      const zStart = zLines[row] + zHalfWidths[row] + 2.6;
      const zEnd = zLines[row + 1] - zHalfWidths[row + 1] - 2.6;
      if (zEnd <= zStart) continue;
      pushSlantedTopQuad(yellowLineAcc, u - 0.14, u - 0.04, zStart, zEnd, 0.012);
      pushSlantedTopQuad(yellowLineAcc, u + 0.04, u + 0.14, zStart, zEnd, 0.012);

      // Multi-lane white dashes on 4-lane major avenues
      if (uIsMajor[i]) {
        for (const laneSep of [-hw * 0.5, hw * 0.5]) {
          for (let z = zStart; z < zEnd - 2.0; z += 5.5) {
            pushSlantedTopQuad(
              whiteLineAcc,
              u + laneSep - 0.06,
              u + laneSep + 0.06,
              z,
              Math.min(z + 2.6, zEnd),
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
    for (let col = 0; col < DIAGONAL_LETTERS.length - 1; col++) {
      const uStart = uLines[col] + uHalfWidths[col] + 2.6;
      const uEnd = uLines[col + 1] - uHalfWidths[col + 1] - 2.6;
      if (uEnd <= uStart) continue;
      pushSlantedTopQuad(yellowLineAcc, uStart, uEnd, z - 0.14, z - 0.04, 0.012);
      pushSlantedTopQuad(yellowLineAcc, uStart, uEnd, z + 0.04, z + 0.14, 0.012);

      if (zIsMajor[j]) {
        for (const laneSep of [-hw * 0.5, hw * 0.5]) {
          for (let u = uStart; u < uEnd - 2.0; u += 5.5) {
            pushSlantedTopQuad(
              whiteLineAcc,
              u,
              Math.min(u + 2.6, uEnd),
              z + laneSep - 0.06,
              z + laneSep + 0.06,
              0.012
            );
          }
        }
      }
    }
  }

  // Zebra Crosswalks & Stop Bars at signaled / downtown intersections
  for (const sig of signalIntersections) {
    const { u, z, uHalfWidth, zHalfWidth } = sig;
    // Crosswalks North & South of intersection
    for (const dirZ of [-1, 1]) {
      const cz0 = z + dirZ * (zHalfWidth + 0.35);
      const cz1 = z + dirZ * (zHalfWidth + 2.15);
      const zMinC = Math.min(cz0, cz1);
      const zMaxC = Math.max(cz0, cz1);
      for (let su = -uHalfWidth + 0.8; su <= uHalfWidth - 1.2; su += 1.35) {
        pushSlantedTopQuad(whiteLineAcc, u + su, u + su + 0.65, zMinC, zMaxC, 0.013);
      }
    }
    // Crosswalks West & East of intersection
    for (const dirU of [-1, 1]) {
      const cu0 = u + dirU * (uHalfWidth + 0.35);
      const cu1 = u + dirU * (uHalfWidth + 2.15);
      const uMinC = Math.min(cu0, cu1);
      const uMaxC = Math.max(cu0, cu1);
      for (let sz = -zHalfWidth + 0.8; sz <= zHalfWidth - 1.2; sz += 1.35) {
        pushSlantedTopQuad(whiteLineAcc, uMinC, uMaxC, z + sz, z + sz + 0.65, 0.013);
      }
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

  // 3. Sidewalks, Parks, and Multi-Part UV-Mapped City Buildings across 725 blocks
  const sidewalkAcc = createAccumulator();
  const parkGrassAcc = createAccumulator();
  const storefrontAcc = createAccumulator();
  const roofAcc = createAccumulator();
  const crownAcc = createAccumulator();
  const facadeAccs = Array.from({ length: 6 }, () => createAccumulator());

  const treeCoords: { x: number; z: number; scale: number }[] = [];
  const lampCoords: { x: number; z: number; rotY: number }[] = [];

  function addCityBuilding(
    u0: number,
    u1: number,
    z0: number,
    z1: number,
    totalH: number,
    setbackH: number,
    styleIdx: number,
    hasCrown: boolean
  ) {
    if (u1 - u0 < 3.2 || z1 - z0 < 3.2) return;

    // Ground floor storefront podium (0.14 -> 3.6m)
    const podiumTop = 3.6;
    pushSlantedPrism(storefrontAcc, u0, u1, z0, z1, 0.14, podiumTop, 6, 4, true);

    // Main tower shaft (3.6 -> totalH)
    const mainAcc = facadeAccs[styleIdx % facadeAccs.length];
    pushSlantedPrism(mainAcc, u0 + 0.12, u1 - 0.12, z0 + 0.12, z1 - 0.12, podiumTop, totalH, 10, 9, false);
    // Concrete roof cap
    pushSlantedTopQuad(roofAcc, u0 + 0.12, u1 - 0.12, z0 + 0.12, z1 - 0.12, totalH);
    cameraOccluders.push({ u0, u1, z0, z1, y0: 0, y1: totalH });

    // Secondary architectural setback tower
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

    // Rooftop Mechanical Penthouse / Crown
    if (hasCrown && topU1 - topU0 > 4 && topZ1 - topZ0 > 4) {
      const cu0 = topU0 + (topU1 - topU0) * 0.24;
      const cu1 = topU1 - (topU1 - topU0) * 0.24;
      const cz0 = topZ0 + (topZ1 - topZ0) * 0.24;
      const cz1 = topZ1 - (topZ1 - topZ0) * 0.24;
      pushSlantedPrism(crownAcc, cu0, cu1, cz0, cz1, topY, topY + 2.8, 5, 5, true);
    }
  }

  for (const blk of blocks) {
    // Full block sidewalk curb (14cm tall realistic sidewalk)
    pushSlantedPrism(sidewalkAcc, blk.uMin, blk.uMax, blk.zMin, blk.zMax, 0.0, 0.14, 6, 6, true);

    if (blk.kind === 'loft_plaza') {
      pushSlantedPrism(
        sidewalkAcc,
        blk.uMin + 0.4,
        blk.uMax - 0.4,
        blk.zMin + 0.4,
        blk.zMax - 0.4,
        0.14,
        0.17,
        6,
        6,
        true
      );
      continue;
    }

    if (blk.kind === 'park') {
      pushSlantedPrism(
        parkGrassAcc,
        blk.uMin + 2.2,
        blk.uMax - 2.2,
        blk.zMin + 2.2,
        blk.zMax - 2.2,
        0.14,
        0.2,
        8,
        8,
        true
      );
      const midU = (blk.uMin + blk.uMax) / 2;
      const midZ = (blk.zMin + blk.zMax) / 2;
      treeCoords.push({ x: uzToWorldX(midU - 3.6, midZ - 2.6), z: midZ - 2.6, scale: 1.25 });
      treeCoords.push({ x: uzToWorldX(midU + 3.6, midZ + 2.4), z: midZ + 2.4, scale: 1.1 });
      treeCoords.push({ x: uzToWorldX(midU - 2.5, midZ + 3.4), z: midZ + 3.4, scale: 0.95 });
      continue;
    }

    // Building footprint inset by 2.6m walkable city sidewalk
    const bu0 = blk.uMin + 2.6;
    const bu1 = blk.uMax - 2.6;
    const bz0 = blk.zMin + 2.6;
    const bz1 = blk.zMax - 2.6;

    if (blk.subSplit === 'split_u' && bu1 - bu0 > 13) {
      const midU = (bu0 + bu1) / 2;
      addCityBuilding(
        bu0,
        midU - 0.6,
        bz0,
        bz1,
        blk.height,
        blk.setbackHeight,
        blk.facadeStyle,
        blk.hasTowerCrown
      );
      addCityBuilding(
        midU + 0.6,
        bu1,
        bz0,
        bz1,
        Math.max(10, blk.height * 0.78),
        0,
        (blk.facadeStyle + 2) % 6,
        false
      );
    } else if (blk.subSplit === 'split_z' && bz1 - bz0 > 13) {
      const midZ = (bz0 + bz1) / 2;
      addCityBuilding(
        bu0,
        bu1,
        bz0,
        midZ - 0.6,
        blk.height,
        blk.setbackHeight,
        blk.facadeStyle,
        blk.hasTowerCrown
      );
      addCityBuilding(
        bu0,
        bu1,
        midZ + 0.6,
        bz1,
        Math.max(10, blk.height * 0.82),
        0,
        (blk.facadeStyle + 3) % 6,
        false
      );
    } else {
      addCityBuilding(
        bu0,
        bu1,
        bz0,
        bz1,
        blk.height,
        blk.setbackHeight,
        blk.facadeStyle,
        blk.hasTowerCrown
      );
    }

    // Streetlamps & street trees along major avenues & every other corner
    if ((blk.col + blk.row) % 2 === 0) {
      const lx = uzToWorldX(blk.uMin + 0.85, blk.zMin + 0.85);
      lampCoords.push({ x: lx, z: blk.zMin + 0.85, rotY: 0 });
    }
    if (blk.col === 12 || blk.row === 14) {
      const sx = uzToWorldX(blk.uMax - 0.9, blk.zMax - 0.9);
      lampCoords.push({ x: sx, z: blk.zMax - 0.9, rotY: Math.PI });
    }
    if ((blk.col + blk.row) % 5 === 1) {
      const tx = uzToWorldX(blk.uMin + 1.25, (blk.zMin + blk.zMax) / 2);
      treeCoords.push({ x: tx, z: (blk.zMin + blk.zMax) / 2, scale: 0.92 });
    }
  }

  const sidewalkTex = createSidewalkTexture(maxAnisotropy);
  const sidewalkMesh = new THREE.Mesh(
    finalizeAccumulator(sidewalkAcc),
    new THREE.MeshStandardMaterial({
      map: sidewalkTex,
      roughness: 0.84,
      metalness: 0.02,
    })
  );
  sidewalkMesh.receiveShadow = true;
  worldGroup.add(sidewalkMesh);

  const parkGrassMesh = new THREE.Mesh(
    finalizeAccumulator(parkGrassAcc),
    new THREE.MeshStandardMaterial({ color: 0x4f7d4a, roughness: 0.92 })
  );
  parkGrassMesh.receiveShadow = true;
  worldGroup.add(parkGrassMesh);

  if (storefrontAcc.positions.length > 0) {
    const sfMesh = new THREE.Mesh(
      finalizeAccumulator(storefrontAcc),
      new THREE.MeshStandardMaterial({
        color: 0x1e242c,
        roughness: 0.32,
        metalness: 0.45,
      })
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

  const facadeMaterials: THREE.MeshStandardMaterial[] = [];
  facadeAccs.forEach((acc, styleIdx) => {
    if (acc.positions.length === 0) return;
    const { map, emissiveMap, roughnessMap } = createBuildingFacadeTextures(
      styleIdx,
      maxAnisotropy
    );
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

  // 4. Instanced Realistic Multi-Tier Trees & Architectural Streetlights
  if (treeCoords.length > 0) {
    const trunkInst = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.14, 0.24, 2.2, 8),
      new THREE.MeshStandardMaterial({ color: 0x5c3e2a, roughness: 0.92 }),
      treeCoords.length
    );
    const canopyLower = new THREE.InstancedMesh(
      new THREE.SphereGeometry(1.15, 12, 10),
      new THREE.MeshStandardMaterial({ color: 0x3e6e44, roughness: 0.85 }),
      treeCoords.length
    );
    const canopyUpper = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.88, 12, 10),
      new THREE.MeshStandardMaterial({ color: 0x4d8252, roughness: 0.82 }),
      treeCoords.length
    );
    const dummy = new THREE.Object3D();
    treeCoords.forEach((tc, i) => {
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
    { dx: 0, dz: 3.1, rotY: Math.PI, ax: 0, az: 2.25 },
    { dx: 3.1, dz: 0, rotY: -Math.PI / 2, ax: 2.25, az: 0 },
    { dx: -3.1, dz: 0, rotY: Math.PI / 2, ax: -2.25, az: 0 },
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

  // Upper Hotel Tower (Floors 2..6)
  const hotelUpper = new THREE.Mesh(new THREE.BoxGeometry(11.6, 17.5, 4.6), hotelFacadeMat);
  hotelUpper.position.set(0, 12.95, -2.1);
  hotelUpper.castShadow = true;
  hotelUpper.receiveShadow = true;
  loftPortalGroup.add(hotelUpper);

  // Setback Penthouse Floor & Crown
  const hotelPenthouse = new THREE.Mesh(new THREE.BoxGeometry(8.8, 3.8, 3.6), hotelFacadeMat);
  hotelPenthouse.position.set(0, 23.6, -2.1);
  loftPortalGroup.add(hotelPenthouse);

  const hotelCornice = new THREE.Mesh(new THREE.BoxGeometry(12.1, 0.65, 4.9), limestoneMat);
  hotelCornice.position.set(0, 21.8, -2.1);
  loftPortalGroup.add(hotelCornice);

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
      y1: 22.0,
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

  const loftDoorEntryPos = { x: loftDoorPos.x, z: loftDoorPos.z + 2.0 };
  const loftDoorThresholdPos = { x: loftDoorPos.x, z: loftDoorPos.z - 0.18 };

  function updateWorld(
    elapsed: number,
    delta: number,
    playerX: number,
    playerZ: number,
    mood: LightingMood
  ) {
    skyDome.setMood(mood);

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

  // Check building footprints (leaving 2.6m walkable sidewalk around every uneven block)
  for (const blk of blocks) {
    if (blk.kind !== 'building') continue;
    const bu0 = blk.uMin + 2.6 - radius;
    const bu1 = blk.uMax - 2.6 + radius;
    const bz0 = blk.zMin + 2.6 - radius;
    const bz1 = blk.zMax - 2.6 + radius;
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
      return blk.kind === 'loft_plaza' ? 0.17 : 0.14;
    }
  }
  return 0;
}
