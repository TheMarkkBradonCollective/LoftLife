import * as THREE from 'three';
import {
  box,
  cyl,
  makeMat,
  palette,
  place,
  sphere,
  tagEmissive,
  torus,
  type KitOptions,
} from './helpers';

type Params = Record<string, any>;
const num = (v: unknown, f: number) => (typeof v === 'number' && Number.isFinite(v) ? v : f);
const str = (v: unknown, f: string) => (typeof v === 'string' ? v : f);

export function buildTree(params: Params, opts: KitOptions) {
  const p = palette(opts.color, opts);
  const variant = str(params.variant, 'oak');
  const scale = num(params.scale, 1);
  const group = new THREE.Group();
  const leaf = makeMat(variant === 'cherry' ? 0x6f8f5a : 0x4a7a45, { roughness: 0.92 });
  const leafLight = makeMat(variant === 'cherry' ? 0x8aa86c : 0x63925a, { roughness: 0.9 });

  if (variant === 'palm') {
    place(group, cyl(0.12, 0.18, 3.2, makeMat(0x8a7150, { roughness: 0.9 }), 10), 0, 1.6, 0);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const frond = new THREE.Mesh(new THREE.ConeGeometry(0.16, 1.5, 5), i % 2 ? leaf : leafLight);
      place(group, frond, Math.cos(a) * 0.55, 3.1 + (i % 2) * 0.1, Math.sin(a) * 0.55, Math.PI / 2 - 0.5, -a, 0.2);
    }
    place(group, cyl(0.16, 0.16, 0.3, makeMat(0x9a7a4f, { roughness: 0.9 }), 10), 0, 3.05, 0);
  } else if (variant === 'pine') {
    place(group, cyl(0.1, 0.16, 1.6, makeMat(0x6b5138, { roughness: 0.9 }), 10), 0, 0.8, 0);
    for (let i = 0; i < 4; i++) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(1.0 - i * 0.18, 1.3, 10), i % 2 ? leaf : leafLight);
      place(group, cone, 0, 1.4 + i * 0.62, 0);
    }
  } else if (variant === 'birch') {
    const bark = makeMat(0xd9d2c2, { roughness: 0.85 });
    place(group, cyl(0.09, 0.13, 3.4, bark, 10), 0, 1.7, 0);
    for (let i = 0; i < 5; i++) place(group, box(0.06, 0.02, 0.02, makeMat(0x2d2b27, { roughness: 0.9 })), 0.09, 0.8 + i * 0.5, 0.02);
    for (let i = 0; i < 6; i++) {
      const canopy = sphere(0.55 - i * 0.05, i % 2 ? leaf : leafLight, 10);
      place(group, canopy, Math.cos(i) * 0.5, 3.1 + Math.sin(i) * 0.4, Math.sin(i) * 0.4);
    }
  } else if (variant === 'cherry') {
    place(group, cyl(0.12, 0.2, 1.9, p.wood, 10), 0, 0.95, 0);
    for (const sx of [-1, 1]) place(group, cyl(0.07, 0.09, 0.9, p.wood, 8), sx * 0.35, 1.85, 0, 0, 0, sx * 0.5);
    for (let i = 0; i < 8; i++) {
      const blossom = sphere(0.32 + (i % 3) * 0.05, i % 4 === 0 ? makeMat(0xe7b8c4, { roughness: 0.9 }) : i % 2 ? leafLight : leaf, 10);
      place(group, blossom, Math.cos(i) * 0.65, 2.35 + Math.sin(i * 1.7) * 0.35, Math.sin(i) * 0.5);
    }
  } else {
    place(group, cyl(0.15, 0.24, 2.4, p.wood, 10), 0, 1.2, 0);
    for (const sx of [-1, 1]) place(group, cyl(0.05, 0.09, 1.0, p.wood, 8), sx * 0.3, 2.2, 0.1, 0, 0, sx * 0.6);
    for (let i = 0; i < 7; i++) {
      const canopy = sphere(0.62 + (i % 3) * 0.09, i % 2 ? leaf : leafLight, 12);
      place(group, canopy, Math.cos(i) * 0.62, 2.7 + Math.sin(i * 1.3) * 0.5, Math.sin(i) * 0.55);
    }
  }
  group.scale.setScalar(scale);
  return group;
}

