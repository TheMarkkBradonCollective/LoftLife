import * as THREE from 'three';
import { CITY_LAYOUT, CITY_SLOPE, uzToWorldX, worldToU } from './cityLayout';
import type { LightingMood } from './types';

export interface TrafficSignalPhase {
  ewGreen: boolean;
  ewYellow: boolean;
  nsGreen: boolean;
  nsYellow: boolean;
}

export interface TrafficSystemHandles {
  trafficGroup: THREE.Group;
  updateTraffic: (
    delta: number,
    playerX: number,
    playerZ: number,
    mood: LightingMood
  ) => TrafficSignalPhase;
}

type VehicleKind = 'sedan' | 'suv' | 'taxi' | 'coupe' | 'bus';

interface RoadVehicle {
  group: THREE.Group;
  wheels: THREE.Mesh[];
  brakeMat: THREE.MeshStandardMaterial;
  headMat: THREE.MeshStandardMaterial;
  kind: VehicleKind;
  axis: 'horizontal' | 'diagonal';
  dir: 1 | -1;
  lineIndex: number;
  laneOffset: number;
  pos: number; // X for horizontal, Z for diagonal
  speed: number;
  maxSpeed: number;
  length: number;
  stopTimer: number;
  lastStopIdx: number;
}

interface MetroTrain {
  cars: THREE.Group[];
  wheels: THREE.Mesh[];
  dir: 1 | -1;
  zLane: number;
  xPos: number;
  speed: number;
  maxSpeed: number;
  stationWait: number;
  stoppedOnce: boolean;
  winMat: THREE.MeshStandardMaterial;
}

