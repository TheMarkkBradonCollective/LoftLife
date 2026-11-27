import * as THREE from 'three';
import {
  addLight,
  box,
  cushion,
  cyl,
  glowPanel,
  legs,
  makeMat,
  palette,
  place,
  repeatRow,
  sphere,
  tagEmissive,
  torus,
  type KitOptions,
} from './helpers';

type Params = Record<string, any>;

const num = (value: unknown, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;
const str = (value: unknown, fallback: string) => (typeof value === 'string' ? value : fallback);

/** Wall system: plaster, brick, concrete, stone, wood, metal, glass, decorative, curved. */
export function buildWall(params: Params, opts: KitOptions) {
  const p = palette(opts.color, opts);
  const variant = str(params.variant, 'plaster');
  const width = num(params.width, 3);
  const height = num(params.height, 2.9);
  const thickness = num(params.thickness, 0.18);
  const group = new THREE.Group();

  const body =
    variant === 'glass'
      ? new THREE.Mesh(new THREE.BoxGeometry(width, height, 0.03), p.glass)
      : new THREE.Mesh(new THREE.BoxGeometry(width, height, thickness), p.primary);
  body.position.y = height / 2;
  group.add(body);

  if (variant === 'brick') {
    const mortar = makeMat(0xd8d2c6, { roughness: 0.9 });
    const rows = 7;
    const cols = Math.max(4, Math.round(width / 0.34));
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if ((r + c) % 5 === 0) continue;
        const bw = width / cols - 0.03;
        const bh = height / rows - 0.03;
        const bx = -width / 2 + bw / 2 + c * (width / cols) + (r % 2 ? width / cols / 2 : 0);
        if (bx - bw / 2 < -width / 2 + 0.01 || bx + bw / 2 > width / 2 - 0.01) continue;
        const brick = box(bw, bh, 0.025, p.primary);
        place(group, brick, bx, 0.08 + bh / 2 + r * (height / rows), thickness / 2 + 0.012);
      }
    }
    place(group, box(width + 0.02, 0.09, thickness + 0.03, mortar), 0, height - 0.02, 0);
  } else if (variant === 'concrete') {
    const seam = makeMat(0x8b8a85, { roughness: 0.95 });
    for (let i = 1; i < 4; i++) {
      place(group, box(width, 0.012, thickness + 0.006, seam), 0, (height / 4) * i, 0);
    }
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 2; j++) {
        place(group, cyl(0.035, 0.035, 0.02, seam, 10), -width / 2 + 0.5 + i * (width / 4.4), 0.6 + j * 1.2, thickness / 2 + 0.008, Math.PI / 2);
      }
    }
  } else if (variant === 'stone') {
    const blockMat = makeMat(new THREE.Color(opts.color).offsetHSL(0, -0.04, 0.05), { roughness: 0.85 });
    const rows = 5;
    for (let r = 0; r < rows; r++) {
      const cols = 4 + (r % 2);
      for (let c = 0; c < cols; c++) {
        const bw = width / cols;
        const bh = height / rows;
        const block = new THREE.Mesh(new THREE.BoxGeometry(bw * 0.96, bh * 0.94, 0.07), blockMat);
        place(group, block, -width / 2 + bw / 2 + c * bw, bh / 2 + r * bh, thickness / 2 + 0.02);
      }
    }
  } else if (variant === 'wood') {
    const boards = Math.max(5, Math.round(width / 0.18));
    for (let i = 0; i < boards; i++) {
      const bw = width / boards;
      place(
        group,
        box(bw * 0.93, height - 0.02, 0.03, i % 3 === 0 ? p.wood : p.primary),
        -width / 2 + bw / 2 + i * bw,
        height / 2,
        thickness / 2 + 0.015
      );
    }
  } else if (variant === 'metal') {
    const ribs = Math.max(6, Math.round(width / 0.22));
    for (let i = 0; i < ribs; i++) {
      place(
        group,
        box(0.035, height, 0.04, p.metal),
        -width / 2 + 0.1 + i * (width / ribs),
        height / 2,
        thickness / 2 + 0.02
      );
    }
  } else if (variant === 'glass') {
    const frame = p.dark;
    place(group, box(width, 0.07, 0.09, frame), 0, 0.05, 0);
    place(group, box(width, 0.07, 0.09, frame), 0, height - 0.03, 0);
    for (const sx of [-1, 1]) place(group, box(0.07, height, 0.09, frame), sx * (width / 2 - 0.035), height / 2, 0);
    const bays = Math.max(2, Math.round(width / 0.9));
    for (let i = 1; i < bays; i++) {
      place(group, box(0.05, height, 0.07, frame), -width / 2 + (width / bays) * i, height / 2, 0);
    }
  } else if (variant === 'decorative') {
    const panelMat = makeMat(new THREE.Color(opts.color).offsetHSL(0, 0.02, -0.12), { roughness: 0.6 });
    for (let i = 0; i < 3; i++) {
      const w = width / 4;
      place(group, box(w, height * 0.7, 0.035, panelMat), -width / 2 + width / 4 + i * (width / 4), height * 0.52, thickness / 2 + 0.01);
      place(group, box(w * 0.84, height * 0.6, 0.02, p.primary), -width / 2 + width / 4 + i * (width / 4), height * 0.52, thickness / 2 + 0.03);
    }
  }

  // Baseboard is part of the wall so pieces meet floors cleanly.
  place(group, box(width, 0.11, thickness + 0.035, p.light), 0, 0.055, 0);
  return group;
}

export function buildHalfWall(params: Params, opts: KitOptions) {
  const p = palette(opts.color, opts);
  const width = num(params.width, 2.4);
  const height = num(params.height, 1.1);
  const group = new THREE.Group();
  place(group, box(width, height, 0.14, p.primary), 0, height / 2, 0);
  place(group, box(width + 0.06, 0.06, 0.22, p.stone), 0, height + 0.03, 0);
  place(group, box(width, 0.08, 0.18, p.dark), 0, 0.04, 0);
  if (params.glassTop) {
    place(group, box(width * 0.96, 0.5, 0.02, p.glass), 0, height + 0.31, 0);
    place(group, box(width, 0.04, 0.05, p.metal), 0, height + 0.57, 0);
  }
  return group;
}

export function buildPartition(params: Params, opts: KitOptions) {
  const p = palette(opts.color, opts);
  const width = num(params.width, 2);
  const height = num(params.height, 2.2);
  const group = new THREE.Group();
  const slatted = str(params.variant, 'slatted') === 'slatted';
  for (const sx of [-1, 1]) place(group, box(0.07, height, 0.09, p.dark), sx * (width / 2 - 0.035), height / 2, 0);
  place(group, box(width, 0.07, 0.09, p.dark), 0, height - 0.035, 0);
  place(group, box(width, 0.07, 0.09, p.dark), 0, 0.05, 0);
  if (slatted) {
    const count = Math.max(6, Math.round(width / 0.11));
    for (let i = 0; i < count; i++) {
      place(group, box(0.035, height - 0.14, 0.05, p.wood), -width / 2 + 0.08 + i * ((width - 0.16) / (count - 1)), height / 2, 0);
    }
  } else if (params.fabric) {
    place(group, cushion(width * 0.94, height * 0.9, 0.09, p.fabric), 0, height / 2, 0);
  } else {
    place(group, box(width * 0.94, height * 0.9, 0.035, p.primary), 0, height / 2, 0);
    for (let i = 0; i < 3; i++) {
      const ledge = box(width * 0.7, 0.03, 0.12, p.wood);
      place(group, ledge, 0, 0.55 + i * 0.55, 0.08);
    }
  }
  return group;
}

