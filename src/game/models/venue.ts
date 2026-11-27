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
const num = (v: unknown, f: number) => (typeof v === 'number' && Number.isFinite(v) ? v : f);
const str = (v: unknown, f: string) => (typeof v === 'string' ? v : f);

/** Service counters: bar, reception, host, checkout, buffet, ticket, prep. */
export function buildCounter(params: Params, opts: KitOptions) {
  const p = palette(opts.color, opts);
  const variant = str(params.variant, 'bar');
  const width = num(params.width, variant === 'bar' ? 3 : 1.8);
  const depth = num(params.depth, 0.62);
  const height = num(params.height, variant === 'host' ? 1.1 : 1.08);
  const group = new THREE.Group();

  place(group, box(width, height - 0.08, depth, p.primary), 0, (height - 0.08) / 2 + 0.02, 0);
  place(group, box(width + 0.08, 0.07, depth + 0.08, variant === 'bar' ? p.stone : p.wood), 0, height, 0);

  if (variant === 'bar') {
    // Brass foot rail, front panelling and a working back-bar tap set.
    place(group, cyl(0.025, 0.025, width - 0.2, p.metal, 10), 0, 0.18, depth / 2 + 0.1, 0, 0, Math.PI / 2);
    const panels = Math.max(3, Math.round(width / 0.55));
    for (let i = 0; i < panels; i++) {
      place(group, box(width / panels - 0.06, height * 0.6, 0.02, p.accent), -width / 2 + (width / panels) * (i + 0.5), height * 0.5, depth / 2 + 0.012);
    }
    for (let i = 0; i < 4; i++) {
      const tap = cyl(0.022, 0.022, 0.18, p.metal, 10);
      place(group, tap, -width / 4 + i * (width / 8), height + 0.1, -depth / 2 + 0.16);
      place(group, cyl(0.05, 0.04, 0.05, p.accent, 10), -width / 4 + i * (width / 8), height + 0.04, -depth / 2 + 0.16);
    }
    for (let i = 0; i < 3; i++) {
      place(group, box(0.06, 0.24, 0.06, p.dark), -width / 2 + 0.35 + i * 0.4, height - 0.12, -depth / 2 + 0.12);
    }
  } else if (variant === 'reception' || variant === 'hotel') {
    place(group, box(width * 0.9, 0.5, 0.06, p.accent), 0, height * 0.62, depth / 2 + 0.01);
    place(group, box(0.34, 0.16, 0.24, p.dark), width * 0.28, height + 0.1, -0.02);
    const screen = glowPanel(0.24, 0.1, '#7fd3ff', opts.active ? 1.1 : 0.35, 'up');
    place(group, screen, width * 0.28, height + 0.19, -0.02, -Math.PI / 2, 0, 0);
    place(group, box(0.14, 0.3, 0.03, p.metal), -width * 0.3, height + 0.16, -0.06);
    place(group, box(0.2, 0.08, 0.02, p.light), -width * 0.3, height + 0.26, -0.05);
  } else if (variant === 'host') {
    place(group, box(width, 0.04, depth, p.stone), 0, height + 0.04, 0);
    place(group, box(width * 0.8, 0.06, depth * 0.8, p.light), 0, height + 0.08, 0);
    place(group, box(0.3, 0.2, 0.02, p.light), 0, height + 0.12, 0.1, -1.2, 0, 0);
  } else if (variant === 'checkout') {
    place(group, box(0.4, 0.28, 0.3, p.dark), width * 0.25, height + 0.16, 0);
    place(group, box(0.34, 0.2, 0.03, paintGlow(opts.color, opts.active)), width * 0.25, height + 0.2, 0.16);
    place(group, box(0.34, 0.04, depth * 0.7, p.metal), 0, height + 0.06, -0.05);
    place(group, cyl(0.025, 0.025, 0.3, p.metal, 8), -width * 0.28, height + 0.18, 0.06);
    place(group, box(0.16, 0.12, 0.02, p.primary), -width * 0.28, height + 0.34, 0.06);
  } else if (variant === 'ticket') {
    place(group, box(width, 0.1, depth, p.wood), 0, height + 0.05, 0);
    place(group, box(width * 0.6, 0.02, 0.4, p.glass), 0, height + 0.11, 0);
    place(group, box(0.3, 0.24, 0.03, paintGlow(opts.color, true)), 0, height + 0.3, -0.2);
    place(group, box(0.4, 0.03, 0.03, p.metal), 0, height + 0.4, -0.2);
  } else if (variant === 'buffet') {
    place(group, box(width + 0.06, 0.06, depth + 0.12, p.stone), 0, height + 0.03, 0);
    for (let i = 0; i < 3; i++) {
      place(group, box(width / 3.4, 0.12, depth * 0.7, p.metal), -width / 3 + i * (width / 3), height + 0.1, 0);
      for (let j = 0; j < 3; j++) {
        place(group, cyl(0.09, 0.08, 0.05, p.light, 14), -width / 3 + i * (width / 3) + (j - 1) * 0.14, height + 0.18, 0);
      }
    }
  } else if (variant === 'prep') {
    place(group, box(width, 0.08, depth, p.metal), 0, height + 0.04, 0);
    place(group, box(width * 0.4, 0.24, depth * 0.7, p.metal), -width * 0.2, height + 0.2, 0);
    place(group, cyl(0.025, 0.025, 0.3, p.metal, 8), width * 0.3, height + 0.15, 0);
  } else {
    place(group, box(width, 0.03, depth, p.glass), 0, height + 0.05, 0);
  }
  return group;
}

function paintGlow(color: string, active = true) {
  return makeMat(0x0b0e12, { roughness: 0.3, emissive: color, emissiveIntensity: active ? 1.2 : 0.35 });
}

/** Back-bar, retail, library and warehouse shelving. */
export function buildShelvingUnit(params: Params, opts: KitOptions) {
  const p = palette(opts.color, opts);
  const variant = str(params.variant, 'back_bar');
  const width = num(params.width, variant === 'warehouse' ? 2.4 : 1.6);
  const height = num(params.height, variant === 'warehouse' ? 2.6 : 2.0);
  const depth = num(params.depth, 0.38);
  const group = new THREE.Group();

  place(group, box(width, height, 0.05, p.dark), 0, height / 2, -depth / 2);
  for (const sx of [-1, 1]) place(group, box(0.06, height, depth, p.wood), sx * (width / 2 - 0.03), height / 2, 0);
  const shelves = variant === 'warehouse' ? 4 : 4;
  for (let i = 0; i <= shelves; i++) {
    place(group, box(width, 0.05, depth, p.wood), 0, 0.1 + ((height - 0.2) / shelves) * i, 0);
  }

  if (variant === 'back_bar') {
    // Bottles and glasses on the shelves.
    const bottleColors = [0x3f6b3c, 0xb5732f, 0xd9c58a, 0x6b3b52, 0x2f4b6b];
    for (let shelf = 0; shelf < shelves; shelf++) {
      const y = 0.1 + ((height - 0.2) / shelves) * shelf + 0.06;
      const count = 7;
      for (let i = 0; i < count; i++) {
        const h = 0.24 + (i % 3) * 0.04;
        const bottleMat = makeMat(bottleColors[(i + shelf) % bottleColors.length], {
          roughness: 0.28,
          metalness: 0.1,
        });
        place(group, cyl(0.035, 0.04, h, bottleMat, 10), -width / 2 + 0.16 + i * ((width - 0.32) / (count - 1)), y + h / 2, 0.02);
        place(group, cyl(0.012, 0.02, 0.07, bottleMat, 8), -width / 2 + 0.16 + i * ((width - 0.32) / (count - 1)), y + h + 0.035, 0.02);
      }
      const glow = glowPanel(width * 0.9, 0.02, opts.color, opts.active ? 1.2 : 0.3);
      place(group, glow, 0, 0.1 + ((height - 0.2) / shelves) * shelf + 0.05, depth / 2 - 0.02, Math.PI, 0, 0);
    }
  } else if (variant === 'retail') {
    // Hanging rail with garments.
    place(group, cylind(width - 0.2, 0.014, p.metal), 0, height * 0.72, 0.02, 0, 0, Math.PI / 2);
    const garments = 9;
    for (let i = 0; i < garments; i++) {
      const garmentMat = makeMat(i % 3 === 0 ? opts.color : i % 3 === 1 ? 0x445166 : 0xd8cbb6, { roughness: 0.92 });
      place(group, box(0.1, 0.55, 0.03, garmentMat), -width / 2 + 0.2 + i * ((width - 0.4) / (garments - 1)), height * 0.72 - 0.3, 0.04);
    }
    place(group, box(width, 0.05, 0.4, p.wood), 0, 0.16, 0.02);
    place(group, box(width * 0.8, 0.12, 0.3, p.accent), 0, 0.3, 0.02);
  } else if (variant === 'warehouse') {
    for (let shelf = 0; shelf < shelves; shelf++) {
      const y = 0.1 + ((height - 0.2) / shelves) * shelf;
      for (let i = 0; i < 3; i++) {
        const carton = box(width / 3.4, 0.42, depth * 0.8, makeMat(i % 2 ? 0xb99a6b : 0xa88a5c, { roughness: 0.9 }));
        place(group, carton, -width / 3 + i * (width / 3), y + 0.26, 0);
        place(group, box(width / 5, 0.02, 0.002, p.light), -width / 3 + i * (width / 3), y + 0.4, depth * 0.4 + 0.002);
      }
    }
  } else if (variant === 'library') {
    const colors = [0x8c3f35, 0x35506b, 0xa98534, 0x4b6b4c, 0x6b4b63, 0xd6c7ad];
    for (let shelf = 0; shelf < shelves; shelf++) {
      const y = 0.1 + ((height - 0.2) / shelves) * shelf + 0.05;
      let cursor = -width / 2 + 0.1;
      let i = 0;
      while (cursor < width / 2 - 0.14) {
        const w = 0.055 + (i % 4) * 0.014;
        const h = 0.22 + (i % 3) * 0.035;
        place(group, box(w, h, 0.22, makeMat(colors[(i + shelf * 3) % colors.length], { roughness: 0.86 })), cursor + w / 2, y + h / 2, 0.02);
        cursor += w + 0.012;
        i++;
      }
    }
  } else {
    // Product display: stepped risers with packaged goods.
    for (let shelf = 0; shelf < 3; shelf++) {
      const y = 0.24 + shelf * 0.42;
      place(group, box(width * 0.92, 0.06, depth * 0.85, p.accent), 0, y, 0.02);
      const jars = 5;
      for (let i = 0; i < jars; i++) {
        const jarMat = makeMat(i % 2 ? 0xdfe8e2 : 0xefe2c6, { roughness: 0.35 });
        place(group, cyl(0.055, 0.055, 0.18, jarMat, 12), -width / 2 + 0.22 + i * ((width - 0.44) / (jars - 1)), y + 0.12, 0.02);
        place(group, cyl(0.06, 0.06, 0.03, p.dark, 12), -width / 2 + 0.22 + i * ((width - 0.44) / (jars - 1)), y + 0.22, 0.02);
      }
    }
  }
  return group;
}

