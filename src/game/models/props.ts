import * as THREE from 'three';
import {
  box,
  cushion,
  cyl,
  glowPanel,
  legs,
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

export function buildRug(params: Params, opts: KitOptions) {
  const p = palette(opts.color, opts);
  const variant = str(params.variant, 'woven');
  const width = num(params.width, 2.4);
  const depth = num(params.depth, 1.8);
  const group = new THREE.Group();
  const accent = makeMat(new THREE.Color(opts.color).offsetHSL(0.02, 0.1, -0.18), { roughness: 0.95 });
  const cream = makeMat(new THREE.Color(opts.color).offsetHSL(0, -0.05, 0.14), { roughness: 0.95 });

  if (variant === 'round') {
    place(group, cyl(width / 2, width / 2, 0.025, p.fabric, 32), 0, 0.013, 0);
    place(group, torus(width / 2 - 0.12, 0.03, accent, 32), 0, 0.03, 0, Math.PI / 2);
    place(group, cyl(width / 2 - 0.3, width / 2 - 0.3, 0.005, cream, 32), 0, 0.028, 0);
  } else {
    place(group, box(width, 0.025, depth, p.fabric), 0, 0.013, 0);
    if (variant === 'patterned') {
      const bands = 5;
      for (let i = 0; i < bands; i++) {
        place(group, box(width * 0.94, 0.004, depth / bands / 1.6, i % 2 ? accent : cream), 0, 0.027, -depth / 2 + (depth / bands) * (i + 0.5));
      }
      for (let i = 0; i < 7; i++) {
        place(group, box(width / 20, 0.005, depth * 0.86, cream), -width / 2 + (width / 7) * (i + 0.5), 0.028, 0);
      }
    } else {
      place(group, box(width - 0.24, 0.004, depth - 0.2, accent), 0, 0.027, 0);
      place(group, box(width - 0.42, 0.005, depth - 0.38, cream), 0, 0.029, 0);
    }
    for (const sz of [-1, 1]) {
      for (let i = 0; i < 14; i++) {
        place(group, cyl(0.012, 0.008, 0.06, p.fabric, 5), -width / 2 + 0.1 + i * ((width - 0.2) / 13), 0.014, sz * (depth / 2 + 0.02), 0, 0, Math.PI / 2 + sz * 0.1);
      }
    }
  }
  return group;
}

export function buildVaseSet(params: Params, opts: KitOptions) {
  const p = palette(opts.color, opts);
  const group = new THREE.Group();
  const variant = str(params.variant, 'ceramic');
  const glassMat = makeMat(new THREE.Color(opts.color).offsetHSL(0.02, 0, 0.1), { roughness: 0.12, opacity: 0.5 });
  place(group, cyl(0.28, 0.32, 0.04, p.wood, 18), 0, 0.02, 0);
  if (variant === 'glass') {
    place(group, cyl(0.09, 0.12, 0.44, glassMat, 16), -0.12, 0.24, 0);
    place(group, cyl(0.06, 0.1, 0.3, glassMat, 14), 0.1, 0.17, 0.04);
    for (let i = 0; i < 3; i++) {
      place(group, cyl(0.008, 0.008, 0.36, makeMat(0x4a6b3c, { roughness: 0.9 }), 6), 0.02 + (i - 1) * 0.05, 0.45, 0.02, (i - 1) * 0.12);
    }
  } else if (variant === 'sculptural') {
    place(group, torus(0.2, 0.05, p.primary, 22), 0, 0.32, 0, 0.2, 0.4, 0);
    place(group, sphere(0.1, p.accent, 14), 0, 0.14, 0.16);
    place(group, box(0.26, 0.04, 0.26, p.stone), 0, 0.02, 0);
  } else {
    place(group, cyl(0.12, 0.2, 0.5, p.primary, 18), -0.14, 0.27, 0);
    place(group, cyl(0.06, 0.1, 0.15, p.primary, 14), -0.14, 0.57, 0);
    place(group, cyl(0.08, 0.12, 0.32, p.accent, 16), 0.12, 0.18, 0.02);
    for (let i = 0; i < 4; i++) {
      place(group, sphere(0.04, makeMat(0xd9a8b0, { roughness: 0.8 }), 8), -0.14 + Math.cos(i * 1.7) * 0.08, 0.68 + Math.sin(i) * 0.06, Math.sin(i * 1.7) * 0.08);
    }
  }
  return group;
}

export function buildBookStack(params: Params, opts: KitOptions) {
  const p = palette(opts.color, opts);
  const group = new THREE.Group();
  const colors = [0x8c3f35, 0x35506b, 0xa98534, 0x4b6b4c, 0x6b4b63, 0xd6c7ad];
  const count = Math.round(num(params.count, 7));
  for (let i = 0; i < count; i++) {
    const w = 0.32 - (i % 3) * 0.03;
    const d = 0.24 - (i % 2) * 0.02;
    place(
      group,
      box(w, 0.035, d, makeMat(colors[i % colors.length], { roughness: 0.85 })),
      (i % 2 ? 0.01 : -0.01) + (i % 4 === 0 ? 0.03 : 0),
      0.018 + i * 0.038,
      0,
      0,
      (i % 3) * 0.12 - 0.1,
      0
    );
    place(group, box(w * 0.9, 0.004, d * 0.9, makeMat(0xe8e0d2, { roughness: 0.9 })), (i % 2 ? 0.01 : -0.01), 0.035 + i * 0.038, 0);
  }
  if (params.bookend) {
    place(group, box(0.03, 0.16, 0.18, p.stone), 0.18, 0.08, 0);
  }
  return group;
}

export function buildFramedArt(params: Params, opts: KitOptions) {
  const p = palette(opts.color, opts);
  const variant = str(params.variant, 'single');
  const width = num(params.width, variant === 'triptych' ? 1.4 : 0.8);
  const height = num(params.height, 0.6);
  const group = new THREE.Group();
  const frames = variant === 'triptych' ? 3 : 1;
  const frameWidth = frames === 3 ? width / 3 - 0.04 : width;
  for (let i = 0; i < frames; i++) {
    const x = frames === 3 ? -width / 3 + i * (width / 3) : 0;
    place(group, box(frameWidth, height, 0.05, p.wood), x, 0, 0);
    place(group, box(frameWidth - 0.07, height - 0.07, 0.01, makeMat(new THREE.Color(opts.color).offsetHSL(0.05, 0.05, -0.1), { roughness: 0.9 })), x, 0, 0.03);
    const shapeCount = 3 + (i % 2);
    for (let s = 0; s < shapeCount; s++) {
      const tone = makeMat([0xd8a15a, 0x4b6b7a, 0xc46a52, 0xe3d6bd][s % 4], { roughness: 0.85 });
      place(group, box((frameWidth - 0.16) * (0.5 - s * 0.09), 0.03 + (s % 3) * 0.02, 0.004, tone), x + (s % 2 ? 0.06 : -0.05), -height * 0.2 + s * (height * 0.12), 0.036, 0, 0, s % 2 ? 0.5 : -0.2);
      place(group, sphere(0.05 + (s % 2) * 0.02, tone, 10), x + ((s % 3) - 1) * 0.12, height * 0.16 - s * 0.06, 0.036);
    }
  }
  return group;
}

export function buildMirror(params: Params, opts: KitOptions) {
  const p = palette(opts.color, opts);
  const variant = str(params.variant, 'rect');
  const group = new THREE.Group();
  const mirrored = makeMat(0xd7e2e8, { roughness: 0.04, metalness: 0.55 });
  if (variant === 'round') {
    place(group, cyl(0.4, 0.4, 0.04, p.metal, 30), 0, 0, 0, Math.PI / 2);
    place(group, cyl(0.36, 0.36, 0.01, mirrored, 30), 0, 0, 0.024, Math.PI / 2);
  } else if (variant === 'full_length') {
    place(group, box(0.7, 1.9, 0.05, p.metal), 0, 0, 0);
    place(group, box(0.64, 1.84, 0.01, mirrored), 0, 0, 0.03);
    for (const sx of [-1, 1]) place(group, box(0.05, 0.05, 0.4, p.wood), sx * 0.3, -1.0, 0.16);
  } else if (variant === 'arched') {
    place(group, box(0.72, 1.2, 0.05, p.metal), 0, 0, 0);
    place(group, cyl(0.36, 0.36, 0.04, p.metal, 24), 0, 0.6, 0, Math.PI / 2);
    place(group, box(0.64, 1.16, 0.01, mirrored), 0, -0.02, 0.03);
  } else {
    place(group, box(0.86, 0.68, 0.04, p.wood), 0, 0, 0);
    place(group, box(0.8, 0.62, 0.01, mirrored), 0, 0, 0.025);
    const glow = glowPanel(0.9, 0.03, '#fff4dc', opts.active ? 1.2 : 0.25);
    place(group, glow, 0, -0.36, 0.03);
  }
  return group;
}

export function buildClock(params: Params, opts: KitOptions) {
  const p = palette(opts.color, opts);
  const group = new THREE.Group();
  const variant = str(params.variant, 'round');
  if (variant === 'digital') {
    place(group, box(0.6, 0.24, 0.05, p.dark), 0, 0, 0);
    place(group, box(0.5, 0.15, 0.01, makeMat(0x0a0d10, { emissive: opts.color, emissiveIntensity: opts.active ? 1.5 : 0.6 })), 0, 0, 0.03);
  } else {
    place(group, cyl(0.32, 0.32, 0.06, p.wood, 28), 0, 0, 0, Math.PI / 2);
    place(group, cyl(0.28, 0.28, 0.01, p.light, 28), 0, 0, 0.035, Math.PI / 2);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      place(group, box(0.012, 0.05, 0.008, p.dark), Math.sin(a) * 0.22, Math.cos(a) * 0.22, 0.045);
    }
    place(group, box(0.014, 0.18, 0.008, p.dark), 0, 0.07, 0.05);
    place(group, box(0.12, 0.012, 0.008, p.dark), 0.05, 0, 0.05);
    place(group, cyl(0.02, 0.02, 0.012, p.accent, 10), 0, 0, 0.055, Math.PI / 2);
  }
  return group;
}