export function buildStorefront(params: Params, opts: KitOptions) {
  const p = palette(opts.color, opts);
  const width = num(params.width, 3.6);
  const height = num(params.height, 3);
  const group = new THREE.Group();
  place(group, box(width, 0.45, 0.22, p.stone), 0, 0.225, 0);
  place(group, box(width, 0.2, 0.24, p.dark), 0, height - 0.1, 0);
  for (const sx of [-1, 1]) place(group, box(0.09, height, 0.14, p.dark), sx * (width / 2 - 0.045), height / 2, 0);
  const bays = Math.max(2, Math.round(width / 1.1));
  for (let i = 0; i <= bays; i++) {
    const x = -width / 2 + (width / bays) * i;
    place(group, box(0.055, height - 0.65, 0.1, p.dark), x, height / 2 + 0.2, 0);
  }
  for (let i = 0; i < bays; i++) {
    const bayWidth = width / bays;
    place(group, box(bayWidth - 0.1, height - 0.85, 0.02, p.glass), -width / 2 + bayWidth / 2 + i * bayWidth, height / 2 + 0.32, 0);
    place(group, box(bayWidth - 0.24, 0.05, 0.13, p.metal), -width / 2 + bayWidth / 2 + i * bayWidth, 0.5, 0.06);
  }
  return group;
}

export function buildColumn(params: Params, opts: KitOptions) {
  const p = palette(opts.color, opts);
  const height = num(params.height, 3.1);
  const variant = str(params.variant, 'round');
  const group = new THREE.Group();
  place(group, box(0.58, 0.16, 0.58, p.stone), 0, 0.08, 0);
  if (variant === 'square') {
    place(group, box(0.4, height - 0.5, 0.4, p.primary), 0, height / 2, 0);
    place(group, box(0.56, 0.12, 0.56, p.stone), 0, height - 0.1, 0);
  } else if (variant === 'fluted') {
    place(group, cyl(0.3, 0.32, height - 0.5, p.primary, 28), 0, height / 2, 0);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      place(group, box(0.035, height - 0.55, 0.035, p.accent), Math.cos(a) * 0.29, height / 2, Math.sin(a) * 0.29);
    }
    place(group, cyl(0.38, 0.34, 0.14, p.stone, 24), 0, height - 0.09, 0);
  } else if (variant === 'steel') {
    place(group, box(0.26, height - 0.2, 0.26, p.metal), 0, height / 2, 0);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        place(group, box(0.05, height - 0.2, 0.05, p.dark), sx * 0.16, height / 2, sz * 0.16);
      }
    }
  } else {
    place(group, cyl(0.28, 0.32, height - 0.52, p.primary, 24), 0, height / 2, 0);
    place(group, cyl(0.36, 0.3, 0.16, p.stone, 24), 0, height - 0.1, 0);
  }
  return group;
}

export function buildBeam(params: Params, opts: KitOptions) {
  const p = palette(opts.color, opts);
  const length = num(params.length, 3);
  const variant = str(params.variant, 'steel');
  const group = new THREE.Group();
  if (variant === 'wood') {
    place(group, box(length, 0.26, 0.18, p.wood), 0, 2.8, 0);
    for (const sx of [-1, 1]) place(group, box(0.1, 0.34, 0.24, p.wood), sx * (length / 2 - 0.05), 2.76, 0);
  } else {
    place(group, box(length, 0.24, 0.02, p.metal), 0, 2.8, 0);
    place(group, box(length, 0.24, 0.02, p.metal), 0, 2.8, 0.16);
    place(group, box(length, 0.02, 0.16, p.metal), 0, 2.8, 0.08);
    place(group, box(length, 0.02, 0.16, p.metal), 0, 2.62, 0.08);
    place(group, box(length, 0.02, 0.16, p.metal), 0, 2.98, 0.08);
  }
  return group;
}

export function buildArchway(params: Params, opts: KitOptions) {
  const p = palette(opts.color, opts);
  const width = num(params.width, 2.4);
  const height = num(params.height, 2.8);
  const depth = num(params.depth, 0.28);
  const group = new THREE.Group();
  const pier = (width - 0.9) / 2;
  for (const sx of [-1, 1]) {
    place(group, box(pier, height - 0.7, depth, p.primary), sx * (width / 2 - pier / 2), (height - 0.7) / 2, 0);
    place(group, box(pier + 0.1, 0.12, depth + 0.08, p.stone), sx * (width / 2 - pier / 2), height - 0.76, 0);
  }
  const segments = 12;
  for (let i = 0; i < segments; i++) {
    const a0 = Math.PI * (i / segments);
    const a1 = Math.PI * ((i + 1) / segments);
    const mid = (a0 + a1) / 2;
    const radius = 0.62;
    const block = box(width / segments + 0.02, 0.16, depth, i % 2 ? p.primary : p.accent);
    place(group, block, Math.cos(mid) * radius, height - 0.72 + Math.sin(mid) * radius * 0.7, 0, 0, 0, mid - Math.PI / 2);
  }
  return group;
}

export function buildTrim(params: Params, opts: KitOptions) {
  const p = palette(opts.color, opts);
  const width = num(params.width, 2.4);
  const variant = str(params.variant, 'baseboard');
  const group = new THREE.Group();
  if (variant === 'baseboard') {
    place(group, box(width, 0.16, 0.05, p.light), 0, 0.08, 0.02);
    place(group, box(width, 0.03, 0.08, p.light), 0, 0.17, 0.04);
  } else if (variant === 'crown') {
    place(group, box(width, 0.12, 0.09, p.light), 0, 3.08, 0.03, 0, 0, 0.08);
    place(group, box(width, 0.06, 0.13, p.light), 0, 3.0, 0.05);
  } else if (variant === 'wainscot') {
    place(group, box(width, 1.0, 0.04, p.primary), 0, 0.5, 0.02);
    place(group, box(width, 0.05, 0.07, p.light), 0, 1.02, 0.04);
    const panels = Math.max(2, Math.round(width / 0.6));
    for (let i = 0; i < panels; i++) {
      place(group, box(width / panels - 0.12, 0.72, 0.02, p.accent), -width / 2 + (width / panels) * (i + 0.5), 0.55, 0.045);
    }
  } else {
    // Picture rail / window molding.
    place(group, box(width, 0.05, 0.07, p.light), 0, 0, 0.03);
    place(group, box(0.05, 0.6, 0.07, p.light), -width / 2, -0.3, 0.03);
    place(group, box(0.05, 0.6, 0.07, p.light), width / 2, -0.3, 0.03);
  }
  return group;
}

