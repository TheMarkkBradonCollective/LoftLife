import * as THREE from 'three';
import type { PlacedItem } from './types';

/**
 * Builders for the expanded furniture collection.
 *
 * These pieces are procedurally modelled from shared primitive helpers so the
 * bundle grows by code, not by megabyte-sized texture atlases. Everything is
 * low-poly, reuses materials within a piece, and only interactive pieces add a
 * single PointLight (and never in ghost or software-GL mode).
 */

interface ExtraOptions {
  isGhost?: boolean;
  isSoftwareGl?: boolean;
}

function makeBox(w: number, h: number, d: number, material: THREE.Material) {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
}

function makeCylinder(
  top: number,
  bottom: number,
  height: number,
  material: THREE.Material,
  segments = 16
) {
  return new THREE.Mesh(new THREE.CylinderGeometry(top, bottom, height, segments), material);
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

interface Materials {
  fabric: THREE.MeshPhysicalMaterial;
  wood: THREE.MeshStandardMaterial;
  darkWood: THREE.MeshStandardMaterial;
  metal: THREE.MeshStandardMaterial;
  stone: THREE.MeshStandardMaterial;
  glass: THREE.MeshPhysicalMaterial;
  cream: THREE.MeshStandardMaterial;
  dark: THREE.MeshStandardMaterial;
  accent: THREE.MeshStandardMaterial;
  primary: THREE.Color;
}

function makeMaterials(colorHex: string): Materials {
  const primary = new THREE.Color(colorHex);
  return {
    primary,
    fabric: new THREE.MeshPhysicalMaterial({
      color: primary,
      roughness: 0.84,
      sheen: 0.55,
      sheenRoughness: 0.7,
      sheenColor: new THREE.Color('#ffffff').lerp(primary, 0.55),
    }),
    wood: new THREE.MeshStandardMaterial({ color: primary, roughness: 0.5, metalness: 0.02 }),
    darkWood: new THREE.MeshStandardMaterial({ color: 0x5c3c24, roughness: 0.58 }),
    metal: new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.32, metalness: 0.72 }),
    stone: new THREE.MeshStandardMaterial({ color: primary, roughness: 0.38, metalness: 0.04 }),
    glass: new THREE.MeshPhysicalMaterial({
      color: 0xd9ecf5,
      roughness: 0.08,
      metalness: 0.05,
      transparent: true,
      opacity: 0.42,
    }),
    cream: new THREE.MeshStandardMaterial({ color: 0xf0eae0, roughness: 0.78 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x17191d, roughness: 0.5 }),
    accent: new THREE.MeshStandardMaterial({ color: 0xd4af5a, roughness: 0.25, metalness: 0.8 }),
  };
}

function addLegs(
  group: THREE.Group,
  m: Materials,
  width: number,
  depth: number,
  height = 0.18,
  radius = 0.025
) {
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      add(
        group,
        makeCylinder(radius * 0.8, radius, height, m.darkWood, 8),
        sx * (width / 2 - 0.07),
        height / 2,
        sz * (depth / 2 - 0.07)
      );
    }
  }
}

function buildSofaLike(
  width: number,
  depth: number,
  m: Materials,
  variant: 'standard' | 'armchair' | 'chaise' | 'patio'
) {
  const g = new THREE.Group();
  const baseW = width * 0.9;
  const baseD = depth * 0.78;
  const seatY = variant === 'patio' ? 0.33 : 0.29;

  if (variant === 'patio') {
    add(g, makeBox(baseW, 0.08, baseD, m.wood), 0, 0.32, 0);
    for (const sx of [-1, 1]) {
      add(g, makeBox(0.07, 0.32, 0.07, m.wood), sx * (baseW / 2 - 0.05), 0.16, baseD / 2 - 0.05);
      add(g, makeBox(0.07, 0.32, 0.07, m.wood), sx * (baseW / 2 - 0.05), 0.16, -baseD / 2 + 0.05);
    }
    add(g, makeBox(baseW * 0.94, 0.14, baseD * 0.86, m.fabric), 0, 0.43, 0.02);
    add(g, makeBox(baseW, 0.5, 0.14, m.wood), 0, 0.58, -baseD / 2 + 0.04);
    add(g, makeBox(baseW * 0.9, 0.32, 0.1, m.fabric), 0, 0.67, -baseD / 2 + 0.13);
    for (const sx of [-1, 1]) {
      add(g, makeBox(0.1, 0.42, baseD, m.wood), sx * (baseW / 2 - 0.03), 0.5, 0);
    }
    return g;
  }

  add(g, makeBox(baseW, 0.18, baseD, m.darkWood), 0, 0.19, 0);
  addLegs(g, m, baseW, baseD, 0.16);
  add(g, makeBox(baseW * 0.96, 0.16, baseD * 0.88, m.fabric), 0, seatY + 0.05, 0.02);

  if (variant === 'chaise') {
    add(g, makeBox(baseW * 0.5, 0.14, baseD * 1.35, m.fabric), -baseW * 0.22, seatY + 0.12, 0.12);
  }
  add(g, makeBox(baseW, variant === 'armchair' ? 0.5 : 0.46, 0.18, m.fabric), 0, seatY + 0.34, -baseD / 2 + 0.02);
  for (const sx of [-1, 1]) {
    add(
      g,
      makeBox(0.16, 0.38, baseD, m.fabric),
      sx * (baseW / 2 - 0.05),
      seatY + 0.16,
      0.02
    );
  }
  // Cushions and a folded throw make the silhouette less blocky.
  for (const sx of [-0.34, 0.34]) {
    add(g, makeBox(baseW * 0.4, 0.1, baseD * 0.72, m.cream), sx * baseW * 0.24, seatY + 0.17, 0.05);
  }
  const throwMat = new THREE.MeshStandardMaterial({ color: 0xd99b52, roughness: 0.9 });
  add(g, makeBox(0.28, 0.06, baseD * 0.5, throwMat), baseW * 0.34, seatY + 0.24, 0, 0, 0.2, 0);
  return g;
}

