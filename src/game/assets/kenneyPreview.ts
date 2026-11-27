import * as THREE from 'three';
import fs from 'node:fs';
import path from 'node:path';
import { parseGlbFile, boundsSize } from '../../../shared/kenney/glb.mjs';
import { decodePng } from '../../../shared/kenney/png.mjs';
import { styleKenneyMaterial } from './kenneyStyle';

/**
 * Node-only builder for Kenney catalog previews.
 *
 * It reads the same GLB the browser loads, resolves its relative texture,
 * applies the same LoftLife material-role mapping, and returns a THREE group
 * for the existing CPU rasterizer. No stand-in meshes and no fabricated
 * thumbnails: the PNG is rendered from the shipped asset.
 */

export interface KenneyAssetMeta {
  path: string;
  preview: string;
  kit: string;
  styleGroup: string;
  scale: number;
  bounds: [number, number, number];
  triangles: number;
  textures: string[];
  tintRoles: string[];
  license: string;
  source: string;
}

export interface KenneyItem {
  id: string;
  name: string;
  category: string;
  subcategory: string;
  layer: 'floor' | 'rug' | 'wall';
  size: [number, number];
  colors: { label: string; hex: string }[];
  defaultColor: string;
  asset: KenneyAssetMeta;
}

const textureCache = new Map<string, { width: number; height: number; rgba: Uint8Array } | null>();

function resolveTexture(glbPath: string, uri: string) {
  const absolute = path.resolve(path.dirname(glbPath), uri);
  if (textureCache.has(absolute)) return textureCache.get(absolute) ?? null;
  try {
    const decoded = decodePng(fs.readFileSync(absolute));
    textureCache.set(absolute, decoded);
    return decoded;
  } catch {
    textureCache.set(absolute, null);
    return null;
  }
}

export function buildKenneyPreviewGroup(item: KenneyItem): THREE.Group | null {
  const absolute = path.join(process.cwd(), 'public', item.asset.path.replace(/^\//, ''));
  if (!fs.existsSync(absolute)) return null;
  const parsed = parseGlbFile(absolute, fs);
  const size = boundsSize(parsed.bounds);
  // Ground planes and decals legitimately have zero height; only reject a
  // model that has no measurable extent on any axis.
  if (!size.every((value) => Number.isFinite(value) && value >= 0) || Math.max(...size) <= 0) {
    return null;
  }

  const group = new THREE.Group();
  const textureByImage = new Map<string, ReturnType<typeof decodePng>>();
  const materialCache = new Map<number, THREE.MeshStandardMaterial>();

  for (let m = 0; m < parsed.materials.length; m++) {
    const source = parsed.materials[m] ?? {};
    const pbr = source.pbrMetallicRoughness ?? {};
    const factor = pbr.baseColorFactor ?? [1, 1, 1, 1];
    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(factor[0], factor[1], factor[2]),
      roughness: typeof pbr.roughnessFactor === 'number' ? pbr.roughnessFactor : 0.72,
      metalness: typeof pbr.metallicFactor === 'number' ? pbr.metallicFactor : 0,
      side: source.doubleSided ? THREE.DoubleSide : THREE.FrontSide,
    });
    material.name = source.name ?? `material-${m}`;
    if (factor[3] < 1) {
      material.transparent = true;
      material.opacity = factor[3];
      material.depthWrite = false;
    }
    const textureIndex = pbr.baseColorTexture?.index;
    if (typeof textureIndex === 'number') {
      const texture = parsed.json.textures?.[textureIndex];
      const image = texture ? parsed.json.images?.[texture.source] : null;
      if (image?.uri) {
        let decoded = textureByImage.get(image.uri);
        if (decoded === undefined) {
          decoded = resolveTexture(absolute, image.uri);
          textureByImage.set(image.uri, decoded);
        }
        if (decoded) {
          // The rasterizer samples this plain pixel buffer; no GPU texture is
          // needed, which keeps preview generation deterministic in CI.
          (material as unknown as { map: unknown }).map = { __kenneyTexture: decoded };
        }
      }
    }
    styleKenneyMaterial(material, {
      color: item.defaultColor,
      styleGroup: item.asset.styleGroup,
      active: true,
      tintRoles: item.asset.tintRoles,
    });
    materialCache.set(m, material);
  }

  for (const mesh of parsed.meshes) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3));
    if (mesh.normals) geometry.setAttribute('normal', new THREE.BufferAttribute(mesh.normals, 3));
    if (mesh.uvs) geometry.setAttribute('uv', new THREE.BufferAttribute(mesh.uvs, 2));
    geometry.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
    const material =
      materialCache.get(mesh.materialIndex) ??
      new THREE.MeshStandardMaterial({ color: 0xcfc3b2, roughness: 0.7 });
    const three = new THREE.Mesh(geometry, material);
    three.name = mesh.name;
    group.add(three);
  }

  group.scale.setScalar(item.asset.scale);
  group.userData.kenneyId = item.id;
  group.userData.kenneyKit = item.asset.kit;
  return group;
}