export function buildPlantTrio(params: Params, opts: KitOptions) {
  const p = palette(opts.color, opts);
  const group = new THREE.Group();
  const leaf = makeMat(0x4f7a52, { roughness: 0.9 });
  const leafLight = makeMat(0x6a9a5c, { roughness: 0.88 });
  const sizes = [0.16, 0.22, 0.14];
  sizes.forEach((size, i) => {
    const x = (i - 1) * 0.3;
    place(group, cyl(size * 0.8, size * 0.65, size * 1.3, p.primary, 14), x, (size * 1.3) / 2, 0);
    const stemH = 0.2 + i * 0.1;
    place(group, cyl(0.008, 0.01, stemH, leaf, 6), x, size * 1.3 + stemH / 2, 0);
    for (let l = 0; l < 4; l++) {
      const leafMesh = sphere(size * 0.55, l % 2 ? leaf : leafLight, 10);
      leafMesh.scale.set(1, 0.4, 0.8);
      place(group, leafMesh, x + Math.cos(l * 1.6) * size * 0.4, size * 1.3 + stemH + l * 0.04, Math.sin(l * 1.6) * size * 0.3, 0.3, -l, 0);
    }
  });
  return group;
}

export function buildTelevision(params: Params, opts: KitOptions) {
  const p = palette(opts.color, opts);
  const variant = str(params.variant, 'panel');
  const width = num(params.width, 1.5);
  const height = width * 0.58;
  const group = new THREE.Group();
  if (variant === 'wall') {
    place(group, box(width + 0.06, height + 0.06, 0.06, p.dark), 0, 1.6, 0);
    place(group, box(width, height, 0.02, makeMat(0x090d13, { emissive: opts.color, emissiveIntensity: opts.active ? 0.9 : 0.12, roughness: 0.2 })), 0, 1.6, 0.045);
  } else if (variant === 'monitor') {
    place(group, box(width, height, 0.04, p.dark), 0, 1.25, 0);
    place(group, box(width - 0.04, height - 0.04, 0.01, makeMat(0x0a1016, { emissive: opts.color, emissiveIntensity: opts.active ? 0.8 : 0.1, roughness: 0.2 })), 0, 1.25, 0.03);
    place(group, cyl(0.03, 0.04, 0.36, p.metal, 10), 0, 0.94, 0);
    place(group, box(0.4, 0.03, 0.28, p.metal), 0, 0.76, 0);
    place(group, cyl(0.015, 0.015, 0.3, p.metal, 8), width / 2 + 0.02, 1.25, 0);
  } else {
    place(group, box(width, height, 0.05, p.dark), 0, 1.45, 0);
    place(group, box(width - 0.06, height - 0.06, 0.01, makeMat(0x0a1016, { emissive: opts.color, emissiveIntensity: opts.active ? 0.85 : 0.1, roughness: 0.2 })), 0, 1.45, 0.035);
    for (const sx of [-1, 1]) place(group, box(0.05, 0.4, 0.05, p.metal), sx * width * 0.3, 0.3, -0.08);
    place(group, box(width * 0.9, 0.06, 0.34, p.wood), 0, 0.08, 0);
    place(group, box(width * 0.3, 0.08, 0.18, p.metal), 0, 1.1, 0.1);
  }
  return group;
}

