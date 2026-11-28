import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { createAvatarRig as createFallbackRig, type AvatarRig } from './avatar';
import type { AvatarConfig, EmoteType } from './types';
import { assetUrl } from './assets/assetUrl';

const REV = '852e48f316b90a0937234886630e4fb4cdfd1f78';
const RAW = `https://raw.githubusercontent.com/kblood/CharacterCreator/${REV}/output`;
const loader = new GLTFLoader();
const gltfCache = new Map<string, Promise<any>>();

function loadGltf(file: string): Promise<any> {
  const local = assetUrl(`models/charactercreator/${file}`);
  const urls = [local, `${RAW}/${file}`];
  const key = urls.join('|');
  let pending = gltfCache.get(key);
  if (!pending) {
    pending = (async () => {
      let lastError: unknown;
      for (const url of urls) {
        try {
          return await new Promise((resolve, reject) => loader.load(url, resolve, undefined, reject));
        } catch (error) { lastError = error; }
      }
      throw lastError ?? new Error(`Unable to load CharacterCreator asset: ${file}`);
    })();
    gltfCache.set(key, pending);
  }
  return pending;
}

function tintMaterial(material: THREE.Material, hex: string) {
  const m = material as THREE.MeshStandardMaterial;
  if (!m.color) return;
  m.color.set(hex);
  const gain = Number(m.userData?.tint?.gain);
  if (gain > 0 && gain !== 1) m.color.multiplyScalar(gain);
}

function tintTree(root: THREE.Object3D, config: AvatarConfig) {
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      if (material.name === 'Skin') tintMaterial(material, config.skinTone);
      else if (material.name.startsWith('Hair')) tintMaterial(material, config.hairColor);
      else if (material.name === 'Iris') {
        const eyes: Record<string, string> = {
          warm_brown: '#6b4b2f', deep_brown: '#3b2418', hazel: '#7a6a35',
          green: '#3f6b4a', blue: '#3b6f9e', gray: '#6b7a86',
        };
        tintMaterial(material, eyes[config.eyeStyle ?? 'warm_brown'] ?? '#6b4b2f');
      }
    }
  });
}

function setMorph(mesh: THREE.SkinnedMesh, name: string, value: number) {
  const index = mesh.morphTargetDictionary?.[name];
  if (index !== undefined && mesh.morphTargetInfluences) mesh.morphTargetInfluences[index] = value;
}
function bipolar(mesh: THREE.SkinnedMesh, stem: string, value: number) {
  const v = THREE.MathUtils.clamp(value, -1, 1);
  setMorph(mesh, `${stem}_decr`, Math.max(0, -v));
  setMorph(mesh, `${stem}_incr`, Math.max(0, v));
}
function applyBodyConfig(root: THREE.Object3D, config: AvatarConfig) {
  const height = config.height === 'petite' ? -0.45 : config.height === 'tall' ? 0.45 : 0;
  const weight = config.build === 'slim' ? -0.45 : config.build === 'curvy' ? 0.45 : 0;
  const muscle = config.build === 'athletic' ? 0.5 : 0;
  const proportions = config.bodyPreset === 'broad' ? 0.45 : config.bodyPreset === 'soft' ? -0.2 : 0;
  root.traverse((object) => {
    const mesh = object as THREE.SkinnedMesh;
    if (!mesh.isSkinnedMesh || !mesh.morphTargetInfluences || !mesh.morphTargetDictionary) return;
    bipolar(mesh, 'height', height);
    bipolar(mesh, 'weight', weight);
    bipolar(mesh, 'muscle', muscle);
    bipolar(mesh, 'proportions', proportions);
    bipolar(mesh, 'jaw_width', config.faceShape === 'square' ? 0.5 : config.faceShape === 'heart' ? -0.45 : 0);
    bipolar(mesh, 'eye_size', config.eyeShape === 'round' ? 0.35 : config.eyeShape === 'hooded' ? -0.2 : 0);
    bipolar(mesh, 'eye_tilt', config.eyeShape === 'upturned' ? 0.45 : 0);
  });
}