export function buildBush(params: Params, opts: KitOptions) {
  const p = palette(opts.color, opts);
  const variant = str(params.variant, 'bush');
  const group = new THREE.Group();
  const leaf = makeMat(0x4a7a45, { roughness: 0.92 });
  const leafLight = makeMat(0x6a9a5c, { roughness: 0.9 });
  if (variant === 'flower_bed') {
    place(group, box(1.4, 0.18, 0.8, p.stone), 0, 0.09, 0);
    place(group, box(1.3, 0.08, 0.7, makeMat(0x3c2f26, { roughness: 0.95 })), 0, 0.19, 0);
    const flowerColors = [0xd85b6b, 0xe6c14f, 0xd9e4ea, 0xb277c9];
    for (let i = 0; i < 14; i++) {
      const x = -0.55 + (i % 7) * 0.18;
      const z = -0.2 + Math.floor(i / 7) * 0.32;
      place(group, cyl(0.01, 0.01, 0.24, leaf, 6), x, 0.34, z);
      place(group, sphere(0.055, makeMat(flowerColors[i % 4], { roughness: 0.75 }), 8), x, 0.48, z);
    }
  } else {
    for (let i = 0; i < 5; i++) {
      const foliage = sphere(0.3 + (i % 3) * 0.06, i % 2 ? leaf : leafLight, 10);
      place(group, foliage, Math.cos(i * 1.9) * 0.28, 0.3 + (i % 2) * 0.12, Math.sin(i * 1.9) * 0.24);
    }
    place(group, cyl(0.23, 0.26, 0.1, p.primary, 14), 0, 0.05, 0);
  }
  return group;
}

export function buildPlanter(params: Params, opts: KitOptions) {
  const p = palette(opts.color, opts);
  const variant = str(params.variant, 'ceramic');
  const group = new THREE.Group();
  const height = num(params.height, 0.6);
  if (variant === 'long') {
    place(group, box(1.4, 0.5, 0.5, p.primary), 0, 0.25, 0);
    place(group, box(1.3, 0.03, 0.42, makeMat(0x3c2f26, { roughness: 0.95 })), 0, 0.5, 0);
    for (let i = 0; i < 5; i++) {
      place(group, sphere(0.2, makeMat(i % 2 ? 0x4f7a52 : 0x63a05c, { roughness: 0.9 }), 10), -0.5 + i * 0.25, 0.65 + (i % 2) * 0.1, 0);
    }
  } else if (variant === 'raised') {
    place(group, box(1.0, 0.8, 1.0, p.wood), 0, 0.4, 0);
    place(group, box(0.9, 0.04, 0.9, makeMat(0x3c2f26, { roughness: 0.95 })), 0, 0.81, 0);
    place(group, cyl(0.03, 0.04, 0.7, p.wood, 8), 0, 1.15, 0);
    for (let i = 0; i < 4; i++) {
      place(group, sphere(0.18, makeMat(0x4f7a52, { roughness: 0.9 }), 10), Math.cos(i * 2) * 0.2, 1.1 + i * 0.12, Math.sin(i * 2) * 0.2);
    }
  } else {
    place(group, cyl(height * 0.34, height * 0.26, height, p.primary, 18), 0, height / 2, 0);
    place(group, cyl(height * 0.3, height * 0.3, 0.03, makeMat(0x3c2f26, { roughness: 0.95 }), 18), 0, height, 0);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      place(group, cyl(0.012, 0.012, 0.8, makeMat(0x4a6b3c, { roughness: 0.9 }), 6), Math.cos(a) * 0.06, height + 0.4, Math.sin(a) * 0.06);
      place(group, sphere(0.16, makeMat(0x5f8f56, { roughness: 0.92 }), 10), Math.cos(a) * 0.16, height + 0.75, Math.sin(a) * 0.16);
    }
  }
  return group;
}

