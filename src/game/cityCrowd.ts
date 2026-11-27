import * as THREE from 'three';
import { CITY_LAYOUT } from './cityLayout';
import { CITY_VENUES } from './venues';
import { createAvatarRig, type AvatarRig } from './avatar';
import { createContactShadowTexture } from './textures';
import { KENNEY_BY_ID } from '../../shared/catalog/kenney-library.mjs';
import { CHARACTER_LIBRARY } from '../../shared/catalog/character-library.mjs';
import {
  assignCrowdDetail,
  createCrowd,
  crowdStats,
  recycleDistantCrowd,
  stepCrowd,
} from '../../shared/city-crowd.mjs';
import type { AvatarConfig, EmoteType } from './types';
import {
  getKenneyAssetModel,
  preloadKenneyAsset,
  subscribeKenneyAssets,
} from './assets/kenneyRuntime';

type CrowdQuality = 'high' | 'medium' | 'low';

interface CrowdAgentView {
  id: string;
  name: string;
  role: string;
  avatar: AvatarConfig;
  x: number;
  z: number;
  yaw: number;
  speed: number;
  emote: string;
  mode: string;
  seated: boolean;
  detail: 'rig' | 'prop' | 'hidden';
  active: boolean;
  distance: number;
  personalPhase: number;
  block?: { walkHeight?: number };
}

export interface CityCrowdHandles {
  group: THREE.Group;
  crowd: ReturnType<typeof createCrowd>;
  update: (elapsed: number, delta: number, playerX: number, playerZ: number) => void;
  stats: () => ReturnType<typeof crowdStats> & {
    rigs: number;
    props: number;
    quality: CrowdQuality;
  };
  setQuality: (quality: CrowdQuality) => void;
}

const CROWD_SIZE: Record<CrowdQuality, number> = { high: 50, medium: 34, low: 20 };

const RIG_POOL_LIMIT = 10;

