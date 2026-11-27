import * as THREE from 'three';
import { buildExtraFurniture } from './furnitureExtra';
import { getExpansionCatalogItem } from './catalogExpansion';
import { buildCatalogModel } from './models';
import { buildImportedFurnitureGroup } from './importedFurniture';
import { createArtTexture, createRugTexture, createVinylTexture } from './textures';
import type { PlacedItem } from './types';

// Shared helper to create rounded/beveled box via ExtrudeGeometry
function createBeveledBox(w: number, h: number, d: number, bevel = 0.025): THREE.ExtrudeGeometry {
  const hw = Math.max(0.01, w / 2 - bevel);
  const hh = Math.max(0.01, d / 2 - bevel);
  const shape = new THREE.Shape();
  shape.moveTo(-hw, -hh);
  shape.lineTo(hw, -hh);
  shape.lineTo(hw, hh);
  shape.lineTo(-hw, hh);
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.01, h - bevel * 2),
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments: 4,
  });
  geo.rotateX(-Math.PI / 2);
  geo.center();
  return geo;
}

function enableShadows(group: THREE.Object3D, cast = true, receive = true) {
  group.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) {
      obj.castShadow = cast;
      obj.receiveShadow = receive;
    }
  });
}

export interface FurnitureBuildOptions {
  maxAnisotropy: number;
  isGhost?: boolean;
  isSoftwareGl?: boolean;
}

