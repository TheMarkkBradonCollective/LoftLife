import * as THREE from 'three';
import { createAvatarRig, type AvatarRig } from './avatar';
import type { AvatarConfig, EmoteType } from './types';

/**
 * TheCity International Airport — a walkable terminal interior.
 *
 * The city block only shows the exterior and entrance; this module is the
 * inside: check-in, security, departure lounge, gates, baggage claim, café and
 * arrivals. It uses the same avatar, collision and interaction contracts as the
 * hotel lobby so multiplayer and both camera modes work unchanged.
 */

export interface AirportSeat {
  id: string;
  label: string;
  seatPos: { x: number; y: number; z: number };
  approachPos: { x: number; z: number };
  facingYaw: number;
}

export interface AirportNpc {
  id: string;
  name: string;
  greeting: string;
  rig: AvatarRig;
  x: number;
  z: number;
  yaw: number;
  greetTimer: number;
}

export interface AirportHandles {
  airportGroup: THREE.Group;
  groundRaycastPlane: THREE.Mesh;
  entrancePos: { x: number; z: number };
  checkInPos: { x: number; z: number };
  gatePos: { x: number; z: number };
  baggagePos: { x: number; z: number };
  cafePos: { x: number; z: number };
  seats: AirportSeat[];
  npcs: AirportNpc[];
  updateAirport: (elapsed: number, delta: number) => void;
  isWalkable: (x: number, z: number, radius?: number) => boolean;
}

function textTexture(
  width: number,
  height: number,
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
  anisotropy = 4
) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  draw(ctx, width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = anisotropy;
  return texture;
}

function box(w: number, h: number, d: number, material: THREE.Material) {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
}

function add(
  group: THREE.Object3D,
  mesh: THREE.Object3D,
  x = 0,
  y = 0,
  z = 0,
  rx = 0,
  ry = 0,
  rz = 0
) {
  mesh.position.set(x, y, z);
  mesh.rotation.set(rx, ry, rz);
  group.add(mesh);
  return mesh;
}

function signMesh(
  group: THREE.Group,
  label: string,
  sub: string,
  x: number,
  y: number,
  z: number,
  width = 3.2,
  height = 0.7,
  bg = '#102027',
  fg = '#f4fbff',
  accent = '#39ff14',
  anisotropy = 4
) {
  const texture = textTexture(
    512,
    112,
    (ctx, w, h) => {
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = accent;
      ctx.lineWidth = 5;
      ctx.strokeRect(4, 4, w - 8, h - 8);
      ctx.fillStyle = fg;
      ctx.font = 'bold 40px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(label, w / 2, 50);
      ctx.fillStyle = accent;
      ctx.font = '600 22px sans-serif';
      ctx.fillText(sub, w / 2, 84);
    },
    anisotropy
  );
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true })
  );
  add(group, mesh, x, y, z);
  return mesh;
}

function buildSeatRun(
  group: THREE.Group,
  centerX: number,
  centerZ: number,
  count: number,
  facing: 'north' | 'south' | 'east' | 'west',
  material: THREE.Material,
  metal: THREE.Material
) {
  const run = new THREE.Group();
  run.position.set(centerX, 0, centerZ);
  const reverse = facing === 'south' || facing === 'west';
  const rotation = facing === 'east' || facing === 'west' ? Math.PI / 2 : 0;
  run.rotation.y = rotation;
  const spacing = 0.68;
  for (let i = 0; i < count; i++) {
    const x = (i - (count - 1) / 2) * spacing;
    add(run, box(0.56, 0.09, 0.52, material), x, 0.46, 0);
    add(run, box(0.56, 0.55, 0.08, material), x, 0.75, reverse ? 0.23 : -0.23);
    for (const sx of [-1, 1]) {
      add(run, new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.024, 0.42, 8), metal), x + sx * 0.22, 0.22, 0.18);
      add(run, new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.024, 0.42, 8), metal), x + sx * 0.22, 0.22, -0.18);
    }
  }
  // Shared armrest rail
  add(run, box(count * spacing + 0.1, 0.05, 0.05, metal), 0, 0.5, 0);
  group.add(run);
  return run;
}

