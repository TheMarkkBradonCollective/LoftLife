import * as THREE from 'three';
import {
  HOUSEKEEPING_FLOOR,
  roomNumberForSlot,
  roomRangeLabel,
  roomsOnFloor,
} from '../../shared/hotel-layout.mjs';
import { createAvatarRig, type AvatarRig } from './avatar';

import type { ActiveResident, EmoteType } from './types';

export interface HotelSeat {
  id: string;
  label: string;
  mesh: THREE.Group;
  seatPos: { x: number; y: number; z: number };
  approachPos: { x: number; z: number };
  facingYaw: number;
}

export interface HotelNpc {
  id: string;
  name: string;
  greeting: string;
  rig: AvatarRig;
  x: number;
  z: number;
  yaw: number;
  greetTimer: number;
}

export interface HotelLobbyHandles {
  lobbyGroup: THREE.Group;
  groundRaycastPlane: THREE.Mesh;
  elevatorGroup: THREE.Group;
  streetDoorGroup: THREE.Group;
  elevLeftDoor: THREE.Mesh;
  elevRightDoor: THREE.Mesh;
  streetDoorLeftPivot: THREE.Group;
  streetDoorRightPivot: THREE.Group;
  elevatorPos: { x: number; z: number };
  streetDoorPos: { x: number; z: number };
  seats: HotelSeat[];
  npcs: HotelNpc[];
  updateLobby: (elapsed: number, delta: number, px: number, pz: number) => void;
  isWalkable: (x: number, z: number, radius?: number) => boolean;
}

export interface HallwayDoorSlot {
  index: number;
  x: number;
  z: number;
  roomNumber: string;
  side: 'north' | 'south' | 'end';
  /** Floor 7's east-end door is the housekeeping room, not a suite. */
  kind: 'suite' | 'housekeeping';
  resident: ActiveResident | null;
  isPlayerSuite: boolean;
  unlocked: boolean;
  doorGroup: THREE.Group;
  doorPivot: THREE.Group;
  ledMat: THREE.MeshStandardMaterial;
  plaqueMat: THREE.MeshStandardMaterial;
  plaqueTex: THREE.CanvasTexture;
}

export interface HotelHallwayHandles {
  hallwayGroup: THREE.Group;
  groundRaycastPlane: THREE.Mesh;
  elevatorGroup: THREE.Group;
  elevLeftDoor: THREE.Mesh;
  elevRightDoor: THREE.Mesh;
  elevatorPos: { x: number; z: number };
  doors: HallwayDoorSlot[];
  setFloorState: (
    floor: number,
    unlockedRooms: Set<string>,
    residents: ActiveResident[],
    playerName: string,
    playerSuiteNumber: string,
    playerSuiteFloor: number,
    maxAnisotropy: number
  ) => void;
  updateHallway: (elapsed: number, delta: number, px: number, pz: number) => void;
  isWalkable: (x: number, z: number, radius?: number) => boolean;
}

function createMarbleTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#efe8dc';
  ctx.fillRect(0, 0, 512, 512);

  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      const dark = (x + y) % 2 === 1;
      ctx.fillStyle = dark ? '#dfd4c2' : '#f4efe5';
      ctx.fillRect(x * 128 + 2, y * 128 + 2, 124, 124);
      ctx.strokeStyle = 'rgba(130, 115, 96, 0.16)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x * 128 + 12, y * 128 + 24);
      ctx.bezierCurveTo(
        x * 128 + 56,
        y * 128 + 42,
        x * 128 + 70,
        y * 128 + 86,
        x * 128 + 114,
        y * 128 + 104
      );
      ctx.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(5, 5);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function createHallCarpetTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#6c262a';
  ctx.fillRect(0, 0, 256, 256);

  ctx.strokeStyle = '#c8a258';
  ctx.lineWidth = 3;
  for (let i = -256; i < 512; i += 64) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + 256, 256);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(i + 256, 0);
    ctx.lineTo(i, 256);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(40, 12, 14, 0.45)';
  ctx.lineWidth = 8;
  ctx.strokeRect(4, 4, 248, 248);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(9, 2.5);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function createSignCanvasTexture(
  topText: string,
  subText: string,
  bgColor: string,
  borderColor: string,
  maxAnisotropy: number
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 320;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, 320, 128);
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 6;
  ctx.strokeRect(6, 6, 308, 116);
  ctx.fillStyle = '#f2fff5';
  ctx.font = 'bold 40px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(topText, 160, 58);
  ctx.fillStyle = '#39ff14';
  ctx.font = '600 24px sans-serif';
  ctx.fillText(subText, 160, 98);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function buildLobbySofa(): THREE.Group {
  const g = new THREE.Group();
  const velvetMat = new THREE.MeshStandardMaterial({ color: 0x265445, roughness: 0.72 });
  const brassMat = new THREE.MeshStandardMaterial({
    color: 0xd4af5a,
    roughness: 0.25,
    metalness: 0.85,
  });
  const base = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.34, 0.88), velvetMat);
  base.position.y = 0.27;
  base.castShadow = true;
  g.add(base);
  const back = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.56, 0.22), velvetMat);
  back.position.set(0, 0.62, -0.33);
  back.castShadow = true;
  g.add(back);
  for (const lx of [-0.96, 0.96]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.48, 0.88), velvetMat);
    arm.position.set(lx, 0.44, 0);
    g.add(arm);
    for (const lz of [-0.34, 0.34]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.02, 0.12, 8), brassMat);
      leg.position.set(lx, 0.06, lz);
      g.add(leg);
    }
  }
  return g;
}

function buildLobbyChair(): THREE.Group {
  const g = new THREE.Group();
  const velvetMat = new THREE.MeshStandardMaterial({ color: 0x2f5d4d, roughness: 0.74 });
  const brassMat = new THREE.MeshStandardMaterial({
    color: 0xd4af5a,
    roughness: 0.25,
    metalness: 0.85,
  });
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.32, 0.86), velvetMat);
  base.position.y = 0.27;
  base.castShadow = true;
  g.add(base);
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.58, 0.2), velvetMat);
  back.position.set(0, 0.64, -0.33);
  back.castShadow = true;
  g.add(back);
  for (const lx of [-0.46, 0.46]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.46, 0.86), velvetMat);
    arm.position.set(lx, 0.45, 0);
    g.add(arm);
    for (const lz of [-0.32, 0.32]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.02, 0.13, 8), brassMat);
      leg.position.set(lx, 0.065, lz);
      g.add(leg);
    }
  }
  return g;
}

