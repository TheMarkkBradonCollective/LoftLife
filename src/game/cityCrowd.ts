import * as THREE from 'three';
import { CITY_LAYOUT } from './cityLayout';
import { CITY_VENUES } from './venues';
import { createAvatarRig, type AvatarRig } from './avatar';
import { createContactShadowTexture } from './textures';
import {
  assignCrowdDetail,
  createCrowd,
  crowdStats,
  recycleDistantCrowd,
  stepCrowd,
} from '../../shared/city-crowd.mjs';
import type { AvatarConfig, EmoteType } from './types';

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

/**
 * Distant crowd LOD built from the same avatar palette as the nearby rig.
 * This avoids swapping a pedestrian to an unrelated Kenney character (and a
 * different forward axis) as the player approaches. The simplified geometry
 * keeps the distant tier inexpensive while preserving skin, hair, clothing,
 * shoes and the shared +Z facing convention.
 */
function createCrowdLodAvatar(avatar: AvatarConfig): THREE.Group {
  const root = new THREE.Group();
  root.name = 'crowd-avatar-lod';
  const material = (color: string, roughness = 0.82) =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 });
  const skin = material(avatar.skinTone, 0.76);
  const hair = material(avatar.hairColor, 0.9);
  const top = material(avatar.topColor);
  const bottom = material(avatar.bottomColor);
  const shoes = material(avatar.shoeColor, 0.68);

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.36, 2, 7), top);
  torso.position.y = 1.02;
  root.add(torso);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 9, 7), skin);
  head.position.set(0, 1.48, 0.012);
  root.add(head);

  const hairCap = new THREE.Mesh(new THREE.SphereGeometry(0.124, 8, 5), hair);
  hairCap.scale.set(1.02, 0.62, 1.02);
  hairCap.position.set(0, 1.535, -0.006);
  root.add(hairCap);

  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.064, 0.28, 2, 6), bottom);
    leg.position.set(side * 0.09, 0.48, 0);
    root.add(leg);

    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.052, 0.26, 2, 6), top);
    arm.position.set(side * 0.22, 1.02, 0);
    arm.rotation.z = side * -0.08;
    root.add(arm);

    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.07, 0.22), shoes);
    shoe.position.set(side * 0.09, 0.105, 0.035);
    root.add(shoe);
  }

  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.frustumCulled = true;
  });
  root.userData.avatarLod = true;
  return root;
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
  const props = new Map<string, { group: THREE.Group }>();
  const shadowTexture = createContactShadowTexture();
  const shadowMaterial = new THREE.MeshBasicMaterial({
    map: shadowTexture,
    transparent: true,
    depthWrite: false,
    opacity: 0.32,
  });
  const shadowGeometry = new THREE.PlaneGeometry(0.9, 0.9).rotateX(-Math.PI / 2);

  function propFor(agent: CrowdAgentView) {
    let entry = props.get(agent.id);
    if (entry) return entry;

    const holder = new THREE.Group();
    holder.name = `crowd-prop-${agent.id}`;
    holder.userData.crowdAgent = agent.id;
    holder.add(createCrowdLodAvatar(agent.avatar));

    const shadow = new THREE.Mesh(shadowGeometry, shadowMaterial);
    shadow.position.y = 0.025;
    holder.add(shadow);

    entry = { group: holder };
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
      // The lightweight avatar LOD and nearby LoftLife rig share +Z forward.
      entry.group.rotation.y = agent.yaw;
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