function createDestinationTexture(text: string, maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#0a0f0c';
  ctx.fillRect(0, 0, 256, 64);
  ctx.fillStyle = '#39ff14';
  ctx.font = 'bold 26px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 34);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function buildCarMesh(
  kind: VehicleKind,
  paintHex: number,
  shared: {
    glassMat: THREE.MeshPhysicalMaterial;
    tireMat: THREE.MeshStandardMaterial;
    rimMat: THREE.MeshStandardMaterial;
    trimMat: THREE.MeshStandardMaterial;
  }
): {
  group: THREE.Group;
  wheels: THREE.Mesh[];
  brakeMat: THREE.MeshStandardMaterial;
  headMat: THREE.MeshStandardMaterial;
} {
  const group = new THREE.Group();
  const wheels: THREE.Mesh[] = [];

  const bodyMat = new THREE.MeshPhysicalMaterial({
    color: paintHex,
    roughness: 0.24,
    metalness: 0.35,
    clearcoat: 0.92,
    clearcoatRoughness: 0.12,
  });

  const headMat = new THREE.MeshStandardMaterial({
    color: 0xfff8e6,
    emissive: 0xffe6a8,
    emissiveIntensity: 0.65,
    roughness: 0.15,
  });

  const brakeMat = new THREE.MeshStandardMaterial({
    color: 0xdc2626,
    emissive: 0xef4444,
    emissiveIntensity: 0.5,
    roughness: 0.2,
  });

  const isSuv = kind === 'suv';
  const isCoupe = kind === 'coupe';
  const length = isSuv ? 4.55 : isCoupe ? 4.25 : 4.4;
  const width = isSuv ? 1.92 : 1.82;
  const lowerH = isSuv ? 0.68 : 0.56;
  const cabinH = isSuv ? 0.62 : isCoupe ? 0.44 : 0.5;
  const cabinL = isSuv ? 2.65 : isCoupe ? 1.85 : 2.15;
  const wheelR = isSuv ? 0.38 : 0.33;

  // Lower chassis
  const lower = new THREE.Mesh(new THREE.BoxGeometry(width, lowerH, length), bodyMat);
  lower.position.y = wheelR + lowerH * 0.44;
  lower.castShadow = true;
  lower.receiveShadow = true;
  group.add(lower);

  // Front & rear bumpers
  const fBumper = new THREE.Mesh(
    new THREE.BoxGeometry(width * 0.98, 0.2, 0.16),
    shared.trimMat
  );
  fBumper.position.set(0, wheelR + 0.1, length / 2 + 0.03);
  group.add(fBumper);

  const rBumper = new THREE.Mesh(
    new THREE.BoxGeometry(width * 0.98, 0.2, 0.16),
    shared.trimMat
  );
  rBumper.position.set(0, wheelR + 0.1, -length / 2 - 0.03);
  group.add(rBumper);

  // Grille
  const grille = new THREE.Mesh(
    new THREE.BoxGeometry(width * 0.54, 0.2, 0.04),
    shared.trimMat
  );
  grille.position.set(0, wheelR + 0.3, length / 2 + 0.01);
  group.add(grille);

  // Upper cabin & sloped greenhouse
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(width * 0.84, cabinH, cabinL),
    bodyMat
  );
  cabin.position.set(0, wheelR + lowerH * 0.92 + cabinH * 0.46, isSuv ? -0.35 : -0.2);
  cabin.castShadow = true;
  group.add(cabin);

  // Windshield & rear glass
  const fGlass = new THREE.Mesh(
    new THREE.BoxGeometry(width * 0.78, cabinH * 0.78, 0.05),
    shared.glassMat
  );
  fGlass.position.set(
    0,
    wheelR + lowerH * 0.92 + cabinH * 0.44,
    (isSuv ? -0.35 : -0.2) + cabinL / 2 + 0.01
  );
  fGlass.rotation.x = -0.32;
  group.add(fGlass);

  // Side windows strip
  const sideGlass = new THREE.Mesh(
    new THREE.BoxGeometry(width * 0.86, cabinH * 0.7, cabinL * 0.86),
    shared.glassMat
  );
  sideGlass.position.set(0, wheelR + lowerH * 0.92 + cabinH * 0.48, isSuv ? -0.35 : -0.2);
  group.add(sideGlass);

  // Taxi roof light
  if (kind === 'taxi') {
    const sign = new THREE.Mesh(
      new THREE.BoxGeometry(0.46, 0.14, 0.22),
      new THREE.MeshStandardMaterial({
        color: 0xfef08a,
        emissive: 0xfacc15,
        emissiveIntensity: 1.0,
      })
    );
    sign.position.set(0, wheelR + lowerH + cabinH + 0.06, -0.1);
    group.add(sign);
  }

  // Headlights & Taillights
  for (const lx of [-width * 0.34, width * 0.34]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.13, 0.05), headMat);
    hl.position.set(lx, wheelR + 0.36, length / 2 + 0.01);
    group.add(hl);

    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.12, 0.05), brakeMat);
    tl.position.set(lx, wheelR + 0.38, -length / 2 - 0.01);
    group.add(tl);
  }

  // 4 Wheels + alloy rims
  const wheelGeo = new THREE.CylinderGeometry(wheelR, wheelR, 0.24, 16);
  wheelGeo.rotateZ(Math.PI / 2);
  const rimGeo = new THREE.CylinderGeometry(wheelR * 0.6, wheelR * 0.6, 0.255, 12);
  rimGeo.rotateZ(Math.PI / 2);

  const wheelbaseZ = length * 0.31;
  for (const [wx, wz] of [
    [-width / 2 + 0.06, wheelbaseZ],
    [width / 2 - 0.06, wheelbaseZ],
    [-width / 2 + 0.06, -wheelbaseZ],
    [width / 2 - 0.06, -wheelbaseZ],
  ]) {
    const w = new THREE.Mesh(wheelGeo, shared.tireMat);
    w.position.set(wx, wheelR, wz);
    const rim = new THREE.Mesh(rimGeo, shared.rimMat);
    w.add(rim);
    group.add(w);
    wheels.push(w);
  }

  return { group, wheels, brakeMat, headMat };
}