function clothingFor(config: AvatarConfig): string[] {
  const top: Record<string, string> = {
    tee: 'tshirt', button_shirt: 'shirt', hoodie: 'hoodie', crop_hoodie: 'hoodie',
    blazer: 'jacket', suit: 'jacket', jacket: 'jacket', varsity: 'jacket',
    raincoat: 'trenchcoat', dress: 'dress', cardigan: 'shirt', sweater: 'shirt',
    turtleneck: 'shirt', tank: 'tshirt',
  };
  const bottom: Record<string, string> = {
    jeans: 'jeans', chinos: 'jeans', shorts: 'shorts', skirt: 'skirt',
    joggers: 'jeans', dress_pants: 'jeans', cargo: 'jeans',
  };
  const shoe = 'shoes';
  const items = [top[config.topStyle] ?? 'tshirt'];
  if (config.topStyle !== 'dress') items.push(bottom[config.bottomStyle ?? 'jeans'] ?? 'jeans');
  items.push(shoe);
  return [...new Set(items)];
}

function hairFor(style: AvatarConfig['hairStyle']): string {
  const map: Record<string, string> = {
    bob: 'hair_bob02.glb', afro: 'hair_afro01.glb', ponytail: 'hair_ponytail01.glb',
    buns: 'hair_bob01.glb', spiky: 'hair_short04.glb', long_waves: 'hair_long01.glb',
    buzz: 'hair_short02.glb', fade: 'hair_short02.glb', curls: 'hair_afro01.glb',
    locs: 'hair_braid01.glb', pixie: 'hair_short04.glb', middle_part: 'hair_long01.glb',
    top_knot: 'hair_ponytail01.glb', shoulder_waves: 'hair_long01.glb',
    braids: 'hair_braid01.glb', undercut: 'hair_short04.glb',
    curtain: 'hair_bob01.glb', sidepart: 'hair_short02.glb',
  };
  return map[style] ?? 'hair_short02.glb';
}

function rebindToBody(mesh: THREE.SkinnedMesh, bodySkeleton: THREE.Skeleton) {
  const sourceBones = mesh.skeleton?.bones ?? [];
  const byName = new Map(bodySkeleton.bones.map((bone, index) => [bone.name, index]));
  const remap = sourceBones.map((bone) => byName.get(bone.name));
  if (remap.some((index) => index === undefined)) {
    throw new Error(`CharacterCreator garment ${mesh.name} has a bone that is missing from the body rig`);
  }
  const skinIndex = mesh.geometry.getAttribute('skinIndex') as THREE.BufferAttribute;
  for (let i = 0; i < skinIndex.count; i++) {
    for (let c = 0; c < skinIndex.itemSize; c++) {
      skinIndex.setComponent(i, c, remap[skinIndex.getComponent(i, c)]!);
    }
  }
  skinIndex.needsUpdate = true;
  mesh.bind(bodySkeleton, mesh.bindMatrix);
}

