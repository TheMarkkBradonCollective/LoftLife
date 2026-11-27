import * as THREE from 'three';
import { box, cyl, makeMat, palette, place, sphere, tagEmissive, type KitOptions } from './helpers';

type Params = Record<string, any>;
const num = (v: unknown, f: number) => (typeof v === 'number' && Number.isFinite(v) ? v : f);
const str = (v: unknown, f: string) => (typeof v === 'string' ? v : f);

function wheel(group: THREE.Group, x: number, z: number, radius = 0.34, width = 0.24) {
  const tyre = makeMat(0x14161a, { roughness: 0.85 });
  const rim = makeMat(0xb8bcc2, { roughness: 0.25, metalness: 0.85 });
  const tyreMesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, width, 20), tyre);
  place(group, tyreMesh, x, radius, z, 0, 0, Math.PI / 2);
  const rimMesh = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.58, radius * 0.58, width + 0.01, 16), rim);
  place(group, rimMesh, x, radius, z, 0, 0, Math.PI / 2);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    place(group, box(0.03, radius * 1.0, 0.03, rim), x + 0.01, radius, z, a, 0, 0);
  }
}

function carLights(group: THREE.Group, width: number, length: number, opts: KitOptions) {
  const head = makeMat(0xfff6dc, { emissive: '#fff0c8', emissiveIntensity: opts.active ? 1.6 : 0.5, roughness: 0.3 });
  const tail = makeMat(0x7a1414, { emissive: '#ff3b2f', emissiveIntensity: 0.7, roughness: 0.4 });
  for (const sx of [-1, 1]) {
    place(group, box(width * 0.22, 0.1, 0.04, head), sx * width * 0.3, 0.62, length / 2 + 0.01);
    place(group, box(width * 0.2, 0.09, 0.03, tail), sx * width * 0.3, 0.62, -length / 2 - 0.01);
  }
  return [head, tail];
}