export function buildBuiltInShelf(params: Params, opts: KitOptions) {
  const p = palette(opts.color, opts);
  const width = num(params.width, 1.8);
  const height = num(params.height, 1.4);
  const depth = 0.34;
  const group = new THREE.Group();
  place(group, box(width, height, 0.05, p.dark), 0, height / 2 + 0.6, -depth / 2);
  for (const sx of [-1, 1]) place(group, box(0.06, height, depth, p.wood), sx * (width / 2 - 0.03), height / 2 + 0.6, 0);
  for (let i = 0; i <= 3; i++) {
    place(group, box(width, 0.045, depth, p.wood), 0, 0.6 + (height / 3) * i, 0);
  }
  const bookColors = [0xb5563e, 0x456799, 0xd49a45, 0x5c7a67, 0x785874, 0xe0d7c5];
  for (let shelf = 0; shelf < 3; shelf++) {
    let cursor = -width / 2 + 0.12;
    let i = 0;
    while (cursor < width / 2 - 0.2) {
      const w = 0.05 + (i % 3) * 0.015;
      const h = 0.2 + (i % 4) * 0.025;
      const bookMat = makeMat(bookColors[(i + shelf) % bookColors.length], { roughness: 0.85 });
      place(group, box(w, h, 0.19, bookMat), cursor + w / 2, 0.6 + (height / 3) * shelf + h / 2 + 0.03, 0.02);
      cursor += w + 0.014;
      i++;
    }
  }
  return group;
}

export function buildFloorSlab(params: Params, opts: KitOptions) {
  const p = palette(opts.color, opts);
  const width = num(params.width, 4);
  const depth = num(params.depth, 4);
  const variant = str(params.variant, 'hardwood');
  const group = new THREE.Group();

  if (variant === 'hardwood' || variant === 'laminate') {
    const planks = Math.max(6, Math.round(depth / 0.2));
    for (let i = 0; i < planks; i++) {
      const shade = i % 3 === 0 ? p.wood : i % 3 === 1 ? p.primary : p.accent;
      place(group, box(width, 0.04, depth / planks - 0.006, shade), 0, 0, -depth / 2 + (depth / planks) * (i + 0.5));
    }
  } else if (variant === 'tile' || variant === 'marble' || variant === 'stone') {
    const tiles = Math.max(3, Math.round(width / 0.7));
    for (let ix = 0; ix < tiles; ix++) {
      for (let iz = 0; iz < tiles; iz++) {
        const tileMat =
          variant === 'marble' && (ix + iz) % 3 === 0
            ? makeMat(new THREE.Color(opts.color).offsetHSL(0, -0.04, 0.08), { roughness: 0.22 })
            : (ix + iz) % 2
              ? p.primary
              : p.stone;
        place(
          group,
          box(width / tiles - 0.012, 0.05, depth / tiles - 0.012, tileMat),
          -width / 2 + (width / tiles) * (ix + 0.5),
          0,
          -depth / 2 + (depth / tiles) * (iz + 0.5)
        );
      }
    }
  } else if (variant === 'carpet') {
    place(group, box(width, 0.035, depth, p.fabric), 0, 0, 0);
    place(group, box(width - 0.2, 0.005, depth - 0.2, makeMat(new THREE.Color(opts.color).offsetHSL(0, 0, -0.06), { roughness: 0.95 })), 0, 0.021, 0);
  } else if (variant === 'dance' || variant === 'led') {
    const tiles = 6;
    const glowMats: THREE.MeshStandardMaterial[] = [];
    for (let ix = 0; ix < tiles; ix++) {
      for (let iz = 0; iz < tiles; iz++) {
        const lit = (ix + iz) % 3 === 0;
        const material = lit
          ? makeMat(0x101216, { roughness: 0.25, emissive: opts.color, emissiveIntensity: opts.active ? 1.5 : 0.55 })
          : makeMat(0x14161b, { roughness: 0.18, metalness: 0.4 });
        if (lit) glowMats.push(material);
        place(
          group,
          box(width / tiles - 0.02, 0.05, depth / tiles - 0.02, material),
          -width / 2 + (width / tiles) * (ix + 0.5),
          0,
          -depth / 2 + (depth / tiles) * (iz + 0.5)
        );
      }
    }
    tagEmissive(group, glowMats);
  } else if (variant === 'grass') {
    const grass = makeMat(0x4f7d45, { roughness: 0.95 });
    place(group, box(width, 0.06, depth, grass), 0, 0, 0);
    for (let i = 0; i < 26; i++) {
      const blade = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.16, 4), makeMat(0x63945a, { roughness: 0.9 }));
      place(group, blade, (Math.random() - 0.5) * (width - 0.2), 0.11, (Math.random() - 0.5) * (depth - 0.2));
    }
  } else {
    // Concrete, vinyl, commercial, paver, patterned and road-like surfaces.
    place(group, box(width, 0.06, depth, p.primary), 0, 0, 0);
    const lines = variant === 'paver' || variant === 'patterned' ? 5 : 3;
    const lineMat = makeMat(new THREE.Color(opts.color).offsetHSL(0, 0, -0.12), { roughness: 0.8 });
    for (let i = 1; i < lines; i++) {
      place(group, box(width, 0.005, 0.012, lineMat), 0, 0.032, -depth / 2 + (depth / lines) * i);
      if (variant === 'patterned' || variant === 'paver') {
        place(group, box(0.012, 0.005, depth, lineMat), -width / 2 + (width / lines) * i, 0.032, 0);
      }
    }
  }
  return group;
}

export function buildCeiling(params: Params, opts: KitOptions) {
  const p = palette(opts.color, opts);
  const width = num(params.width, 4);
  const depth = num(params.depth, 4);
  const variant = str(params.variant, 'flat');
  const height = 3.35;
  const group = new THREE.Group();

  if (variant === 'suspended') {
    const tiles = Math.max(4, Math.round(width / 0.6));
    const tileMat = makeMat(0xe9e6df, { roughness: 0.92 });
    for (let ix = 0; ix < tiles; ix++) {
      for (let iz = 0; iz < tiles; iz++) {
        place(group, box(width / tiles - 0.01, 0.02, depth / tiles - 0.01, tileMat), -width / 2 + (width / tiles) * (ix + 0.5), height, -depth / 2 + (depth / tiles) * (iz + 0.5));
      }
    }
    for (let i = 0; i <= tiles; i++) {
      place(group, box(0.03, 0.05, depth, p.metal), -width / 2 + (width / tiles) * i, height - 0.015, 0);
      place(group, box(width, 0.05, 0.03, p.metal), 0, height - 0.015, -depth / 2 + (depth / tiles) * i);
    }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) place(group, cyl(0.008, 0.008, 0.5, p.metal, 6), sx * (width / 2 - 0.3), height + 0.25, sz * (depth / 2 - 0.3));
  } else if (variant === 'beams' || variant === 'industrial') {
    place(group, box(width, 0.06, depth, makeMat(0x2f3238, { roughness: 0.8 })), 0, height, 0);
    for (let i = 0; i < 4; i++) {
      place(group, box(width, 0.24, 0.16, p.wood), 0, height - 0.14, -depth / 2 + (depth / 4) * (i + 0.5));
    }
    for (let i = 0; i < 2; i++) place(group, cyl(0.1, 0.1, width, p.metal, 10), 0, height - 0.3, -depth / 4 + i * (depth / 2), 0, 0, Math.PI / 2);
  } else if (variant === 'vaulted') {
    const segments = 12;
    for (let i = 0; i < segments; i++) {
      const a = Math.PI * (i / segments);
      const panel = box(width, 0.06, depth / 10, p.primary);
      place(group, panel, 0, height + 0.4 + Math.sin(a) * 0.55, -depth / 2 + (depth / segments) * (i + 0.5), -Math.cos(a) * 0.9);
    }
  } else if (variant === 'coffer' || variant === 'decorative') {
    place(group, box(width, 0.1, depth, p.primary), 0, height, 0);
    const cells = 3;
    for (let ix = 0; ix < cells; ix++) {
      for (let iz = 0; iz < cells; iz++) {
        const cw = width / cells;
        const cd = depth / cells;
        for (const sx of [-1, 1]) {
          place(group, box(0.05, 0.12, cd - 0.1, p.light), -width / 2 + cw * (ix + 0.5) + (sx * cw) / 2 - sx * 0.04, height - 0.11, -depth / 2 + cd * (iz + 0.5));
        }
        for (const sz of [-1, 1]) {
          place(group, box(cw - 0.1, 0.12, 0.05, p.light), -width / 2 + cw * (ix + 0.5), height - 0.11, -depth / 2 + cd * (iz + 0.5) + (sz * cd) / 2 - sz * 0.04);
        }
      }
    }
  } else {
    place(group, box(width, 0.08, depth, p.light), 0, height, 0);
  }
  return group;
}