export function buildWaterFeature(params: Params, opts: KitOptions) {
  const p = palette(opts.color, opts);
  const variant = str(params.variant, 'pool');
  const group = new THREE.Group();
  const water = makeMat(0x64b6d2, { roughness: 0.06, metalness: 0.12, opacity: 0.72 });
  if (variant === 'fountain') {
    place(group, cyl(0.9, 1.0, 0.34, p.stone, 26), 0, 0.17, 0);
    place(group, cyl(0.82, 0.82, 0.03, water, 26), 0, 0.34, 0);
    place(group, cyl(0.16, 0.22, 0.8, p.stone, 16), 0, 0.7, 0);
    place(group, cyl(0.44, 0.3, 0.12, p.stone, 20), 0, 1.1, 0);
    place(group, cyl(0.38, 0.38, 0.02, water, 20), 0, 1.17, 0);
    place(group, cyl(0.05, 0.08, 0.5, p.stone, 12), 0, 1.4, 0);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      place(group, sphere(0.05, water, 8), Math.cos(a) * 0.24, 1.5 + (i % 2) * 0.12, Math.sin(a) * 0.24);
    }
  } else if (variant === 'hot_tub') {
    const tub = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.85, 0.75, 26, 1, false), p.wood);
    place(group, tub, 0, 0.38, 0);
    place(group, cyl(0.83, 0.83, 0.03, water, 26), 0, 0.74, 0);
    place(group, torus(0.9, 0.06, p.stone, 26), 0, 0.78, 0, Math.PI / 2);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      place(group, box(0.06, 0.7, 0.04, makeMat(new THREE.Color(opts.color).offsetHSL(0, 0, -0.1), { roughness: 0.7 })), Math.cos(a) * 0.9, 0.38, Math.sin(a) * 0.9, 0, -a, 0);
    }
    place(group, cyl(0.18, 0.18, 0.04, p.metal, 18), 0, 0.02, 1.1);
    for (let i = 0; i < 3; i++) place(group, sphere(0.1, makeMat(0xe8f2f4, { roughness: 0.4 }), 8), (i - 1) * 0.16, 0.9 + i * 0.08, 0);
  } else {
    const width = num(params.width, 4);
    const depth = num(params.depth, 2.6);
    place(group, box(width, 0.3, depth, p.stone), 0, 0.15, 0);
    place(group, box(width - 0.3, 0.02, depth - 0.3, water), 0, 0.31, 0);
    for (let i = 0; i < 6; i++) {
      place(group, box(width / 6 - 0.02, 0.02, depth - 0.3, makeMat(0x8fd4e8, { roughness: 0.2 })), -width / 2 + (width / 6) * (i + 0.5), 0.325, 0);
    }
    for (const sx of [-1, 1]) place(group, box(0.2, 0.1, depth + 0.2, p.light), sx * (width / 2 - 0.05), 0.34, 0);
    place(group, box(width + 0.2, 0.1, 0.2, p.light), 0, 0.34, depth / 2 - 0.05);
    for (let i = 0; i < 3; i++) {
      place(group, cyl(0.03, 0.03, 0.5, p.metal, 8), width / 2 - 0.5 - i * 0.5, 0.5, -depth / 2 + 0.4);
      place(group, sphere(0.06, water, 8), width / 2 - 0.5 - i * 0.5, 0.78, -depth / 2 + 0.4);
    }
  }
  return group;
}