/** Road vehicles: sedan, SUV, sports, luxury, taxi, van, bus, limo, truck. */
export function buildCar(params: Params, opts: KitOptions) {
  const p = palette(opts.color, opts);
  const variant = str(params.variant, 'sedan');
  const group = new THREE.Group();
  const glass = makeMat(0x1e2a33, { roughness: 0.12, metalness: 0.35, opacity: 0.85 });
  const chrome = makeMat(0xcfd3d8, { roughness: 0.18, metalness: 0.9 });

  if (variant === 'bus') {
    const length = 6.4;
    const width = 1.8;
    place(group, box(width, 1.5, length, p.primary), 0, 1.15, 0);
    place(group, box(width - 0.06, 0.9, length - 0.5, glass), 0, 1.6, 0);
    for (let i = 0; i < 6; i++) place(group, box(0.02, 0.28, 0.82, p.light), -width / 2 + 0.02, 1.05, -2.1 + i * 0.84);
    place(group, box(width - 0.1, 0.12, length - 0.2, p.accent), 0, 0.62, 0);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) wheel(group, sx * (width / 2 - 0.08), sz * (length / 2 - 1.2), 0.44, 0.28);
    place(group, box(width * 0.5, 0.5, 0.05, glass), 0, 1.5, length / 2 + 0.01);
    place(group, box(width - 0.2, 0.16, 0.05, makeMat(0xffd54a, { roughness: 0.6 })), 0, 2.0, length / 2 - 0.2);
    place(group, box(1.2, 0.08, 1.8, p.dark), 0, 2.0, -1.2);
    return group;
  }

  const specs =
    variant === 'suv'
      ? { length: 4.6, width: 1.95, body: 0.95, cabin: 0.85, clearance: 0.3, roof: true, cabinShare: 0.62 }
      : variant === 'sports'
        ? { length: 4.4, width: 1.9, body: 0.58, cabin: 0.44, clearance: 0.14, roof: true, cabinShare: 0.4 }
        : variant === 'luxury' || variant === 'limo'
          ? { length: variant === 'limo' ? 6.2 : 5.1, width: 1.95, body: 0.72, cabin: 0.6, clearance: 0.18, roof: true, cabinShare: variant === 'limo' ? 0.55 : 0.46 }
          : variant === 'van' || variant === 'delivery'
            ? { length: 4.9, width: 1.95, body: 1.05, cabin: 0.9, clearance: 0.26, roof: false, cabinShare: 0.75 }
            : variant === 'truck'
              ? { length: 5.6, width: 2.05, body: 0.72, cabin: 0.95, clearance: 0.34, roof: false, cabinShare: 0.32 }
              : { length: 4.5, width: 1.85, body: 0.7, cabin: 0.56, clearance: 0.2, roof: true, cabinShare: 0.46 };

  const { length, width, body, cabin, clearance, cabinShare } = specs;
  const bodyY = clearance + body / 2;
  const accent = makeMat(new THREE.Color(opts.color).offsetHSL(0, 0, -0.09), { roughness: 0.32, metalness: 0.18 });
  const grille = makeMat(0x1b1e23, { roughness: 0.5, metalness: 0.35 });

  // Main body plus a narrower shoulder slab so the silhouette is not a cuboid.
  place(group, new THREE.Mesh(new THREE.BoxGeometry(width, body, length), p.primary), 0, bodyY, 0);
  place(group, new THREE.Mesh(new THREE.BoxGeometry(width + 0.03, body * 0.34, length * 0.98), accent), 0, bodyY + body * 0.4, 0);
  place(group, new THREE.Mesh(new THREE.BoxGeometry(width * 0.98, body * 0.22, length * 0.99), accent), 0, clearance + body * 0.1, 0);

  // Hood and trunk decks with a slight rake.
  const hoodLength = length * (variant === 'sports' ? 0.3 : 0.24);
  const trunkLength = length * (variant === 'suv' || variant === 'van' ? 0.06 : 0.16);
  place(group, new THREE.Mesh(new THREE.BoxGeometry(width * 0.94, body * 0.4, hoodLength), p.primary), 0, bodyY + body * 0.42, length / 2 - hoodLength / 2, -0.05);
  place(group, new THREE.Mesh(new THREE.BoxGeometry(width * 0.94, body * 0.36, trunkLength), p.primary), 0, bodyY + body * 0.4, -length / 2 + trunkLength / 2, 0.04);

  // Cabin with raked glazing in front and back and side windows.
  const cabinLength = length * cabinShare;
  const cabinY = bodyY + body / 2 + cabin / 2;
  const cabinZ = -length * 0.06;
  place(group, new THREE.Mesh(new THREE.BoxGeometry(width * 0.86, cabin, cabinLength), p.primary), 0, cabinY, cabinZ);
  const windshield = new THREE.Mesh(new THREE.BoxGeometry(width * 0.8, cabin * 0.82, 0.03), glass);
  place(group, windshield, 0, cabinY + cabin * 0.04, cabinZ + cabinLength / 2 - 0.02, -0.55);
  const rearGlass = new THREE.Mesh(new THREE.BoxGeometry(width * 0.78, cabin * 0.7, 0.03), glass);
  place(group, rearGlass, 0, cabinY + cabin * 0.04, cabinZ - cabinLength / 2 + 0.02, 0.5);
  for (const sx of [-1, 1]) {
    place(group, new THREE.Mesh(new THREE.BoxGeometry(0.02, cabin * 0.55, cabinLength * 0.78), glass), sx * (width * 0.435), cabinY + cabin * 0.06, cabinZ);
    place(group, new THREE.Mesh(new THREE.BoxGeometry(0.03, cabin * 0.72, 0.06), p.dark), sx * (width * 0.43), cabinY, cabinZ + cabinLength * 0.28);
    place(group, new THREE.Mesh(new THREE.BoxGeometry(0.04, cabin * 0.5, 0.09), p.dark), sx * (width * 0.43), cabinY + cabin * 0.05, cabinZ - cabinLength * 0.3);
  }
  place(group, new THREE.Mesh(new THREE.BoxGeometry(width * 0.8, 0.05, cabinLength * 0.9), p.primary), 0, cabinY + cabin / 2, cabinZ);

  // Wheel arches, rocker and bumpers.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const arch = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.06, 16, 1, false, 0, Math.PI), grille);
      place(group, arch, sx * (width / 2 - 0.02), clearance + 0.3, sz * length * 0.3, 0, 0, Math.PI / 2);
      place(group, new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.16), p.dark), sx * (width / 2 + 0.02), bodyY + body * 0.22, length * 0.24);
    }
    place(group, new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.12, length * 0.55), accent), sx * (width / 2), clearance + 0.12, 0);
    place(group, new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.22), p.dark), sx * (width / 2 + 0.05), cabinY + cabin * 0.1, cabinZ + cabinLength * 0.42);
  }
  place(group, new THREE.Mesh(new THREE.BoxGeometry(width * 0.94, 0.18, 0.16), grille), 0, clearance + 0.16, length / 2 + 0.02);
  place(group, new THREE.Mesh(new THREE.BoxGeometry(width * 0.94, 0.16, 0.16), grille), 0, clearance + 0.16, -length / 2 - 0.02);
  place(group, new THREE.Mesh(new THREE.BoxGeometry(width * 0.4, body * 0.2, 0.03), grille), 0, bodyY + body * 0.1, length / 2 + 0.02);
  for (let i = 0; i < 4; i++) {
    place(group, new THREE.Mesh(new THREE.BoxGeometry(width * 0.34, 0.02, 0.02), chrome), 0, bodyY + body * 0.04 + i * 0.03, length / 2 + 0.04);
  }

  // Doors seams and handles.
  for (const sx of [-1, 1]) {
    for (const sz of [-0.05, 0.5]) {
      place(group, new THREE.Mesh(new THREE.BoxGeometry(0.02, body * 0.7, 0.02), accent), sx * (width / 2 + 0.01), bodyY, sz * cabinLength);
      place(group, new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.04, 0.16), chrome), sx * (width / 2 + 0.02), bodyY + body * 0.22, sz * cabinLength + 0.1);
    }
  }

  if (specs.roof) {
    place(group, new THREE.Mesh(new THREE.BoxGeometry(width * 0.84, 0.05, cabinLength * 0.94), p.primary), 0, cabinY + cabin / 2 + 0.04, cabinZ);
    if (variant === 'luxury' || variant === 'limo') {
      place(group, new THREE.Mesh(new THREE.BoxGeometry(width * 0.6, 0.06, cabinLength * 0.5), p.dark), 0, cabinY + cabin / 2 + 0.09, cabinZ - 0.1);
    }
    if (variant === 'taxi') {
      place(group, new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.18, 0.26), makeMat(0xffd54a, { emissive: '#ffcf40', emissiveIntensity: 1.1, roughness: 0.5 })), 0, cabinY + cabin / 2 + 0.15, cabinZ + 0.1);
      place(group, new THREE.Mesh(new THREE.BoxGeometry(width * 0.94, 0.05, 0.26), p.dark), 0, bodyY + 0.02, length * 0.05);
    }
  } else {
    // Van/truck box body over the rear axle.
    const boxLength = length * 0.58;
    place(group, new THREE.Mesh(new THREE.BoxGeometry(width - 0.04, body + 0.5, boxLength), p.primary), 0, bodyY + body / 2 + 0.24, -length * 0.2);
    place(group, new THREE.Mesh(new THREE.BoxGeometry(width - 0.16, 0.28, 0.03), glass), 0, bodyY + body * 0.5, -length / 2 + 0.02);
    place(group, new THREE.Mesh(new THREE.BoxGeometry(width + 0.02, 0.06, boxLength * 0.9), accent), 0, bodyY + body + 0.5, -length * 0.2);
    if (variant === 'delivery') {
      place(group, new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.6, 1.4), makeMat(0xe8e2d6, { roughness: 0.7 })), width / 2 + 0.02, bodyY + body * 0.4, -0.4);
      place(group, new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.16, 1.2), makeMat(0xd8613c, { roughness: 0.6 })), width / 2 + 0.04, bodyY + body * 0.55, -0.4);
    }
    if (variant === 'truck') {
      for (let i = 0; i < 3; i++) {
        place(group, new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.1, boxLength * 0.92), p.accent), -width / 2 + 0.25 + i * (width - 0.5) / 2, bodyY + body + 0.24, -length * 0.2);
      }
    }
  }

  for (const sx of [-1, 1]) {
    wheel(group, sx * (width / 2 - 0.1), length * 0.3, variant === 'suv' || variant === 'truck' ? 0.4 : 0.33, 0.24);
    wheel(group, sx * (width / 2 - 0.1), -length * 0.3, variant === 'suv' || variant === 'truck' ? 0.4 : 0.33, 0.24);
  }
  carLights(group, width, length, opts);

  if (variant === 'sports') {
    place(group, new THREE.Mesh(new THREE.BoxGeometry(width * 0.78, 0.04, 0.32), chrome), 0, bodyY + body / 2 + 0.05, -length / 2 + 0.26);
    for (const sx of [-1, 1]) {
      place(group, new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.2, 0.08), chrome), sx * width * 0.3, bodyY + body / 2 + 0.14, -length / 2 + 0.42);
    }
    place(group, new THREE.Mesh(new THREE.BoxGeometry(width * 0.7, 0.05, 0.2), p.dark), 0, clearance + 0.08, length / 2 - 0.04);
  }
  return group;
}