export function buildCeilingFixture(params: Params, opts: KitOptions) {
  const p = palette(opts.color, opts);
  const variant = str(params.variant, 'downlight');
  const group = new THREE.Group();
  const height = 3.3;
  const glowMats: THREE.MeshStandardMaterial[] = [];
  if (variant === 'vent') {
    place(group, box(0.42, 0.06, 0.42, p.metal), 0, height, 0);
    for (let i = 0; i < 5; i++) place(group, box(0.36, 0.01, 0.02, p.dark), 0, height - 0.035, -0.14 + i * 0.07);
  } else if (variant === 'panel') {
    const lightMat = makeMat(0xf6f3ea, { roughness: 0.5, emissive: opts.color, emissiveIntensity: opts.active ? 1.4 : 0.45 });
    glowMats.push(lightMat);
    place(group, box(0.62, 0.03, 0.62, lightMat), 0, height - 0.02, 0);
    place(group, box(0.68, 0.03, 0.68, p.metal), 0, height, 0);
  } else if (variant === 'detector') {
    place(group, cyl(0.12, 0.13, 0.035, p.light, 18), 0, height - 0.02, 0);
    place(group, cyl(0.03, 0.03, 0.012, makeMat(0x8b1f1f, { roughness: 0.4 }), 10), 0.05, height - 0.045, 0);
  } else {
    place(group, cyl(0.13, 0.13, 0.02, p.light, 18), 0, height, 0);
    const lens = makeMat(0xfff2d8, { roughness: 0.35, emissive: opts.color, emissiveIntensity: opts.active ? 1.5 : 0.6 });
    glowMats.push(lens);
    place(group, cyl(0.1, 0.1, 0.005, lens, 18), 0, height - 0.015, 0);
  }
  tagEmissive(group, glowMats);
  if (opts.active && variant !== 'vent' && variant !== 'detector') {
    addLight(group, new THREE.Color(opts.color).getHex(), 0.8, 5, opts);
    const light = group.userData.light as THREE.PointLight | undefined;
    if (light) light.position.set(0, height - 0.1, 0);
  }
  return group;
}

export function buildStairs(params: Params, opts: KitOptions) {
  const p = palette(opts.color, opts);
  const variant = str(params.variant, 'straight');
  const steps = num(params.steps, 12);
  const width = num(params.width, 1.2);
  const group = new THREE.Group();
  const rise = 0.2;
  const run = 0.28;

  if (variant === 'spiral') {
    place(group, cyl(0.09, 0.09, steps * rise + 0.6, p.metal, 12), 0, (steps * rise) / 2, 0);
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 1.6;
      const tread = box(0.9, 0.06, 0.32, i % 2 ? p.wood : p.primary);
      place(group, tread, Math.cos(a) * 0.55, rise * (i + 0.5), Math.sin(a) * 0.55, 0, -a, 0);
    }
    place(group, cyl(0.55, 0.55, 0.06, p.wood, 22), 0, steps * rise + 0.05, 0);
    place(group, cyl(0.58, 0.58, 0.03, p.accent, 22), 0, steps * rise + 0.01, 0);
  } else if (variant === 'floating') {
    place(group, box(0.16, steps * rise, 0.24, p.metal), -width / 2 + 0.08, (steps * rise) / 2, -0.4);
    for (let i = 0; i < steps; i++) {
      const tread = box(width, 0.07, run + 0.06, p.wood);
      place(group, tread, 0, rise * (i + 0.5), -i * run);
    }
    for (let i = 1; i < steps; i += 3) {
      place(group, box(0.05, 0.95, 0.05, p.metal), width / 2 - 0.04, rise * i + 0.5, -i * run);
    }
  } else {
    // Straight, curved and modular stairs all use treads; curved ones fan out.
    for (let i = 0; i < steps; i++) {
      const tread = box(width, 0.08, run + 0.04, i % 4 === 0 ? p.accent : p.primary);
      if (variant === 'curved') {
        const a = (i / steps) * 0.8;
        place(group, tread, Math.sin(a) * 1.1, rise * (i + 0.5), -i * run * 0.82, 0, -a, 0);
      } else {
        place(group, tread, 0, rise * (i + 0.5), -i * run);
      }
      place(group, box(width, rise * 0.86, 0.03, p.wood), 0, rise * (i + 0.5) - rise * 0.4, -i * run + run / 2 - 0.02);
    }
    for (const sx of [-1, 1]) {
      place(group, box(0.06, steps * rise * 0.9, steps * run, p.wood), sx * (width / 2 - 0.03), (steps * rise) / 2 - 0.1, (-(steps - 1) * run) / 2 - 0.05, Math.atan2(rise, run), 0, 0);
      if (variant === 'modular' || variant === 'straight') {
        for (let i = 2; i < steps; i += 2) {
          place(group, box(0.035, 0.9, 0.035, p.metal), sx * (width / 2 - 0.05), rise * i + 0.45, -i * run);
        }
        place(group, box(0.04, 0.04, steps * run, p.metal), sx * (width / 2 - 0.05), steps * rise + 0.9, (-(steps - 1) * run) / 2, Math.atan2(rise, run), 0, 0);
      }
    }
  }
  return group;
}

export function buildRailing(params: Params, opts: KitOptions) {
  const p = palette(opts.color, opts);
  const length = num(params.length, 2);
  const variant = str(params.variant, 'metal');
  const height = num(params.height, 1.05);
  const group = new THREE.Group();
  place(group, box(length, 0.06, 0.06, p.metal), 0, height, 0);
  place(group, box(length, 0.03, 0.03, p.metal), 0, height * 0.55, 0);
  if (variant === 'glass') {
    place(group, box(length - 0.06, height - 0.12, 0.012, p.glass), 0, height / 2, 0);
    for (let i = 0; i <= 2; i++) place(group, cyl(0.03, 0.03, height, p.metal, 10), -length / 2 + (length / 2) * i, height / 2, 0);
  } else if (variant === 'wood') {
    for (let i = 0; i <= 6; i++) place(group, box(0.06, height, 0.06, p.wood), -length / 2 + (length / 6) * i, height / 2, 0);
  } else {
    const posts = Math.max(3, Math.round(length / 0.22));
    for (let i = 0; i < posts; i++) {
      place(group, cyl(0.012, 0.012, height - 0.08, p.metal, 8), -length / 2 + (length / (posts - 1)) * i, height / 2, 0);
    }
    for (const sx of [-1, 1]) place(group, cyl(0.035, 0.035, height, p.metal, 12), sx * (length / 2 - 0.03), height / 2, 0);
  }
  return group;
}

