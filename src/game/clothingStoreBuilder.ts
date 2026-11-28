import * as THREE from 'three';
import { createAvatarRig, type AvatarRig } from './avatar';
import type { AvatarConfig, EmoteType } from './types';

/**
 * LoftLife Threads — the city's dedicated clothing store.
 *
 * Completely separate from the airport: own building, own block, own interior,
 * racks, mannequins, fitting rooms, mirrors and checkout. Buying adds to the
 * account inventory; wearing still happens at the home closet.
 */

export interface StoreHandles {
  storeGroup: THREE.Group;
  groundRaycastPlane: THREE.Mesh;
  entrancePos: { x: number; z: number };
  checkoutPos: { x: number; z: number };
  fittingPos: { x: number; z: number };
  mirrorPos: { x: number; z: number };
  stylist: { name: string; greeting: string; rig: AvatarRig; x: number; z: number; greetTimer: number };
  updateStore: (elapsed: number, delta: number, px: number, pz: number) => void;
  isWalkable: (x: number, z: number, radius?: number) => boolean;
}

function box(w: number, h: number, d: number, mat: THREE.Material) {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
}

function add(
  group: THREE.Group,
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

function canvasSign(
  label: string,
  sub: string,
  fg: string,
  bg: string,
  accent: string,
  anisotropy: number
) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 512, 128);
  ctx.strokeStyle = accent;
  ctx.lineWidth = 5;
  ctx.strokeRect(5, 5, 502, 118);
  ctx.fillStyle = fg;
  ctx.font = 'bold 44px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(label, 256, 62);
  ctx.fillStyle = accent;
  ctx.font = '600 22px sans-serif';
  ctx.fillText(sub, 256, 98);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = anisotropy;
  return tex;
}

const GARMENT_COLORS = [0x9e5440, 0x2f5d3f, 0x39465c, 0xc7b08e, 0x785874, 0xe8e1d4, 0xd49a45, 0x262930];

function buildRack(
  group: THREE.Group,
  x: number,
  z: number,
  width: number,
  rotY: number,
  metal: THREE.Material,
  count = 12
) {
  const rack = new THREE.Group();
  rack.position.set(x, 0, z);
  rack.rotation.y = rotY;
  add(rack, box(width, 0.05, 0.05, metal), 0, 1.62, 0);
  for (const sx of [-1, 1]) {
    add(rack, box(0.05, 1.62, 0.05, metal), sx * (width / 2 - 0.03), 0.81, 0);
    add(rack, box(0.05, 0.04, 0.46, metal), sx * (width / 2 - 0.03), 0.02, 0);
  }
  for (let i = 0; i < count; i++) {
    const gx = -width / 2 + 0.18 + (i / count) * (width - 0.36);
    const garmentMat = new THREE.MeshStandardMaterial({ color: GARMENT_COLORS[i % GARMENT_COLORS.length], roughness: 0.85 });
    add(rack, box(0.055, 0.055, 0.02, metal), gx, 1.58, 0.02);
    add(rack, box(0.29, 0.72, 0.1, garmentMat), gx, 1.2, 0);
    add(rack, box(0.3, 0.05, 0.12, garmentMat), gx, 1.56, 0);
  }
  group.add(rack);
  return rack;
}

function buildMannequin(
  group: THREE.Group,
  x: number,
  z: number,
  color: number,
  yaw: number,
  pedestal: THREE.Material
) {
  const m = new THREE.Group();
  m.position.set(x, 0, z);
  m.rotation.y = yaw;
  add(m, new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.38, 0.08, 18), pedestal), 0, 0.04, 0);
  add(m, new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, 0.66, 8), pedestal), 0, 0.4, 0);
  const fabric = new THREE.MeshStandardMaterial({ color, roughness: 0.8 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xe7ddd2, roughness: 0.5 });
  // Legs
  for (const sx of [-1, 1]) {
    add(m, new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.075, 0.82, 10), fabric), sx * 0.1, 0.45, 0);
  }
  // Torso
  add(m, new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.17, 0.7, 12), fabric), 0, 1.22, 0);
  add(m, new THREE.Mesh(new THREE.SphereGeometry(0.23, 12, 8), fabric), 0, 0.96, 0);
  // Arms
  for (const sx of [-1, 1]) {
    add(m, new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.66, 8), fabric), sx * 0.25, 1.28, 0, 0, 0, sx * 0.08);
  }
  // Head
  add(m, new THREE.Mesh(new THREE.SphereGeometry(0.11, 14, 12), skin), 0, 1.7, 0);
  add(m, new THREE.Mesh(new THREE.SphereGeometry(0.115, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.58), new THREE.MeshStandardMaterial({ color: 0x2b241f, roughness: 0.8 })), 0, 1.74, -0.01);
  group.add(m);
  return m;
}