export function buildHotelLobby(maxAnisotropy: number): HotelLobbyHandles {
  const lobbyGroup = new THREE.Group();

  // 32m x 24m lobby: x -16..16, z -12..12. The extra width over the original
  // 18m room is what lets reception, concierge, two lounges, a café and a
  // three-car elevator bank read as separate destinations inside one space.
  const HALF_X = 16;
  const HALF_Z = 12;

  const slab = new THREE.Mesh(
    new THREE.BoxGeometry(HALF_X * 2 + 0.8, 0.4, HALF_Z * 2 + 0.8),
    new THREE.MeshStandardMaterial({ color: 0x20232b, roughness: 0.7 })
  );
  slab.position.set(0, -0.21, 0);
  lobbyGroup.add(slab);

  const floorMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(HALF_X * 2, HALF_Z * 2),
    new THREE.MeshStandardMaterial({
      map: createMarbleTexture(maxAnisotropy),
      roughness: 0.24,
      metalness: 0.06,
    })
  );
  floorMesh.rotation.x = -Math.PI / 2;
  floorMesh.receiveShadow = true;
  lobbyGroup.add(floorMesh);

  const groundRaycastPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(HALF_X * 2, HALF_Z * 2),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  groundRaycastPlane.rotation.x = -Math.PI / 2;
  groundRaycastPlane.position.y = 0.01;
  lobbyGroup.add(groundRaycastPlane);

  const wallMat = new THREE.MeshStandardMaterial({ color: 0xebe3d5, roughness: 0.72 });
  const limestoneMat = new THREE.MeshStandardMaterial({ color: 0xd8cdbb, roughness: 0.66 });
  const walnutMat = new THREE.MeshStandardMaterial({ color: 0x4b3120, roughness: 0.45 });
  const brassMat = new THREE.MeshStandardMaterial({
    color: 0xd4af5a,
    roughness: 0.22,
    metalness: 0.86,
  });
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0xdff2ff,
    roughness: 0.1,
    transparent: true,
    opacity: 0.42,
  });
  const bulbMat = new THREE.MeshStandardMaterial({
    color: 0xfff3d1,
    emissive: 0xffcf7a,
    emissiveIntensity: 1.5,
  });

  // ── Perimeter walls ──────────────────────────────────────────────────────
  // North wall is split around the three-car elevator bank.
  const elevators = [-5.6, 0, 5.6];
  const elevHalf = 1.25;
  let cursor = -HALF_X - 0.12;
  for (const ex of elevators) {
    const x0 = cursor;
    const x1 = ex - elevHalf;
    if (x1 > x0) {
      const w = x1 - x0;
      const seg = new THREE.Mesh(new THREE.BoxGeometry(w, 5, 0.24), wallMat);
      seg.position.set((x0 + x1) / 2, 2.5, -HALF_Z - 0.12);
      seg.castShadow = true;
      seg.receiveShadow = true;
      lobbyGroup.add(seg);
      addWainscot(lobbyGroup, w, (x0 + x1) / 2, -HALF_Z + 0.02, walnutMat);
    }
    cursor = ex + elevHalf;
  }
  {
    const w = HALF_X + 0.12 - cursor;
    if (w > 0) {
      const seg = new THREE.Mesh(new THREE.BoxGeometry(w, 5, 0.24), wallMat);
      seg.position.set(cursor + w / 2, 2.5, -HALF_Z - 0.12);
      seg.castShadow = true;
      seg.receiveShadow = true;
      lobbyGroup.add(seg);
      addWainscot(lobbyGroup, w, cursor + w / 2, -HALF_Z + 0.02, walnutMat);
    }
  }
  // Wall above the elevator bank.
  const elevHeader = new THREE.Mesh(new THREE.BoxGeometry(elevators.length * 8, 1.5, 0.24), wallMat);
  elevHeader.position.set(0, 4.25, -HALF_Z - 0.12);
  lobbyGroup.add(elevHeader);

  // West wall (reception side) with a glazed upper band.
  const westWall = new THREE.Mesh(new THREE.BoxGeometry(0.24, 5, HALF_Z * 2 + 0.4), wallMat);
  westWall.position.set(-HALF_X - 0.12, 2.5, 0);
  westWall.castShadow = true;
  westWall.receiveShadow = true;
  lobbyGroup.add(westWall);
  const westGlass = new THREE.Mesh(new THREE.PlaneGeometry(3.8, 9), glassMat);
  westGlass.rotation.y = Math.PI / 2;
  westGlass.position.set(-HALF_X - 0.24, 3.6, -6.4);
  lobbyGroup.add(westGlass);
  addWainscot(lobbyGroup, HALF_Z * 2, -HALF_X + 0.02, 0, walnutMat, true);

  // East wall (lounge, restaurant and spa doors).
  for (const [z0, z1] of [
    [-HALF_Z, -9.4],
    [-6.6, 5.6],
    [8.4, HALF_Z],
  ] as const) {
    const seg = new THREE.Mesh(new THREE.BoxGeometry(0.24, 5, z1 - z0), wallMat);
    seg.position.set(HALF_X + 0.12, 2.5, (z0 + z1) / 2);
    seg.castShadow = true;
    seg.receiveShadow = true;
    lobbyGroup.add(seg);
  }
  addWainscot(lobbyGroup, HALF_Z * 2, HALF_X - 0.02, 0, walnutMat, true);

  // South wall with the main entrance opening (x -2.4..2.4).
  for (const [x0, x1] of [
    [-HALF_X, -2.4],
    [2.4, HALF_X],
  ] as const) {
    const seg = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 5, 0.24), wallMat);
    seg.position.set((x0 + x1) / 2, 2.5, HALF_Z + 0.12);
    seg.castShadow = true;
    seg.receiveShadow = true;
    lobbyGroup.add(seg);
    addWainscot(lobbyGroup, x1 - x0, (x0 + x1) / 2, HALF_Z - 0.02, walnutMat);
  }
  const entranceHeader = new THREE.Mesh(new THREE.BoxGeometry(4.9, 2.4, 0.26), wallMat);
  entranceHeader.position.set(0, 3.8, HALF_Z + 0.12);
  lobbyGroup.add(entranceHeader);

  // Structural limestone columns give the big room a real rhythm.
  for (const [cx, cz] of [
    [-9.4, -5.2],
    [-9.4, 5.2],
    [9.4, -5.2],
    [9.4, 5.2],
    [-3.2, 4.4],
    [3.2, 4.4],
  ] as const) {
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.5, 0.95), limestoneMat);
    base.position.set(cx, 0.25, cz);
    lobbyGroup.add(base);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.38, 4.1, 14), limestoneMat);
    shaft.position.set(cx, 2.5, cz);
    shaft.castShadow = true;
    lobbyGroup.add(shaft);
    const capital = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.22, 0.85), brassMat);
    capital.position.set(cx, 4.62, cz);
    lobbyGroup.add(capital);
  }

  // ── Floor finishes ───────────────────────────────────────────────────────
  // Burgundy runner from the street doors to the elevators.
  const runner = new THREE.Mesh(
    new THREE.BoxGeometry(3.2, 0.02, 21.4),
    new THREE.MeshStandardMaterial({
      color: 0x7a262c,
      roughness: 0.88,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    })
  );
  runner.position.set(0, 0.012, -0.2);
  runner.receiveShadow = true;
  lobbyGroup.add(runner);

  // Brass compass rose in the centre of the lobby.
  const rose = new THREE.Mesh(
    new THREE.CylinderGeometry(2.6, 2.6, 0.03, 40),
    new THREE.MeshStandardMaterial({ color: 0xd8d0bf, roughness: 0.2, metalness: 0.35 })
  );
  rose.position.set(0, 0.02, 0.4);
  lobbyGroup.add(rose);
  const roseRing = new THREE.Mesh(new THREE.TorusGeometry(2.35, 0.07, 8, 56), brassMat);
  roseRing.rotation.x = Math.PI / 2;
  roseRing.position.set(0, 0.045, 0.4);
  lobbyGroup.add(roseRing);
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    const ray = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.035, 1.9), brassMat);
    ray.position.set(Math.sin(angle) * 1.45, 0.04, 0.4 + Math.cos(angle) * 1.45);
    ray.rotation.y = angle;
    lobbyGroup.add(ray);
  }

  // ── Main entrance (south) ────────────────────────────────────────────────
  const streetDoorGroup = new THREE.Group();
  streetDoorGroup.position.set(0, 0, HALF_Z);
  streetDoorGroup.userData.isLobbyStreetDoor = true;

  for (const sx of [-2.25, 2.25]) {
    const col = new THREE.Mesh(new THREE.BoxGeometry(0.42, 3.4, 0.42), walnutMat);
    col.position.set(sx, 1.7, 0);
    streetDoorGroup.add(col);
    const capital = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.16, 0.52), brassMat);
    capital.position.set(sx, 3.42, 0);
    streetDoorGroup.add(capital);
  }
  const transom = new THREE.Mesh(new THREE.BoxGeometry(5.0, 0.34, 0.44), walnutMat);
  transom.position.set(0, 3.34, 0);
  streetDoorGroup.add(transom);

  const exitSignTex = createSignCanvasTexture(
    'MAIN STREET',
    'EXIT TO M ST & 15TH',
    '#0b100e',
    '#39ff14',
    maxAnisotropy
  );
  const exitSign = new THREE.Mesh(
    new THREE.BoxGeometry(2.3, 0.5, 0.08),
    new THREE.MeshStandardMaterial({ map: exitSignTex, roughness: 0.35 })
  );
  exitSign.position.set(0, 3.95, -0.26);
  streetDoorGroup.add(exitSign);

  const streetDoorLeftPivot = new THREE.Group();
  streetDoorLeftPivot.position.set(-2.1, 0, 0);
  const slFrame = new THREE.Mesh(new THREE.BoxGeometry(2.0, 3.0, 0.07), walnutMat);
  slFrame.position.set(1.0, 1.5, 0);
  streetDoorLeftPivot.add(slFrame);
  const slGlass = new THREE.Mesh(new THREE.BoxGeometry(1.62, 2.5, 0.09), glassMat);
  slGlass.position.set(1.0, 1.52, 0);
  streetDoorLeftPivot.add(slGlass);
  streetDoorGroup.add(streetDoorLeftPivot);

  const streetDoorRightPivot = new THREE.Group();
  streetDoorRightPivot.position.set(2.1, 0, 0);
  const srFrame = new THREE.Mesh(new THREE.BoxGeometry(2.0, 3.0, 0.07), walnutMat);
  srFrame.position.set(-1.0, 1.5, 0);
  streetDoorRightPivot.add(srFrame);
  const srGlass = new THREE.Mesh(new THREE.BoxGeometry(1.62, 2.5, 0.09), glassMat);
  srGlass.position.set(-1.0, 1.52, 0);
  streetDoorRightPivot.add(srGlass);
  streetDoorGroup.add(streetDoorRightPivot);
  lobbyGroup.add(streetDoorGroup);

  // ── Elevator bank (north) ────────────────────────────────────────────────
  let elevatorGroup = new THREE.Group();
  let elevLeftDoor: THREE.Mesh | null = null;
  let elevRightDoor: THREE.Mesh | null = null;
  elevators.forEach((ex, index) => {
    const group = new THREE.Group();
    group.position.set(ex, 0, -HALF_Z);
    group.userData.isElevator = index === 1;
    group.userData.elevatorIndex = index;

    const back = new THREE.Mesh(
      new THREE.BoxGeometry(2.3, 2.8, 0.16),
      new THREE.MeshStandardMaterial({
        color: 0x3b2c20,
        emissive: 0xffd28a,
        emissiveIntensity: 0.18,
        roughness: 0.4,
      })
    );
    back.position.set(0, 1.4, -0.8);
    group.add(back);

    for (const jx of [-1.08, 1.08]) {
      const jamb = new THREE.Mesh(new THREE.BoxGeometry(0.18, 2.85, 0.3), brassMat);
      jamb.position.set(jx, 1.42, 0.04);
      group.add(jamb);
    }
    const top = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.24, 0.32), brassMat);
    top.position.set(0, 2.8, 0.04);
    group.add(top);

    const left = new THREE.Mesh(new THREE.BoxGeometry(0.98, 2.58, 0.08), brassMat);
    left.position.set(-0.5, 1.29, 0.02);
    group.add(left);
    const right = new THREE.Mesh(new THREE.BoxGeometry(0.98, 2.58, 0.08), brassMat);
    right.position.set(0.5, 1.29, 0.02);
    group.add(right);

    // Floor indicator above each car.
    const indicator = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 0.3, 0.06),
      new THREE.MeshStandardMaterial({
        color: 0x39ff14,
        emissive: 0x39ff14,
        emissiveIntensity: 1.2,
      })
    );
    indicator.position.set(0, 3.15, 0.1);
    group.add(indicator);

    if (index === 1) {
      elevatorGroup = group;
      elevLeftDoor = left;
      elevRightDoor = right;
    }
    lobbyGroup.add(group);
  });

  const elevSignTex = createSignCanvasTexture(
    'ELEVATORS',
    'FLOORS 2 – 7 · RESIDENTIAL',
    '#0b100e',
    '#39ff14',
    maxAnisotropy
  );
  const elevSign = new THREE.Mesh(
    new THREE.BoxGeometry(5.6, 0.62, 0.08),
    new THREE.MeshStandardMaterial({ map: elevSignTex, roughness: 0.3 })
  );
  elevSign.position.set(0, 3.62, -HALF_Z + 0.12);
  lobbyGroup.add(elevSign);

  // Call plate and illuminated button beside the residential car.
  const callPlate = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.36, 0.06), brassMat);
  callPlate.position.set(1.42, 1.18, -HALF_Z + 0.14);
  lobbyGroup.add(callPlate);
  const callBtn = new THREE.Mesh(
    new THREE.SphereGeometry(0.038, 10, 10),
    new THREE.MeshStandardMaterial({
      color: 0x39ff14,
      emissive: 0x39ff14,
      emissiveIntensity: 1.6,
    })
  );
  callBtn.position.set(1.42, 1.18, -HALF_Z + 0.18);
  lobbyGroup.add(callBtn);

  // ── Reception and concierge (west) ───────────────────────────────────────
  const desk = new THREE.Group();
  desk.position.set(-12.4, 0, -0.4);
  const deskBase = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.14, 7.6), walnutMat);
  deskBase.position.y = 0.07;
  desk.add(deskBase);
  const deskBody = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.02, 7.4), walnutMat);
  deskBody.position.y = 0.58;
  deskBody.castShadow = true;
  deskBody.receiveShadow = true;
  desk.add(deskBody);
  const deskTop = new THREE.Mesh(
    new THREE.BoxGeometry(1.42, 0.09, 7.75),
    new THREE.MeshStandardMaterial({ color: 0xf0e9dc, roughness: 0.22 })
  );
  deskTop.position.y = 1.12;
  desk.add(deskTop);
  // Three agent stations with monitors, lamps and card terminals.
  for (const sz of [-2.3, 0, 2.3]) {
    const monitor = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.4, 0.62), new THREE.MeshStandardMaterial({ color: 0x101720, roughness: 0.35 }));
    monitor.position.set(0.3, 1.45, sz);
    desk.add(monitor);
    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(0.55, 0.33),
      new THREE.MeshStandardMaterial({ color: 0x2a6f9e, emissive: 0x1d5c86, emissiveIntensity: 0.6 })
    );
    screen.rotation.y = -Math.PI / 2;
    screen.position.set(0.24, 1.46, sz);
    desk.add(screen);
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 0.16, 12), bulbMat);
    lamp.position.set(-0.1, 1.35, sz + 0.75);
    desk.add(lamp);
    const terminal = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.06, 0.2), new THREE.MeshStandardMaterial({ color: 0x151a1f }));
    terminal.position.set(0.32, 1.19, sz - 0.55);
    desk.add(terminal);
  }
  const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.11, 0.09, 12), brassMat);
  bell.position.set(0.32, 1.2, 3.1);
  desk.add(bell);
  lobbyGroup.add(desk);

  // Reception backdrop: key cubbies and the hotel crest.
  const cubby = new THREE.Mesh(new THREE.BoxGeometry(0.22, 2.4, 6.4), walnutMat);
  cubby.position.set(-15.55, 2.0, -0.4);
  lobbyGroup.add(cubby);
  for (let i = 0; i < 24; i++) {
    const row = Math.floor(i / 8);
    const col = i % 8;
    const slot = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.26, 0.24),
      new THREE.MeshStandardMaterial({ color: 0x2a1d13, roughness: 0.6 })
    );
    slot.position.set(-15.4, 1.3 + row * 0.35, -2.9 + col * 0.66);
    lobbyGroup.add(slot);
  }
  const crest = new THREE.Mesh(
    new THREE.PlaneGeometry(1.7, 1.7),
    new THREE.MeshStandardMaterial({ color: 0xd4af5a, roughness: 0.3, metalness: 0.55 })
  );
  crest.rotation.y = Math.PI / 2;
  crest.position.set(-15.38, 3.7, -0.4);
  lobbyGroup.add(crest);

  // Concierge desk further down the west wall, with luggage scale and map.
  const concierge = new THREE.Group();
  concierge.position.set(-12.9, 0, -7.6);
  const cBody = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.02, 3.4), walnutMat);
  cBody.position.y = 0.56;
  concierge.add(cBody);
  const cTop = new THREE.Mesh(
    new THREE.BoxGeometry(1.2, 0.08, 3.55),
    new THREE.MeshStandardMaterial({ color: 0xefe8dc, roughness: 0.2 })
  );
  cTop.position.y = 1.08;
  concierge.add(cTop);
  const globe = new THREE.Mesh(
    new THREE.SphereGeometry(0.28, 16, 12),
    new THREE.MeshStandardMaterial({ color: 0x2f6b8a, roughness: 0.35, metalness: 0.25 })
  );
  globe.position.set(0, 1.42, -1.2);
  concierge.add(globe);
  const scale = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.4), brassMat);
  scale.position.set(0.1, 1.15, 1.1);
  concierge.add(scale);
  lobbyGroup.add(concierge);

  // ── Lounge A: fireplace seating (east, north) ────────────────────────────
  const fireplace = new THREE.Group();
  fireplace.position.set(13.9, 0, -7.6);
  const mantel = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.9, 3.2), limestoneMat);
  mantel.position.y = 0.95;
  fireplace.add(mantel);
  const fireBox = new THREE.Mesh(
    new THREE.BoxGeometry(0.24, 0.8, 1.7),
    new THREE.MeshStandardMaterial({
      color: 0xff9a3c,
      emissive: 0xff7a1e,
      emissiveIntensity: 1.4,
    })
  );
  fireBox.position.set(-0.3, 0.62, 0);
  fireplace.add(fireBox);
  const hearth = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.12, 3.6), limestoneMat);
  hearth.position.set(-0.2, 0.06, 0);
  fireplace.add(hearth);
  lobbyGroup.add(fireplace);

  const seats: HotelSeat[] = [];
  const loungeSeating: {
    id: string;
    label: string;
    x: number;
    z: number;
    yaw: number;
    approach: { x: number; z: number };
    kind: 'sofa' | 'chair';
  }[] = [
    { id: 'lobby_fire_sofa', label: 'Fireside Sofa', x: 9.1, z: -7.6, yaw: -Math.PI / 2, approach: { x: 7.9, z: -7.6 }, kind: 'sofa' },
    { id: 'lobby_fire_chair_n', label: 'Fireside Club Chair', x: 10.9, z: -5.1, yaw: Math.PI, approach: { x: 10.9, z: -4.0 }, kind: 'chair' },
    { id: 'lobby_fire_chair_s', label: 'Fireside Club Chair', x: 10.9, z: -10.1, yaw: 0, approach: { x: 10.9, z: -11.0 }, kind: 'chair' },
    { id: 'lobby_window_sofa', label: 'Window Sofa', x: -3.6, z: 7.4, yaw: Math.PI, approach: { x: -3.6, z: 6.2 }, kind: 'sofa' },
    { id: 'lobby_window_chair_w', label: 'Lobby Club Chair', x: -6.4, z: 9.0, yaw: -Math.PI / 2, approach: { x: -7.4, z: 9.0 }, kind: 'chair' },
    { id: 'lobby_window_chair_e', label: 'Lobby Club Chair', x: -0.9, z: 9.0, yaw: Math.PI / 2, approach: { x: 0.1, z: 9.0 }, kind: 'chair' },
    { id: 'lobby_cafe_sofa', label: 'Loft Café Sofa', x: 7.6, z: 8.2, yaw: -Math.PI / 2, approach: { x: 6.4, z: 8.2 }, kind: 'sofa' },
    { id: 'lobby_cafe_chair', label: 'Loft Café Chair', x: 10.4, z: 6.0, yaw: Math.PI, approach: { x: 10.4, z: 4.9 }, kind: 'chair' },
  ];

  for (const spec of loungeSeating) {
    const furniture = spec.kind === 'sofa' ? buildLobbySofa() : buildLobbyChair();
    furniture.position.set(spec.x, 0, spec.z);
    furniture.rotation.y = spec.yaw;
    furniture.userData.hotelSeatId = spec.id;
    lobbyGroup.add(furniture);
    seats.push({
      id: spec.id,
      label: spec.label,
      mesh: furniture,
      seatPos: { x: spec.x, y: 0.44, z: spec.z },
      approachPos: spec.approach,
      facingYaw: spec.yaw,
    });
  }

  // Rugs, coffee tables and lamps anchor each seating group.
  for (const [x, z, w, d, color] of [
    [9.7, -7.6, 5.4, 5.6, 0x24483c],
    [-3.6, 8.2, 6.4, 3.4, 0x3a2f46],
    [8.6, 7.4, 5.0, 4.4, 0x4a3a2a],
  ] as const) {
    const border = new THREE.Mesh(
      new THREE.PlaneGeometry(w + 0.3, d + 0.3),
      new THREE.MeshStandardMaterial({ color: 0xb99a5e, roughness: 0.86 })
    );
    border.rotation.x = -Math.PI / 2;
    border.position.set(x, 0.012, z);
    lobbyGroup.add(border);
    const rug = new THREE.Mesh(
      new THREE.PlaneGeometry(w, d),
      new THREE.MeshStandardMaterial({ color, roughness: 0.94 })
    );
    rug.rotation.x = -Math.PI / 2;
    rug.position.set(x, 0.014, z);
    rug.receiveShadow = true;
    lobbyGroup.add(rug);
  }

  for (const [x, z, radius] of [
    [8.0, -7.6, 0.7],
    [-3.6, 8.2, 0.62],
    [8.4, 7.4, 0.55],
  ] as const) {
    const table = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius, 0.42, 20),
      new THREE.MeshStandardMaterial({ color: 0xefe8dc, roughness: 0.2 })
    );
    table.position.set(x, 0.21, z);
    table.castShadow = true;
    lobbyGroup.add(table);
  }

  // Cozy corner lamp beside the fireside sofa.
  const lampStem = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.62, 10), brassMat);
  lampStem.position.set(11.9, 0.31, -3.5);
  lobbyGroup.add(lampStem);
  const lampShade = new THREE.Mesh(
    new THREE.CylinderGeometry(0.2, 0.27, 0.34, 14),
    new THREE.MeshStandardMaterial({
      color: 0xffe8c2,
      emissive: 0xffc477,
      emissiveIntensity: 0.8,
      roughness: 0.6,
    })
  );
  lampShade.position.set(11.9, 0.78, -3.5);
  lobbyGroup.add(lampShade);

  // ── Loft Café (east, south) ──────────────────────────────────────────────
  const cafe = new THREE.Group();
  cafe.position.set(12.4, 0, 2.9);
  const cafeBody = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.04, 3.6), walnutMat);
  cafeBody.position.y = 0.52;
  cafe.add(cafeBody);
  const cafeTop = new THREE.Mesh(
    new THREE.BoxGeometry(1.3, 0.08, 3.8),
    new THREE.MeshStandardMaterial({ color: 0xe6ddcb, roughness: 0.3 })
  );
  cafeTop.position.y = 1.08;
  cafe.add(cafeTop);
  const espresso = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.62, 0.7), new THREE.MeshStandardMaterial({ color: 0x9aa3a8, roughness: 0.25, metalness: 0.7 }));
  espresso.position.set(0, 1.43, -1.0);
  cafe.add(espresso);
  const pastryCase = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.45, 1.3), glassMat);
  pastryCase.position.set(0, 1.36, 0.6);
  cafe.add(pastryCase);
  const cafeSignTex = createSignCanvasTexture('LOFT CAFÉ', 'COFFEE · PASTRY', '#101820', '#d49a45', maxAnisotropy);
  const cafeSign = new THREE.Mesh(
    new THREE.BoxGeometry(1.5, 0.42, 0.06),
    new THREE.MeshStandardMaterial({ map: cafeSignTex, roughness: 0.35 })
  );
  cafeSign.rotation.y = -Math.PI / 2;
  cafeSign.position.set(-0.62, 2.5, 0);
  cafe.add(cafeSign);
  lobbyGroup.add(cafe);

  // ── Amenity doors on the east wall ───────────────────────────────────────
  const amenity = [
    { z: -8.0, label: 'THE COPPER ROOM', sub: 'RESTAURANT · BAR', accent: '#d49a45' },
    { z: 7.0, label: 'FITNESS & SPA', sub: 'POOL · SAUNA', accent: '#38bdf8' },
  ] as const;
  for (const item of amenity) {
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.7, 0.2), walnutMat);
    frame.position.set(HALF_X - 0.04, 1.35, item.z - 0.85);
    lobbyGroup.add(frame);
    const frame2 = frame.clone();
    frame2.position.z = item.z + 0.85;
    lobbyGroup.add(frame2);
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.62, 1.6), walnutMat);
    door.position.set(HALF_X - 0.1, 1.31, item.z);
    lobbyGroup.add(door);
    const texture = createSignCanvasTexture(item.label, item.sub, '#101820', item.accent, maxAnisotropy);
    const sign = new THREE.Mesh(
      new THREE.BoxGeometry(1.9, 0.46, 0.06),
      new THREE.MeshStandardMaterial({ map: texture, roughness: 0.35 })
    );
    sign.rotation.y = -Math.PI / 2;
    sign.position.set(HALF_X - 0.2, 2.95, item.z);
    lobbyGroup.add(sign);
  }

  // Restroom and business-centre signage on the south-east wall.
  signPanel(lobbyGroup, 'RESTROOMS', 'MEZZANINE', 8.2, 3.1, HALF_Z - 0.18, maxAnisotropy, Math.PI);
  signPanel(lobbyGroup, 'BUSINESS CENTRE', 'PRINT · MEETINGS', -8.4, 3.1, HALF_Z - 0.18, maxAnisotropy, Math.PI);

  // Business nook with two workstations.
  for (const [x, z] of [
    [11.2, 9.9],
    [14.0, 9.9],
  ] as const) {
    const deskTop = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.08, 0.9), walnutMat);
    deskTop.position.set(x, 0.74, z);
    lobbyGroup.add(deskTop);
    for (const lx of [-0.95, 0.95]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.7, 0.8), brassMat);
      leg.position.set(x + lx, 0.37, z);
      lobbyGroup.add(leg);
    }
    const chair = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.5), new THREE.MeshStandardMaterial({ color: 0x2f3a44 }));
    chair.position.set(x, 0.46, z - 0.9);
    lobbyGroup.add(chair);
    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(0.62, 0.38),
      new THREE.MeshStandardMaterial({ color: 0x1d5c86, emissive: 0x1d5c86, emissiveIntensity: 0.5 })
    );
    screen.position.set(x, 1.05, z + 0.42);
    screen.rotation.y = Math.PI;
    lobbyGroup.add(screen);
  }

  // ── Lighting, art and planting ───────────────────────────────────────────
  for (const [x, z] of [
    [0, -3.2],
    [0, 5.0],
  ] as const) {
    const chandelier = new THREE.Group();
    chandelier.position.set(x, 4.45, z);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.35, 0.05, 10, 32), brassMat);
    ring.rotation.x = Math.PI / 2;
    chandelier.add(ring);
    const inner = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.04, 10, 26), brassMat);
    inner.rotation.x = Math.PI / 2;
    inner.position.y = -0.18;
    chandelier.add(inner);
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2;
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), bulbMat);
      bulb.position.set(Math.cos(angle) * 1.35, 0.08, Math.sin(angle) * 1.35);
      chandelier.add(bulb);
    }
    lobbyGroup.add(chandelier);
  }

  const sconceSpots: [number, number, number, number][] = [
    [-8.4, -11.8, 0, Math.PI],
    [8.4, -11.8, 0, Math.PI],
    [-15.8, -4.0, Math.PI / 2, 0],
    [-15.8, 6.4, Math.PI / 2, 0],
    [15.8, -3.0, -Math.PI / 2, 0],
    [15.8, 5.0, -Math.PI / 2, 0],
    [-6.0, 11.8, Math.PI, 0],
    [6.0, 11.8, Math.PI, 0],
  ];
  for (const [sx, sz, ry] of sconceSpots) {
    const backplate = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.38, 0.08), brassMat);
    backplate.position.set(sx, 2.55, sz);
    backplate.rotation.y = ry;
    lobbyGroup.add(backplate);
    const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.15, 0.32, 10), bulbMat);
    shade.position.set(sx, 2.7, sz);
    lobbyGroup.add(shade);
  }

  // Framed art along the west and east walls.
  const artColors = [0x8d6b45, 0x3f5e6b, 0x6b4f63, 0x5b6b4a];
  for (let i = 0; i < 4; i++) {
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 1.4, 1.1),
      new THREE.MeshStandardMaterial({ color: 0x201a15, roughness: 0.5 })
    );
    frame.position.set(-15.86, 2.5, 2.4 + i * 1.4);
    lobbyGroup.add(frame);
    const art = new THREE.Mesh(
      new THREE.PlaneGeometry(1.0, 1.25),
      new THREE.MeshStandardMaterial({ color: artColors[i], roughness: 0.85 })
    );
    art.rotation.y = Math.PI / 2;
    art.position.set(-15.8, 2.5, 2.4 + i * 1.4);
    lobbyGroup.add(art);
  }
  for (let i = 0; i < 3; i++) {
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 1.2, 0.95),
      new THREE.MeshStandardMaterial({ color: 0x201a15, roughness: 0.5 })
    );
    frame.position.set(15.86, 2.5, -1.2 + i * 1.5);
    lobbyGroup.add(frame);
    const art = new THREE.Mesh(
      new THREE.PlaneGeometry(0.85, 1.05),
      new THREE.MeshStandardMaterial({ color: artColors[(i + 2) % 4], roughness: 0.85 })
    );
    art.rotation.y = -Math.PI / 2;
    art.position.set(15.8, 2.5, -1.2 + i * 1.5);
    lobbyGroup.add(art);
  }

  const potMat = new THREE.MeshStandardMaterial({ color: 0xd4af5a, roughness: 0.3, metalness: 0.5 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x3b6e4c, roughness: 0.75 });
  const palmSpots: [number, number][] = [
    [-14.2, -10.2],
    [2.6, -10.4],
    [-6.4, 10.2],
    [2.8, 10.2],
    [14.2, -10.2],
    [14.4, 10.2],
    [-14.4, 10.2],
  ];
  for (const [px, pz] of palmSpots) {
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.27, 0.62, 12), potMat);
    pot.position.set(px, 0.31, pz);
    lobbyGroup.add(pot);
    const frond = new THREE.Mesh(new THREE.IcosahedronGeometry(0.72, 1), leafMat);
    frond.position.set(px, 1.16, pz);
    lobbyGroup.add(frond);
    const frond2 = new THREE.Mesh(new THREE.IcosahedronGeometry(0.44, 1), leafMat);
    frond2.position.set(px + 0.35, 1.55, pz - 0.2);
    lobbyGroup.add(frond2);
  }

  // Grand floral arrangement on a round centre table.
  const centerTable = new THREE.Mesh(
    new THREE.CylinderGeometry(0.95, 0.85, 0.78, 24),
    new THREE.MeshStandardMaterial({ color: 0xefe8dc, roughness: 0.24 })
  );
  centerTable.position.set(4.2, 0.39, 0.4);
  centerTable.castShadow = true;
  lobbyGroup.add(centerTable);
  const vase = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.34, 0.5, 14),
    new THREE.MeshStandardMaterial({ color: 0x3f5e6b, roughness: 0.35 })
  );
  vase.position.set(4.2, 1.03, 0.4);
  lobbyGroup.add(vase);
  for (let i = 0; i < 9; i++) {
    const angle = (i / 9) * Math.PI * 2;
    const bloom = new THREE.Mesh(
      new THREE.SphereGeometry(0.11, 8, 6),
      new THREE.MeshStandardMaterial({ color: i % 2 ? 0xc76a7a : 0xe8c17a, roughness: 0.7 })
    );
    bloom.position.set(4.2 + Math.cos(angle) * 0.3, 1.42 + (i % 3) * 0.08, 0.4 + Math.sin(angle) * 0.3);
    lobbyGroup.add(bloom);
  }

  // Bell stand, luggage cart and a grandfather clock for arrival theatre.
  const bellStand = new THREE.Group();
  bellStand.position.set(-3.0, 0, 9.8);
  const cartBase = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.14, 0.8), brassMat);
  cartBase.position.y = 0.18;
  bellStand.add(cartBase);
  for (const [bx, bz] of [
    [-0.55, -0.3],
    [0.55, -0.3],
    [-0.55, 0.3],
    [0.55, 0.3],
  ] as const) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.06, 10), walnutMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(bx, 0.1, bz);
    bellStand.add(wheel);
  }
  const bag1 = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.42, 0.34), new THREE.MeshStandardMaterial({ color: 0x6b3f33, roughness: 0.6 }));
  bag1.position.set(-0.25, 0.46, 0);
  bellStand.add(bag1);
  const bag2 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.3), new THREE.MeshStandardMaterial({ color: 0x2f4436, roughness: 0.6 }));
  bag2.position.set(0.35, 0.4, 0);
  bellStand.add(bag2);
  lobbyGroup.add(bellStand);

  const clock = new THREE.Group();
  clock.position.set(-15.5, 0, -10.2);
  const clockBody = new THREE.Mesh(new THREE.BoxGeometry(0.5, 2.6, 0.8), walnutMat);
  clockBody.position.y = 1.3;
  clock.add(clockBody);
  const clockFace = new THREE.Mesh(
    new THREE.CircleGeometry(0.3, 20),
    new THREE.MeshStandardMaterial({ color: 0xf5efe0, roughness: 0.4 })
  );
  clockFace.rotation.y = Math.PI / 2;
  clockFace.position.set(0.27, 2.1, 0);
  clock.add(clockFace);
  const pendulum = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.9, 0.08), brassMat);
  pendulum.position.set(0.27, 1.0, 0);
  clock.add(pendulum);
  lobbyGroup.add(clock);

  // ── NPCs ─────────────────────────────────────────────────────────────────
  const conciergeRig = createAvatarRig({
    name: 'Morgan',
    skinTone: '#d3976d',
    hairStyle: 'sidepart',
    hairColor: '#2d2320',
    topStyle: 'blazer',
    topColor: '#32363f',
    bottomColor: '#26282e',
    shoeColor: '#26282e',
    accessory: 'glasses',
  });
  conciergeRig.root.position.set(-14.0, 0, -7.6);
  conciergeRig.root.rotation.y = Math.PI / 2;
  conciergeRig.root.userData.hotelNpcId = 'npc_concierge';
  lobbyGroup.add(conciergeRig.root);

  const agentRig = createAvatarRig({
    name: 'Priya',
    skinTone: '#a86a4a',
    hairStyle: 'buns',
    hairColor: '#241b18',
    topStyle: 'blazer',
    topColor: '#4a2f3c',
    bottomColor: '#22252b',
    shoeColor: '#1a1c20',
    accessory: 'none',
    jewelry: 'earrings',
  });
  agentRig.root.position.set(-13.7, 0, -1.2);
  agentRig.root.rotation.y = Math.PI / 2;
  agentRig.root.userData.hotelNpcId = 'npc_front_desk';
  lobbyGroup.add(agentRig.root);

  const bellhopRig = createAvatarRig({
    name: 'Theo',
    skinTone: '#c88f64',
    hairStyle: 'undercut',
    hairColor: '#2a211d',
    topStyle: 'jacket',
    topColor: '#7a262c',
    bottomColor: '#23252b',
    shoeColor: '#15171a',
    accessory: 'cap',
  });
  bellhopRig.root.position.set(-1.2, 0, 9.4);
  bellhopRig.root.rotation.y = Math.PI;
  bellhopRig.root.userData.hotelNpcId = 'npc_bellhop';
  lobbyGroup.add(bellhopRig.root);

  const npcs: HotelNpc[] = [
    {
      id: 'npc_concierge',
      name: 'Morgan (Concierge)',
      greeting:
        'Welcome to The LoftLife Grand Hotel. Reception can print a keycard, and the brass elevator bank behind me reaches all seven floors — your suite is on Floor 4.',
      rig: conciergeRig,
      x: -14.0,
      z: -7.6,
      yaw: Math.PI / 2,
      greetTimer: 0,
    },
    {
      id: 'npc_front_desk',
      name: 'Priya (Front Desk)',
      greeting:
        'Checking in? Your suite is already allocated. Take the centre elevator to your floor, then follow the hallway to your door.',
      rig: agentRig,
      x: -13.7,
      z: -1.2,
      yaw: Math.PI / 2,
      greetTimer: 0,
    },
    {
      id: 'npc_bellhop',
      name: 'Theo (Bellhop)',
      greeting:
        'I can take your bags up. The Loft Café is on the east side, and The Copper Room opens for dinner at six.',
      rig: bellhopRig,
      x: -1.2,
      z: 9.4,
      yaw: Math.PI,
      greetTimer: 0,
    },
  ];

  const elevatorPos = { x: 0, z: -10.35 };
  const streetDoorPos = { x: 0, z: 11.25 };

  // Obstacles for the walkable check: desks, seating, columns, café, planters.
  const blockers: { x: number; z: number; hw: number; hd: number }[] = [
    { x: -12.4, z: -0.4, hw: 0.95, hd: 3.95 },
    { x: -14.0, z: -0.4, hw: 1.1, hd: 3.2 },
    { x: -12.9, z: -7.6, hw: 0.8, hd: 1.85 },
    { x: 13.9, z: -7.6, hw: 0.7, hd: 1.9 },
    { x: 12.4, z: 2.9, hw: 0.85, hd: 2.0 },
    { x: 9.1, z: -7.6, hw: 0.62, hd: 1.2 },
    { x: 8.0, z: -7.6, hw: 0.75, hd: 0.75 },
    { x: -3.6, z: 7.4, hw: 1.2, hd: 0.55 },
    { x: 7.6, z: 8.2, hw: 0.62, hd: 1.2 },
    { x: 4.2, z: 0.4, hw: 1.0, hd: 1.0 },
    { x: -3.0, z: 9.8, hw: 0.85, hd: 0.5 },
    { x: 11.2, z: 9.9, hw: 1.2, hd: 0.55 },
    { x: 14.0, z: 9.9, hw: 1.2, hd: 0.55 },
  ];
  for (const spec of loungeSeating) {
    blockers.push({
      x: spec.x,
      z: spec.z,
      hw: spec.kind === 'sofa' ? 1.2 : 0.55,
      hd: spec.kind === 'sofa' ? 0.55 : 0.55,
    });
  }
  for (const [cx, cz] of [
    [-9.4, -5.2],
    [-9.4, 5.2],
    [9.4, -5.2],
    [9.4, 5.2],
    [-3.2, 4.4],
    [3.2, 4.4],
  ] as const) {
    blockers.push({ x: cx, z: cz, hw: 0.55, hd: 0.55 });
  }
  for (const [px, pz] of palmSpots) {
    blockers.push({ x: px, z: pz, hw: 0.55, hd: 0.55 });
  }

  function updateLobby(elapsed: number, delta: number, px: number, pz: number) {
    const dk = 1 - Math.exp(-9 * delta);

    // Residential elevator doors part as the player reaches the bank.
    const elevDist = Math.hypot(px - elevatorPos.x, pz - -11.2);
    const slide = elevDist < 2.6 ? 1.02 : 0;
    if (elevLeftDoor) {
      elevLeftDoor.position.x = THREE.MathUtils.lerp(elevLeftDoor.position.x, -0.5 - slide, dk);
    }
    if (elevRightDoor) {
      elevRightDoor.position.x = THREE.MathUtils.lerp(elevRightDoor.position.x, 0.5 + slide, dk);
    }

    // Street entrance leaves swing apart on approach.
    const streetDist = Math.hypot(px, pz - HALF_Z);
    const doorAng = streetDist < 2.8 ? 1.15 : 0;
    streetDoorLeftPivot.rotation.y = THREE.MathUtils.lerp(
      streetDoorLeftPivot.rotation.y,
      -doorAng,
      dk
    );
    streetDoorRightPivot.rotation.y = THREE.MathUtils.lerp(
      streetDoorRightPivot.rotation.y,
      doorAng,
      dk
    );

    for (const npc of npcs) {
      let emote: EmoteType = 'idle';
      if (npc.greetTimer > 0) {
        npc.greetTimer -= delta;
        emote = 'wave';
      }
      npc.rig.updateAnimation(emote, false, elapsed, delta, 0);
    }
  }

  function isWalkable(x: number, z: number, radius = 0.28): boolean {
    const allowStreetCorridor = Math.abs(x) < 2.2 && z >= 11.0 && z <= 12.45;
    const allowElevCorridor = Math.abs(x) < 1.2 && z >= -12.45 && z <= -10.6;
    if (
      !allowStreetCorridor &&
      !allowElevCorridor &&
      (x < -HALF_X + 0.6 + radius ||
        x > HALF_X - 0.6 - radius ||
        z < -HALF_Z + 0.7 + radius ||
        z > HALF_Z - 0.6 - radius)
    ) {
      return false;
    }
    if (allowStreetCorridor || allowElevCorridor) return true;
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

  return {
    lobbyGroup,
    groundRaycastPlane,
    elevatorGroup,
    streetDoorGroup,
    elevLeftDoor: elevLeftDoor as unknown as THREE.Mesh,
    elevRightDoor: elevRightDoor as unknown as THREE.Mesh,
    streetDoorLeftPivot,
    streetDoorRightPivot,
    elevatorPos,
    streetDoorPos,
    seats,
    npcs,
    updateLobby,
    isWalkable,
  };
}