export function buildPlatform(params: Params, opts: KitOptions) {
  const p = palette(opts.color, opts);
  const variant = str(params.variant, 'stage');
  const width = num(params.width, 3);
  const depth = num(params.depth, 2);
  const height = num(params.height, variant === 'stage' ? 0.45 : 0.35);
  const group = new THREE.Group();
  if (variant === 'balcony' || variant === 'mezzanine') {
    place(group, box(width, 0.16, depth, p.wood), 0, height, 0);
    place(group, box(width, 0.1, 0.06, p.metal), 0, height - 0.1, depth / 2 - 0.03);
    for (let i = 0; i < 4; i++) {
      place(group, box(0.06, height, 0.06, p.metal), -width / 2 + (width / 3) * i, height / 2, depth / 2 - 0.08);
    }
    place(group, box(width, 0.05, 0.05, p.metal), 0, height + 1.0, depth / 2);
    const balusters = Math.max(6, Math.round(width / 0.2));
    for (let i = 0; i < balusters; i++) place(group, cyl(0.01, 0.01, 0.95, p.metal, 6), -width / 2 + (width / (balusters - 1)) * i, height + 0.5, depth / 2);
  } else if (variant === 'riser') {
    place(group, box(width, height, depth, p.primary), 0, height / 2, 0);
    place(group, box(width + 0.04, 0.04, depth + 0.04, p.dark), 0, height + 0.02, 0);
    for (let i = 0; i < 3; i++) place(group, box(0.02, height * 0.6, 0.02, p.metal), -width / 2 + 0.06, height * 0.35, -depth / 2 + 0.08 + i * 0.14);
  } else {
    place(group, box(width, height, depth, p.dark), 0, height / 2, 0);
    place(group, box(width + 0.05, 0.06, depth + 0.05, p.wood), 0, height + 0.02, 0);
    if (variant === 'stage') {
      for (let i = 0; i < 4; i++) {
        place(group, glowPanel(width * 0.18, 0.05, opts.color, opts.active ? 1.8 : 0.4), -width / 2 + width * 0.18 * (i + 0.5), height - 0.02, depth / 2 + 0.035);
      }
    }
  }
  return group;
}

export function buildEscalator(params: Params, opts: KitOptions) {
  const p = palette(opts.color, opts);
  const run = num(params.run, 4.4);
  const group = new THREE.Group();
  const angle = Math.atan2(2.8, run);
  for (const sx of [-1, 1]) {
    place(group, box(run, 1.1, 0.08, p.metal), sx * 0.55, 1.5, 0, angle);
    place(group, box(run, 0.06, 0.09, p.dark), sx * 0.55, 2.6, 0, angle);
    place(group, box(run, 0.9, 0.02, p.glass), sx * 0.55, 2.1, 0, angle);
  }
  for (let i = 0; i < 16; i++) {
    const t = i / 15;
    place(group, box(1.0, 0.08, 0.22, i % 2 ? p.metal : p.dark), 0, 0.35 + t * 2.7, -run / 2 + t * run);
  }
  place(group, box(1.3, 0.2, 0.45, p.metal), 0, 0.12, run / 2 - 0.1);
  place(group, box(1.3, 0.2, 0.45, p.metal), 0, 3.05, -run / 2 + 0.1);
  return group;
}

export function buildElevator(params: Params, opts: KitOptions) {
  const p = palette(opts.color, opts);
  const width = num(params.width, 1.5);
  const depth = num(params.depth, 1.4);
  const group = new THREE.Group();
  const height = 2.6;
  place(group, box(width, height, 0.06, p.metal), 0, height / 2, -depth / 2);
  for (const sx of [-1, 1]) {
    place(group, box(0.06, height, depth, p.metal), sx * (width / 2), height / 2, 0);
    place(group, box(width * 0.46, height - 0.1, 0.05, p.primary), sx * width * 0.24, height / 2, depth / 2);
  }
  place(group, box(width, 0.12, depth, p.dark), 0, 0.06, 0);
  place(group, box(width, 0.16, depth, p.light), 0, height, 0);
  place(group, box(0.24, 0.5, 0.03, p.dark), width / 2 + 0.06, 1.15, depth / 2 - 0.16);
  for (const sy of [1.05, 1.25]) {
    place(group, cyl(0.032, 0.032, 0.01, p.metal, 14), width / 2 + 0.09, sy, depth / 2 - 0.15, Math.PI / 2);
  }
  return group;
}

export function buildDoor(params: Params, opts: KitOptions) {
  const p = palette(opts.color, opts);
  const variant = str(params.variant, 'single');
  const width = num(params.width, variant === 'double' ? 1.8 : 1);
  const height = 2.15;
  const group = new THREE.Group();
  if (variant === 'garage') {
    for (let i = 0; i < 5; i++) {
      place(group, box(width, height / 5 - 0.02, 0.06, i % 2 ? p.primary : p.accent), 0, (height / 5) * (i + 0.5), 0);
      place(group, box(width - 0.1, 0.03, 0.07, p.dark), 0, (height / 5) * (i + 0.5) + height / 10, 0.02);
    }
    for (const sx of [-1, 1]) place(group, box(0.08, height + 0.1, 0.1, p.dark), sx * (width / 2 + 0.02), height / 2, 0);
    return group;
  }
  const frame = p.dark;
  for (const sx of [-1, 1]) place(group, box(0.07, height + 0.12, 0.12, frame), sx * (width / 2 + 0.02), height / 2, 0);
  place(group, box(width + 0.16, 0.09, 0.14, frame), 0, height + 0.04, 0);
  if (variant === 'automatic') {
    place(group, box(width / 2 - 0.03, height - 0.1, 0.04, p.glass), -width / 4, height / 2, 0);
    place(group, box(width / 2 - 0.03, height - 0.1, 0.04, p.glass), width / 4, height / 2, 0);
    place(group, box(0.16, 0.08, 0.05, makeMat(opts.color, { emissive: opts.color, emissiveIntensity: opts.active ? 1.5 : 0.4 })), 0, height - 0.02, 0.09);
    return group;
  }
  if (variant === 'sliding') {
    place(group, box(width / 2 - 0.02, height - 0.06, 0.05, p.primary), -width / 4, height / 2, 0.03);
    place(group, box(width / 2 - 0.02, height - 0.06, 0.05, p.primary), width / 4, height / 2, -0.03);
    place(group, box(0.03, height + 0.05, 0.16, p.metal), width / 2 + 0.06, height / 2, 0);
    return group;
  }
  if (variant === 'double') {
    for (const sx of [-1, 1]) {
      const leaf = variant === 'double' ? box(width / 2 - 0.02, height - 0.04, 0.05, p.primary) : box(width, height, 0.05, p.primary);
      place(group, leaf, sx * width / 4, height / 2, 0);
      place(group, box(0.04, 0.04, 0.12, p.accent), sx * 0.06, 1.02, 0.08);
      place(group, box((width / 2) * 0.62, (height - 0.5) * 0.5, 0.015, p.accent), sx * width / 4, height * 0.66, 0.03);
    }
    return group;
  }
  const glassLeaf = variant === 'glass';
  place(group, box(width - 0.06, height - 0.04, 0.05, glassLeaf ? p.glass : p.primary), 0, height / 2, 0);
  if (glassLeaf) {
    place(group, box(width - 0.12, 0.06, 0.07, p.metal), 0, 0.1, 0);
    place(group, box(width - 0.12, 0.06, 0.07, p.metal), 0, height - 0.08, 0);
  } else {
    place(group, box((width - 0.2) * 0.6, (height - 0.5) * 0.55, 0.015, p.accent), 0, height * 0.68, 0.032);
    place(group, box((width - 0.2) * 0.6, (height - 0.5) * 0.3, 0.015, p.accent), 0, height * 0.32, 0.032);
  }
  place(group, cyl(0.022, 0.022, 0.11, p.metal, 12), width / 2 - 0.14, 1.02, 0.09, Math.PI / 2);
  return group;
}