export function buildGazebo(params: Params, opts: KitOptions) {
  const p = palette(opts.color, opts);
  const variant = str(params.variant, 'gazebo');
  const width = num(params.width, 3.2);
  const group = new THREE.Group();
  const height = 2.5;
  if (variant === 'pergola') {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) place(group, box(0.14, height, 0.14, p.wood), sx * (width / 2 - 0.1), height / 2, sz * (width / 2 - 0.1));
    for (const sz of [-1, 1]) place(group, box(width, 0.18, 0.12, p.wood), 0, height, sz * (width / 2 - 0.1));
    for (let i = 0; i < 9; i++) place(group, box(width + 0.3, 0.1, 0.08, p.wood), 0, height + 0.12, -width / 2 + (width / 8) * i);
    for (let i = 0; i < 5; i++) {
      place(group, sphere(0.18, makeMat(0x4f7a52, { roughness: 0.9 }), 8), -width / 3 + i * (width / 6), height - 0.1, width / 2 + 0.05);
    }
  } else {
    place(group, cyl(width / 2, width / 2, 0.16, p.wood, 8), 0, 0.08, 0);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      place(group, cyl(0.06, 0.07, height, p.light, 8), Math.cos(a) * (width / 2 - 0.2), height / 2, Math.sin(a) * (width / 2 - 0.2));
    }
    place(group, cyl(width / 2 - 0.1, width / 2 - 0.1, 0.08, p.wood, 8), 0, height, 0);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(width / 1.7, 1.1, 8), p.accent);
    place(group, roof, 0, height + 0.6, 0);
    place(group, sphere(0.1, p.metal, 10), 0, height + 1.2, 0);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      place(group, box(width / 2 - 0.24, 0.5, 0.04, p.wood), Math.cos(a) * (width / 2 - 0.24), 0.55, Math.sin(a) * (width / 2 - 0.24), 0, -a, 0);
    }
    place(group, cyl(0.28, 0.28, 0.05, p.wood, 16), 0, 0.72, 0);
    place(group, cyl(0.04, 0.05, 0.65, p.wood, 10), 0, 0.36, 0);
  }
  return group;
}

export function buildOutdoorKitchen(params: Params, opts: KitOptions) {
  const p = palette(opts.color, opts);
  const variant = str(params.variant, 'grill');
  const group = new THREE.Group();
  if (variant === 'grill') {
    place(group, box(0.9, 0.7, 0.6, p.metal), 0, 0.35, 0);
    place(group, box(0.9, 0.2, 0.62, p.dark), 0, 0.8, 0);
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.31, 0.9, 18, 1, false, 0, Math.PI), p.metal);
    lid.rotation.z = Math.PI / 2;
    place(group, lid, 0, 0.9, 0);
    place(group, box(0.9, 0.03, 0.03, p.accent), 0, 0.9, 0.31);
    for (let i = 0; i < 4; i++) place(group, cyl(0.03, 0.03, 0.1, p.dark, 8), -0.36 + i * 0.24, 0.94, -0.2);
    for (const sx of [-1, 1]) place(group, cyl(0.09, 0.09, 0.04, p.dark, 12), sx * 0.36, 0.06, -0.2, 0, 0, Math.PI / 2);
    place(group, box(0.26, 0.05, 0.5, p.wood), 0.72, 0.75, 0);
  } else {
    place(group, box(2.0, 0.9, 0.7, p.stone), 0, 0.45, 0);
    place(group, box(2.1, 0.06, 0.78, p.wood), 0, 0.93, 0);
    place(group, box(0.5, 0.04, 0.4, p.metal), -0.55, 0.98, 0);
    place(group, cyl(0.02, 0.02, 0.3, p.metal, 8), -0.55, 1.12, -0.12);
    place(group, box(0.5, 0.04, 0.4, p.dark), 0.15, 0.98, 0);
    for (let i = 0; i < 3; i++) place(group, cyl(0.05, 0.05, 0.12, makeMat(0xd9c6a4, { roughness: 0.7 }), 10), 0.6 + i * 0.14, 1.02, 0.1);
    place(group, box(2.0, 0.4, 0.65, p.wood), 0, 1.72, 0);
    place(group, box(2.05, 0.05, 0.68, p.stone), 0, 1.94, 0);
  }
  return group;
}

export function buildPlayground(params: Params, opts: KitOptions) {
  const p = palette(opts.color, opts);
  const group = new THREE.Group();
  const slideColors = [0xd85b5b, 0xe0b23c, 0x4b86c7];
  for (const sx of [-1, 1]) {
    place(group, cyl(0.06, 0.06, 2.2, p.metal, 10), sx * 0.7, 1.1, 0);
    place(group, box(0.08, 0.08, 1.2, p.metal), sx * 0.7, 2.2, 0.6, -0.5, 0, 0);
  }
  place(group, box(1.4, 0.12, 1.0, p.wood), 0, 1.1, 0);
  for (let i = 0; i < 3; i++) place(group, box(1.2, 0.03, 0.16, p.primary), 0, 0.28 + i * 0.28, -0.6 + i * 0.05);
  place(group, box(0.5, 1.8, 0.04, slideColors ? makeMat(slideColors[0], { roughness: 0.6 }) : p.primary), 0, 0.55, 1.4, -0.7);
  place(group, cyl(0.5, 0.5, 0.06, makeMat(0x4b86c7, { roughness: 0.6 }), 16), 1.2, 1.0, 0.4, 0, 0, Math.PI / 2);
  place(group, box(0.9, 0.08, 0.3, makeMat(0xe0b23c, { roughness: 0.7 })), -1.1, 0.9, -0.6);
  for (let i = 0; i < 4; i++) place(group, sphere(0.16, makeMat(slideColors[i % 3], { roughness: 0.6 }), 10), -1.9 + i * 1.2, 0.16, 1.4);
  return group;
}