function cylind(length: number, radius: number, material: THREE.Material) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 10), material);
  mesh.rotation.z = Math.PI / 2;
  return mesh;
}

export function buildCommercialFridge(params: Params, opts: KitOptions) {
  const p = palette(opts.color, opts);
  const variant = str(params.variant, 'display');
  const width = num(params.width, variant === 'reach_in' ? 1.8 : 1.2);
  const height = num(params.height, 2.0);
  const group = new THREE.Group();
  place(group, box(width, height, 0.72, p.metal), 0, height / 2, 0);
  place(group, box(width * 0.9, height * 0.82, 0.03, p.glass), 0, height * 0.52, 0.36);
  const doors = variant === 'reach_in' ? 3 : 2;
  for (let i = 0; i <= doors; i++) place(group, box(0.04, height * 0.86, 0.06, p.dark), -width / 2 + (width / doors) * i, height * 0.52, 0.38);
  for (let shelf = 0; shelf < 4; shelf++) {
    const y = 0.3 + shelf * 0.4;
    place(group, box(width * 0.86, 0.03, 0.5, p.light), 0, y, 0.04);
    for (let i = 0; i < 5; i++) {
      place(group, cyl(0.045, 0.045, 0.16, makeMat(0x9fc7a8, { roughness: 0.4 }), 10), -width * 0.35 + i * (width * 0.17), y + 0.1, 0.06);
    }
  }
  const glow = glowPanel(width * 0.8, 0.03, '#dff4ff', opts.active ? 1.4 : 0.5);
  place(group, glow, 0, height * 0.94, 0.37);
  tagEmissive(group, [glow.material as THREE.MeshStandardMaterial]);
  return group;
}

export function buildCookingLine(params: Params, opts: KitOptions) {
  const p = palette(opts.color, opts);
  const variant = str(params.variant, 'grill');
  const group = new THREE.Group();
  if (variant === 'hood') {
    place(group, box(2.2, 0.5, 0.8, p.metal), 0, 2.2, 0);
    place(group, box(2.2, 0.9, 0.06, p.metal), 0, 2.95, -0.34);
    for (let i = 0; i < 6; i++) place(group, box(2.0, 0.02, 0.05, p.dark), 0, 2.0 - i * 0.05, 0.15 + i * 0.04);
    const light = glowPanel(1.6, 0.05, '#fff3d2', opts.active ? 1.5 : 0.4);
    place(group, light, 0, 1.98, 0.2, -Math.PI / 2, 0, 0);
  } else if (variant === 'pizza') {
    place(group, box(1.1, 1.4, 0.9, p.stone), 0, 0.7, 0);
    place(group, box(0.9, 0.8, 0.06, p.dark), 0, 1.35, 0.3);
    place(group, cyl(0.3, 0.3, 0.03, p.metal, 20), 0, 1.3, 0.32, Math.PI / 2);
    const fire = glowPanel(0.6, 0.5, '#ff8a3c', opts.active ? 1.4 : 0.2);
    place(group, fire, 0, 1.3, 0.15);
    tagEmissive(group, [fire.material as THREE.MeshStandardMaterial]);
  } else {
    place(group, box(2.0, 0.92, 0.75, p.metal), 0, 0.46, 0);
    place(group, box(1.9, 0.05, 0.7, p.dark), 0, 0.95, 0);
    const bars = variant === 'grill' ? 8 : 4;
    for (let i = 0; i < bars; i++) {
      place(group, box(1.7, 0.02, 0.02, p.metal), 0, 0.99, -0.28 + i * (0.56 / (bars - 1)));
    }
    for (let i = 0; i < 4; i++) place(group, cyl(0.055, 0.055, 0.02, p.dark, 12), -0.7 + (i % 2) * 1.4, 0.9, -0.2 + Math.floor(i / 2) * 0.4);
    for (const sx of [-1, 1]) place(group, box(0.06, 0.16, 0.06, p.metal), sx * 0.85, 0.55, 0.32);
    place(group, box(1.2, 0.05, 0.4, p.dark), 0, 0.3, 0.34);
  }
  return group;
}

export function buildDiningTable(params: Params, opts: KitOptions) {
  const p = palette(opts.color, opts);
  const variant = str(params.variant, 'restaurant');
  const width = num(params.width, 1.6);
  const depth = num(params.depth, 0.9);
  const group = new THREE.Group();
  const topY = 0.74;
  if (variant === 'cocktail' || variant === 'bottle') {
    place(group, cyl(0.28, 0.28, 0.05, p.stone, 22), 0, topY + 0.14, 0);
    place(group, cyl(0.035, 0.045, topY, p.metal, 12), 0, topY / 2, 0);
    place(group, cyl(0.26, 0.3, 0.04, p.metal, 18), 0, 0.02, 0);
    if (variant === 'bottle') {
      place(group, cyl(0.1, 0.1, 0.06, p.metal, 14), 0, topY + 0.19, 0);
      place(group, cyl(0.03, 0.04, 0.3, makeMat(0x2f4b3c, { roughness: 0.25 }), 12), 0, topY + 0.34, 0);
      for (let i = 0; i < 3; i++) {
        place(group, cyl(0.04, 0.035, 0.12, p.glass, 10), (i - 1) * 0.13, topY + 0.2, 0.08);
      }
      const sparkler = makeMat(0xfff0c0, { emissive: '#ffd77a', emissiveIntensity: opts.active ? 1.6 : 0.2, roughness: 0.4 });
      place(group, cyl(0.01, 0.01, 0.16, sparkler, 6), 0, topY + 0.5, 0);
    }
    return group;
  }
  place(group, box(width, 0.07, depth, variant === 'banquet' ? p.light : p.wood), 0, topY, 0);
  place(group, box(width - 0.1, 0.05, depth - 0.1, p.dark), 0, topY - 0.06, 0);
  if (variant === 'conference') {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) place(group, cyl(0.03, 0.035, topY - 0.08, p.metal, 10), sx * (width / 2 - 0.12), (topY - 0.08) / 2, sz * (depth / 2 - 0.12));
    for (let i = 0; i < 4; i++) {
      place(group, box(0.28, 0.02, 0.2, p.dark), -width / 2 + 0.5 + i * ((width - 1) / 3), topY + 0.05, 0);
      place(group, box(0.24, 0.15, 0.02, paintGlow(opts.color, false)), -width / 2 + 0.5 + i * ((width - 1) / 3), topY + 0.14, -0.02, -0.3, 0, 0);
    }
    place(group, box(0.5, 0.1, 0.14, p.metal), 0, topY + 0.08, 0);
  } else {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) place(group, box(0.05, topY - 0.06, 0.05, p.dark), sx * (width / 2 - 0.12), (topY - 0.06) / 2, sz * (depth / 2 - 0.12));
    if (variant === 'banquet') {
      for (let i = 0; i < 3; i++) {
        place(group, cyl(0.11, 0.09, 0.03, p.light, 16), -width / 3 + i * (width / 3), topY + 0.05, 0);
        place(group, cyl(0.015, 0.015, 0.26, p.light, 8), -width / 3 + i * (width / 3), topY + 0.15, 0);
        place(group, cyl(0.012, 0.012, 0.05, makeMat(0xffd98a, { emissive: '#ffca6a', emissiveIntensity: 1.1 }), 8), -width / 3 + i * (width / 3), topY + 0.29, 0);
      }
    } else if (variant === 'hookah') {
      place(group, cyl(0.18, 0.14, 0.06, p.metal, 16), 0, topY + 0.05, 0);
    } else if (variant === 'menu') {
      place(group, box(0.24, 0.32, 0.02, p.light), 0, topY + 0.18, 0, -0.18, 0, 0);
      place(group, box(0.2, 0.26, 0.005, paintGlow(opts.color, false)), 0, topY + 0.18, 0.012, -0.18, 0, 0);
      place(group, box(0.08, 0.05, 0.05, p.dark), 0, topY + 0.03, 0.04);
    } else {
      for (let i = 0; i < 2; i++) {
        place(group, box(0.3, 0.02, 0.4, p.light), -width / 4 + i * (width / 2), topY + 0.045, 0);
        place(group, cyl(0.04, 0.035, 0.1, p.glass, 10), -width / 4 + i * (width / 2) + 0.1, topY + 0.08, 0.08);
      }
    }
  }
  return group;
}