function buildChair(m: Materials, office = false, wood = false) {
  const g = new THREE.Group();
  if (office) {
    add(g, makeCylinder(0.26, 0.28, 0.05, m.metal, 20), 0, 0.08, 0);
    add(g, makeCylinder(0.035, 0.04, 0.3, m.metal, 10), 0, 0.23, 0);
    add(g, makeBox(0.5, 0.11, 0.48, m.fabric), 0, 0.45, 0);
    add(g, makeBox(0.46, 0.48, 0.1, m.fabric), 0, 0.73, -0.21, -0.08);
    for (const sx of [-1, 1]) {
      add(g, makeBox(0.06, 0.22, 0.4, m.metal), sx * 0.25, 0.6, 0.02);
    }
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      add(g, makeBox(0.24, 0.04, 0.05, m.metal), Math.cos(a) * 0.16, 0.04, Math.sin(a) * 0.16, 0, -a, 0);
    }
    return g;
  }
  const frame = wood ? m.wood : m.darkWood;
  add(g, makeBox(0.48, 0.08, 0.46, m.fabric), 0, 0.46, 0);
  add(g, makeBox(0.46, 0.5, 0.08, m.fabric), 0, 0.7, -0.2, -0.06);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      add(g, makeCylinder(0.018, 0.024, 0.44, frame, 8), sx * 0.2, 0.22, sz * 0.18);
    }
  }
  return g;
}

function buildBed(width: number, depth: number, m: Materials) {
  const g = new THREE.Group();
  add(g, makeBox(width * 0.92, 0.22, depth * 0.9, m.darkWood), 0, 0.19, 0.04);
  addLegs(g, m, width * 0.9, depth * 0.86, 0.14, 0.03);
  add(g, makeBox(width * 0.9, 0.26, depth * 0.84, m.cream), 0, 0.4, 0.06);
  // Duvet folded over the lower half.
  add(g, makeBox(width * 0.9, 0.08, depth * 0.46, m.fabric), 0, 0.55, depth * 0.16);
  // Padded headboard.
  add(g, makeBox(width * 0.94, 0.95, 0.16, m.fabric), 0, 0.62, -depth * 0.44);
  for (const sx of [-1, 1]) {
    add(
      g,
      makeBox(width * 0.34, 0.14, 0.42, m.cream),
      sx * width * 0.22,
      0.6,
      -depth * 0.27,
      0.12
    );
  }
  return g;
}

function buildCabinet(m: Materials, width: number, height: number, depth: number, drawers: number) {
  const g = new THREE.Group();
  add(g, makeBox(width, height, depth, m.wood), 0, height / 2 + 0.04, 0);
  const drawerH = (height - 0.16) / drawers;
  for (let i = 0; i < drawers; i++) {
    const y = 0.1 + drawerH / 2 + i * drawerH;
    add(g, makeBox(width * 0.9, drawerH * 0.82, 0.03, m.darkWood), 0, y, depth / 2 + 0.012);
    add(g, makeCylinder(0.012, 0.012, 0.1, m.accent, 8), 0, y, depth / 2 + 0.03, 0, 0, Math.PI / 2);
  }
  for (const sx of [-1, 1]) {
    add(g, makeBox(0.05, 0.1, 0.05, m.darkWood), sx * (width / 2 - 0.08), 0.05, depth / 2 - 0.08);
  }
  return g;
}