function addWainscot(
  group: THREE.Group,
  width: number,
  x: number,
  z: number,
  material: THREE.Material,
  alongZ = false
) {
  const panel = new THREE.Mesh(
    alongZ ? new THREE.BoxGeometry(0.06, 1.1, width) : new THREE.BoxGeometry(width, 1.1, 0.06),
    material
  );
  panel.position.set(x, 0.55, z);
  group.add(panel);
  const cap = new THREE.Mesh(
    alongZ ? new THREE.BoxGeometry(0.1, 0.06, width) : new THREE.BoxGeometry(width, 0.06, 0.1),
    new THREE.MeshStandardMaterial({ color: 0xd4af5a, roughness: 0.3, metalness: 0.6 })
  );
  cap.position.set(x, 1.12, z);
  group.add(cap);
}

function signPanel(
  group: THREE.Group,
  label: string,
  sub: string,
  x: number,
  y: number,
  z: number,
  anisotropy: number,
  rotationY: number
) {
  const texture = createSignCanvasTexture(label, sub, '#101820', '#39ff14', anisotropy);
  const sign = new THREE.Mesh(
    new THREE.BoxGeometry(2.0, 0.46, 0.06),
    new THREE.MeshStandardMaterial({ map: texture, roughness: 0.35 })
  );
  sign.position.set(x, y, z);
  sign.rotation.y = rotationY;
  group.add(sign);
}


