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

/** Signage canvas: dark board with a line-coloured title and subtitle. */
function signTexture(title: string, subtitle: string, color: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#080d0a';
    ctx.fillRect(0, 0, 512, 128);
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 512, 10);
    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 40px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(title, 256, 54);
    ctx.fillStyle = color;
    ctx.font = '22px sans-serif';
    ctx.fillText(subtitle, 256, 94);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Driverless autonomous taxi: compact, yellow, with a lit roof beacon. */
export function createTaxiMesh(): THREE.Group {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshPhysicalMaterial({
    color: 0xf5b718,
    roughness: 0.28,
    metalness: 0.25,
    clearcoat: 0.85,
  });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0x18191c, roughness: 0.6 });
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0x0f172a,
    roughness: 0.08,
    metalness: 0.2,
    transparent: true,
    opacity: 0.42,
  });
  const signMat = new THREE.MeshStandardMaterial({
    color: 0xfef08a,
    emissive: 0xfacc15,
    emissiveIntensity: 1.2,
  });
  const headMat = new THREE.MeshStandardMaterial({
    color: 0xfff8e6,
    emissive: 0xffe6a8,
    emissiveIntensity: 1.0,
  });
  const tailMat = new THREE.MeshStandardMaterial({
    color: 0xdc2626,
    emissive: 0xef4444,
    emissiveIntensity: 1.0,
  });

  const length = 4.7;
  const width = 1.92;
  const chassis = new THREE.Mesh(new THREE.BoxGeometry(width, 0.6, length), bodyMat);
  chassis.position.y = 0.55;
  chassis.castShadow = true;
  group.add(chassis);

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(width * 0.86, 0.58, 2.35), bodyMat);
  cabin.position.set(0, 1.08, -0.15);
  cabin.castShadow = true;
  group.add(cabin);

  const greenhouse = new THREE.Mesh(
    new THREE.BoxGeometry(width * 0.82, 0.5, 2.28),
    glassMat
  );
  greenhouse.position.set(0, 1.1, -0.15);
  group.add(greenhouse);

  const beacon = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.16, 0.28), signMat);
  beacon.position.set(0, 1.5, -0.1);
  group.add(beacon);

  // LiDAR puck makes the "autonomous" part legible from the street.
  const lidar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.14, 0.16, 0.16, 12),
    trimMat
  );
  lidar.position.set(0, 1.62, -1.15);
  group.add(lidar);

  for (const side of [-1, 1]) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.05), headMat);
    lamp.position.set(side * 0.62, 0.58, length / 2 + 0.02);
    group.add(lamp);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.05), tailMat);
    tail.position.set(side * 0.62, 0.62, -length / 2 - 0.02);
    group.add(tail);
  }

  const wheelGeo = new THREE.CylinderGeometry(0.33, 0.33, 0.24, 14);
  wheelGeo.rotateZ(Math.PI / 2);
  for (const [wx, wz] of [
    [-width / 2 + 0.05, 1.5],
    [width / 2 - 0.05, 1.5],
    [-width / 2 + 0.05, -1.45],
    [width / 2 - 0.05, -1.45],
  ]) {
    const wheel = new THREE.Mesh(wheelGeo, trimMat);
    wheel.position.set(wx, 0.33, wz);
    group.add(wheel);
  }

  return group;
}

/** Light-rail car: articulated, platform-height floor, no operator cab crew. */
export function createRailCarMesh(color = '#22c55e'): THREE.Group {
  const group = new THREE.Group();
  const paint = new THREE.Color(color);
  const shellMat = new THREE.MeshPhysicalMaterial({
    color: 0xdbe4e0,
    roughness: 0.3,
    metalness: 0.55,
    clearcoat: 0.7,
  });
  const stripeMat = new THREE.MeshStandardMaterial({
    color: paint,
    emissive: paint,
    emissiveIntensity: 0.35,
  });
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0x10233a,
    roughness: 0.06,
    metalness: 0.15,
    transparent: true,
    opacity: 0.55,
  });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.6 });

  const carLength = 7.0;
  const width = 2.7;
  const floorY = TRANSIT_DECK_Y;
  for (const offset of [-3.55, 3.55]) {
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(width, 2.35, carLength),
      shellMat
    );
    body.position.set(0, floorY + 1.18, offset);
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    for (const side of [-1, 1]) {
      const window = new THREE.Mesh(
        new THREE.BoxGeometry(0.04, 0.95, carLength * 0.78),
        glassMat
      );
      window.position.set(side * (width / 2 + 0.01), floorY + 1.75, offset);
      group.add(window);
      const stripe = new THREE.Mesh(
        new THREE.BoxGeometry(0.05, 0.18, carLength),
        stripeMat
      );
      stripe.position.set(side * (width / 2 + 0.02), floorY + 0.58, offset);
      group.add(stripe);
    }

    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(width * 0.7, 0.2, carLength * 0.8),
      trimMat
    );
    roof.position.set(0, floorY + 2.45, offset);
    group.add(roof);
  }

  // Articulation bellows between the two cars.
  const bellows = new THREE.Mesh(new THREE.BoxGeometry(width * 0.82, 1.5, 0.9), trimMat);
  bellows.position.set(0, floorY + 1.0, 0);
  group.add(bellows);

  // Door pockets, front destination board and lamps.
  const board = new THREE.Mesh(
    new THREE.PlaneGeometry(2.2, 0.44),
    new THREE.MeshBasicMaterial({ map: signTexture('LOFTLINE RAIL', 'CITY LIGHT RAIL', color) })
  );
  board.position.set(0, floorY + 1.9, 7.08);
  group.add(board);

  const lampMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xfef9c3,
    emissiveIntensity: 1.5,
  });
  for (const side of [-1, 1]) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.14, 0.06), lampMat);
    lamp.position.set(side * 0.8, floorY + 0.45, 7.06);
    group.add(lamp);
  }

  // Low platform deck so standing passengers are visible above the sill.
  const deck = new THREE.Mesh(
    new THREE.BoxGeometry(width, floorY, 15),
    trimMat
  );
  deck.position.y = floorY / 2;
  group.add(deck);

  return group;
}

