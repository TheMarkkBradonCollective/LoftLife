import * as THREE from 'three';

/**
 * LoftLife's material language applied to imported Kenney models.
 *
 * Kenney kits ship with flat, toy-bright materials. LoftLife's visual identity
 * is warm contemporary: chalk and greige, natural oak and smoked walnut,
 * charcoal, brushed brass and sage. This mapping keeps the imported geometry
 * but restyles its material *roles* — wood stays wood, upholstery stays fabric,
 * metal becomes an accent — so kits from different sources read as one world.
 *
 * Textured kits (city, nature, food) keep their colormap and receive only a
 * light palette tint, because replacing a whole shared texture would erase the
 * authored detail. Untextured furniture uses the role mapping directly.
 */

export const KENNEY_PALETTE = {
  chalk: '#efeae1',
  warmGreige: '#cfc3b2',
  naturalOak: '#c89e6d',
  smokedWalnut: '#684730',
  charcoal: '#3a3d44',
  brushedBrass: '#b08d57',
  sage: '#7c9a82',
  terracotta: '#b9705a',
  stone: '#e6e1d8',
  glass: '#cfe6f0',
  warmLight: '#fff1d6',
  steel: '#9aa1aa',
  chrome: '#c9ced6',
} as const;

export interface KenneyStyleOptions {
  color: string;
  styleGroup: string;
  ghost?: boolean;
  active?: boolean;
  /** Material roles that should follow the selected finish (wood/stone items). */
  tintRoles?: string[];
}

const HOME_GROUP = 'loftlife-home';

function roleFor(name: string) {
  const key = name.toLowerCase();
  if (/glass|window/.test(key)) return 'glass';
  if (/plant|leaf|foliage/.test(key)) return 'plant';
  if (/carpet|fabric|fur|cloth|cushion|upholster|leather/.test(key)) return 'fabric';
  if (/wooddark|darkwood|walnut/.test(key)) return 'woodDark';
  if (/wood|oak|timber|plank|veneer/.test(key)) return 'wood';
  if (/metaldark|metaldarker/.test(key)) return 'metalDark';
  if (/metallight|chrome/.test(key)) return 'metalLight';
  if (/metalmedium|brass|gold|copper/.test(key)) return 'metalMedium';
  if (/metal|steel|iron|aluminium|aluminum/.test(key)) return 'metal';
  if (/lamp|light|bulb|glow|emissive|screen/.test(key)) return 'lamp';
  if (/stone|marble|concrete|tile/.test(key)) return 'stone';
  if (/_default|default/.test(key)) return 'default';
  return 'other';
}

function paletteColor(role: string, options: KenneyStyleOptions): string | null {
  switch (role) {
    case 'glass':
      return KENNEY_PALETTE.glass;
    case 'plant':
      return KENNEY_PALETTE.sage;
    case 'fabric':
      return options.color;
    case 'wood':
      return options.tintRoles?.includes('wood') ? options.color : KENNEY_PALETTE.naturalOak;
    case 'woodDark':
      return options.tintRoles?.includes('wood') ? options.color : KENNEY_PALETTE.smokedWalnut;
    case 'metal':
      return KENNEY_PALETTE.steel;
    case 'metalDark':
      return KENNEY_PALETTE.charcoal;
    case 'metalLight':
      return KENNEY_PALETTE.chrome;
    case 'metalMedium':
      return KENNEY_PALETTE.brushedBrass;
    case 'lamp':
      return KENNEY_PALETTE.warmLight;
    case 'stone':
      return options.tintRoles?.includes('stone') ? options.color : KENNEY_PALETTE.stone;
    case 'default':
      return options.color;
    default:
      return null;
  }
}

/**
 * Restyle one material in place (the clone is owned by the caller).
 * Returns the material for chaining.
 */
export function styleKenneyMaterial(
  material: THREE.Material,
  options: KenneyStyleOptions
): THREE.Material {
  const standard = material as THREE.MeshStandardMaterial;
  const hasTexture = Boolean((standard as unknown as { map?: unknown }).map);
  const role = roleFor(standard.name || '');
  const palette = paletteColor(role, options);
  const home = options.styleGroup === HOME_GROUP;

  if (options.ghost) {
    standard.transparent = true;
    standard.opacity = 0.5;
    standard.depthWrite = false;
    standard.color?.set('#34d399');
    standard.emissive?.set('#064e3b');
    standard.emissiveIntensity = 0.35;
    if (standard.map) (standard as unknown as { map: THREE.Texture | null }).map = null;
    standard.needsUpdate = true;
    return standard;
  }

  if (standard.color?.isColor) {
    if (hasTexture) {
      // Preserve authored texture detail; only nudge it toward the palette.
      const tint = new THREE.Color(palette ?? options.color);
      standard.color.lerp(tint, home ? 0.22 : 0.12);
    } else if (palette) {
      // Flat furniture materials: apply the role colour directly so the whole
      // model reads as LoftLife rather than Kenney's pastel palette.
      standard.color.set(palette);
      if (role === 'fabric') {
        standard.color.lerp(new THREE.Color(options.color), 0.55);
      }
    }
  }

  if (typeof standard.roughness === 'number') {
    if (role === 'fabric') standard.roughness = Math.max(0.78, standard.roughness);
    else if (role === 'wood' || role === 'woodDark') standard.roughness = 0.52;
    else if (role === 'metal' || role === 'metalDark' || role === 'metalLight' || role === 'metalMedium') {
      standard.roughness = 0.3;
      standard.metalness = 0.78;
    } else if (role === 'glass') {
      standard.roughness = 0.08;
      standard.metalness = 0.05;
      standard.transparent = true;
      standard.opacity = 0.34;
      standard.depthWrite = false;
    }
  }

  if (role === 'lamp') {
    standard.emissive?.set(KENNEY_PALETTE.warmLight);
    standard.emissiveIntensity = options.active ? 1.4 : 0.32;
    standard.roughness = 0.4;
  }

  standard.needsUpdate = true;
  return standard;
}

/** Apply the LoftLife material language to every mesh in a cloned model. */
export function styleKenneyModel(root: THREE.Object3D, options: KenneyStyleOptions) {
  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = !options.ghost;
    mesh.receiveShadow = !options.ghost;
    mesh.frustumCulled = true;
    if (Array.isArray(mesh.material)) {
      mesh.material = mesh.material.map((material) =>
        styleKenneyMaterial(material.clone(), options)
      );
    } else if (mesh.material) {
      mesh.material = styleKenneyMaterial(mesh.material.clone(), options);
    }
  });
  return root;
}
