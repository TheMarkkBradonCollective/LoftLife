import * as THREE from 'three';

/** Riders stand on this deck, so the server and client share one height. */
export const TRANSIT_DECK_Y = 0.34;

/**
 * The rideable LoftLine tram: deliberately open-sided so passengers (including
 * other players) stay visible from outside while the server drives it.
 */
export function createTransitBusMesh(): THREE.Group {
  const group = new THREE.Group();

  const bodyMat = new THREE.MeshPhysicalMaterial({
    color: 0xe9eeea,
    roughness: 0.34,
    metalness: 0.18,
    clearcoat: 0.55,
  });
  const stripeMat = new THREE.MeshStandardMaterial({ color: 0x16a34a, roughness: 0.42 });
  const neonMat = new THREE.MeshStandardMaterial({
    color: 0x39ff14,
    emissive: 0x39ff14,
    emissiveIntensity: 0.9,
  });
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0x162231,
    roughness: 0.08,
    metalness: 0.2,
    clearcoat: 0.9,
    transparent: true,
    opacity: 0.55,
  });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0x20242b, roughness: 0.55 });
  const seatMat = new THREE.MeshStandardMaterial({ color: 0x1f4d33, roughness: 0.6 });
  const headMat = new THREE.MeshStandardMaterial({
    color: 0xfff8e6,
    emissive: 0xffe6a8,
    emissiveIntensity: 1.1,
  });
  const tailMat = new THREE.MeshStandardMaterial({
    color: 0xdc2626,
    emissive: 0xef4444,
    emissiveIntensity: 1.0,
  });

  const length = 9.4;
  const width = 2.42;

  // Low platform deck (top at TRANSIT_DECK_Y)
  const deck = new THREE.Mesh(
    new THREE.BoxGeometry(width, TRANSIT_DECK_Y, length),
    bodyMat
  );
  deck.position.y = TRANSIT_DECK_Y / 2;
  deck.castShadow = true;
  deck.receiveShadow = true;
  group.add(deck);

  const skirt = new THREE.Mesh(new THREE.BoxGeometry(width + 0.03, 0.14, length + 0.02), stripeMat);
  skirt.position.y = 0.1;
  group.add(skirt);

  const neonLine = new THREE.Mesh(new THREE.BoxGeometry(width + 0.05, 0.05, length + 0.04), neonMat);
  neonLine.position.y = 0.2;
  group.add(neonLine);

  // Waist-high side rails keep the tram open above them.
  for (const side of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.44, length * 0.94), bodyMat);
    rail.position.set((side * width) / 2, TRANSIT_DECK_Y + 0.22, 0);
    group.add(rail);

    const railTop = new THREE.Mesh(
      new THREE.BoxGeometry(0.11, 0.06, length * 0.94),
      neonMat
    );
    railTop.position.set((side * width) / 2, TRANSIT_DECK_Y + 0.45, 0);
    group.add(railTop);
  }

  // A centre handrail gives passengers something to hold (seats themselves are
  // occupied by avatars, which the server positions).
  const handrail = new THREE.Mesh(
    new THREE.CylinderGeometry(0.045, 0.045, length * 0.7, 8),
    seatMat
  );
  handrail.rotation.x = Math.PI / 2;
  handrail.position.set(0, TRANSIT_DECK_Y + 1.0, 0);
  group.add(handrail);
  for (const z of [-2.6, 0, 2.6]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.0, 8), seatMat);
    post.position.set(0, TRANSIT_DECK_Y + 0.5, z);
    group.add(post);
  }

  // Front windscreen + destination board.
  const windshield = new THREE.Mesh(new THREE.BoxGeometry(width * 0.92, 1.15, 0.05), glassMat);
  windshield.position.set(0, TRANSIT_DECK_Y + 0.85, length / 2 - 0.05);
  group.add(windshield);

  const frame = new THREE.Mesh(new THREE.BoxGeometry(width * 0.96, 0.08, 0.1), trimMat);
  frame.position.set(0, TRANSIT_DECK_Y + 1.45, length / 2 - 0.05);
  group.add(frame);

  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#0a0f0c';
    ctx.fillRect(0, 0, 256, 64);
    ctx.fillStyle = '#39ff14';
    ctx.font = 'bold 26px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('LOFTLINE', 128, 34);
  }
  const destTexture = new THREE.CanvasTexture(canvas);
  destTexture.colorSpace = THREE.SRGBColorSpace;
  const board = new THREE.Mesh(
    new THREE.PlaneGeometry(1.7, 0.33),
    new THREE.MeshBasicMaterial({ map: destTexture })
  );
  board.position.set(0, TRANSIT_DECK_Y + 1.68, length / 2 - 0.02);
  group.add(board);

  for (const side of [-1, 1]) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.14, 0.06), headMat);
    lamp.position.set((side * width) / 3, TRANSIT_DECK_Y + 0.2, length / 2 + 0.01);
    group.add(lamp);

    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.18, 0.06), tailMat);
    tail.position.set((side * width) / 3, TRANSIT_DECK_Y + 0.24, -length / 2 - 0.01);
    group.add(tail);
  }

  const wheelGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.24, 14);
  wheelGeo.rotateZ(Math.PI / 2);
  const rimGeo = new THREE.CylinderGeometry(0.17, 0.17, 0.26, 10);
  rimGeo.rotateZ(Math.PI / 2);
  for (const [wx, wz] of [
    [-width / 2 + 0.08, 2.85],
    [width / 2 - 0.08, 2.85],
    [-width / 2 + 0.08, -2.75],
    [width / 2 - 0.08, -2.75],
  ]) {
    const wheel = new THREE.Mesh(wheelGeo, trimMat);
    wheel.position.set(wx, 0.3, wz);
    wheel.add(new THREE.Mesh(rimGeo, trimMat));
    group.add(wheel);
  }

  return group;
}

/** A neon ring + light column marking a LoftLine stop. */
export function createTransitStopMarker(): THREE.Group {
  const group = new THREE.Group();
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(1.5, 0.08, 8, 32),
    new THREE.MeshStandardMaterial({
      color: 0x39ff14,
      emissive: 0x39ff14,
      emissiveIntensity: 1.1,
      transparent: true,
      opacity: 0.85,
    })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.04;
  group.add(ring);

  const column = new THREE.Mesh(
    new THREE.CylinderGeometry(0.07, 0.07, 2.4, 6),
    new THREE.MeshStandardMaterial({
      color: 0x39ff14,
      emissive: 0x22c55e,
      emissiveIntensity: 0.6,
      transparent: true,
      opacity: 0.55,
    })
  );
  column.position.y = 1.2;
  group.add(column);

  return group;
}