export function buildBoothSeating(params: Params, opts: KitOptions) {
  const p = palette(opts.color, opts);
  const variant = str(params.variant, 'restaurant');
  const width = num(params.width, 2.2);
  const depth = num(params.depth, 0.8);
  const group = new THREE.Group();
  const baseY = 0.42;
  if (variant === 'vip') {
    place(group, box(width, 0.32, depth, p.accent), 0, 0.24, 0);
    place(group, cushion(width - 0.1, 0.24, depth - 0.12, p.fabric), 0, baseY, 0.02);
    place(group, cushion(width, 1.0, 0.22, p.fabric), 0, baseY + 0.55, -depth / 2 + 0.1);
    for (const sx of [-1, 1]) place(group, cushion(0.22, 0.55, depth, p.fabric), sx * (width / 2 - 0.1), baseY + 0.18, 0.02);
    for (let i = 0; i < 3; i++) {
      const glowMat = makeMat(0x101216, { emissive: opts.color, emissiveIntensity: opts.active ? 1.5 : 0.5, roughness: 0.3 });
      place(group, cyl(0.02, 0.02, width * 0.8, glowMat, 6), 0, 0.14, -depth / 2 + 0.06, 0, 0, Math.PI / 2);
      break;
    }
    place(group, box(0.5, 0.06, 0.4, p.wood), width / 2 - 0.2, 0.5, depth / 2);
    return group;
  }
  if (variant === 'club') {
    place(group, cyl(0.42, 0.46, 0.06, p.dark, 20), 0, 0.08, 0);
    place(group, cyl(0.05, 0.05, 0.36, p.metal, 10), 0, 0.28, 0);
    const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.3, 0.16, 22, 1), p.fabric);
    place(group, seat, 0, 0.52, 0);
    const back = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.5, 22, 1, true, Math.PI * 0.15, Math.PI * 0.7), p.fabric);
    back.material.side = THREE.DoubleSide;
    place(group, back, 0, 0.8, 0);
    return group;
  }
  place(group, box(width, 0.36, depth, p.dark), 0, 0.18, 0);
  place(group, cushion(width - 0.08, 0.2, depth - 0.1, p.fabric), 0, baseY, 0.02);
  place(group, cushion(width, variant === 'hookah' ? 1.1 : 0.9, 0.2, p.fabric), 0, baseY + 0.5, -depth / 2 + 0.1);
  for (const sx of [-1, 1]) {
    place(group, box(0.14, 0.5, depth, p.primary), sx * (width / 2 - 0.07), baseY + 0.1, 0.02);
  }
  for (let i = 0; i < 3; i++) {
    place(group, box(width / 3.4, 0.12, 0.12, p.accent), -width / 3 + i * (width / 3), baseY + 0.62, -depth / 2 + 0.2, 0.12, 0, 0);
  }
  return group;
}

export function buildDjBooth(params: Params, opts: KitOptions) {
  const p = palette(opts.color, opts);
  const variant = str(params.variant, 'booth');
  const width = num(params.width, variant === 'deck' ? 1.6 : 2.4);
  const group = new THREE.Group();
  if (variant === 'deck') {
    place(group, box(width, 0.1, 0.62, p.primary), 0, 0.92, 0);
    for (const sx of [-1, 1]) place(group, box(0.08, 0.9, 0.56, p.metal), sx * (width / 2 - 0.06), 0.45, 0);
    place(group, box(width * 0.4, 0.05, 0.5, p.dark), 0, 0.99, 0);
    for (const sx of [-1, 1]) {
      place(group, cyl(0.16, 0.16, 0.035, p.dark, 24), sx * width * 0.3, 1.01, 0, 0, 0, 0);
      place(group, cyl(0.13, 0.13, 0.01, makeMat(0x16181d, { roughness: 0.3 }), 24), sx * width * 0.3, 1.03, 0);
      place(group, cyl(0.02, 0.02, 0.24, p.metal, 8), sx * width * 0.3 + 0.2, 1.02, -0.14);
    }
    for (let i = 0; i < 6; i++) {
      const knob = makeMat(0x1c1f25, { roughness: 0.4 });
      place(group, cyl(0.022, 0.022, 0.02, knob, 12), -0.12 + (i % 3) * 0.12, 1.015, 0.1 - Math.floor(i / 3) * 0.1);
    }
    for (let i = 0; i < 4; i++) place(group, box(0.04, 0.02, 0.06, paintGlow(opts.color, opts.active)), -0.15 + i * 0.1, 1.02, 0.22);
    return group;
  }
  place(group, box(width, 1.0, 0.8, p.primary), 0, 0.5, 0);
  place(group, box(width + 0.12, 0.09, 0.92, p.stone), 0, 1.04, 0);
  for (let i = 0; i < 6; i++) {
    const glow = glowPanel(width * 0.14, 0.5, opts.color, opts.active ? 1.4 : 0.5);
    place(group, glow, -width / 2 + 0.16 + i * (width / 6), 0.55, 0.41);
  }
  const screen = glowPanel(width * 0.7, 0.4, '#5ad4ff', opts.active ? 1.1 : 0.4);
  place(group, screen, 0, 1.4, -0.5, 0, 0, 0);
  place(group, box(width * 0.74, 0.46, 0.05, p.dark), 0, 1.4, -0.53);
  place(group, box(width * 0.4, 0.03, 0.03, p.metal), 0, 1.62, -0.5);
  tagEmissive(group, [screen.material as THREE.MeshStandardMaterial]);
  if (opts.active) addLight(group, new THREE.Color(opts.color).getHex(), 1.1, 6, opts);
  return group;
}

export function buildSpeaker(params: Params, opts: KitOptions) {
  const p = palette(opts.color, opts);
  const variant = str(params.variant, 'stack');
  const group = new THREE.Group();
  const driver = (radius: number, y: number, x = 0, z = 0.02) => {
    place(group, cyl(radius, radius, 0.03, p.dark, 22), x, y, z, Math.PI / 2, 0, 0);
    place(group, cyl(radius * 0.7, radius * 0.7, 0.04, makeMat(0x35383f, { roughness: 0.75 }), 20), x, y, z + 0.01, Math.PI / 2, 0, 0);
    place(group, cyl(radius * 0.22, radius * 0.22, 0.05, p.metal, 16), x, y, z + 0.02, Math.PI / 2, 0, 0);
  };
  if (variant === 'sub') {
    place(group, box(0.66, 0.66, 0.66, p.dark), 0, 0.33, 0);
    driver(0.24, 0.34);
    place(group, box(0.7, 0.04, 0.7, p.metal), 0, 0.02, 0);
  } else if (variant === 'monitor') {
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 0.42, 4), p.dark);
    place(group, body, 0, 0.24, 0, 0, Math.PI / 4, 0);
    driver(0.14, 0.3, 0, 0.18);
    place(group, cyl(0.03, 0.035, 0.2, p.metal, 8), 0, 0.52, 0);
  } else {
    const height = variant === 'stack' ? 1.5 : 0.8;
    place(group, box(0.62, height, 0.5, p.dark), 0, height / 2 + 0.04, 0);
    const count = variant === 'stack' ? 4 : 2;
    for (let i = 0; i < count; i++) driver(0.18 - i * 0.02, height - 0.2 - i * (height / (count + 0.4)), 0, 0.26);
    if (variant === 'stack') {
      place(group, box(0.66, 0.05, 0.56, p.metal), 0, height + 0.06, 0);
      place(group, box(0.6, 0.34, 0.46, p.dark), 0, height + 0.26, 0);
      driver(0.1, height + 0.26, 0, 0.24);
    }
  }
  return group;
}