function buildBusMesh(
  destTex: THREE.CanvasTexture,
  shared: {
    glassMat: THREE.MeshPhysicalMaterial;
    tireMat: THREE.MeshStandardMaterial;
    rimMat: THREE.MeshStandardMaterial;
    trimMat: THREE.MeshStandardMaterial;
  }
): {
  group: THREE.Group;
  wheels: THREE.Mesh[];
  brakeMat: THREE.MeshStandardMaterial;
  headMat: THREE.MeshStandardMaterial;
} {
  const group = new THREE.Group();
  const wheels: THREE.Mesh[] = [];

  const bodyMat = new THREE.MeshPhysicalMaterial({
    color: 0xe6ebe7,
    roughness: 0.3,
    metalness: 0.2,
    clearcoat: 0.7,
  });
  const stripeMat = new THREE.MeshStandardMaterial({
    color: 0x16a34a,
    roughness: 0.35,
    metalness: 0.25,
  });
  const neonAccentMat = new THREE.MeshStandardMaterial({
    color: 0x39ff14,
    emissive: 0x39ff14,
    emissiveIntensity: 0.75,
  });
  const headMat = new THREE.MeshStandardMaterial({
    color: 0xfff8e6,
    emissive: 0xffe6a8,
    emissiveIntensity: 0.75,
  });
  const brakeMat = new THREE.MeshStandardMaterial({
    color: 0xdc2626,
    emissive: 0xef4444,
    emissiveIntensity: 0.55,
  });

  const length = 9.4;
  const width = 2.42;
  const height = 2.65;
  const wheelR = 0.46;

  // Main Transit Coach Hull
  const hull = new THREE.Mesh(new THREE.BoxGeometry(width, height, length), bodyMat);
  hull.position.y = wheelR + height * 0.45;
  hull.castShadow = true;
  hull.receiveShadow = true;
  group.add(hull);

  // Electric Green Lower Skirt Stripe
  const skirt = new THREE.Mesh(
    new THREE.BoxGeometry(width + 0.02, 0.55, length + 0.02),
    stripeMat
  );
  skirt.position.y = wheelR + 0.36;
  group.add(skirt);

  const neonLine = new THREE.Mesh(
    new THREE.BoxGeometry(width + 0.04, 0.07, length + 0.03),
    neonAccentMat
  );
  neonLine.position.y = wheelR + 0.66;
  group.add(neonLine);

  // Panoramic Side & Front Windows
  const sideWin = new THREE.Mesh(
    new THREE.BoxGeometry(width + 0.03, 1.05, length * 0.84),
    shared.glassMat
  );
  sideWin.position.set(0, wheelR + 1.56, -0.1);
  group.add(sideWin);

  const windshield = new THREE.Mesh(
    new THREE.BoxGeometry(width * 0.9, 1.25, 0.06),
    shared.glassMat
  );
  windshield.position.set(0, wheelR + 1.48, length / 2 + 0.01);
  group.add(windshield);

  // Front LED Destination Board
  const destBoard = new THREE.Mesh(
    new THREE.PlaneGeometry(1.75, 0.34),
    new THREE.MeshBasicMaterial({ map: destTex })
  );
  destBoard.position.set(0, wheelR + 2.26, length / 2 + 0.02);
  group.add(destBoard);

  // Rooftop HVAC pods
  for (const az of [-2.1, 1.4]) {
    const hvac = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.24, 1.75), shared.trimMat);
    hvac.position.set(0, wheelR + height * 0.95 + 0.1, az);
    group.add(hvac);
  }

  for (const lx of [-width * 0.38, width * 0.38]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.16, 0.06), headMat);
    hl.position.set(lx, wheelR + 0.38, length / 2 + 0.02);
    group.add(hl);

    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.22, 0.06), brakeMat);
    tl.position.set(lx, wheelR + 0.48, -length / 2 - 0.02);
    group.add(tl);
  }

  // 4 Heavy Transit Wheels
  const wheelGeo = new THREE.CylinderGeometry(wheelR, wheelR, 0.32, 16);
  wheelGeo.rotateZ(Math.PI / 2);
  const rimGeo = new THREE.CylinderGeometry(wheelR * 0.56, wheelR * 0.56, 0.34, 12);
  rimGeo.rotateZ(Math.PI / 2);

  for (const [wx, wz] of [
    [-width / 2 + 0.06, 2.85],
    [width / 2 - 0.06, 2.85],
    [-width / 2 + 0.06, -2.75],
    [width / 2 - 0.06, -2.75],
  ]) {
    const w = new THREE.Mesh(wheelGeo, shared.tireMat);
    w.position.set(wx, wheelR, wz);
    w.add(new THREE.Mesh(rimGeo, shared.rimMat));
    group.add(w);
    wheels.push(w);
  }

  return { group, wheels, brakeMat, headMat };
}