function hashId(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Static Kenney characters used only for the distant LOD tier. */
function propPoolFor(role: string) {
  const wanted = role === 'worker' ? 'service' : 'pedestrian';
  const matching = CHARACTER_LIBRARY.items.filter((item: { npcEligible?: boolean; role: string }) => item.npcEligible && item.role === wanted);
  return matching.length ? matching : CHARACTER_LIBRARY.items.filter((item: { npcEligible?: boolean }) => item.npcEligible);
}

/**
 * A city crowd: deterministic sidewalk simulation plus two render tiers.
 *
 *  - Near agents are full LoftLife avatar rigs, so they animate, sit, talk and
 *    wave with the same rig as players.
 *  - Distant agents are static Kenney pedestrian models on a contact shadow;
 *    they cost one draw call and keep the sidewalk busy at a fraction of the
 *    cost.
 *  - The nearest rigs are capped by graphics quality. Everything else is hidden.
 *
 * The simulation itself lives in `shared/city-crowd.mjs` and is unit-tested
 * without a browser or Three.js.
 */
export function createCityCrowd(options: {
  seats?: { id: string; label: string; x: number; z: number; facingYaw: number }[];
  quality?: CrowdQuality;
  seed?: number;
} = {}): CityCrowdHandles {
  const quality = options.quality ?? 'high';
  const group = new THREE.Group();
  group.name = 'city-crowd';

  const crowd = createCrowd({
    blocks: CITY_LAYOUT.blocks,
    venues: CITY_VENUES,
    seats: options.seats ?? [],
    count: CROWD_SIZE.high,
    seed: options.seed ?? 20261127,
    center: CITY_LAYOUT.loftCenter,
    radius: 100,
  });
  crowd.quality = quality;

  const agents = crowd.agents as unknown as CrowdAgentView[];
  let lastPlayer = { x: CITY_LAYOUT.loftCenter.x, z: CITY_LAYOUT.loftCenter.z };
  const rigs = new Map<string, AvatarRig>();
  const props = new Map<string, { group: THREE.Group; assetId: string; placeholder: boolean }>();
  const shadowTexture = createContactShadowTexture();
  const shadowMaterial = new THREE.MeshBasicMaterial({
    map: shadowTexture,
    transparent: true,
    depthWrite: false,
    opacity: 0.32,
  });
  const shadowGeometry = new THREE.PlaneGeometry(0.9, 0.9).rotateX(-Math.PI / 2);

  let assetsVersion = 0;
  let knownAssetVersion = -1;
  subscribeKenneyAssets(() => {
    assetsVersion += 1;
  });

  // Warm a handful of pedestrian models so the first distant tier does not
  // appear as placeholders for long. Failures simply stay placeholders.
  const warm = new Set<string>();
  for (const agent of agents.slice(0, 12)) {
    const pool = propPoolFor(agent.role);
    if (!pool.length) continue;
    const entry = pool[hashId(agent.id) % pool.length];
    if (warm.has(entry.id)) continue;
    warm.add(entry.id);
    const source = KENNEY_BY_ID[entry.id];
    if (source) void preloadKenneyAsset(source);
  }

  function propFor(agent: CrowdAgentView) {
    let entry = props.get(agent.id);
    if (entry) return entry;
    const pool = propPoolFor(agent.role);
    if (!pool.length) return null;
    const choice = pool[hashId(agent.id) % pool.length];
    const source = KENNEY_BY_ID[choice.id];
    if (!source) return null;
    const holder = new THREE.Group();
    holder.name = `crowd-prop-${agent.id}`;
    holder.userData.crowdProp = choice.id;

    const model = getKenneyAssetModel(source, { color: choice.id.includes('blocky') ? '#efeae1' : '#e6dfd3' });
    if (model) {
      model.scale.multiplyScalar(0.96);
      holder.add(model);
    } else {
      // Cheap silhouette while the GLB is in flight (or if it never loads).
      const skin = new THREE.MeshStandardMaterial({ color: agent.avatar.skinTone, roughness: 0.7 });
      const cloth = new THREE.MeshStandardMaterial({ color: agent.avatar.topColor, roughness: 0.8 });
      const silhouette = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.6, 4, 8), cloth);
      body.position.y = 0.86;
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), skin);
      head.position.y = 1.43;
      silhouette.add(body, head);
      holder.add(silhouette);
      holder.userData.silhouette = silhouette;
    }
    const shadow = new THREE.Mesh(shadowGeometry, shadowMaterial);
    shadow.position.y = 0.025;
    holder.add(shadow);
    entry = { group: holder, assetId: choice.id, placeholder: !model };
    props.set(agent.id, entry);
    group.add(holder);
    return entry;
  }

  function removeRig(id: string) {
    const rig = rigs.get(id);
    if (!rig) return;
    group.remove(rig.root);
    rig.root.traverse((object) => {
      const mesh = object as THREE.Mesh;
      const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
      else material?.dispose();
    });
    rigs.delete(id);
  }

  function rigFor(agent: CrowdAgentView) {
    let rig = rigs.get(agent.id);
    if (rig) return rig;
    if (rigs.size >= RIG_POOL_LIMIT) {
      // Reclaim the farthest rig instead of exceeding the budget.
      let farthestId: string | null = null;
      let farthest = -1;
      for (const [id, candidate] of rigs) {
        const view = agents.find((item) => item.id === id);
        if (view && view.distance > farthest) {
          farthest = view.distance;
          farthestId = id;
        }
      }
      if (farthestId) removeRig(farthestId);
      if (rigs.size >= RIG_POOL_LIMIT) return null;
    }
    rig = createAvatarRig(agent.avatar);
    rig.root.userData.crowdAgent = agent.id;
    group.add(rig.root);
    rigs.set(agent.id, rig);
    return rig;
  }

  function syncRender(elapsed: number, delta: number) {
    const rebuilt = assetsVersion !== knownAssetVersion;
    if (rebuilt) knownAssetVersion = assetsVersion;

    for (const agent of agents) {
      const wantRig = agent.detail === 'rig';
      const wantProp = agent.detail === 'prop' && !(agent.seated && agent.mode === 'sitting');
      const ground = agent.block?.walkHeight ?? 0;
      const isMoving = agent.mode === 'walking' && agent.speed > 0.05;

      if (wantRig) {
        const existingProp = props.get(agent.id);
        if (existingProp) existingProp.group.visible = false;
        const rig = rigFor(agent);
        if (rig) {
          rig.root.visible = true;
          rig.root.position.set(agent.x, ground, agent.z);
          rig.root.rotation.y = agent.yaw;
          rig.updateAnimation(
            agent.emote as EmoteType,
            isMoving,
            elapsed + agent.personalPhase,
            delta,
            0,
            { speed: agent.speed }
          );
        }
        continue;
      }

      removeRig(agent.id);

      if (!wantProp) {
        const existing = props.get(agent.id);
        if (existing) existing.group.visible = false;
        continue;
      }

      const entry = propFor(agent);
      if (!entry) continue;
      entry.group.visible = true;
      const bob = isMoving ? Math.abs(Math.sin(elapsed * 5.4 + agent.personalPhase)) * 0.02 : 0;
      entry.group.position.set(agent.x, ground + bob, agent.z);
      // Kenney characters and the LoftLife rig both face +Z.
      entry.group.rotation.y = agent.yaw;
      if (entry.placeholder && rebuilt) {
        const source = KENNEY_BY_ID[entry.assetId];
        const model = source ? getKenneyAssetModel(source, { color: '#e6dfd3' }) : null;
        if (model) {
          model.scale.multiplyScalar(0.96);
          const silhouette = entry.group.userData.silhouette as THREE.Group | undefined;
          if (silhouette) {
            entry.group.remove(silhouette);
            silhouette.traverse((object) => {
              const mesh = object as THREE.Mesh;
              const material = mesh.material as THREE.Material | undefined;
              material?.dispose();
            });
            entry.group.userData.silhouette = undefined;
          }
          entry.group.add(model);
          entry.placeholder = false;
        }
      }
    }

    // Keep hidden props out of the draw list entirely.
    for (const [id, entry] of props) {
      const view = agents.find((agent) => agent.id === id);
      if (!view || view.detail !== 'prop' || (view.seated && view.mode === 'sitting')) {
        entry.group.visible = false;
      }
    }
  }

  let recycleTimer = 1.2;
  let lastQuality = quality;

  function relocate(moved: { id: string }[]) {
    for (const agent of moved) {
      removeRig(agent.id);
      const entry = props.get(agent.id);
      if (entry) entry.group.visible = false;
    }
  }

  function update(elapsed: number, delta: number, playerX: number, playerZ: number) {
    const player = { x: playerX, z: playerZ };
    const jump = Math.hypot(player.x - lastPlayer.x, player.z - lastPlayer.z);
    lastPlayer = player;
    stepCrowd(crowd, delta, player, { quality: lastQuality });
    // Fast travel (map, taxi, airport) puts the player hundreds of metres away.
    // Move the whole hidden population near them at once instead of trickling
    // two agents every 1.4 seconds.
    if (jump > 80) {
      relocate(recycleDistantCrowd(crowd, player, { minDistance: 70, maxMoves: crowd.agents.length, radius: 100 }));
      recycleTimer = 1.4;
    } else {
      recycleTimer -= delta;
      if (recycleTimer <= 0) {
        recycleTimer = 1.4;
        relocate(recycleDistantCrowd(crowd, player, { minDistance: 150, maxMoves: 2 }));
      }
    }
    syncRender(elapsed, delta);
  }

  function setQuality(next: CrowdQuality) {
    lastQuality = next;
    crowd.quality = next;
    // Recompute the tiers immediately with the last known player position.
    assignCrowdDetail(crowd, lastPlayer, next);
  }

  function stats() {
    return {
      ...crowdStats(crowd.agents),
      rigs: rigs.size,
      props: [...props.values()].filter((entry) => entry.group.visible).length,
      quality: lastQuality,
    };
  }

  return { group, crowd, update, stats, setQuality };
}