export function buildWindow(params: Params, opts: KitOptions) {
  const p = palette(opts.color, opts);
  const variant = str(params.variant, 'standard');
  const width = num(params.width, variant === 'floor_to_ceiling' ? 2.4 : 1.5);
  const height = num(params.height, variant === 'floor_to_ceiling' ? 2.6 : 1.3);
  const group = new THREE.Group();
  const frameMat = p.dark;
  const sillMat = p.light;
  place(group, box(width + 0.12, 0.07, 0.16, frameMat), 0, height + 0.03, 0);
  place(group, box(width + 0.12, 0.07, 0.16, frameMat), 0, -0.01, 0);
  for (const sx of [-1, 1]) place(group, box(0.07, height + 0.1, 0.16, frameMat), sx * (width / 2), height / 2, 0);
  place(group, box(width, height, 0.02, p.glass), 0, height / 2, 0);
  place(group, box(0.04, height, 0.05, frameMat), 0, height / 2, 0.01);
  if (variant === 'bay') {
    for (const sx of [-1, 1]) {
      place(group, box(width * 0.34, height, 0.02, p.glass), sx * (width / 2 + width * 0.12), height / 2, 0.28, 0, sx * 0.6, 0);
      place(group, box(0.06, height + 0.08, 0.08, frameMat), sx * (width / 2 + width * 0.24), height / 2, 0.5);
    }
    place(group, box(width * 1.5, 0.08, 0.5, sillMat), 0, -0.03, 0.25);
  } else if (variant === 'arched') {
    for (let i = 0; i < 10; i++) {
      const a = Math.PI * (i / 10);
      place(group, box(width / 10 + 0.01, 0.08, 0.16, frameMat), Math.cos(a) * (width / 2), height + 0.05 + Math.sin(a) * 0.3, 0, 0, 0, a - Math.PI / 2);
    }
  } else if (variant === 'storefront') {
    for (let i = 1; i < 3; i++) place(group, box(0.04, height, 0.05, frameMat), -width / 2 + (width / 3) * i, height / 2, 0.01);
    place(group, box(width, 0.05, 0.18, sillMat), 0, 0.02, 0.03);
  }
  place(group, box(width + 0.24, 0.06, 0.26, sillMat), 0, -0.08, 0.04);
  return group;
}

export function buildBlinds(params: Params, opts: KitOptions) {
  const p = palette(opts.color, opts);
  const width = num(params.width, 1.8);
  const height = num(params.height, 1.6);
  const variant = str(params.variant, 'blinds');
  const group = new THREE.Group();
  place(group, box(width + 0.12, 0.09, 0.11, p.dark), 0, height, 0);
  if (variant === 'blinds') {
    const slats = Math.max(8, Math.round(height / 0.09));
    for (let i = 0; i < slats; i++) {
      place(group, box(width, 0.02, 0.09, p.light), 0, height - 0.1 - i * (height / slats), 0, 0.32);
    }
    place(group, box(width, 0.02, 0.02, p.light), 0, 0.02, 0);
  } else {
    // Curtain panels with a gathered fall.
    const panels = 2;
    for (let panel = 0; panel < panels; panel++) {
      const x = -width / 2 + (width / panels) * (panel + 0.5);
      for (let i = 0; i < 7; i++) {
        const fold = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, height - 0.15, 8, 1, true), p.fabric);
        place(group, fold, x + (i - 3) * 0.11, height / 2 - 0.05, 0.06 + Math.abs(i - 3) * 0.008);
      }
    }
    place(group, cyl(0.018, 0.018, width + 0.2, p.metal, 10), 0, height - 0.02, 0.03, 0, 0, Math.PI / 2);
  }
  return group;
}

export function buildRoof(params: Params, opts: KitOptions) {
  const p = palette(opts.color, opts);
  const variant = str(params.variant, 'flat');
  const width = num(params.width, 4);
  const depth = num(params.depth, 4);
  const group = new THREE.Group();
  if (variant === 'pitched') {
    const slope = Math.atan2(1.2, depth / 2);
    for (const sz of [-1, 1]) {
      place(group, box(width + 0.3, 0.1, depth / 2 + 0.16, p.primary), 0, 2.9 + 0.6, (sz * depth) / 4, sz * slope, 0, 0);
      for (let i = 0; i < 6; i++) {
        place(group, box(width + 0.3, 0.02, 0.05, p.accent), 0, 3.02 + 0.62 + Math.cos(i) * 0.05, (sz * depth) / 4 + (i - 2.5) * (depth / 14), sz * slope, 0, 0);
      }
    }
    for (const sx of [-1, 1]) {
      const gable = new THREE.Shape();
      gable.moveTo(-depth / 2, 0);
      gable.lineTo(depth / 2, 0);
      gable.lineTo(0, 1.2);
      gable.closePath();
      const geo = new THREE.ExtrudeGeometry(gable, { depth: 0.1, bevelEnabled: false });
      const mesh = new THREE.Mesh(geo, p.light);
      place(group, mesh, sx * (width / 2), 2.9, 0, 0, Math.PI / 2, 0);
    }
  } else if (variant === 'deck') {
    const boards = Math.max(8, Math.round(depth / 0.16));
    for (let i = 0; i < boards; i++) {
      place(group, box(width, 0.05, depth / boards - 0.01, i % 3 ? p.wood : p.primary), 0, 0.06, -depth / 2 + (depth / boards) * (i + 0.5));
    }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) place(group, box(0.1, 0.9, 0.1, p.wood), sx * (width / 2 - 0.08), -0.4, sz * (depth / 2 - 0.08));
    place(group, box(width + 0.05, 0.06, 0.06, p.metal), 0, 0.9, depth / 2 - 0.03);
  } else {
    place(group, box(width, 0.16, depth, p.dark), 0, 3.05, 0);
    place(group, box(width + 0.08, 0.12, depth + 0.08, p.primary), 0, 3.16, 0);
    for (const sx of [-1, 1]) {
      place(group, box(0.16, 0.5, depth, p.primary), sx * (width / 2), 3.4, 0);
      place(group, box(0.22, 0.06, depth + 0.1, p.stone), sx * (width / 2), 3.66, 0);
    }
    for (const sz of [-1, 1]) {
      place(group, box(width, 0.5, 0.16, p.primary), 0, 3.4, sz * (depth / 2));
      place(group, box(width + 0.1, 0.06, 0.22, p.stone), 0, 3.66, sz * (depth / 2));
    }
    for (let i = 0; i < 3; i++) place(group, box(0.34, 0.1, 0.34, p.metal), -width / 3 + i * (width / 3), 3.3, 0);
  }
  return group;
}