export function buildHotelHallway(maxAnisotropy: number): HotelHallwayHandles {
  const hallwayGroup = new THREE.Group();

  // Floor & Slab (24m x 8.4m: x -12..12, z -4.2..4.2)
  const slab = new THREE.Mesh(
    new THREE.BoxGeometry(24.6, 0.4, 9.0),
    new THREE.MeshStandardMaterial({ color: 0x20232b, roughness: 0.7 })
  );
  slab.position.set(0, -0.21, 0);
  hallwayGroup.add(slab);

  const floorMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(24, 8.4),
    new THREE.MeshStandardMaterial({
      map: createHallCarpetTexture(maxAnisotropy),
      roughness: 0.88,
    })
  );
  floorMesh.rotation.x = -Math.PI / 2;
  floorMesh.receiveShadow = true;
  hallwayGroup.add(floorMesh);

  const groundRaycastPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(24, 8.4),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  groundRaycastPlane.rotation.x = -Math.PI / 2;
  groundRaycastPlane.position.y = 0.01;
  hallwayGroup.add(groundRaycastPlane);

  const wallMat = new THREE.MeshStandardMaterial({ color: 0xe6dccd, roughness: 0.78 });
  const walnutMat = new THREE.MeshStandardMaterial({ color: 0x4b3120, roughness: 0.45 });
  const brassMat = new THREE.MeshStandardMaterial({
    color: 0xd4af5a,
    roughness: 0.24,
    metalness: 0.86,
  });

  // Five suite doors on each side of the corridor (ten total per floor).
  const doorXs = [-9.2, -4.6, 0, 4.6, 9.2];
  // Five suites on the north side, five on the south, and one east-end room.
  // Floor 7 turns the end door into housekeeping, giving 65 total suites.
  const doorSlots = [
    ...doorXs.map((x) => ({ x, side: 'north' as const })),
    ...doorXs.map((x) => ({ x, side: 'south' as const })),
    { x: 11.96, side: 'end' as const },
  ];
  for (const side of ['north', 'south'] as const) {
    const wallZ = side === 'north' ? -4.32 : 4.32;
    const trimZ = side === 'north' ? -4.18 : 4.18;
    const wallRuns: [number, number][] = [];
    let cursor = -12.0;
    for (const dx of doorXs) { wallRuns.push([cursor, dx - 0.72]); cursor = dx + 0.72; }
    wallRuns.push([cursor, 12.0]);
    for (const [x0, x1] of wallRuns) {
      const w = x1 - x0; const cx = (x0 + x1) / 2;
      const seg = new THREE.Mesh(new THREE.BoxGeometry(w, 3.4, 0.24), wallMat);
      seg.position.set(cx, 1.7, wallZ); seg.castShadow = true; seg.receiveShadow = true; hallwayGroup.add(seg);
      const trim = new THREE.Mesh(new THREE.BoxGeometry(w, 0.95, 0.04), walnutMat);
      trim.position.set(cx, 0.475, trimZ); hallwayGroup.add(trim);
    }
    for (const dx of doorXs) {
      const hdr = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.05, 0.24), wallMat);
      hdr.position.set(dx, 2.875, wallZ); hallwayGroup.add(hdr);
    }
  }

  // East End Wall (x = +12.12) with the eleventh end-room door at z = 0.
  for (const [z0, z1] of [
    [-4.42, -0.7],
    [0.7, 4.42],
  ]) {
    const seg = new THREE.Mesh(new THREE.BoxGeometry(0.24, 3.4, z1 - z0), wallMat);
    seg.position.set(12.12, 1.7, (z0 + z1) / 2);
    seg.castShadow = true;
    seg.receiveShadow = true;
    hallwayGroup.add(seg);
  }
  const endDoorHeader = new THREE.Mesh(new THREE.BoxGeometry(0.24, 1.05, 1.4), wallMat);
  endDoorHeader.position.set(12.12, 2.875, 0);
  hallwayGroup.add(endDoorHeader);

  // The south corridor wall mirrors the north wall with five resident doors.

  // West End Wall (x = -12.12) with Brass Elevator Bay at z = 0
  for (const wz of [-3.15, 3.15]) {
    const wSeg = new THREE.Mesh(new THREE.BoxGeometry(0.24, 3.4, 2.1), wallMat);
    wSeg.position.set(-12.12, 1.7, wz);
    hallwayGroup.add(wSeg);
  }
  const elevTopWall = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.72, 2.2), wallMat);
  elevTopWall.position.set(-12.12, 3.04, 0);
  hallwayGroup.add(elevTopWall);

  // Brass Elevator at West End (x = -12.0, z = 0) facing +X
  const elevatorGroup = new THREE.Group();
  elevatorGroup.position.set(-12.0, 0, 0);
  elevatorGroup.rotation.y = Math.PI / 2;
  elevatorGroup.userData.isElevator = true;

  const elevBack = new THREE.Mesh(
    new THREE.BoxGeometry(2.1, 2.65, 0.14),
    new THREE.MeshStandardMaterial({
      color: 0x3b2c20,
      emissive: 0xffd28a,
      emissiveIntensity: 0.22,
      roughness: 0.4,
    })
  );
  elevBack.position.set(0, 1.325, -0.76);
  elevatorGroup.add(elevBack);

  for (const ex of [-1.02, 1.02]) {
    const jamb = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.68, 0.26), brassMat);
    jamb.position.set(ex, 1.34, 0.04);
    elevatorGroup.add(jamb);
  }
  const elevLeftDoor = new THREE.Mesh(new THREE.BoxGeometry(0.92, 2.48, 0.08), brassMat);
  elevLeftDoor.position.set(-0.46, 1.24, 0.02);
  elevatorGroup.add(elevLeftDoor);

  const elevRightDoor = new THREE.Mesh(new THREE.BoxGeometry(0.92, 2.48, 0.08), brassMat);
  elevRightDoor.position.set(0.46, 1.24, 0.02);
  elevatorGroup.add(elevRightDoor);

  let floorSignTex = createSignCanvasTexture(
    'FLOOR 4',
    'SUITES 401 – 411',
    '#181b24',
    '#d4af5a',
    maxAnisotropy
  );
  const floorSignMat = new THREE.MeshStandardMaterial({ map: floorSignTex, roughness: 0.3 });
  const floorSign = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.44, 0.08), floorSignMat);
  floorSign.position.set(0, 2.92, 0.08);
  elevatorGroup.add(floorSign);
  hallwayGroup.add(elevatorGroup);

  // Warm Sconce Lights along Corridor
  const sconceMat = new THREE.MeshStandardMaterial({
    color: 0xfff1c9,
    emissive: 0xffcb78,
    emissiveIntensity: 1.2,
  });
  for (const sx of [-9.5, -4.5, 0.5, 5.5, 10.5]) {
    const sconce = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.06, 0.26, 10), sconceMat);
    sconce.position.set(sx, 2.15, -3.14);
    hallwayGroup.add(sconce);
    const sconceSouth = sconce.clone();
    sconceSouth.position.z = 3.14;
    hallwayGroup.add(sconceSouth);
  }

  // Elevator lobby: a small furnished arrival room rather than a bare corridor
  // end, so stepping off the lift reads as entering the floor.
  const lobbyBench = new THREE.Group();
  lobbyBench.position.set(-10.4, 0, -3.1);
  const benchSeat = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.16, 0.7), new THREE.MeshStandardMaterial({ color: 0x265445, roughness: 0.78 }));
  benchSeat.position.y = 0.46;
  lobbyBench.add(benchSeat);
  for (const bx of [-1.0, 1.0]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.46, 0.6), brassMat);
    leg.position.set(bx, 0.23, 0);
    lobbyBench.add(leg);
  }
  for (const bx of [-1.0, 1.0]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.5, 0.7), walnutMat);
    arm.position.set(bx * 1.22, 0.72, 0);
    lobbyBench.add(arm);
  }
  hallwayGroup.add(lobbyBench);

  const lobbyRug = new THREE.Mesh(
    new THREE.PlaneGeometry(5.2, 6.4),
    new THREE.MeshStandardMaterial({ color: 0x2f4a3f, roughness: 0.94 })
  );
  lobbyRug.rotation.x = -Math.PI / 2;
  lobbyRug.position.set(-9.6, 0.012, -1.4);
  lobbyRug.receiveShadow = true;
  hallwayGroup.add(lobbyRug);

  const floorPlant = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.62, 1),
    new THREE.MeshStandardMaterial({ color: 0x3b6e4c, roughness: 0.8 })
  );
  floorPlant.position.set(-10.8, 1.05, 3.1);
  hallwayGroup.add(floorPlant);
  const floorPot = new THREE.Mesh(
    new THREE.CylinderGeometry(0.3, 0.24, 0.6, 12),
    new THREE.MeshStandardMaterial({ color: 0xd4af5a, roughness: 0.35, metalness: 0.4 })
  );
  floorPot.position.set(-10.8, 0.3, 3.1);
  hallwayGroup.add(floorPot);

  // Floor directory beside the lift: this is the signage guests actually read.
  const directoryTex = createSignCanvasTexture(
    'FLOOR DIRECTORY',
    'SUITES 01–11 · ICE · STAIRS',
    '#181b24',
    '#d4af5a',
    maxAnisotropy
  );
  const directory = new THREE.Mesh(
    new THREE.BoxGeometry(1.9, 0.55, 0.08),
    new THREE.MeshStandardMaterial({ map: directoryTex, roughness: 0.32 })
  );
  directory.position.set(-11.4, 2.4, 2.4);
  directory.rotation.y = Math.PI / 2;
  hallwayGroup.add(directory);

  // Console tables and framed art between suite doors, mirrored on both sides.
  const consoleXs = [-6.9, -2.3, 2.3, 6.9];
  for (const side of [-1, 1] as const) {
    for (const cx of consoleXs) {
      const tableTop = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.07, 0.38), walnutMat);
      tableTop.position.set(cx, 0.82, side * 3.72);
      hallwayGroup.add(tableTop);
      for (const lx of [-0.6, 0.6]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.8, 0.3), brassMat);
        leg.position.set(cx + lx, 0.41, side * 3.72);
        hallwayGroup.add(leg);
      }
      const lampBase = new THREE.Mesh(
        new THREE.CylinderGeometry(0.07, 0.1, 0.4, 10),
        new THREE.MeshStandardMaterial({ color: 0x2b2a27, roughness: 0.4 })
      );
      lampBase.position.set(cx, 1.04, side * 3.72);
      hallwayGroup.add(lampBase);
      const shade = new THREE.Mesh(
        new THREE.CylinderGeometry(0.15, 0.2, 0.24, 12),
        new THREE.MeshStandardMaterial({
          color: 0xffe8c2,
          emissive: 0xffc477,
          emissiveIntensity: 0.85,
          roughness: 0.6,
        })
      );
      shade.position.set(cx, 1.3, side * 3.72);
      hallwayGroup.add(shade);
      const frame = new THREE.Mesh(
        new THREE.BoxGeometry(0.86, 1.0, 0.06),
        new THREE.MeshStandardMaterial({ color: 0x201a15, roughness: 0.5 })
      );
      frame.position.set(cx, 2.0, side * 4.16);
      hallwayGroup.add(frame);
      const art = new THREE.Mesh(
        new THREE.PlaneGeometry(0.74, 0.88),
        new THREE.MeshStandardMaterial({ color: cx % 2 === 0 ? 0x5b6b4a : 0x8d6b45, roughness: 0.86 })
      );
      art.position.set(cx, 2.0, side * 4.11);
      art.rotation.y = side > 0 ? Math.PI : 0;
      hallwayGroup.add(art);
    }
  }

  // Window and reading bench at the east end of the corridor.
  const endWindow = new THREE.Mesh(
    new THREE.PlaneGeometry(4.4, 1.9),
    new THREE.MeshPhysicalMaterial({
      color: 0xbfe2ef,
      roughness: 0.08,
      transparent: true,
      opacity: 0.4,
      side: THREE.DoubleSide,
    })
  );
  endWindow.rotation.y = -Math.PI / 2;
  endWindow.position.set(11.98, 2.15, 2.4);
  hallwayGroup.add(endWindow);
  const endBench = new THREE.Mesh(
    new THREE.BoxGeometry(1.4, 0.14, 0.55),
    new THREE.MeshStandardMaterial({ color: 0x265445, roughness: 0.78 })
  );
  endBench.position.set(10.4, 0.45, 2.4);
  hallwayGroup.add(endBench);
  for (const bx of [-0.55, 0.55]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.45, 0.5), brassMat);
    leg.position.set(10.4 + bx, 0.225, 2.4);
    hallwayGroup.add(leg);
  }

  // Ice and vending alcove opposite the lift.
  const alcove = new THREE.Mesh(
    new THREE.BoxGeometry(0.35, 2.0, 1.6),
    new THREE.MeshStandardMaterial({ color: 0xd9d2c4, roughness: 0.5 })
  );
  alcove.position.set(-11.9, 1.0, -3.7);
  hallwayGroup.add(alcove);
  const iceSign = createSignCanvasTexture('ICE', 'VENDING', '#181b24', '#38bdf8', maxAnisotropy);
  const icePanel = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.4, 1.3),
    new THREE.MeshStandardMaterial({ map: iceSign, roughness: 0.35 })
  );
  icePanel.position.set(-11.7, 2.25, -3.7);
  hallwayGroup.add(icePanel);

  // Build eleven numbered door slots: five north, five south, one end.
  const doors: HallwayDoorSlot[] = doorSlots.map(({ x: dx, side }, idx) => {
    const doorGroup = new THREE.Group();
    const isEnd = side === 'end';
    doorGroup.position.set(isEnd ? 11.96 : dx, 0, isEnd ? 0 : side === 'north' ? -4.2 : 4.2);
    doorGroup.rotation.y = isEnd ? -Math.PI / 2 : side === 'north' ? 0 : Math.PI;
    doorGroup.userData.hallDoorIndex = idx;

    // Door Jambs
    for (const jx of [-0.54, 0.54]) {
      const jamb = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.35, 0.2), walnutMat);
      jamb.position.set(jx, 1.175, 0);
      doorGroup.add(jamb);
    }
    const hdr = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.1, 0.22), walnutMat);
    hdr.position.set(0, 2.35, 0);
    doorGroup.add(hdr);

    // Warm room glow behind openable door
    const insideGlow = new THREE.Mesh(
      new THREE.PlaneGeometry(1.0, 2.25),
      new THREE.MeshStandardMaterial({
        color: 0xffedd5,
        emissive: 0xffc878,
        emissiveIntensity: 0.45,
      })
    );
    insideGlow.position.set(0, 1.14, -0.35);
    doorGroup.add(insideGlow);

    // Hinged Door Pivot
    const doorPivot = new THREE.Group();
    doorPivot.position.set(-0.48, 0, 0);
    const panel = new THREE.Mesh(
      new THREE.BoxGeometry(0.96, 2.26, 0.07),
      new THREE.MeshStandardMaterial({ color: 0x623d26, roughness: 0.42 })
    );
    panel.position.set(0.48, 1.13, 0);
    panel.castShadow = true;
    doorPivot.add(panel);
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.04, 0.12), brassMat);
    handle.position.set(0.84, 1.04, 0.05);
    doorPivot.add(handle);
    doorGroup.add(doorPivot);

    // Plaque above door
    const plaqueTex = createSignCanvasTexture(
      idx === 10 ? 'SUITE 411' : `SUITE 4${String(idx + 1).padStart(2, '0')}`,
      'VACANT',
      '#1e222b',
      '#d4af5a',
      maxAnisotropy
    );
    const plaqueMat = new THREE.MeshStandardMaterial({ map: plaqueTex, roughness: 0.35 });
    const plaque = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.32, 0.05), plaqueMat);
    plaque.position.set(0, 2.65, 0.04);
    doorGroup.add(plaque);

    // Keycard LED Reader beside door
    const reader = new THREE.Mesh(
      new THREE.BoxGeometry(0.11, 0.18, 0.06),
      new THREE.MeshStandardMaterial({ color: 0x1a1d24, roughness: 0.3, metalness: 0.7 })
    );
    reader.position.set(0.72, 1.16, 0.04);
    doorGroup.add(reader);

    const ledMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      emissive: 0xf59e0b,
      emissiveIntensity: 1.4,
    });
    const led = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.035, 0.07), ledMat);
    led.position.set(0.72, 1.22, 0.045);
    doorGroup.add(led);

    hallwayGroup.add(doorGroup);

    return {
      index: idx,
      x: isEnd ? 11.96 : dx,
      z: isEnd ? 0 : side === 'north' ? -4.2 : 4.2,
      side,
      roomNumber: idx === 10 ? '411' : `4${String(idx + 1).padStart(2, '0')}`,
      kind: 'suite',
      resident: null,
      isPlayerSuite: false,
      unlocked: false,
      doorGroup,
      doorPivot,
      ledMat,
      plaqueMat,
      plaqueTex,
    };
  });

  function setFloorState(
    floor: number,
    unlockedRooms: Set<string>,
    residents: ActiveResident[],
    playerName: string,
    playerSuiteNumber: string,
    playerSuiteFloor: number,
    anisotropy: number
  ) {
    const nextFloorTex = createSignCanvasTexture(
      `FLOOR ${floor}`,
      `SUITES ${roomRangeLabel(floor)}`,
      '#181b24',
      '#d4af5a',
      anisotropy
    );
    floorSignMat.map = nextFloorTex;
    floorSignMat.needsUpdate = true;
    floorSignTex.dispose();
    floorSignTex = nextFloorTex;

    doors.forEach((d, idx) => {
      const roomNum = roomNumberForSlot(floor, idx);
      const isHousekeeping = roomNum === null;
      const isPlayer = !isHousekeeping && floor === playerSuiteFloor && roomNum === playerSuiteNumber;
      const resident = roomNum
        ? residents.find((r) => r.roomNumber === roomNum) ?? null
        : null;
      const unlocked = Boolean(roomNum && unlockedRooms.has(roomNum));

      d.roomNumber = roomNum ?? 'HOUSEKEEPING';
      d.kind = isHousekeeping ? 'housekeeping' : 'suite';
      d.isPlayerSuite = isPlayer;
      d.resident = resident;
      d.unlocked = unlocked;

      const subLabel = isHousekeeping
        ? 'HOUSEKEEPING'
        : isPlayer
        ? `${playerName.toUpperCase()} (YOU)`
        : resident
        ? resident.name.toUpperCase()
        : 'VACANT SUITE';

      const nextTex = createSignCanvasTexture(
        isHousekeeping ? 'STAFF ONLY' : `SUITE ${roomNum}`,
        subLabel,
        isPlayer ? '#0c2414' : resident ? '#101613' : '#181c1a',
        unlocked ? '#39ff14' : isHousekeeping ? '#f59e0b' : '#64748b',
        anisotropy
      );
      d.plaqueMat.map = nextTex;
      d.plaqueMat.needsUpdate = true;
      d.plaqueTex.dispose();
      d.plaqueTex = nextTex;

      const ledHex = unlocked ? 0x39ff14 : isHousekeeping ? 0xf59e0b : resident || isPlayer ? 0xf59e0b : 0x64748b;
      d.ledMat.color.setHex(ledHex);
      d.ledMat.emissive.setHex(ledHex);
    });
  }

  function updateHallway(_elapsed: number, delta: number, px: number, pz: number) {
    const dk = 1 - Math.exp(-9 * delta);

    // Elevator doors slide open when approaching West end
    const elevDist = Math.hypot(px - -11.6, pz - 0);
    const slide = elevDist < 2.2 ? 0.9 : 0;
    elevLeftDoor.position.x = THREE.MathUtils.lerp(elevLeftDoor.position.x, -0.46 - slide, dk);
    elevRightDoor.position.x = THREE.MathUtils.lerp(elevRightDoor.position.x, 0.46 + slide, dk);

    // Suite doors swing inward (-Z) when unlocked & player approaches
    for (const d of doors) {
      const dist = Math.hypot(px - d.x, pz - d.z);
      const targetAngle = d.unlocked && dist < 2.0 ? -1.25 : 0;
      d.doorPivot.rotation.y = THREE.MathUtils.lerp(d.doorPivot.rotation.y, targetAngle, dk);
    }
  }

  function isWalkable(x: number, z: number, radius = 0.28): boolean {
    const inElev = Math.abs(z) < 0.72 && x >= -12.35 && x <= -11.4;
    let inUnlockedDoor = false;
    for (const d of doors) {
      const inThreshold =
        d.side === 'north'
          ? z <= -3.55 && z >= -4.8
          : d.side === 'south'
          ? z >= 3.55 && z <= 4.8
          : x >= 11.1 && x <= 12.45 && Math.abs(z - d.z) < 0.55;
      if (d.unlocked && Math.abs(x - d.x) < (d.side === 'end' ? 1.3 : 0.55) && inThreshold) {
        inUnlockedDoor = true;
        break;
      }
    }
    if (
      !inElev &&
      !inUnlockedDoor &&
      (x < -11.7 + radius || x > 11.7 - radius || z < -3.9 + radius || z > 3.9 - radius)
    ) {
      return false;
    }
    return true;
  }

  return {
    hallwayGroup,
    groundRaycastPlane,
    elevatorGroup,
    elevLeftDoor,
    elevRightDoor,
    elevatorPos: { x: -11.3, z: 0 },
    doors,
    setFloorState,
    updateHallway,
    isWalkable,
  };
}