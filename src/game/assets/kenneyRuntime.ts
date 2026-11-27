import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { FurnitureCatalogItem } from '../types';
import { assetUrl } from './assetUrl';
import { styleKenneyModel } from './kenneyStyle';

/**
 * Runtime loader for imported Kenney GLBs.
 *
 * - one shared GLTFLoader, one in-flight promise per asset (no duplicate downloads),
 * - only requested assets are fetched: a room preloads the items it actually uses,
 * - an LRU cap keeps at most MAX_CACHE models resident,
 * - clones share geometry and receive per-instance styled materials,
 * - a version counter lets the viewport rebuild placed items when a model lands.
 *
 * Nothing in this module imports the catalog, so it can be used by the model
 * builder, the inspector and the room viewport without an import cycle.
 */

type AssetItem = Pick<FurnitureCatalogItem, 'id' | 'asset' | 'size' | 'assetFit'>;

const MAX_CACHE = 240;
const cache = new Map<string, THREE.Group>();
const pending = new Map<string, Promise<THREE.Group | null>>();
const failed = new Set<string>();
const listeners = new Set<() => void>();
let loader: GLTFLoader | null = null;
let version = 0;

function notify() {
  version += 1;
  for (const listener of listeners) listener();
}

function getLoader() {
  if (!loader) loader = new GLTFLoader();
  return loader;
}

function normalize(
  source: THREE.Group,
  meta: NonNullable<FurnitureCatalogItem['asset']>,
  fit?: [number, number]
): THREE.Group {
  const scene = source;
  scene.updateMatrixWorld(true);
  scene.scale.multiplyScalar(meta.scale || 1);
  scene.updateMatrixWorld(true);

  let bounds = new THREE.Box3().setFromObject(scene);
  let size = bounds.getSize(new THREE.Vector3());
  if (fit && size.x > 0 && size.z > 0) {
    // Replacement of an existing catalog piece: fit inside that item's
    // footprint without stretching — the aspect ratio is preserved.
    const factor = Math.min((fit[0] * 0.96) / size.x, (fit[1] * 0.96) / size.z);
    scene.scale.multiplyScalar(factor);
    scene.updateMatrixWorld(true);
    bounds = new THREE.Box3().setFromObject(scene);
    size = bounds.getSize(new THREE.Vector3());
  }

  const centre = bounds.getCenter(new THREE.Vector3());
  scene.position.x -= centre.x;
  scene.position.z -= centre.z;
  scene.position.y -= bounds.min.y;

  scene.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = true;
  });

  const wrapper = new THREE.Group();
  wrapper.add(scene);
  wrapper.updateMatrixWorld(true);
  return wrapper;
}

function touch(key: string) {
  const value = cache.get(key);
  if (!value) return null;
  cache.delete(key);
  cache.set(key, value);
  return value;
}

function request(item: AssetItem): Promise<THREE.Group | null> {
  const key = item.id;
  const existing = cache.get(key);
  if (existing) return Promise.resolve(touch(key));
  if (failed.has(key)) return Promise.resolve(null);
  const running = pending.get(key);
  if (running) return running;
  const meta = item.asset;
  if (!meta) return Promise.resolve(null);

  const promise = (async () => {
    try {
      const gltf = await getLoader().loadAsync(assetUrl(meta.path));
      const group = normalize(gltf.scene as THREE.Group, meta, item.assetFit ? item.size : undefined);
      group.userData.kenneyAsset = item.id;
      group.userData.assetSource = meta.source;
      group.userData.assetLicense = meta.license;
      cache.set(key, group);
      while (cache.size > MAX_CACHE) {
        const oldest = cache.keys().next().value;
        if (oldest === undefined) break;
        cache.delete(oldest);
      }
      notify();
      return group;
    } catch (error) {
      failed.add(key);
      console.warn(`[LoftLife] Could not load Kenney asset ${meta.path}`, error);
      notify();
      return null;
    } finally {
      pending.delete(key);
    }
  })();
  pending.set(key, promise);
  return promise;
}

/** Start loading an asset without blocking the caller. */
export function preloadKenneyAsset(item: AssetItem) {
  if (!item.asset) return Promise.resolve(null);
  return request(item);
}

export function preloadKenneyAssets(items: AssetItem[]) {
  return Promise.all(items.filter((item) => item.asset).map((item) => request(item)));
}

/**
 * A placed model, styled for its finish, or null while it is still loading.
 * Callers should mark the group pending and rebuild when `subscribe` fires.
 */
export function getKenneyAssetModel(
  item: AssetItem & { assetFit?: boolean },
  options: { color: string; isGhost?: boolean; active?: boolean }
): THREE.Group | null {
  if (!item.asset) return null;
  const base = cache.get(item.id);
  if (!base) {
    void request(item);
    return null;
  }
  touch(item.id);
  const clone = base.clone(true);
  clone.userData.catalogId = item.id;
  clone.userData.uid = undefined;
  styleKenneyModel(clone, {
    color: options.color,
    styleGroup: item.asset.styleGroup,
    ghost: options.isGhost,
    active: options.active,
    tintRoles: item.asset.tintRoles,
  });
  return clone;
}

export function isKenneyAssetLoaded(id: string) {
  return cache.has(id);
}

export function subscribeKenneyAssets(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function kenneyAssetVersion() {
  return version;
}
