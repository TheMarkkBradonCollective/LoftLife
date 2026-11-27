import * as THREE from 'three';
import { createContactShadowTexture } from './textures';
import type { AvatarConfig, EmoteType } from './types';

export interface AvatarRig {
  root: THREE.Group;
  bodyPivot: THREE.Group;
  pelvis: THREE.Group;
  torso: THREE.Group;
  headPivot: THREE.Group;
  leftArmPivot: THREE.Group;
  rightArmPivot: THREE.Group;
  leftLegPivot: THREE.Group;
  rightLegPivot: THREE.Group;
  leftEye: THREE.Mesh;
  rightEye: THREE.Mesh;
  shadowPlane: THREE.Mesh;
  rebuildAppearance: (config: AvatarConfig) => void;
  updateAnimation: (
    emote: EmoteType,
    isMoving: boolean,
    elapsed: number,
    delta: number,
    jumpOffset: number
  ) => void;
}

const PELVIS_BASE_Y = 0.86;

// Contoured human torso Lathe profile (hip -> waist -> chest -> shoulders)
function createTorsoGeometry(): THREE.BufferGeometry {
  const pts = [
    new THREE.Vector2(0.0, 0.0),
    new THREE.Vector2(0.145, 0.01),
    new THREE.Vector2(0.155, 0.08),
    new THREE.Vector2(0.132, 0.2), // natural waist taper
    new THREE.Vector2(0.168, 0.38), // ribcage/chest
    new THREE.Vector2(0.175, 0.45), // upper chest
    new THREE.Vector2(0.125, 0.49), // shoulder slope
    new THREE.Vector2(0.06, 0.505), // collar base
    new THREE.Vector2(0.0, 0.505),
  ];
  const geo = new THREE.LatheGeometry(pts, 20);
  geo.scale(1.06, 1.0, 0.68);
  geo.computeVertexNormals();
  return geo;
}

// Sculpted trouser/leg Lathe profile (thigh -> knee -> calf -> ankle)
function createLegGeometry(): THREE.BufferGeometry {
  const pts = [
    new THREE.Vector2(0.0, -0.76),
    new THREE.Vector2(0.044, -0.75), // ankle
    new THREE.Vector2(0.056, -0.58), // calf
    new THREE.Vector2(0.054, -0.4), // knee
    new THREE.Vector2(0.074, -0.14), // mid thigh
    new THREE.Vector2(0.082, 0.0), // hip socket
    new THREE.Vector2(0.0, 0.0),
  ];
  const geo = new THREE.LatheGeometry(pts, 16);
  geo.scale(0.95, 1.0, 1.02);
  geo.computeVertexNormals();
  return geo;
}

// Contoured human head mesh with subtle jaw/cheekbones
function createSculptedHeadGeometry(): THREE.BufferGeometry {
  const geo = new THREE.SphereGeometry(0.118, 28, 24);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i);
    let y = pos.getY(i);
    let z = pos.getZ(i);

    // Elongate vertically into oval cranium + jaw
    y *= 1.18;
    // Slight front-back depth
    z *= 1.05;
    // Narrow lower half into jawline & chin
    if (y < 0) {
      const t = Math.min(1, -y / 0.135);
      x *= 1 - t * 0.34;
      if (z > 0) {
        z *= 1 - t * 0.12;
      } else {
        z *= 1 - t * 0.38;
      }
      // Subtle chin projection
      if (t > 0.55 && z > 0.03) {
        z += 0.012 * (t - 0.55);
      }
    }
    pos.setXYZ(i, x, y, z);
  }
  geo.computeVertexNormals();
  return geo;
}

const SHARED_TORSO_GEO = createTorsoGeometry();
const SHARED_LEG_GEO = createLegGeometry();
const SHARED_HEAD_GEO = createSculptedHeadGeometry();