export function buildSpeakerShelf(params: Params, opts: KitOptions) {
  const p = palette(opts.color, opts);
  const group = new THREE.Group();
  place(group, box(0.34, 0.5, 0.3, p.dark), 0, 0.25, 0);
  place(group, cyl(0.1, 0.1, 0.02, makeMat(0x2f3339, { roughness: 0.7 }), 16), 0, 0.34, 0.16, Math.PI / 2);
  place(group, cyl(0.05, 0.05, 0.02, p.metal, 12), 0, 0.14, 0.16, Math.PI / 2);
  place(group, box(0.3, 0.02, 0.28, p.metal), 0, 0.51, 0);
  return group;
}

export function buildNeonSign(params: Params, opts: KitOptions) {
  const p = palette(opts.color, opts);
  const group = new THREE.Group();
  const shape = str(params.shape, 'word');
  const width = num(params.width, 1.2);
  const tube = makeMat(opts.color, { emissive: opts.color, emissiveIntensity: opts.active ? 1.9 : 0.5, roughness: 0.3 });
  if (shape === 'house_number') {
    place(group, box(0.48, 0.28, 0.03, p.dark), 0, 0, 0);
    for (let i = 0; i < 2; i++) {
      place(group, torus(0.07, 0.012, tube, 16), -0.1 + i * 0.2, 0, 0.03);
    }
  } else if (shape === 'heart') {
    place(group, torus(0.22, 0.02, tube, 26), -0.12, 0.04, 0.03, 0, 0, 0.4);
    place(group, torus(0.22, 0.02, tube, 26), 0.12, 0.04, 0.03, 0, 0, -0.4);
    place(group, box(0.02, 0.3, 0.02, tube), 0, -0.16, 0.03, 0, 0, 0.7);
    place(group, box(0.02, 0.3, 0.02, tube), 0, -0.16, 0.03, 0, 0, -0.7);
  } else {
    place(group, box(width, 0.05, 0.05, p.dark), 0, 0.32, 0);
    const words = 6;
    for (let i = 0; i < words; i++) {
      place(group, box(width / (words * 1.8), 0.28, 0.02, tube), -width / 2 + (width / words) * (i + 0.5), 0, 0.03, 0, 0, i % 2 ? 0.2 : -0.2);
    }
    place(group, box(width * 0.9, 0.02, 0.02, tube), 0, -0.22, 0.03);
  }
  tagEmissive(group, [tube]);
  return group;
}

