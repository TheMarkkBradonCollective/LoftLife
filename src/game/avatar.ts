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

export function createAvatarRig(initialConfig: AvatarConfig): AvatarRig {
  const root = new THREE.Group();
  const bodyPivot = new THREE.Group();
  root.add(bodyPivot);

  const pelvis = new THREE.Group();
  pelvis.position.y = 0.56;
  bodyPivot.add(pelvis);

  const torso = new THREE.Group();
  pelvis.add(torso);

  const headPivot = new THREE.Group();
  headPivot.position.y = 0.44;
  torso.add(headPivot);

  const leftArmPivot = new THREE.Group();
  leftArmPivot.position.set(-0.21, 0.36, 0);
  torso.add(leftArmPivot);

  const rightArmPivot = new THREE.Group();
  rightArmPivot.position.set(0.21, 0.36, 0);
  torso.add(rightArmPivot);

  const leftLegPivot = new THREE.Group();
  leftLegPivot.position.set(-0.09, -0.02, 0);
  pelvis.add(leftLegPivot);

  const rightLegPivot = new THREE.Group();
  rightLegPivot.position.set(0.09, -0.02, 0);
  pelvis.add(rightLegPivot);

  // Soft contact shadow directly under avatar
  const shadowPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(0.75, 0.75),
    new THREE.MeshBasicMaterial({
      map: createContactShadowTexture(),
      transparent: true,
      depthWrite: false,
      opacity: 0.52,
    })
  );
  shadowPlane.rotation.x = -Math.PI / 2;
  shadowPlane.position.y = 0.026;
  root.add(shadowPlane);

  let leftEyeRef = new THREE.Mesh();
  let rightEyeRef = new THREE.Mesh();

  function clearGroup(g: THREE.Group) {
    while (g.children.length > 0) {
      const child = g.children[0];
      g.remove(child);
    }
  }

  function rebuildAppearance(cfg: AvatarConfig) {
    // Clear all sub-parts (keeping structural pivots)
    clearGroup(torso);
    torso.add(headPivot, leftArmPivot, rightArmPivot);
    clearGroup(headPivot);
    clearGroup(leftArmPivot);
    clearGroup(rightArmPivot);
    clearGroup(leftLegPivot);
    clearGroup(rightLegPivot);

    const skinMat = new THREE.MeshStandardMaterial({
      color: cfg.skinTone,
      roughness: 0.62,
      metalness: 0.02,
    });
    const hairMat = new THREE.MeshStandardMaterial({
      color: cfg.hairColor,
      roughness: 0.72,
      metalness: 0.04,
    });
    const topMat = new THREE.MeshPhysicalMaterial({
      color: cfg.topColor,
      roughness: 0.8,
      metalness: 0.0,
      sheen: 0.4,
    });
    const bottomMat = new THREE.MeshStandardMaterial({
      color: cfg.bottomColor,
      roughness: 0.82,
      metalness: 0.02,
    });
    const shoeMat = new THREE.MeshStandardMaterial({
      color: cfg.shoeColor,
      roughness: 0.45,
      metalness: 0.05,
    });
    const soleMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.55,
    });
    const darkMat = new THREE.MeshStandardMaterial({
      color: 0x1c1e24,
      roughness: 0.35,
    });

    // --- Pelvis / Hips ---
    const hipMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.155, 0.16, 0.12, 16),
      bottomMat
    );
    hipMesh.position.y = 0.02;
    torso.add(hipMesh);

    // --- Torso ---
    const chest = new THREE.Mesh(
      new THREE.CylinderGeometry(0.165, 0.155, 0.36, 18),
      topMat
    );
    chest.position.y = 0.24;
    torso.add(chest);

    // Top-specific details
    if (cfg.topStyle === 'hoodie') {
      const hood = new THREE.Mesh(
        new THREE.TorusGeometry(0.12, 0.045, 10, 18),
        topMat
      );
      hood.rotation.x = Math.PI / 2 + 0.25;
      hood.position.set(0, 0.41, -0.04);
      torso.add(hood);

      const pocket = new THREE.Mesh(
        new THREE.BoxGeometry(0.18, 0.1, 0.03),
        topMat
      );
      pocket.position.set(0, 0.14, 0.155);
      torso.add(pocket);
    } else if (cfg.topStyle === 'blazer') {
      const innerTee = new THREE.Mesh(
        new THREE.BoxGeometry(0.11, 0.26, 0.04),
        soleMat
      );
      innerTee.position.set(0, 0.25, 0.148);
      torso.add(innerTee);
    } else if (cfg.topStyle === 'turtleneck') {
      const collar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.082, 0.086, 0.09, 14),
        topMat
      );
      collar.position.set(0, 0.43, 0);
      torso.add(collar);
    }

    // Neck
    const neck = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.065, 0.08, 12),
      skinMat
    );
    neck.position.set(0, 0.43, 0);
    torso.add(neck);

    // --- Arms ---
    const buildArm = (pivot: THREE.Group, side: number) => {
      const sleeveLen = cfg.topStyle === 'tee' ? 0.12 : 0.24;
      const sleeve = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.046, sleeveLen, 6, 12),
        topMat
      );
      sleeve.position.y = -sleeveLen / 2 - 0.02;
      pivot.add(sleeve);

      const forearm = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.038, 0.16, 6, 12),
        skinMat
      );
      forearm.position.y = -0.22;
      pivot.add(forearm);

      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 12), skinMat);
      hand.position.y = -0.34;
      hand.position.x = side * 0.005;
      pivot.add(hand);
    };
    buildArm(leftArmPivot, -1);
    buildArm(rightArmPivot, 1);

    // --- Legs & Shoes ---
    const buildLeg = (pivot: THREE.Group) => {
      const leg = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.056, 0.34, 6, 12),
        bottomMat
      );
      leg.position.y = -0.21;
      pivot.add(leg);

      // Sneaker upper
      const shoe = new THREE.Mesh(
        new THREE.BoxGeometry(0.115, 0.08, 0.19),
        shoeMat
      );
      shoe.position.set(0, -0.47, 0.035);
      pivot.add(shoe);

      // Sneaker sole
      const sole = new THREE.Mesh(
        new THREE.BoxGeometry(0.122, 0.03, 0.2),
        soleMat
      );
      sole.position.set(0, -0.515, 0.035);
      pivot.add(sole);
    };
    buildLeg(leftLegPivot);
    buildLeg(rightLegPivot);

    // --- Head & Expressive Face ---
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.195, 24, 24),
      skinMat
    );
    head.position.y = 0.2;
    head.scale.set(1.02, 1.0, 0.96);
    headPivot.add(head);

    // Ears
    for (const ex of [-0.19, 0.19]) {
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.042, 10, 10), skinMat);
      ear.position.set(ex, 0.19, 0);
      headPivot.add(ear);
    }

    // Eyes
    const eyeGeo = new THREE.SphereGeometry(0.025, 12, 12);
    leftEyeRef = new THREE.Mesh(eyeGeo, darkMat);
    leftEyeRef.position.set(-0.068, 0.21, 0.172);
    headPivot.add(leftEyeRef);

    rightEyeRef = new THREE.Mesh(eyeGeo, darkMat);
    rightEyeRef.position.set(0.068, 0.21, 0.172);
    headPivot.add(rightEyeRef);

    // Eye catchlights
    const glintMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    for (const gx of [-0.062, 0.074]) {
      const glint = new THREE.Mesh(new THREE.SphereGeometry(0.008, 8, 8), glintMat);
      glint.position.set(gx, 0.218, 0.192);
      headPivot.add(glint);
    }

    // Rosy cheeks
    const cheekMat = new THREE.MeshStandardMaterial({
      color: 0xf28b82,
      roughness: 0.9,
      transparent: true,
      opacity: 0.55,
    });
    for (const cx of [-0.11, 0.11]) {
      const cheek = new THREE.Mesh(new THREE.CircleGeometry(0.026, 12), cheekMat);
      cheek.position.set(cx, 0.165, 0.168);
      cheek.rotation.y = cx < 0 ? -0.45 : 0.45;
      headPivot.add(cheek);
    }

    // Smile arc
    const smile = new THREE.Mesh(
      new THREE.TorusGeometry(0.032, 0.007, 8, 16, Math.PI),
      darkMat
    );
    smile.position.set(0, 0.148, 0.175);
    smile.rotation.z = Math.PI;
    headPivot.add(smile);

    // --- Hair Styles ---
    const hairCap = new THREE.Mesh(
      new THREE.SphereGeometry(0.208, 22, 16, 0, Math.PI * 2, 0, Math.PI * 0.56),
      hairMat
    );
    hairCap.position.set(0, 0.215, -0.01);
    hairCap.rotation.x = -0.18;
    headPivot.add(hairCap);

    if (cfg.hairStyle === 'bob') {
      const backBob = new THREE.Mesh(
        new THREE.CylinderGeometry(0.2, 0.215, 0.22, 18, 1, false, Math.PI * 0.65, Math.PI * 1.7),
        hairMat
      );
      backBob.position.set(0, 0.15, -0.02);
      headPivot.add(backBob);
      const bangs = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.06, 0.08), hairMat);
      bangs.position.set(0, 0.31, 0.145);
      bangs.rotation.x = 0.2;
      headPivot.add(bangs);
    } else if (cfg.hairStyle === 'afro') {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(0.265, 20, 20), hairMat);
      puff.position.set(0, 0.27, -0.03);
      headPivot.add(puff);
      for (const [px, py, pz] of [
        [-0.17, 0.34, 0.05],
        [0.17, 0.34, 0.05],
        [0, 0.42, -0.02],
      ]) {
        const curl = new THREE.Mesh(new THREE.SphereGeometry(0.11, 14, 14), hairMat);
        curl.position.set(px, py, pz);
        headPivot.add(curl);
      }
    } else if (cfg.hairStyle === 'ponytail') {
      const band = new THREE.Mesh(
        new THREE.TorusGeometry(0.045, 0.015, 8, 14),
        new THREE.MeshStandardMaterial({ color: cfg.topColor, roughness: 0.6 })
      );
      band.position.set(0, 0.29, -0.2);
      headPivot.add(band);

      const tail = new THREE.Mesh(new THREE.CapsuleGeometry(0.065, 0.22, 8, 12), hairMat);
      tail.position.set(0, 0.19, -0.26);
      tail.rotation.x = 0.38;
      headPivot.add(tail);
    } else if (cfg.hairStyle === 'buns') {
      for (const bx of [-0.17, 0.17]) {
        const bun = new THREE.Mesh(new THREE.SphereGeometry(0.095, 14, 14), hairMat);
        bun.position.set(bx, 0.38, -0.03);
        headPivot.add(bun);
      }
    } else if (cfg.hairStyle === 'spiky') {
      for (let i = -2; i <= 2; i++) {
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.16, 8), hairMat);
        spike.position.set(i * 0.065, 0.41, 0.04 - Math.abs(i) * 0.03);
        spike.rotation.z = -i * 0.25;
        spike.rotation.x = 0.22;
        headPivot.add(spike);
      }
    } else {
      // sidepart
      const swoop = new THREE.Mesh(new THREE.SphereGeometry(0.14, 14, 14), hairMat);
      swoop.scale.set(1.3, 0.55, 0.9);
      swoop.position.set(0.04, 0.34, 0.09);
      swoop.rotation.z = -0.2;
      headPivot.add(swoop);
    }

    // --- Accessories ---
    if (cfg.accessory === 'glasses') {
      const frameMat = new THREE.MeshStandardMaterial({
        color: 0xd4af5a,
        metalness: 0.85,
        roughness: 0.25,
      });
      for (const gx of [-0.068, 0.068]) {
        const rim = new THREE.Mesh(new THREE.TorusGeometry(0.042, 0.007, 8, 18), frameMat);
        rim.position.set(gx, 0.21, 0.19);
        headPivot.add(rim);
      }
      const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.008, 0.008), frameMat);
      bridge.position.set(0, 0.215, 0.19);
      headPivot.add(bridge);
    } else if (cfg.accessory === 'headphones') {
      const hpMat = new THREE.MeshStandardMaterial({
        color: 0x323640,
        roughness: 0.35,
        metalness: 0.4,
      });
      const padMat = new THREE.MeshStandardMaterial({
        color: cfg.topColor,
        roughness: 0.7,
      });
      const band = new THREE.Mesh(
        new THREE.TorusGeometry(0.22, 0.018, 10, 24, Math.PI),
        hpMat
      );
      band.position.set(0, 0.22, 0);
      headPivot.add(band);

      for (const hx of [-0.215, 0.215]) {
        const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.062, 0.045, 16), padMat);
        cup.rotation.z = Math.PI / 2;
        cup.position.set(hx, 0.2, 0);
        headPivot.add(cup);
      }
    } else if (cfg.accessory === 'beanie') {
      const beanieMat = new THREE.MeshStandardMaterial({
        color: cfg.topColor,
        roughness: 0.9,
      });
      const dome = new THREE.Mesh(
        new THREE.SphereGeometry(0.215, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.52),
        beanieMat
      );
      dome.position.set(0, 0.24, -0.01);
      dome.rotation.x = -0.15;
      headPivot.add(dome);

      const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.205, 0.032, 10, 24), beanieMat);
      cuff.rotation.x = Math.PI / 2 - 0.15;
      cuff.position.set(0, 0.27, 0);
      headPivot.add(cuff);
    }

    root.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh && obj !== shadowPlane) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });
  }

  rebuildAppearance(initialConfig);

  let nextBlink = 2.5;
  let blinkTimer = 0;

  function updateAnimation(
    emote: EmoteType,
    isMoving: boolean,
    elapsed: number,
    delta: number,
    jumpOffset: number
  ) {
    const k = 1 - Math.exp(-12 * delta);

    // Eye blinking
    nextBlink -= delta;
    if (nextBlink <= 0) {
      blinkTimer = 0.14;
      nextBlink = 2.6 + Math.random() * 2.5;
    }
    if (blinkTimer > 0) {
      blinkTimer -= delta;
      leftEyeRef.scale.y = 0.15;
      rightEyeRef.scale.y = 0.15;
    } else {
      leftEyeRef.scale.y = THREE.MathUtils.lerp(leftEyeRef.scale.y, 1, k);
      rightEyeRef.scale.y = THREE.MathUtils.lerp(rightEyeRef.scale.y, 1, k);
    }

    // Target joint poses
    let targetPelvisY = 0.56;
    let targetBodyY = jumpOffset;
    let targetTorsoX = 0;
    let targetTorsoZ = 0;
    let targetTorsoY = 0;
    let targetHeadX = 0;
    let targetHeadY = 0;
    let targetHeadZ = 0;
    let targetLArmX = 0;
    let targetLArmZ = 0.12;
    let targetRArmX = 0;
    let targetRArmZ = -0.12;
    let targetLLegX = 0;
    let targetRLegX = 0;

    if (isMoving) {
      const t = elapsed * 10.5;
      const stride = Math.sin(t);
      targetPelvisY = 0.56 + Math.abs(Math.cos(t)) * 0.045;
      targetTorsoX = 0.08;
      targetTorsoZ = stride * 0.04;
      targetLArmX = stride * 0.65;
      targetRArmX = -stride * 0.65;
      targetLLegX = -stride * 0.68;
      targetRLegX = stride * 0.68;
      targetHeadX = -0.04;
    } else if (emote === 'sit') {
      targetPelvisY = 0.42;
      targetTorsoX = -0.06;
      targetLLegX = -Math.PI / 2 + 0.12;
      targetRLegX = -Math.PI / 2 + 0.12;
      targetLArmX = -0.35;
      targetRArmX = -0.35;
      targetLArmZ = 0.18;
      targetRArmZ = -0.18;
      targetHeadY = Math.sin(elapsed * 0.9) * 0.14;
    } else if (emote === 'wave') {
      targetRArmZ = -2.45 + Math.sin(elapsed * 11) * 0.35;
      targetRArmX = -0.25;
      targetLArmZ = 0.25;
      targetHeadZ = -0.14;
      targetHeadY = 0.15;
      targetPelvisY = 0.56 + Math.abs(Math.sin(elapsed * 5.5)) * 0.025;
    } else if (emote === 'dance') {
      const b = elapsed * 7.2;
      targetPelvisY = 0.53 + Math.abs(Math.sin(b)) * 0.07;
      targetTorsoY = Math.sin(b * 0.5) * 0.28;
      targetTorsoZ = Math.cos(b * 0.5) * 0.12;
      targetLArmZ = 0.9 + Math.sin(b) * 0.6;
      targetRArmZ = -0.9 + Math.sin(b) * 0.6;
      targetLArmX = Math.cos(b) * 0.5;
      targetRArmX = -Math.cos(b) * 0.5;
      targetLLegX = Math.sin(b * 0.5) * 0.25;
      targetRLegX = -Math.sin(b * 0.5) * 0.25;
      targetHeadZ = Math.sin(b * 0.5) * 0.14;
    } else if (emote === 'cheer') {
      const c = elapsed * 9;
      targetBodyY = Math.abs(Math.sin(c)) * 0.22;
      targetLArmZ = 2.6 + Math.sin(c) * 0.18;
      targetRArmZ = -2.6 - Math.sin(c) * 0.18;
      targetHeadX = -0.12;
    } else {
      // Idle breathing & relaxed curiosity
      targetPelvisY = 0.56 + Math.sin(elapsed * 2.1) * 0.012;
      targetLArmZ = 0.1 + Math.sin(elapsed * 2.1) * 0.02;
      targetRArmZ = -0.1 - Math.sin(elapsed * 2.1) * 0.02;
      targetHeadY = Math.sin(elapsed * 0.7) * 0.12;
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

    // Shadow shrinks slightly when jumping
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