function buildFittingRooms(group: THREE.Group, wallMat: THREE.Material, curtainMat: THREE.Material, metal: THREE.Material) {
  const rooms = new THREE.Group();
  rooms.position.set(8.6, 0, -1.2);
  for (let i = 0; i < 3; i++) {
    const z = -2.2 + i * 2.2;
    add(rooms, box(0.12, 2.6, 2.05, wallMat), 0, 1.3, z);
    add(rooms, box(1.9, 0.12, 2.05, wallMat), -0.95, 2.54, z);
    add(rooms, box(1.9, 0.12, 0.08, wallMat), -0.95, 0.06, z - 1.02);
    add(rooms, box(1.9, 0.12, 0.08, wallMat), -0.95, 0.06, z + 1.02);
    // Curtain across the open side
    add(rooms, box(0.05, 2.25, 1.75, curtainMat), -1.82, 1.32, z);
    for (let k = 0; k < 6; k++) {
      add(rooms, box(0.03, 2.2, 0.03, curtainMat), -1.86, 1.3, z - 0.72 + k * 0.28);
    }
    add(rooms, box(0.04, 0.04, 2.0, metal), -1.82, 2.48, z);
    add(rooms, new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.06, 6), metal), -1.82, 2.3, z - 0.7);
  }
  add(rooms, box(0.12, 2.6, 6.7, wallMat), 0, 1.3, -2.2);
  group.add(rooms);
  return rooms;
}