function buildMetroCar(
  isLead: boolean,
  isTail: boolean,
  winMat: THREE.MeshStandardMaterial,
  shared: {
    tireMat: THREE.MeshStandardMaterial;
    trimMat: THREE.MeshStandardMaterial;
  }
): { group: THREE.Group; wheels: THREE.Mesh[] } {
  const group = new THREE.Group();
  const wheels: THREE.Mesh[] = [];

  const steelMat = new THREE.MeshPhysicalMaterial({
    color: 0xcbd5e1,
    roughness: 0.24,
    metalness: 0.72,
    clearcoat: 0.5,
  });
  const stripeMat = new THREE.MeshStandardMaterial({
    color: 0x39ff14,
    emissive: 0x22c55e,
    emissiveIntensity: 0.6,
    roughness: 0.3,
  });

  const carLen = 13.8;
  const carW = 2.85;
  const carH = 2.95;

  const body = new THREE.Mesh(new THREE.BoxGeometry(carW, carH, carLen), steelMat);
  body.position.y = carH / 2 + 0.32;
  body.castShadow = true;
  group.add(body);

  // Neon green transit stripe along sides
  const stripe = new THREE.Mesh(
    new THREE.BoxGeometry(carW + 0.04, 0.22, carLen + 0.02),
    stripeMat
  );
  stripe.position.y = 1.05;
  group.add(stripe);

  // Continuous side passenger windows
  const winStrip = new THREE.Mesh(
    new THREE.BoxGeometry(carW + 0.04, 0.98, carLen - 1.2),
    winMat
  );
  winStrip.position.y = 2.02;
  group.add(winStrip);

  // Dark roof HVAC
  const roofPod = new THREE.Mesh(
    new THREE.BoxGeometry(1.8, 0.26, carLen * 0.72),
    shared.trimMat
  );
  roofPod.position.y = carH + 0.44;
  group.add(roofPod);

  if (isLead || isTail) {
    const cabGlass = new THREE.Mesh(
      new THREE.BoxGeometry(carW * 0.84, 1.15, 0.14),
      new THREE.MeshPhysicalMaterial({
        color: 0x0f172a,
        roughness: 0.08,
        metalness: 0.3,
        clearcoat: 0.9,
      })
    );
    cabGlass.position.set(0, 2.05, isLead ? carLen / 2 + 0.02 : -carLen / 2 - 0.02);
    group.add(cabGlass);

    const headMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: isLead ? 0xfef9c3 : 0xef4444,
      emissiveIntensity: 1.4,
    });
    for (const hx of [-0.9, 0.9]) {
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.16, 0.08), headMat);
      lamp.position.set(hx, 0.92, isLead ? carLen / 2 + 0.04 : -carLen / 2 - 0.04);
      group.add(lamp);
    }
  }

  // Steel bogie wheels
  const wheelGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.18, 12);
  wheelGeo.rotateZ(Math.PI / 2);
  for (const bz of [-4.4, 4.4]) {
    for (const bx of [-1.05, 1.05]) {
      const w = new THREE.Mesh(wheelGeo, shared.tireMat);
      w.position.set(bx, 0.28, bz);
      group.add(w);
      wheels.push(w);
    }
  }

  // Rotate train mesh so +Z local axis faces +X world axis cleanly
  group.rotation.y = Math.PI / 2;
  return { group, wheels };
}