export function buildMicStand(params: Params, opts: KitOptions) {
  const p = palette(opts.color, opts);
  const group = new THREE.Group();
  const height = num(params.height, 1.55);
  place(group, new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.22, 0.03, 18), p.dark), 0, 0.015, 0);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    place(group, box(0.03, 0.03, 0.34, p.metal), Math.cos(a) * 0.1, 0.03, Math.sin(a) * 0.1, 0, -a, 0);
  }
  place(group, cyl(0.016, 0.016, height, p.metal, 10), 0, height / 2, 0);
  place(group, box(0.03, 0.16, 0.03, p.dark), 0, height + 0.06, 0);
  place(group, cyl(0.025, 0.045, 0.19, makeMat(0x22252b, { roughness: 0.4, metalness: 0.5 }), 12), 0, height + 0.16, 0.015, 0.3);
  return group;
}

export function buildStageLight(params: Params, opts: KitOptions) {
  const p = palette(opts.color, opts);
  const variant = str(params.variant, 'moving_head');
  const group = new THREE.Group();
  const emissive = makeMat(0x0d0f13, {
    roughness: 0.25,
    emissive: opts.color,
    emissiveIntensity: opts.active ? 1.7 : 0.45,
  });
  // Every stage light ships on its own tripod stand so it is a complete,
  // placeable fixture instead of a head floating at rig height.
  place(group, cyl(0.2, 0.24, 0.05, p.dark, 18), 0, 0.025, 0);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    place(group, box(0.035, 0.035, 0.34, p.metal), Math.cos(a) * 0.1, 0.05, Math.sin(a) * 0.1, 0, -a, 0);
  }
  place(group, cyl(0.028, 0.032, 2.3, p.metal, 10), 0, 1.18, 0);
  if (variant === 'led_bar') {
    place(group, box(1.15, 0.05, 0.05, p.metal), 0, 2.5, 0);
    place(group, box(0.06, 0.12, 0.06, p.dark), 0, 2.44, 0);
    place(group, box(1.1, 0.12, 0.16, p.dark), 0, 2.4, 0);
    for (let i = 0; i < 10; i++) place(group, cyl(0.045, 0.045, 0.02, emissive, 14), -0.45 + i * 0.1, 2.34, 0);
    place(group, box(1.1, 0.1, 0.05, p.metal), 0, 2.5, 0);
  } else if (variant === 'laser') {
    place(group, box(0.4, 0.18, 0.3, p.dark), 0, 2.35, 0);
    for (let i = 0; i < 3; i++) {
      const beam = new THREE.Mesh(
        new THREE.ConeGeometry(0.07, 1.1, 12, 1, true),
        makeMat(0x0a0d12, { emissive: opts.color, emissiveIntensity: opts.active ? 0.9 : 0.1, opacity: 0.35, roughness: 0.4 })
      );
      place(group, beam, (i - 1) * 0.1, 1.85, 0.42, 0.35 + i * 0.12, (i - 1) * 0.4, 0);
    }
    place(group, cyl(0.035, 0.035, 0.5, p.metal, 8), 0, 2.65, 0);
  } else if (variant === 'spotlight') {
    place(group, cyl(0.09, 0.1, 0.26, p.dark, 16), 0, 2.5, 0);
    place(group, cyl(0.11, 0.08, 0.16, p.dark, 16), 0, 2.36, 0.05, 0.4);
    place(group, cyl(0.1, 0.1, 0.02, emissive, 18), 0, 2.26, 0.13, 0.4);
    place(group, box(0.06, 0.16, 0.06, p.metal), 0, 2.66, 0);
  } else {
    place(group, cyl(0.06, 0.06, 0.4, p.metal, 8), 0, 2.6, 0);
    place(group, box(0.3, 0.2, 0.24, p.dark), 0, 2.4, 0);
    place(group, box(0.32, 0.22, 0.04, p.metal), 0, 2.4, 0.12);
    place(group, cyl(0.1, 0.1, 0.02, emissive, 16), 0, 2.3, 0.14, Math.PI / 2);
    const gobo = new THREE.Mesh(
      new THREE.ConeGeometry(0.5, 2.2, 14, 1, true),
      makeMat(0x0c1016, { emissive: opts.color, emissiveIntensity: opts.active ? 0.65 : 0.08, opacity: 0.24, roughness: 0.5 })
    );
    place(group, gobo, 0, 1.2, 0.45, 0.55);
  }
  tagEmissive(group, [emissive]);
  return group;
}

export function buildLightTruss(params: Params, opts: KitOptions) {
  const p = palette(opts.color, opts);
  const length = num(params.length, 4);
  const tall = num(params.tall, 0.01);
  const group = new THREE.Group();
  const height = 4.0 * tall + 0.4;
  const y = 3.6 * tall + 0.5;
  for (const sx of [-1, 1]) {
    place(group, cyl(0.04, 0.04, length, p.metal, 8), sx * 0.2, y, 0, 0, 0, Math.PI / 2);
    place(group, cyl(0.04, 0.04, length, p.metal, 8), sx * 0.2, y + 0.4, 0, 0, 0, Math.PI / 2);
  }
  const rungs = Math.max(4, Math.round(length / 0.45));
  for (let i = 0; i < rungs; i++) {
    const x = -length / 2 + (length / rungs) * (i + 0.5);
    place(group, cyl(0.018, 0.018, 0.4, p.metal, 6), -0.2, y + 0.2, 0, 0, 0, Math.PI / 2);
    place(group, cyl(0.018, 0.018, 0.4, p.metal, 6), 0.2, y + 0.2, 0, 0, 0, Math.PI / 2);
    place(group, box(0.018, 0.5, 0.018, p.metal), x, y + 0.2, 0, 0, 0, i % 2 ? 0.7 : -0.7);
  }
  for (const sx of [-1, 1]) {
    if (tall > 0.5) {
      place(group, cyl(0.055, 0.055, height, p.metal, 10), sx * (length / 2 - 0.1), height / 2, 0);
      place(group, box(0.5, 0.06, 0.5, p.dark), sx * (length / 2 - 0.1), 0.03, 0);
    }
  }
  for (let i = 0; i < 4; i++) {
    place(group, box(0.16, 0.16, 0.2, p.dark), -length / 2 + 0.5 + i * ((length - 1) / 3), y + 0.6, 0);
    place(group, cyl(0.07, 0.07, 0.02, makeMat(0x0c1016, { emissive: opts.color, emissiveIntensity: opts.active ? 1.4 : 0.2 }), 14), -length / 2 + 0.5 + i * ((length - 1) / 3), y + 0.51, 0.05, Math.PI / 2);
  }
  return group;
}

export function buildScreenFixture(params: Params, opts: KitOptions) {
  const p = palette(opts.color, opts);
  const variant = str(params.variant, 'led_wall');
  const width = num(params.width, variant === 'projection' ? 2.6 : 3.2);
  const height = num(params.height, variant === 'projection' ? 1.5 : 1.9);
  const group = new THREE.Group();
  const y = variant === 'tv' ? 1.4 : height / 2 + 0.35;
  place(group, box(width + 0.08, height + 0.08, 0.07, p.dark), 0, y, 0);
  if (variant === 'led_wall') {
    const cols = 8;
    const rows = 5;
    for (let ix = 0; ix < cols; ix++) {
      for (let iz = 0; iz < rows; iz++) {
        const cell = makeMat(0x0a0d12, {
          roughness: 0.24,
          emissive: opts.color,
          emissiveIntensity: ((ix + iz) % 3 === 0 ? 1.2 : 0.2) * (opts.active ? 1 : 0.5),
        });
        place(group, box(width / cols - 0.012, height / rows - 0.012, 0.02, cell), -width / 2 + (width / cols) * (ix + 0.5), y - height / 2 + (height / rows) * (iz + 0.5), 0.04);
      }
    }
  } else if (variant === 'projection') {
    place(group, box(width, height, 0.02, makeMat(0xe9e6df, { roughness: 0.85 })), 0, y, 0.03);
    place(group, box(width - 0.08, height - 0.08, 0.005, paintGlow('#cfe6ff', false)), 0, y, 0.045);
    place(group, box(width + 0.14, 0.06, 0.16, p.metal), 0, y + height / 2 + 0.06, 0);
  } else {
    place(group, box(width - 0.06, height - 0.06, 0.02, paintGlow(opts.color, opts.active)), 0, y, 0.045);
  }
  if (variant === 'tv') {
    place(group, cyl(0.08, 0.09, 0.1, p.dark, 12), 0, 0.06, 0);
    place(group, box(0.3, 0.04, 0.3, p.dark), 0, 0.02, 0);
  } else {
    for (const sx of [-1, 1]) place(group, box(0.06, height + 0.1, 0.06, p.metal), sx * (width / 2 - 0.1), y, -0.04);
  }
  return group;
}