/** Platform, canopy and line sign for a light-rail station. */
export function createRailStationMarker(color = '#22c55e'): THREE.Group {
  const group = new THREE.Group();
  const concrete = new THREE.MeshStandardMaterial({ color: 0x4b5563, roughness: 0.9 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x9ca3af, roughness: 0.4, metalness: 0.6 });
  const glow = new THREE.MeshStandardMaterial({
    color: new THREE.Color(color),
    emissive: new THREE.Color(color),
    emissiveIntensity: 0.9,
  });

  const platform = new THREE.Mesh(new THREE.BoxGeometry(8.4, 0.22, 3.2), concrete);
  platform.position.y = 0.11;
  platform.receiveShadow = true;
  group.add(platform);

  const edge = new THREE.Mesh(new THREE.BoxGeometry(8.4, 0.06, 0.18), glow);
  edge.position.set(0, 0.24, 1.5);
  group.add(edge);

  for (const x of [-3.4, 3.4]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.8, 8), steel);
    post.position.set(x, 1.4, 0);
    group.add(post);
  }
  const canopy = new THREE.Mesh(new THREE.BoxGeometry(8.8, 0.12, 2.4), steel);
  canopy.position.set(0, 2.85, 0);
  canopy.castShadow = true;
  group.add(canopy);

  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(2.8, 0.7),
    new THREE.MeshBasicMaterial({ map: signTexture('LOFTLINE', 'LIGHT RAIL', color) })
  );
  sign.position.set(0, 2.1, 1.22);
  group.add(sign);
  const signBack = sign.clone();
  signBack.rotation.y = Math.PI;
  signBack.position.z = -1.22;
  group.add(signBack);

  return group;
}

/** Intercity station hall marker with a departure board. */
export function createIntercityStation(): THREE.Group {
  const group = new THREE.Group();
  const stone = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.8 });
  const steel = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, roughness: 0.35, metalness: 0.7 });
  const neon = new THREE.MeshStandardMaterial({
    color: 0x39ff14,
    emissive: 0x39ff14,
    emissiveIntensity: 0.9,
  });

  const plinth = new THREE.Mesh(new THREE.BoxGeometry(12, 0.3, 7), stone);
  plinth.position.y = 0.15;
  plinth.receiveShadow = true;
  group.add(plinth);

  for (const [x, z] of [
    [-5.2, -2.6],
    [5.2, -2.6],
    [-5.2, 2.6],
    [5.2, 2.6],
  ]) {
    const column = new THREE.Mesh(new THREE.BoxGeometry(0.22, 4.4, 0.22), steel);
    column.position.set(x, 2.5, z);
    group.add(column);
  }
  const roof = new THREE.Mesh(new THREE.BoxGeometry(12.6, 0.22, 7.6), steel);
  roof.position.y = 4.7;
  roof.castShadow = true;
  group.add(roof);
  const roofGlow = new THREE.Mesh(new THREE.BoxGeometry(12.2, 0.05, 0.24), neon);
  roofGlow.position.set(0, 4.58, 3.65);
  group.add(roofGlow);

  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(6.4, 1.5),
    new THREE.MeshBasicMaterial({
      map: signTexture('LOFTLIFE CENTRAL', 'INTERCITY RAIL · PLATFORM 1', '#39ff14'),
    })
  );
  sign.position.set(0, 3.2, 3.54);
  group.add(sign);
  const back = sign.clone();
  back.rotation.y = Math.PI;
  back.position.z = -3.54;
  group.add(back);

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