export function buildPublicBench(params: Params, opts: KitOptions) {
  const p = palette(opts.color, opts);
  const variant = str(params.variant, 'park');
  const group = new THREE.Group();
  for (let i = 0; i < 5; i++) place(group, box(1.7, 0.05, 0.1, p.wood), 0, 0.44, -0.18 + i * 0.09);
  for (let i = 0; i < 4; i++) place(group, box(1.7, 0.1, 0.05, p.wood), 0, 0.58 + i * 0.12, -0.26, 0.12);
  for (const sx of [-1, 1]) {
    place(group, box(0.06, 0.42, 0.5, p.metal), sx * 0.76, 0.21, 0);
    place(group, box(0.06, 0.55, 0.06, p.metal), sx * 0.76, 0.6, -0.28);
  }
  if (variant === 'park') {
    place(group, box(1.8, 0.04, 0.06, p.metal), 0, 0.72, 0.24, 0, 0, 0);
    for (const sx of [-1, 1]) place(group, box(0.06, 0.28, 0.06, p.metal), sx * 0.86, 0.58, 0.24);
  }
  return group;
}

export function buildSculpture(params: Params, opts: KitOptions) {
  const p = palette(opts.color, opts);
  const variant = str(params.variant, 'abstract');
  const group = new THREE.Group();
  const bronze = makeMat(0x8a6c46, { roughness: 0.34, metalness: 0.7 });
  if (variant === 'abstract') {
    place(group, box(1.0, 0.24, 1.0, p.stone), 0, 0.12, 0);
    for (let i = 0; i < 3; i++) {
      place(group, torus(0.42 - i * 0.08, 0.09, bronze, 24), 0, 0.6 + i * 0.42, 0, Math.PI / 2, i * 0.6, 0);
    }
  } else if (variant === 'obelisk') {
    place(group, box(0.7, 0.3, 0.7, p.stone), 0, 0.15, 0);
    const obelisk = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.28, 2.0, 4), p.stone);
    place(group, obelisk, 0, 1.3, 0, 0, Math.PI / 4, 0);
    place(group, sphere(0.14, p.metal, 14), 0, 2.34, 0);
  } else {
    place(group, cyl(0.44, 0.5, 0.2, p.stone, 20), 0, 0.1, 0);
    place(group, cyl(0.3, 0.36, 0.16, p.stone, 20), 0, 0.28, 0);
    const bust = new THREE.Mesh(new THREE.SphereGeometry(0.3, 18, 14), p.light);
    place(group, bust, 0, 0.62, 0);
    place(group, cyl(0.22, 0.3, 0.34, p.light, 16), 0, 0.42, 0);
  }
  return group;
}

export function buildUmbrella(params: Params, opts: KitOptions) {
  const p = palette(opts.color, opts);
  const group = new THREE.Group();
  place(group, cyl(0.34, 0.4, 0.1, p.dark, 18), 0, 0.05, 0);
  place(group, cyl(0.03, 0.03, 2.3, p.metal, 10), 0, 1.2, 0);
  const canopy = new THREE.Mesh(new THREE.ConeGeometry(1.25, 0.42, 8, 1, true), p.fabric);
  canopy.material.side = THREE.DoubleSide;
  place(group, canopy, 0, 2.38, 0);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    place(group, box(0.02, 0.02, 1.2, p.metal), Math.cos(a) * 0.6, 2.28, Math.sin(a) * 0.6, 0.1, -a, 0);
  }
  place(group, sphere(0.05, p.metal, 10), 0, 2.62, 0);
  return group;
}