export function buildFurnitureGroup(
  placed: PlacedItem,
  opts: FurnitureBuildOptions
): THREE.Group {
  // Imported GLBs override only the curated catalog ids. Until the remote
  // CC0 model has loaded (or if it is unavailable), the original builder below
  // remains the exact fallback.
  const imported = buildImportedFurnitureGroup(placed, opts);
  if (imported) return imported;

  const group = new THREE.Group();
  group.userData.uid = placed.uid;
  group.userData.catalogId = placed.catalogId;
  group.userData.active = Boolean(placed.active);

  const primaryColor = new THREE.Color(placed.color);
  const fabricMat = new THREE.MeshPhysicalMaterial({
    color: primaryColor,
    roughness: 0.86,
    metalness: 0.0,
    sheen: 0.65,
    sheenRoughness: 0.7,
    sheenColor: new THREE.Color('#ffffff').lerp(primaryColor, 0.5),
  });

  const woodDarkMat = new THREE.MeshStandardMaterial({
    color: 0x5c3c24,
    roughness: 0.52,
    metalness: 0.04,
  });

  const woodPrimaryMat = new THREE.MeshStandardMaterial({
    color: primaryColor,
    roughness: 0.48,
    metalness: 0.04,
  });

  const brassMat = new THREE.MeshStandardMaterial({
    color: 0xd6b25e,
    roughness: 0.24,
    metalness: 0.88,
  });

  const darkMetalMat = new THREE.MeshStandardMaterial({
    color: 0x262930,
    roughness: 0.35,
    metalness: 0.75,
  });

  const creamMat = new THREE.MeshStandardMaterial({
    color: 0xf2ede4,
    roughness: 0.78,
    metalness: 0.02,
  });

  switch (placed.catalogId) {
    case 'plush_sofa': {
      // Plinth base
      const plinth = new THREE.Mesh(createBeveledBox(1.82, 0.11, 0.82, 0.015), woodDarkMat);
      plinth.position.y = 0.16;
      group.add(plinth);

      // 4 tapered legs with brass tips
      const legGeo = new THREE.CylinderGeometry(0.028, 0.018, 0.12, 10);
      const tipGeo = new THREE.CylinderGeometry(0.02, 0.018, 0.03, 10);
      const legOffsets: [number, number][] = [
        [-0.82, -0.32],
        [0.82, -0.32],
        [-0.82, 0.32],
        [0.82, 0.32],
      ];
      for (const [lx, lz] of legOffsets) {
        const leg = new THREE.Mesh(legGeo, woodDarkMat);
        leg.position.set(lx, 0.06, lz);
        group.add(leg);
        const tip = new THREE.Mesh(tipGeo, brassMat);
        tip.position.set(lx, 0.015, lz);
        group.add(tip);
      }

      // Seat cushions (2)
      for (const sx of [-0.43, 0.43]) {
        const seat = new THREE.Mesh(createBeveledBox(0.84, 0.18, 0.78, 0.04), fabricMat);
        seat.position.set(sx, 0.3, 0.04);
        group.add(seat);
      }

      // Backrest frame + 2 cushions
      const backFrame = new THREE.Mesh(createBeveledBox(1.84, 0.46, 0.18, 0.03), fabricMat);
      backFrame.position.set(0, 0.46, -0.34);
      group.add(backFrame);

      for (const bx of [-0.42, 0.42]) {
        const backCushion = new THREE.Mesh(createBeveledBox(0.78, 0.36, 0.16, 0.045), fabricMat);
        backCushion.position.set(bx, 0.52, -0.22);
        backCushion.rotation.x = -0.14;
        group.add(backCushion);
      }

      // Armrests
      for (const ax of [-0.84, 0.84]) {
        const arm = new THREE.Mesh(createBeveledBox(0.18, 0.36, 0.82, 0.04), fabricMat);
        arm.position.set(ax, 0.38, -0.02);
        group.add(arm);
      }

      // Accent throw pillows
      const pillowMat = new THREE.MeshPhysicalMaterial({
        color: 0xd99b52,
        roughness: 0.85,
        sheen: 0.5,
      });
      const p1 = new THREE.Mesh(createBeveledBox(0.3, 0.28, 0.1, 0.03), pillowMat);
      p1.position.set(-0.62, 0.49, -0.1);
      p1.rotation.set(-0.22, 0.35, 0.12);
      group.add(p1);

      const p2 = new THREE.Mesh(createBeveledBox(0.28, 0.26, 0.1, 0.03), creamMat);
      p2.position.set(0.62, 0.48, -0.1);
      p2.rotation.set(-0.2, -0.38, -0.1);
      group.add(p2);
      break;
    }

    case 'lounge_chair': {
      // 4 splayed legs
      const legGeo = new THREE.CylinderGeometry(0.022, 0.014, 0.24, 10);
      const offsets: [number, number][] = [
        [-0.28, -0.26],
        [0.28, -0.26],
        [-0.28, 0.26],
        [0.28, 0.26],
      ];
      for (const [lx, lz] of offsets) {
        const leg = new THREE.Mesh(legGeo, woodDarkMat);
        leg.position.set(lx, 0.11, lz);
        leg.rotation.z = lx > 0 ? -0.14 : 0.14;
        leg.rotation.x = lz > 0 ? 0.14 : -0.14;
        group.add(leg);
      }

      // Base seat ring
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.35, 0.14, 24), fabricMat);
      base.position.y = 0.28;
      group.add(base);

      // Plump seat cushion
      const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.12, 24), fabricMat);
      seat.position.y = 0.38;
      group.add(seat);

      // Curved barrel backrest arc
      const arcGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.46, 24, 1, true, Math.PI * 0.68, Math.PI * 1.15);
      const backShell = new THREE.Mesh(
        arcGeo,
        new THREE.MeshPhysicalMaterial({
          color: primaryColor,
          roughness: 0.82,
          side: THREE.DoubleSide,
          sheen: 0.6,
        })
      );
      backShell.position.set(0, 0.56, 0.02);
      // Thick rim tube around barrel top
      group.add(backShell);

      // Solid thick curved backrest segments for solid PBR volume
      for (let i = -3; i <= 3; i++) {
        const angle = i * 0.32;
        const seg = new THREE.Mesh(createBeveledBox(0.22, 0.42, 0.12, 0.035), fabricMat);
        seg.position.set(Math.sin(angle) * 0.35, 0.56, -Math.cos(angle) * 0.33);
        seg.rotation.y = -angle;
        group.add(seg);
      }

      // Lumbar accent pillow
      const pillow = new THREE.Mesh(createBeveledBox(0.32, 0.22, 0.09, 0.03), creamMat);
      pillow.position.set(0, 0.52, -0.14);
      pillow.rotation.x = -0.2;
      group.add(pillow);
      break;
    }

    case 'bar_stool': {
      // Pedestal disc
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.24, 0.03, 24), darkMetalMat);
      base.position.y = 0.015;
      group.add(base);

      // Column
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.038, 0.54, 16), brassMat);
      col.position.y = 0.28;
      group.add(col);

      // Footrest ring
      const footRing = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.014, 10, 24), brassMat);
      footRing.rotation.x = Math.PI / 2;
      footRing.position.y = 0.23;
      group.add(footRing);

      // Spokes to footrest
      for (let i = 0; i < 3; i++) {
        const spoke = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.16, 8), brassMat);
        spoke.rotation.z = Math.PI / 2;
        spoke.rotation.y = (i * Math.PI * 2) / 3;
        spoke.position.set(Math.cos((i * Math.PI * 2) / 3) * 0.08, 0.23, -Math.sin((i * Math.PI * 2) / 3) * 0.08);
        group.add(spoke);
      }

      // Wooden seat pan + upholstered cushion
      const pan = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.19, 0.04, 24), woodDarkMat);
      pan.position.y = 0.55;
      group.add(pan);

      const cushion = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.21, 0.08, 24), fabricMat);
      cushion.position.y = 0.6;
      group.add(cushion);
      break;
    }

    case 'cozy_bed': {
      // 4 legs
      const legGeo = new THREE.CylinderGeometry(0.035, 0.025, 0.16, 12);
      for (const [lx, lz] of [
        [-0.86, -0.86],
        [0.86, -0.86],
        [-0.86, 0.86],
        [0.86, 0.86],
      ]) {
        const leg = new THREE.Mesh(legGeo, woodDarkMat);
        leg.position.set(lx, 0.08, lz);
        group.add(leg);
      }

      // Platform frame
      const frame = new THREE.Mesh(createBeveledBox(1.86, 0.14, 1.88, 0.02), woodDarkMat);
      frame.position.y = 0.21;
      group.add(frame);

      // Slatted oak headboard
      const hbRail = new THREE.Mesh(createBeveledBox(1.86, 0.1, 0.08, 0.015), woodDarkMat);
      hbRail.position.set(0, 0.94, -0.9);
      group.add(hbRail);

      for (let i = -4; i <= 4; i++) {
        const slat = new THREE.Mesh(createBeveledBox(0.14, 0.66, 0.05, 0.01), woodDarkMat);
        slat.position.set(i * 0.2, 0.6, -0.9);
        group.add(slat);
      }

      // Crisp white mattress
      const mattress = new THREE.Mesh(createBeveledBox(1.74, 0.2, 1.76, 0.04), creamMat);
      mattress.position.set(0, 0.37, 0.02);
      group.add(mattress);

      // Folded duvet (primary color)
      const duvet = new THREE.Mesh(createBeveledBox(1.78, 0.15, 1.18, 0.045), fabricMat);
      duvet.position.set(0, 0.42, 0.31);
      group.add(duvet);

      // 2 plump pillows
      for (const px of [-0.42, 0.42]) {
        const pillow = new THREE.Mesh(createBeveledBox(0.62, 0.14, 0.38, 0.05), creamMat);
        pillow.position.set(px, 0.52, -0.58);
        pillow.rotation.x = 0.16;
        group.add(pillow);
      }
      break;
    }

    case 'coffee_table': {
      // 4 angled wood legs
      const legGeo = new THREE.CylinderGeometry(0.026, 0.016, 0.38, 10);
      for (const [lx, lz] of [
        [-0.72, -0.3],
        [0.72, -0.3],
        [-0.72, 0.3],
        [0.72, 0.3],
      ]) {
        const leg = new THREE.Mesh(legGeo, woodPrimaryMat);
        leg.position.set(lx, 0.19, lz);
        group.add(leg);
      }

      // Lower shelf
      const shelf = new THREE.Mesh(createBeveledBox(1.4, 0.035, 0.56, 0.01), woodPrimaryMat);
      shelf.position.y = 0.16;
      group.add(shelf);

      // Tabletop
      const top = new THREE.Mesh(createBeveledBox(1.66, 0.055, 0.78, 0.02), woodPrimaryMat);
      top.position.y = 0.39;
      group.add(top);

      // Art books stack
      const book1 = new THREE.Mesh(
        createBeveledBox(0.32, 0.04, 0.24, 0.006),
        new THREE.MeshStandardMaterial({ color: 0x3b526b, roughness: 0.7 })
      );
      book1.position.set(-0.34, 0.44, 0.04);
      book1.rotation.y = 0.15;
      group.add(book1);

      const book2 = new THREE.Mesh(
        createBeveledBox(0.26, 0.032, 0.2, 0.006),
        new THREE.MeshStandardMaterial({ color: 0xc97055, roughness: 0.7 })
      );
      book2.position.set(-0.33, 0.476, 0.03);
      book2.rotation.y = -0.12;
      group.add(book2);

      // Ceramic mug
      const mug = new THREE.Mesh(
        new THREE.CylinderGeometry(0.045, 0.04, 0.09, 16),
        new THREE.MeshPhysicalMaterial({ color: 0xf4efe6, roughness: 0.2, clearcoat: 0.7 })
      );
      mug.position.set(0.34, 0.46, -0.05);
      group.add(mug);

      const handle = new THREE.Mesh(new THREE.TorusGeometry(0.028, 0.007, 8, 16, Math.PI), creamMat);
      handle.position.set(0.385, 0.46, -0.05);
      handle.rotation.z = -Math.PI / 2;
      group.add(handle);
      break;
    }

    case 'side_desk': {
      // 4 legs
      const legGeo = new THREE.CylinderGeometry(0.025, 0.018, 0.72, 10);
      for (const [lx, lz] of [
        [-0.82, -0.34],
        [0.82, -0.34],
        [-0.82, 0.34],
        [0.82, 0.34],
      ]) {
        const leg = new THREE.Mesh(legGeo, darkMetalMat);
        leg.position.set(lx, 0.36, lz);
        group.add(leg);
      }

      // Desk drawer apron
      const apron = new THREE.Mesh(createBeveledBox(1.66, 0.12, 0.7, 0.015), woodPrimaryMat);
      apron.position.y = 0.67;
      group.add(apron);

      // Drawer fronts & brass pulls
      for (const dx of [-0.42, 0.42]) {
        const drawer = new THREE.Mesh(createBeveledBox(0.72, 0.09, 0.025, 0.006), woodPrimaryMat);
        drawer.position.set(dx, 0.67, 0.355);
        group.add(drawer);
        const pull = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.016, 0.02), brassMat);
        pull.position.set(dx, 0.67, 0.375);
        group.add(pull);
      }

      // Desktop
      const top = new THREE.Mesh(createBeveledBox(1.78, 0.045, 0.8, 0.015), woodPrimaryMat);
      top.position.y = 0.745;
      group.add(top);

      // Open laptop
      const laptopBase = new THREE.Mesh(createBeveledBox(0.38, 0.015, 0.26, 0.004), darkMetalMat);
      laptopBase.position.set(-0.08, 0.775, 0.05);
      group.add(laptopBase);

      const laptopLid = new THREE.Mesh(createBeveledBox(0.38, 0.24, 0.012, 0.004), darkMetalMat);
      laptopLid.position.set(-0.08, 0.89, -0.09);
      laptopLid.rotation.x = -0.24;
      group.add(laptopLid);

      const laptopGlow = new THREE.Mesh(
        new THREE.PlaneGeometry(0.34, 0.2),
        new THREE.MeshStandardMaterial({
          color: 0xaad4f5,
          emissive: 0x5da9e9,
          emissiveIntensity: 0.75,
          roughness: 0.2,
        })
      );
      laptopGlow.position.set(-0.08, 0.89, -0.082);
      laptopGlow.rotation.x = -0.24;
      group.add(laptopGlow);

      // Pen cup
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.04, 0.11, 14), brassMat);
      cup.position.set(0.55, 0.82, -0.14);
      group.add(cup);
      break;
    }

    case 'record_console': {
      // 4 legs with brass feet
      const legGeo = new THREE.CylinderGeometry(0.025, 0.016, 0.22, 10);
      for (const [lx, lz] of [
        [-0.78, -0.28],
        [0.78, -0.28],
        [-0.78, 0.28],
        [0.78, 0.28],
      ]) {
        const leg = new THREE.Mesh(legGeo, woodPrimaryMat);
        leg.position.set(lx, 0.11, lz);
        group.add(leg);
      }

      // Main credenza cabinet
      const body = new THREE.Mesh(createBeveledBox(1.74, 0.48, 0.68, 0.02), woodPrimaryMat);
      body.position.y = 0.45;
      group.add(body);

      // Sliding doors + brass handles
      for (const dx of [-0.41, 0.41]) {
        const door = new THREE.Mesh(createBeveledBox(0.76, 0.38, 0.03, 0.008), woodDarkMat);
        door.position.set(dx, 0.45, 0.335);
        group.add(door);
        const knob = new THREE.Mesh(new THREE.SphereGeometry(0.018, 12, 12), brassMat);
        knob.position.set(dx + (dx < 0 ? 0.28 : -0.28), 0.45, 0.36);
        group.add(knob);
      }

      // Turntable deck
      const deck = new THREE.Mesh(createBeveledBox(0.56, 0.055, 0.44, 0.01), darkMetalMat);
      deck.position.set(-0.34, 0.72, 0.02);
      group.add(deck);

      // Vinyl platter
      const vinylTex = createVinylTexture(opts.maxAnisotropy);
      const vinyl = new THREE.Mesh(
        new THREE.CylinderGeometry(0.16, 0.16, 0.012, 32),
        new THREE.MeshStandardMaterial({
          map: vinylTex,
          roughness: 0.25,
          metalness: 0.15,
        })
      );
      vinyl.position.set(-0.38, 0.755, 0.02);
      group.add(vinyl);
      group.userData.vinylMesh = vinyl;

      // Tonearm
      const toneBase = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.028, 0.03, 12), brassMat);
      toneBase.position.set(-0.14, 0.76, -0.1);
      group.add(toneBase);

      const toneArm = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.2, 8), brassMat);
      toneArm.rotation.x = Math.PI / 2;
      toneArm.rotation.z = 0.38;
      toneArm.position.set(-0.19, 0.772, 0.0);
      group.add(toneArm);

      // Power LED
      const ledMat = new THREE.MeshStandardMaterial({
        color: placed.active ? 0x4ade80 : 0x4b5563,
        emissive: placed.active ? 0x22c55e : 0x000000,
        emissiveIntensity: placed.active ? 1.8 : 0,
      });
      const led = new THREE.Mesh(new THREE.SphereGeometry(0.012, 10, 10), ledMat);
      led.position.set(-0.12, 0.75, 0.18);
      group.add(led);
      group.userData.ledMat = ledMat;

      // Decorative stacked vinyl sleeves beside turntable
      const sleeve = new THREE.Mesh(
        createBeveledBox(0.36, 0.035, 0.36, 0.005),
        new THREE.MeshStandardMaterial({ color: 0xe68a5c, roughness: 0.65 })
      );
      sleeve.position.set(0.4, 0.71, 0.02);
      sleeve.rotation.y = 0.18;
      group.add(sleeve);
      break;
    }

    case 'media_tv': {
      // Low console
      const stand = new THREE.Mesh(createBeveledBox(1.8, 0.36, 0.56, 0.02), woodPrimaryMat);
      stand.position.y = 0.24;
      group.add(stand);

      for (const lx of [-0.78, 0.78]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.018, 0.1, 10), darkMetalMat);
        leg.position.set(lx, 0.05, 0);
        group.add(leg);
      }

      // TV stand neck + base
      const tvBase = new THREE.Mesh(createBeveledBox(0.44, 0.025, 0.22, 0.005), darkMetalMat);
      tvBase.position.set(0, 0.435, -0.04);
      group.add(tvBase);

      const tvNeck = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.16, 0.05), darkMetalMat);
      tvNeck.position.set(0, 0.51, -0.06);
      group.add(tvNeck);

      // Widescreen TV bezel
      const bezel = new THREE.Mesh(createBeveledBox(1.52, 0.88, 0.045, 0.012), darkMetalMat);
      bezel.position.set(0, 0.96, -0.05);
      group.add(bezel);

      // Dynamic Canvas Screen
      const tvCanvas = document.createElement('canvas');
      tvCanvas.width = 256;
      tvCanvas.height = 144;
      const tvCtx = tvCanvas.getContext('2d')!;
      const tvTex = new THREE.CanvasTexture(tvCanvas);
      tvTex.colorSpace = THREE.SRGBColorSpace;

      const screenMat = new THREE.MeshStandardMaterial({
        map: tvTex,
        emissiveMap: tvTex,
        emissive: new THREE.Color(placed.active ? 0xffffff : 0x000000),
        emissiveIntensity: placed.active ? 0.85 : 0,
        roughness: 0.18,
        metalness: 0.1,
      });

      const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.42, 0.78), screenMat);
      screen.position.set(0, 0.96, -0.024);
      group.add(screen);

      group.userData.tvCanvas = tvCanvas;
      group.userData.tvCtx = tvCtx;
      group.userData.tvTex = tvTex;
      group.userData.tvMat = screenMat;
      break;
    }

    case 'fireplace': {
      // Hearth base slab
      const hearth = new THREE.Mesh(createBeveledBox(1.76, 0.12, 0.74, 0.015), woodPrimaryMat);
      hearth.position.y = 0.06;
      group.add(hearth);

      // Left & Right columns
      for (const cx of [-0.62, 0.62]) {
        const col = new THREE.Mesh(createBeveledBox(0.36, 0.92, 0.62, 0.015), woodPrimaryMat);
        col.position.set(cx, 0.56, -0.04);
        group.add(col);
      }

      // Back firebox wall
      const backBox = new THREE.Mesh(
        new THREE.BoxGeometry(0.92, 0.76, 0.16),
        new THREE.MeshStandardMaterial({ color: 0x1e2024, roughness: 0.9 })
      );
      backBox.position.set(0, 0.48, -0.26);
      group.add(backBox);

      // Top mantel lintel
      const mantel = new THREE.Mesh(createBeveledBox(1.82, 0.18, 0.7, 0.02), woodPrimaryMat);
      mantel.position.set(0, 1.08, -0.04);
      group.add(mantel);

      // Birch logs
      const logMat = new THREE.MeshStandardMaterial({ color: 0x6e4f3a, roughness: 0.85 });
      const log1 = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.07, 0.52, 10), logMat);
      log1.rotation.z = Math.PI / 2;
      log1.position.set(0, 0.18, -0.04);
      group.add(log1);

      const log2 = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.06, 0.46, 10), logMat);
      log2.rotation.z = Math.PI / 2;
      log2.rotation.y = 0.25;
      log2.position.set(0.02, 0.25, -0.08);
      group.add(log2);

      // Ember bed
      const emberMat = new THREE.MeshStandardMaterial({
        color: 0xff5a1f,
        emissive: 0xff4500,
        emissiveIntensity: placed.active ? 1.6 : 0.05,
        roughness: 0.8,
      });
      const embers = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.05, 0.26), emberMat);
      embers.position.set(0, 0.14, -0.06);
      group.add(embers);
      group.userData.emberMat = emberMat;

      // Animated Flame Tongues
      const flames: THREE.Mesh[] = [];
      const flameMat = new THREE.MeshStandardMaterial({
        color: 0xffb347,
        emissive: 0xff6a00,
        emissiveIntensity: 2.2,
        roughness: 0.4,
        transparent: true,
        opacity: 0.9,
      });
      for (let i = 0; i < 4; i++) {
        const flame = new THREE.Mesh(new THREE.ConeGeometry(0.07 - i * 0.008, 0.24 + (i % 2) * 0.08, 8), flameMat);
        flame.position.set((i - 1.5) * 0.11, 0.31, -0.05 + (i % 2) * 0.03);
        flame.visible = Boolean(placed.active);
        group.add(flame);
        flames.push(flame);
      }
      group.userData.flames = flames;

      if (!opts.isGhost) {
        const fireLight = new THREE.PointLight(0xff7b29, placed.active ? 2.4 : 0, 6.5, 1.6);
        fireLight.position.set(0, 0.42, 0.2);
        group.add(fireLight);
        group.userData.light = fireLight;
      }
      break;
    }

    case 'bookshelf': {
      // Vertical sides
      for (const sx of [-0.36, 0.36]) {
        const side = new THREE.Mesh(createBeveledBox(0.05, 1.68, 0.38, 0.008), woodPrimaryMat);
        side.position.set(sx, 0.84, 0);
        group.add(side);
      }

      // 5 horizontal shelves
      for (let s = 0; s < 5; s++) {
        const shelf = new THREE.Mesh(createBeveledBox(0.74, 0.04, 0.38, 0.006), woodPrimaryMat);
        shelf.position.set(0, 0.08 + s * 0.39, 0);
        group.add(shelf);
      }

      // Books & objects on shelves
      const bookPalette = [0xc9644a, 0x4b749f, 0xd8a648, 0x678f75, 0x7e5f7c, 0xebe4d8];
      for (let row = 0; row < 3; row++) {
        const baseY = 0.1 + row * 0.39;
        for (let b = 0; b < 4; b++) {
          const bh = 0.18 + ((row + b) % 3) * 0.04;
          const book = new THREE.Mesh(
            new THREE.BoxGeometry(0.055, bh, 0.24),
            new THREE.MeshStandardMaterial({
              color: bookPalette[(row * 3 + b) % bookPalette.length],
              roughness: 0.72,
            })
          );
          book.position.set(-0.24 + b * 0.068 + (row === 1 ? 0.28 : 0), baseY + bh / 2, 0.02);
          group.add(book);
        }
      }

      // Ceramic vase on top shelf
      const vasePoints = [
        new THREE.Vector2(0, 0),
        new THREE.Vector2(0.065, 0),
        new THREE.Vector2(0.085, 0.08),
        new THREE.Vector2(0.042, 0.16),
        new THREE.Vector2(0.055, 0.2),
        new THREE.Vector2(0, 0.2),
      ];
      const vase = new THREE.Mesh(
        new THREE.LatheGeometry(vasePoints, 18),
        new THREE.MeshPhysicalMaterial({ color: 0x456b7a, roughness: 0.25, clearcoat: 0.6 })
      );
      vase.position.set(0.18, 1.27, 0);
      group.add(vase);
      break;
    }

    case 'arc_lamp': {
      const metalChoiceMat = new THREE.MeshStandardMaterial({
        color: primaryColor,
        roughness: 0.24,
        metalness: 0.85,
      });

      // Honed marble cylinder base
      const base = new THREE.Mesh(
        new THREE.CylinderGeometry(0.2, 0.22, 0.08, 24),
        new THREE.MeshStandardMaterial({ color: 0xece8e0, roughness: 0.28, metalness: 0.05 })
      );
      base.position.set(0, 0.04, -0.18);
      group.add(base);

      // Curved arc tube stem
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 0.08, -0.18),
        new THREE.Vector3(0, 1.15, -0.2),
        new THREE.Vector3(0, 1.88, -0.04),
        new THREE.Vector3(0, 1.84, 0.22),
      ]);
      const stem = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.022, 10, false), metalChoiceMat);
      group.add(stem);

      // Linen drum shade
      const shadeMat = new THREE.MeshStandardMaterial({
        color: 0xf7f1e6,
        emissive: 0xffd79e,
        emissiveIntensity: placed.active ? 0.65 : 0.02,
        roughness: 0.9,
        side: THREE.DoubleSide,
      });
      const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.23, 0.28, 24, 1, true), shadeMat);
      shade.position.set(0, 1.7, 0.22);
      group.add(shade);
      group.userData.shadeMat = shadeMat;

      const bulb = new THREE.Mesh(
        new THREE.SphereGeometry(0.055, 14, 14),
        new THREE.MeshStandardMaterial({
          color: 0xfff3d6,
          emissive: 0xffd28a,
          emissiveIntensity: placed.active ? 2.0 : 0.0,
        })
      );
      bulb.position.set(0, 1.69, 0.22);
      group.add(bulb);
      group.userData.bulbMat = bulb.material;

      if (!opts.isGhost) {
        const lampLight = new THREE.PointLight(0xffd296, placed.active ? 2.6 : 0, 7.5, 1.5);
        lampLight.position.set(0, 1.56, 0.22);
        group.add(lampLight);
        group.userData.light = lampLight;
      }
      break;
    }

    case 'table_lamp': {
      // Side pedestal stand
      const standBase = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.2, 0.04, 20), woodDarkMat);
      standBase.position.y = 0.02;
      group.add(standBase);

      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.56, 12), woodDarkMat);
      post.position.y = 0.3;
      group.add(post);

      const tableTop = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.04, 24), woodDarkMat);
      tableTop.position.y = 0.58;
      group.add(tableTop);

      // Sculpted ceramic lamp body via LatheGeometry
      const lathePts = [
        new THREE.Vector2(0, 0),
        new THREE.Vector2(0.09, 0),
        new THREE.Vector2(0.13, 0.1),
        new THREE.Vector2(0.095, 0.22),
        new THREE.Vector2(0.045, 0.29),
        new THREE.Vector2(0, 0.29),
      ];
      const ceramic = new THREE.Mesh(
        new THREE.LatheGeometry(lathePts, 24),
        new THREE.MeshPhysicalMaterial({ color: primaryColor, roughness: 0.22, clearcoat: 0.7 })
      );
      ceramic.position.y = 0.6;
      group.add(ceramic);

      // Brass neck
      const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.07, 12), brassMat);
      neck.position.y = 0.91;
      group.add(neck);

      // Shade
      const shadeMat = new THREE.MeshStandardMaterial({
        color: 0xf7f2e7,
        emissive: 0xffd79b,
        emissiveIntensity: placed.active ? 0.7 : 0.02,
        roughness: 0.88,
        side: THREE.DoubleSide,
      });
      const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.21, 0.24, 24, 1, true), shadeMat);
      shade.position.y = 1.04;
      group.add(shade);
      group.userData.shadeMat = shadeMat;

      if (!opts.isGhost) {
        const lampLight = new THREE.PointLight(0xffd08f, placed.active ? 2.2 : 0, 6.5, 1.5);
        lampLight.position.set(0, 1.02, 0);
        group.add(lampLight);
        group.userData.light = lampLight;
      }
      break;
    }

    case 'monstera_plant': {
      // Sculpted ceramic planter
      const potPts = [
        new THREE.Vector2(0, 0),
        new THREE.Vector2(0.17, 0),
        new THREE.Vector2(0.23, 0.22),
        new THREE.Vector2(0.21, 0.36),
        new THREE.Vector2(0.23, 0.38),
        new THREE.Vector2(0.19, 0.38),
        new THREE.Vector2(0.18, 0.32),
        new THREE.Vector2(0, 0.32),
      ];
      const pot = new THREE.Mesh(
        new THREE.LatheGeometry(potPts, 24),
        new THREE.MeshStandardMaterial({ color: primaryColor, roughness: 0.62 })
      );
      group.add(pot);

      // Dark soil
      const soil = new THREE.Mesh(
        new THREE.CylinderGeometry(0.19, 0.19, 0.02, 18),
        new THREE.MeshStandardMaterial({ color: 0x3b2c22, roughness: 0.95 })
      );
      soil.position.y = 0.33;
      group.add(soil);

      // Leaf shape
      const leafShape = new THREE.Shape();
      leafShape.moveTo(0, 0);
      leafShape.bezierCurveTo(0.16, 0.08, 0.22, 0.28, 0, 0.42);
      leafShape.bezierCurveTo(-0.22, 0.28, -0.16, 0.08, 0, 0);
      const leafGeo = new THREE.ExtrudeGeometry(leafShape, {
        depth: 0.012,
        bevelEnabled: true,
        bevelSize: 0.005,
        bevelThickness: 0.005,
        bevelSegments: 2,
      });

      const leaves: THREE.Object3D[] = [];
      const leafColors = [0x3b6e4c, 0x49825a, 0x356243, 0x568d65];
      for (let i = 0; i < 7; i++) {
        const angle = (i / 7) * Math.PI * 2 + 0.3;
        const height = 0.62 + (i % 3) * 0.18;
        const reach = 0.18 + (i % 2) * 0.1;

        const pivot = new THREE.Group();
        pivot.position.set(0, 0.34, 0);
        pivot.rotation.y = angle;

        const stemCurve = new THREE.CatmullRomCurve3([
          new THREE.Vector3(0, 0, 0),
          new THREE.Vector3(0, height * 0.55, reach * 0.45),
          new THREE.Vector3(0, height - 0.34, reach),
        ]);
        const stem = new THREE.Mesh(
          new THREE.TubeGeometry(stemCurve, 8, 0.012, 6, false),
          new THREE.MeshStandardMaterial({ color: 0x3c6947, roughness: 0.7 })
        );
        pivot.add(stem);

        const leaf = new THREE.Mesh(
          leafGeo,
          new THREE.MeshStandardMaterial({
            color: leafColors[i % leafColors.length],
            roughness: 0.42,
            metalness: 0.04,
          })
        );
        leaf.position.set(0, height - 0.34, reach);
        leaf.rotation.x = 0.85 + (i % 2) * 0.25;
        leaf.scale.setScalar(0.85 + (i % 3) * 0.14);
        pivot.add(leaf);

        group.add(pivot);
        leaves.push(pivot);
      }
      group.userData.plantLeaves = leaves;
      break;
    }

    case 'woven_rug': {
      const rugTex = createRugTexture(placed.color, opts.maxAnisotropy);
      const rugMat = new THREE.MeshPhysicalMaterial({
        map: rugTex,
        roughness: 0.94,
        metalness: 0.0,
        sheen: 0.35,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      });
      const rugBody = new THREE.Mesh(createBeveledBox(2.92, 0.024, 1.92, 0.008), rugMat);
      rugBody.position.y = 0.012;
      group.add(rugBody);

      // Fringe tassels on short ends
      const tasselGeo = new THREE.BoxGeometry(0.06, 0.008, 0.022);
      for (const sideX of [-1.48, 1.48]) {
        for (let t = -8; t <= 8; t++) {
          const tassel = new THREE.Mesh(tasselGeo, creamMat);
          tassel.position.set(sideX, 0.006, t * 0.11);
          group.add(tassel);
        }
      }
      break;
    }

    case 'wall_art': {
      // Frame bars
      const frameMat = woodDarkMat;
      const topBar = new THREE.Mesh(new THREE.BoxGeometry(1.56, 0.06, 0.06), frameMat);
      topBar.position.set(0, 0.52, 0);
      group.add(topBar);

      const botBar = new THREE.Mesh(new THREE.BoxGeometry(1.56, 0.06, 0.06), frameMat);
      botBar.position.set(0, -0.52, 0);
      group.add(botBar);

      const leftBar = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.1, 0.06), frameMat);
      leftBar.position.set(-0.75, 0, 0);
      group.add(leftBar);

      const rightBar = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.1, 0.06), frameMat);
      rightBar.position.set(0.75, 0, 0);
      group.add(rightBar);

      // Artwork canvas
      const artTex = createArtTexture(placed.color, opts.maxAnisotropy);
      const artMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(1.44, 0.98),
        new THREE.MeshStandardMaterial({ map: artTex, roughness: 0.45 })
      );
      artMesh.position.z = 0.015;
      group.add(artMesh);
      break;
    }

    case 'wall_shelf': {
      const shelf = new THREE.Mesh(createBeveledBox(1.58, 0.055, 0.28, 0.01), woodPrimaryMat);
      shelf.position.set(0, 0, 0.12);
      group.add(shelf);

      // 2 brass brackets
      for (const bx of [-0.54, 0.54]) {
        const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.14, 0.2), brassMat);
        bracket.position.set(bx, -0.09, 0.1);
        group.add(bracket);
      }

      // 3 leaning mini books
      const bookCols = [0xc9644a, 0x4b749f, 0x678f75];
      for (let i = 0; i < 3; i++) {
        const b = new THREE.Mesh(
          new THREE.BoxGeometry(0.05, 0.22 - i * 0.02, 0.16),
          new THREE.MeshStandardMaterial({ color: bookCols[i], roughness: 0.7 })
        );
        b.position.set(-0.48 + i * 0.06, 0.13 - i * 0.01, 0.12);
        group.add(b);
      }

      // Small trailing pot
      const pot = new THREE.Mesh(
        new THREE.CylinderGeometry(0.075, 0.06, 0.12, 14),
        creamMat
      );
      pot.position.set(0.42, 0.088, 0.13);
      group.add(pot);

      const foliageMat = new THREE.MeshStandardMaterial({ color: 0x4e865c, roughness: 0.55 });
      for (let v = 0; v < 5; v++) {
        const leafBall = new THREE.Mesh(new THREE.SphereGeometry(0.042, 10, 10), foliageMat);
        leafBall.position.set(0.42 + (v % 2) * 0.04, 0.16 - v * 0.045, 0.16 + v * 0.018);
        group.add(leafBall);
      }
      break;
    }

    case 'sectional_sofa': {
      // Main 2.8m north bench + 1.8m left chaise return (fits inside 3x2m footprint)
      const plinthMain = new THREE.Mesh(createBeveledBox(2.76, 0.12, 0.88, 0.015), woodDarkMat);
      plinthMain.position.set(0, 0.15, -0.45);
      group.add(plinthMain);

      const plinthChaise = new THREE.Mesh(createBeveledBox(0.92, 0.12, 0.96, 0.015), woodDarkMat);
      plinthChaise.position.set(-0.92, 0.15, 0.42);
      group.add(plinthChaise);

      const legGeo = new THREE.CylinderGeometry(0.026, 0.018, 0.12, 10);
      for (const [lx, lz] of [
        [-1.28, -0.82],
        [1.28, -0.82],
        [1.28, -0.08],
        [-1.28, 0.82],
        [-0.54, 0.82],
      ]) {
        const leg = new THREE.Mesh(legGeo, brassMat);
        leg.position.set(lx, 0.06, lz);
        group.add(leg);
      }

      for (const sx of [-0.9, 0.0, 0.9]) {
        const seat = new THREE.Mesh(createBeveledBox(0.86, 0.18, 0.82, 0.04), fabricMat);
        seat.position.set(sx, 0.3, -0.44);
        group.add(seat);
      }
      const chaiseSeat = new THREE.Mesh(createBeveledBox(0.88, 0.18, 0.96, 0.04), fabricMat);
      chaiseSeat.position.set(-0.91, 0.3, 0.42);
      group.add(chaiseSeat);

      const backWall = new THREE.Mesh(createBeveledBox(2.8, 0.46, 0.18, 0.03), fabricMat);
      backWall.position.set(0, 0.46, -0.83);
      group.add(backWall);

      for (const bx of [-0.88, 0.0, 0.88]) {
        const cush = new THREE.Mesh(createBeveledBox(0.82, 0.35, 0.16, 0.04), fabricMat);
        cush.position.set(bx, 0.52, -0.71);
        cush.rotation.x = -0.14;
        group.add(cush);
      }

      const armL = new THREE.Mesh(createBeveledBox(0.18, 0.36, 1.76, 0.04), fabricMat);
      armL.position.set(-1.35, 0.38, -0.02);
      group.add(armL);
      const armR = new THREE.Mesh(createBeveledBox(0.18, 0.36, 0.88, 0.04), fabricMat);
      armR.position.set(1.35, 0.38, -0.45);
      group.add(armR);

      const accentMat = new THREE.MeshPhysicalMaterial({ color: 0xd99b52, roughness: 0.82, sheen: 0.5 });
      const p1 = new THREE.Mesh(createBeveledBox(0.32, 0.28, 0.11, 0.03), accentMat);
      p1.position.set(-1.08, 0.5, -0.55);
      p1.rotation.set(-0.2, 0.42, 0.1);
      group.add(p1);
      const p2 = new THREE.Mesh(createBeveledBox(0.3, 0.26, 0.1, 0.03), creamMat);
      p2.position.set(1.06, 0.5, -0.58);
      p2.rotation.set(-0.2, -0.35, -0.08);
      group.add(p2);
      break;
    }

    case 'dining_set': {
      // Round Pedestal Dining Table + 2 Sculpted Dining Chairs (2x2m)
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.38, 0.04, 24), darkMetalMat);
      base.position.y = 0.02;
      group.add(base);
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.72, 16), woodPrimaryMat);
      col.position.y = 0.38;
      group.add(col);
      const top = new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.56, 0.05, 28), woodPrimaryMat);
      top.position.y = 0.755;
      group.add(top);

      // Centerpiece vase
      const vase = new THREE.Mesh(
        new THREE.CylinderGeometry(0.055, 0.075, 0.2, 16),
        new THREE.MeshPhysicalMaterial({ color: 0x3b6b58, roughness: 0.2, clearcoat: 0.7 })
      );
      vase.position.set(0, 0.88, 0);
      group.add(vase);

      // Left & Right chairs
      for (const side of [-1, 1]) {
        const cx = side * 0.72;
        const chair = new THREE.Group();
        chair.position.set(cx, 0, 0);
        chair.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2;

        for (const [lx, lz] of [
          [-0.17, -0.17],
          [0.17, -0.17],
          [-0.17, 0.17],
          [0.17, 0.17],
        ]) {
          const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.013, 0.44, 8), darkMetalMat);
          leg.position.set(lx, 0.22, lz);
          chair.add(leg);
        }
        const seat = new THREE.Mesh(createBeveledBox(0.42, 0.06, 0.42, 0.015), creamMat);
        seat.position.y = 0.45;
        chair.add(seat);
        const back = new THREE.Mesh(createBeveledBox(0.42, 0.36, 0.05, 0.015), woodPrimaryMat);
        back.position.set(0, 0.66, -0.19);
        back.rotation.x = -0.1;
        chair.add(back);
        group.add(chair);
      }
      break;
    }

    case 'espresso_bar': {
      const cabinet = new THREE.Mesh(createBeveledBox(1.76, 0.86, 0.72, 0.02), woodPrimaryMat);
      cabinet.position.y = 0.43;
      group.add(cabinet);

      const marbleTop = new THREE.Mesh(
        createBeveledBox(1.82, 0.055, 0.78, 0.015),
        new THREE.MeshPhysicalMaterial({ color: 0xf4efe6, roughness: 0.18, clearcoat: 0.6 })
      );
      marbleTop.position.y = 0.89;
      group.add(marbleTop);

      // Espresso Machine
      const machine = new THREE.Mesh(createBeveledBox(0.42, 0.38, 0.34, 0.015), brassMat);
      machine.position.set(-0.36, 1.11, -0.05);
      group.add(machine);
      const groupHead = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.08, 0.12), darkMetalMat);
      groupHead.position.set(-0.36, 1.14, 0.13);
      group.add(groupHead);

      const statusLedMat = new THREE.MeshStandardMaterial({
        color: placed.active ? 0x39ff14 : 0x4b5563,
        emissive: placed.active ? 0x39ff14 : 0x000000,
        emissiveIntensity: placed.active ? 1.8 : 0,
      });
      const statusLed = new THREE.Mesh(new THREE.SphereGeometry(0.016, 10, 10), statusLedMat);
      statusLed.position.set(-0.22, 1.24, 0.12);
      group.add(statusLed);

      // Ceramic Espresso Cups & Grinder
      const grinder = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.085, 0.32, 14), darkMetalMat);
      grinder.position.set(0.08, 1.08, -0.06);
      group.add(grinder);

      for (const mx of [0.36, 0.52]) {
        const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.036, 0.08, 12), creamMat);
        cup.position.set(mx, 0.96, 0.06);
        group.add(cup);
      }

      if (!opts.isGhost) {
        const barLight = new THREE.PointLight(0xffd28a, placed.active ? 1.3 : 0, 4.5, 1.6);
        barLight.position.set(-0.36, 1.25, 0.25);
        group.add(barLight);
        group.userData.light = barLight;
      }
      break;
    }

    case 'dual_desk': {
      // Studio Creator Dual-Monitor Desk
      for (const lx of [-0.82, 0.82]) {
        const frame = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.72, 0.66), darkMetalMat);
        frame.position.set(lx, 0.36, 0);
        group.add(frame);
      }
      const top = new THREE.Mesh(createBeveledBox(1.82, 0.05, 0.8, 0.015), woodPrimaryMat);
      top.position.y = 0.745;
      group.add(top);

      // Monitor Stand Bar
      const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.32, 12), darkMetalMat);
      stand.position.set(0, 0.92, -0.2);
      group.add(stand);

      // Dual angled displays
      const screenMats: THREE.MeshStandardMaterial[] = [];
      for (const side of [-1, 1]) {
        const bezel = new THREE.Mesh(createBeveledBox(0.74, 0.44, 0.03, 0.008), darkMetalMat);
        bezel.position.set(side * 0.39, 1.08, -0.15 + Math.abs(side) * 0.03);
        bezel.rotation.y = -side * 0.16;
        group.add(bezel);

        const scrMat = new THREE.MeshStandardMaterial({
          color: placed.active ? 0x102a1e : 0x0d1016,
          emissive: placed.active ? 0x22c55e : 0x000000,
          emissiveIntensity: placed.active ? 0.75 : 0,
          roughness: 0.2,
        });
        screenMats.push(scrMat);
        const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.68, 0.38), scrMat);
        scr.position.set(side * 0.39, 1.08, -0.13 + Math.abs(side) * 0.03);
        scr.rotation.y = -side * 0.16;
        group.add(scr);
      }
      group.userData.dualScreenMats = screenMats;

      // Keyboard & Studio Speakers
      const kb = new THREE.Mesh(createBeveledBox(0.46, 0.018, 0.15, 0.004), darkMetalMat);
      kb.position.set(0, 0.78, 0.12);
      group.add(kb);
      for (const sx of [-0.76, 0.76]) {
        const spk = new THREE.Mesh(createBeveledBox(0.16, 0.24, 0.18, 0.01), darkMetalMat);
        spk.position.set(sx, 0.89, -0.12);
        group.add(spk);
      }
      break;
    }

    case 'olive_tree': {
      // Fluted Architectural Planter + Branching Olive Tree
      const planter = new THREE.Mesh(
        new THREE.CylinderGeometry(0.24, 0.21, 0.42, 20),
        new THREE.MeshStandardMaterial({ color: primaryColor, roughness: 0.72 })
      );
      planter.position.y = 0.21;
      group.add(planter);

      const soil = new THREE.Mesh(
        new THREE.CylinderGeometry(0.21, 0.21, 0.02, 16),
        new THREE.MeshStandardMaterial({ color: 0x3b2c22, roughness: 0.95 })
      );
      soil.position.y = 0.42;
      group.add(soil);

      const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.035, 0.055, 1.15, 10),
        woodDarkMat
      );
      trunk.position.y = 0.98;
      trunk.rotation.z = 0.05;
      group.add(trunk);

      const oliveLeafMat = new THREE.MeshStandardMaterial({ color: 0x6c8768, roughness: 0.75 });
      const oliveLeafMat2 = new THREE.MeshStandardMaterial({ color: 0x809c7c, roughness: 0.72 });
      const crowns: [number, number, number, number][] = [
        [0, 1.66, 0, 0.34],
        [-0.22, 1.48, 0.12, 0.24],
        [0.24, 1.54, -0.1, 0.26],
        [0.06, 1.84, -0.06, 0.25],
      ];
      crowns.forEach(([cx, cy, cz, r], i) => {
        const ball = new THREE.Mesh(
          new THREE.IcosahedronGeometry(r, 1),
          i % 2 === 0 ? oliveLeafMat : oliveLeafMat2
        );
        ball.position.set(cx, cy, cz);
        group.add(ball);
      });
      break;
    }

    case 'floor_mirror': {
      const frameMat = new THREE.MeshStandardMaterial({
        color: primaryColor,
        roughness: 0.26,
        metalness: 0.82,
      });
      const backPlate = new THREE.Mesh(createBeveledBox(0.76, 1.62, 0.045, 0.01), frameMat);
      backPlate.position.set(0, 0.84, -0.05);
      backPlate.rotation.x = -0.08;
      group.add(backPlate);

      const archTop = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.045, 24), frameMat);
      archTop.rotation.x = Math.PI / 2 - 0.08;
      archTop.position.set(0, 1.64, -0.115);
      group.add(archTop);

      const mirrorGlassMat = new THREE.MeshPhysicalMaterial({
        color: 0xe2ecf5,
        roughness: 0.04,
        metalness: 0.92,
        clearcoat: 1.0,
      });
      const glassRect = new THREE.Mesh(new THREE.PlaneGeometry(0.68, 1.54), mirrorGlassMat);
      glassRect.position.set(0, 0.84, -0.025);
      glassRect.rotation.x = -0.08;
      group.add(glassRect);

      const glassArch = new THREE.Mesh(new THREE.CircleGeometry(0.34, 24, 0, Math.PI), mirrorGlassMat);
      glassArch.position.set(0, 1.6, -0.088);
      glassArch.rotation.x = -0.08;
      group.add(glassArch);

      // Rear easel stand leg
      const easel = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.25, 0.04), frameMat);
      easel.position.set(0, 0.62, -0.26);
      easel.rotation.x = 0.28;
      group.add(easel);
      break;
    }

    case 'neon_sign': {
      const backing = new THREE.Mesh(
        createBeveledBox(1.56, 0.56, 0.04, 0.01),
        new THREE.MeshPhysicalMaterial({ color: 0x0d1210, roughness: 0.15, clearcoat: 0.8 })
      );
      group.add(backing);

      const tubeMat = new THREE.MeshStandardMaterial({
        color: primaryColor,
        emissive: primaryColor,
        emissiveIntensity: placed.active ? 2.2 : 0.1,
        roughness: 0.2,
      });
      const borderTube = new THREE.Mesh(new THREE.BoxGeometry(1.44, 0.44, 0.03), tubeMat);
      borderTube.position.z = 0.02;
      group.add(borderTube);

      const innerCut = new THREE.Mesh(
        new THREE.BoxGeometry(1.36, 0.36, 0.034),
        new THREE.MeshStandardMaterial({ color: 0x0b100d, roughness: 0.4 })
      );
      innerCut.position.z = 0.021;
      group.add(innerCut);

      // Neon wave/bolt motif inside frame
      for (let i = -2; i <= 2; i++) {
        const bar = new THREE.Mesh(new THREE.CapsuleGeometry(0.014, 0.14 + (i % 2) * 0.06, 4, 8), tubeMat);
        bar.position.set(i * 0.22, 0, 0.04);
        bar.rotation.z = i % 2 === 0 ? 0.35 : -0.35;
        group.add(bar);
      }

      if (!opts.isGhost) {
        const neonLight = new THREE.PointLight(primaryColor, placed.active ? 1.5 : 0, 4.5, 1.6);
        neonLight.position.set(0, 0, 0.35);
        group.add(neonLight);
        group.userData.light = neonLight;
      }
      group.userData.neonTubeMat = tubeMat;
      break;
    }

    default: {
      const extra = buildExtraFurniture(placed.catalogId, placed, {
        isGhost: opts.isGhost,
        isSoftwareGl: opts.isSoftwareGl,
      });
      if (extra) {
        group.add(extra);
        break;
      }
      // Expanded catalog: resolve the shared record and build its real
      // parametric model (construction, business, nightlife, outdoor, vehicles).
      const entry = getExpansionCatalogItem(placed.catalogId);
      if (entry) {
        const model = buildCatalogModel(entry, {
          color: placed.color,
          active: placed.active,
          isGhost: opts.isGhost,
          isSoftwareGl: opts.isSoftwareGl,
        });
        if (model) group.add(model);
      }
      break;
    }
  }

  if (opts.isGhost) {
    group.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        const ghostMat = new THREE.MeshStandardMaterial({
          color: 0x34d399,
          transparent: true,
          opacity: 0.55,
          roughness: 0.4,
          depthWrite: false,
        });
        mesh.material = ghostMat;
      }
    });
  } else {
    enableShadows(group, placed.catalogId !== 'woven_rug', true);
  }

  return group;
}

