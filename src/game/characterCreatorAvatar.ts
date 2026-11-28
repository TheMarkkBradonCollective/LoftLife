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

function makeMaterialsUnique(root: THREE.Object3D) {
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.material = Array.isArray(mesh.material)
      ? mesh.material.map((material) => material.clone())
      : mesh.material.clone();
  });
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

// CharacterCreator morphs and joint-sidecar deformation are intentionally disabled
// until their exact target names and arm/shoulder behavior are validated against the GLB.
// Applying unverified joint offsets caused visible limb distortion.
function applyBodyConfig(_root: THREE.Object3D, _config: AvatarConfig, _sidecar: null = null) {
  // Keep the source model at its authored rest pose for now.
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

function sanitizeBoneName(name: string): string {
  return String(name).replace(/\\s/g, '_').replace(/[\\[\\]\\.:/]/g, '');
}

/**
 * CharacterCreator garments are exported as independent glTF scenes. Match the
 * source viewer's binding contract: copy the body mesh transform, remap joint
 * indices by sanitized bone name, and bind with the body's bind matrix.
 *
 * Geometry must be cloned before remapping: GLTFLoader caches the source GLB,
 * and mutating its shared skinIndex buffer would corrupt every later outfit.
 */
function rebindToBody(mesh: THREE.SkinnedMesh, bodyMesh: THREE.SkinnedMesh) {
  const sourceBones = mesh.skeleton?.bones ?? [];
  const bodySkeleton = bodyMesh.skeleton;
  const byName = new Map<string, number>();
  bodySkeleton.bones.forEach((bone, index) => {
    byName.set(bone.name, index);
    byName.set(sanitizeBoneName(bone.name), index);
  });
  const remap = sourceBones.map((bone) =>
    byName.get(bone.name) ?? byName.get(sanitizeBoneName(bone.name))
  );
  if (remap.some((index) => index === undefined)) {
    const missing = sourceBones.filter((_bone, index) => remap[index] === undefined).map((bone) => bone.name);
    throw new Error(`CharacterCreator garment ${mesh.name} has bones missing from the body rig: ${missing.join(', ')}`);
  }

  mesh.geometry = mesh.geometry.clone();
  const skinIndex = mesh.geometry.getAttribute('skinIndex') as THREE.BufferAttribute;
  if (!skinIndex) throw new Error(`CharacterCreator garment ${mesh.name} has no skinIndex attribute`);
  for (let i = 0; i < skinIndex.count; i++) {
    for (let c = 0; c < skinIndex.itemSize; c++) {
      const sourceIndex = skinIndex.getComponent(i, c);
      skinIndex.setComponent(i, c, remap[sourceIndex]!);
    }
  }
  skinIndex.needsUpdate = true;

  mesh.position.copy(bodyMesh.position);
  mesh.quaternion.copy(bodyMesh.quaternion);
  mesh.scale.copy(bodyMesh.scale);
  mesh.bind(bodySkeleton, bodyMesh.bindMatrix);
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
  let wardrobeRevision = 0;
  const shadow = fallback.shadowPlane;

  const playFor = (emote: EmoteType, moving: boolean, speed = 0) => {
    if (!mixer || !clips.length) return;
    const wanted = moving ? (emote === 'run' || speed >= 2.7 ? 'run' : 'walk') : emote;
    const aliases: Record<string, string[]> = {
      idle: ['idle'], stand: ['idle'], walk: ['walk'], run: ['run'],
      sit: ['idle'], wave: ['idle'], dance: ['idle'], cheer: ['jump', 'idle'],
      talk: ['idle'], gesture: ['idle'], jump: ['jump'],
      enter_vehicle: ['idle'], exit_vehicle: ['idle'],
    };
    const terms = aliases[wanted] ?? [wanted];
    const clip = clips.find((item) => terms.some((term) => item.name.toLowerCase() === term))
      ?? clips.find((item) => terms.some((term) => item.name.toLowerCase().includes(term)))
      ?? clips.find((item) => item.name.toLowerCase().includes('idle'));
    if (!clip) return;

    const action = mixer.clipAction(clip);
    const referenceSpeed = wanted === 'run' ? 2.91 : wanted === 'walk' ? 1.3 : 1;
    action.timeScale = moving
      ? THREE.MathUtils.clamp((speed || referenceSpeed) / referenceSpeed, 0.7, 2.2)
      : 1;
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
    const revision = ++wardrobeRevision;
    const bodyMeshes: THREE.SkinnedMesh[] = [];
    target.traverse((o) => {
      const mesh = o as THREE.SkinnedMesh;
      if (mesh.isSkinnedMesh) bodyMeshes.push(mesh);
    });
    const bodyMesh = bodyMeshes[0];
    if (!bodyMesh) return;

    const previous: THREE.Object3D[] = [];
    target.traverse((object) => {
      if (object.userData.characterCreatorWearable) previous.push(object);
    });
    for (const object of previous) object.parent?.remove(object);

    const files = [...clothingFor(next), hairFor(next.hairStyle)];
    const loaded = await Promise.all(files.map(async (id) => {
      const file = id.endsWith('.glb') ? id : `clothing_${id}.glb`;
      return { file, gltf: await loadGltf(file) };
    }));
    if (disposed || modelRoot !== target || revision !== wardrobeRevision) return;

    for (const { file, gltf } of loaded) {
      const wearable = cloneSkeleton(gltf.scene) as THREE.Group;
      makeMaterialsUnique(wearable);
      wearable.name = `LoftLife_${file.replace('.glb', '')}`;

      const skinned: THREE.SkinnedMesh[] = [];
      wearable.traverse((object) => {
        const mesh = object as THREE.SkinnedMesh;
        if (mesh.isSkinnedMesh) skinned.push(mesh);
      });

      // Skinned parts are siblings of the body mesh, matching CharacterCreator's
      // own runtime. Static accessory meshes stay in their original scene group.
      for (const mesh of skinned) {
        mesh.removeFromParent();
        mesh.geometry = mesh.geometry.clone();
        mesh.userData.characterCreatorWearable = true;
        rebindToBody(mesh, bodyMesh);
        bodyMesh.parent?.add(mesh);
      }

      let hasStaticMesh = false;
      wearable.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (mesh.isMesh && !mesh.isSkinnedMesh) hasStaticMesh = true;
      });
      if (hasStaticMesh) {
        wearable.userData.characterCreatorWearable = true;
        target.add(wearable);
      }

      tintTree(wearable, next);
      for (const mesh of skinned) tintTree(mesh, next);
    }
    applyBodyConfig(target, next);
  }

  void loadGltf('base_body_anim.glb').then((gltf) => {
    if (disposed) return;
    const character = cloneSkeleton(gltf.scene) as THREE.Group;
    makeMaterialsUnique(character);
    character.name = 'LoftLife_CharacterCreator_Body';
    const bounds = new THREE.Box3().setFromObject(character);
    const size = bounds.getSize(new THREE.Vector3());
    const scale = size.y > 0 ? 1.72 / size.y : 1;
    character.scale.setScalar(scale);
    character.position.y = -bounds.min.y * scale;
    character.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) { mesh.castShadow = false; mesh.receiveShadow = false; }
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
      if (mixer) {
        playFor(emote, moving, motion?.speed ?? 0);
        mixer.update(Math.max(0, Math.min(0.05, delta)));
      } else {
        fallback.updateAnimation(emote, moving, elapsed, delta, jumpOffset, motion);
      }
    },
  };
}