function buildWardrobe(m: Materials, width: number) {
  const g = new THREE.Group();
  add(g, makeBox(width, 2.05, 0.64, m.wood), 0, 1.045, 0);
  for (const sx of [-1, 1]) {
    add(g, makeBox(width * 0.44, 1.86, 0.03, m.darkWood), sx * width * 0.23, 1.06, 0.325);
    add(g, makeBox(0.03, 0.28, 0.03, m.accent), sx * 0.05, 1.12, 0.35);
  }
  add(g, makeBox(width * 0.94, 0.08, 0.58, m.darkWood), 0, 2.1, 0);
  add(g, makeBox(width * 0.9, 0.14, 0.5, m.darkWood), 0, 0.07, 0);
  return g;
}

function buildPlant(m: Materials, tall: boolean) {
  const g = new THREE.Group();
  const potMat = m.wood;
  const potH = tall ? 0.45 : 0.22;
  add(g, makeCylinder(tall ? 0.2 : 0.12, tall ? 0.16 : 0.1, potH, potMat, 16), 0, potH / 2, 0);
  add(g, makeCylinder(tall ? 0.17 : 0.1, tall ? 0.17 : 0.1, 0.02, m.dark, 16), 0, potH, 0);
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x3f6e46, roughness: 0.78 });
  const leafMat2 = new THREE.MeshStandardMaterial({ color: 0x5a8658, roughness: 0.75 });
  if (tall) {
    add(g, makeCylinder(0.025, 0.045, 1.05, m.darkWood, 8), 0, 0.95, 0);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), i % 2 ? leafMat : leafMat2);
      leaf.scale.set(1.2, 0.55, 0.8);
      add(g, leaf, Math.cos(a) * 0.2, 1.15 + i * 0.1, Math.sin(a) * 0.2, 0, -a, 0.25);
    }
  } else {
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), i % 2 ? leafMat : leafMat2);
      leaf.scale.set(1, 0.6, 1);
      add(g, leaf, Math.cos(a) * 0.07, potH + 0.08, Math.sin(a) * 0.07);
    }
  }
  return g;
}

function buildTelevision(m: Materials, stand: boolean) {
  const g = new THREE.Group();
  if (stand) {
    add(g, makeBox(1.8, 0.45, 0.42, m.wood), 0, 0.26, 0);
    for (const sx of [-1, 1]) add(g, makeBox(0.06, 0.14, 0.34, m.darkWood), sx * 0.78, 0.07, 0);
  } else {
    add(g, makeBox(0.6, 0.06, 0.32, m.metal), 0, 0.03, 0);
    add(g, makeCylinder(0.035, 0.045, 0.5, m.metal, 10), 0, 0.3, 0);
  }
  const screenMat = new THREE.MeshStandardMaterial({
    color: 0x090d13,
    emissive: 0x2f6f9a,
    emissiveIntensity: 0.75,
    roughness: 0.18,
    metalness: 0.2,
  });
  add(g, makeBox(1.62, 0.92, 0.06, m.dark), 0, stand ? 1.03 : 0.9, 0);
  add(g, makeBox(1.52, 0.82, 0.02, screenMat), 0, stand ? 1.03 : 0.9, 0.04);
  g.userData.emissiveMats = [screenMat];
  return g;
}

function buildLamp(m: Materials, tall: boolean) {
  const g = new THREE.Group();
  const shadeMat = new THREE.MeshStandardMaterial({
    color: 0xfff1cf,
    emissive: 0xffc878,
    emissiveIntensity: 1.2,
    roughness: 0.6,
  });
  if (tall) {
    add(g, makeCylinder(0.22, 0.26, 0.04, m.metal, 20), 0, 0.02, 0);
    add(g, makeCylinder(0.022, 0.022, 1.5, m.metal, 10), 0, 0.77, 0);
    add(g, makeCylinder(0.25, 0.34, 0.34, shadeMat, 24), 0, 1.58, 0);
  } else {
    add(g, makeCylinder(0.12, 0.14, 0.03, m.metal, 16), 0, 0.015, 0);
    add(g, makeCylinder(0.018, 0.018, 0.34, m.metal, 8), 0, 0.19, 0);
    add(g, makeCylinder(0.14, 0.19, 0.18, shadeMat, 20), 0, 0.43, 0);
  }
  g.userData.emissiveMats = [shadeMat];
  return g;
}