export function buildMannequin(params: Params, opts: KitOptions) {
  const p = palette(opts.color, opts);
  const group = new THREE.Group();
  const stand = makeMat(0x2a2d33, { roughness: 0.5, metalness: 0.3 });
  place(group, cyl(0.26, 0.3, 0.04, stand, 20), 0, 0.02, 0);
  place(group, cyl(0.03, 0.03, 0.6, stand, 10), 0, 0.32, 0);
  place(group, new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12), p.light), 0, 1.62, 0);
  place(group, cyl(0.03, 0.03, 0.12, p.light, 10), 0, 1.48, 0);
  place(group, cyl(0.19, 0.24, 0.52, p.light, 18), 0, 1.16, 0);
  place(group, cyl(0.24, 0.19, 0.26, p.light, 18), 0, 0.82, 0);
  place(group, box(0.26, 0.12, 0.14, p.fabric), 0, 1.24, 0.02);
  for (const sx of [-1, 1]) {
    place(group, cyl(0.045, 0.05, 0.5, p.light, 10), sx * 0.24, 1.15, 0, 0, 0, sx * 0.08);
    place(group, cyl(0.055, 0.065, 0.6, p.light, 10), sx * 0.1, 0.42, 0);
  }
  return group;
}

export function buildShoeDisplay(params: Params, opts: KitOptions) {
  const p = palette(opts.color, opts);
  const group = new THREE.Group();
  for (let tier = 0; tier < 3; tier++) {
    const y = 0.2 + tier * 0.36;
    place(group, box(1.4, 0.05, 0.42, p.wood), 0, y, 0);
    for (let i = 0; i < 3; i++) {
      const shoeMat = makeMat([0xe6e0d5, 0x2d3036, opts.color][i], { roughness: 0.55 });
      place(group, box(0.24, 0.09, 0.11, shoeMat), -0.45 + i * 0.45, y + 0.09, 0.02);
      place(group, box(0.24, 0.05, 0.11, p.light), -0.45 + i * 0.45, y + 0.03, 0.02);
    }
  }
  for (const sx of [-1, 1]) place(group, box(0.06, 1.25, 0.36, p.metal), sx * 0.68, 0.62, 0);
  return group;
}

export function buildFittingRoom(params: Params, opts: KitOptions) {
  const p = palette(opts.color, opts);
  const group = new THREE.Group();
  const width = num(params.width, 1.4);
  const depth = num(params.depth, 1.4);
  place(group, box(width, 2.3, 0.05, p.primary), 0, 1.15, -depth / 2);
  for (const sx of [-1, 1]) place(group, box(0.05, 2.3, depth, p.primary), sx * width / 2, 1.15, 0);
  place(group, box(width, 0.06, depth, p.wood), 0, 0.03, 0);
  place(group, cyl(0.02, 0.02, width, p.metal, 8), 0, 2.28, -depth / 2 + 0.08, 0, 0, Math.PI / 2);
  for (let i = 0; i < 9; i++) {
    place(group, box(width / 10, 2.2, 0.02, p.fabric), -width / 2 + 0.1 + i * (width / 9), 1.2, -depth / 2 + 0.06);
  }
  place(group, cyl(0.012, 0.012, 0.4, p.metal, 8), 0, 2.1, -depth / 2 + 0.1);
  place(group, sphere(0.035, p.metal, 10), 0, 1.9, -depth / 2 + 0.1);
  place(group, box(width * 0.4, 0.16, 0.02, p.accent), width * 0.2, 1.7, -depth / 2 + 0.06);
  return group;
}

export function buildDisplayCase(params: Params, opts: KitOptions) {
  const p = palette(opts.color, opts);
  const variant = str(params.variant, 'cannabis');
  const width = num(params.width, 1.4);
  const group = new THREE.Group();
  place(group, box(width, 0.9, 0.5, p.wood), 0, 0.45, 0);
  place(group, box(width + 0.05, 0.05, 0.55, p.stone), 0, 0.92, 0);
  for (let shelf = 0; shelf < 2; shelf++) {
    place(group, box(width - 0.1, 0.03, 0.42, p.accent), 0, 1.08 + shelf * 0.35, 0);
    for (let i = 0; i < 4; i++) {
      const jarMat = makeMat(i % 2 ? 0xd9e4d2 : 0xefe3c4, { roughness: 0.3 });
      place(group, cyl(0.06, 0.06, 0.2, jarMat, 12), -width / 2 + 0.25 + i * ((width - 0.5) / 3), 1.2 + shelf * 0.35, 0);
      place(group, cyl(0.065, 0.065, 0.025, p.dark, 12), -width / 2 + 0.25 + i * ((width - 0.5) / 3), 1.31 + shelf * 0.35, 0);
    }
  }
  place(group, box(width - 0.06, 0.6, 0.02, p.glass), 0, 1.24, 0.24);
  for (const sx of [-1, 1]) place(group, box(0.04, 0.6, 0.44, p.glass), sx * (width / 2 - 0.02), 1.24, 0);
  place(group, box(width, 0.04, 0.44, p.glass), 0, 1.55, 0);
  const glow = glowPanel(width * 0.8, 0.02, opts.color, opts.active ? 1.3 : 0.4, 'up');
  place(group, glow, 0, 0.95, 0);
  tagEmissive(group, [glow.material as THREE.MeshStandardMaterial]);
  if (variant === 'cannabis') {
    for (let i = 0; i < 3; i++) {
      place(group, box(0.16, 0.24, 0.02, paintGlow('#6ecf8e', false)), -0.28 + i * 0.28, 0.62, 0.26);
    }
  } else {
    place(group, box(width * 0.6, 0.1, 0.02, p.light), 0, 0.68, 0.26);
  }
  return group;
}

export function buildSalonStation(params: Params, opts: KitOptions) {
  const p = palette(opts.color, opts);
  const group = new THREE.Group();
  place(group, box(1.4, 0.06, 0.5, p.wood), 0, 0.82, 0);
  for (const sx of [-1, 1]) place(group, box(0.05, 0.8, 0.46, p.metal), sx * 0.64, 0.4, 0);
  place(group, box(0.9, 0.7, 0.04, p.metal), 0, 1.35, -0.24);
  place(group, box(0.84, 0.62, 0.02, p.glass), 0, 1.35, -0.21);
  const bulbs = 5;
  for (let i = 0; i < bulbs; i++) {
    place(group, sphere(0.035, makeMat(0xfff0c8, { emissive: '#ffdfa0', emissiveIntensity: opts.active ? 1.6 : 0.4 }), 8), -0.32 + i * 0.16, 1.72, -0.22);
  }
  place(group, box(0.4, 0.22, 0.3, p.dark), 0.35, 0.94, 0);
  place(group, cyl(0.02, 0.02, 0.4, p.metal, 8), 0.35, 1.2, -0.05);
  place(group, cyl(0.14, 0.12, 0.06, p.metal, 14), 0.35, 1.38, -0.05, 0, 0, 0.4);
  for (let i = 0; i < 4; i++) {
    place(group, cyl(0.03, 0.03, 0.14, makeMat([0xc75f9f, 0xe0a13c, 0x6a9ad0, 0x7bbf8a][i], { roughness: 0.4 }), 8), -0.4 + i * 0.09, 0.94, 0.14);
  }
  return group;
}

export function buildSalonChair(params: Params, opts: KitOptions) {
  const p = palette(opts.color, opts);
  const group = new THREE.Group();
  place(group, cyl(0.32, 0.36, 0.06, p.dark, 20), 0, 0.06, 0);
  place(group, cyl(0.05, 0.06, 0.4, p.metal, 12), 0, 0.26, 0);
  place(group, cushion(0.56, 0.16, 0.56, p.fabric), 0, 0.52, 0);
  place(group, cushion(0.52, 0.7, 0.14, p.fabric), 0, 0.9, -0.22);
  place(group, cushion(0.16, 0.12, 0.36, p.fabric), 0, 0.72, 0.2);
  for (const sx of [-1, 1]) place(group, box(0.06, 0.06, 0.34, p.metal), sx * 0.28, 0.62, 0.02);
  place(group, box(0.5, 0.06, 0.06, p.metal), 0, 0.18, 0.26);
  return group;
}