export function createAvatarRig(initialConfig: AvatarConfig): AvatarRig {
  const root = new THREE.Group();
  const bodyPivot = new THREE.Group();
  root.add(bodyPivot);

  const pelvis = new THREE.Group();
  pelvis.position.y = PELVIS_BASE_Y;
  bodyPivot.add(pelvis);

  const torso = new THREE.Group();
  pelvis.add(torso);

  const headPivot = new THREE.Group();
  headPivot.position.y = 0.56;
  torso.add(headPivot);

  const leftArmPivot = new THREE.Group();
  leftArmPivot.position.set(-0.205, 0.455, 0);
  torso.add(leftArmPivot);

  const rightArmPivot = new THREE.Group();
  rightArmPivot.position.set(0.205, 0.455, 0);
  torso.add(rightArmPivot);

  const leftLegPivot = new THREE.Group();
  leftLegPivot.position.set(-0.092, -0.02, 0);
  pelvis.add(leftLegPivot);

  const rightLegPivot = new THREE.Group();
  rightLegPivot.position.set(0.092, -0.02, 0);
  pelvis.add(rightLegPivot);

  // Soft contact shadow directly under avatar
  const shadowPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(0.76, 0.76),
    new THREE.MeshBasicMaterial({
      map: createContactShadowTexture(),
      transparent: true,
      depthWrite: false,
      opacity: 0.5,
    })
  );
  shadowPlane.rotation.x = -Math.PI / 2;
  shadowPlane.position.y = 0.022;
  root.add(shadowPlane);

  let leftEyeRef = new THREE.Mesh();
  let rightEyeRef = new THREE.Mesh();

  function clearGroup(g: THREE.Group) {
    while (g.children.length > 0) {
      g.remove(g.children[0]);
    }
  }

  function rebuildAppearance(cfg: AvatarConfig) {
    clearGroup(torso);
    torso.add(headPivot, leftArmPivot, rightArmPivot);
    clearGroup(headPivot);
    clearGroup(leftArmPivot);
    clearGroup(rightArmPivot);
    clearGroup(leftLegPivot);
    clearGroup(rightLegPivot);

    const skinColor = new THREE.Color(cfg.skinTone);
    const makeupColors = { none: '#b06a5f', natural: '#9e4c4c', soft: '#c96f85', bold: '#8b254e' };
    const makeupStyle = cfg.makeupStyle ?? 'none';
    const lipColor = skinColor.clone().lerp(
      new THREE.Color(makeupColors[makeupStyle]),
      makeupStyle === 'bold' ? 0.58 : makeupStyle === 'soft' ? 0.46 : makeupStyle === 'natural' ? 0.36 : 0.18
    );

    const skinMat = new THREE.MeshPhysicalMaterial({
      color: skinColor,
      roughness: 0.54,
      metalness: 0.0,
      sheen: 0.2,
      sheenRoughness: 0.8,
      sheenColor: new THREE.Color('#ffd9c8'),
    });
    const hairMat = new THREE.MeshStandardMaterial({
      color: cfg.hairColor,
      roughness: 0.62,
      metalness: 0.08,
    });
    const topMat = new THREE.MeshPhysicalMaterial({
      color: cfg.topColor,
      roughness: 0.78,
      metalness: 0.02,
      sheen: 0.45,
      sheenRoughness: 0.65,
    });
    const bottomMat = new THREE.MeshStandardMaterial({
      color: cfg.bottomColor,
      roughness: 0.76,
      metalness: 0.04,
    });
    const shoeMat = new THREE.MeshStandardMaterial({
      color: cfg.shoeColor,
      roughness: 0.42,
      metalness: 0.06,
    });
    const soleMat = new THREE.MeshStandardMaterial({
      color: 0xf4f1ea,
      roughness: 0.52,
    });
    const darkMat = new THREE.MeshStandardMaterial({
      color: 0x181a20,
      roughness: 0.3,
    });
    const leatherMat = new THREE.MeshStandardMaterial({
      color: 0x242120,
      roughness: 0.4,
      metalness: 0.15,
    });

    // --- Pelvis / Waistband & Belt ---
    const hipMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.148, 0.152, 0.11, 20),
      bottomMat
    );
    hipMesh.scale.set(1.06, 1, 0.68);
    hipMesh.position.y = 0.01;
    torso.add(hipMesh);

    const belt = new THREE.Mesh(
      new THREE.CylinderGeometry(0.15, 0.15, 0.03, 20),
      leatherMat
    );
    belt.scale.set(1.07, 1, 0.69);
    belt.position.y = 0.055;
    torso.add(belt);

    const buckle = new THREE.Mesh(
      new THREE.BoxGeometry(0.044, 0.032, 0.016),
      new THREE.MeshStandardMaterial({ color: 0xd4b25a, roughness: 0.25, metalness: 0.85 })
    );
    buckle.position.set(0, 0.055, 0.108);
    torso.add(buckle);

    // --- Contoured Upper Torso ---
    const chest = new THREE.Mesh(SHARED_TORSO_GEO, topMat);
    chest.position.y = 0.045;
    torso.add(chest);

    // Style-specific tailoring
    const bottomStyle = cfg.bottomStyle ?? 'jeans';
    if (cfg.topStyle === 'hoodie' || cfg.topStyle === 'crop_hoodie') {
      const hood = new THREE.Mesh(
        new THREE.TorusGeometry(0.095, 0.036, 12, 20, Math.PI * 1.45),
        topMat
      );
      hood.rotation.x = Math.PI / 2 + 0.35;
      hood.rotation.z = -Math.PI * 0.22;
      hood.position.set(0, 0.525, -0.045);
      torso.add(hood);

      for (const dx of [-0.032, 0.032]) {
        const string = new THREE.Mesh(
          new THREE.CylinderGeometry(0.0045, 0.0045, 0.14, 6),
          soleMat
        );
        string.position.set(dx, 0.43, 0.118);
        string.rotation.x = -0.14;
        torso.add(string);
      }

      const pocket = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.11, 0.025), topMat);
      pocket.position.set(0, 0.18, 0.105);
      torso.add(pocket);
      if (cfg.topStyle === 'crop_hoodie') {
        const hem = new THREE.Mesh(new THREE.CylinderGeometry(0.158, 0.163, 0.045, 18), topMat);
        hem.scale.set(1.05, 1, 0.7);
        hem.position.y = 0.15;
        torso.add(hem);
      }
    } else if (cfg.topStyle === 'blazer' || cfg.topStyle === 'suit') {
      const innerShirt = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.06, 0.26, 12),
        soleMat
      );
      innerShirt.scale.set(1.0, 1, 0.5);
      innerShirt.position.set(0, 0.39, 0.075);
      torso.add(innerShirt);

      for (const lx of [-0.055, 0.055]) {
        const lapel = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.24, 0.02), topMat);
        lapel.position.set(lx, 0.39, 0.116);
        lapel.rotation.z = lx < 0 ? -0.18 : 0.18;
        torso.add(lapel);
      }
      if (cfg.topStyle === 'suit') {
        const tie = new THREE.Mesh(
          new THREE.CapsuleGeometry(0.013, 0.16, 4, 8),
          new THREE.MeshStandardMaterial({ color: 0x7a2632, roughness: 0.45 })
        );
        tie.position.set(0, 0.33, 0.122);
        torso.add(tie);
        for (let b = 0; b < 3; b++) {
          const button = new THREE.Mesh(
            new THREE.SphereGeometry(0.007, 8, 6),
            new THREE.MeshStandardMaterial({ color: 0x1b1d21, roughness: 0.4 })
          );
          button.position.set(0, 0.24 - b * 0.07, 0.118);
          torso.add(button);
        }
      }
    } else if (cfg.topStyle === 'turtleneck') {
      const collar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.064, 0.072, 0.085, 16),
        topMat
      );
      collar.position.set(0, 0.555, 0);
      torso.add(collar);
    } else if (cfg.topStyle === 'button_shirt') {
      for (const sx of [-1, 1]) {
        const collar = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.05, 0.025), soleMat);
        collar.position.set(sx * 0.035, 0.545, 0.092);
        collar.rotation.z = sx * 0.4;
        torso.add(collar);
      }
      const placket = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.42, 0.012), soleMat);
      placket.position.set(0, 0.35, 0.118);
      torso.add(placket);
      for (let b = 0; b < 5; b++) {
        const button = new THREE.Mesh(new THREE.SphereGeometry(0.006, 8, 6), darkMat);
        button.position.set(0, 0.5 - b * 0.075, 0.126);
        torso.add(button);
      }
      const pocket = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.055, 0.012), topMat);
      pocket.position.set(-0.07, 0.43, 0.118);
      torso.add(pocket);
    } else if (cfg.topStyle === 'sweater') {
      const collar = new THREE.Mesh(new THREE.TorusGeometry(0.062, 0.016, 10, 20), topMat);
      collar.rotation.x = Math.PI / 2;
      collar.position.set(0, 0.535, 0.005);
      torso.add(collar);
      const hem = new THREE.Mesh(new THREE.CylinderGeometry(0.155, 0.16, 0.05, 18), topMat);
      hem.scale.set(1.05, 1, 0.7);
      hem.position.y = 0.1;
      torso.add(hem);
      const weave = new THREE.Mesh(
        new THREE.CylinderGeometry(0.153, 0.16, 0.3, 18, 1, true),
        new THREE.MeshStandardMaterial({ color: cfg.topColor, roughness: 0.95, wireframe: true })
      );
      weave.scale.set(1.05, 1, 0.7);
      weave.position.y = 0.3;
      torso.add(weave);
    } else if (cfg.topStyle === 'jacket') {
      const zipper = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.38, 0.014), soleMat);
      zipper.position.set(0, 0.34, 0.12);
      torso.add(zipper);
      const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.073, 0.08, 0.06, 16), topMat);
      collar.position.set(0, 0.545, 0);
      torso.add(collar);
      for (const sx of [-1, 1]) {
        const pocket = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.07, 0.015), topMat);
        pocket.position.set(sx * 0.09, 0.23, 0.115);
        torso.add(pocket);
      }
    } else if (cfg.topStyle === 'tank') {
      for (const sx of [-1, 1]) {
        const strap = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.14, 0.02), topMat);
        strap.position.set(sx * 0.075, 0.49, 0.06);
        strap.rotation.z = sx * 0.12;
        torso.add(strap);
      }
    } else if (cfg.topStyle === 'varsity') {
      const stripeMat = new THREE.MeshStandardMaterial({ color: 0xe7e0d2, roughness: 0.7 });
      const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.074, 0.078, 0.045, 16), stripeMat);
      collar.position.set(0, 0.55, 0);
      torso.add(collar);
      for (const sx of [-1, 1]) {
        const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.046, 0.04, 0.035, 12), stripeMat);
        stripe.position.set(sx * 0.205, 0.44, 0);
        torso.add(stripe);
      }
    } else if (cfg.topStyle === 'raincoat') {
      const hood = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.045, 10, 20, Math.PI * 1.4), topMat);
      hood.rotation.x = Math.PI / 2 + 0.4;
      hood.position.set(0, 0.53, -0.05);
      torso.add(hood);
      const stormFlap = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.3, 0.015), soleMat);
      stormFlap.position.set(0.05, 0.34, 0.122);
      torso.add(stormFlap);
      const beltMat = new THREE.MeshStandardMaterial({ color: 0x24272d, roughness: 0.4 });
      const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.158, 0.16, 0.035, 18), beltMat);
      belt.scale.set(1.05, 1, 0.7);
      belt.position.y = 0.12;
      torso.add(belt);
    } else if (cfg.topStyle === 'dress') {
      for (const sx of [-1, 1]) {
        const strap = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.13, 0.02), topMat);
        strap.position.set(sx * 0.075, 0.49, 0.055);
        torso.add(strap);
      }
    } else if (cfg.topStyle === 'cardigan') {
      const placket = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.36, 0.014), soleMat);
      placket.position.set(0, 0.34, 0.12);
      torso.add(placket);
      for (let b = 0; b < 4; b++) {
        const button = new THREE.Mesh(new THREE.SphereGeometry(0.0065, 8, 6), darkMat);
        button.position.set(0, 0.47 - b * 0.075, 0.126);
        torso.add(button);
      }
      for (const sx of [-1, 1]) {
        const pocket = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.06, 0.012), topMat);
        pocket.position.set(sx * 0.085, 0.22, 0.116);
        torso.add(pocket);
      }
    }

    // Neck
    const neck = new THREE.Mesh(
      new THREE.CylinderGeometry(0.052, 0.058, 0.095, 14),
      skinMat
    );
    neck.position.set(0, 0.555, 0.004);
    torso.add(neck);

    // --- Articulated Arms (Shoulder -> Upper Arm -> Forearm -> Sculpted Hand) ---
    const buildArm = (pivot: THREE.Group, side: number) => {
      // Shoulder cap
      const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.052, 12, 12), topMat);
      shoulder.scale.set(0.95, 0.9, 0.9);
      pivot.add(shoulder);

      const longSleeve = !['tee', 'tank', 'dress'].includes(cfg.topStyle);
      const upperLen = 0.24;
      const upperArm = new THREE.Mesh(
        new THREE.CylinderGeometry(0.046, 0.039, upperLen, 14),
        topMat
      );
      upperArm.position.y = -upperLen / 2;
      pivot.add(upperArm);

      const forearmLen = 0.23;
      const forearm = new THREE.Mesh(
        new THREE.CylinderGeometry(0.038, 0.03, forearmLen, 14),
        longSleeve ? topMat : skinMat
      );
      forearm.position.set(side * 0.004, -upperLen - forearmLen / 2 + 0.015, 0.014);
      forearm.rotation.x = -0.1;
      pivot.add(forearm);

      if (longSleeve) {
        const cuff = new THREE.Mesh(
          new THREE.CylinderGeometry(0.033, 0.032, 0.025, 12),
          topMat
        );
        cuff.position.set(side * 0.005, -0.445, 0.024);
        pivot.add(cuff);
      }

      // Contoured hand + thumb
      const hand = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.088, 0.054), skinMat);
      hand.position.set(side * 0.006, -0.5, 0.03);
      hand.rotation.x = -0.1;
      pivot.add(hand);

      const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.01, 0.026, 4, 8), skinMat);
      thumb.position.set(-side * 0.014, -0.485, 0.056);
      thumb.rotation.x = 0.55;
      pivot.add(thumb);
    };
    buildArm(leftArmPivot, -1);
    buildArm(rightArmPivot, 1);

    // --- Articulated Legs & Realistic Low-Top Sneakers ---
    const buildLeg = (pivot: THREE.Group) => {
      const legMesh = new THREE.Mesh(SHARED_LEG_GEO, bottomMat);
      pivot.add(legMesh);

      // Ankle sock peek
      const ankle = new THREE.Mesh(
        new THREE.CylinderGeometry(0.041, 0.04, 0.05, 14),
        soleMat
      );
      ankle.position.set(0, -0.765, 0);
      pivot.add(ankle);

      // Sculpted Sneaker Group at foot
      const shoeGroup = new THREE.Group();
      shoeGroup.position.set(0, -0.805, 0.038);

      // Outsole
      const sole = new THREE.Mesh(new THREE.BoxGeometry(0.096, 0.024, 0.215), soleMat);
      sole.position.set(0, -0.022, 0);
      shoeGroup.add(sole);

      // Mid-upper
      const upper = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.052, 0.195), shoeMat);
      upper.position.set(0, 0.014, -0.004);
      shoeGroup.add(upper);

      // Rounded Toe Cap
      const toeCap = new THREE.Mesh(
        new THREE.SphereGeometry(0.046, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55),
        shoeMat
      );
      toeCap.scale.set(0.98, 0.62, 1.32);
      toeCap.position.set(0, -0.006, 0.068);
      shoeGroup.add(toeCap);

      // Lace tongue
      const tongue = new THREE.Mesh(new THREE.BoxGeometry(0.056, 0.024, 0.085), soleMat);
      tongue.position.set(0, 0.042, 0.022);
      tongue.rotation.x = 0.35;
      shoeGroup.add(tongue);

      pivot.add(shoeGroup);
    };
    buildLeg(leftLegPivot);
    buildLeg(rightLegPivot);

    // --- Bottoms: silhouette differences layered over the shared leg mesh ---
    if (bottomStyle === 'skirt' || cfg.topStyle === 'dress') {
      const skirtMat = cfg.topStyle === 'dress' ? topMat : bottomMat;
      const skirt = new THREE.Mesh(
        new THREE.CylinderGeometry(0.17, 0.3, cfg.topStyle === 'dress' ? 0.58 : 0.4, 20, 1, true),
        skirtMat
      );
      skirt.scale.set(1.06, 1, 0.72);
      skirt.position.y = cfg.topStyle === 'dress' ? -0.24 : -0.15;
      pelvis.add(skirt);
      const waist = new THREE.Mesh(new THREE.CylinderGeometry(0.153, 0.158, 0.035, 18), skirtMat);
      waist.scale.set(1.06, 1, 0.7);
      waist.position.y = 0.02;
      pelvis.add(waist);
    }
    if (bottomStyle === 'shorts') {
      for (const legPivot of [leftLegPivot, rightLegPivot]) {
        const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.083, 0.088, 0.24, 14), bottomMat);
        cuff.position.y = -0.23;
        legPivot.add(cuff);
      }
    }
    if (bottomStyle === 'joggers') {
      for (const legPivot of [leftLegPivot, rightLegPivot]) {
        const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.049, 0.054, 0.075, 12), bottomMat);
        cuff.position.y = -0.68;
        legPivot.add(cuff);
      }
    }
    if (bottomStyle === 'cargo') {
      for (const sx of [-1, 1]) {
        const pocket = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.075, 0.025), bottomMat);
        pocket.position.set(sx * 0.065, -0.26, 0.035);
        (sx < 0 ? leftLegPivot : rightLegPivot).add(pocket);
      }
    }
    if (bottomStyle === 'chinos' || bottomStyle === 'dress_pants') {
      for (const legPivot of [leftLegPivot, rightLegPivot]) {
        const crease = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.5, 0.008), soleMat);
        crease.position.set(0, -0.4, 0.055);
        legPivot.add(crease);
      }
    }

    // --- Sculpted Human Head & Realistic Facial Features ---
    const head = new THREE.Mesh(SHARED_HEAD_GEO, skinMat);
    head.position.y = 0.145;
    headPivot.add(head);

    // Subtle nose bridge & tip
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.042, 8), skinMat);
    nose.rotation.x = Math.PI * 0.38;
    nose.position.set(0, 0.135, 0.125);
    headPivot.add(nose);

    // Natural sculpted ears
    for (const ex of [-0.116, 0.116]) {
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.024, 10, 10), skinMat);
      ear.scale.set(0.45, 1.15, 0.72);
      ear.position.set(ex, 0.14, -0.005);
      headPivot.add(ear);
    }

    // Layered Realistic Eyes (Sclera + Iris + Pupil + Brow)
    const scleraMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.25 });
    const eyelinerMat = new THREE.MeshStandardMaterial({ color: cfg.makeupStyle === 'bold' ? 0x21131e : 0x342a2b, roughness: 0.55 });
    const eyeColors: Record<string, number> = {
      warm_brown: 0x6b4b2f,
      deep_brown: 0x3b2418,
      hazel: 0x7a6a35,
      green: 0x3f6b4a,
      blue: 0x3b6f9e,
      gray: 0x6b7a86,
    };
    const irisMat = new THREE.MeshStandardMaterial({
      color: eyeColors[cfg.eyeStyle ?? 'warm_brown'] ?? 0x6b4b2f,
      roughness: 0.2,
    });
    const browStyle = cfg.eyebrows ?? 'natural';
    const browWidth = browStyle === 'bold' ? 0.042 : browStyle === 'thin' ? 0.03 : 0.036;
    const browHeight = browStyle === 'bold' ? 0.008 : browStyle === 'thin' ? 0.003 : 0.0055;
    const browTilt = browStyle === 'arched' ? 0.13 : 0.06;

    const buildEye = (x: number): THREE.Mesh => {
      const eyeGroup = new THREE.Group();
      eyeGroup.position.set(x, 0.162, 0.108);
      eyeGroup.rotation.y = x < 0 ? -0.18 : 0.18;

      const sclera = new THREE.Mesh(new THREE.SphereGeometry(0.016, 12, 10), scleraMat);
      sclera.scale.set(1.15, 0.72, 0.48);
      eyeGroup.add(sclera);

      const iris = new THREE.Mesh(new THREE.SphereGeometry(0.0095, 12, 10), irisMat);
      iris.scale.set(1, 1, 0.45);
      iris.position.z = 0.006;
      eyeGroup.add(iris);

      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.0052, 10, 10), darkMat);
      pupil.scale.set(1, 1, 0.45);
      pupil.position.z = 0.0095;
      eyeGroup.add(pupil);

      const lash = new THREE.Mesh(new THREE.BoxGeometry(0.032, cfg.makeupStyle === 'bold' ? 0.006 : 0.0035, 0.008), eyelinerMat);
      lash.position.set(0, 0.009, 0.008);
      eyeGroup.add(lash);

      const brow = new THREE.Mesh(new THREE.BoxGeometry(browWidth, browHeight, 0.008), hairMat);
      brow.position.set(0, 0.023, 0.008);
      brow.rotation.z = x < 0 ? browTilt : -browTilt;
      eyeGroup.add(brow);

      headPivot.add(eyeGroup);
      return sclera;
    };

    leftEyeRef = buildEye(-0.042);
    rightEyeRef = buildEye(0.042);

    // Subtle natural lips
    const lipMat = new THREE.MeshStandardMaterial({ color: lipColor, roughness: 0.55 });
    const lips = new THREE.Mesh(new THREE.CapsuleGeometry(0.006, 0.026, 4, 8), lipMat);
    lips.rotation.z = Math.PI / 2;
    lips.position.set(0, 0.088, 0.11);
    headPivot.add(lips);

    // --- Facial hair ---
    const facialHair = cfg.facialHair ?? 'none';
    if (facialHair !== 'none') {
      const facialMat = new THREE.MeshStandardMaterial({
        color: cfg.hairColor,
        roughness: 0.85,
        transparent: facialHair === 'stubble',
        opacity: facialHair === 'stubble' ? 0.55 : 1,
      });
      if (facialHair === 'mustache' || facialHair === 'beard' || facialHair === 'goatee') {
        const mustache = new THREE.Mesh(new THREE.CapsuleGeometry(0.007, 0.026, 4, 8), facialMat);
        mustache.rotation.z = Math.PI / 2;
        mustache.position.set(0, 0.075, 0.112);
        headPivot.add(mustache);
      }
      if (facialHair === 'beard' || facialHair === 'goatee' || facialHair === 'stubble') {
        const chin = new THREE.Mesh(new THREE.SphereGeometry(0.036, 12, 8), facialMat);
        chin.scale.set(1.1, 0.7, 0.5);
        chin.position.set(0, 0.042, 0.095);
        headPivot.add(chin);
        for (let i = 0; i < 5; i++) {
          const a = -0.9 + i * 0.45;
          const patch = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), facialMat);
          patch.scale.set(0.7, 1.4, 0.45);
          patch.position.set(Math.sin(a) * 0.085, 0.06 + Math.cos(a) * 0.025, 0.083);
          headPivot.add(patch);
        }
      }
      if (facialHair === 'goatee') {
        const goatee = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.06, 8), facialMat);
        goatee.position.set(0, 0.018, 0.1);
        headPivot.add(goatee);
      }
    }

    // --- Volumetric Realistic Hair Styles ---
    const hairCap = new THREE.Mesh(
      new THREE.SphereGeometry(0.126, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.58),
      hairMat
    );
    hairCap.scale.set(1.03, 1.15, 1.08);
    hairCap.position.set(0, 0.16, -0.012);
    hairCap.rotation.x = -0.22;
    headPivot.add(hairCap);

    if (cfg.hairStyle === 'bob') {
      const backBob = new THREE.Mesh(
        new THREE.CylinderGeometry(0.125, 0.136, 0.18, 20, 1, false, Math.PI * 0.62, Math.PI * 1.76),
        hairMat
      );
      backBob.position.set(0, 0.11, -0.016);
      headPivot.add(backBob);
      const fringe = new THREE.Mesh(new THREE.SphereGeometry(0.082, 14, 10), hairMat);
      fringe.scale.set(1.35, 0.42, 0.68);
      fringe.position.set(0.01, 0.235, 0.082);
      fringe.rotation.x = 0.25;
      headPivot.add(fringe);
    } else if (cfg.hairStyle === 'afro') {
      const crown = new THREE.Mesh(new THREE.SphereGeometry(0.178, 22, 20), hairMat);
      crown.scale.set(1.06, 0.96, 1.04);
      crown.position.set(0, 0.2, -0.02);
      headPivot.add(crown);
    } else if (cfg.hairStyle === 'ponytail') {
      const band = new THREE.Mesh(
        new THREE.TorusGeometry(0.032, 0.01, 8, 16),
        new THREE.MeshStandardMaterial({ color: cfg.topColor, roughness: 0.6 })
      );
      band.position.set(0, 0.2, -0.13);
      headPivot.add(band);

      const tail = new THREE.Mesh(new THREE.CapsuleGeometry(0.044, 0.19, 8, 14), hairMat);
      tail.position.set(0, 0.11, -0.165);
      tail.rotation.x = 0.34;
      headPivot.add(tail);
    } else if (cfg.hairStyle === 'buns') {
      for (const bx of [-0.11, 0.11]) {
        const bun = new THREE.Mesh(new THREE.SphereGeometry(0.062, 14, 14), hairMat);
        bun.position.set(bx, 0.275, -0.025);
        headPivot.add(bun);
      }
    } else if (cfg.hairStyle === 'spiky') {
      for (let i = -2; i <= 2; i++) {
        const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.036, 0.1, 8), hairMat);
        tuft.position.set(i * 0.038, 0.285, 0.03 - Math.abs(i) * 0.018);
        tuft.rotation.z = -i * 0.22;
        tuft.rotation.x = 0.26;
        headPivot.add(tuft);
      }
    } else if (cfg.hairStyle === 'long_waves') {
      const back = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.28, 8, 16), hairMat);
      back.scale.set(1.0, 1, 0.55);
      back.position.set(0, 0.03, -0.075);
      headPivot.add(back);
      for (const sx of [-1, 1]) {
        const side = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.25, 6, 10), hairMat);
        side.position.set(sx * 0.12, 0.05, 0.01);
        side.rotation.z = sx * 0.08;
        headPivot.add(side);
      }
    } else if (cfg.hairStyle === 'buzz' || cfg.hairStyle === 'fade') {
      hairCap.scale.set(0.99, 0.9, 1.02);
      hairCap.position.y = 0.18;
      const hairline = new THREE.Mesh(new THREE.TorusGeometry(0.092, 0.008, 8, 24, Math.PI), hairMat);
      hairline.rotation.x = -1.2;
      hairline.position.set(0, 0.22, 0.045);
      headPivot.add(hairline);
    } else if (cfg.hairStyle === 'curls') {
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        const curl = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), hairMat);
        curl.position.set(Math.cos(a) * 0.09, 0.24 + Math.sin(i * 1.7) * 0.035, Math.sin(a) * 0.07);
        headPivot.add(curl);
      }
    } else if (cfg.hairStyle === 'locs') {
      for (let i = 0; i < 8; i++) {
        const a = -1.25 + (i / 7) * 2.5;
        const loc = new THREE.Mesh(new THREE.CapsuleGeometry(0.016, 0.22 + (i % 3) * 0.04, 4, 8), hairMat);
        loc.position.set(Math.sin(a) * 0.1, 0.1, Math.cos(a) * 0.075 - 0.03);
        loc.rotation.x = 0.08;
        headPivot.add(loc);
      }
    } else if (cfg.hairStyle === 'pixie') {
      const sweep = new THREE.Mesh(new THREE.SphereGeometry(0.105, 16, 12), hairMat);
      sweep.scale.set(1.22, 0.62, 0.92);
      sweep.position.set(0.02, 0.25, 0.045);
      sweep.rotation.z = -0.28;
      headPivot.add(sweep);
      const nape = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.08, 6, 10), hairMat);
      nape.position.set(0, 0.12, -0.08);
      headPivot.add(nape);
    } else if (cfg.hairStyle === 'middle_part' || cfg.hairStyle === 'curtain') {
      const long = cfg.hairStyle === 'middle_part';
      for (const sx of [-1, 1]) {
        const curtain = new THREE.Mesh(new THREE.SphereGeometry(0.085, 14, 12), hairMat);
        curtain.scale.set(0.62, long ? 1.8 : 1.15, 0.72);
        curtain.position.set(sx * 0.075, long ? 0.06 : 0.17, 0.035);
        curtain.rotation.z = sx * 0.1;
        headPivot.add(curtain);
      }
    } else if (cfg.hairStyle === 'top_knot') {
      const knot = new THREE.Mesh(new THREE.SphereGeometry(0.06, 14, 10), hairMat);
      knot.position.set(0, 0.325, -0.02);
      headPivot.add(knot);
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.036, 0.009, 8, 16), hairMat);
      band.rotation.x = Math.PI / 2;
      band.position.set(0, 0.285, -0.02);
      headPivot.add(band);
    } else if (cfg.hairStyle === 'shoulder_waves') {
      for (const sx of [-1, 1]) {
        const wave = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.2, 6, 12), hairMat);
        wave.scale.set(1, 1, 0.75);
        wave.position.set(sx * 0.115, 0.08, -0.02);
        wave.rotation.z = sx * 0.12;
        headPivot.add(wave);
      }
      const topVolume = new THREE.Mesh(new THREE.SphereGeometry(0.115, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.6), hairMat);
      topVolume.position.set(0, 0.2, 0);
      headPivot.add(topVolume);
    } else if (cfg.hairStyle === 'braids') {
      for (let i = 0; i < 6; i++) {
        const a = -1.1 + (i / 5) * 2.2;
        const braid = new THREE.Mesh(new THREE.CapsuleGeometry(0.014, 0.3, 4, 8), hairMat);
        braid.position.set(Math.sin(a) * 0.1, 0.02, Math.cos(a) * 0.07 - 0.04);
        braid.rotation.x = 0.06;
        headPivot.add(braid);
      }
    } else if (cfg.hairStyle === 'undercut') {
      const top = new THREE.Mesh(new THREE.SphereGeometry(0.106, 16, 12), hairMat);
      top.scale.set(1.2, 0.7, 1.0);
      top.position.set(0.025, 0.245, 0.02);
      top.rotation.z = -0.2;
      headPivot.add(top);
    } else {
      // sidepart
      const swoop = new THREE.Mesh(new THREE.SphereGeometry(0.095, 16, 14), hairMat);
      swoop.scale.set(1.28, 0.5, 0.95);
      swoop.position.set(0.025, 0.252, 0.042);
      swoop.rotation.z = -0.18;
      headPivot.add(swoop);
    }

    // --- Accessories ---
    if (cfg.accessory === 'glasses') {
      const frameMat = new THREE.MeshStandardMaterial({
        color: 0xd4af5a,
        metalness: 0.88,
        roughness: 0.22,
      });
      for (const gx of [-0.042, 0.042]) {
        const rim = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.004, 8, 20), frameMat);
        rim.position.set(gx, 0.162, 0.125);
        rim.rotation.y = gx < 0 ? -0.12 : 0.12;
        headPivot.add(rim);
      }
      const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.004, 0.004), frameMat);
      bridge.position.set(0, 0.166, 0.126);
      headPivot.add(bridge);
    } else if (cfg.accessory === 'headphones') {
      const hpMat = new THREE.MeshStandardMaterial({
        color: 0x2a2e36,
        roughness: 0.3,
        metalness: 0.55,
      });
      const padMat = new THREE.MeshStandardMaterial({
        color: cfg.topColor,
        roughness: 0.65,
      });
      const band = new THREE.Mesh(
        new THREE.TorusGeometry(0.145, 0.011, 10, 26, Math.PI),
        hpMat
      );
      band.position.set(0, 0.175, -0.005);
      headPivot.add(band);

      for (const hx of [-0.138, 0.138]) {
        const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.028, 16), padMat);
        cup.rotation.z = Math.PI / 2;
        cup.position.set(hx, 0.145, -0.005);
        headPivot.add(cup);
      }
    } else if (cfg.accessory === 'beanie') {
      const beanieMat = new THREE.MeshStandardMaterial({
        color: cfg.topColor,
        roughness: 0.88,
      });
      const dome = new THREE.Mesh(
        new THREE.SphereGeometry(0.136, 22, 16, 0, Math.PI * 2, 0, Math.PI * 0.54),
        beanieMat
      );
      dome.scale.set(1.03, 1.12, 1.07);
      dome.position.set(0, 0.182, -0.01);
      dome.rotation.x = -0.18;
      headPivot.add(dome);

      const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.132, 0.02, 10, 26), beanieMat);
      cuff.rotation.x = Math.PI / 2 - 0.18;
      cuff.position.set(0, 0.2, 0);
      headPivot.add(cuff);
    } else if (cfg.accessory === 'cap') {
      const capMat = new THREE.MeshStandardMaterial({ color: cfg.topColor, roughness: 0.72 });
      const dome = new THREE.Mesh(new THREE.SphereGeometry(0.13, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), capMat);
      dome.scale.set(1.02, 0.85, 1.04);
      dome.position.set(0, 0.235, 0);
      headPivot.add(dome);
      const brim = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.018, 0.11), capMat);
      brim.position.set(0, 0.225, 0.115);
      brim.rotation.x = -0.08;
      headPivot.add(brim);
    } else if (cfg.accessory === 'bucket_hat') {
      const bucketMat = new THREE.MeshStandardMaterial({ color: cfg.topColor, roughness: 0.86 });
      const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.11, 20), bucketMat);
      crown.position.set(0, 0.26, 0);
      headPivot.add(crown);
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.018, 24), bucketMat);
      brim.position.set(0, 0.205, 0);
      headPivot.add(brim);
    } else if (cfg.accessory === 'sunglasses') {
      const frameMat = new THREE.MeshStandardMaterial({ color: 0x1a1c20, roughness: 0.28, metalness: 0.6 });
      const lensMat = new THREE.MeshPhysicalMaterial({ color: 0x171c22, roughness: 0.06, metalness: 0.6, clearcoat: 1 });
      for (const gx of [-0.043, 0.043]) {
        const lens = new THREE.Mesh(new THREE.BoxGeometry(0.062, 0.036, 0.008), lensMat);
        lens.position.set(gx, 0.162, 0.126);
        lens.rotation.y = gx < 0 ? -0.16 : 0.16;
        headPivot.add(lens);
        const rim = new THREE.Mesh(new THREE.BoxGeometry(0.068, 0.042, 0.004), frameMat);
        rim.position.set(gx, 0.162, 0.122);
        rim.rotation.y = gx < 0 ? -0.16 : 0.16;
        headPivot.add(rim);
      }
      const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.006, 0.006), frameMat);
      bridge.position.set(0, 0.166, 0.128);
      headPivot.add(bridge);
    } else if (cfg.accessory === 'scarf') {
      const scarfMat = new THREE.MeshStandardMaterial({ color: cfg.topColor, roughness: 0.95 });
      const wrap = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.028, 10, 22), scarfMat);
      wrap.rotation.x = Math.PI / 2;
      wrap.position.set(0, 0.545, 0);
      torso.add(wrap);
      for (const sx of [-1, 1]) {
        const tail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.22, 0.025), scarfMat);
        tail.position.set(sx * 0.03, 0.43, 0.1);
        tail.rotation.z = sx * 0.08;
        torso.add(tail);
      }
    }

    // --- Jewelry & carry ---
    if (cfg.jewelry === 'chain') {
      const chain = new THREE.Mesh(
        new THREE.TorusGeometry(0.075, 0.005, 8, 24),
        new THREE.MeshStandardMaterial({ color: 0xd9b45c, roughness: 0.22, metalness: 0.9 })
      );
      chain.rotation.x = Math.PI / 2;
      chain.position.set(0, 0.515, 0.02);
      torso.add(chain);
      const pendant = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.014, 0),
        new THREE.MeshStandardMaterial({ color: 0xf0d789, roughness: 0.2, metalness: 0.85 })
      );
      pendant.position.set(0, 0.47, 0.095);
      torso.add(pendant);
    }
    if (cfg.jewelry === 'watch') {
      const watch = new THREE.Mesh(
        new THREE.BoxGeometry(0.032, 0.014, 0.038),
        new THREE.MeshStandardMaterial({ color: 0xc9ced6, roughness: 0.2, metalness: 0.9 })
      );
      watch.position.set(0, -0.43, 0.04);
      leftArmPivot.add(watch);
    }
    if (cfg.jewelry === 'earrings') {
      for (const ex of [-0.116, 0.116]) {
        const earring = new THREE.Mesh(
          new THREE.SphereGeometry(0.009, 8, 8),
          new THREE.MeshStandardMaterial({ color: 0xe6c46a, roughness: 0.2, metalness: 0.9 })
        );
        earring.position.set(ex, 0.115, 0.01);
        headPivot.add(earring);
      }
    }
    if (cfg.jewelry === 'bracelet') {
      const bracelet = new THREE.Mesh(
        new THREE.TorusGeometry(0.036, 0.005, 8, 18),
        new THREE.MeshStandardMaterial({ color: 0xd9b45c, roughness: 0.3, metalness: 0.8 })
      );
      bracelet.rotation.x = Math.PI / 2;
      bracelet.position.set(0, -0.455, 0.035);
      rightArmPivot.add(bracelet);
    }
    if (cfg.carry === 'backpack') {
      const packMat = new THREE.MeshStandardMaterial({ color: cfg.topColor, roughness: 0.85 });
      const pack = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.3, 0.12), packMat);
      pack.position.set(0, 0.32, -0.15);
      torso.add(pack);
      const pocket = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.05), packMat);
      pocket.position.set(0, 0.25, -0.22);
      torso.add(pocket);
      for (const sx of [-1, 1]) {
        const strap = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.29, 0.015), packMat);
        strap.position.set(sx * 0.07, 0.37, 0.11);
        torso.add(strap);
      }
    } else if (cfg.carry === 'purse' || cfg.carry === 'tote') {
      const bagMat = new THREE.MeshStandardMaterial({ color: cfg.bottomColor, roughness: 0.6 });
      const bag = new THREE.Mesh(
        new THREE.BoxGeometry(cfg.carry === 'tote' ? 0.18 : 0.13, cfg.carry === 'tote' ? 0.19 : 0.14, 0.07),
        bagMat
      );
      bag.position.set(0.18, 0.2, 0.02);
      torso.add(bag);
      const strap = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.006, 8, 18, Math.PI), bagMat);
      strap.position.set(0.18, 0.31, 0.02);
      torso.add(strap);
    }

    root.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh && obj !== shadowPlane) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });
  }

  rebuildAppearance(initialConfig);

  let nextBlink = 2.4;
  let blinkTimer = 0;

  function updateAnimation(
    emote: EmoteType,
    isMoving: boolean,
    elapsed: number,
    delta: number,
    jumpOffset: number
  ) {
    const k = 1 - Math.exp(-12 * delta);

    nextBlink -= delta;
    if (nextBlink <= 0) {
      blinkTimer = 0.13;
      nextBlink = 2.5 + Math.random() * 2.5;
    }
    if (blinkTimer > 0) {
      blinkTimer -= delta;
      leftEyeRef.scale.y = 0.14;
      rightEyeRef.scale.y = 0.14;
    } else {
      leftEyeRef.scale.y = THREE.MathUtils.lerp(leftEyeRef.scale.y, 0.72, k);
      rightEyeRef.scale.y = THREE.MathUtils.lerp(rightEyeRef.scale.y, 0.72, k);
    }

    let targetPelvisY = PELVIS_BASE_Y;
    let targetBodyY = jumpOffset;
    let targetTorsoX = 0;
    let targetTorsoZ = 0;
    let targetTorsoY = 0;
    let targetHeadX = 0;
    let targetHeadY = 0;
    let targetHeadZ = 0;
    let targetLArmX = 0;
    let targetLArmZ = 0.09;
    let targetRArmX = 0;
    let targetRArmZ = -0.09;
    let targetLLegX = 0;
    let targetRLegX = 0;

    if (isMoving) {
      const t = elapsed * 10.0;
      const stride = Math.sin(t);
      targetPelvisY = PELVIS_BASE_Y + Math.abs(Math.cos(t)) * 0.036;
      targetTorsoX = 0.07;
      targetTorsoZ = stride * 0.03;
      targetLArmX = stride * 0.58;
      targetRArmX = -stride * 0.58;
      targetLLegX = -stride * 0.62;
      targetRLegX = stride * 0.62;
      targetHeadX = -0.04;
    } else if (emote === 'sit') {
      targetPelvisY = 0.56;
      targetTorsoX = -0.05;
      targetLLegX = -Math.PI / 2 + 0.12;
      targetRLegX = -Math.PI / 2 + 0.12;
      targetLArmX = -0.32;
      targetRArmX = -0.32;
      targetLArmZ = 0.14;
      targetRArmZ = -0.14;
      targetHeadY = Math.sin(elapsed * 0.9) * 0.12;
    } else if (emote === 'wave') {
      targetRArmZ = -2.4 + Math.sin(elapsed * 10.5) * 0.32;
      targetRArmX = -0.24;
      targetLArmZ = 0.18;
      targetHeadZ = -0.12;
      targetHeadY = 0.14;
      targetPelvisY = PELVIS_BASE_Y + Math.abs(Math.sin(elapsed * 5.2)) * 0.02;
    } else if (emote === 'dance') {
      const b = elapsed * 7.2;
      targetPelvisY = PELVIS_BASE_Y - 0.03 + Math.abs(Math.sin(b)) * 0.06;
      targetTorsoY = Math.sin(b * 0.5) * 0.25;
      targetTorsoZ = Math.cos(b * 0.5) * 0.1;
      targetLArmZ = 0.85 + Math.sin(b) * 0.55;
      targetRArmZ = -0.85 + Math.sin(b) * 0.55;
      targetLArmX = Math.cos(b) * 0.45;
      targetRArmX = -Math.cos(b) * 0.45;
      targetLLegX = Math.sin(b * 0.5) * 0.22;
      targetRLegX = -Math.sin(b * 0.5) * 0.22;
      targetHeadZ = Math.sin(b * 0.5) * 0.12;
    } else if (emote === 'cheer') {
      const c = elapsed * 9;
      targetBodyY = Math.abs(Math.sin(c)) * 0.2;
      targetLArmZ = 2.55 + Math.sin(c) * 0.16;
      targetRArmZ = -2.55 - Math.sin(c) * 0.16;
      targetHeadX = -0.1;
    } else {
      targetPelvisY = PELVIS_BASE_Y + Math.sin(elapsed * 2.1) * 0.01;
      targetLArmZ = 0.08 + Math.sin(elapsed * 2.1) * 0.015;
      targetRArmZ = -0.08 - Math.sin(elapsed * 2.1) * 0.015;
      targetHeadY = Math.sin(elapsed * 0.65) * 0.1;
    }

    bodyPivot.position.y = THREE.MathUtils.lerp(bodyPivot.position.y, targetBodyY, k);
    pelvis.position.y = THREE.MathUtils.lerp(pelvis.position.y, targetPelvisY, k);
    torso.rotation.x = THREE.MathUtils.lerp(torso.rotation.x, targetTorsoX, k);
    torso.rotation.y = THREE.MathUtils.lerp(torso.rotation.y, targetTorsoY, k);
    torso.rotation.z = THREE.MathUtils.lerp(torso.rotation.z, targetTorsoZ, k);
    headPivot.rotation.x = THREE.MathUtils.lerp(headPivot.rotation.x, targetHeadX, k);
    headPivot.rotation.y = THREE.MathUtils.lerp(headPivot.rotation.y, targetHeadY, k);
    headPivot.rotation.z = THREE.MathUtils.lerp(headPivot.rotation.z, targetHeadZ, k);
    leftArmPivot.rotation.x = THREE.MathUtils.lerp(leftArmPivot.rotation.x, targetLArmX, k);
    leftArmPivot.rotation.z = THREE.MathUtils.lerp(leftArmPivot.rotation.z, targetLArmZ, k);
    rightArmPivot.rotation.x = THREE.MathUtils.lerp(rightArmPivot.rotation.x, targetRArmX, k);
    rightArmPivot.rotation.z = THREE.MathUtils.lerp(rightArmPivot.rotation.z, targetRArmZ, k);
    leftLegPivot.rotation.x = THREE.MathUtils.lerp(leftLegPivot.rotation.x, targetLLegX, k);
    rightLegPivot.rotation.x = THREE.MathUtils.lerp(rightLegPivot.rotation.x, targetRLegX, k);

    const sScale = Math.max(0.65, 1 - bodyPivot.position.y * 0.45);
    shadowPlane.scale.setScalar(sScale);
  }

  return {
    root,
    bodyPivot,
    pelvis,
    torso,
    headPivot,
    leftArmPivot,
    rightArmPivot,
    leftLegPivot,
    rightLegPivot,
    leftEye: leftEyeRef,
    rightEye: rightEyeRef,
    shadowPlane,
    rebuildAppearance,
    updateAnimation,
  };
}