export function buildSmartPanel(params: Params, opts: KitOptions) {
  const p = palette(opts.color, opts);
  const group = new THREE.Group();
  place(group, box(0.26, 0.18, 0.03, p.dark), 0, 0, 0);
  place(group, box(0.22, 0.14, 0.01, makeMat(0x081016, { emissive: opts.color, emissiveIntensity: opts.active ? 1.2 : 0.25 })), 0, 0, 0.02);
  for (let i = 0; i < 3; i++) place(group, box(0.16, 0.02, 0.005, makeMat(0xffffff, { roughness: 0.4 })), 0, 0.04 - i * 0.04, 0.025);
  return group;
}

export function buildCurtainSet(params: Params, opts: KitOptions) {
  const p = palette(opts.color, opts);
  const width = num(params.width, 2.2);
  const height = num(params.height, 2.4);
  const group = new THREE.Group();
  place(group, cyl(0.02, 0.02, width + 0.3, p.metal, 10), 0, height, 0.08, 0, 0, Math.PI / 2);
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 7; i++) {
      const fold = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.095, height - 0.1, 8, 1, true), p.fabric);
      place(group, fold, sx * (width / 2 - 0.28) + sx * (i - 3) * 0.085, height / 2, 0.1 + Math.abs(i - 3) * 0.008);
    }
    place(group, torus(0.05, 0.012, p.metal, 14), sx * (width / 2 - 0.28), height - 0.04, 0.08);
  }
  return group;
}