export function buildGymEquipment(params: Params, opts: KitOptions) {
  const p = palette(opts.color, opts);
  const variant = str(params.variant, 'rack');
  const group = new THREE.Group();
  const steel = makeMat(0x2b2f36, { roughness: 0.35, metalness: 0.6 });
  if (variant === 'treadmill') {
    place(group, box(0.8, 0.18, 1.8, steel), 0, 0.12, 0);
    place(group, box(0.7, 0.06, 1.5, makeMat(0x15171c, { roughness: 0.7 })), 0, 0.22, 0);
    for (const sx of [-1, 1]) place(group, box(0.06, 1.1, 0.06, steel), sx * 0.34, 0.7, -0.8);
    place(group, box(0.74, 0.08, 0.2, steel), 0, 1.24, -0.8);
    place(group, box(0.4, 0.24, 0.02, paintGlow('#7fd3ff', opts.active)), 0, 1.2, -0.68, -0.2);
  } else if (variant === 'bench') {
    place(group, box(0.4, 0.14, 1.3, p.fabric), 0, 0.46, 0);
    for (const sx of [-1, 1]) {
      place(group, box(0.06, 0.4, 0.06, steel), sx * 0.16, 0.2, 0.5);
      place(group, box(0.06, 0.4, 0.06, steel), sx * 0.16, 0.2, -0.5);
      place(group, box(0.06, 0.06, 0.3, steel), sx * 0.16, 0.03, 0.55);
    }
    place(group, box(0.9, 0.03, 0.03, p.metal), 0, 0.95, -0.55);
    for (const sx of [-1, 1]) place(group, cyl(0.22, 0.22, 0.06, makeMat(0x14161b, { roughness: 0.9 }), 18), sx * 0.6, 0.95, -0.55, 0, 0, Math.PI / 2);
  } else {
    place(group, box(1.4, 0.1, 0.9, steel), 0, 0.06, 0);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) place(group, box(0.07, 2.2, 0.07, steel), sx * 0.62, 1.1, sz * 0.4);
    place(group, box(1.3, 0.07, 0.07, p.metal), 0, 1.75, 0.2);
    for (const sx of [-1, 1]) {
      place(group, cyl(0.2, 0.2, 0.05, makeMat(0x15171c, { roughness: 0.9 }), 18), sx * 0.5, 1.75, 0.2, Math.PI / 2);
      place(group, box(0.08, 1.4, 0.08, steel), sx * 0.55, 0.7, -0.3);
    }
    for (let i = 0; i < 4; i++) place(group, cyl(0.24, 0.24, 0.05, i % 2 ? p.dark : p.primary, 16), -0.45 + i * 0.3, 0.14, -0.1, 0, 0, Math.PI / 2);
  }
  return group;
}

export function buildOfficeMachine(params: Params, opts: KitOptions) {
  const p = palette(opts.color, opts);
  const variant = str(params.variant, 'printer');
  const group = new THREE.Group();
  if (variant === 'pc') {
    place(group, box(0.5, 0.06, 0.5, p.dark), 0, 0.03, 0);
    place(group, box(0.22, 0.5, 0.46, p.dark), 0, 0.31, 0);
    place(group, box(0.2, 0.03, 0.44, paintGlow(opts.color, opts.active)), 0.001, 0.36, 0);
    for (let i = 0; i < 3; i++) place(group, cyl(0.05, 0.05, 0.02, p.metal, 10), 0, 0.56, -0.14 + i * 0.14, Math.PI / 2);
    for (let i = 0; i < 4; i++) place(group, box(0.44, 0.02, 0.02, makeMat(0x1b1e24, { roughness: 0.6 })), 0, 0.12 + i * 0.06, 0.23);
    place(group, box(0.7, 0.02, 0.36, p.dark), 0, 0.01, 0.36);
    place(group, box(0.6, 0.02, 0.22, p.dark), 0, 0.03, 0.3);
  } else if (variant === 'console') {
    place(group, box(0.44, 0.09, 0.3, p.light), 0, 0.07, 0);
    place(group, box(0.44, 0.09, 0.02, p.dark), 0, 0.07, 0.16);
    place(group, cyl(0.04, 0.04, 0.02, p.metal, 12), 0.14, 0.12, 0);
    for (const sx of [-1, 1]) {
      place(group, box(0.05, 0.12, 0.05, p.dark), sx * 0.2, 0.08, 0.06);
      place(group, cyl(0.035, 0.035, 0.05, p.dark, 10), sx * 0.2, 0.15, 0.06);
    }
    place(group, box(0.16, 0.26, 0.14, p.dark), 0.36, 0.13, 0.04);
    place(group, cyl(0.05, 0.05, 0.02, p.metal, 12), 0.36, 0.16, 0.11);
    place(group, cyl(0.045, 0.045, 0.02, paintGlow(opts.color, opts.active), 12), 0.36, 0.22, 0.11);
  } else if (variant === 'camera') {
    place(group, box(0.28, 0.18, 0.16, p.dark), 0, 0.09, 0);
    place(group, cyl(0.07, 0.08, 0.1, p.metal, 16), 0, 0.09, 0.12, Math.PI / 2);
    place(group, cyl(0.055, 0.055, 0.02, makeMat(0x0a1016, { roughness: 0.2 }), 16), 0, 0.09, 0.17, Math.PI / 2);
    place(group, box(0.1, 0.04, 0.02, p.light), 0, 0.18, 0);
    place(group, cyl(0.02, 0.02, 0.22, p.metal, 8), 0, 0.28, -0.04);
    place(group, box(0.26, 0.02, 0.16, p.metal), 0, 0.4, -0.04);
  } else {
    place(group, box(0.56, 0.36, 0.44, p.light), 0, 0.18, 0);
    place(group, box(0.5, 0.03, 0.32, p.dark), 0, 0.38, -0.02);
    place(group, box(0.5, 0.02, 0.1, p.metal), 0, 0.2, 0.24);
    place(group, box(0.2, 0.14, 0.02, paintGlow(opts.color, opts.active)), 0.14, 0.32, 0.23, -0.4, 0, 0);
    place(group, box(0.08, 0.05, 0.04, p.dark), -0.16, 0.4, 0);
  }
  return group;
}

export function buildHookah(params: Params, opts: KitOptions) {
  const p = palette(opts.color, opts);
  const group = new THREE.Group();
  const brass = makeMat(0xc9a65a, { roughness: 0.28, metalness: 0.8 });
  place(group, cyl(0.2, 0.24, 0.04, p.dark, 20), 0, 0.02, 0);
  const vase = new THREE.Mesh(new THREE.SphereGeometry(0.17, 20, 16), makeMat(0x8fc0c9, { roughness: 0.15, opacity: 0.65 }));
  place(group, vase, 0, 0.2, 0);
  vase.scale.set(1, 1.15, 1);
  place(group, cyl(0.05, 0.06, 0.2, brass, 14), 0, 0.42, 0);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.032, 0.6, 12), brass);
  place(group, stem, 0, 0.75, 0);
  place(group, cyl(0.11, 0.11, 0.02, brass, 18), 0, 1.06, 0);
  place(group, cyl(0.09, 0.1, 0.07, makeMat(0x2f2a26, { roughness: 0.8 }), 16), 0, 1.11, 0);
  place(group, cyl(0.036, 0.036, 0.06, brass, 12), 0, 1.17, 0);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const hose = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 1.02, 0),
      new THREE.Vector3(Math.cos(a) * 0.28, 0.86, Math.sin(a) * 0.28),
      new THREE.Vector3(Math.cos(a) * 0.42, 0.5, Math.sin(a) * 0.42),
      new THREE.Vector3(Math.cos(a) * 0.46, 0.16, Math.sin(a) * 0.46),
    ]), 14, 0.018, 6, false), makeMat(0x6b3b3b, { roughness: 0.8 }));
    group.add(hose);
    place(group, cyl(0.03, 0.026, 0.12, brass, 10), Math.cos(a) * 0.46, 0.1, Math.sin(a) * 0.46);
  }
  const coal = makeMat(0x2a1410, { emissive: '#ff6b2c', emissiveIntensity: opts.active ? 1.4 : 0.1, roughness: 0.8 });
  place(group, sphere(0.045, coal, 10), 0, 1.19, 0);
  place(group, cyl(0.13, 0.13, 0.01, p.glass, 18), 0, 1.08, 0);
  tagEmissive(group, [coal]);
  return group;
}

