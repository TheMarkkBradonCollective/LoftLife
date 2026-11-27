import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {
  IMPORTED_FURNITURE_ASSETS,
  IMPORTED_FURNITURE_LIBRARY,
} from '../../shared/catalog/imported-furniture.mjs';
import type { PlacedItem } from './types';

interface ImportedBuildOptions {
  isGhost?: boolean;
  isSoftwareGl?: boolean;
}

interface LibraryObject {
  name?: string;
  label?: string;
  url?: string;
  license?: string;
  source?: string;
}

interface LibraryResponse {
  objects?: LibraryObject[];
}

const models = new Map<string, THREE.Group>();
let loading: Promise<number> | null = null;
let revision = 0;

function normalizeModel(
  source: THREE.Group,
  targetDimensions: [number, number, number]
): THREE.Group {
  const model = source.clone(true);
  model.updateMatrixWorld(true);

  const sourceBounds = new THREE.Box3().setFromObject(model);
  const sourceSize = sourceBounds.getSize(new THREE.Vector3());
  if (
    !Number.isFinite(sourceSize.x) ||
    !Number.isFinite(sourceSize.y) ||
    !Number.isFinite(sourceSize.z) ||
    sourceSize.x <= 0 ||
    sourceSize.y <= 0 ||
    sourceSize.z <= 0
  ) {
    throw new Error('Imported furniture model has invalid dimensions');
  }

  // Uniform scaling preserves the original artist's proportions. The model
  // fits inside its target envelope instead of being stretched to fill it.
  const scale = Math.min(
    targetDimensions[0] / sourceSize.x,
    targetDimensions[1] / sourceSize.y,
    targetDimensions[2] / sourceSize.z
  );
  model.scale.setScalar(scale);
  model.updateMatrixWorld(true);

  const fittedBounds = new THREE.Box3().setFromObject(model);
  const fittedCenter = fittedBounds.getCenter(new THREE.Vector3());
  model.position.x -= fittedCenter.x;
  model.position.z -= fittedCenter.z;
  model.position.y -= fittedBounds.min.y;

  const normalized = new THREE.Group();
  normalized.add(model);
  normalized.updateMatrixWorld(true);
  return normalized;
}

function styleMaterial(
  source: THREE.Material,
  asset: (typeof IMPORTED_FURNITURE_ASSETS)[number],
  color: string,
  isGhost: boolean
): THREE.Material {
  const material = source.clone();
  const standard = material as THREE.MeshStandardMaterial;
  const name = material.name.toLowerCase();
  const isMetal = /metal|steel|chrome|brass|iron|aluminium|aluminum/.test(name);
  const isFabric = /fabric|cloth|cushion|upholstery|leather|seat|textile/.test(name);
  const isWood = /wood|oak|walnut|timber|veneer|wooden/.test(name);

  if (standard.color?.isColor) {
    const strength = isMetal
      ? 0
      : isFabric || isWood
        ? asset.tintStrength
        : asset.tintStrength * 0.35;
    if (strength > 0) standard.color.lerp(new THREE.Color(color), strength);
  }

  if (typeof standard.roughness === 'number') {
    if (asset.finish === 'fabric' || isFabric) {
      standard.roughness = Math.max(0.72, standard.roughness);
    } else if (asset.finish === 'wood' || isWood) {
      standard.roughness = Math.max(0.42, standard.roughness);
    }
  }

  if (isGhost) {
    material.transparent = true;
    material.opacity = 0.42;
    material.depthWrite = false;
  }
  material.needsUpdate = true;
  return material;
}

function cloneForPlacement(
  source: THREE.Group,
  placed: PlacedItem,
  asset: (typeof IMPORTED_FURNITURE_ASSETS)[number],
  options: ImportedBuildOptions
): THREE.Group {
  const group = source.clone(true);
  group.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = !options.isSoftwareGl;
    mesh.receiveShadow = !options.isSoftwareGl;
    mesh.frustumCulled = true;

    const tint = placed.color || '#efeae1';
    mesh.material = Array.isArray(mesh.material)
      ? mesh.material.map((material) => styleMaterial(material, asset, tint, Boolean(options.isGhost)))
      : styleMaterial(mesh.material, asset, tint, Boolean(options.isGhost));
  });

  group.userData.uid = placed.uid;
  group.userData.catalogId = placed.catalogId;
  group.userData.active = Boolean(placed.active);
  group.userData.importedAsset = asset.slug;
  group.userData.assetSource = 'Poly Haven';
  group.userData.assetLicense = 'CC0';
  return group;
}

/**
 * Loads only the hand-picked furniture entries in our manifest. The source
 * library is checked at runtime: only exact Poly Haven + CC0 records are
 * accepted. A missing network/model entry leaves the original LoftLife model
 * in place, so the game remains playable offline.
 */
export function preloadImportedFurniture(): Promise<number> {
  if (loading) return loading;

  loading = (async () => {
    try {
      const response = await fetch(IMPORTED_FURNITURE_LIBRARY.api, {
        method: 'GET',
        mode: 'cors',
        cache: 'force-cache',
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) throw new Error(`Furniture library returned HTTP ${response.status}`);

      const payload = (await response.json()) as LibraryResponse;
      if (!Array.isArray(payload.objects)) throw new Error('Furniture library manifest is invalid');

      const approved = new Map(
        payload.objects
          .filter(
            (entry) =>
              entry.license === IMPORTED_FURNITURE_LIBRARY.license &&
              entry.source === IMPORTED_FURNITURE_LIBRARY.source &&
              typeof entry.name === 'string' &&
              typeof entry.url === 'string' &&
              entry.url.startsWith('https://')
          )
          .map((entry) => [entry.name as string, entry])
      );

      const loader = new GLTFLoader();
      let cursor = 0;
      const work = async () => {
        while (cursor < IMPORTED_FURNITURE_ASSETS.length) {
          const asset = IMPORTED_FURNITURE_ASSETS[cursor++];
          const entry = approved.get(asset.slug);
          if (!entry?.url) continue;
          try {
            const gltf = await loader.loadAsync(entry.url);
            models.set(asset.catalogId, normalizeModel(gltf.scene, asset.targetDimensions));
          } catch (error) {
            console.warn(`[LoftLife] Could not load furniture model ${asset.slug}`, error);
          }
        }
      };

      await Promise.all(Array.from({ length: 3 }, work));
      revision += 1;
      return revision;
    } catch (error) {
      console.warn('[LoftLife] External furniture library unavailable; using built-in models.', error);
      return revision;
    }
  })();

  return loading;
}

export function getImportedFurnitureRevision(): number {
  return revision;
}

/** Returns a fresh, independently tinted instance, or null for the fallback builder. */
export function buildImportedFurnitureGroup(
  placed: PlacedItem,
  options: ImportedBuildOptions = {}
): THREE.Group | null {
  const asset = IMPORTED_FURNITURE_ASSETS.find((entry) => entry.catalogId === placed.catalogId);
  if (!asset) return null;
  const source = models.get(placed.catalogId);
  if (!source) return null;
  return cloneForPlacement(source, placed, asset, options);
}