export function buildExtraFurniture(
  catalogId: string,
  placed: PlacedItem,
  opts: ExtraOptions = {}
): THREE.Group | null {
  const m = makeMaterials(placed.color);
  const active = Boolean(placed.active);
  let g: THREE.Group | null = null;

  switch (catalogId) {
    case 'loveseat':
      g = buildSofaLike(2, 1, m, 'standard');
      break;
    case 'armchair':
      g = buildSofaLike(1, 1, m, 'armchair');
      break;
    case 'chaise_lounge':
      g = buildSofaLike(2, 1.15, m, 'chaise');
      break;
    case 'patio_loveseat':
      g = buildSofaLike(2, 1, m, 'patio');
      break;
    case 'ottoman': {
      g = new THREE.Group();
      add(g, makeCylinder(0.42, 0.4, 0.2, m.fabric, 24), 0, 0.33, 0);
      add(g, makeCylinder(0.38, 0.38, 0.03, m.darkWood, 24), 0, 0.2, 0);
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        add(g, makeCylinder(0.018, 0.024, 0.2, m.darkWood, 8), Math.cos(a) * 0.3, 0.1, Math.sin(a) * 0.3);
      }
      break;
    }
    case 'dining_chair':
      g = buildChair(m);
      break;
    case 'dining_chair_wood':
      g = buildChair(m, false, true);
      break;
    case 'office_chair':
      g = buildChair(m, true);
      break;
    case 'outdoor_lounge':
      g = buildSofaLike(1, 1, m, 'patio');
      break;
    case 'king_bed':
      g = buildBed(3, 2, m);
      break;
    case 'twin_bed':
      g = buildBed(2, 2, m);
      break;
    case 'nightstand':
      g = buildCabinet(m, 0.62, 0.56, 0.5, 2);
      break;
    case 'dresser':
      g = buildCabinet(m, 1.7, 0.95, 0.55, 3);
      break;
    case 'wardrobe':
      g = buildWardrobe(m, 1.75);
      break;
    case 'vanity_desk': {
      g = new THREE.Group();
      add(g, makeBox(1.5, 0.07, 0.55, m.wood), 0, 0.76, 0);
      for (const sx of [-1, 1]) add(g, makeBox(0.07, 0.74, 0.5, m.wood), sx * 0.68, 0.38, 0);
      add(g, makeBox(1.42, 0.12, 0.06, m.wood), 0, 0.67, 0.22);
      add(g, makeBox(0.55, 0.86, 0.05, m.metal), 0, 1.35, -0.24);
      add(g, makeBox(0.48, 0.78, 0.02, m.glass), 0, 1.35, -0.21);
      add(g, makeCylinder(0.19, 0.2, 0.07, m.fabric, 18), 0.95, 0.46, 0.1);
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        add(g, makeCylinder(0.016, 0.02, 0.44, m.darkWood, 8), 0.95 + Math.cos(a) * 0.13, 0.22, 0.1 + Math.sin(a) * 0.13);
      }
      break;
    }
    case 'bedroom_bench': {
      g = new THREE.Group();
      add(g, makeBox(1.7, 0.16, 0.5, m.fabric), 0, 0.44, 0);
      addLegs(g, m, 1.7, 0.5, 0.34);
      break;
    }
    case 'kitchen_island': {
      g = new THREE.Group();
      add(g, makeBox(2.8, 0.86, 0.85, m.wood), 0, 0.47, 0);
      add(g, makeBox(2.9, 0.09, 0.95, m.stone), 0, 0.94, 0);
      add(g, makeBox(0.55, 0.04, 0.4, m.metal), -0.65, 0.97, 0);
      add(g, makeCylinder(0.02, 0.02, 0.32, m.metal, 8), -0.65, 1.12, -0.15);
      add(g, makeBox(0.55, 0.04, 0.4, m.metal), 0.2, 0.97, 0);
      for (let i = 0; i < 3; i++) {
        add(g, makeBox(0.74, 0.26, 0.03, m.darkWood), -0.85 + i * 0.85, 0.6, 0.44);
        add(g, makeCylinder(0.012, 0.012, 0.1, m.accent, 8), -0.85 + i * 0.85, 0.6, 0.47, 0, 0, Math.PI / 2);
      }
      break;
    }
    case 'kitchen_cabinets': {
      g = new THREE.Group();
      add(g, makeBox(2.8, 0.78, 0.6, m.wood), 0, 0.43, 0);
      add(g, makeBox(2.9, 0.08, 0.66, m.stone), 0, 0.86, 0);
      for (let i = 0; i < 4; i++) {
        add(g, makeBox(0.62, 0.62, 0.03, m.cream), -1.02 + i * 0.68, 0.43, 0.32);
        add(g, makeBox(0.03, 0.16, 0.03, m.accent), -0.78 + i * 0.68, 0.43, 0.35);
      }
      add(g, makeBox(2.8, 0.65, 0.34, m.wood), 0, 1.9, -0.14);
      for (let i = 0; i < 4; i++) {
        add(g, makeBox(0.62, 0.55, 0.03, m.cream), -1.02 + i * 0.68, 1.9, 0.04);
      }
      break;
    }
    case 'fridge': {
      g = new THREE.Group();
      add(g, makeBox(0.85, 1.95, 0.68, m.metal), 0, 0.985, 0);
      add(g, makeBox(0.4, 1.8, 0.03, m.dark), -0.21, 1.02, 0.355);
      add(g, makeBox(0.4, 1.8, 0.03, m.dark), 0.21, 1.02, 0.355);
      add(g, makeBox(0.45, 0.03, 0.03, m.accent), -0.22, 1.25, 0.38);
      add(g, makeBox(0.45, 0.03, 0.03, m.accent), 0.22, 1.25, 0.38);
      break;
    }
    case 'oven_range': {
      g = new THREE.Group();
      add(g, makeBox(0.86, 0.9, 0.65, m.metal), 0, 0.46, 0);
      add(g, makeBox(0.76, 0.5, 0.03, m.dark), 0, 0.28, 0.335);
      add(g, makeBox(0.76, 0.04, 0.04, m.accent), 0, 0.55, 0.35);
      for (let i = 0; i < 4; i++) {
        add(g, makeCylinder(0.07, 0.07, 0.02, m.dark, 12), -0.24 + (i % 2) * 0.48, 0.93, -0.24 + Math.floor(i / 2) * 0.48);
      }
      add(g, makeBox(0.2, 0.22, 0.03, m.dark), 0, 0.8, 0.35);
      break;
    }
    case 'microwave': {
      g = new THREE.Group();
      add(g, makeBox(0.72, 0.4, 0.42, m.metal), 0, 0.7, 0);
      add(g, makeBox(0.45, 0.28, 0.02, m.dark), -0.08, 0.7, 0.215);
      add(g, makeCylinder(0.055, 0.055, 0.015, m.dark, 12), -0.08, 0.7, 0.23, Math.PI / 2);
      add(g, makeBox(0.07, 0.16, 0.03, m.accent), 0.27, 0.7, 0.22);
      break;
    }
    case 'dining_table': {
      g = new THREE.Group();
      add(g, makeCylinder(0.92, 0.92, 0.08, m.wood, 32), 0, 0.74, 0);
      add(g, makeCylinder(0.12, 0.16, 0.7, m.darkWood, 16), 0, 0.37, 0);
      add(g, makeCylinder(0.6, 0.62, 0.05, m.darkWood, 24), 0, 0.03, 0);
      break;
    }
    case 'bathroom_vanity': {
      g = new THREE.Group();
      add(g, makeBox(1.75, 0.78, 0.6, m.wood), 0, 0.43, 0);
      add(g, makeBox(1.86, 0.08, 0.66, m.stone), 0, 0.85, 0);
      for (const sx of [-0.42, 0.42]) {
        add(g, makeCylinder(0.17, 0.14, 0.1, m.cream, 20), sx, 0.92, 0);
        add(g, makeCylinder(0.018, 0.018, 0.18, m.metal, 8), sx, 1.03, -0.18);
        add(g, makeCylinder(0.025, 0.018, 0.1, m.metal, 8), sx, 1.08, -0.13, 0.4);
      }
      for (let i = 0; i < 2; i++) {
        add(g, makeBox(0.78, 0.24, 0.03, m.cream), 0, 0.55, 0.32);
        add(g, makeBox(0.78, 0.24, 0.03, m.cream), 0, 0.28, 0.32);
      }
      break;
    }
    case 'bathtub': {
      g = new THREE.Group();
      add(g, makeBox(1.8, 0.55, 0.78, m.stone), 0, 0.32, 0);
      add(g, makeBox(1.62, 0.4, 0.62, m.cream), 0, 0.36, 0);
      add(g, makeBox(1.55, 0.02, 0.55, new THREE.MeshStandardMaterial({ color: 0xbed9e2, roughness: 0.08, transparent: true, opacity: 0.72 })), 0, 0.55, 0);
      for (const sx of [-1, 1]) {
        add(g, makeCylinder(0.04, 0.05, 0.12, m.accent, 10), sx * 0.75, 0.06, 0.25);
        add(g, makeCylinder(0.04, 0.05, 0.12, m.accent, 10), sx * 0.75, 0.06, -0.25);
      }
      break;
    }
    case 'shower_stall': {
      g = new THREE.Group();
      add(g, makeBox(0.95, 0.08, 0.95, m.stone), 0, 0.04, 0);
      add(g, makeBox(0.9, 2.1, 0.03, m.glass), 0, 1.08, 0.46);
      add(g, makeBox(0.03, 2.1, 0.9, m.glass), 0.46, 1.08, 0);
      add(g, makeCylinder(0.025, 0.025, 1.9, m.metal, 8), -0.4, 1.04, -0.4);
      add(g, makeCylinder(0.12, 0.12, 0.03, m.metal, 16), -0.25, 1.95, -0.25, 0, 0, 1.2);
      break;
    }
    case 'bathroom_mirror': {
      g = new THREE.Group();
      add(g, makeBox(0.7, 0.9, 0.05, m.metal), 0, 0, 0);
      add(g, makeBox(0.64, 0.84, 0.02, m.glass), 0, 0, 0.035);
      const glow = new THREE.MeshStandardMaterial({ color: 0xfff4dc, emissive: 0xffd9a0, emissiveIntensity: active ? 1.1 : 0.15, roughness: 0.4 });
      add(g, makeBox(0.76, 0.03, 0.03, glow), 0, -0.48, 0.04);
      g.userData.emissiveMats = [glow];
      break;
    }
    case 'linen_cabinet':
      g = buildCabinet(m, 0.62, 1.55, 0.45, 3);
      break;
    case 'office_desk': {
      g = new THREE.Group();
      add(g, makeBox(1.75, 0.07, 0.8, m.wood), 0, 0.76, 0);
      for (const sx of [-1, 1]) add(g, makeBox(0.06, 0.74, 0.72, m.metal), sx * 0.8, 0.38, 0);
      add(g, makeBox(0.5, 0.5, 0.6, m.wood), 0.6, 0.42, 0);
      add(g, makeBox(0.45, 0.04, 0.55, m.darkWood), 0.6, 0.69, 0);
      add(g, makeBox(0.65, 0.42, 0.03, m.dark), -0.2, 1.06, -0.24);
      add(g, makeBox(0.6, 0.36, 0.02, new THREE.MeshStandardMaterial({ color: 0x0c1016, emissive: 0x3b7fa4, emissiveIntensity: 0.55 })), -0.2, 1.06, -0.21);
      break;
    }
    case 'bookshelf_tall': {
      g = new THREE.Group();
      add(g, makeBox(0.9, 2.15, 0.34, m.wood), 0, 1.075, 0);
      const bookColors = [0xb5563e, 0x456799, 0xd49a45, 0x5c7a67, 0x785874, 0xe0d7c5];
      for (let shelf = 0; shelf < 5; shelf++) {
        add(g, makeBox(0.82, 0.05, 0.3, m.darkWood), 0, 0.3 + shelf * 0.38, 0);
        let cursor = -0.36;
        for (let i = 0; i < 6; i++) {
          const w = 0.05 + (i % 3) * 0.012;
          const h = 0.2 + (i % 4) * 0.03;
          add(g, makeBox(w, h, 0.2, new THREE.MeshStandardMaterial({ color: bookColors[(i + shelf) % bookColors.length], roughness: 0.85 })), cursor + w / 2, 0.33 + shelf * 0.38 + h / 2, 0.02);
          cursor += w + 0.012;
        }
      }
      break;
    }
    case 'filing_cabinet': {
      g = new THREE.Group();
      add(g, makeBox(0.55, 0.78, 0.5, m.metal), 0, 0.4, 0);
      for (let i = 0; i < 2; i++) {
        add(g, makeBox(0.48, 0.3, 0.03, m.dark), 0, 0.55 - i * 0.34, 0.26);
        add(g, makeBox(0.14, 0.03, 0.03, m.accent), 0, 0.55 - i * 0.34, 0.29);
      }
      break;
    }
    case 'computer_desk': {
      g = new THREE.Group();
      add(g, makeBox(1.8, 0.06, 0.75, m.wood), 0, 0.75, 0);
      for (const sx of [-1, 1]) add(g, makeBox(0.06, 0.74, 0.7, m.metal), sx * 0.82, 0.37, 0);
      for (const sx of [-0.42, 0.42]) {
        add(g, makeBox(0.05, 0.34, 0.05, m.metal), sx, 0.96, -0.18);
        const screenMat = new THREE.MeshStandardMaterial({ color: 0x0b1018, emissive: 0x2b7fa8, emissiveIntensity: active ? 0.75 : 0.08, roughness: 0.18 });
        add(g, makeBox(0.62, 0.38, 0.03, m.dark), sx, 1.18, -0.18);
        add(g, makeBox(0.56, 0.33, 0.02, screenMat), sx, 1.18, -0.15);
        g.userData.emissiveMats = [...((g.userData.emissiveMats as THREE.MeshStandardMaterial[] | undefined) ?? []), screenMat];
      }
      break;
    }
    case 'patio_table': {
      g = new THREE.Group();
      add(g, makeCylinder(0.85, 0.85, 0.07, m.wood, 28), 0, 0.73, 0);
      add(g, makeCylinder(0.06, 0.08, 0.7, m.darkWood, 12), 0, 0.36, 0);
      add(g, makeCylinder(0.42, 0.46, 0.06, m.darkWood, 20), 0, 0.03, 0);
      add(g, makeCylinder(0.025, 0.025, 2.2, m.metal, 8), 0, 1.75, 0);
      const canopy = new THREE.MeshStandardMaterial({ color: 0xe8ddc9, roughness: 0.85, side: THREE.DoubleSide });
      const top = new THREE.Mesh(new THREE.ConeGeometry(1.35, 0.42, 8), canopy);
      add(g, top, 0, 2.85, 0);
      break;
    }
    case 'garden_bench': {
      g = new THREE.Group();
      for (let i = 0; i < 5; i++) add(g, makeBox(1.6, 0.05, 0.1, m.wood), 0, 0.44, -0.18 + i * 0.09);
      for (let i = 0; i < 4; i++) add(g, makeBox(1.6, 0.1, 0.05, m.wood), 0, 0.58 + i * 0.12, -0.24);
      for (const sx of [-1, 1]) {
        add(g, makeBox(0.06, 0.44, 0.5, m.metal), sx * 0.72, 0.22, 0);
        add(g, makeBox(0.06, 0.55, 0.06, m.metal), sx * 0.72, 0.6, -0.24);
      }
      break;
    }
    case 'planter_box': {
      g = new THREE.Group();
      add(g, makeBox(1.7, 0.42, 0.55, m.wood), 0, 0.21, 0);
      add(g, makeBox(1.56, 0.04, 0.44, m.dark), 0, 0.42, 0);
      const foliage = new THREE.MeshStandardMaterial({ color: 0x4f7d4a, roughness: 0.86 });
      for (let i = 0; i < 5; i++) {
        const bush = new THREE.Mesh(new THREE.IcosahedronGeometry(0.2 + (i % 2) * 0.05, 0), foliage);
        add(g, bush, -0.62 + i * 0.31, 0.58, (i % 2 ? 0.08 : -0.06));
      }
      break;
    }
    case 'fire_pit': {
      g = new THREE.Group();
      add(g, makeCylinder(0.5, 0.55, 0.34, m.stone, 24), 0, 0.17, 0);
      const coalMat = new THREE.MeshStandardMaterial({ color: 0x2a1812, emissive: 0xff5a1f, emissiveIntensity: active ? 1.3 : 0.05, roughness: 0.8 });
      add(g, makeCylinder(0.4, 0.4, 0.05, coalMat, 20), 0, 0.35, 0);
      g.userData.emissiveMats = [coalMat];
      if (!opts.isGhost && !opts.isSoftwareGl) {
        const light = new THREE.PointLight(0xff7a33, active ? 2.1 : 0, 5, 1.8);
        light.position.set(0, 0.7, 0);
        g.add(light);
        g.userData.light = light;
      }
      break;
    }
    case 'tv_wall':
      g = buildTelevision(m, false);
      break;
    case 'tv_console':
      g = buildTelevision(m, true);
      break;
    case 'floor_lamp':
      g = buildLamp(m, true);
      break;
    case 'desk_lamp':
      g = buildLamp(m, false);
      break;
    case 'wall_clock': {
      g = new THREE.Group();
      add(g, makeCylinder(0.34, 0.34, 0.05, m.wood, 28), 0, 0, 0, Math.PI / 2);
      add(g, makeCylinder(0.29, 0.29, 0.01, m.cream, 28), 0, 0, 0.035, Math.PI / 2);
      add(g, makeBox(0.018, 0.18, 0.012, m.dark), 0, 0.07, 0.045);
      add(g, makeBox(0.13, 0.014, 0.012, m.dark), 0.05, 0, 0.045);
      break;
    }
    case 'curtains': {
      g = new THREE.Group();
      add(g, makeCylinder(0.015, 0.015, 2.0, m.metal, 10), 0, 0.5, 0, 0, 0, Math.PI / 2);
      for (const sx of [-1, 1]) {
        const panel = new THREE.Mesh(new THREE.PlaneGeometry(0.65, 1.85), new THREE.MeshStandardMaterial({ color: m.primary, roughness: 0.95, side: THREE.DoubleSide }));
        add(g, panel, sx * 0.65, -0.42, 0);
        for (let i = 0; i < 3; i++) {
          add(g, makeCylinder(0.012, 0.012, 0.12, m.metal, 8), sx * 0.55 + i * 0.1, 0.52, 0);
        }
      }
      break;
    }
    case 'round_rug': {
      g = new THREE.Group();
      const rug = makeCylinder(1.45, 1.45, 0.018, m.fabric, 40);
      add(g, rug, 0, 0.009, 0);
      add(g, makeCylinder(1.15, 1.15, 0.02, m.cream, 40), 0, 0.011, 0);
      add(g, makeCylinder(0.85, 0.85, 0.022, m.fabric, 40), 0, 0.013, 0);
      break;
    }
    case 'decorative_vase': {
      g = new THREE.Group();
      add(g, makeCylinder(0.14, 0.2, 0.42, m.wood, 18), -0.15, 0.21, 0);
      add(g, makeCylinder(0.1, 0.16, 0.3, m.stone, 18), 0.18, 0.15, 0.05);
      add(g, makeCylinder(0.06, 0.13, 0.22, m.accent, 16), 0.05, 0.11, -0.18);
      break;
    }
    case 'wall_mirror': {
      g = new THREE.Group();
      add(g, makeBox(0.68, 1.1, 0.04, m.metal), 0, 0, 0);
      add(g, makeBox(0.6, 1.02, 0.02, m.glass), 0, 0, 0.03);
      const arch = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.04, 24), m.metal);
      add(g, arch, 0, 0.55, 0, Math.PI / 2);
      break;
    }
    case 'coffee_table_round': {
      g = new THREE.Group();
      add(g, makeCylinder(0.68, 0.68, 0.06, m.wood, 28), 0, 0.4, 0);
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        add(g, makeCylinder(0.018, 0.024, 0.38, m.darkWood, 8), Math.cos(a) * 0.45, 0.19, Math.sin(a) * 0.45);
      }
      add(g, makeCylinder(0.48, 0.48, 0.02, m.cream, 28), 0, 0.44, 0);
      break;
    }
    case 'side_table': {
      g = new THREE.Group();
      add(g, makeCylinder(0.34, 0.34, 0.04, m.wood, 24), 0, 0.52, 0);
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        add(g, makeCylinder(0.014, 0.02, 0.5, m.darkWood, 8), Math.cos(a) * 0.2, 0.25, Math.sin(a) * 0.2, 0.12 * Math.cos(a), 0, 0.12 * Math.sin(a));
      }
      break;
    }
    case 'bar_cabinet': {
      g = new THREE.Group();
      add(g, makeBox(1.7, 0.9, 0.48, m.wood), 0, 0.49, 0);
      for (const sx of [-1, 1]) {
        add(g, makeBox(0.78, 0.74, 0.03, m.darkWood), sx * 0.41, 0.5, 0.25);
        add(g, makeBox(0.03, 0.18, 0.03, m.accent), sx * 0.1, 0.5, 0.28);
      }
      const bottleColors = [0x2f5d3f, 0x7a3c2c, 0x9a7b2e];
      for (let i = 0; i < 5; i++) {
        add(g, makeCylinder(0.03, 0.04, 0.24, new THREE.MeshStandardMaterial({ color: bottleColors[i % 3], roughness: 0.25, metalness: 0.2 }), 16), -0.55 + i * 0.14, 1.07, -0.05);
      }
      add(g, makeBox(1.74, 0.04, 0.52, m.stone), 0, 0.96, 0);
      break;
    }
    case 'plant_tall':
      g = buildPlant(m, true);
      break;
    case 'plant_small':
      g = buildPlant(m, false);
      break;
    case 'wall_art_set': {
      g = new THREE.Group();
      const frameMat = m.wood;
      const canvasColors = [placed.color, '#cbbba4', '#d4af5a'];
      for (let i = 0; i < 3; i++) {
        add(g, makeBox(0.56, 0.72, 0.04, frameMat), -0.62 + i * 0.62, 0, 0);
        add(g, makeBox(0.5, 0.66, 0.02, new THREE.MeshStandardMaterial({ color: canvasColors[i], roughness: 0.9 })), -0.62 + i * 0.62, 0, 0.03);
      }
      break;
    }
    default:
      return null;
  }

  g.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) {
      obj.castShadow = true;
      obj.receiveShadow = true;
    }
  });
  return g;
}