export function createCharacterCreatorAvatar(config: AvatarConfig): AvatarRig {
  const fallback = createFallbackRig(config);
  const { root } = fallback;
  let disposed = false;
  let mixer: THREE.AnimationMixer | null = null;
  let currentAction: THREE.AnimationAction | null = null;
  let clips: THREE.AnimationClip[] = [];
  let modelRoot: THREE.Group | null = null;
  let currentConfig = config;
  const shadow = fallback.shadowPlane;

  const playFor = (emote: EmoteType, moving: boolean) => {
    if (!mixer || !clips.length) return;
    const wanted = moving ? (emote === 'run' ? 'run' : 'walk') : emote;
    const aliases: Record<string, string[]> = {
      idle: ['idle'], stand: ['idle'], walk: ['walk'], run: ['run'],
      sit: ['sit'], wave: ['wave'], dance: ['dance'], cheer: ['jump', 'cheer'],
      talk: ['idle'], gesture: ['idle'], jump: ['jump'],
      enter_vehicle: ['sit'], exit_vehicle: ['idle'],
    };
    const terms = aliases[wanted] ?? [wanted];
    const clip = clips.find((item) => terms.some((term) => item.name.toLowerCase().includes(term)))
      ?? clips.find((item) => item.name.toLowerCase().includes('idle'));
    if (!clip) return;
    const action = mixer.clipAction(clip);
    if (action === currentAction) return;
    action.reset().fadeIn(0.18).play();
    currentAction?.fadeOut(0.18);
    currentAction = action;
  };

  const rebuildAppearance = (next: AvatarConfig) => {
    currentConfig = next;
    fallback.rebuildAppearance(next);
    if (!modelRoot) return;
    tintTree(modelRoot, next);
    applyBodyConfig(modelRoot, next);
    void loadWearables(modelRoot, next).catch((error) => console.warn('[LoftLife] CharacterCreator wardrobe load failed:', error));
  };

  async function loadWearables(target: THREE.Group, next: AvatarConfig) {
    const bodyMesh = (() => {
      let found: THREE.SkinnedMesh | null = null;
      target.traverse((o) => { if (!found && (o as THREE.SkinnedMesh).isSkinnedMesh) found = o as THREE.SkinnedMesh; });
      return found;
    })();
    if (!bodyMesh) return;
    for (const child of [...target.children]) {
      if (child.userData.characterCreatorWearable) {
        target.remove(child);
        child.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (mesh.isMesh) {
            mesh.geometry?.dispose();
            const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            mats.forEach((m) => m.dispose());
          }
        });
      }
    }
    const files = [...clothingFor(next), hairFor(next.hairStyle)];
    const loaded = await Promise.all(files.map(async (id) => {
      const file = id.endsWith('.glb') ? id : `clothing_${id}.glb`;
      return { file, gltf: await loadGltf(file) };
    }));
    if (disposed || modelRoot !== target) return;
    for (const { file, gltf } of loaded) {
      const wearable = cloneSkeleton(gltf.scene) as THREE.Group;
      wearable.userData.characterCreatorWearable = true;
      wearable.name = `LoftLife_${file.replace('.glb', '')}`;
      wearable.traverse((o) => {
        const mesh = o as THREE.SkinnedMesh;
        if (mesh.isSkinnedMesh) rebindToBody(mesh, bodyMesh!.skeleton);
      });
      tintTree(wearable, next);
      target.add(wearable);
    }
    applyBodyConfig(target, next);
  }

  void loadGltf('base_body_anim.glb').then((gltf) => {
    if (disposed) return;
    const character = cloneSkeleton(gltf.scene) as THREE.Group;
    character.name = 'LoftLife_CharacterCreator_Body';
    const bounds = new THREE.Box3().setFromObject(character);
    const size = bounds.getSize(new THREE.Vector3());
    const scale = size.y > 0 ? 1.72 / size.y : 1;
    character.scale.setScalar(scale);
    character.position.y = -bounds.min.y * scale;
    character.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) { mesh.castShadow = true; mesh.receiveShadow = true; }
    });
    root.remove(fallback.bodyPivot);
    root.add(character);
    modelRoot = character;
    clips = gltf.animations ?? [];
    mixer = new THREE.AnimationMixer(character);
    tintTree(character, currentConfig);
    applyBodyConfig(character, currentConfig);
    playFor('idle', false);
    void loadWearables(character, currentConfig).catch((error) => console.warn('[LoftLife] CharacterCreator wearables unavailable:', error));
  }).catch((error) => {
    console.warn('[LoftLife] CharacterCreator body unavailable; using compatible fallback avatar:', error);
  });

  return {
    ...fallback,
    rebuildAppearance,
    updateAnimation(emote, moving, elapsed, delta, jumpOffset, motion) {
      fallback.updateAnimation(emote, moving, elapsed, delta, jumpOffset, motion);
      if (mixer) {
        playFor(emote, moving);
        mixer.update(Math.max(0, Math.min(0.05, delta)));
      }
    },
  };
}