export function buildFence(params: Params, opts: KitOptions) {
  const p = palette(opts.color, opts);
  const length = num(params.length, 2.4);
  const height = num(params.height, 1.2);
  const variant = str(params.variant, 'wood');
  const group = new THREE.Group();
  if (variant === 'hedge') {
    const hedgeMat = makeMat(0x3f6b3a, { roughness: 0.95 });
    place(group, box(length, height, 0.5, hedgeMat), 0, height / 2, 0);
    for (let i = 0; i < 8; i++) place(group, sphere(0.26, hedgeMat, 10), -length / 2 + (length / 8) * (i + 0.5), height * 0.9, (i % 2 ? 0.1 : -0.08));
    return group;
  }
  if (variant === 'metal') {
    for (const sx of [-1, 1]) place(group, cyl(0.04, 0.04, height + 0.1, p.metal, 10), sx * (length / 2 - 0.02), height / 2, 0);
    place(group, box(length, 0.04, 0.04, p.metal), 0, height - 0.04, 0);
    place(group, box(length, 0.03, 0.03, p.metal), 0, 0.1, 0);
    const bars = Math.max(6, Math.round(length / 0.14));
    for (let i = 0; i < bars; i++) place(group, cyl(0.011, 0.011, height - 0.15, p.metal, 6), -length / 2 + 0.05 + (length - 0.1) * (i / (bars - 1)), height / 2, 0);
  } else {
    const pickets = Math.max(6, Math.round(length / 0.17));
    for (let i = 0; i < pickets; i++) {
      const picket = box(0.08, height, 0.03, p.primary);
      place(group, picket, -length / 2 + (length / pickets) * (i + 0.5), height / 2, 0);
      place(group, new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.1, 4), p.primary), -length / 2 + (length / pickets) * (i + 0.5), height + 0.05, 0, 0, Math.PI / 4, 0);
    }
    for (const sy of [0.32, height - 0.22]) place(group, box(length, 0.07, 0.06, p.wood), 0, sy, 0.03);
    place(group, box(length, 0.05, 0.1, p.wood), 0, height + 0.04, 0);
    for (const sx of [-1, 1]) place(group, box(0.1, height + 0.16, 0.1, p.wood), sx * (length / 2 - 0.05), (height + 0.1) / 2, 0);
  }
  return group;
}

export function buildGate(params: Params, opts: KitOptions) {
  const p = palette(opts.color, opts);
  const width = num(params.width, 1.6);
  const group = new THREE.Group();
  const height = 1.5;
  for (const sx of [-1, 1]) place(group, box(0.09, height + 0.2, 0.09, p.wood), sx * (width / 2 + 0.06), height / 2, 0);
  for (const sx of [-1, 1]) {
    place(group, box(width / 2 - 0.03, 0.09, 0.06, p.primary), sx * width / 4, height - 0.16, 0);
    place(group, box(width / 2 - 0.03, 0.09, 0.06, p.primary), sx * width / 4, 0.25, 0);
    for (let i = 0; i < 5; i++) place(group, box(0.07, height - 0.4, 0.035, p.accent), sx * (width / 4) + (i - 2) * (width / 12), height / 2, 0.01);
  }
  place(group, torus(0.06, 0.012, p.metal, 12), -0.08, 0.8, 0.06);
  place(group, box(0.1, 0.12, 0.04, p.dark), width / 2 + 0.02, 1.05, 0.05);
  return group;
}

export function buildPorch(params: Params, opts: KitOptions) {
  const p = palette(opts.color, opts);
  const variant = str(params.variant, 'porch');
  const width = num(params.width, 3);
  const depth = num(params.depth, 2);
  const group = new THREE.Group();
  const boards = Math.max(8, Math.round(depth / 0.16));
  if (variant === 'patio') {
    const tiles = Math.max(4, Math.round(width / 0.8));
    for (let ix = 0; ix < tiles; ix++) {
      for (let iz = 0; iz < tiles; iz++) {
        place(group, box(width / tiles - 0.03, 0.06, depth / tiles - 0.03, (ix + iz) % 2 ? p.stone : p.primary), -width / 2 + (width / tiles) * (ix + 0.5), 0.03, -depth / 2 + (depth / tiles) * (iz + 0.5));
      }
    }
  } else {
    for (let i = 0; i < boards; i++) {
      place(group, box(width, 0.06, depth / boards - 0.012, i % 3 === 0 ? p.accent : p.wood), 0, 0.05, -depth / 2 + (depth / boards) * (i + 0.5));
    }
    for (const sx of [-1, 1]) place(group, box(0.12, 0.36, depth, p.wood), sx * (width / 2 - 0.06), -0.16, 0);
    if (variant === 'porch') {
      for (const sx of [-1, 1]) place(group, cyl(0.08, 0.09, 2.6, p.light, 12), sx * (width / 2 - 0.2), 1.4, depth / 2 - 0.2);
      for (let i = 0; i < boards; i++) place(group, box(width + 0.2, 0.04, 0.16, p.dark), 0, 2.74, -depth / 2 + (depth / boards) * (i + 0.5), 0.06);
      place(group, box(width + 0.3, 0.1, 0.12, p.light), 0, 2.82, depth / 2);
    }
  }
  return group;
}

export function buildGround(params: Params, opts: KitOptions) {
  const p = palette(opts.color, opts);
  const variant = str(params.variant, 'sidewalk');
  const width = num(params.width, 4);
  const depth = num(params.depth, 4);
  const group = new THREE.Group();
  if (variant === 'road') {
    place(group, box(width, 0.06, depth, makeMat(0x2c2e33, { roughness: 0.94 })), 0, 0.03, 0);
    for (let i = 0; i < 4; i++) place(group, box(width * 0.12, 0.008, 0.14, makeMat(0xe6d9a2, { roughness: 0.8 })), 0, 0.065, -depth / 2 + (depth / 4) * (i + 0.5));
    for (const sx of [-1, 1]) place(group, box(0.08, 0.009, depth, makeMat(0xdedad0, { roughness: 0.85 })), sx * (width / 2 - 0.18), 0.065, 0);
  } else if (variant === 'parking') {
    place(group, box(width, 0.06, depth, makeMat(0x32353b, { roughness: 0.95 })), 0, 0.03, 0);
    for (let i = 0; i <= 2; i++) {
      place(group, box(0.08, 0.009, depth * 0.8, makeMat(0xeeeae0, { roughness: 0.8 })), -width / 2 + (width / 2) * i + 0.04, 0.065, 0);
    }
    place(group, box(width * 0.76, 0.009, 0.08, makeMat(0xeeeae0, { roughness: 0.8 })), 0, 0.065, -depth * 0.34);
  } else if (variant === 'curb') {
    place(group, box(width, 0.18, depth, p.stone), 0, 0.09, 0);
    place(group, box(width, 0.03, depth + 0.04, makeMat(new THREE.Color(opts.color).offsetHSL(0, 0, 0.08), { roughness: 0.85 })), 0, 0.19, 0);
  } else if (variant === 'driveway') {
    place(group, box(width, 0.05, depth, p.primary), 0, 0.025, 0);
    for (let i = 1; i < 4; i++) place(group, box(0.02, 0.01, depth, makeMat(0x8d8f92, { roughness: 0.9 })), -width / 2 + (width / 4) * i, 0.052, 0);
  } else {
    place(group, box(width, 0.05, depth, p.primary), 0, 0.025, 0);
    const slabs = 4;
    for (let i = 1; i < slabs; i++) {
      place(group, box(0.018, 0.01, depth, makeMat(0x9a9c9e, { roughness: 0.9 })), -width / 2 + (width / slabs) * i, 0.052, 0);
    }
    place(group, box(width, 0.01, 0.018, makeMat(0x9a9c9e, { roughness: 0.9 })), 0, 0.052, 0);
  }
  return group;
}