export function buildCandleSet(params: Params, opts: KitOptions) {
  const p = palette(opts.color, opts);
  const group = new THREE.Group();
  place(group, cyl(0.3, 0.32, 0.03, p.stone, 18), 0, 0.015, 0);
  const glow = makeMat(0xffd9a0, { emissive: '#ffb95e', emissiveIntensity: opts.active ? 1.6 : 0.4, roughness: 0.5 });
  const heights = [0.22, 0.32, 0.18];
  heights.forEach((h, i) => {
    place(group, cyl(0.05, 0.055, h, p.light, 12), (i - 1) * 0.12, h / 2 + 0.03, i % 2 ? 0.05 : -0.03);
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.07, 8), glow);
    place(group, flame, (i - 1) * 0.12, h + 0.08, i % 2 ? 0.05 : -0.03);
  });
  place(group, sphere(0.06, p.primary, 10), 0.16, 0.09, 0.12);
  tagEmissive(group, [glow]);
  return group;
}

export function buildSmallSculpture(params: Params, opts: KitOptions) {
  const p = palette(opts.color, opts);
  const group = new THREE.Group();
  const bronze = makeMat(0x8a6c46, { roughness: 0.32, metalness: 0.7 });
  place(group, box(0.3, 0.05, 0.3, p.stone), 0, 0.025, 0);
  place(group, torus(0.14, 0.035, bronze, 20), 0, 0.22, 0, 0.6, 0.4, 0);
  place(group, sphere(0.06, bronze, 12), 0, 0.42, 0);
  return group;
}

