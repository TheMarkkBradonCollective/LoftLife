import * as THREE from 'three';
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
  side: 'north' | 'south';
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

export function buildHotelLobby(maxAnisotropy: number): HotelLobbyHandles {
  const lobbyGroup = new THREE.Group();

  // Floor (18m x 16m, x: -9..9, z: -8..8)
  const slab = new THREE.Mesh(
    new THREE.BoxGeometry(18.6, 0.4, 16.6),
    new THREE.MeshStandardMaterial({ color: 0x20232b, roughness: 0.7 })
  );
  slab.position.set(0, -0.21, 0);
  lobbyGroup.add(slab);

  const floorMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(18, 16),
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
    new THREE.PlaneGeometry(18, 16),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  groundRaycastPlane.rotation.x = -Math.PI / 2;
  groundRaycastPlane.position.y = 0.01;
  lobbyGroup.add(groundRaycastPlane);

  // Burgundy Lobby Runner Carpet (South Street Door to North Elevator)
  const runner = new THREE.Mesh(
    new THREE.BoxGeometry(2.5, 0.02, 14.4),
    new THREE.MeshStandardMaterial({
      color: 0x7a262c,
      roughness: 0.88,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    })
  );
  runner.position.set(0, 0.012, 0.1);
  runner.receiveShadow = true;
  lobbyGroup.add(runner);

  const wallMat = new THREE.MeshStandardMaterial({ color: 0xebe3d5, roughness: 0.72 });
  const walnutMat = new THREE.MeshStandardMaterial({ color: 0x4b3120, roughness: 0.45 });
  const brassMat = new THREE.MeshStandardMaterial({
    color: 0xd4af5a,
    roughness: 0.22,
    metalness: 0.86,
  });

  // North Wall (z = -8.12) split around Elevator bay (x: -1.1..1.1)
  for (const wx of [-5.05, 5.05]) {
    const seg = new THREE.Mesh(new THREE.BoxGeometry(7.9, 4.0, 0.24), wallMat);
    seg.position.set(wx, 2.0, -8.12);
    seg.castShadow = true;
    seg.receiveShadow = true;
    lobbyGroup.add(seg);

    const wain = new THREE.Mesh(new THREE.BoxGeometry(7.9, 1.1, 0.05), walnutMat);
    wain.position.set(wx, 0.55, -7.98);
    lobbyGroup.add(wain);
  }
  const northElevHeader = new THREE.Mesh(new THREE.BoxGeometry(2.3, 1.35, 0.24), wallMat);
  northElevHeader.position.set(0, 3.325, -8.12);
  lobbyGroup.add(northElevHeader);

  // West Wall (x = -9.12)
  const westWall = new THREE.Mesh(new THREE.BoxGeometry(0.24, 4.0, 16.4), wallMat);
  westWall.position.set(-9.12, 2.0, 0);
  westWall.castShadow = true;
  westWall.receiveShadow = true;
  lobbyGroup.add(westWall);

  const westWain = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.1, 16.0), walnutMat);
  westWain.position.set(-8.98, 0.55, 0);
  lobbyGroup.add(westWain);

  // East Low Architectural Trim (keeps Isometric view crystal clear)
  const eastCurb = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.35, 16.2), walnutMat);
  eastCurb.position.set(9.12, 0.175, 0);
  lobbyGroup.add(eastCurb);

  // South Main Entrance Archway & Glass Double Doors (z = +8.0) -> Exit back to Main City
  const streetDoorGroup = new THREE.Group();
  streetDoorGroup.position.set(0, 0, 8.0);
  streetDoorGroup.userData.isLobbyStreetDoor = true;

  for (const sx of [-1.2, 1.2]) {
    const col = new THREE.Mesh(new THREE.BoxGeometry(0.42, 2.8, 0.42), walnutMat);
    col.position.set(sx, 1.4, 0);
    streetDoorGroup.add(col);
  }
  const transom = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.32, 0.42), walnutMat);
  transom.position.set(0, 2.75, 0);
  streetDoorGroup.add(transom);

  const exitSignTex = createSignCanvasTexture(
    'MAIN STREET',
    'EXIT TO M ST & 15TH',
    '#0b100e',
    '#39ff14',
    maxAnisotropy
  );
  const exitSign = new THREE.Mesh(
    new THREE.BoxGeometry(1.75, 0.42, 0.08),
    new THREE.MeshStandardMaterial({ map: exitSignTex, roughness: 0.35 })
  );
  exitSign.position.set(0, 2.82, -0.22);
  streetDoorGroup.add(exitSign);

  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0xdff2ff,
    roughness: 0.1,
    transparent: true,
    opacity: 0.48,
  });

  const streetDoorLeftPivot = new THREE.Group();
  streetDoorLeftPivot.position.set(-0.96, 0, 0);
  const slFrame = new THREE.Mesh(new THREE.BoxGeometry(0.92, 2.45, 0.07), walnutMat);
  slFrame.position.set(0.46, 1.225, 0);
  streetDoorLeftPivot.add(slFrame);
  const slGlass = new THREE.Mesh(new THREE.BoxGeometry(0.7, 2.0, 0.09), glassMat);
  slGlass.position.set(0.46, 1.24, 0);
  streetDoorLeftPivot.add(slGlass);
  streetDoorGroup.add(streetDoorLeftPivot);

  const streetDoorRightPivot = new THREE.Group();
  streetDoorRightPivot.position.set(0.96, 0, 0);
  const srFrame = new THREE.Mesh(new THREE.BoxGeometry(0.92, 2.45, 0.07), walnutMat);
  srFrame.position.set(-0.46, 1.225, 0);
  streetDoorRightPivot.add(srFrame);
  const srGlass = new THREE.Mesh(new THREE.BoxGeometry(0.7, 2.0, 0.09), glassMat);
  srGlass.position.set(-0.46, 1.24, 0);
  streetDoorRightPivot.add(srGlass);
  streetDoorGroup.add(streetDoorRightPivot);
  lobbyGroup.add(streetDoorGroup);

  // North Wall Animated Brass Elevator (x = 0, z = -8.0)
  const elevatorGroup = new THREE.Group();
  elevatorGroup.position.set(0, 0, -8.0);
  elevatorGroup.userData.isElevator = true;

  const elevCabBack = new THREE.Mesh(
    new THREE.BoxGeometry(2.2, 2.65, 0.16),
    new THREE.MeshStandardMaterial({
      color: 0x3b2c20,
      emissive: 0xffd28a,
      emissiveIntensity: 0.18,
      roughness: 0.4,
    })
  );
  elevCabBack.position.set(0, 1.325, -0.78);
  elevatorGroup.add(elevCabBack);

  for (const ex of [-1.05, 1.05]) {
    const jamb = new THREE.Mesh(new THREE.BoxGeometry(0.18, 2.68, 0.3), brassMat);
    jamb.position.set(ex, 1.34, 0.04);
    elevatorGroup.add(jamb);
  }
  const elevTopFrame = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.22, 0.32), brassMat);
  elevTopFrame.position.set(0, 2.62, 0.04);
  elevatorGroup.add(elevTopFrame);

  const elevSignTex = createSignCanvasTexture(
    'ELEVATOR',
    'FLOORS 2 · 3 · 4',
    '#0b100e',
    '#39ff14',
    maxAnisotropy
  );
  const elevSign = new THREE.Mesh(
    new THREE.BoxGeometry(1.5, 0.45, 0.08),
    new THREE.MeshStandardMaterial({ map: elevSignTex, roughness: 0.3 })
  );
  elevSign.position.set(0, 3.05, 0.08);
  elevatorGroup.add(elevSign);

  const elevLeftDoor = new THREE.Mesh(new THREE.BoxGeometry(0.96, 2.48, 0.08), brassMat);
  elevLeftDoor.position.set(-0.48, 1.24, 0.02);
  elevatorGroup.add(elevLeftDoor);

  const elevRightDoor = new THREE.Mesh(new THREE.BoxGeometry(0.96, 2.48, 0.08), brassMat);
  elevRightDoor.position.set(0.48, 1.24, 0.02);
  elevatorGroup.add(elevRightDoor);

  // Illuminated Call Button Plate beside Elevator
  const callPlate = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.32, 0.06), brassMat);
  callPlate.position.set(1.36, 1.18, 0.06);
  elevatorGroup.add(callPlate);
  const callBtn = new THREE.Mesh(
    new THREE.SphereGeometry(0.035, 10, 10),
    new THREE.MeshStandardMaterial({
      color: 0x39ff14,
      emissive: 0x39ff14,
      emissiveIntensity: 1.6,
    })
  );
  callBtn.position.set(1.36, 1.18, 0.1);
  elevatorGroup.add(callBtn);
  lobbyGroup.add(elevatorGroup);

  // Front Reception / Concierge Desk (West side: x = -5.4, z = -1.2)
  const desk = new THREE.Group();
  desk.position.set(-5.4, 0, -1.2);
  const deskBody = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.04, 4.4), walnutMat);
  deskBody.position.y = 0.52;
  deskBody.castShadow = true;
  deskBody.receiveShadow = true;
  desk.add(deskBody);
  const deskTop = new THREE.Mesh(
    new THREE.BoxGeometry(1.35, 0.08, 4.55),
    new THREE.MeshStandardMaterial({ color: 0xf0e9dc, roughness: 0.22 })
  );
  deskTop.position.y = 1.08;
  desk.add(deskTop);
  const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 0.08, 12), brassMat);
  bell.position.set(0.35, 1.15, 0.6);
  desk.add(bell);
  lobbyGroup.add(desk);

  // Concierge NPC Morgan behind desk
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
  conciergeRig.root.position.set(-6.75, 0, -1.2);
  conciergeRig.root.rotation.y = Math.PI / 2;
  conciergeRig.root.userData.hotelNpcId = 'npc_concierge';
  lobbyGroup.add(conciergeRig.root);

  const npcs: HotelNpc[] = [
    {
      id: 'npc_concierge',
      name: 'Morgan (Concierge)',
      greeting:
        'Welcome to The LoftLife Grand Hotel! Step into the elevator ahead to ride up to Floors 2, 3, or 4 — your Suite 402 is on Floor 4.',
      rig: conciergeRig,
      x: -6.75,
      z: -1.2,
      yaw: Math.PI / 2,
      greetTimer: 0,
    },
  ];

  // Sittable Velvet Lounge Sofa in East Lounge (x = +4.8, z = +0.5)
  const seats: HotelSeat[] = [];
  const sofa = buildLobbySofa();
  sofa.position.set(5.2, 0, 0.4);
  sofa.rotation.y = -Math.PI / 2;
  sofa.userData.hotelSeatId = 'lobby_sofa';
  lobbyGroup.add(sofa);
  seats.push({
    id: 'lobby_sofa',
    label: 'Lobby Velvet Sofa',
    mesh: sofa,
    seatPos: { x: 5.15, y: 0.44, z: 0.4 },
    approachPos: { x: 4.12, z: 0.4 },
    facingYaw: -Math.PI / 2,
  });

  const coffeeTable = new THREE.Mesh(
    new THREE.CylinderGeometry(0.62, 0.62, 0.4, 20),
    new THREE.MeshStandardMaterial({ color: 0xefe8dc, roughness: 0.2 })
  );
  coffeeTable.position.set(3.15, 0.2, 0.4);
  coffeeTable.castShadow = true;
  lobbyGroup.add(coffeeTable);

  // Decorative Potted Lobby Palms
  const potMat = new THREE.MeshStandardMaterial({ color: 0xd4af5a, roughness: 0.3, metalness: 0.5 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x3b6e4c, roughness: 0.75 });
  const palmSpots: [number, number][] = [
    [-7.6, -6.6],
    [7.6, -6.6],
    [7.6, 5.8],
    [-7.6, 5.8],
  ];
  for (const [px, pz] of palmSpots) {
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.24, 0.56, 12), potMat);
    pot.position.set(px, 0.28, pz);
    lobbyGroup.add(pot);
    const frond = new THREE.Mesh(new THREE.IcosahedronGeometry(0.62, 1), leafMat);
    frond.position.set(px, 1.05, pz);
    lobbyGroup.add(frond);
  }

  // Grand Brass Chandelier overhead
  const chandelier = new THREE.Group();
  chandelier.position.set(0, 3.65, -0.5);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.05, 10, 28), brassMat);
  ring.rotation.x = Math.PI / 2;
  chandelier.add(ring);
  const bulbMat = new THREE.MeshStandardMaterial({
    color: 0xfff3d1,
    emissive: 0xffcf7a,
    emissiveIntensity: 1.5,
  });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), bulbMat);
    bulb.position.set(Math.cos(a) * 1.1, 0.08, Math.sin(a) * 1.1);
    chandelier.add(bulb);
  }
  lobbyGroup.add(chandelier);

  const elevatorPos = { x: 0, z: -7.15 };
  const streetDoorPos = { x: 0, z: 7.45 };

  function updateLobby(elapsed: number, delta: number, px: number, pz: number) {
    const dk = 1 - Math.exp(-9 * delta);

    // Elevator doors slide open when player walks up
    const elevDist = Math.hypot(px - 0, pz - -7.75);
    const slide = elevDist < 2.4 ? 0.92 : 0;
    elevLeftDoor.position.x = THREE.MathUtils.lerp(elevLeftDoor.position.x, -0.48 - slide, dk);
    elevRightDoor.position.x = THREE.MathUtils.lerp(elevRightDoor.position.x, 0.48 + slide, dk);

    // Street entrance double doors swing open when approaching south wall
    const streetDist = Math.hypot(px - 0, pz - 8.0);
    const doorAng = streetDist < 2.4 ? 1.2 : 0;
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

    // Concierge NPC animation
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
    const allowStreetCorridor = Math.abs(x) < 0.72 && z >= 7.2 && z <= 8.35;
    const allowElevCorridor = Math.abs(x) < 0.72 && z >= -8.35 && z <= -7.2;
    if (
      !allowStreetCorridor &&
      !allowElevCorridor &&
      (x < -8.7 + radius || x > 8.7 - radius || z < -7.7 + radius || z > 7.7 - radius)
    ) {
      return false;
    }
    // Reception desk & behind desk
    if (x < -4.55 + radius && x > -7.5 - radius && z > -3.65 - radius && z < 1.25 + radius) {
      return false;
    }
    // Lobby sofa + table
    if (x > 4.48 - radius && x < 5.95 + radius && z > -0.8 - radius && z < 1.6 + radius) {
      return false;
    }
    if (Math.hypot(x - 3.15, z - 0.4) < 0.62 + radius) return false;
    // Corner palms
    for (const [px, pz] of palmSpots) {
      if (Math.hypot(x - px, z - pz) < 0.45 + radius) return false;
    }
    return true;
  }

  return {
    lobbyGroup,
    groundRaycastPlane,
    elevatorGroup,
    streetDoorGroup,
    elevLeftDoor,
    elevRightDoor,
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
  const doorSlots = [
    ...doorXs.map((x) => ({ x, side: 'north' as const })),
    ...doorXs.map((x) => ({ x, side: 'south' as const })),
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

  // East End Wall (x = +12.12)
  const eastWall = new THREE.Mesh(new THREE.BoxGeometry(0.24, 3.4, 8.84), wallMat);
  eastWall.position.set(12.12, 1.7, 0);
  hallwayGroup.add(eastWall);

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
    'SUITES 401 – 410',
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
  }

  // Build 10 numbered suite doors, five on each corridor side.
  const doors: HallwayDoorSlot[] = doorSlots.map(({ x: dx, side }, idx) => {
    const doorGroup = new THREE.Group();
    doorGroup.position.set(dx, 0, side === 'north' ? -4.2 : 4.2);
    doorGroup.rotation.y = side === 'north' ? 0 : Math.PI;
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
      `SUITE 4${String(idx + 1).padStart(2, '0')}`,
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
      x: dx,
      z: side === 'north' ? -4.2 : 4.2,
      side,
      roomNumber: `4${String(idx + 1).padStart(2, '0')}`,
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
    anisotropy: number
  ) {
    const nextFloorTex = createSignCanvasTexture(
      `FLOOR ${floor}`,
      `SUITES ${floor}01 – ${floor}10`,
      '#181b24',
      '#d4af5a',
      anisotropy
    );
    floorSignMat.map = nextFloorTex;
    floorSignMat.needsUpdate = true;
    floorSignTex.dispose();
    floorSignTex = nextFloorTex;

    doors.forEach((d, idx) => {
      const roomNum = `${floor}${String(idx + 1).padStart(2, '0')}`;
      const isPlayer = floor === playerSuiteFloor && roomNum === playerSuiteNumber;
      const resident = residents.find((r) => r.roomNumber === roomNum) ?? null;
      const unlocked = unlockedRooms.has(roomNum);

      d.roomNumber = roomNum;
      d.isPlayerSuite = isPlayer;
      d.resident = resident;
      d.unlocked = unlocked;

      const subLabel = isPlayer
        ? `${playerName.toUpperCase()} (YOU)`
        : resident
        ? resident.name.toUpperCase()
        : 'VACANT SUITE';

      const nextTex = createSignCanvasTexture(
        `SUITE ${roomNum}`,
        subLabel,
        isPlayer ? '#0c2414' : resident ? '#101613' : '#181c1a',
        unlocked ? '#39ff14' : '#64748b',
        anisotropy
      );
      d.plaqueMat.map = nextTex;
      d.plaqueMat.needsUpdate = true;
      d.plaqueTex.dispose();
      d.plaqueTex = nextTex;

      const ledHex = unlocked ? 0x39ff14 : resident || isPlayer ? 0xf59e0b : 0x64748b;
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
      const inThreshold = d.side === 'north' ? z <= -3.55 && z >= -4.8 : z >= 3.55 && z <= 4.8;
      if (d.unlocked && Math.abs(x - d.x) < 0.55 && inThreshold) {
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