function buildPlaneSilhouette(glassMat: THREE.Material) {
  const plane = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xeef2f4, roughness: 0.4, metalness: 0.18 });
  add(plane, new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.3, 22, 14), bodyMat), 0, 1.5, 0, 0, 0, Math.PI / 2);
  add(plane, new THREE.Mesh(new THREE.ConeGeometry(1.3, 3.2, 14), bodyMat), 12.6, 1.5, 0, 0, 0, -Math.PI / 2);
  add(plane, box(7, 0.22, 1.7, bodyMat), 0, 1.4, 0);
  add(plane, box(3.4, 0.18, 1.2, bodyMat), -10.4, 2.7, 0);
  add(plane, box(0.18, 2.6, 1.2, bodyMat), -10.4, 2.6, 0);
  const tailMat = new THREE.MeshStandardMaterial({ color: 0x2a6f9e, roughness: 0.42, metalness: 0.2 });
  add(plane, box(0.3, 2.5, 3.4, tailMat), -10.8, 2.5, 0);
  return plane;
}

export function buildAirportTerminal(maxAnisotropy: number): AirportHandles {
  const airportGroup = new THREE.Group();
  airportGroup.name = 'airport-terminal';

  const floorTex = textTexture(
    512,
    512,
    (ctx, w, h) => {
      ctx.fillStyle = '#d7d2c8';
      ctx.fillRect(0, 0, w, h);
      for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
          ctx.fillStyle = (x + y) % 2 ? '#cec8bd' : '#e2ddd3';
          ctx.fillRect(x * 64 + 1, y * 64 + 1, 62, 62);
        }
      }
      ctx.strokeStyle = 'rgba(92,84,72,0.15)';
      ctx.lineWidth = 2;
      for (let i = 0; i <= 8; i++) {
        ctx.beginPath();
        ctx.moveTo(i * 64, 0);
        ctx.lineTo(i * 64, h);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, i * 64);
        ctx.lineTo(w, i * 64);
        ctx.stroke();
      }
    },
    maxAnisotropy
  );
  floorTex.wrapS = THREE.RepeatWrapping;
  floorTex.wrapT = THREE.RepeatWrapping;
  floorTex.repeat.set(7, 5);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(50, 30),
    new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.32, metalness: 0.06 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  airportGroup.add(floor);

  const slab = box(50.6, 0.4, 30.6, new THREE.MeshStandardMaterial({ color: 0x30343a, roughness: 0.8 }));
  add(airportGroup, slab, 0, -0.21, 0);
  const groundRaycastPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(50, 30),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  groundRaycastPlane.rotation.x = -Math.PI / 2;
  groundRaycastPlane.position.y = 0.01;
  airportGroup.add(groundRaycastPlane);

  const wallMat = new THREE.MeshStandardMaterial({ color: 0xe9e5dc, roughness: 0.72 });
  const panelMat = new THREE.MeshStandardMaterial({ color: 0xf5f2ea, roughness: 0.62 });
  const steelMat = new THREE.MeshStandardMaterial({ color: 0x8f979f, roughness: 0.3, metalness: 0.72 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x1c242b, roughness: 0.38, metalness: 0.35 });
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0xbfe2ef,
    roughness: 0.06,
    metalness: 0.12,
    transparent: true,
    opacity: 0.3,
    side: THREE.DoubleSide,
  });
  const accentMat = new THREE.MeshStandardMaterial({
    color: 0x39ff14,
    emissive: 0x39ff14,
    emissiveIntensity: 0.55,
    roughness: 0.35,
  });
  const blueMat = new THREE.MeshStandardMaterial({
    color: 0x2a6f9e,
    emissive: 0x1d5c86,
    emissiveIntensity: 0.35,
    roughness: 0.4,
  });
  const warmMat = new THREE.MeshStandardMaterial({ color: 0x8a5a34, roughness: 0.6 });

  // Shell: north wall is glass, east/west are solid with window bands, south has
  // the entrance opening. The roof is a floating truss ceiling with skylights.
  for (const [x0, x1] of [
    [-25, -2.6],
    [2.6, 25],
  ]) {
    add(airportGroup, box(x1 - x0, 0.7, 0.4, wallMat), (x0 + x1) / 2, 0.35, 15);
  }
  add(airportGroup, box(5.2, 0.55, 0.42, steelMat), 0, 7.5, 15);
  for (const sx of [-25, 25]) {
    add(airportGroup, box(0.4, 7.4, 30, wallMat), sx, 3.7, 0);
  }
  // North glass curtain wall with mullions.
  add(airportGroup, new THREE.Mesh(new THREE.PlaneGeometry(49, 6.6), glassMat), 0, 3.5, -14.8);
  for (let x = -24; x <= 24; x += 3) {
    add(airportGroup, box(0.09, 6.7, 0.12, steelMat), x, 3.4, -14.78);
    add(airportGroup, box(0.09, 6.7, 0.12, steelMat), x, 3.4, 14.78);
  }
  add(airportGroup, box(49, 0.16, 0.18, steelMat), 0, 1.2, -14.78);
  add(airportGroup, box(49, 0.16, 0.18, steelMat), 0, 6.1, -14.78);

  // East glass wall (apron view) and west clerestory.
  add(airportGroup, new THREE.Mesh(new THREE.PlaneGeometry(29, 6.2), glassMat), 24.8, 4.2, 0, 0, Math.PI / 2);
  for (let z = -14; z <= 14; z += 3.2) {
    add(airportGroup, box(0.12, 6.3, 0.09, steelMat), 24.78, 4.2, z);
  }
  add(airportGroup, new THREE.Mesh(new THREE.PlaneGeometry(29, 2.3), glassMat), -24.8, 5.1, 0, 0, Math.PI / 2);

  // Ceiling: white panels, structural ribs, skylight strips and linear lights.
  for (const z of [-10, -5, 0, 5, 10]) {
    add(airportGroup, box(49.4, 0.55, 0.7, panelMat), 0, 8.65, z);
  }
  for (const x of [-20, -10, 0, 10, 20]) {
    add(airportGroup, box(0.4, 0.42, 29.6, steelMat), x, 8.9, 0);
  }
  for (const x of [-16, -8, 0, 8, 16]) {
    add(airportGroup, box(6.5, 0.05, 0.24, new THREE.MeshStandardMaterial({ color: 0xfff8e7, emissive: 0xfff1d0, emissiveIntensity: 0.9 })), x, 8.3, 0);
  }

  // Structural columns.
  for (const x of [-18, -6, 6, 18]) {
    for (const z of [-9, 4]) {
      add(airportGroup, new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.4, 8.4, 12), steelMat), x, 4.2, z);
    }
  }

  // ── Check-in island ───────────────────────────────────────────────────────
  const checkInGroup = new THREE.Group();
  checkInGroup.position.set(0, 0, -11.2);
  for (let i = 0; i < 12; i++) {
    const x = -17.4 + i * 3.16;
    add(checkInGroup, box(2.5, 1.05, 0.82, panelMat), x, 0.55, 0);
    add(checkInGroup, box(2.58, 0.08, 0.9, darkMat), x, 1.1, 0);
    add(checkInGroup, box(0.52, 0.38, 0.04, new THREE.MeshStandardMaterial({ color: 0x0f1a21, emissive: 0x2a6f9e, emissiveIntensity: 0.45 })), x, 0.86, 0.43);
    add(checkInGroup, box(0.32, 0.03, 0.2, darkMat), x, 1.16, 0.2);
    add(checkInGroup, box(0.02, 2.5, 0.02, steelMat), x - 1.2, 2.35, -0.1);
    add(checkInGroup, box(0.02, 2.5, 0.02, steelMat), x + 1.2, 2.35, -0.1);
    const numTex = textTexture(128, 64, (ctx, w, h) => {
      ctx.fillStyle = '#102027';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 34px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${i + 1}`, w / 2, 45);
    });
    add(
      checkInGroup,
      new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.28), new THREE.MeshBasicMaterial({ map: numTex })),
      x,
      2.35,
      -0.06
    );
  }
  add(checkInGroup, box(44, 0.12, 0.08, steelMat), 0, 2.55, -0.18);
  airportGroup.add(checkInGroup);

  signMesh(airportGroup, 'DEPARTURES', 'CHECK-IN  ·  BAGGAGE DROP', 0, 6.4, -14.2, 8.5, 1.35, '#0d1b23', '#ffffff', '#39ff14', maxAnisotropy);

  // ── Flight information displays ───────────────────────────────────────────
  const flightRows = [
    ['LL 104', 'LONDON', '09:40', 'ON TIME', 'A2'],
    ['LL 228', 'TOKYO', '10:15', 'BOARDING', 'A4'],
    ['LL 316', 'PARIS', '10:55', 'ON TIME', 'B1'],
    ['LL 442', 'NEW YORK', '11:20', 'DELAYED', 'B3'],
    ['LL 587', 'SEOUL', '12:05', 'ON TIME', 'A1'],
    ['LL 611', 'LISBON', '12:40', 'ON TIME', 'B2'],
  ];
  const fidsTexture = textTexture(
    1024,
    512,
    (ctx, w, h) => {
      ctx.fillStyle = '#08131a';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#39ff14';
      ctx.font = 'bold 30px monospace';
      ctx.fillText('DEPARTURES', 34, 46);
      ctx.fillStyle = '#7f97a3';
      ctx.font = '600 18px monospace';
      ctx.fillText('FLIGHT', 34, 90);
      ctx.fillText('DESTINATION', 240, 90);
      ctx.fillText('TIME', 590, 90);
      ctx.fillText('STATUS', 750, 90);
      ctx.fillText('GATE', 930, 90);
      ctx.strokeStyle = 'rgba(57,255,20,0.4)';
      ctx.beginPath();
      ctx.moveTo(30, 104);
      ctx.lineTo(w - 30, 104);
      ctx.stroke();
      flightRows.forEach((row, i) => {
        const y = 148 + i * 56;
        ctx.fillStyle = '#e9f4f7';
        ctx.font = '600 22px monospace';
        ctx.fillText(row[0], 34, y);
        ctx.fillText(row[1], 240, y);
        ctx.fillStyle = '#ffffff';
        ctx.fillText(row[2], 590, y);
        ctx.fillStyle = row[3] === 'DELAYED' ? '#fbbf24' : row[3] === 'BOARDING' ? '#39ff14' : '#9fb6c2';
        ctx.fillText(row[3], 750, y);
        ctx.fillStyle = '#39ff14';
        ctx.fillText(row[4], 930, y);
      });
    },
    maxAnisotropy
  );
  for (const [x, z, ry] of [
    [-10, -5.5, 0],
    [0, -5.5, 0],
    [10, -5.5, 0],
  ] as const) {
    const frame = box(3.5, 2.1, 0.12, darkMat);
    add(airportGroup, frame, x, 4.55, z, 0, ry);
    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(3.3, 1.9),
      new THREE.MeshBasicMaterial({ map: fidsTexture })
    );
    add(airportGroup, screen, x, 4.55, z + 0.07, 0, ry);
    add(airportGroup, box(0.05, 2.6, 0.05, steelMat), x - 1.4, 6.7, z);
    add(airportGroup, box(0.05, 2.6, 0.05, steelMat), x + 1.4, 6.7, z);
  }

  // ── Security checkpoint ───────────────────────────────────────────────────
  const security = new THREE.Group();
  security.position.set(14.5, 0, -4.4);
  add(security, box(10.4, 0.9, 0.75, panelMat), 0, 0.45, 0);
  add(security, box(10.5, 0.08, 0.9, darkMat), 0, 0.92, 0);
  for (const x of [-3.2, 0, 3.2]) {
    add(security, new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.07, 10, 24, Math.PI), steelMat), x, 1.75, 0, 0, 0, Math.PI);
    add(security, box(0.08, 1.7, 0.1, steelMat), x - 0.62, 1.1, 0);
    add(security, box(0.08, 1.7, 0.1, steelMat), x + 0.62, 1.1, 0);
    add(security, new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.7), accentMat), x, 1.95, 0);
    add(security, box(0.72, 0.3, 0.5, darkMat), x, 1.08, 0.1);
  }
  add(security, box(10.4, 0.5, 0.06, blueMat), 0, 2.35, -0.38);
  airportGroup.add(security);
  signMesh(airportGroup, 'SECURITY', 'ALL PASSENGERS', 14.5, 3.1, -5.0, 3.6, 0.65, '#102027', '#ffffff', '#fbbf24', maxAnisotropy);

  // ── Departure lounge & gates ──────────────────────────────────────────────
  const gateLabels = ['A1', 'A2', 'A3', 'A4'];
  const gateZ = [-9.6, -3.2, 3.2, 9.6];
  gateZ.forEach((z, i) => {
    // Gate podium
    add(airportGroup, box(1.9, 1.05, 0.8, panelMat), 20.8, 0.53, z);
    add(airportGroup, box(1.98, 0.08, 0.88, darkMat), 20.8, 1.09, z);
    add(airportGroup, box(0.5, 0.34, 0.04, new THREE.MeshStandardMaterial({ color: 0x0d1720, emissive: 0x39ff14, emissiveIntensity: 0.35 })), 20.8, 0.83, z + 0.44);
    const gateSign = signMesh(airportGroup, `GATE ${gateLabels[i]}`, i === 1 ? 'BOARDING' : 'ON TIME', 23.2, 4.1, z, 2.4, 0.8, '#0d1b23', '#ffffff', i === 1 ? '#39ff14' : '#7f97a3', maxAnisotropy);
    gateSign.rotation.y = -Math.PI / 2;
    // Seating run faces the gate wall.
    buildSeatRun(airportGroup, 17.4, z, 5, 'east', darkMat, steelMat);
    add(airportGroup, box(0.12, 2.9, 3.2, glassMat), 24.4, 1.6, z, 0, 0, 0);
  });

  // Central lounge seating clusters.
  buildSeatRun(airportGroup, 4.5, 1.2, 6, 'north', new THREE.MeshStandardMaterial({ color: 0x4a5b6e, roughness: 0.8 }), steelMat);
  buildSeatRun(airportGroup, 4.5, 6.4, 6, 'south', new THREE.MeshStandardMaterial({ color: 0x4a5b6e, roughness: 0.8 }), steelMat);
  for (const [x, z] of [
    [1.2, 3.8],
    [7.6, 3.8],
  ]) {
    add(airportGroup, new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.06, 20), warmMat), x, 0.72, z);
    add(airportGroup, new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.7, 10), steelMat), x, 0.35, z);
  }

  // ── Baggage claim ─────────────────────────────────────────────────────────
  const baggage = new THREE.Group();
  baggage.position.set(-15.5, 0, 7.4);
  add(baggage, new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, 0.22, 32), darkMat), 0, 0.55, 0);
  add(baggage, new THREE.Mesh(new THREE.CylinderGeometry(2.35, 2.35, 0.24, 32), steelMat), 0, 0.57, 0);
  const belt = new THREE.Group();
  add(belt, new THREE.Mesh(new THREE.TorusGeometry(2.75, 0.18, 8, 40), new THREE.MeshStandardMaterial({ color: 0x343a41, roughness: 0.7 })), 0, 0.58, 0, Math.PI / 2);
  const luggageColors = [0x9e5440, 0x2f5d3f, 0x39465c, 0xc7b08e, 0x785874];
  const luggage: THREE.Object3D[] = [];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const bag = box(0.42, 0.28, 0.28, new THREE.MeshStandardMaterial({ color: luggageColors[i % luggageColors.length], roughness: 0.6 }));
    add(bag, box(0.12, 0.04, 0.04, darkMat), 0.0, 0.18, 0);
    add(belt, bag, Math.cos(a) * 2.75, 0.74, Math.sin(a) * 2.75, 0, -a + 0.4);
    luggage.push(bag);
  }
  baggage.add(belt);
  add(baggage, new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 1.6, 10), steelMat), 0, 1.4, 0);
  add(baggage, box(1.2, 0.4, 0.06, blueMat), 0, 2.25, 0);
  airportGroup.add(baggage);
  signMesh(airportGroup, 'BAGGAGE CLAIM', 'CAROUSEL 1', -15.5, 3.2, 4.4, 4.2, 0.75, '#0d1b23', '#ffffff', '#39ff14', maxAnisotropy);

  // ── Café / restaurant ─────────────────────────────────────────────────────
  const cafe = new THREE.Group();
  cafe.position.set(-17.6, 0, -6.4);
  add(cafe, box(7.2, 1.05, 1.0, new THREE.MeshStandardMaterial({ color: 0x6b4730, roughness: 0.55 })), 0, 0.53, 0);
  add(cafe, box(7.3, 0.08, 1.1, new THREE.MeshStandardMaterial({ color: 0xe8e1d4, roughness: 0.35 })), 0, 1.09, 0);
  add(cafe, box(0.65, 0.55, 0.4, steelMat), -1.6, 1.4, 0);
  add(cafe, box(0.5, 0.06, 0.3, darkMat), -1.6, 1.72, 0);
  for (let i = 0; i < 5; i++) {
    add(cafe, new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.12, 10), new THREE.MeshStandardMaterial({ color: 0xf2ede4, roughness: 0.5 })), -0.4 + i * 0.3, 1.2, 0.05);
  }
  // pastry case
  add(cafe, box(1.4, 0.55, 0.6, glassMat), 2.1, 1.4, 0);
  add(cafe, box(1.35, 0.04, 0.55, new THREE.MeshStandardMaterial({ color: 0xf5e8d0, roughness: 0.7 })), 2.1, 1.2, 0);
  // tables
  for (const [x, z] of [
    [3.2, 2.2],
    [5.4, 3.0],
    [2.4, 4.0],
  ]) {
    add(cafe, new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.05, 18), new THREE.MeshStandardMaterial({ color: 0xe8e1d4, roughness: 0.5 })), x, 0.74, z);
    add(cafe, new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.72, 8), steelMat), x, 0.37, z);
    for (const [dx, dz] of [
      [-0.62, 0],
      [0.62, 0],
    ]) {
      add(cafe, new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.06, 14), darkMat), x + dx, 0.48, z + dz);
      add(cafe, new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.02, 0.45, 8), steelMat), x + dx, 0.23, z + dz);
    }
  }
  add(cafe, box(7.0, 0.5, 0.06, new THREE.MeshStandardMaterial({ color: 0x101820, emissive: 0xd49a45, emissiveIntensity: 0.3 })), 0, 2.7, -0.48);
  airportGroup.add(cafe);
  signMesh(airportGroup, 'SKYLINE CAFÉ', 'COFFEE · BAKERY · ALL DAY', -17.6, 3.7, -5.8, 5.2, 0.85, '#1c2420', '#ffffff', '#d49a45', maxAnisotropy);

  // ── Arrivals, information, restrooms, exits ───────────────────────────────
  signMesh(airportGroup, 'ARRIVALS', 'GROUND TRANSPORT · TAXI · HOTEL SHUTTLE', -11, 4.3, 12.2, 6.4, 0.9, '#0d1b23', '#ffffff', '#38bdf8', maxAnisotropy);
  const info = new THREE.Group();
  // Positioned absolutely below; the helper writes local coordinates.
  add(info, new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.25, 1.1, 16), panelMat), 0, 0.55, 5.6);
  add(info, new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 0.08, 16), darkMat), 0, 1.13, 5.6);
  add(info, new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.2, 8), steelMat), 0, 2.2, 5.6);
  add(info, new THREE.Mesh(new THREE.SphereGeometry(0.22, 14, 10), new THREE.MeshStandardMaterial({ color: 0x39ff14, emissive: 0x39ff14, emissiveIntensity: 0.8 })), 0, 3.35, 5.6);
  airportGroup.add(info);
  signMesh(airportGroup, 'INFORMATION', 'FLIGHTS · TRANSPORT · ASSISTANCE', 0, 1.7, 6.75, 2.8, 0.55, '#0d1b23', '#ffffff', '#39ff14', maxAnisotropy);

  // Entrance doors: two glass leaves that part as the player approaches.
  const doorLeftPivot = new THREE.Group();
  doorLeftPivot.position.set(-2.5, 0, 14.9);
  const doorRightPivot = new THREE.Group();
  doorRightPivot.position.set(2.5, 0, 14.9);
  for (const [pivot, dir] of [
    [doorLeftPivot, 1],
    [doorRightPivot, -1],
  ] as const) {
    add(pivot, box(2.42, 3.1, 0.09, glassMat), dir * 1.21, 1.55, 0);
    add(pivot, box(2.42, 0.08, 0.12, steelMat), dir * 1.21, 3.12, 0);
    add(pivot, box(2.42, 0.08, 0.12, steelMat), dir * 1.21, 0.06, 0);
  }
  airportGroup.add(doorLeftPivot, doorRightPivot);
  signMesh(airportGroup, 'THECITY INTERNATIONAL', 'TERMINAL 1 · DEPARTURES & ARRIVALS', 0, 4.8, 14.6, 7.4, 1.2, '#0d1b23', '#ffffff', '#39ff14', maxAnisotropy);

  // Apron view through the east glass.
  const apron = new THREE.Mesh(new THREE.PlaneGeometry(34, 14), new THREE.MeshStandardMaterial({ color: 0x6d7478, roughness: 0.92 }));
  apron.position.set(31, 0.02, 0);
  apron.rotation.x = -Math.PI / 2;
  apron.rotation.z = Math.PI / 2;
  airportGroup.add(apron);
  const plane1 = buildPlaneSilhouette(glassMat);
  plane1.position.set(34, 0.4, -6);
  plane1.rotation.y = Math.PI / 2;
  airportGroup.add(plane1);
  const plane2 = buildPlaneSilhouette(glassMat);
  plane2.position.set(37, 0.4, 10);
  plane2.rotation.y = Math.PI / 2;
  airportGroup.add(plane2);

  const seats: AirportSeat[] = [
    {
      id: 'airport_lounge_1',
      label: 'Departure Lounge Seat',
      seatPos: { x: 4.5, y: 0.48, z: 1.2 },
      approachPos: { x: 4.5, z: 2.3 },
      facingYaw: Math.PI,
    },
    {
      id: 'airport_gate_a2',
      label: 'Gate A2 Seat',
      seatPos: { x: 17.4, y: 0.48, z: -3.2 },
      approachPos: { x: 16.0, z: -3.2 },
      facingYaw: -Math.PI / 2,
    },
  ];

  const agentAvatar: AvatarConfig = {
    name: 'Amara',
    skinTone: '#8d5a3b',
    hairStyle: 'braids',
    hairColor: '#241b18',
    topStyle: 'button_shirt',
    topColor: '#263d57',
    bottomStyle: 'dress_pants',
    bottomColor: '#1e2228',
    shoeColor: '#111317',
    accessory: 'none',
    jewelry: 'earrings',
    eyebrows: 'bold',
    eyeStyle: 'deep_brown',
  };
  const pilotAvatar: AvatarConfig = {
    name: 'Captain Reyes',
    skinTone: '#c88f64',
    hairStyle: 'fade',
    hairColor: '#201a17',
    topStyle: 'suit',
    topColor: '#1b2430',
    bottomStyle: 'dress_pants',
    bottomColor: '#141a22',
    shoeColor: '#0d0f12',
    accessory: 'cap',
    facialHair: 'stubble',
    eyebrows: 'natural',
    eyeStyle: 'warm_brown',
  };
  const agentRig = createAvatarRig(agentAvatar);
  agentRig.root.position.set(-0.8, 0, -9.9);
  agentRig.root.rotation.y = 0;
  agentRig.root.userData.airportNpcId = 'airport_agent';
  airportGroup.add(agentRig.root);
  const pilotRig = createAvatarRig(pilotAvatar);
  pilotRig.root.position.set(14.9, 0, -1.3);
  pilotRig.root.rotation.y = -0.9;
  pilotRig.root.userData.airportNpcId = 'airport_pilot';
  airportGroup.add(pilotRig.root);

  const npcs: AirportNpc[] = [
    {
      id: 'airport_agent',
      name: 'Amara (Check-in Agent)',
      greeting: 'Welcome to TheCity International. Check in at any open counter, then head through security to your gate.',
      rig: agentRig,
      x: -0.8,
      z: -9.9,
      yaw: 0,
      greetTimer: 0,
    },
    {
      id: 'airport_pilot',
      name: 'Captain Reyes',
      greeting: 'Gate A2 is boarding shortly. The lounge is open if you have time before your flight.',
      rig: pilotRig,
      x: 14.9,
      z: -1.3,
      yaw: -0.9,
      greetTimer: 0,
    },
  ];

  // Obstacles for collision. The entrance corridor and central walkway stay clear.
  const blockers: { x: number; z: number; hw: number; hd: number }[] = [
    { x: 0, z: -11.2, hw: 22, hd: 0.8 }, // check-in counters
    { x: 14.5, z: -4.4, hw: 5.3, hd: 0.65 }, // security
    { x: -15.5, z: 7.4, hw: 3.3, hd: 3.3 }, // carousel
    { x: -17.6, z: -6.4, hw: 3.7, hd: 1.8 }, // café counter
    { x: -14.4, z: -4.2, hw: 2.2, hd: 2.0 }, // café tables
    { x: 0, z: 5.6, hw: 1.35, hd: 1.35 }, // info desk
    { x: 4.5, z: 1.2, hw: 2.1, hd: 0.55 }, // lounge seating
    { x: 4.5, z: 6.4, hw: 2.1, hd: 0.55 },
  ];
  gateZ.forEach((z) => {
    blockers.push({ x: 20.8, z, hw: 1.1, hd: 0.5 });
    blockers.push({ x: 17.4, z, hw: 1.65, hd: 0.5 });
  });
  for (const x of [-18, -6, 6, 18]) {
    for (const z of [-9, 4]) blockers.push({ x, z, hw: 0.45, hd: 0.45 });
  }

  const entrancePos = { x: 0, z: 13.7 };
  const checkInPos = { x: 0, z: -9.7 };
  const gatePos = { x: 19.8, z: -3.2 };
  const baggagePos = { x: -15.5, z: 4.0 };
  const cafePos = { x: -17.6, z: -4.3 };

  function isWalkable(x: number, z: number, radius = 0.28) {
    if (x < -24.2 + radius || x > 24.2 - radius || z < -14.2 + radius || z > 14.2 - radius) {
      return false;
    }
    for (const b of blockers) {
      if (
        Math.abs(x - b.x) < b.hw + radius &&
        Math.abs(z - b.z) < b.hd + radius
      ) {
        return false;
      }
    }
    return true;
  }

  function updateAirport(elapsed: number, delta: number) {
    // Carousel luggage rotates slowly; the doors part near the entrance.
    belt.rotation.y += delta * 0.18;
    const doorOpen = Math.abs(propsXZ.x) < 3.2 && propsXZ.z > 10.5;
    doorLeftPivot.rotation.y = THREE.MathUtils.lerp(doorLeftPivot.rotation.y, doorOpen ? -1.25 : 0, 1 - Math.exp(-8 * delta));
    doorRightPivot.rotation.y = THREE.MathUtils.lerp(doorRightPivot.rotation.y, doorOpen ? 1.25 : 0, 1 - Math.exp(-8 * delta));
    for (const npc of npcs) {
      let emote: EmoteType = 'idle';
      if (npc.greetTimer > 0) {
        npc.greetTimer -= delta;
        emote = 'wave';
      }
      npc.rig.updateAnimation(emote, false, elapsed, delta, 0);
    }
    for (const bag of luggage) {
      bag.position.y = 0.74 + Math.sin(elapsed * 2 + bag.position.x) * 0.01;
    }
  }

  // The viewport updates the player position via userData; the door uses the
  // last known spot without coupling the builder to the render loop.
  const propsXZ = { x: 0, z: 13.7 };
  airportGroup.userData.setPlayerPosition = (x: number, z: number) => {
    propsXZ.x = x;
    propsXZ.z = z;
  };

  return {
    airportGroup,
    groundRaycastPlane,
    entrancePos,
    checkInPos,
    gatePos,
    baggagePos,
    cafePos,
    seats,
    npcs,
    updateAirport,
    isWalkable,
  };
}