export function buildKitchenDetail(params: Params, opts: KitOptions) {
  const p = palette(opts.color, opts);
  const variant = str(params.variant, 'sink');
  const group = new THREE.Group();
  if (variant === 'dishwasher') {
    place(group, box(0.6, 0.85, 0.6, p.metal), 0, 0.43, 0);
    place(group, box(0.52, 0.7, 0.02, p.dark), 0, 0.44, 0.31);
    place(group, box(0.4, 0.03, 0.03, p.accent), 0, 0.74, 0.33);
    const glow = glowPanel(0.12, 0.02, opts.color, opts.active ? 1.2 : 0.3);
    place(group, glow, 0.2, 0.15, 0.32);
  } else if (variant === 'hood') {
    place(group, box(0.9, 0.5, 0.55, p.metal), 0, 1.9, 0);
    place(group, box(0.9, 0.06, 0.12, p.metal), 0, 2.19, 0.22);
    for (let i = 0; i < 4; i++) place(group, box(0.7, 0.015, 0.04, p.dark), 0, 1.66 - i * 0.03, 0.16 + i * 0.04);
    place(group, box(0.34, 0.4, 0.34, p.metal), 0, 2.35, 0);
  } else if (variant === 'coffee_machine') {
    place(group, box(0.44, 0.5, 0.4, p.metal), 0, 0.25, 0);
    place(group, box(0.36, 0.1, 0.3, p.dark), 0, 0.52, 0);
    place(group, cyl(0.05, 0.05, 0.04, p.accent, 12), 0.1, 0.58, 0);
    place(group, box(0.2, 0.14, 0.02, p.glass), -0.06, 0.34, 0.21);
    place(group, cyl(0.04, 0.04, 0.08, p.light, 12), 0.0, 0.16, 0.14);
    const light = glowPanel(0.06, 0.02, opts.color, opts.active ? 1.4 : 0.4);
    place(group, light, 0.16, 0.46, 0.21);
  } else {
    place(group, box(0.8, 0.16, 0.5, p.stone), 0, 0.62, 0);
    place(group, box(0.66, 0.05, 0.36, p.metal), 0, 0.7, 0);
    place(group, cyl(0.03, 0.03, 0.26, p.metal, 10), 0.24, 0.82, -0.16);
    place(group, box(0.03, 0.03, 0.2, p.metal), 0.24, 0.94, -0.08);
    place(group, cyl(0.012, 0.012, 0.06, p.metal, 8), 0.24, 0.9, 0.02);
    place(group, box(0.8, 0.6, 0.5, p.wood), 0, 0.3, 0);
    place(group, box(0.6, 0.3, 0.02, p.light), 0, 0.32, 0.26);
    place(group, box(0.04, 0.04, 0.04, p.accent), 0.24, 0.34, 0.27);
  }
  return group;
}

export function buildBathroomFixture(params: Params, opts: KitOptions) {
  const p = palette(opts.color, opts);
  const variant = str(params.variant, 'toilet');
  const group = new THREE.Group();
  if (variant === 'toilet') {
    place(group, box(0.36, 0.42, 0.56, p.light), 0, 0.21, 0.02);
    place(group, cyl(0.19, 0.16, 0.14, p.light, 20), 0, 0.44, 0.06);
    place(group, cyl(0.2, 0.2, 0.03, p.light, 20), 0, 0.5, 0.06);
    place(group, box(0.36, 0.5, 0.18, p.light), 0, 0.62, -0.24);
    place(group, cyl(0.035, 0.035, 0.02, p.metal, 12), 0, 0.52, -0.33);
    place(group, box(0.2, 0.02, 0.02, p.metal), 0, 0.56, -0.16);
  } else if (variant === 'sink') {
    place(group, cyl(0.24, 0.16, 0.2, p.light, 22), 0, 0.9, 0);
    place(group, cyl(0.25, 0.25, 0.02, p.light, 22), 0, 0.99, 0);
    place(group, cyl(0.05, 0.07, 0.6, p.metal, 12), 0, 0.5, 0);
    place(group, cyl(0.12, 0.12, 0.03, p.metal, 18), 0, 0.18, 0);
    place(group, cyl(0.018, 0.018, 0.22, p.metal, 8), 0.16, 1.05, -0.08);
    place(group, box(0.02, 0.02, 0.16, p.metal), 0.16, 1.16, 0);
    place(group, box(0.3, 0.02, 0.02, p.accent), 0.16, 1.16, 0.08, 0.5);
  } else if (variant === 'towel_rack') {
    place(group, box(0.4, 0.03, 0.04, p.metal), 0, 0.28, 0);
    place(group, box(0.4, 0.03, 0.04, p.metal), 0, -0.12, 0);
    for (const sx of [-1, 1]) place(group, box(0.02, 0.44, 0.02, p.metal), sx * 0.19, 0.08, 0);
    place(group, box(0.34, 0.5, 0.03, p.fabric), 0, -0.1, 0.03);
    place(group, box(0.34, 0.3, 0.03, makeMat(new THREE.Color(opts.color).offsetHSL(0, 0, 0.1), { roughness: 0.92 })), 0, -0.34, 0.03);
  } else {
    place(group, box(0.5, 0.1, 0.36, p.stone), 0, 0.72, 0);
    place(group, box(0.42, 0.06, 0.3, p.light), 0, 0.79, 0);
    for (const sx of [-1, 1]) place(group, box(0.05, 0.66, 0.3, p.wood), sx * 0.21, 0.36, 0);
    place(group, box(0.46, 0.04, 0.32, p.wood), 0, 0.05, 0);
    for (let i = 0; i < 3; i++) place(group, cyl(0.045, 0.045, 0.12, makeMat([0xd9c6a4, 0xc7d8cf, 0xe5d3d3][i], { roughness: 0.4 }), 12), -0.12 + i * 0.12, 0.86, 0.04);
  }
  return group;
}