export function buildCoatCheck(params: Params, opts: KitOptions) {
  const p = palette(opts.color, opts);
  const width = num(params.width, 1.6);
  const group = new THREE.Group();
  place(group, box(width, 1.05, 0.5, p.primary), 0, 0.53, 0);
  place(group, box(width + 0.06, 0.05, 0.56, p.wood), 0, 1.07, 0);
  for (let i = 0; i < 5; i++) {
    place(group, cyl(0.018, 0.018, 0.44, p.metal, 8), -width / 2 + 0.2 + i * ((width - 0.4) / 4), 1.36, 0);
    place(group, box(0.14, 0.5, 0.1, makeMat(i % 2 ? 0x30343c : opts.color, { roughness: 0.9 })), -width / 2 + 0.2 + i * ((width - 0.4) / 4), 1.6, 0);
  }
  place(group, box(width, 0.05, 0.05, p.metal), 0, 1.6, -0.06);
  place(group, box(width * 0.6, 0.16, 0.02, paintGlow(opts.color, false)), 0, 0.8, 0.26);
  place(group, box(0.3, 0.06, 0.18, p.dark), width * 0.3, 1.12, 0.05);
  return group;
}

export function buildWeddingArch(params: Params, opts: KitOptions) {
  const p = palette(opts.color, opts);
  const width = num(params.width, 2.2);
  const group = new THREE.Group();
  const height = 2.5;
  for (const sx of [-1, 1]) place(group, cyl(0.06, 0.07, height, p.wood, 12), sx * width / 2, height / 2, 0);
  const flowerMat = makeMat(0xe8c9c2, { roughness: 0.85 });
  const leafMat = makeMat(0x4f7a52, { roughness: 0.9 });
  for (let i = 0; i < 10; i++) {
    const t = i / 9;
    const a = Math.PI * t;
    place(group, sphere(0.09 + (i % 3) * 0.02, i % 3 === 0 ? leafMat : flowerMat, 10), Math.cos(a) * (width / 2), height - 0.2 + Math.sin(a) * 0.5, 0);
    if (i % 2 === 0) place(group, sphere(0.05, flowerMat, 8), Math.cos(a) * (width / 2) + 0.12, height - 0.1 + Math.sin(a) * 0.5, 0.06);
  }
  for (let i = 0; i < 6; i++) {
    const sx = i % 2 ? 1 : -1;
    place(group, sphere(0.08, i % 3 === 0 ? leafMat : flowerMat, 10), sx * (width / 2 + 0.02), 0.5 + i * 0.3, 0.02);
  }
  place(group, box(width + 0.9, 0.06, 1.6, p.light), 0, 0.03, 0.4);
  place(group, box(width + 1.0, 0.02, 1.7, p.fabric), 0, 0.07, 0.4);
  return group;
}

export function buildPhotoBackdrop(params: Params, opts: KitOptions) {
  const p = palette(opts.color, opts);
  const width = num(params.width, 2.6);
  const group = new THREE.Group();
  const height = 2.4;
  for (const sx of [-1, 1]) place(group, box(0.06, height, 0.06, p.metal), sx * width / 2, height / 2, -0.4);
  place(group, cyl(0.03, 0.03, width, p.metal, 8), 0, height - 0.03, -0.4, 0, 0, Math.PI / 2);
  for (let i = 0; i < 3; i++) {
    const dropMat = makeMat([opts.color, 0x2f6f7a, 0xd8c9b0][i], { roughness: 0.92 });
    place(group, box(width / 3 - 0.02, height - 0.1, 0.02, dropMat), -width / 3 + i * (width / 3), height / 2 - 0.03, -0.38 + (i - 1) * 0.02);
  }
  if (params.neon) {
    const glow = glowPanel(width * 0.7, 0.3, opts.color, opts.active ? 1.5 : 0.4);
    place(group, glow, 0, 1.9, -0.34);
    tagEmissive(group, [glow.material as THREE.MeshStandardMaterial]);
  }
  place(group, box(width + 0.4, 0.04, 1.4, p.wood), 0, 0.02, 0.2);
  return group;
}

export function buildPodium(params: Params, opts: KitOptions) {
  const p = palette(opts.color, opts);
  const group = new THREE.Group();
  place(group, cyl(0.34, 0.38, 1.1, p.primary, 18), 0, 0.55, 0);
  place(group, cyl(0.4, 0.4, 0.05, p.wood, 20), 0, 1.12, 0, -0.15, 0, 0);
  place(group, box(0.5, 0.3, 0.03, p.dark), 0, 0.95, 0.3, -0.3, 0, 0);
  place(group, cyl(0.025, 0.025, 0.1, p.metal, 10), 0.12, 1.2, -0.05);
  place(group, sphere(0.04, p.dark, 10), 0.12, 1.28, -0.05);
  place(group, box(0.1, 0.02, 0.1, paintGlow('#ff5b5b', opts.active)), -0.1, 1.18, 0.06);
  return group;
}

export function buildLuggageCart(params: Params, opts: KitOptions) {
  const p = palette(opts.color, opts);
  const group = new THREE.Group();
  place(group, box(0.8, 0.06, 0.5, p.wood), 0, 0.34, 0);
  place(group, box(0.8, 0.5, 0.04, p.metal), 0, 0.6, -0.24);
  for (const sx of [-1, 1]) place(group, box(0.04, 0.5, 0.5, p.metal), sx * 0.38, 0.6, 0);
  place(group, cyl(0.02, 0.02, 0.9, p.metal, 8), 0.36, 0.85, 0.22);
  for (let i = 0; i < 3; i++) {
    place(group, box(0.56, 0.24, 0.34, makeMat([0x3f4f68, 0x6b4a3a, 0x2f3a33][i], { roughness: 0.7 })), 0, 0.47 + i * 0.26, 0);
    place(group, cyl(0.02, 0.02, 0.1, p.metal, 8), 0, 0.58 + i * 0.26, 0);
    for (const sx of [-1, 1]) place(group, cyl(0.07, 0.07, 0.04, p.dark, 12), sx * 0.3, 0.07, 0.18, 0, 0, Math.PI / 2);
  }
  return group;
}

export function buildArtPlinth(params: Params, opts: KitOptions) {
  const p = palette(opts.color, opts);
  const group = new THREE.Group();
  place(group, box(0.7, 0.9, 0.7, p.light), 0, 0.45, 0);
  place(group, box(0.76, 0.04, 0.76, p.light), 0, 0.92, 0);
  const variant = str(params.variant, 'sculpture');
  if (variant === 'plant') {
    place(group, cyl(0.14, 0.12, 0.3, p.primary, 14), 0, 1.1, 0);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      place(group, sphere(0.13, makeMat(0x4f7a52, { roughness: 0.9 }), 10), Math.cos(a) * 0.12, 1.36 + (i % 2) * 0.08, Math.sin(a) * 0.12);
    }
  } else if (variant === 'vase') {
    place(group, cyl(0.12, 0.18, 0.5, p.primary, 16), 0, 1.17, 0);
    place(group, cyl(0.06, 0.09, 0.12, p.primary, 14), 0, 1.46, 0);
  } else {
    const bronze = makeMat(0x8c6b44, { roughness: 0.35, metalness: 0.65 });
    place(group, torus(0.2, 0.06, bronze, 20), 0, 1.2, 0, 0.3, 0, 0);
    place(group, sphere(0.11, bronze, 14), 0, 1.55, 0);
    place(group, box(0.06, 0.3, 0.06, bronze), 0, 1.0, 0);
  }
  return group;
}

export function buildRecordingConsole(params: Params, opts: KitOptions) {
  const p = palette(opts.color, opts);
  const width = num(params.width, 2.2);
  const group = new THREE.Group();
  place(group, box(width, 0.9, 0.9, p.dark), 0, 0.45, 0);
  place(group, box(width + 0.1, 0.08, 1.0, p.primary), 0, 0.92, 0, -0.12, 0, 0);
  for (let row = 0; row < 4; row++) {
    for (let i = 0; i < 14; i++) {
      place(group, cyl(0.018, 0.018, 0.02, row === 3 ? paintGlow(opts.color, opts.active) : p.metal, 8), -width / 2 + 0.2 + i * ((width - 0.4) / 13), 0.94 + row * 0.028 - row * 0.006 * 14, 0.2 - row * 0.11);
    }
  }
  place(group, box(width * 0.3, 0.3, 0.03, paintGlow('#7fd3ff', opts.active)), 0, 1.15, -0.5);
  place(group, box(0.3, 0.05, 0.3, p.wood), width / 2 + 0.2, 0.6, 0.3);
  for (const sx of [-1, 1]) place(group, box(0.06, 0.9, 0.8, p.dark), sx * (width / 2 - 0.1), 0.45, 0);
  return group;
}

