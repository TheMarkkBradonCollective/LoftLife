import * as THREE from 'three';

/**
 * Shared primitives for the expanded catalog models.
 *
 * Every catalog entry maps to a real, parametric 3D model built from these
 * helpers — no placeholder cubes and no billboards. Models stay low-poly and
 * reuse materials internally so a furnished venue keeps a sensible draw-call
 * and triangle budget on phones.
 */

export type Variant = 'primary' | 'accent' | 'dark' | 'light' | 'metal' | 'glass' | 'wood';

export interface KitOptions {
  /** Selected variant colour from the catalog item (hex string). */
  color: string;
  /** Interactive state (lights, screens, fire, taps). */
  active?: boolean;
  /** Ghost/preview placement: no lights, no emissive animation state. */
  isGhost?: boolean;
  isSoftwareGl?: boolean;
}

export const DEFAULT_KIT_OPTIONS: KitOptions = { color: '#c8bda8', active: false };

export function makeMat(
  color: string | number | THREE.Color,
  opts: { roughness?: number; metalness?: number; opacity?: number; emissive?: string | number; emissiveIntensity?: number } = {}
) {
  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(color),
    roughness: opts.roughness ?? 0.62,
    metalness: opts.metalness ?? 0.04,
  });
  if (opts.emissive !== undefined) {
    material.emissive = new THREE.Color(opts.emissive);
    material.emissiveIntensity = opts.emissiveIntensity ?? 1;
  }
  if (opts.opacity !== undefined && opts.opacity < 1) {
    material.transparent = true;
    material.opacity = opts.opacity;
    material.depthWrite = false;
  }
  return material;
}

export interface Palette {
  primary: THREE.MeshStandardMaterial;
  accent: THREE.MeshStandardMaterial;
  dark: THREE.MeshStandardMaterial;
  light: THREE.MeshStandardMaterial;
  metal: THREE.MeshStandardMaterial;
  wood: THREE.MeshStandardMaterial;
  glass: THREE.MeshStandardMaterial;
  fabric: THREE.MeshStandardMaterial;
  stone: THREE.MeshStandardMaterial;
  glow: THREE.MeshStandardMaterial;
}

export function palette(color: string, opts: KitOptions = DEFAULT_KIT_OPTIONS): Palette {
  const glow = makeMat(0x0a0a0a, {
    roughness: 0.3,
    emissive: color,
    emissiveIntensity: opts.active ? 1.6 : 0.35,
  });
  return {
    primary: makeMat(color, { roughness: 0.55 }),
    accent: makeMat(new THREE.Color(color).offsetHSL(0.02, 0.04, -0.22), { roughness: 0.45 }),
    dark: makeMat(0x24262c, { roughness: 0.42, metalness: 0.35 }),
    light: makeMat(0xf1ece2, { roughness: 0.72 }),
    metal: makeMat(0xb9bec7, { roughness: 0.26, metalness: 0.86 }),
    wood: makeMat(new THREE.Color(color).offsetHSL(-0.02, 0.1, -0.14), { roughness: 0.55 }),
    glass: makeMat(0xcfe6f0, { roughness: 0.08, metalness: 0.05, opacity: 0.34 }),
    fabric: makeMat(color, { roughness: 0.9 }),
    stone: makeMat(new THREE.Color(color).offsetHSL(0, -0.08, 0.06), { roughness: 0.55 }),
    glow,
  };
}

export function box(w: number, h: number, d: number, material: THREE.Material, bevel = 0) {
  if (bevel > 0) {
    const geometry = new THREE.BoxGeometry(w, h, d);
    return new THREE.Mesh(geometry, material);
  }
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
}

export function cyl(top: number, bottom: number, height: number, material: THREE.Material, segments = 18) {
  return new THREE.Mesh(new THREE.CylinderGeometry(top, bottom, height, segments), material);
}

export function sphere(radius: number, material: THREE.Material, segments = 14) {
  return new THREE.Mesh(new THREE.SphereGeometry(radius, segments, Math.max(8, segments - 4)), material);
}

export function torus(radius: number, tube: number, material: THREE.Material, segments = 18) {
  return new THREE.Mesh(new THREE.TorusGeometry(radius, tube, 8, segments), material);
}

export function place(
  parent: THREE.Object3D,
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
  parent.add(mesh);
  return mesh as THREE.Mesh;
}

export function legs(
  group: THREE.Group,
  material: THREE.Material,
  width: number,
  depth: number,
  height: number,
  radius = 0.03
) {
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      place(
        group,
        cyl(radius * 0.8, radius, height, material, 8),
        sx * (width / 2 - Math.min(0.09, width * 0.12)),
        height / 2,
        sz * (depth / 2 - Math.min(0.09, depth * 0.12))
      );
    }
  }
}

/** A soft emissive strip used by neon, LED and screen models. */
export function glowPanel(
  w: number,
  h: number,
  color: string,
  intensity = 1.4,
  orientation: 'front' | 'up' = 'front'
) {
  const material = makeMat(0x080a0c, {
    roughness: 0.24,
    emissive: color,
    emissiveIntensity: intensity,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
  if (orientation === 'up') mesh.rotation.x = -Math.PI / 2;
  return mesh;
}

/** Row of small cylinders used for bottle displays, buttons and lights. */
export function repeatRow(
  parent: THREE.Object3D,
  count: number,
  spacing: number,
  factory: (index: number) => THREE.Object3D,
  startX = 0,
  y = 0,
  z = 0
) {
  for (let i = 0; i < count; i++) {
    const node = factory(i);
    node.position.set(startX + (i - (count - 1) / 2) * spacing, y, z);
    parent.add(node);
  }
}

export function addLight(group: THREE.Group, color: number, intensity: number, distance: number, opts: KitOptions) {
  if (opts.isGhost || opts.isSoftwareGl) return;
  const light = new THREE.PointLight(color, intensity, distance, 1.8);
  light.position.set(0, 2.6, 0);
  group.add(light);
  group.userData.light = light;
}

/** Marks emissive materials so the renderer/animation can pulse them. */
export function tagEmissive(group: THREE.Object3D, materials: THREE.MeshStandardMaterial[]) {
  group.userData.emissiveMats = materials;
}

export function roundedRectShape(w: number, h: number, radius: number) {
  const shape = new THREE.Shape();
  const r = Math.min(radius, w / 2, h / 2);
  shape.moveTo(-w / 2 + r, -h / 2);
  shape.lineTo(w / 2 - r, -h / 2);
  shape.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
  shape.lineTo(w / 2, h / 2 - r);
  shape.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
  shape.lineTo(-w / 2 + r, h / 2);
  shape.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
  shape.lineTo(-w / 2, -h / 2 + r);
  shape.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
  return shape;
}

/** Upholstered box: main body plus piped edges, used by sofas and booths. */
export function cushion(w: number, h: number, d: number, material: THREE.Material, piping?: THREE.Material) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d, 2, 2, 2), material);
  group.add(body);
  if (piping) {
    const rim = new THREE.Mesh(new THREE.BoxGeometry(w * 1.01, h * 0.16, d * 1.01), piping);
    rim.position.y = h / 2 - h * 0.08;
    group.add(rim);
  }
  return group;
}