export function buildLaundry(params: Params, opts: KitOptions) {
  const p = palette(opts.color, opts);
  const variant = str(params.variant, 'washer');
  const group = new THREE.Group();
  const body = variant === 'dryer' ? p.light : p.metal;
  place(group, box(0.66, 0.9, 0.66, body), 0, 0.45, 0);
  place(group, cyl(0.22, 0.22, 0.03, p.dark, 24), 0, 0.5, 0.34, Math.PI / 2);
  place(group, cyl(0.18, 0.18, 0.01, makeMat(0x6f8fa0, { roughness: 0.15, opacity: 0.6 }), 24), 0, 0.5, 0.36, Math.PI / 2);
  place(group, box(0.6, 0.14, 0.03, p.dark), 0, 0.82, 0.34);
  for (let i = 0; i < 3; i++) place(group, cyl(0.03, 0.03, 0.02, p.metal, 10), -0.2 + i * 0.2, 0.82, 0.36, Math.PI / 2);
  const glow = glowPanel(0.16, 0.03, opts.color, opts.active ? 1.3 : 0.3);
  place(group, glow, 0.18, 0.68, 0.34);
  tagEmissive(group, [glow.material as THREE.MeshStandardMaterial]);
  return group;
}

export function buildCloset(params: Params, opts: KitOptions) {
  const p = palette(opts.color, opts);
  const width = num(params.width, 2.2);
  const height = 2.2;
  const group = new THREE.Group();
  place(group, box(width, height, 0.5, p.wood), 0, height / 2, -0.22);
  place(group, box(width - 0.1, height - 0.1, 0.02, p.accent), 0, height / 2, -0.46);
  place(group, cyl(0.02, 0.02, width - 0.2, p.metal, 8), 0, height - 0.35, 0.02, 0, 0, Math.PI / 2);
  for (let i = 0; i < 7; i++) {
    place(group, cyl(0.01, 0.01, 0.12, p.metal, 6), -width / 2 + 0.25 + i * ((width - 0.5) / 6), height - 0.42, 0.02);
    place(group, box(0.16, 0.7, 0.08, makeMat([0x3a4556, 0xd9cbb4, 0x6b3f4c, 0x44614c][i % 4], { roughness: 0.92 })), -width / 2 + 0.25 + i * ((width - 0.5) / 6), height - 0.85, 0.04);
  }
  for (let i = 0; i < 4; i++) {
    place(group, box(width - 0.2, 0.05, 0.4, p.wood), 0, 0.3 + i * 0.42, 0);
    for (let j = 0; j < 3; j++) {
      place(group, box((width - 0.4) / 3, 0.18, 0.3, makeMat([0xdcd3c4, 0x8e9aa8, 0xbc8f7a][j], { roughness: 0.9 })), -width / 3 + j * (width / 3), 0.42 + i * 0.42, 0.02);
    }
  }
  place(group, cyl(0.06, 0.06, 0.02, p.metal, 14), width / 2 - 0.2, 1.2, 0.05);
  return group;
}