export function buildMedicalBed(params: Params, opts: KitOptions) {
  const p = palette(opts.color, opts);
  const group = new THREE.Group();
  const steel = makeMat(0xbfc4cb, { roughness: 0.3, metalness: 0.7 });
  place(group, box(0.9, 0.14, 1.9, p.light), 0, 0.66, 0);
  place(group, box(0.84, 0.1, 1.8, p.fabric), 0, 0.76, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    place(group, cyl(0.03, 0.03, 0.6, steel, 10), sx * 0.38, 0.36, sz * 0.8);
    place(group, cyl(0.07, 0.07, 0.03, p.dark, 12), sx * 0.38, 0.03, sz * 0.8);
  }
  place(group, box(0.9, 0.3, 0.05, p.primary), 0, 0.85, -0.95);
  for (const sx of [-1, 1]) place(group, box(0.06, 0.5, 1.8, steel), sx * 0.46, 0.42, 0);
  place(group, box(0.16, 0.24, 0.02, paintGlow('#7fd3ff', opts.active)), 0.2, 0.95, -0.9, -0.2);
  place(group, cyl(0.012, 0.012, 0.4, p.metal, 8), -0.3, 1.35, -0.9);
  return group;
}

export function buildPortablePartition(params: Params, opts: KitOptions) {
  const p = palette(opts.color, opts);
  const width = num(params.width, 1.8);
  const group = new THREE.Group();
  const height = 1.8;
  for (const sx of [-1, 1]) place(group, box(0.07, height, 0.07, p.metal), sx * (width / 2 - 0.035), height / 2, 0);
  place(group, box(width, 0.05, 0.05, p.metal), 0, height, 0);
  place(group, box(width, 0.05, 0.05, p.metal), 0, 0.08, 0);
  const slats = Math.max(8, Math.round(width / 0.14));
  for (let i = 0; i < slats; i++) {
    place(group, box(0.05, height - 0.2, 0.025, p.fabric), -width / 2 + 0.1 + i * ((width - 0.2) / (slats - 1)), height / 2, 0);
  }
  for (const sx of [-1, 1]) place(group, box(0.4, 0.04, 0.06, p.metal), sx * (width / 2 - 0.1), 0.01, 0.14, 0, -Math.PI / 2, 0);
  return group;
}

export function buildBarGlassware(params: Params, opts: KitOptions) {
  const p = palette(opts.color, opts);
  const group = new THREE.Group();
  place(group, box(0.5, 0.05, 0.36, p.wood), 0, 0.03, 0);
  for (let i = 0; i < 6; i++) {
    const glass = makeMat(0xd6e9ef, { roughness: 0.1, opacity: 0.55 });
    place(group, cyl(0.045, 0.035, 0.14, glass, 12), -0.2 + (i % 3) * 0.2, 0.12, -0.08 + Math.floor(i / 3) * 0.16);
    place(group, cyl(0.035, 0.035, 0.02, glass, 12), -0.2 + (i % 3) * 0.2, 0.19, -0.08 + Math.floor(i / 3) * 0.16);
  }
  place(group, cyl(0.06, 0.05, 0.16, makeMat(0xb5732f, { roughness: 0.2 }), 12), 0.18, 0.13, 0);
  return group;
}

export function buildWaitArea(params: Params, opts: KitOptions) {
  const p = palette(opts.color, opts);
  const group = new THREE.Group();
  const width = num(params.width, 1.8);
  place(group, box(width, 0.4, 0.62, p.primary), 0, 0.2, 0);
  place(group, cushion(width - 0.1, 0.14, 0.56, p.fabric), 0, 0.46, 0.02);
  place(group, cushion(width, 0.55, 0.16, p.fabric), 0, 0.7, -0.24);
  for (const sx of [-1, 1]) place(group, box(0.1, 0.3, 0.6, p.wood), sx * (width / 2 - 0.05), 0.18, 0);
  place(group, box(0.26, 0.02, 0.2, p.wood), 0, 0.62, 0.1);
  return group;
}

export function buildLightingFixtures(params: Params, opts: KitOptions) {
  const p = palette(opts.color, opts);
  const variant = str(params.variant, 'chandelier');
  const group = new THREE.Group();
  const glowMats: THREE.MeshStandardMaterial[] = [];
  if (variant === 'chandelier') {
    const brass = makeMat(0xc9a65a, { roughness: 0.28, metalness: 0.8 });
    place(group, cyl(0.03, 0.03, 0.9, brass, 8), 0, 3.1, 0);
    place(group, torus(0.36, 0.02, brass, 24), 0, 2.6, 0, Math.PI / 2);
    place(group, torus(0.22, 0.018, brass, 20), 0, 2.78, 0, Math.PI / 2);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      place(group, cyl(0.012, 0.012, 0.24, brass, 8), Math.cos(a) * 0.36, 2.72, Math.sin(a) * 0.36);
      const bulb = makeMat(0xfff2d2, { emissive: opts.color, emissiveIntensity: opts.active ? 1.7 : 0.5, roughness: 0.4 });
      glowMats.push(bulb);
      place(group, sphere(0.055, bulb, 10), Math.cos(a) * 0.36, 2.86, Math.sin(a) * 0.36);
    }
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      place(group, sphere(0.04, makeMat(0xfff2d2, { emissive: opts.color, emissiveIntensity: opts.active ? 1.5 : 0.4 }), 8), Math.cos(a) * 0.2, 2.9, Math.sin(a) * 0.2);
    }
  } else if (variant === 'pendant') {
    place(group, cyl(0.006, 0.006, 1.4, p.dark, 6), 0, 3.05, 0);
    place(group, new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.28, 20, 1, true), p.metal), 0, 2.42, 0);
    const glow = makeMat(0xfff2d2, { emissive: opts.color, emissiveIntensity: opts.active ? 1.6 : 0.5 });
    glowMats.push(glow);
    place(group, cyl(0.16, 0.16, 0.02, glow, 18), 0, 2.3, 0);
  } else if (variant === 'sconce') {
    place(group, box(0.14, 0.34, 0.05, p.metal), 0, 0, -0.02);
    place(group, cyl(0.02, 0.02, 0.2, p.metal, 8), 0, 0.06, 0.1, 0.7);
    const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.2, 16, 1, true), p.fabric);
    place(group, shade, 0, 0.2, 0.18);
    const glow = makeMat(0xfff2d2, { emissive: opts.color, emissiveIntensity: opts.active ? 1.5 : 0.4 });
    glowMats.push(glow);
    place(group, sphere(0.05, glow, 10), 0, 0.16, 0.18);
  } else {
    // LED strip: a flexible glowing ribbon with mounting clips.
    const length = num(params.length, 2);
    for (let i = 0; i < 3; i++) {
      const glow = makeMat(0x12141a, { emissive: opts.color, emissiveIntensity: opts.active ? 1.7 : 0.5, roughness: 0.3 });
      glowMats.push(glow);
      place(group, box(length, 0.03, 0.03, glow), 0, 0.4 + i * 0.3, 0);
    }
    for (let i = 0; i < 5; i++) place(group, box(0.03, 0.9, 0.04, p.dark), -length / 2 + (length / 4) * i, 0.7, -0.02);
  }
  tagEmissive(group, glowMats);
  if (opts.active) {
    addLight(group, new THREE.Color(opts.color).getHex(), 0.9, 6, opts);
    const light = group.userData.light as THREE.PointLight | undefined;
    if (light) light.position.set(0, variant === 'chandelier' ? 2.8 : 2.2, 0);
  }
  return group;
}

/** Event chairs: folding ceremony chair and upholstered banquet chair. */
export function buildEventSeating(params: Params, opts: KitOptions) {
  const p = palette(opts.color, opts);
  const variant = str(params.variant, 'folding');
  const group = new THREE.Group();
  if (variant === 'banquet') {
    place(group, cushion(0.46, 0.1, 0.46, p.fabric), 0, 0.47, 0);
    place(group, cushion(0.46, 0.55, 0.09, p.fabric), 0, 0.75, -0.19, -0.06);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      place(group, cyl(0.014, 0.018, 0.44, p.wood, 8), sx * 0.19, 0.22, sz * 0.18);
    }
    return group;
  }
  place(group, box(0.44, 0.03, 0.42, p.primary), 0, 0.45, 0);
  place(group, box(0.42, 0.42, 0.03, p.primary), 0, 0.7, -0.19, -0.08);
  for (const sx of [-1, 1]) {
    place(group, box(0.03, 0.44, 0.03, p.metal), sx * 0.19, 0.22, -0.17, 0.1);
    place(group, box(0.03, 0.44, 0.03, p.metal), sx * 0.19, 0.22, 0.17, -0.1);
    place(group, box(0.03, 0.5, 0.03, p.metal), sx * 0.19, 0.7, -0.2, 0.08);
  }
  place(group, box(0.4, 0.03, 0.03, p.metal), 0, 0.2, 0.16);
  return group;
}