export function buildTwoWheeler(params: Params, opts: KitOptions) {
  const p = palette(opts.color, opts);
  const variant = str(params.variant, 'motorcycle');
  const group = new THREE.Group();
  const tyre = makeMat(0x14161a, { roughness: 0.85 });
  const chrome = makeMat(0xc6cbd1, { roughness: 0.2, metalness: 0.9 });

  if (variant === 'bicycle') {
    for (const sz of [-0.55, 0.55]) {
      const wheelMesh = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.03, 8, 24), tyre);
      place(group, wheelMesh, 0, 0.36, sz);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI;
        place(group, box(0.008, 0.64, 0.008, chrome), 0, 0.36, sz, 0, 0, a);
      }
    }
    place(group, box(0.05, 0.05, 1.0, p.primary), 0, 0.62, 0);
    place(group, box(0.05, 0.48, 0.05, p.primary), 0, 0.5, -0.2, 0.4);
    place(group, box(0.05, 0.05, 0.44, p.primary), 0, 0.82, 0.36, -0.5);
    place(group, box(0.26, 0.05, 0.08, p.dark), 0, 0.92, -0.3);
    place(group, box(0.5, 0.04, 0.04, chrome), 0, 0.98, 0.52);
    place(group, cyl(0.02, 0.02, 0.24, chrome, 8), 0, 0.86, -0.52);
    return group;
  }

  wheel(group, 0, -0.72, 0.34, 0.16);
  wheel(group, 0, 0.72, 0.34, 0.16);
  place(group, box(0.34, 0.4, 0.9, p.primary), 0, 0.7, -0.05);
  place(group, box(0.28, 0.18, 0.5, p.dark), 0, 0.92, 0.12);
  place(group, box(0.4, 0.04, 0.4, p.dark), 0, 0.56, -0.55);
  place(group, cyl(0.04, 0.04, 0.9, chrome, 10), 0, 0.6, 0.55, 0.5);
  place(group, box(0.62, 0.04, 0.04, chrome), 0, 1.02, 0.62);
  for (const sx of [-1, 1]) {
    place(group, cyl(0.05, 0.05, 0.16, p.dark, 10), sx * 0.3, 0.96, 0.62, 0, 0, Math.PI / 2);
    place(group, box(0.06, 0.18, 0.3, chrome), sx * 0.14, 1.06, 0.28);
  }
  const headlight = makeMat(0xfff2c8, { emissive: '#ffe9b0', emissiveIntensity: opts.active ? 1.6 : 0.4, roughness: 0.3 });
  place(group, new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 10), headlight), 0, 0.98, 0.72);
  if (variant === 'scooter') {
    place(group, box(0.3, 0.5, 0.4, p.primary), 0, 0.72, 0.45);
    place(group, box(0.38, 0.06, 0.5, p.dark), 0, 0.5, -0.1);
    place(group, box(0.06, 0.42, 0.06, chrome), 0, 0.86, 0.5, 0.25);
  }
  tagEmissive(group, [headlight]);
  return group;
}