export function buildFramedMirrorBundle(params: Params, opts: KitOptions) {
  return buildMirror(params, opts);
}

export function buildDeskLampSet(params: Params, opts: KitOptions) {
  const p = palette(opts.color, opts);
  const variant = str(params.variant, 'tripod');
  const group = new THREE.Group();
  const shade = makeMat(0xfff1cf, { emissive: '#ffc878', emissiveIntensity: opts.active ? 1.3 : 0.2, roughness: 0.6 });
  if (variant === 'globe') {
    place(group, cyl(0.14, 0.16, 0.03, p.metal, 16), 0, 0.015, 0);
    place(group, cyl(0.015, 0.015, 0.28, p.metal, 8), 0, 0.16, 0);
    place(group, sphere(0.16, shade, 18), 0, 0.4, 0);
  } else if (variant === 'floor_tripod') {
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      place(group, cyl(0.014, 0.014, 1.4, p.wood, 8), Math.cos(a) * 0.16, 0.7, Math.sin(a) * 0.16, Math.sin(a) * 0.2, 0, Math.cos(a) * 0.2);
    }
    place(group, cyl(0.2, 0.3, 0.3, shade, 20), 0, 1.48, 0);
  } else {
    place(group, cyl(0.09, 0.1, 0.02, p.metal, 14), 0, 0.01, 0);
    place(group, cyl(0.012, 0.012, 0.4, p.metal, 8), 0, 0.2, 0);
    place(group, cyl(0.12, 0.16, 0.18, shade, 18), 0, 0.46, 0);
    place(group, cyl(0.012, 0.012, 0.16, p.metal, 8), 0.11, 0.2, 0, 0, 0, 1.0);
  }
  tagEmissive(group, [shade]);
  return group;
}

export function buildDecoVaseSingle(params: Params, opts: KitOptions) {
  const p = palette(opts.color, opts);
  const group = new THREE.Group();
  place(group, cyl(0.16, 0.22, 0.44, p.primary, 18), 0, 0.22, 0);
  place(group, cyl(0.09, 0.13, 0.1, p.primary, 14), 0, 0.47, 0);
  for (let i = 0; i < 4; i++) {
    place(group, cyl(0.006, 0.006, 0.5, makeMat(0x4a6b3c, { roughness: 0.9 }), 6), (i - 1.5) * 0.04, 0.72, 0.02, Math.sin(i) * 0.2, 0, (i - 1.5) * 0.14);
  }
  return group;
}

export function buildDeskAccessories(params: Params, opts: KitOptions) {
  const p = palette(opts.color, opts);
  const group = new THREE.Group();
  place(group, box(0.4, 0.02, 0.26, p.wood), 0, 0.01, 0);
  place(group, box(0.24, 0.2, 0.18, p.dark), 0, 0.12, -0.02);
  place(group, box(0.26, 0.16, 0.02, p.light), 0, 0.12, 0.08, -0.2, 0, 0);
  for (let i = 0; i < 3; i++) place(group, cyl(0.008, 0.008, 0.16, p.accent, 6), -0.15 + i * 0.03, 0.09, 0.06, 0.2);
  place(group, cyl(0.035, 0.045, 0.09, p.primary, 12), 0.14, 0.045, 0.02);
  return group;
}