export function updateFurnitureAnimations(
  group: THREE.Group,
  placed: PlacedItem,
  elapsed: number,
  delta: number
) {
  const isActive = Boolean(placed.active);

  if (placed.catalogId === 'record_console') {
    const vinyl = group.userData.vinylMesh as THREE.Mesh | undefined;
    if (vinyl && isActive) {
      vinyl.rotation.y -= delta * 2.2;
    }
  } else if (placed.catalogId === 'fireplace') {
    const flames = group.userData.flames as THREE.Mesh[] | undefined;
    const light = group.userData.light as THREE.PointLight | undefined;
    if (flames) {
      flames.forEach((f, idx) => {
        f.visible = isActive;
        if (isActive) {
          const s = 0.85 + Math.sin(elapsed * 11 + idx * 2.1) * 0.25;
          f.scale.set(0.9 + Math.cos(elapsed * 8 + idx) * 0.12, s, 0.9);
          f.rotation.z = Math.sin(elapsed * 9 + idx * 1.4) * 0.14;
        }
      });
    }
    if (light) {
      light.intensity = isActive
        ? 2.2 + Math.sin(elapsed * 13) * 0.35 + Math.cos(elapsed * 7) * 0.2
        : 0;
    }
  } else if (placed.catalogId === 'media_tv') {
    const ctx = group.userData.tvCtx as CanvasRenderingContext2D | undefined;
    const tex = group.userData.tvTex as THREE.CanvasTexture | undefined;
    const mat = group.userData.tvMat as THREE.MeshStandardMaterial | undefined;
    if (ctx && tex && mat) {
      mat.emissiveIntensity = isActive ? 0.88 : 0;
      if (!isActive) {
        ctx.fillStyle = '#0d0f14';
        ctx.fillRect(0, 0, 256, 144);
      } else {
        const grad = ctx.createLinearGradient(0, 0, 0, 144);
        grad.addColorStop(0, '#1e1b4b');
        grad.addColorStop(0.55, '#7c3aed');
        grad.addColorStop(1, '#f97316');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 256, 144);

        ctx.fillStyle = '#fde047';
        ctx.beginPath();
        ctx.arc(128, 66 + Math.sin(elapsed * 0.8) * 4, 24, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        for (let b = 0; b < 16; b++) {
          const bh = 10 + Math.abs(Math.sin(elapsed * 4.5 + b * 0.55)) * 28;
          ctx.fillRect(24 + b * 13, 134 - bh, 8, bh);
        }
      }
      tex.needsUpdate = true;
    }
  } else if (placed.catalogId === 'monstera_plant') {
    const leaves = group.userData.plantLeaves as THREE.Object3D[] | undefined;
    if (leaves) {
      leaves.forEach((pivot, i) => {
        pivot.rotation.x = Math.sin(elapsed * 1.4 + i * 0.9) * 0.035;
      });
    }
  } else if (placed.catalogId === 'neon_sign') {
    const tubeMat = group.userData.neonTubeMat as THREE.MeshStandardMaterial | undefined;
    const light = group.userData.light as THREE.PointLight | undefined;
    if (tubeMat) {
      tubeMat.emissiveIntensity = isActive ? 2.0 + Math.sin(elapsed * 4.5) * 0.35 : 0.08;
    }
    if (light) {
      light.intensity = isActive ? 1.4 + Math.sin(elapsed * 4.5) * 0.25 : 0;
    }
  } else if (placed.catalogId === 'dual_desk') {
    const mats = group.userData.dualScreenMats as THREE.MeshStandardMaterial[] | undefined;
    if (mats) {
      mats.forEach((m) => {
        m.emissiveIntensity = isActive ? 0.8 : 0;
      });
    }
  } else {
    // Expanded collection: TVs, monitors, lamps, fire pit and mirror lighting
    // share one generic emissive hook.
    const mats = group.userData.emissiveMats as THREE.MeshStandardMaterial[] | undefined;
    if (mats) {
      mats.forEach((m) => {
        m.emissiveIntensity = isActive ? 1.05 : 0.04;
      });
    }
    const light = group.userData.light as THREE.PointLight | undefined;
    if (light) light.intensity = isActive ? 1.8 : 0;
  }
}
