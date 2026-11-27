import * as THREE from 'three';
import { createAvatarRig, type AvatarRig } from './avatar';
import type { AvatarConfig, EmoteType } from './types';
import {
  AIRPORT_ARRIVAL_SPAWN,
  AIRPORT_BOUNDS,
  AIRPORT_GATES,
  AIRPORT_SEAT_ANCHORS,
  BAGGAGE_CAROUSELS,
  CHECK_IN_COUNTERS_PER_ISLAND,
  CHECK_IN_ISLANDS,
  CHECK_IN_SELF_SERVICE,
  SECURITY_LANES,
} from '../../shared/airport-layout.mjs';

/**
 * TheCity International Airport — one building, four connected passenger
 * spaces: Departures Hall, Arrivals Hall, Concourse A and Concourse B.
 *
 * The module builds a single merged terminal interior (one mesh per material)
 * so the 112 × 76 m hall still costs roughly a dozen draw calls on a phone.
 * Furniture that must animate (luggage belts, entrance doors) stays separate.
 *
 * Only environment and wayfinding are simulated here. Check-in and gate
 * desks open the existing travel dialog; there is no fake flight simulation.
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
  transportPos: { x: number; z: number };
  seats: AirportSeat[];
  npcs: AirportNpc[];
  updateAirport: (elapsed: number, delta: number) => void;
  isWalkable: (x: number, z: number, radius?: number) => boolean;
}

type MaterialKey =
  | 'wall'
  | 'panel'
  | 'steel'
  | 'dark'
  | 'glass'
  | 'accent'
  | 'blue'
  | 'wood'
  | 'fabric'
  | 'emissive'
  | 'green'
  | 'stone';

interface Bucket {
  positions: number[];
  normals: number[];
  uvs: number[];
  indices: number[];
}

function newBucket(): Bucket {
  return { positions: [], normals: [], uvs: [], indices: [] };
}

function appendGeometry(bucket: Bucket, geometry: THREE.BufferGeometry) {
  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  const uv = geometry.getAttribute('uv');
  const base = bucket.positions.length / 3;
  for (let i = 0; i < position.count; i += 1) {
    bucket.positions.push(position.getX(i), position.getY(i), position.getZ(i));
    bucket.normals.push(normal ? normal.getX(i) : 0, normal ? normal.getY(i) : 1, normal ? normal.getZ(i) : 0);
    bucket.uvs.push(uv ? uv.getX(i) : 0, uv ? uv.getY(i) : 0);
  }
  const index = geometry.getIndex();
  if (index) {
    for (let i = 0; i < index.count; i += 1) bucket.indices.push(base + index.getX(i));
  } else {
    for (let i = 0; i < position.count; i += 1) bucket.indices.push(base + i);
  }
}

function bucketGeometry(bucket: Bucket): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(bucket.positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(bucket.normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(bucket.uvs, 2));
  geometry.setIndex(bucket.indices);
  geometry.computeBoundingSphere();
  return geometry;
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

function buildFloorTexture(anisotropy: number) {
  const texture = textTexture(
    512,
    512,
    (ctx, w, h) => {
      ctx.fillStyle = '#d9d3c7';
      ctx.fillRect(0, 0, w, h);
      for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
          ctx.fillStyle = (x + y) % 2 ? '#d0cabf' : '#e6e0d6';
          ctx.fillRect(x * 64 + 1, y * 64 + 1, 62, 62);
        }
      }
      ctx.strokeStyle = 'rgba(88,80,68,0.16)';
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
      // Terrazzo chips keep the huge floor from reading as a flat grid.
      for (let i = 0; i < 260; i++) {
        const x = (i * 97) % w;
        const y = (i * 53) % h;
        ctx.fillStyle = i % 3 === 0 ? 'rgba(120,110,96,0.18)' : 'rgba(255,252,244,0.4)';
        ctx.beginPath();
        ctx.arc(x, y, 1.6 + (i % 4), 0, Math.PI * 2);
        ctx.fill();
      }
    },
    anisotropy
  );
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(14, 10);
  return texture;
}

function buildApronTexture(anisotropy: number) {
  const texture = textTexture(
    256,
    256,
    (ctx, w, h) => {
      ctx.fillStyle = '#6f7478';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(240,235,220,0.5)';
      ctx.lineWidth = 4;
      ctx.setLineDash([26, 20]);
      ctx.beginPath();
      ctx.moveTo(0, 128);
      ctx.lineTo(w, 128);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(30,32,34,0.35)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 7; i++) {
        ctx.beginPath();
        ctx.moveTo(0, i * 40);
        ctx.lineTo(w, i * 40);
        ctx.stroke();
      }
    },
    anisotropy
  );
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(3, 3);
  return texture;
}

class AirportMeshBuilder {
  private buckets = new Map<MaterialKey, Bucket>();

  add(key: MaterialKey, geometry: THREE.BufferGeometry) {
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = newBucket();
      this.buckets.set(key, bucket);
    }
    appendGeometry(bucket, geometry);
  }

  box(
    key: MaterialKey,
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    ry = 0
  ) {
    const geometry = new THREE.BoxGeometry(w, h, d);
    if (ry) geometry.rotateY(ry);
    geometry.translate(x, y, z);
    this.add(key, geometry);
  }

  cylinder(
    key: MaterialKey,
    top: number,
    bottom: number,
    height: number,
    segments: number,
    x: number,
    y: number,
    z: number,
    rx = 0,
    ry = 0,
    rz = 0
  ) {
    const geometry = new THREE.CylinderGeometry(top, bottom, height, segments);
    if (rx) geometry.rotateX(rx);
    if (ry) geometry.rotateY(ry);
    if (rz) geometry.rotateZ(rz);
    geometry.translate(x, y, z);
    this.add(key, geometry);
  }

  ring(
    key: MaterialKey,
    radius: number,
    tube: number,
    x: number,
    y: number,
    z: number,
    rx = Math.PI / 2
  ) {
    const geometry = new THREE.TorusGeometry(radius, tube, 8, 40);
    if (rx) geometry.rotateX(rx);
    geometry.translate(x, y, z);
    this.add(key, geometry);
  }

  meshes(materials: Record<MaterialKey, THREE.Material>, group: THREE.Group) {
    for (const [key, bucket] of this.buckets) {
      const material = materials[key as MaterialKey];
      if (!material || bucket.positions.length === 0) continue;
      const mesh = new THREE.Mesh(bucketGeometry(bucket), material);
      mesh.castShadow = key !== 'glass' && key !== 'emissive';
      mesh.receiveShadow = true;
      mesh.name = `airport-${key}`;
      group.add(mesh);
    }
  }
}

const SEAT_FACING: Record<string, number> = {
  north: Math.PI,
  south: 0,
  east: -Math.PI / 2,
  west: Math.PI / 2,
};

export function buildAirportTerminal(maxAnisotropy: number): AirportHandles {
  const airportGroup = new THREE.Group();
  airportGroup.name = 'airport-terminal';

  const { minX, maxX, minZ, maxZ } = AIRPORT_BOUNDS;
  const width = maxX - minX;
  const depth = maxZ - minZ;
  const midX = (minX + maxX) / 2;
  const midZ = (minZ + maxZ) / 2;

  // ── Floor, apron and invisible walk plane ────────────────────────────────
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(width, depth),
    new THREE.MeshStandardMaterial({
      map: buildFloorTexture(maxAnisotropy),
      roughness: 0.3,
      metalness: 0.06,
    })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  airportGroup.add(floor);

  const slab = new THREE.Mesh(
    new THREE.BoxGeometry(width + 1.2, 0.5, depth + 1.2),
    new THREE.MeshStandardMaterial({ color: 0x2d3136, roughness: 0.85 })
  );
  slab.position.set(midX, -0.26, midZ);
  airportGroup.add(slab);

  const groundRaycastPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(width, depth),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  groundRaycastPlane.rotation.x = -Math.PI / 2;
  groundRaycastPlane.position.set(midX, 0.01, midZ);
  airportGroup.add(groundRaycastPlane);

  const apron = new THREE.Mesh(
    new THREE.PlaneGeometry(190, 120),
    new THREE.MeshStandardMaterial({ map: buildApronTexture(maxAnisotropy), roughness: 0.95 })
  );
  apron.rotation.x = -Math.PI / 2;
  apron.position.set(0, -0.02, -100);
  airportGroup.add(apron);

  // ── Materials ─────────────────────────────────────────────────────────────
  const materials: Record<MaterialKey, THREE.Material> = {
    wall: new THREE.MeshStandardMaterial({ color: 0xe9e5dc, roughness: 0.74 }),
    panel: new THREE.MeshStandardMaterial({ color: 0xf6f3ec, roughness: 0.6 }),
    steel: new THREE.MeshStandardMaterial({ color: 0x8f979f, roughness: 0.28, metalness: 0.74 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x1b2329, roughness: 0.4, metalness: 0.35 }),
    glass: new THREE.MeshPhysicalMaterial({
      color: 0xbfe2ef,
      roughness: 0.06,
      metalness: 0.12,
      transparent: true,
      opacity: 0.28,
      side: THREE.DoubleSide,
    }),
    accent: new THREE.MeshStandardMaterial({
      color: 0x39ff14,
      emissive: 0x39ff14,
      emissiveIntensity: 0.6,
      roughness: 0.35,
    }),
    blue: new THREE.MeshStandardMaterial({
      color: 0x2a6f9e,
      emissive: 0x1d5c86,
      emissiveIntensity: 0.3,
      roughness: 0.42,
    }),
    wood: new THREE.MeshStandardMaterial({ color: 0x7b5434, roughness: 0.62 }),
    fabric: new THREE.MeshStandardMaterial({ color: 0x40556b, roughness: 0.88 }),
    emissive: new THREE.MeshStandardMaterial({
      color: 0xfff6e4,
      emissive: 0xffeccb,
      emissiveIntensity: 1.1,
      roughness: 0.5,
    }),
    green: new THREE.MeshStandardMaterial({ color: 0x3f6b4c, roughness: 0.85 }),
    stone: new THREE.MeshStandardMaterial({ color: 0xcfc7b8, roughness: 0.55 }),
  };

  const b = new AirportMeshBuilder();

  // ── Shell ────────────────────────────────────────────────────────────────
  // South wall with a 12 m entrance opening; east/west walls; north glass pier.
  for (const [x0, x1] of [
    [minX, -6],
    [6, maxX],
  ]) {
    b.box('wall', x1 - x0, 13, 0.5, (x0 + x1) / 2, 6.5, maxZ);
    // Glazed upper band so daylight reads across the hall.
    b.box('glass', x1 - x0 - 2, 3.4, 0.12, (x0 + x1) / 2, 9.4, maxZ - 0.32);
  }
  b.box('panel', 14.4, 3.4, 0.7, 0, 12.4, maxZ);
  b.box('steel', 14.4, 0.4, 0.9, 0, 10.5, maxZ);

  for (const sx of [minX, maxX]) {
    b.box('wall', 0.5, 13, depth, sx, 6.5, midZ);
    for (let z = minZ + 6; z < maxZ - 4; z += 9) {
      b.box('glass', 0.12, 4.2, 6.4, sx + (sx < 0 ? 0.3 : -0.3), 8.2, z);
    }
  }

  // North pier: a glass curtain wall with a jet-bridge door at every gate.
  b.box('glass', width - 1, 11.4, 0.16, 0, 6.2, minZ);
  for (let x = minX + 2; x <= maxX - 2; x += 2.4) {
    b.box('steel', 0.14, 11.5, 0.22, x, 6.2, minZ + 0.12);
  }
  b.box('steel', width - 1, 0.35, 0.3, 0, 2.4, minZ + 0.12);
  b.box('steel', width - 1, 0.35, 0.3, 0, 9.8, minZ + 0.12);
  for (const gate of AIRPORT_GATES) {
    b.box('dark', 3.2, 3.2, 0.3, gate.x, 1.6, minZ + 0.22);
    b.box('glass', 2.4, 2.7, 0.1, gate.x, 1.5, minZ + 0.42);
  }

  // ── Roof structure: ribs, skylights, coves ───────────────────────────────
  for (let x = minX + 8; x < maxX; x += 12) {
    b.box('steel', 0.5, 0.9, depth - 2, x, 13.6, midZ);
  }
  for (let z = minZ + 8; z < maxZ; z += 16) {
    b.box('panel', width - 2, 0.6, 1.1, 0, 13.1, z);
  }
  for (const [x, w] of [
    [-42, 16],
    [-18, 14],
    [6, 14],
    [30, 16],
  ] as const) {
    for (const z of [-24, -4, 18]) {
      b.box('emissive', w, 0.06, 0.5, x, 12.5, z);
    }
  }
  for (let x = minX + 10; x < maxX; x += 14) {
    for (let z = minZ + 10; z < maxZ; z += 14) {
      b.cylinder('steel', 0.42, 0.5, 13, 10, x, 6.5, z);
    }
  }

  // ── Partitions: departures | arrivals, and landside | airside ────────────
  // Arrivals hall wall at x = 16 with a 6 m opening to the shared concourse.
  for (const [z0, z1] of [
    [6, 18],
    [24, 38],
  ]) {
    b.box('wall', 0.45, 6.2, z1 - z0, 16, 3.1, (z0 + z1) / 2);
    b.box('glass', 0.14, 3.2, z1 - z0 - 1, 16, 8.2, (z0 + z1) / 2);
  }
  b.box('panel', 0.6, 1.2, 6, 16, 5.6, 21);
  // Low landside/airside divide with wide openings; keeps sightlines open.
  for (const [x0, x1] of [
    [minX, -50],
    [-40, -8],
    [4, 24],
    [34, maxX],
  ]) {
    b.box('panel', x1 - x0, 1.1, 0.5, (x0 + x1) / 2, 0.55, 5.4);
  }

  // ── Departures Hall ──────────────────────────────────────────────────────
  // Check-in islands: five counters per island plus baggage belts.
  for (const island of CHECK_IN_ISLANDS) {
    for (let i = 0; i < CHECK_IN_COUNTERS_PER_ISLAND; i++) {
      const x = island.x + (i - (CHECK_IN_COUNTERS_PER_ISLAND - 1) / 2) * 3.1;
      b.box('panel', 2.7, 1.08, 0.9, x, 0.54, island.z);
      b.box('dark', 2.8, 0.09, 1.0, x, 1.11, island.z);
      b.box('dark', 1.2, 0.12, 0.6, x, 1.2, island.z - 0.05);
      b.box('blue', 0.6, 0.4, 0.05, x - 0.55, 0.92, island.z + 0.47);
      b.box('steel', 0.04, 2.7, 0.04, x - 1.3, 2.6, island.z - 0.25);
      b.box('steel', 0.04, 2.7, 0.04, x + 1.3, 2.6, island.z - 0.25);
      b.box('dark', 0.9, 0.34, 0.08, x, 3.9, island.z - 0.25);
    }
    b.box('steel', 17.4, 0.12, 0.1, island.x, 4.1, island.z - 0.3);
    // Baggage belt behind the counters.
    b.box('dark', 15, 0.5, 1.4, island.x, 0.4, island.z + 1.6);
    b.box('steel', 15, 0.08, 1.5, island.x, 0.68, island.z + 1.6);
    // Island identification totem.
    b.box('blue', 0.5, 3.0, 0.5, island.x - 8.3, 1.5, island.z + 0.1);
  }
  signMesh(airportGroup, 'CHECK-IN A–C', 'ALL DEPARTURES · BAGGAGE DROP', -29, 6.6, 18.2, 10, 1.5, '#0d1b23', '#ffffff', '#39ff14', maxAnisotropy);

  // Self-service kiosks.
  for (let i = 0; i < CHECK_IN_SELF_SERVICE; i++) {
    const x = 2 + i * 2.4;
    b.box('dark', 0.9, 1.5, 0.6, x, 0.75, 27);
    b.box('blue', 0.62, 0.42, 0.04, x, 1.1, 26.68);
    b.box('steel', 0.1, 0.4, 0.1, x, 1.62, 27);
  }
  signMesh(airportGroup, 'SELF CHECK-IN', 'KIOSKS 1–4', 5.6, 2.8, 25.8, 3.4, 0.7, '#102027', '#ffffff', '#39ff14', maxAnisotropy);

  // Flight information displays.
  const flightRows = [
    ['LL 104', 'LONDON', '09:40', 'ON TIME', 'A2'],
    ['LL 228', 'TOKYO', '10:15', 'BOARDING', 'A4'],
    ['LL 316', 'PARIS', '10:55', 'ON TIME', 'B1'],
    ['LL 442', 'NEW YORK', '11:20', 'DELAYED', 'B3'],
    ['LL 587', 'SEOUL', '12:05', 'ON TIME', 'A1'],
    ['LL 611', 'LISBON', '12:40', 'ON TIME', 'B2'],
    ['LL 704', 'CAPE TOWN', '13:15', 'ON TIME', 'A6'],
    ['LL 812', 'SÃO PAULO', '14:00', 'ON TIME', 'B6'],
  ];
  const fidsTexture = textTexture(
    1024,
    640,
    (ctx, w, h) => {
      ctx.fillStyle = '#08131a';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#39ff14';
      ctx.font = 'bold 30px monospace';
      ctx.fillText('DEPARTURES', 34, 44);
      ctx.fillStyle = '#7f97a3';
      ctx.font = '600 17px monospace';
      ctx.fillText('FLIGHT', 34, 82);
      ctx.fillText('DESTINATION', 220, 82);
      ctx.fillText('TIME', 580, 82);
      ctx.fillText('STATUS', 730, 82);
      ctx.fillText('GATE', 930, 82);
      ctx.strokeStyle = 'rgba(57,255,20,0.4)';
      ctx.beginPath();
      ctx.moveTo(30, 96);
      ctx.lineTo(w - 30, 96);
      ctx.stroke();
      flightRows.forEach((row, i) => {
        const y = 138 + i * 58;
        ctx.fillStyle = '#e9f4f7';
        ctx.font = '600 22px monospace';
        ctx.fillText(row[0], 34, y);
        ctx.fillText(row[1], 220, y);
        ctx.fillStyle = '#ffffff';
        ctx.fillText(row[2], 580, y);
        ctx.fillStyle = row[3] === 'DELAYED' ? '#fbbf24' : row[3] === 'BOARDING' ? '#39ff14' : '#9fb6c2';
        ctx.fillText(row[3], 730, y);
        ctx.fillStyle = '#39ff14';
        ctx.fillText(row[4], 930, y);
      });
    },
    maxAnisotropy
  );
  for (const x of [-34, -4]) {
    b.box('dark', 5.4, 3.2, 0.16, x, 6.2, 12.4);
    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(5.1, 3.0),
      new THREE.MeshBasicMaterial({ map: fidsTexture })
    );
    screen.position.set(x, 6.2, 12.5);
    airportGroup.add(screen);
    b.box('steel', 0.06, 2.4, 0.06, x - 2.2, 8.9, 12.4);
    b.box('steel', 0.06, 2.4, 0.06, x + 2.2, 8.9, 12.4);
  }

  signMesh(airportGroup, 'DEPARTURES', 'TERMINAL 1 · CHECK-IN · SECURITY', 0, 9.4, 30.6, 12, 1.6, '#0d1b23', '#ffffff', '#39ff14', maxAnisotropy);
  signMesh(airportGroup, 'ARRIVALS', 'TERMINAL 2 · BAGGAGE · GROUND TRANSPORT', 36, 9.4, 30.6, 12, 1.6, '#0d1b23', '#ffffff', '#38bdf8', maxAnisotropy);

  // Departure lounge waiting area (before security).
  buildSeatRun(b, -6, 16, 9, 'south', 'fabric', 'steel');
  buildSeatRun(b, -6, 20.8, 9, 'north', 'fabric', 'steel');
  b.box('stone', 5.6, 0.08, 2.8, 0, 18.4, 1.2);
  for (const x of [-2.2, 2.2]) {
    b.cylinder('steel', 0.06, 0.08, 0.7, 8, x, 0.36, 18.4);
    b.cylinder('stone', 0.5, 0.5, 0.06, 16, x, 0.72, 18.4);
  }

  // Landside café: counter, pastry case, espresso machine, tables.
  b.box('wood', 10, 1.08, 1.2, -46, 0.54, 12);
  b.box('stone', 10.2, 0.08, 1.3, -46, 1.12, 12);
  b.box('glass', 2.0, 0.7, 0.7, -43, 1.5, 12);
  b.box('steel', 0.9, 0.7, 0.5, -49, 1.45, 12);
  b.box('dark', 9.6, 0.5, 0.08, -46, 3.6, 11.5);
  signMesh(airportGroup, 'SKYLINE CAFÉ', 'COFFEE · BAKERY · ALL DAY', -46, 4.5, 11.4, 6.8, 1.1, '#1c2420', '#ffffff', '#d49a45', maxAnisotropy);
  for (const [x, z] of [
    [-49.5, 16],
    [-45, 16.6],
    [-42, 14.4],
  ] as const) {
    b.cylinder('stone', 0.48, 0.48, 0.06, 16, x, 0.74, z);
    b.cylinder('steel', 0.04, 0.06, 0.74, 8, x, 0.37, z);
    for (const [dx, dz] of [
      [-0.75, 0],
      [0.75, 0],
    ] as const) {
      b.cylinder('fabric', 0.22, 0.22, 0.07, 12, x + dx, 0.48, z + dz);
      b.cylinder('steel', 0.02, 0.025, 0.45, 6, x + dx, 0.23, z + dz);
    }
  }

  // Retail row on the east side of departures.
  b.box('panel', 1.2, 3.4, 12, 48, 1.7, 20);
  b.box('blue', 0.08, 2.0, 8, 47.35, 2.2, 20);
  signMesh(airportGroup, 'TRAVEL ESSENTIALS', 'NEWS · TECH · SOUVENIRS', 47.3, 4.4, 20, 4.6, 0.8, '#102027', '#ffffff', '#39ff14', maxAnisotropy, Math.PI / 2);
  b.box('wood', 3.4, 0.9, 1.0, 44, 0.45, 15.8);
  b.box('stone', 3.5, 0.07, 1.1, 44, 0.92, 15.8);

  // Restrooms + drinking fountains, signed from the hall.
  signMesh(airportGroup, 'RESTROOMS', 'ACCESSIBLE · FAMILY ROOM', -53.4, 4.2, 25, 3.2, 0.7, '#0d1b23', '#ffffff', '#9fb6c2', maxAnisotropy, Math.PI / 2);
  signMesh(airportGroup, 'RESTROOMS', 'ACCESSIBLE · NURSING ROOM', 53.4, 4.2, 8, 3.2, 0.7, '#0d1b23', '#ffffff', '#9fb6c2', maxAnisotropy, -Math.PI / 2);

  // ── Security checkpoint ──────────────────────────────────────────────────
  SECURITY_LANES.forEach((x, index) => {
    const priority = index === SECURITY_LANES.length - 1;
    b.box('panel', 4.6, 0.95, 1.6, x, 0.48, 6.4);
    b.box('dark', 4.7, 0.08, 1.7, x, 0.96, 6.4);
    // Screening arch.
    b.cylinder('steel', 0.08, 0.08, 2.5, 6, x - 1.1, 1.25, 6.4);
    b.cylinder('steel', 0.08, 0.08, 2.5, 6, x + 1.1, 1.25, 6.4);
    b.box('steel', 2.3, 0.1, 0.12, x, 2.5, 6.4);
    b.box(priority ? 'blue' : 'accent', 0.7, 0.06, 0.7, x, 2.42, 6.4);
    // X-ray conveyor.
    b.box('dark', 2.2, 0.75, 0.9, x + 0.3, 0.75, 7.6);
    b.box('steel', 2.0, 0.06, 0.8, x + 0.3, 1.16, 7.6);
    b.box('steel', 0.04, 0.5, 0.6, x + 0.3, 1.45, 7.6);
    // Queue stanchions.
    for (const qx of [-1.7, 1.7]) {
      b.cylinder('steel', 0.05, 0.07, 0.95, 6, x + qx, 0.47, 9.4);
      b.cylinder('accent', 0.06, 0.06, 0.04, 8, x + qx, 0.98, 9.4);
    }
  });
  signMesh(airportGroup, 'SECURITY', 'STANDARD LANES 1–5 · PRIORITY LANE', -28, 4.4, 4.2, 10, 1.2, '#102027', '#ffffff', '#fbbf24', maxAnisotropy);

  // ── Airside concourse ────────────────────────────────────────────────────
  signMesh(airportGroup, 'CONCOURSE A', 'GATES A1–A6 · HORIZON LOUNGE', -36, 8.6, -2.5, 9, 1.4, '#0d1b23', '#ffffff', '#39ff14', maxAnisotropy);
  signMesh(airportGroup, 'CONCOURSE B', 'GATES B1–B6 · SKY CLUB', 34, 8.6, -2.5, 9, 1.4, '#0d1b23', '#ffffff', '#38bdf8', maxAnisotropy);

  // Central duty-free and retail islands.
  for (const [x, label] of [
    [-26, 'DUTY FREE'],
    [0, 'MARKET HALL'],
    [26, 'TECH & TRAVEL'],
  ] as const) {
    b.cylinder('panel', 3.4, 3.6, 0.9, 24, x, 0.45, -14);
    b.cylinder('stone', 3.3, 3.3, 0.1, 24, x, 0.95, -14);
    b.cylinder('steel', 0.3, 0.35, 3.0, 10, x, 2.4, -14);
    b.cylinder('emissive', 1.1, 1.1, 0.18, 18, x, 3.9, -14);
    signMesh(airportGroup, label, 'DUTY FREE · OPEN', x, 3.2, -10.9, 3.2, 0.6, '#0d1b23', '#ffffff', '#39ff14', maxAnisotropy);
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      b.box('wood', 0.5, 0.7, 0.4, x + Math.cos(angle) * 2.2, 0.35, -14 + Math.sin(angle) * 2.2);
    }
  }

  // Moving walkways (environmental — the player can walk beside them).
  for (const x of [-2.6, 2.6]) {
    b.box('dark', 2.1, 0.18, 22, x, 0.09, -21);
    b.box('steel', 0.12, 0.95, 22, x - 1.05, 0.55, -21);
    b.box('steel', 0.12, 0.95, 22, x + 1.05, 0.55, -21);
    for (let z = -31; z <= -11; z += 1.6) {
      b.box('steel', 2.0, 0.03, 0.1, x, 0.2, z);
    }
  }
  signMesh(airportGroup, 'TRAVELATORS', 'GATES A1–B6', 0, 3.4, -9.4, 4.6, 0.7, '#0d1b23', '#ffffff', '#39ff14', maxAnisotropy);

  // Gates: podium, sign, seating run, and an airside reading of the pier.
  for (const gate of AIRPORT_GATES) {
    const z = gate.z;
    b.box('panel', 2.4, 1.06, 0.9, gate.x, 0.53, z + 1.2);
    b.box('dark', 2.5, 0.08, 1.0, gate.x, 1.09, z + 1.2);
    b.box('blue', 0.7, 0.4, 0.05, gate.x, 0.82, z + 1.66);
    b.box('steel', 0.05, 2.0, 0.05, gate.x - 1.1, 2.2, z + 1.2);
    b.box('accent', 0.9, 0.06, 0.06, gate.x, 3.25, z + 1.2);
    const sign = signMesh(
      airportGroup,
      `GATE ${gate.id}`,
      gate.id === 'A2' ? 'BOARDING' : gate.id === 'B3' ? 'DELAYED' : 'ON TIME',
      gate.x,
      3.9,
      z + 1.7,
      2.6,
      0.85,
      '#0d1b23',
      '#ffffff',
      gate.id === 'A2' ? '#39ff14' : gate.id === 'B3' ? '#fbbf24' : '#7f97a3',
      maxAnisotropy
    );
    sign.rotation.y = 0;
    buildSeatRun(b, gate.x, z + 6.4, gate.wide ? 9 : 7, 'north', 'fabric', 'steel');
    // Jet bridge outside the glass.
    b.box('steel', 2.6, 2.4, 8, gate.x, 1.2, minZ - 4.6);
    b.box('glass', 2.2, 1.2, 7.6, gate.x, 2.1, minZ - 4.6);
    b.box('dark', 0.6, 0.6, 8, gate.x + 1.4, 0.4, minZ - 4.6);
  }

  // Horizon Lounge (west) and Sky Club (east) with glazed fronts.
  for (const [x, label, accent] of [
    [-45, 'HORIZON LOUNGE', '#d4af5a'],
    [45, 'SKY CLUB', '#38bdf8'],
  ] as const) {
    b.box('glass', 0.16, 3.2, 14, x + 5, 1.8, -24);
    b.box('wood', 0.5, 0.2, 14, x + 5, 3.4, -24);
    for (const z of [-31, -24, -17]) {
      b.box('steel', 0.2, 3.4, 0.2, x + 5, 1.8, z);
    }
    b.box('panel', 0.4, 0.9, 6, x + 4.8, 0.9, -24);
    signMesh(airportGroup, label, 'MEMBERS · QUIET SEATING', x + 4.65, 4.2, -24, 4.4, 0.8, '#101820', '#ffffff', accent, maxAnisotropy, -Math.PI / 2);
    for (const z of [-29, -25.5, -22, -18.5]) {
      b.cylinder('fabric', 0.4, 0.4, 0.42, 12, x + 1.6, 0.45, z);
      b.cylinder('steel', 0.03, 0.04, 0.45, 6, x + 1.6, 0.22, z);
    }
  }

  // Restrooms at the far corners of the concourse.
  signMesh(airportGroup, 'RESTROOMS', 'CONCOURSE A', -53.2, 4.2, -30, 3.0, 0.7, '#0d1b23', '#ffffff', '#9fb6c2', maxAnisotropy, Math.PI / 2);
  signMesh(airportGroup, 'RESTROOMS', 'CONCOURSE B', 53.2, 4.2, -30, 3.0, 0.7, '#0d1b23', '#ffffff', '#9fb6c2', maxAnisotropy, -Math.PI / 2);

  // ── Arrivals Hall ────────────────────────────────────────────────────────
  signMesh(airportGroup, 'ARRIVALS', 'BAGGAGE CLAIM · CUSTOMS · EXIT', 36, 5.4, 14.5, 10, 1.3, '#0d1b23', '#ffffff', '#38bdf8', maxAnisotropy);
  signMesh(airportGroup, 'GROUND TRANSPORT', 'TAXI · HOTEL SHUTTLE · RAIL', 45, 4.4, 6.2, 8, 1.1, '#0d1b23', '#ffffff', '#39ff14', maxAnisotropy);

  for (const carousel of BAGGAGE_CAROUSELS) {
    b.cylinder('dark', 3.6, 3.6, 0.24, 32, carousel.x, 0.5, carousel.z);
    b.cylinder('steel', 2.7, 2.7, 0.26, 32, carousel.x, 0.52, carousel.z);
    b.ring('steel', 3.1, 0.18, carousel.x, 0.54, carousel.z);
    b.box('dark', 1.6, 0.45, 0.08, carousel.x, 2.4, carousel.z + 3.4);
    b.cylinder('steel', 0.12, 0.16, 1.9, 8, carousel.x, 1.5, carousel.z + 3.4);
    b.box('blue', 1.5, 0.42, 0.06, carousel.x, 2.9, carousel.z + 3.4);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      b.box('wood', 0.5, 0.32, 0.34, carousel.x + Math.cos(a) * 3.1, 0.68, carousel.z + Math.sin(a) * 3.1, -a + 0.4);
    }
  }
  for (const [x, z] of [
    [30, 10],
    [40, 10],
  ] as const) {
    buildSeatRun(b, x, z, 5, 'south', 'fabric', 'steel');
  }

  // Customs exit lane, rental desks and meeting point.
  b.box('panel', 8, 1.1, 0.7, 35, 0.55, 24);
  b.box('dark', 8.1, 0.08, 0.8, 35, 1.12, 24);
  signMesh(airportGroup, 'CUSTOMS', 'ALL ARRIVALS', 35, 3.4, 23.4, 4.4, 0.8, '#102027', '#ffffff', '#fbbf24', maxAnisotropy);
  b.box('wood', 6, 1.0, 1.0, 49, 0.5, 26);
  b.box('stone', 6.1, 0.08, 1.1, 49, 1.04, 26);
  signMesh(airportGroup, 'CAR RENTAL', 'DESKS 1–4', 49, 2.9, 25.3, 3.4, 0.7, '#0d1b23', '#ffffff', '#38bdf8', maxAnisotropy);
  b.cylinder('panel', 1.4, 1.5, 1.15, 16, 36, 0.58, 9);
  b.cylinder('dark', 1.55, 1.55, 0.08, 16, 36, 1.16, 9);
  b.cylinder('steel', 0.05, 0.05, 2.4, 8, 36, 2.5, 9);
  b.cylinder('accent', 0.3, 0.3, 0.4, 12, 36, 3.8, 9);
  signMesh(airportGroup, 'MEETING POINT', 'ARRIVALS · TERMINAL 2', 36, 1.9, 10.6, 4.0, 0.7, '#0d1b23', '#ffffff', '#39ff14', maxAnisotropy);

  // Ground transport desks.
  for (const [x, label, sub] of [
    [43, 'TAXI', 'RANK 1 · LEVEL 0'],
    [48, 'HOTEL SHUTTLE', 'LOFTLIFE GRAND HOTEL'],
    [52, 'AIRPORT RAIL', 'CITY LINE · 6 MIN'],
  ] as const) {
    b.box('panel', 3.0, 1.0, 0.9, x, 0.5, 12);
    b.box('dark', 3.1, 0.08, 1.0, x, 1.04, 12);
    signMesh(airportGroup, label, sub, x, 2.5, 11.5, 2.7, 0.6, '#101820', '#ffffff', '#39ff14', maxAnisotropy);
  }
  signMesh(airportGroup, 'EXIT TO CITY', 'GROUND TRANSPORT · TAXI · SHUTTLE', 36, 4.4, 36.4, 8, 1.1, '#0d1b23', '#ffffff', '#39ff14', maxAnisotropy);

  // Planters soften the long sightlines.
  for (const [x, z] of [
    [-18, 29],
    [12, 29],
    [-52, 8],
    [52, 32],
    [20, 8],
  ] as const) {
    b.cylinder('wood', 0.75, 0.62, 0.8, 12, x, 0.4, z);
    b.add('green', new THREE.IcosahedronGeometry(0.9, 1).translate(x, 1.35, z));
    b.add('green', new THREE.IcosahedronGeometry(0.6, 1).translate(x + 0.5, 1.1, z - 0.4));
  }

  // Furniture as merged meshes in a single pass.
  b.meshes(materials, airportGroup);

  // ── Animated entrance doors ──────────────────────────────────────────────
  const doorGroup = new THREE.Group();
  doorGroup.position.set(0, 0, maxZ - 0.2);
  const doorLeftPivot = new THREE.Group();
  const doorRightPivot = new THREE.Group();
  const doorGlass = materials.glass;
  const doorSteel = materials.steel;
  for (const [pivot, dir] of [
    [doorLeftPivot, 1],
    [doorRightPivot, -1],
  ] as const) {
    const panel = new THREE.Mesh(new THREE.BoxGeometry(5.6, 4.6, 0.08), doorGlass);
    panel.position.set(dir * 2.8, 2.3, 0);
    pivot.add(panel);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.1, 0.14), doorSteel);
    rail.position.set(dir * 2.8, 4.64, 0);
    pivot.add(rail);
    doorGroup.add(pivot);
  }
  airportGroup.add(doorGroup);

  // ── Static aircraft and apron clutter (visible through the pier glass) ───
  const planeWhite = new THREE.MeshStandardMaterial({ color: 0xeef2f4, roughness: 0.4, metalness: 0.18 });
  const planeBlue = new THREE.MeshStandardMaterial({ color: 0x2a6f9e, roughness: 0.45, metalness: 0.2 });
  for (const [x, z, rot] of [
    [-34, -58, 0.18],
    [22, -64, -0.12],
  ] as const) {
    const plane = buildPlane(planeWhite, planeBlue);
    plane.position.set(x, 0.6, z);
    plane.rotation.y = rot;
    airportGroup.add(plane);
  }
  for (let i = 0; i < 14; i++) {
    const cart = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.0, 0.8), new THREE.MeshStandardMaterial({ color: i % 2 ? 0xb8b2a4 : 0x5b6a72, roughness: 0.7 }));
    cart.position.set(-46 + i * 7, 0.5, -46);
    airportGroup.add(cart);
  }

  // ── Seats and NPCs ───────────────────────────────────────────────────────
  const seats: AirportSeat[] = AIRPORT_SEAT_ANCHORS.map((anchor) => ({
    id: anchor.id,
    label: anchor.label,
    seatPos: { x: anchor.x, y: 0.48, z: anchor.z },
    approachPos: {
      x: anchor.x + (anchor.facing === 'east' ? -0.9 : anchor.facing === 'west' ? 0.9 : 0),
      z: anchor.z + (anchor.facing === 'north' ? 0.9 : anchor.facing === 'south' ? -0.9 : 0),
    },
    facingYaw: SEAT_FACING[anchor.facing] ?? 0,
  }));

  const npcs = buildAirportNpcs(airportGroup);

  // ── Animated luggage on carousel 1 ───────────────────────────────────────
  const bagColors = [0x9e5440, 0x2f5d3f, 0x39465c, 0xc7b08e, 0x785874, 0x3f6b7a];
  const bags: { mesh: THREE.Mesh; angle: number }[] = [];
  const carousel = BAGGAGE_CAROUSELS[0];
  for (let i = 0; i < 7; i++) {
    const bag = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.34, 0.3),
      new THREE.MeshStandardMaterial({ color: bagColors[i % bagColors.length], roughness: 0.6 })
    );
    bag.position.set(carousel.x + 3.05, 0.72, carousel.z);
    airportGroup.add(bag);
    bags.push({ mesh: bag, angle: (i / 7) * Math.PI * 2 });
  }

  // ── Collision ────────────────────────────────────────────────────────────
  const blockers: { x: number; z: number; hw: number; hd: number }[] = [];
  for (const island of CHECK_IN_ISLANDS) {
    blockers.push({ x: island.x, z: island.z, hw: 8.4, hd: 1.1 });
    blockers.push({ x: island.x, z: island.z + 1.6, hw: 7.6, hd: 0.85 });
  }
  for (let i = 0; i < CHECK_IN_SELF_SERVICE; i++) {
    blockers.push({ x: 2 + i * 2.4, z: 27, hw: 0.6, hd: 0.5 });
  }
  for (const x of SECURITY_LANES) {
    blockers.push({ x, z: 6.4, hw: 2.4, hd: 0.85 });
    blockers.push({ x: x + 0.3, z: 7.6, hw: 1.2, hd: 0.6 });
  }
  blockers.push({ x: -46, z: 12, hw: 5.1, hd: 0.8 });
  for (const [x, z] of [
    [-49.5, 16],
    [-45, 16.6],
    [-42, 14.4],
  ] as const) {
    blockers.push({ x, z, hw: 0.55, hd: 0.55 });
  }
  blockers.push({ x: -6, z: 16, hw: 4.6, hd: 0.6 });
  blockers.push({ x: -6, z: 20.8, hw: 4.6, hd: 0.6 });
  blockers.push({ x: 0, z: 18.4, hw: 2.9, hd: 1.5 });
  blockers.push({ x: 48, z: 20, hw: 0.9, hd: 6.2 });
  blockers.push({ x: 44, z: 15.8, hw: 1.8, hd: 0.7 });
  for (const x of [-26, 0, 26]) {
    blockers.push({ x, z: -14, hw: 3.7, hd: 3.7 });
  }
  for (const x of [-2.6, 2.6]) {
    blockers.push({ x, z: -21, hw: 1.15, hd: 11.2 });
  }
  for (const gate of AIRPORT_GATES) {
    blockers.push({ x: gate.x, z: gate.z + 1.2, hw: 1.3, hd: 0.6 });
    blockers.push({ x: gate.x, z: gate.z + 6.4, hw: 3.2, hd: 0.62 });
  }
  for (const [x, z, hw, hd] of [
    [45, -24, 5.3, 7.2],
    [-45, -24, 5.3, 7.2],
    [36, 9, 1.6, 1.6],
  ] as const) {
    blockers.push({ x, z, hw, hd });
  }
  for (const carousel of BAGGAGE_CAROUSELS) {
    blockers.push({ x: carousel.x, z: carousel.z, hw: 3.9, hd: 3.9 });
  }
  for (const [x, z] of [
    [30, 10],
    [40, 10],
  ] as const) {
    blockers.push({ x, z, hw: 2.6, hd: 0.6 });
  }
  blockers.push({ x: 35, z: 24, hw: 4.2, hd: 0.6 });
  blockers.push({ x: 49, z: 26, hw: 3.2, hd: 0.7 });
  for (const [x, label] of [
    [43, 'taxi'],
    [48, 'shuttle'],
    [52, 'rail'],
  ] as const) {
    if (label) blockers.push({ x, z: 12, hw: 1.7, hd: 0.7 });
  }
  for (const [x, z] of [
    [-18, 29],
    [12, 29],
    [-52, 8],
    [52, 32],
    [20, 8],
  ] as const) {
    blockers.push({ x, z, hw: 0.95, hd: 0.95 });
  }
  for (let x = minX + 10; x < maxX; x += 14) {
    for (let z = minZ + 10; z < maxZ; z += 14) {
      blockers.push({ x, z, hw: 0.6, hd: 0.6 });
    }
  }

  const entrancePos = { ...AIRPORT_ARRIVAL_SPAWN };
  const checkInPos = { x: -29, z: 21.4 };
  const gatePos = { x: -34, z: -32.4 };
  const baggagePos = { x: 35, z: 24.6 };
  const cafePos = { x: -46, z: 13.6 };
  const transportPos = { x: 45, z: 10.4 };

  function isWalkable(x: number, z: number, radius = 0.28) {
    if (x < minX + 0.9 + radius || x > maxX - 0.9 - radius) return false;
    if (z < minZ + 1.1 + radius || z > maxZ - 1.2 - radius) return false;
    // Arrivals partition: pass through the 6 m opening only.
    if (Math.abs(x - 16) < 0.5 + radius && (z < 18 || z > 24)) return false;
    // Check-in baggage belts, counters, seating, etc.
    for (const blocker of blockers) {
      if (
        Math.abs(x - blocker.x) < blocker.hw + radius &&
        Math.abs(z - blocker.z) < blocker.hd + radius
      ) {
        return false;
      }
    }
    return true;
  }

  const propsXZ = { x: entrancePos.x, z: entrancePos.z };
  airportGroup.userData.setPlayerPosition = (x: number, z: number) => {
    propsXZ.x = x;
    propsXZ.z = z;
  };

  function updateAirport(elapsed: number, delta: number) {
    const doorOpen = Math.abs(propsXZ.x) < 6.4 && propsXZ.z > 28;
    doorLeftPivot.rotation.y = THREE.MathUtils.lerp(
      doorLeftPivot.rotation.y,
      doorOpen ? -1.1 : 0,
      1 - Math.exp(-8 * delta)
    );
    doorRightPivot.rotation.y = THREE.MathUtils.lerp(
      doorRightPivot.rotation.y,
      doorOpen ? 1.1 : 0,
      1 - Math.exp(-8 * delta)
    );
    for (const bag of bags) {
      bag.angle += delta * 0.16;
      bag.mesh.position.set(
        carousel.x + Math.cos(bag.angle) * 3.05,
        0.72,
        carousel.z + Math.sin(bag.angle) * 3.05
      );
      bag.mesh.rotation.y = -bag.angle + 0.5;
    }
    for (const npc of npcs) {
      let emote: EmoteType = 'idle';
      if (npc.greetTimer > 0) {
        npc.greetTimer -= delta;
        emote = 'wave';
      }
      npc.rig.updateAnimation(emote, false, elapsed, delta, 0);
    }
  }

  return {
    airportGroup,
    groundRaycastPlane,
    entrancePos,
    checkInPos,
    gatePos,
    baggagePos,
    cafePos,
    transportPos,
    seats,
    npcs,
    updateAirport,
    isWalkable,
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────

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
  anisotropy = 4,
  rotY = 0
) {
  const texture = textTexture(
    512,
    128,
    (ctx, w, h) => {
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = accent;
      ctx.lineWidth = 5;
      ctx.strokeRect(4, 4, w - 8, h - 8);
      ctx.fillStyle = fg;
      ctx.font = 'bold 42px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(label, w / 2, 54);
      ctx.fillStyle = accent;
      ctx.font = '600 22px sans-serif';
      ctx.fillText(sub, w / 2, 92);
    },
    anisotropy
  );
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true })
  );
  mesh.position.set(x, y, z);
  mesh.rotation.y = rotY;
  group.add(mesh);
  return mesh;
}

function buildSeatRun(
  builder: AirportMeshBuilder,
  centerX: number,
  centerZ: number,
  count: number,
  facing: 'north' | 'south' | 'east' | 'west',
  seatKey: MaterialKey,
  metalKey: MaterialKey
) {
  const spacing = 0.72;
  const reverse = facing === 'south' || facing === 'west';
  const vertical = facing === 'east' || facing === 'west';
  for (let i = 0; i < count; i++) {
    const offset = (i - (count - 1) / 2) * spacing;
    const x = centerX + (vertical ? 0 : offset);
    const z = centerZ + (vertical ? offset : 0);
    builder.box(seatKey, vertical ? 0.54 : 0.56, 0.1, vertical ? 0.56 : 0.54, x, 0.47, z);
    builder.box(
      seatKey,
      vertical ? 0.1 : 0.56,
      0.56,
      vertical ? 0.56 : 0.1,
      x + (vertical ? (reverse ? 0.24 : -0.24) : 0),
      0.75,
      z + (vertical ? 0 : reverse ? 0.24 : -0.24)
    );
    for (const side of [-1, 1]) {
      builder.cylinder(
        metalKey,
        0.02,
        0.024,
        0.42,
        6,
        x + (vertical ? 0 : side * 0.24),
        0.22,
        z + (vertical ? side * 0.24 : 0)
      );
    }
  }
  builder.box(
    metalKey,
    vertical ? 0.1 : count * spacing + 0.1,
    0.05,
    vertical ? count * spacing + 0.1 : 0.1,
    centerX,
    0.5,
    centerZ
  );
}

function buildPlane(white: THREE.Material, blue: THREE.Material) {
  const plane = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.7, 26, 14), white);
  body.rotation.z = Math.PI / 2;
  body.position.y = 1.8;
  plane.add(body);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(1.7, 4, 14), white);
  nose.rotation.z = -Math.PI / 2;
  nose.position.set(15, 1.8, 0);
  plane.add(nose);
  const wing = new THREE.Mesh(new THREE.BoxGeometry(8.5, 0.25, 2.0), white);
  wing.position.set(0, 1.6, 0);
  plane.add(wing);
  const tailFin = new THREE.Mesh(new THREE.BoxGeometry(0.35, 3.2, 4.0), blue);
  tailFin.position.set(-12.6, 3.0, 0);
  plane.add(tailFin);
  const stab = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.2, 1.4), white);
  stab.position.set(-12.4, 3.2, 0);
  plane.add(stab);
  const engines = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 2.0, 12), blue);
  engines.rotation.z = Math.PI / 2;
  engines.position.set(-1.2, 0.5, 2.1);
  plane.add(engines);
  const engines2 = engines.clone();
  engines2.position.z = -2.1;
  plane.add(engines2);
  return plane;
}

function buildAirportNpcs(group: THREE.Group): AirportNpc[] {
  const agent: AvatarConfig = {
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
  const pilot: AvatarConfig = {
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
  const barista: AvatarConfig = {
    name: 'Noor',
    skinTone: '#a86a4a',
    hairStyle: 'top_knot',
    hairColor: '#2c2120',
    topStyle: 'cardigan',
    topColor: '#6b4a34',
    bottomStyle: 'jeans',
    bottomColor: '#2f3a44',
    shoeColor: '#1b1d22',
    accessory: 'none',
    jewelry: 'bracelet',
    eyebrows: 'arched',
    eyeStyle: 'hazel',
  };

  const specs = [
    {
      id: 'airport_agent',
      name: 'Amara (Check-in Agent)',
      greeting:
        'Welcome to TheCity International. Check in at any open counter, clear security, then follow the concourse to your gate.',
      config: agent,
      x: -29,
      z: 22.6,
      yaw: 0,
    },
    {
      id: 'airport_pilot',
      name: 'Captain Reyes',
      greeting:
        'Gate A2 is boarding shortly. Concourse A is to the west, Concourse B to the east, and the Sky Club is upstairs on the far side.',
      config: pilot,
      x: -33,
      z: -30.4,
      yaw: -0.5,
    },
    {
      id: 'airport_barista',
      name: 'Noor (Skyline Café)',
      greeting:
        'Coffee, pastries and a seat with a view of the apron. Arrivals and baggage claim are through the doors to the east.',
      config: barista,
      x: -45,
      z: 13.6,
      yaw: Math.PI,
    },
  ];

  return specs.map((spec) => {
    const rig = createAvatarRig(spec.config);
    rig.root.position.set(spec.x, 0, spec.z);
    rig.root.rotation.y = spec.yaw;
    rig.root.userData.airportNpcId = spec.id;
    group.add(rig.root);
    return {
      id: spec.id,
      name: spec.name,
      greeting: spec.greeting,
      rig,
      x: spec.x,
      z: spec.z,
      yaw: spec.yaw,
      greetTimer: 0,
    };
  });
}