export function buildStreetFurniture(params: Params, opts: KitOptions) {
  const p = palette(opts.color, opts);
  const variant = str(params.variant, 'streetlight');
  const group = new THREE.Group();
  if (variant === 'streetlight') {
    place(group, cyl(0.11, 0.14, 0.24, p.dark, 12), 0, 0.12, 0);
    place(group, cyl(0.055, 0.075, 4.4, p.dark, 12), 0, 2.3, 0);
    place(group, box(0.08, 0.08, 1.1, p.dark), 0, 4.4, 0.5);
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.18, 16, 1, true), p.dark);
    place(group, head, 0, 4.32, 1.0, 0.2, 0, 0);
    const lens = makeMat(0xfff1c9, { roughness: 0.3, emissive: opts.color, emissiveIntensity: opts.active ? 1.8 : 0.5 });
    place(group, cyl(0.2, 0.2, 0.02, lens, 16), 0, 4.24, 1.0);
    tagEmissive(group, [lens]);
    if (opts.active) addLight(group, 0xffd9a0, 1.4, 7, opts);
  } else if (variant === 'traffic_light') {
    place(group, cyl(0.09, 0.12, 3.6, p.dark, 12), 0, 1.8, 0);
    place(group, box(0.4, 1.0, 0.26, p.dark), 0, 3.4, 0);
    place(group, box(0.44, 0.06, 0.32, p.dark), 0, 3.94, 0);
    const colors = [0xd8352a, 0xe0a52b, 0x3fbf5e];
    colors.forEach((hex, i) => {
      const lens = makeMat(0x101216, { emissive: hex, emissiveIntensity: opts.active && i === 2 ? 1.8 : 0.25 });
      place(group, cyl(0.1, 0.1, 0.03, lens, 16), 0, 3.7 - i * 0.28, 0.15, Math.PI / 2);
    });
    place(group, box(0.6, 0.06, 0.6, p.metal), 0, 0.05, 0);
  } else if (variant === 'bus_stop') {
    place(group, box(3.2, 2.5, 0.08, p.glass), 0, 1.25, -0.7);
    place(group, box(3.4, 0.1, 1.7, p.dark), 0, 2.6, -0.02);
    for (const sx of [-1, 1]) place(group, box(0.09, 2.6, 1.6, p.glass), sx * 1.65, 1.3, -0.02);
    for (const sx of [-1, 1]) place(group, cyl(0.05, 0.05, 2.6, p.metal, 10), sx * 1.6, 1.3, 0.75);
    place(group, box(3.2, 0.08, 0.06, p.metal), 0, 0.52, -0.1);
    place(group, box(2.4, 0.07, 0.5, p.wood), 0, 0.52, 0.1);
    for (const sx of [-1, 1]) place(group, box(0.06, 0.5, 0.45, p.metal), sx * 1.05, 0.26, 0.1);
    place(group, box(0.5, 0.7, 0.04, p.accent), 1.9, 2.1, 0.6);
  } else {
    // Street sign on a slim post.
    place(group, cyl(0.035, 0.045, 2.6, p.metal, 10), 0, 1.3, 0);
    place(group, box(0.72, 0.24, 0.03, makeMat(0x186b45, { roughness: 0.55 })), 0, 2.45, 0);
    place(group, box(0.6, 0.06, 0.008, makeMat(0xf2f2ee, { roughness: 0.5 })), 0, 2.47, 0.02);
    place(group, box(0.5, 0.16, 0.03, makeMat(0x2b5d9c, { roughness: 0.55 })), 0, 2.05, 0);
  }
  return group;
}

/** Small umbrella stand used next to patio tables (not a catalog item alone). */
export function buildPatioUmbrella(params: Params, opts: KitOptions) {
  const p = palette(opts.color, opts);
  const group = new THREE.Group();
  place(group, cyl(0.32, 0.36, 0.08, p.dark, 18), 0, 0.04, 0);
  place(group, cyl(0.03, 0.03, 2.3, p.metal, 10), 0, 1.15, 0);
  const canopy = new THREE.Mesh(new THREE.ConeGeometry(1.2, 0.4, 8, 1, true), p.fabric);
  canopy.material.side = THREE.DoubleSide;
  place(group, canopy, 0, 2.3, 0);
  return group;
}

/** Unused helper kept for future seating kits. */
export function buildSeatBlock(params: Params, opts: KitOptions) {
  const p = palette(opts.color, opts);
  const group = new THREE.Group();
  place(group, cushion(1.2, 0.2, 0.9, p.fabric), 0, 0.45, 0);
  legs(group, p.wood, 1.2, 0.9, 0.36);
  return group;
}

/** Curved wall: an arc of wall segments with matching plaster finish. */
export function buildCurvedWall(params: Params, opts: KitOptions) {
  const p = palette(opts.color, opts);
  const radius = num(params.radius, 2.4);
  const arc = num(params.arc, 1.2);
  const height = num(params.height, 2.9);
  const group = new THREE.Group();
  const segments = 10;
  for (let i = 0; i < segments; i++) {
    const a = -arc / 2 + (arc / segments) * (i + 0.5);
    const block = box((arc / segments) * radius + 0.04, height, 0.18, p.primary);
    place(group, block, Math.sin(a) * radius, height / 2, Math.cos(a) * radius - radius, 0, a, 0);
  }
  for (const a of [-arc / 2, arc / 2]) {
    place(group, box(0.2, height, 0.2, p.accent), Math.sin(a) * radius, height / 2, Math.cos(a) * radius - radius, 0, a, 0);
  }
  for (let i = 0; i < segments; i++) {
    const a = -arc / 2 + (arc / segments) * (i + 0.5);
    place(group, box((arc / segments) * radius + 0.04, 0.11, 0.21, p.light), Math.sin(a) * radius, 0.055, Math.cos(a) * radius - radius, 0, a, 0);
  }
  return group;
}

/** Corner wall module: two wall arms meeting at an inner or outer right angle. */
export function buildCornerWall(params: Params, opts: KitOptions) {
  const p = palette(opts.color, opts);
  const arm = num(params.arm, 1.2);
  const height = num(params.height, 2.9);
  const outer = Boolean(params.outer);
  const group = new THREE.Group();
  const sign = outer ? 1 : -1;
  place(group, box(arm, height, 0.18, p.primary), 0, height / 2, sign * (arm / 2 - 0.09));
  place(group, box(0.18, height, arm, p.primary), sign * (arm / 2 - 0.09), height / 2, 0);
  place(group, box(0.22, height, 0.22, p.accent), 0, height / 2, 0);
  place(group, box(arm, 0.11, 0.22, p.light), 0, 0.055, sign * (arm / 2 - 0.09));
  place(group, box(0.22, 0.11, arm, p.light), sign * (arm / 2 - 0.09), 0.055, 0);
  return group;
}