export function createCityTraffic(maxAnisotropy: number): TrafficSystemHandles {
  const trafficGroup = new THREE.Group();

  const shared = {
    glassMat: new THREE.MeshPhysicalMaterial({
      color: 0x162231,
      roughness: 0.08,
      metalness: 0.15,
      clearcoat: 0.9,
      transparent: true,
      opacity: 0.88,
    }),
    tireMat: new THREE.MeshStandardMaterial({ color: 0x18191c, roughness: 0.85 }),
    rimMat: new THREE.MeshStandardMaterial({ color: 0xcbd5e1, roughness: 0.25, metalness: 0.85 }),
    trimMat: new THREE.MeshStandardMaterial({ color: 0x20242b, roughness: 0.55, metalness: 0.3 }),
  };

  const destTex = createDestinationTexture('LOFTLINE · M ST', maxAnisotropy);
  const { uLines, zLines, uIsMajor, zIsMajor, bounds, busStops, metroLineZ } = CITY_LAYOUT;

  const vehicles: RoadVehicle[] = [];
  const carColors = [0xd9e0e8, 0x1f2937, 0x2f5a8a, 0x8f2d2d, 0x3b6b58, 0x6b7280, 0xb88635];

  // 1. Spawn Cars across major Horizontal & Diagonal streets
  // Priority corridors: every avenue plus the M Street boulevard.
  const majorRows = [4, 9, 14, 19, 24];
  const majorCols = [0, 4, 8, 12, 16, 20, 25];

  for (let i = 0; i < 16; i++) {
    const isDiag = i % 2 === 1;
    const dir: 1 | -1 = i % 4 < 2 ? 1 : -1;
    const kinds: VehicleKind[] = ['sedan', 'suv', 'taxi', 'coupe'];
    const kind = kinds[i % kinds.length];
    const color = kind === 'taxi' ? 0xf5b718 : carColors[i % carColors.length];

    const built = buildCarMesh(kind, color, shared);
    trafficGroup.add(built.group);

    if (!isDiag) {
      const row = majorRows[(i >> 1) % majorRows.length];
      const laneOffsets = zIsMajor[row] ? [2.0, 4.9] : [2.4];
      const laneOffset = laneOffsets[(i + row) % laneOffsets.length];
      const pos = bounds.uMin + ((i * 79) % (bounds.uMax - bounds.uMin));
      vehicles.push({
        group: built.group,
        wheels: built.wheels,
        brakeMat: built.brakeMat,
        headMat: built.headMat,
        kind,
        axis: 'horizontal',
        dir,
        lineIndex: row,
        laneOffset,
        pos,
        speed: 8.5,
        maxSpeed: 9.2 + (i % 3) * 1.1,
        length: 4.5,
        stopTimer: 0,
        lastStopIdx: -1,
      });
    } else {
      const col = majorCols[(i >> 1) % majorCols.length];
      // M Street carries four lanes each way, clear of its planted median.
      const laneOffsets =
        col === 12 ? [2.8, 6.4, 10.0, 13.0] : uIsMajor[col] ? [2.0, 5.2] : [2.4];
      const laneOffset = laneOffsets[(i + col) % laneOffsets.length];
      const pos = bounds.zMin + ((i * 73) % (bounds.zMax - bounds.zMin));
      vehicles.push({
        group: built.group,
        wheels: built.wheels,
        brakeMat: built.brakeMat,
        headMat: built.headMat,
        kind,
        axis: 'diagonal',
        dir,
        lineIndex: col,
        laneOffset,
        pos,
        speed: 8.2,
        maxSpeed: 8.8 + (i % 3) * 1.0,
        length: 4.5,
        stopTimer: 0,
        lastStopIdx: -1,
      });
    }
  }

  // 2. Spawn 4 City Transit Buses on Downtown Boulevards (15th St, 16th St, M St, N St)
  const busSpecs: { axis: 'horizontal' | 'diagonal'; lineIndex: number; dir: 1 | -1; pos: number }[] =
    [
      { axis: 'horizontal', lineIndex: 14, dir: 1, pos: -120 }, // 15th St Eastbound (stops at Loft Plaza!)
      { axis: 'horizontal', lineIndex: 14, dir: -1, pos: 110 }, // 15th St Westbound
      { axis: 'diagonal', lineIndex: 12, dir: 1, pos: -95 },   // M St South-East
      { axis: 'diagonal', lineIndex: 12, dir: -1, pos: 85 },   // M St North-West
    ];

  for (const bs of busSpecs) {
    const built = buildBusMesh(destTex, shared);
    trafficGroup.add(built.group);
    vehicles.push({
      group: built.group,
      wheels: built.wheels,
      brakeMat: built.brakeMat,
      headMat: built.headMat,
      kind: 'bus',
      axis: bs.axis,
      dir: bs.dir,
      lineIndex: bs.lineIndex,
      // Kerbside bus lane: outer lane on the boulevard, lane 2 elsewhere.
      laneOffset: bs.lineIndex === 12 ? 12.9 : 4.9,
      pos: bs.pos,
      speed: 7.0,
      maxSpeed: 7.6,
      length: 9.4,
      stopTimer: 0,
      lastStopIdx: -1,
    });
  }

  // 3. Elevated Metro Trains (2 x 3-Car Articulated Trains along 16th St Viaduct y = 6.55m)
  const metroWinMat = new THREE.MeshStandardMaterial({
    color: 0xffeeb8,
    emissive: 0xffd578,
    emissiveIntensity: 0.9,
    roughness: 0.2,
  });

  const trains: MetroTrain[] = [];
  const trainDirs: (1 | -1)[] = [1, -1];
  trainDirs.forEach((dir, idx) => {
    const cars: THREE.Group[] = [];
    const wheels: THREE.Mesh[] = [];
    for (let c = 0; c < 3; c++) {
      const built = buildMetroCar(c === 0, c === 2, metroWinMat, shared);
      if (dir === -1) built.group.rotation.y = -Math.PI / 2;
      trafficGroup.add(built.group);
      cars.push(built.group);
      wheels.push(...built.wheels);
    }
    trains.push({
      cars,
      wheels,
      dir,
      zLane: metroLineZ + (dir === 1 ? 1.85 : -1.85),
      xPos: idx === 0 ? -140 : 120,
      speed: 18,
      maxSpeed: 20,
      stationWait: 0,
      stoppedOnce: false,
      winMat: metroWinMat,
    });
  });

  const diagAngle = Math.atan2(CITY_SLOPE, 1);
  const diagLenFactor = Math.hypot(CITY_SLOPE, 1);
  let cycleTimer = 0;

  function updateTraffic(
    delta: number,
    playerX: number,
    playerZ: number,
    mood: LightingMood
  ): TrafficSignalPhase {
    cycleTimer = (cycleTimer + delta) % 23;
    const phase: TrafficSignalPhase = {
      ewGreen: cycleTimer < 9.0,
      ewYellow: cycleTimer >= 9.0 && cycleTimer < 11.5,
      nsGreen: cycleTimer >= 11.5 && cycleTimer < 20.5,
      nsYellow: cycleTimer >= 20.5,
    };

    const nightFactor = mood === 'night' ? 1.65 : mood === 'golden' ? 1.1 : 0.55;
    metroWinMat.emissiveIntensity = mood === 'night' ? 1.6 : 0.75;

    // Update road cars & buses
    const spanU = bounds.uMax - bounds.uMin + 30;
    const spanZ = bounds.zMax - bounds.zMin + 30;

    for (let vi = 0; vi < vehicles.length; vi++) {
      const v = vehicles[vi];
      let shouldBrake = false;

      if (v.stopTimer > 0) {
        v.stopTimer = Math.max(0, v.stopTimer - delta);
        shouldBrake = true;
      }

      // Compute current world coordinates & tangent
      let wx = 0;
      let wz = 0;
      let fwdX = 0;
      let fwdZ = 0;

      if (v.axis === 'horizontal') {
        wz = zLines[v.lineIndex] + v.dir * v.laneOffset;
        wx = uzToWorldX(v.pos, wz);
        fwdX = v.dir;
        fwdZ = 0;

        // Check red/yellow lights ahead along horizontal road
        if (!phase.ewGreen) {
          const curU = v.pos;
          for (let ci = 0; ci < CITY_LAYOUT.signalIntersections.length; ci++) {
            const sig = CITY_LAYOUT.signalIntersections[ci];
            if (sig.row !== v.lineIndex) continue;
            const interU = uLines[sig.col] - v.dir * (CITY_LAYOUT.uHalfWidths[sig.col] + 3.8);
            const distAhead = (interU - curU) * v.dir;
            if (distAhead > 0 && distAhead < 8.5) {
              shouldBrake = true;
              break;
            }
          }
        }

        // Bus stops along 15th St
        if (v.kind === 'bus' && v.stopTimer <= 0) {
          for (let bi = 0; bi < busStops.length; bi++) {
            const bs = busStops[bi];
            if (Math.abs(bs.z - wz) < 5.5 && Math.abs(bs.x - wx) < 3.5 && v.lastStopIdx !== bi) {
              v.stopTimer = 2.6;
              v.lastStopIdx = bi;
              shouldBrake = true;
              break;
            }
          }
        }
      } else {
        wz = v.pos;
        const u = uLines[v.lineIndex] - v.dir * v.laneOffset;
        wx = uzToWorldX(u, wz);
        fwdX = (v.dir * CITY_SLOPE) / diagLenFactor;
        fwdZ = v.dir / diagLenFactor;

        if (!phase.nsGreen) {
          for (let ci = 0; ci < CITY_LAYOUT.signalIntersections.length; ci++) {
            const sig = CITY_LAYOUT.signalIntersections[ci];
            if (sig.col !== v.lineIndex) continue;
            const stopZ = zLines[sig.row] - v.dir * (CITY_LAYOUT.zHalfWidths[sig.row] + 3.8);
            const distAhead = (stopZ - wz) * v.dir;
            if (distAhead > 0 && distAhead < 8.5) {
              shouldBrake = true;
              break;
            }
          }
        }
      }

      // Yield to player if standing directly in front of vehicle
      const toPx = playerX - wx;
      const toPz = playerZ - wz;
      const forwardDot = toPx * fwdX + toPz * fwdZ;
      const sideDist = Math.abs(toPx * -fwdZ + toPz * fwdX);
      if (forwardDot > 0 && forwardDot < v.length * 0.5 + 4.8 && sideDist < 1.85) {
        shouldBrake = true;
      }

      // Yield to vehicle ahead on same lane
      for (let oi = 0; oi < vehicles.length; oi++) {
        if (oi === vi) continue;
        const o = vehicles[oi];
        if (o.axis !== v.axis || o.lineIndex !== v.lineIndex || o.dir !== v.dir) continue;
        const dLane = (o.pos - v.pos) * v.dir;
        if (dLane > 0 && dLane < (v.length + o.length) * 0.5 + 4.5) {
          shouldBrake = true;
          break;
        }
      }

      const targetSpeed = shouldBrake ? 0 : v.maxSpeed;
      const accelRate = shouldBrake ? 16 : 6;
      v.speed = THREE.MathUtils.lerp(v.speed, targetSpeed, 1 - Math.exp(-accelRate * delta));
      if (v.speed < 0.08 && shouldBrake) v.speed = 0;

      // Advance along street
      if (v.axis === 'horizontal') {
        v.pos += v.dir * v.speed * delta;
        if (v.dir === 1 && v.pos > bounds.uMax + 15) {
          v.pos -= spanU;
          v.lastStopIdx = -1;
        } else if (v.dir === -1 && v.pos < bounds.uMin - 15) {
          v.pos += spanU;
          v.lastStopIdx = -1;
        }
        wz = zLines[v.lineIndex] + v.dir * v.laneOffset;
        wx = uzToWorldX(v.pos, wz);
        v.group.position.set(wx, 0.02, wz);
        v.group.rotation.y = v.dir === 1 ? Math.PI / 2 : -Math.PI / 2;
      } else {
        v.pos += (v.dir * v.speed * delta) / diagLenFactor;
        if (v.dir === 1 && v.pos > bounds.zMax + 15) {
          v.pos -= spanZ;
          v.lastStopIdx = -1;
        } else if (v.dir === -1 && v.pos < bounds.zMin - 15) {
          v.pos += spanZ;
          v.lastStopIdx = -1;
        }
        wz = v.pos;
        const u = uLines[v.lineIndex] - v.dir * v.laneOffset;
        wx = uzToWorldX(u, wz);
        v.group.position.set(wx, 0.02, wz);
        v.group.rotation.y = v.dir === 1 ? diagAngle : diagAngle + Math.PI;
      }

      // Spin wheels proportional to road speed
      const wheelSpin = v.speed * delta * 2.6;
      for (const w of v.wheels) {
        w.rotation.x += wheelSpin;
      }

      v.brakeMat.emissiveIntensity = shouldBrake ? 1.9 : 0.45 * nightFactor;
      v.headMat.emissiveIntensity = nightFactor;
    }

    // Update Elevated Metro Trains
    const stationX = uzToWorldX(uLines[12], metroLineZ);
    const minTrainX = bounds.uMin + CITY_SLOPE * metroLineZ - 80;
    const maxTrainX = bounds.uMax + CITY_SLOPE * metroLineZ + 80;

    for (const tr of trains) {
      if (tr.stationWait > 0) {
        tr.stationWait -= delta;
        tr.speed = 0;
      } else {
        const distToStation = (stationX - tr.xPos) * tr.dir;
        if (!tr.stoppedOnce && distToStation > 0 && distToStation < 26) {
          const desired = Math.max(0, (distToStation / 26) * tr.maxSpeed);
          tr.speed = THREE.MathUtils.lerp(tr.speed, desired, 1 - Math.exp(-5 * delta));
          if (distToStation < 0.9) {
            tr.stationWait = 3.0;
            tr.stoppedOnce = true;
            tr.speed = 0;
          }
        } else {
          tr.speed = THREE.MathUtils.lerp(tr.speed, tr.maxSpeed, 1 - Math.exp(-2.8 * delta));
        }

        tr.xPos += tr.dir * tr.speed * delta;
        if (tr.dir === 1 && tr.xPos > maxTrainX) {
          tr.xPos = minTrainX;
          tr.stoppedOnce = false;
        } else if (tr.dir === -1 && tr.xPos < minTrainX) {
          tr.xPos = maxTrainX;
          tr.stoppedOnce = false;
        }
      }

      const spacing = 14.35;
      tr.cars.forEach((car, ci) => {
        const cx = tr.xPos - tr.dir * ci * spacing;
        car.position.set(cx, 6.52, tr.zLane);
      });

      const spin = tr.speed * delta * 2.8;
      for (const w of tr.wheels) {
        w.rotation.x += spin;
      }
    }

    return phase;
  }

  return {
    trafficGroup,
    updateTraffic,
  };
}