export function buildClothingStore(maxAnisotropy: number): StoreHandles {
  const storeGroup = new THREE.Group();
  storeGroup.name = 'loftlife-threads';

  const floorTexCanvas = document.createElement('canvas');
  floorTexCanvas.width = 256;
  floorTexCanvas.height = 256;
  const fctx = floorTexCanvas.getContext('2d')!;
  fctx.fillStyle = '#b98d5f';
  fctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 16; i++) {
    fctx.fillStyle = i % 2 ? '#b18457' : '#c19667';
    fctx.fillRect(0, i * 16, 256, 15);
    fctx.strokeStyle = 'rgba(74,50,30,0.16)';
    fctx.beginPath();
    fctx.moveTo(0, i * 16);
    fctx.lineTo(256, i * 16);
    fctx.stroke();
  }
  const floorTex = new THREE.CanvasTexture(floorTexCanvas);
  floorTex.wrapS = THREE.RepeatWrapping;
  floorTex.wrapT = THREE.RepeatWrapping;
  floorTex.repeat.set(4, 3);
  floorTex.colorSpace = THREE.SRGBColorSpace;
  floorTex.anisotropy = maxAnisotropy;

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(21, 15),
    new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.52, metalness: 0.02 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  storeGroup.add(floor);
  add(storeGroup, box(21.4, 0.4, 15.4, new THREE.MeshStandardMaterial({ color: 0x2c2622, roughness: 0.8 })), 0, -0.21, 0);
  const groundRaycastPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(21, 15),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  groundRaycastPlane.rotation.x = -Math.PI / 2;
  groundRaycastPlane.position.y = 0.01;
  storeGroup.add(groundRaycastPlane);

  const wallMat = new THREE.MeshStandardMaterial({ color: 0xefe8dc, roughness: 0.75 });
  const accentWall = new THREE.MeshStandardMaterial({ color: 0x2f3b34, roughness: 0.68 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x6b4730, roughness: 0.5 });
  const metal = new THREE.MeshStandardMaterial({ color: 0xb9a06a, roughness: 0.25, metalness: 0.82 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1c1f24, roughness: 0.45 });
  const cream = new THREE.MeshStandardMaterial({ color: 0xf4efe6, roughness: 0.8 });
  const curtainMat = new THREE.MeshStandardMaterial({ color: 0x9a7f68, roughness: 0.95, side: THREE.DoubleSide });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0xd8ecf4, roughness: 0.06, transparent: true, opacity: 0.32, side: THREE.DoubleSide });

  // Shell
  add(storeGroup, box(21, 4.2, 0.24, wallMat), 0, 2.1, -7.5);
  add(storeGroup, box(0.24, 4.2, 15, wallMat), -10.5, 2.1, 0);
  add(storeGroup, box(0.24, 4.2, 15, accentWall), 10.5, 2.1, 0);
  // South storefront: glass either side of a 3.2 m entrance.
  for (const [x0, x1] of [
    [-10.4, -1.8],
    [1.8, 10.4],
  ]) {
    add(storeGroup, new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, 3.0), glass), (x0 + x1) / 2, 1.9, 7.45);
    add(storeGroup, box(x1 - x0, 0.16, 0.18, dark), (x0 + x1) / 2, 3.4, 7.42);
    add(storeGroup, box(x1 - x0, 0.16, 0.18, dark), (x0 + x1) / 2, 0.4, 7.42);
    for (let x = x0 + 1.2; x < x1; x += 1.8) {
      add(storeGroup, box(0.06, 3.0, 0.12, dark), x, 1.9, 7.4);
    }
  }
  add(storeGroup, box(21, 0.3, 0.24, wallMat), 0, 4.05, 7.5);
  const doorPivot = new THREE.Group();
  doorPivot.position.set(-0.62, 0, 7.4);
  add(doorPivot, box(1.24, 2.7, 0.08, glass), 0.62, 1.35, 0);
  add(doorPivot, box(1.24, 0.07, 0.1, dark), 0.62, 2.72, 0);
  storeGroup.add(doorPivot);

  // Ceiling and track lighting
  add(storeGroup, box(21.2, 0.16, 15.2, new THREE.MeshStandardMaterial({ color: 0x2a2b2d, roughness: 0.7 })), 0, 4.1, 0);
  for (const z of [-4, 0, 4]) {
    add(storeGroup, box(19.6, 0.06, 0.08, dark), 0, 3.9, z);
    for (let x = -8; x <= 8; x += 2.2) {
      add(storeGroup, new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.14, 10), new THREE.MeshStandardMaterial({ color: 0xfff1d2, emissive: 0xffd99a, emissiveIntensity: 1.1 })), x, 3.78, z);
    }
  }

  // Brand signage
  const logo = new THREE.Mesh(
    new THREE.PlaneGeometry(5.4, 1.3),
    new THREE.MeshBasicMaterial({
      map: canvasSign('LOFTLIFE THREADS', 'CITY STYLE · EVERYDAY WEAR', '#f7f3ea', '#23302a', '#39ff14', maxAnisotropy),
      transparent: true,
    })
  );
  add(storeGroup, logo, 0, 3.45, -7.34);
  const saleSign = new THREE.Mesh(
    new THREE.PlaneGeometry(2.8, 0.7),
    new THREE.MeshBasicMaterial({
      map: canvasSign('NEW SEASON', 'CURATED IN THE CITY', '#101510', '#e8e1d4', '#23302a', maxAnisotropy),
      transparent: true,
    })
  );
  add(storeGroup, saleSign, -6.8, 2.7, -7.33);

  // Racks along the north wall and center floor
  buildRack(storeGroup, -5.2, -6.3, 4.6, 0, metal, 16);
  buildRack(storeGroup, 0.4, -6.3, 4.6, 0, metal, 16);
  buildRack(storeGroup, 5.6, -6.3, 3.6, 0, metal, 12);
  buildRack(storeGroup, -6.2, -1.2, 3.8, Math.PI / 2, metal, 12);
  buildRack(storeGroup, 0.2, 0.4, 3.6, Math.PI / 2, metal, 12);

  // Folded-stock tables
  for (const [x, z] of [
    [-4.2, 2.6],
    [1.2, 2.8],
  ]) {
    add(storeGroup, box(2.6, 0.08, 1.2, wood), x, 0.82, z);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        add(storeGroup, box(0.06, 0.8, 0.06, metal), x + sx * 1.15, 0.4, z + sz * 0.48);
      }
    }
    for (let i = 0; i < 5; i++) {
      add(storeGroup, box(0.34, 0.1, 0.34, new THREE.MeshStandardMaterial({ color: GARMENT_COLORS[(i + 2) % GARMENT_COLORS.length], roughness: 0.88 })), x - 0.96 + i * 0.48, 0.9 + (i % 2) * 0.04, z);
    }
  }

  // Mannequins in the window
  buildMannequin(storeGroup, -7.6, 5.6, 0xc86b51, 0.35, dark);
  buildMannequin(storeGroup, -4.4, 5.6, 0x3f6b56, -0.25, dark);
  buildMannequin(storeGroup, 5.2, 5.4, 0x39465c, 3.0, dark);

  // Shoe wall and accessories
  const shoeWall = new THREE.Group();
  shoeWall.position.set(8.9, 0, -4.4);
  for (let i = 0; i < 5; i++) {
    add(shoeWall, box(2.3, 0.05, 0.58, wood), 0, 0.35 + i * 0.52, 0);
    for (let k = 0; k < 4; k++) {
      add(shoeWall, box(0.24, 0.12, 0.34, new THREE.MeshStandardMaterial({ color: GARMENT_COLORS[(i + k) % GARMENT_COLORS.length], roughness: 0.5 })), -0.8 + k * 0.53, 0.44 + i * 0.52, 0.05);
    }
  }
  add(shoeWall, box(2.5, 2.9, 0.12, accentWall), 0, 1.45, -0.36);
  storeGroup.add(shoeWall);

  const accessoryWall = new THREE.Group();
  accessoryWall.position.set(-9.9, 0, 1.2);
  for (let i = 0; i < 3; i++) {
    add(accessoryWall, box(0.06, 0.05, 3.2, wood), -0.42, 1.4 + i * 0.55, 0);
    for (let k = 0; k < 7; k++) {
      add(accessoryWall, new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.02, 8, 14), new THREE.MeshStandardMaterial({ color: GARMENT_COLORS[(i + k + 1) % GARMENT_COLORS.length], roughness: 0.4 })), -0.38, 1.48 + i * 0.55, -1.3 + k * 0.43);
    }
  }
  storeGroup.add(accessoryWall);

  // Mirrors
  const mirrorGlass = new THREE.MeshPhysicalMaterial({ color: 0xe3edf4, roughness: 0.03, metalness: 0.92, clearcoat: 1 });
  for (const [x, z, ry] of [
    [-9.9, 4.8, Math.PI / 2],
    [2.2, -1.0, 0],
  ] as const) {
    add(storeGroup, box(0.12, 2.2, 1.0, metal), x, 1.15, z, 0, ry);
    add(storeGroup, box(0.04, 2.05, 0.86, mirrorGlass), x + 0.08, 1.15, z, 0, ry);
  }

  // Fitting rooms
  buildFittingRooms(storeGroup, wallMat, curtainMat, metal);

  // Checkout counter
  const checkout = new THREE.Group();
  checkout.position.set(5.8, 0, 0.9);
  add(checkout, box(3.4, 1.05, 0.9, wood), 0, 0.53, 0);
  add(checkout, box(3.5, 0.08, 1.0, cream), 0, 1.09, 0);
  add(checkout, box(0.42, 0.32, 0.3, dark), 0.8, 1.3, 0);
  add(checkout, box(0.32, 0.04, 0.24, new THREE.MeshStandardMaterial({ color: 0x0d151c, emissive: 0x39ff14, emissiveIntensity: 0.4 })), 0.8, 1.48, 0);
  add(checkout, box(0.3, 0.04, 0.2, metal), -0.9, 1.14, 0.18);
  for (let i = 0; i < 3; i++) {
    add(checkout, box(0.34, 0.38, 0.18, new THREE.MeshStandardMaterial({ color: 0xd8c9b4, roughness: 0.8 })), -0.3 - i * 0.4, 1.3, -0.1);
  }
  add(checkout, box(3.5, 0.5, 0.06, new THREE.MeshStandardMaterial({ color: 0x14190f, emissive: 0x39ff14, emissiveIntensity: 0.18 })), 0, 2.65, -0.62);
  storeGroup.add(checkout);

  // Plants and bench
  for (const [x, z] of [
    [-9.3, 6.4],
    [9.3, 6.4],
    [-9.4, -6.5],
  ]) {
    add(storeGroup, new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.2, 0.5, 14), new THREE.MeshStandardMaterial({ color: 0x7b5a3e, roughness: 0.8 })), x, 0.25, z);
    add(storeGroup, new THREE.Mesh(new THREE.IcosahedronGeometry(0.45, 1), new THREE.MeshStandardMaterial({ color: 0x4f7d4a, roughness: 0.82 })), x, 0.92, z);
  }
  add(storeGroup, box(2.0, 0.18, 0.6, cream), 1.4, 0.46, 5.0);
  add(storeGroup, box(2.0, 0.5, 0.12, cream), 1.4, 0.75, 4.74);

  // Stylist NPC
  const stylistAvatar: AvatarConfig = {
    name: 'Nia',
    skinTone: '#6f452d',
    hairStyle: 'curls',
    hairColor: '#241b18',
    topStyle: 'cardigan',
    topColor: '#c86b51',
    bottomStyle: 'chinos',
    bottomColor: '#2b3a2a',
    shoeColor: '#1b1b1b',
    accessory: 'none',
    jewelry: 'earrings',
    eyebrows: 'arched',
    eyeStyle: 'deep_brown',
    makeupStyle: 'soft',
  };
  const stylistRig = createAvatarRig(stylistAvatar);
  stylistRig.root.position.set(3.9, 0, 0.4);
  stylistRig.root.rotation.y = -0.7;
  stylistRig.root.userData.storeStylist = true;
  // No simulated store staff avatars; shopping is handled through the UI.

  const blockers = [
    { x: -5.2, z: -6.1, hw: 2.5, hd: 0.5 },
    { x: 0.4, z: -6.1, hw: 2.5, hd: 0.5 },
    { x: 5.6, z: -6.1, hw: 1.9, hd: 0.5 },
    { x: -6.0, z: -1.2, hw: 0.5, hd: 2.0 },
    { x: 0.2, z: 0.4, hw: 0.5, hd: 1.9 },
    { x: -4.2, z: 2.6, hw: 1.35, hd: 0.65 },
    { x: 1.2, z: 2.8, hw: 1.35, hd: 0.65 },
    { x: 5.8, z: 0.9, hw: 1.8, hd: 0.55 },
    { x: 8.6, z: -1.2, hw: 0.9, hd: 3.4 },
    { x: 8.9, z: -4.4, hw: 1.3, hd: 0.45 },
    { x: -9.9, z: 1.2, hw: 0.35, hd: 1.7 },
    { x: -7.6, z: 5.6, hw: 0.45, hd: 0.45 },
    { x: -4.4, z: 5.6, hw: 0.45, hd: 0.45 },
    { x: 5.2, z: 5.4, hw: 0.45, hd: 0.45 },
    { x: 1.4, z: 5.0, hw: 1.0, hd: 0.35 },
  ];

  function isWalkable(x: number, z: number, radius = 0.28) {
    if (x < -10.1 + radius || x > 10.1 - radius || z < -7.1 + radius || z > 7.1 - radius) {
      return false;
    }
    for (const b of blockers) {
      if (Math.abs(x - b.x) < b.hw + radius && Math.abs(z - b.z) < b.hd + radius) return false;
    }
    return true;
  }

  function updateStore(elapsed: number, delta: number, px: number, pz: number) {
    const open = Math.abs(px) < 2.2 && pz > 5.4;
    doorPivot.rotation.y = THREE.MathUtils.lerp(doorPivot.rotation.y, open ? -1.3 : 0, 1 - Math.exp(-9 * delta));
    stylist.greetTimer = Math.max(0, stylist.greetTimer - delta);
    stylistRig.updateAnimation(stylist.greetTimer > 0 ? 'wave' : 'idle', false, elapsed, delta, 0);
  }

  const stylist = {
    name: 'Nia (Stylist)',
    greeting: 'Welcome to LoftLife Threads! Browse the racks and buy at the counter. You can try pieces on here, but outfit changes happen at your home closet.',
    rig: stylistRig,
    x: 3.9,
    z: 0.4,
    greetTimer: 0,
  };

  return {
    storeGroup,
    groundRaycastPlane,
    entrancePos: { x: 0, z: 6.9 },
    checkoutPos: { x: 5.8, z: 2.0 },
    fittingPos: { x: 6.7, z: -1.2 },
    mirrorPos: { x: -9.0, z: 4.8 },
    stylist,
    updateStore,
    isWalkable,
  };
}
