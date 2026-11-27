import * as THREE from 'three';
import { CITY_SLOPE } from './cityLayout';
import {
  CITY_VENUES,
  type CityVenue,
  type VenueId,
  type VenueInteractionPoint,
  type VenueSeat,
} from './venues';

/**
 * Builds the downtown public destinations: landmark facades plus walkable
 * interiors with real furniture, counters and seating.
 *
 * Everything is modelled in the diagonal street space (u, z) and the returned
 * group carries a shear matrix so the buildings line up with the A–Z streets.
 * Geometry is merged per material inside each venue to keep the draw call cost
 * low enough for Android.
 */
export interface VenueObstacle {
  type: 'circle' | 'box';
  x: number;
  z: number;
  r?: number;
  hw?: number;
  hd?: number;
}

export interface VenueOccluder {
  u0: number;
  u1: number;
  z0: number;
  z1: number;
  y0: number;
  y1: number;
}

export interface VenueBuildResult {
  group: THREE.Group;
  seats: VenueSeat[];
  interactions: VenueInteractionPoint[];
  obstacles: VenueObstacle[];
  occluders: VenueOccluder[];
  /** Roofs / ceilings hidden while the player is inside that destination. */
  update: (x: number, z: number) => void;
}

const SLOPE = CITY_SLOPE;

/** Local diagonal (u, z) -> world (x, z). */
export function venueToWorld(u: number, z: number): { x: number; z: number } {
  return { x: u + SLOPE * z, z };
}

interface Bucket {
  positions: number[];
  normals: number[];
  uvs: number[];
  indices: number[];
}

function newBucket(): Bucket {
  return { positions: [], normals: [], uvs: [], indices: [] };
}

function appendGeometry(bucket: Bucket, geometry: THREE.BufferGeometry) {
  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  const uv = geometry.getAttribute('uv');
  const base = bucket.positions.length / 3;
  for (let i = 0; i < position.count; i += 1) {
    bucket.positions.push(position.getX(i), position.getY(i), position.getZ(i));
    bucket.normals.push(normal.getX(i), normal.getY(i), normal.getZ(i));
    bucket.uvs.push(uv ? uv.getX(i) : 0, uv ? uv.getY(i) : 0);
  }
  const index = geometry.getIndex();
  if (index) {
    for (let i = 0; i < index.count; i += 1) bucket.indices.push(base + index.getX(i));
  } else {
    for (let i = 0; i < position.count; i += 1) bucket.indices.push(base + i);
  }
}

function bucketGeometry(bucket: Bucket): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(bucket.positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(bucket.normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(bucket.uvs, 2));
  geometry.setIndex(bucket.indices);
  return geometry;
}

type MaterialKey =
  | 'body'
  | 'trim'
  | 'glass'
  | 'accent'
  | 'floor'
  | 'wood'
  | 'metal'
  | 'fabric'
  | 'leaf'
  | 'line'
  | 'emissive';

/** Accumulates merged geometry per material, in diagonal (u, z) space. */
class VenueMeshBuilder {
  private buckets = new Map<MaterialKey, Bucket>();

  private bucket(key: MaterialKey): Bucket {
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = newBucket();
      this.buckets.set(key, bucket);
    }
    return bucket;
  }

  box(key: MaterialKey, w: number, h: number, d: number, u: number, y: number, z: number) {
    const geometry = new THREE.BoxGeometry(w, h, d);
    geometry.translate(u, y, z);
    appendGeometry(this.bucket(key), geometry);
    geometry.dispose();
  }

  plane(key: MaterialKey, w: number, h: number, u: number, y: number, z: number, face: 'north' | 'south' | 'east' | 'west' | 'up') {
    const geometry = new THREE.PlaneGeometry(w, h);
    if (face === 'north') geometry.rotateY(Math.PI);
    else if (face === 'east') geometry.rotateY(Math.PI / 2);
    else if (face === 'west') geometry.rotateY(-Math.PI / 2);
    else if (face === 'up') geometry.rotateX(-Math.PI / 2);
    geometry.translate(u, y, z);
    appendGeometry(this.bucket(key), geometry);
    geometry.dispose();
  }

  cylinder(key: MaterialKey, radius: number, height: number, u: number, y: number, z: number, segments = 10) {
    const geometry = new THREE.CylinderGeometry(radius, radius, height, segments);
    geometry.translate(u, y, z);
    appendGeometry(this.bucket(key), geometry);
    geometry.dispose();
  }

  /** Squashed sphere used for tree crowns and shrubs. */
  blob(key: MaterialKey, radius: number, u: number, y: number, z: number, squash = 0.8) {
    const geometry = new THREE.IcosahedronGeometry(radius, 1);
    geometry.scale(1, squash, 1);
    geometry.translate(u, y, z);
    appendGeometry(this.bucket(key), geometry);
    geometry.dispose();
  }

  finish(materials: Partial<Record<MaterialKey, THREE.Material>>, shadows = true): THREE.Group {
    const group = new THREE.Group();
    this.buckets.forEach((bucket, key) => {
      const material = materials[key];
      if (!material || bucket.positions.length === 0) return;
      const mesh = new THREE.Mesh(bucketGeometry(bucket), material);
      mesh.castShadow = shadows && key !== 'glass' && key !== 'floor' && key !== 'emissive';
      mesh.receiveShadow = key !== 'emissive';
      group.add(mesh);
    });
    return group;
  }
}

function createSignTexture(
  text: string,
  background: string,
  foreground: string,
  accent: string
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 192;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = accent;
  ctx.lineWidth = 8;
  ctx.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);
  ctx.fillStyle = foreground;
  ctx.font = 'bold 96px "Inter", "Helvetica Neue", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let size = 96;
  while (ctx.measureText(text).width > canvas.width - 80 && size > 40) {
    size -= 4;
    ctx.font = `bold ${size}px "Inter", "Helvetica Neue", Arial, sans-serif`;
  }
  ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 4);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function wallSegmentsForDoor(side: CityVenue['doorSide'], venue: CityVenue) {
  const half = venue.doorWidth / 2;
  const a = { u0: venue.u0, u1: venue.u1, z0: venue.z0, z1: venue.z1 };
  if (side === 'north' || side === 'south') {
    const z = side === 'north' ? a.z0 : a.z1;
    return [
      { u0: a.u0, u1: venue.doorU - half, z0: z, z1: z },
      { u0: venue.doorU + half, u1: a.u1, z0: z, z1: z },
    ];
  }
  const u = side === 'west' ? a.u0 : a.u1;
  return [
    { u0: u, u1: u, z0: a.z0, z1: venue.doorZ - half },
    { u0: u, u1: u, z0: venue.doorZ + half, z1: a.z1 },
  ];
}

const WALL = 0.55;

function addFrontBox(
  group: THREE.Group,
  material: THREE.Material,
  w: number,
  h: number,
  d: number,
  u: number,
  y: number,
  z: number
) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(u, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
}

function buildShell(
  builder: VenueMeshBuilder,
  venue: CityVenue,
  roofGroup: THREE.Group,
  frontGroup: THREE.Group,
  materials: Partial<Record<MaterialKey, THREE.Material>>
) {
  const { u0, u1, z0, z1, height, doorSide, doorWidth } = venue;
  const bodyMat = materials.body!;
  const half = doorWidth / 2;
  // The street-facing wall is a separate cutaway group: it hides while the
  // player is inside so the chase camera can see the interior.
  if (doorSide === 'north' || doorSide === 'south') {
    const z = doorSide === 'north' ? z0 + WALL / 2 : z1 - WALL / 2;
    addFrontBox(frontGroup, bodyMat, venue.doorU - half - u0, height, WALL, (u0 + venue.doorU - half) / 2, height / 2, z);
    addFrontBox(frontGroup, bodyMat, u1 - (venue.doorU + half), height, WALL, (u1 + venue.doorU + half) / 2, height / 2, z);
  } else {
    const u = doorSide === 'west' ? u0 + WALL / 2 : u1 - WALL / 2;
    addFrontBox(frontGroup, bodyMat, WALL, height, venue.doorZ - half - z0, u, height / 2, (z0 + venue.doorZ - half) / 2);
    addFrontBox(frontGroup, bodyMat, WALL, height, z1 - (venue.doorZ + half), u, height / 2, (z1 + venue.doorZ + half) / 2);
  }
  // The three remaining walls stay merged with the rest of the masonry.
  if (doorSide !== 'north') builder.box('body', u1 - u0, height, WALL, (u0 + u1) / 2, height / 2, z0 + WALL / 2);
  if (doorSide !== 'south') builder.box('body', u1 - u0, height, WALL, (u0 + u1) / 2, height / 2, z1 - WALL / 2);
  if (doorSide !== 'west') builder.box('body', WALL, height, z1 - z0 - WALL * 2, u0 + WALL / 2, height / 2, (z0 + z1) / 2);
  if (doorSide !== 'east') builder.box('body', WALL, height, z1 - z0 - WALL * 2, u1 - WALL / 2, height / 2, (z0 + z1) / 2);

  // Cornice bands give the facades a believable silhouette.
  const bandY = Math.min(4.2, height * 0.42);
  builder.box('trim', u1 - u0 + 0.5, 0.42, z1 - z0 + 0.5, (u0 + u1) / 2, bandY, (z0 + z1) / 2);
  builder.box('trim', u1 - u0 + 0.7, 0.5, z1 - z0 + 0.7, (u0 + u1) / 2, height - 0.3, (z0 + z1) / 2);
  // Parapet.
  builder.box('trim', u1 - u0 + 0.35, 0.85, 0.35, (u0 + u1) / 2, height + 0.4, z0);
  builder.box('trim', u1 - u0 + 0.35, 0.85, 0.35, (u0 + u1) / 2, height + 0.4, z1);
  builder.box('trim', 0.35, 0.85, z1 - z0, u0, height + 0.4, (z0 + z1) / 2);
  builder.box('trim', 0.35, 0.85, z1 - z0, u1, height + 0.4, (z0 + z1) / 2);

  // Interior wall lining + skirting so rooms read as plaster rooms, not the
  // inside of a dark shell.
  const lineT = 0.06;
  const ceil = venue.ceiling;
  const iu0 = u0 + WALL;
  const iu1 = u1 - WALL;
  const iz0 = z0 + WALL;
  const iz1 = z1 - WALL;
  if (doorSide !== 'north') builder.box('line', iu1 - iu0, ceil, lineT, (iu0 + iu1) / 2, ceil / 2, iz0 + lineT / 2);
  if (doorSide !== 'south') builder.box('line', iu1 - iu0, ceil, lineT, (iu0 + iu1) / 2, ceil / 2, iz1 - lineT / 2);
  if (doorSide !== 'west') builder.box('line', lineT, ceil, iz1 - iz0, iu0 + lineT / 2, ceil / 2, (iz0 + iz1) / 2);
  if (doorSide !== 'east') builder.box('line', lineT, ceil, iz1 - iz0, iu1 - lineT / 2, ceil / 2, (iz0 + iz1) / 2);
  builder.box('trim', iu1 - iu0, 0.16, 0.05, (iu0 + iu1) / 2, 0.08, iz0 + 0.03);
  builder.box('trim', iu1 - iu0, 0.16, 0.05, (iu0 + iu1) / 2, 0.08, iz1 - 0.03);

  // Solid roof + ceiling live in their own group so the camera can look inside.
  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(u1 - u0 + 0.3, 0.35, z1 - z0 + 0.3),
    new THREE.MeshStandardMaterial({ color: venue.palette.trim, roughness: 0.9 })
  );
  roof.position.set((u0 + u1) / 2, height + 0.18, (z0 + z1) / 2);
  roof.castShadow = true;
  roof.receiveShadow = true;
  roofGroup.add(roof);

  const ceiling = new THREE.Mesh(
    new THREE.PlaneGeometry(u1 - u0 - WALL * 2, z1 - z0 - WALL * 2),
    new THREE.MeshStandardMaterial({ color: '#e7e3da', roughness: 0.95 })
  );
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set((u0 + u1) / 2, venue.ceiling, (z0 + z1) / 2);
  roofGroup.add(ceiling);

  // Rooftop plant room so the skyline does not read as an empty box.
  builder.box('trim', Math.min(4.5, (u1 - u0) * 0.32), 2.2, Math.min(3.6, (z1 - z0) * 0.3), (u0 + u1) / 2 + 2, height + 1.1, (z0 + z1) / 2 - 1.4);
}

function buildFacade(
  builder: VenueMeshBuilder,
  venue: CityVenue,
  frontGroup: THREE.Group,
  materials: Partial<Record<MaterialKey, THREE.Material>>
) {
  const { u0, u1, z0, z1, height, doorSide, palette } = venue;
  const isHorizontal = doorSide === 'north' || doorSide === 'south';
  // Street-facing facade coordinates.
  const faceZ = doorSide === 'north' ? z0 : doorSide === 'south' ? z1 : 0;
  const faceU = doorSide === 'west' ? u0 : u1;
  const half = venue.doorWidth / 2;
  const bandY = Math.min(4.2, height * 0.42);

  // Pilasters + windows on the street facade, above the shopfront band.
  const spanStart = isHorizontal ? u0 + 1.4 : z0 + 1.4;
  const spanEnd = isHorizontal ? u1 - 1.4 : z1 - 1.4;
  const step = 3.6;
  for (let p = spanStart; p <= spanEnd - 1.2; p += step) {
    if (isHorizontal) {
      builder.box('trim', 0.42, bandY, 0.3, p, bandY / 2, faceZ);
      for (let row = 0; row < Math.floor((height - bandY - 2.2) / 3.2); row += 1) {
        const y = bandY + 1.9 + row * 3.2;
        builder.box('glass', 2.0, 1.7, 0.16, p + 1.5, y, faceZ);
        builder.box('trim', 2.2, 0.16, 0.26, p + 1.5, y - 0.95, faceZ);
      }
    } else {
      builder.box('trim', 0.3, bandY, 0.42, faceU, bandY / 2, p);
      for (let row = 0; row < Math.floor((height - bandY - 2.2) / 3.2); row += 1) {
        const y = bandY + 1.9 + row * 3.2;
        builder.box('glass', 0.16, 1.7, 2.0, faceU, y, p + 1.5);
        builder.box('trim', 0.26, 0.16, 2.2, faceU, y - 0.95, p + 1.5);
      }
    }
  }

  // Shopfront: glazing either side of the doorway + frame + awning + steps.
  if (isHorizontal) {
    const leftFrom = u0 + 0.8;
    const leftTo = venue.doorU - half - 0.4;
    const rightFrom = venue.doorU + half + 0.4;
    const rightTo = u1 - 0.8;
    if (leftTo - leftFrom > 1) addFrontBox(frontGroup, materials.glass!, leftTo - leftFrom, 2.9, 0.14, (leftFrom + leftTo) / 2, 1.62, faceZ);
    if (rightTo - rightFrom > 1) addFrontBox(frontGroup, materials.glass!, rightTo - rightFrom, 2.9, 0.14, (rightFrom + rightTo) / 2, 1.62, faceZ);
    addFrontBox(frontGroup, materials.trim!, venue.doorWidth + 0.5, 0.4, 0.5, venue.doorU, 3.28, faceZ);
    addFrontBox(frontGroup, materials.trim!, 0.35, 3.3, 0.5, venue.doorU - half - 0.18, 1.65, faceZ);
    addFrontBox(frontGroup, materials.trim!, 0.35, 3.3, 0.5, venue.doorU + half + 0.18, 1.65, faceZ);
    // Awning over the doors.
    const dir = doorSide === 'north' ? -1 : 1;
    addFrontBox(frontGroup, materials.fabric!, venue.doorWidth + 1.4, 0.14, 1.15, venue.doorU, 3.42, faceZ + dir * 0.58);
    addFrontBox(frontGroup, materials.accent!, venue.doorWidth + 1.4, 0.26, 0.09, venue.doorU, 3.28, faceZ + dir * 1.16);
    // Entrance steps.
    builder.box('trim', venue.doorWidth + 1.2, 0.14, 1.0, venue.doorU, 0.07, faceZ + dir * 1.3);
    builder.box('trim', venue.doorWidth + 1.6, 0.1, 1.7, venue.doorU, 0.03, faceZ + dir * 1.7);
  } else {
    const frontFrom = z0 + 0.8;
    const frontTo = venue.doorZ - half - 0.4;
    const backFrom = venue.doorZ + half + 0.4;
    const backTo = z1 - 0.8;
    if (frontTo - frontFrom > 1) addFrontBox(frontGroup, materials.glass!, 0.14, 2.9, frontTo - frontFrom, faceU, 1.62, (frontFrom + frontTo) / 2);
    if (backTo - backFrom > 1) addFrontBox(frontGroup, materials.glass!, 0.14, 2.9, backTo - backFrom, faceU, 1.62, (backFrom + backTo) / 2);
    addFrontBox(frontGroup, materials.trim!, 0.5, 0.4, venue.doorWidth + 0.5, faceU, 3.28, venue.doorZ);
    addFrontBox(frontGroup, materials.trim!, 0.5, 3.3, 0.35, faceU, 1.65, venue.doorZ - half - 0.18);
    addFrontBox(frontGroup, materials.trim!, 0.5, 3.3, 0.35, faceU, 1.65, venue.doorZ + half + 0.18);
    const dir = doorSide === 'west' ? -1 : 1;
    addFrontBox(frontGroup, materials.fabric!, 1.15, 0.14, venue.doorWidth + 1.4, faceU + dir * 0.58, 3.42, venue.doorZ);
    addFrontBox(frontGroup, materials.accent!, 0.09, 0.26, venue.doorWidth + 1.4, faceU + dir * 1.16, 3.28, venue.doorZ);
    builder.box('trim', 1.0, 0.14, venue.doorWidth + 1.2, faceU + dir * 1.3, 0.07, venue.doorZ);
    builder.box('trim', 1.7, 0.1, venue.doorWidth + 1.6, faceU + dir * 1.7, 0.03, venue.doorZ);
  }

  // Building-specific landmark details.
  if (venue.id === 'library') {
    for (let i = 0; i < 4; i += 1) {
      const u = venue.doorU - venue.doorWidth / 2 - 1.4 - i * 2.2;
      builder.cylinder('body', 0.36, Math.min(6.4, bandY), u, Math.min(6.4, bandY) / 2, faceZ - 0.45, 12);
      builder.box('trim', 1.0, 0.3, 0.9, u, Math.min(6.4, bandY), faceZ - 0.45);
      builder.box('trim', 1.0, 0.3, 0.9, u, 0.15, faceZ - 0.45);
    }
    builder.box('trim', u1 - u0 + 0.9, 0.35, 1.2, (u0 + u1) / 2, bandY + 0.2, faceZ - 0.5);
  }

  if (venue.id === 'med_deck') {
    // Red cross on a white plaque above the entrance.
    builder.box('accent', 1.5, 0.46, 0.2, venue.doorU, 4.9, faceZ + (doorSide === 'north' ? -0.16 : 0.16));
    builder.box('accent', 0.46, 1.5, 0.2, venue.doorU, 4.9, faceZ + (doorSide === 'north' ? -0.16 : 0.16));
    builder.box('glass', venue.doorWidth + 3.4, 0.28, 3.4, venue.doorU, 3.9, faceZ + (doorSide === 'north' ? 1.0 : -1.0));
  }

  if (venue.id === 'cinema') {
    // Marquee with warm bulbs.
    const marqueeZ = faceU + (doorSide === 'west' ? -1.1 : 1.1);
    builder.box('trim', 1.4, 1.5, venue.doorWidth + 6.0, marqueeZ, 4.6, venue.doorZ);
    for (let i = 0; i < 12; i += 1) {
      builder.box('emissive', 0.16, 0.16, 0.16, marqueeZ, 5.2, venue.doorZ - (venue.doorWidth + 5) / 2 + i * ((venue.doorWidth + 5) / 11));
    }
    // Poster lightboxes along the plaza side.
    for (let i = 0; i < 3; i += 1) {
      builder.plane('emissive', 1.1, 1.7, faceU + (doorSide === 'west' ? -0.14 : 0.14), 2.0, venue.doorZ + 4.2 + i * 2.1, doorSide === 'west' ? 'west' : 'east');
    }
  }

  if (venue.id === 'cafe') {
    // Terrace: umbrellas + bistro tables out front.
    const dir = doorSide === 'south' ? 1 : -1;
    for (let i = 0; i < 3; i += 1) {
      const u = venue.doorU - 4.2 + i * 4.2;
      const z = faceZ + dir * 2.9;
      builder.cylinder('metal', 0.05, 2.5, u, 1.25, z, 6);
      builder.cylinder('accent', 1.6, 0.12, u, 2.55, z, 12);
      builder.cylinder('metal', 0.4, 0.72, u, 0.36, z, 10);
      builder.box('metal', 0.8, 0.06, 0.8, u, 0.72, z);
      for (const side of [-0.95, 0.95]) {
        builder.box('wood', 0.42, 0.06, 0.42, u + side, 0.45, z);
        builder.box('wood', 0.08, 0.45, 0.08, u + side, 0.22, z);
        builder.box('wood', 0.4, 0.5, 0.08, u + side, 0.7, z + 0.3);
      }
    }
  }

  if (venue.id === 'market') {
    // Produce crates stacked by the doors.
    for (let i = 0; i < 4; i += 1) {
      const u = venue.doorU - 5.2 + i * 1.15;
      builder.box('wood', 1.0, 0.5, 0.8, u, 0.4, faceZ + (doorSide === 'north' ? -1.2 : 1.2));
      builder.blob('leaf', 0.28, u, 0.72, faceZ + (doorSide === 'north' ? -1.2 : 1.2), 0.7);
    }
  }

  builder.box('trim', 0.3, height - bandY - 2.0, 0.3, palette ? u0 + 1.0 : u0, bandY + 1.0, z0);
}

function buildLibraryInterior(b: VenueMeshBuilder, v: CityVenue, seats: VenueSeat[], interactions: VenueInteractionPoint[], obstacles: VenueObstacle[]) {
  const { iu0, iu1, iz0, iz1 } = v;
  const midU = (iu0 + iu1) / 2;
  // Bookshelves along both side walls.
  for (let i = 0; i < 4; i += 1) {
    const z = iz0 + 2.2 + i * 3.0;
    b.box('wood', 0.55, 2.5, 2.5, iu0 + 0.6, 1.25, z);
    b.box('wood', 0.55, 2.5, 2.5, iu1 - 0.6, 1.25, z);
    for (let shelf = 0; shelf < 4; shelf += 1) {
      b.box('fabric', 0.46, 0.22, 2.2, iu0 + 0.6, 0.42 + shelf * 0.58, z);
      b.box('fabric', 0.46, 0.22, 2.2, iu1 - 0.6, 0.42 + shelf * 0.58, z);
    }
    obstacles.push({ type: 'box', ...venueToWorld(iu0 + 0.6, z), hw: 0.45, hd: 1.35 });
    obstacles.push({ type: 'box', ...venueToWorld(iu1 - 0.6, z), hw: 0.45, hd: 1.35 });
  }
  // Reading hall: three long study tables with chairs.
  for (let row = 0; row < 3; row += 1) {
    const z = iz0 + 4.0 + row * 4.4;
    b.box('wood', 5.4, 0.1, 1.5, midU, 0.78, z);
    for (const leg of [-2.4, 2.4]) b.box('metal', 0.1, 0.78, 0.1, midU + leg, 0.39, z);
    b.box('wood', 0.5, 0.44, 0.5, midU - 1.6, 0.24, z);
    b.box('wood', 0.5, 0.44, 0.5, midU + 1.6, 0.24, z);
    for (const side of [-1.15, 1.15]) {
      const chairZ = z + side;
      b.box('wood', 0.5, 0.08, 0.5, midU - 1.5, 0.46, chairZ);
      b.box('wood', 0.5, 0.08, 0.5, midU + 1.5, 0.46, chairZ);
      b.box('wood', 0.5, 0.55, 0.08, midU - 1.5, 0.73, chairZ + (side > 0 ? 0.22 : -0.22));
      b.box('wood', 0.5, 0.55, 0.08, midU + 1.5, 0.73, chairZ + (side > 0 ? 0.22 : -0.22));
      seats.push({ id: `library_chair_${row}_${side > 0 ? 's' : 'n'}_w`, label: 'Study Chair', ...venueToWorld(midU - 1.5, chairZ), facingYaw: side > 0 ? Math.PI : 0 });
      seats.push({ id: `library_chair_${row}_${side > 0 ? 's' : 'n'}_e`, label: 'Study Chair', ...venueToWorld(midU + 1.5, chairZ), facingYaw: side > 0 ? Math.PI : 0 });
    }
    obstacles.push({ type: 'box', ...venueToWorld(midU, z), hw: 2.7, hd: 0.8 });
  }
  // Public computers on a counter at the back of the hall.
  const pcZ = iz1 - 1.6;
  b.box('wood', 6.2, 0.86, 0.9, midU, 0.43, pcZ);
  for (let i = 0; i < 3; i += 1) {
    const u = midU - 2.0 + i * 2.0;
    b.box('metal', 0.6, 0.42, 0.12, u, 1.12, pcZ);
    b.box('trim', 0.66, 0.5, 0.08, u, 1.34, pcZ + 0.06);
    b.box('emissive', 0.54, 0.34, 0.03, u, 1.34, pcZ - 0.02);
    b.box('wood', 0.44, 0.08, 0.44, u, 0.48, pcZ - 0.9);
    seats.push({ id: `library_pc_${i}`, label: 'Computer Desk', ...venueToWorld(u, pcZ - 0.9), facingYaw: Math.PI });
  }
  obstacles.push({ type: 'box', ...venueToWorld(midU, pcZ), hw: 3.1, hd: 0.6 });
  interactions.push({
    id: 'library_desks',
    venueId: 'library',
    ...venueToWorld(midU, pcZ - 1.4),
    radius: 2.4,
    label: 'Use a public computer',
    kind: 'inspect',
    hint: 'Three public terminals are open — press E by a desk chair to sit down.',
  });
  // Reading rug + plants.
  b.box('fabric', 6.0, 0.02, 8.0, midU, 0.16, iz0 + 6.2);
  for (const [u, z] of [
    [iu0 + 1.2, iz0 + 1.0],
    [iu1 - 1.2, iz0 + 1.0],
    [iu0 + 1.2, iz1 - 0.9],
    [iu1 - 1.2, iz1 - 0.9],
  ]) {
    b.box('trim', 0.5, 0.45, 0.5, u, 0.22, z);
    b.blob('leaf', 0.42, u, 0.85, z, 1.1);
    obstacles.push({ type: 'circle', ...venueToWorld(u, z), r: 0.45 });
  }
}

function buildMedDeckInterior(b: VenueMeshBuilder, v: CityVenue, seats: VenueSeat[], interactions: VenueInteractionPoint[], obstacles: VenueObstacle[]) {
  const { iu0, iu1, iz0, iz1 } = v;
  const midU = (iu0 + iu1) / 2;
  // Reception desk.
  const deskZ = iz0 + 2.4;
  b.box('floor', 5.0, 1.1, 1.1, midU, 0.55, deskZ);
  b.box('trim', 5.2, 0.1, 1.25, midU, 1.13, deskZ);
  b.box('emissive', 0.6, 0.4, 0.06, midU + 1.2, 1.36, deskZ - 0.4);
  obstacles.push({ type: 'box', ...venueToWorld(midU, deskZ), hw: 2.6, hd: 0.7 });
  interactions.push({
    id: 'med_deck_reception',
    venueId: 'med_deck',
    ...venueToWorld(midU, deskZ + 1.7),
    radius: 2.6,
    label: 'Check in at reception',
    kind: 'inspect',
    hint: 'Reception has you on file. Waiting chairs are to your left, triage beds behind the screens.',
  });
  // Waiting area chairs.
  for (let i = 0; i < 4; i += 1) {
    const u = iu0 + 2.0 + i * 1.5;
    const z = iz0 + 5.2;
    b.box('metal', 0.5, 0.09, 0.5, u, 0.46, z);
    b.box('metal', 0.5, 0.5, 0.09, u, 0.72, z + 0.22);
    seats.push({ id: `med_wait_${i}`, label: 'Waiting Chair', ...venueToWorld(u, z), facingYaw: Math.PI });
    obstacles.push({ type: 'box', ...venueToWorld(u, z), hw: 0.35, hd: 0.35 });
  }
  // Triage bays: two beds behind screens.
  for (let i = 0; i < 2; i += 1) {
    const z = iz0 + 6.0 + i * 3.6;
    const u = iu1 - 3.0;
    b.box('metal', 2.2, 0.55, 1.1, u, 0.42, z);
    b.box('floor', 2.0, 0.22, 0.95, u, 0.78, z);
    b.box('floor', 0.7, 0.2, 0.9, u - 0.75, 0.92, z);
    b.box('glass', 0.08, 2.0, 3.0, u - 1.6, 1.0, z);
    obstacles.push({ type: 'box', ...venueToWorld(u, z), hw: 1.2, hd: 0.75 });
  }
  // Medicine cabinet + supply trolley + cross on the wall.
  b.box('floor', 1.4, 2.2, 0.5, iu1 - 0.9, 1.1, iz0 + 1.2);
  b.box('accent', 0.5, 0.16, 0.06, iu1 - 0.9, 1.7, iz0 + 0.9);
  b.box('accent', 0.16, 0.5, 0.06, iu1 - 0.9, 1.7, iz0 + 0.9);
  b.box('metal', 0.6, 0.8, 0.45, midU - 3.0, 0.4, iz1 - 2.2);
  b.box('floor', 5.0, 0.02, 4.0, iu0 + 4.0, 0.16, iz0 + 5.2);
}

function buildCommunityInterior(b: VenueMeshBuilder, v: CityVenue, seats: VenueSeat[], interactions: VenueInteractionPoint[], obstacles: VenueObstacle[]) {
  const { iu0, iu1, iz0, iz1 } = v;
  const midU = (iu0 + iu1) / 2;
  // Low stage at the back with a lectern.
  b.box('wood', (iu1 - iu0) - 3.0, 0.35, 2.6, midU, 0.17, iz1 - 1.9);
  b.box('wood', 0.8, 1.05, 0.5, midU + 1.6, 0.87, iz1 - 1.9);
  obstacles.push({ type: 'box', ...venueToWorld(midU, iz1 - 1.9), hw: (iu1 - iu0) / 2 - 1.5, hd: 1.4 });
  // Folding tables + chairs for classes.
  for (let row = 0; row < 2; row += 1) {
    const z = iz0 + 3.0 + row * 3.4;
    for (let col = 0; col < 2; col += 1) {
      const u = midU - 2.6 + col * 5.2;
      b.box('wood', 2.2, 0.08, 1.0, u, 0.76, z);
      b.box('metal', 0.08, 0.76, 0.08, u - 0.9, 0.38, z - 0.4);
      b.box('metal', 0.08, 0.76, 0.08, u + 0.9, 0.38, z + 0.4);
      for (const side of [-0.85, 0.85]) {
        b.box('fabric', 0.46, 0.08, 0.46, u, 0.46, z + side);
        b.box('fabric', 0.46, 0.5, 0.08, u, 0.72, z + side + (side > 0 ? 0.2 : -0.2));
        seats.push({ id: `community_chair_${row}_${col}_${side > 0 ? 's' : 'n'}`, label: 'Folding Chair', ...venueToWorld(u, z + side), facingYaw: side > 0 ? Math.PI : 0 });
      }
      obstacles.push({ type: 'box', ...venueToWorld(u, z), hw: 1.2, hd: 0.7 });
    }
  }
  // Noticeboard with pinned flyers.
  b.box('trim', 3.0, 1.8, 0.12, midU, 1.9, iz1 - 0.35);
  for (let i = 0; i < 6; i += 1) {
    b.box('fabric', 0.6, 0.7, 0.04, midU - 1.1 + (i % 3) * 1.1, 2.2 - Math.floor(i / 3) * 0.8, iz1 - 0.28);
  }
  interactions.push({
    id: 'community_noticeboard',
    venueId: 'community_center',
    ...venueToWorld(midU, iz1 - 1.2),
    radius: 2.4,
    label: 'Read the noticeboard',
    kind: 'inspect',
    hint: 'This week: rooftop yoga, a repair café and open mic night. Classes run on the stage at the back.',
  });
  // Craft shelves + planters.
  for (let i = 0; i < 3; i += 1) {
    b.box('wood', 0.5, 2.0, 2.2, iu0 + 0.7, 1.0, iz0 + 2.0 + i * 2.4);
    obstacles.push({ type: 'box', ...venueToWorld(iu0 + 0.7, iz0 + 2.0 + i * 2.4), hw: 0.4, hd: 1.2 });
  }
  for (const [u, z] of [
    [iu1 - 1.0, iz0 + 1.0],
    [iu0 + 1.0, iz1 - 1.0],
  ]) {
    b.box('trim', 0.5, 0.42, 0.5, u, 0.21, z);
    b.blob('leaf', 0.4, u, 0.82, z, 1.1);
  }
}

function buildCafeInterior(b: VenueMeshBuilder, v: CityVenue, seats: VenueSeat[], interactions: VenueInteractionPoint[], obstacles: VenueObstacle[]) {
  const { iu0, iu1, iz0, iz1 } = v;
  const midU = (iu0 + iu1) / 2;
  // Espresso bar.
  const barZ = iz1 - 1.6;
  b.box('wood', (iu1 - iu0) - 2.4, 1.05, 0.85, midU, 0.53, barZ);
  b.box('trim', (iu1 - iu0) - 2.2, 0.07, 0.95, midU, 1.08, barZ);
  b.box('metal', 0.9, 0.6, 0.6, midU - 1.2, 1.38, barZ);
  b.box('glass', 1.1, 0.6, 0.6, midU + 0.6, 1.4, barZ);
  b.box('wood', 1.4, 2.0, 0.4, iu0 + 1.2, 1.0, barZ);
  obstacles.push({ type: 'box', ...venueToWorld(midU, barZ), hw: (iu1 - iu0) / 2 - 1.0, hd: 0.6 });
  interactions.push({
    id: 'cafe_counter',
    venueId: 'cafe',
    ...venueToWorld(midU, barZ - 1.5),
    radius: 2.6,
    label: 'Order a pour-over',
    kind: 'inspect',
    hint: 'One single-origin pour-over, coming up. Seats inside and on the terrace are free.',
  });
  // Bar stools.
  for (let i = 0; i < 3; i += 1) {
    const u = midU - 1.6 + i * 1.6;
    b.cylinder('metal', 0.06, 0.7, u, 0.35, barZ - 0.9, 6);
    b.cylinder('fabric', 0.24, 0.08, u, 0.72, barZ - 0.9, 10);
    seats.push({ id: `cafe_stool_${i}`, label: 'Bar Stool', ...venueToWorld(u, barZ - 0.9), facingYaw: 0 });
  }
  // Tables.
  for (let i = 0; i < 3; i += 1) {
    const z = iz0 + 2.2 + (i % 2) * 3.2;
    const u = iu0 + 2.4 + Math.floor(i / 2) * 4.0;
    b.cylinder('metal', 0.08, 0.72, u, 0.36, z, 8);
    b.cylinder('wood', 0.55, 0.06, u, 0.74, z, 14);
    for (const side of [-0.85, 0.85]) {
      b.box('wood', 0.42, 0.06, 0.42, u + side, 0.45, z);
      b.box('wood', 0.42, 0.5, 0.08, u + side, 0.7, z + 0.2);
      seats.push({ id: `cafe_table_${i}_${side > 0 ? 'e' : 'w'}`, label: 'Café Chair', ...venueToWorld(u + side, z), facingYaw: 0 });
    }
    obstacles.push({ type: 'circle', ...venueToWorld(u, z), r: 0.75 });
  }
  b.box('trim', 2.2, 0.9, 0.12, iu1 - 0.4, 2.0, iz0 + 2.0);
  b.blob('leaf', 0.4, iu1 - 1.0, 0.85, iz0 + 0.9, 1.1);
}

function buildMarketInterior(b: VenueMeshBuilder, v: CityVenue, seats: VenueSeat[], interactions: VenueInteractionPoint[], obstacles: VenueObstacle[]) {
  const { iu0, iu1, iz0, iz1 } = v;
  const midU = (iu0 + iu1) / 2;
  // Aisles of shelves with goods.
  for (let aisle = 0; aisle < 3; aisle += 1) {
    const u = iu0 + 3.0 + aisle * 4.2;
    for (let unit = 0; unit < 3; unit += 1) {
      const z = iz0 + 2.2 + unit * 2.6;
      b.box('metal', 1.6, 1.9, 0.7, u, 0.95, z);
      for (let shelf = 0; shelf < 3; shelf += 1) {
        b.box('fabric', 1.4, 0.2, 0.6, u, 0.5 + shelf * 0.55, z);
      }
      obstacles.push({ type: 'box', ...venueToWorld(u, z), hw: 0.9, hd: 0.45 });
    }
  }
  // Checkout + baskets.
  const counterZ = iz1 - 1.3;
  b.box('wood', 4.0, 1.0, 0.9, midU, 0.5, counterZ);
  b.box('emissive', 0.45, 0.3, 0.06, midU + 1.0, 1.2, counterZ - 0.3);
  obstacles.push({ type: 'box', ...venueToWorld(midU, counterZ), hw: 2.1, hd: 0.6 });
  interactions.push({
    id: 'market_counter',
    venueId: 'market',
    ...venueToWorld(midU, counterZ - 1.5),
    radius: 2.6,
    label: 'Shop Market Hall furnishings',
    kind: 'shop_furniture',
  });
  for (let i = 0; i < 3; i += 1) {
    b.box('accent', 0.4, 0.24, 0.3, midU - 1.4 + i * 0.5, 0.3, counterZ - 0.9);
  }
  // TG-Bank ATM beside the entrance. Cash deposits and withdrawals only work
  // at a machine, so every shopping district needs at least one.
  const atmU = iu1 - 1.2;
  const atmZ = iz0 + 1.4;
  b.box('metal', 0.9, 1.9, 0.55, atmU, 0.95, atmZ);
  b.box('emissive', 0.55, 0.42, 0.04, atmU, 1.35, atmZ - 0.3);
  b.box('trim', 0.7, 0.12, 0.28, atmU, 1.02, atmZ - 0.42);
  obstacles.push({ type: 'box', ...venueToWorld(atmU, atmZ), hw: 0.55, hd: 0.4 });
  interactions.push({
    id: 'market_atm',
    venueId: 'market',
    ...venueToWorld(atmU, atmZ - 1.2),
    radius: 2.2,
    label: 'Use TG-Bank ATM',
    kind: 'atm',
    atmId: 'market_hall',
  });
  b.blob('leaf', 0.42, iu0 + 0.9, 0.9, iz0 + 0.9, 1.1);
}

function buildCinemaInterior(b: VenueMeshBuilder, v: CityVenue, seats: VenueSeat[], interactions: VenueInteractionPoint[], obstacles: VenueObstacle[]) {
  const { iu0, iu1, iz0, iz1 } = v;
  const midU = (iu0 + iu1) / 2;
  // Ticket counter + popcorn stand in the lobby.
  const counterZ = iz0 + 2.2;
  b.box('wood', 4.6, 1.05, 0.9, midU, 0.52, counterZ);
  b.box('accent', 4.8, 0.1, 1.0, midU, 1.1, counterZ);
  b.box('glass', 1.0, 0.5, 0.6, midU + 1.2, 1.4, counterZ);
  obstacles.push({ type: 'box', ...venueToWorld(midU, counterZ), hw: 2.4, hd: 0.6 });
  interactions.push({
    id: 'cinema_box_office',
    venueId: 'cinema',
    ...venueToWorld(midU, counterZ + 1.5),
    radius: 2.6,
    label: 'Visit the box office',
    kind: 'inspect',
    hint: 'Screen 1 is showing "Lofters in the Sky". Screen 2 is the late-night double feature. Arcade cabinet is by the posters.',
  });
  // Arcade cabinet.
  b.box('trim', 0.8, 1.8, 0.6, iu0 + 1.2, 0.9, counterZ + 2.4);
  b.box('emissive', 0.6, 0.5, 0.06, iu0 + 1.2, 1.35, counterZ + 2.1);
  obstacles.push({ type: 'box', ...venueToWorld(iu0 + 1.2, counterZ + 2.4), hw: 0.5, hd: 0.4 });
  // Screening room: screen + raked seats.
  const screenZ = iz1 - 0.9;
  b.box('emissive', (iu1 - iu0) - 3.0, 3.0, 0.16, midU, 2.4, screenZ);
  b.box('trim', (iu1 - iu0) - 2.4, 3.4, 0.3, midU, 2.4, screenZ + 0.3);
  for (let row = 0; row < 2; row += 1) {
    const z = iz1 - 4.4 - row * 2.4;
    for (let i = 0; i < 4; i += 1) {
      const u = midU - 3.0 + i * 2.0;
      b.box('fabric', 1.1, 0.85, 0.8, u, 0.45, z);
      b.box('fabric', 1.1, 0.6, 0.16, u, 0.95, z + 0.4);
      seats.push({ id: `cinema_seat_${row}_${i}`, label: 'Cinema Seat', ...venueToWorld(u, z), facingYaw: 0 });
      obstacles.push({ type: 'box', ...venueToWorld(u, z), hw: 0.65, hd: 0.5 });
    }
  }
  // Poster wall.
  for (let i = 0; i < 3; i += 1) {
    b.box('emissive', 0.9, 1.4, 0.06, iu1 - 0.4, 1.9, iz0 + 4.0 + i * 1.7);
  }
}

function buildNightclubInterior(b: VenueMeshBuilder, v: CityVenue, seats: VenueSeat[], interactions: VenueInteractionPoint[], obstacles: VenueObstacle[]) {
  const { iu0, iu1, iz0, iz1 } = v;
  const midU = (iu0 + iu1) / 2;
  // Dance floor with a lit grid and a DJ booth at the back.
  const floorZ = iz0 + 6.4;
  for (let gu = -2; gu <= 2; gu += 1) {
    for (let gz = -1; gz <= 1; gz += 1) {
      b.box('emissive', 0.86, 0.03, 0.86, midU + gu * 0.92, 0.18, floorZ + gz * 0.92);
    }
  }
  b.box('trim', 3.2, 0.9, 1.1, midU, 0.45, iz0 + 2.0);
  b.box('emissive', 2.4, 0.22, 0.12, midU, 1.02, iz0 + 2.5);
  b.box('glass', 2.6, 1.4, 0.12, midU, 1.9, iz0 + 2.7);
  obstacles.push({ type: 'box', ...venueToWorld(midU, iz0 + 2.0), hw: 1.7, hd: 0.7 });
  // Long bar with stools along the east wall.
  const barU = iu1 - 2.4;
  b.box('wood', 1.1, 1.1, (iz1 - iz0) - 6.0, barU, 0.55, (iz0 + iz1) / 2);
  b.box('trim', 1.25, 0.08, (iz1 - iz0) - 5.8, barU, 1.12, (iz0 + iz1) / 2);
  for (let i = 0; i < 5; i += 1) {
    b.box('glass', 0.24, 0.55, 0.24, barU - 0.8, 1.4, iz0 + 3.4 + i * 1.9);
    b.cylinder('metal', 0.06, 0.7, barU - 1.1, 0.35, iz0 + 3.4 + i * 1.9, 6);
    b.cylinder('fabric', 0.24, 0.08, barU - 1.1, 0.72, iz0 + 3.4 + i * 1.9, 10);
    seats.push({ id: `nightclub_stool_${i}`, label: 'Bar Stool', ...venueToWorld(barU - 1.1, iz0 + 3.4 + i * 1.9), facingYaw: Math.PI / 2 });
  }
  obstacles.push({ type: 'box', ...venueToWorld(barU, (iz0 + iz1) / 2), hw: 0.75, hd: (iz1 - iz0) / 2 - 3.0 });
  interactions.push({
    id: 'nightclub_bar',
    venueId: 'nightclub',
    ...venueToWorld(barU - 1.8, (iz0 + iz1) / 2),
    radius: 2.8,
    label: 'Order at the bar',
    kind: 'inspect',
    hint: 'The dance floor is behind you and the DJ booth at the back. Booths line the west wall.',
  });
  // Upholstered booths on the west side.
  for (let i = 0; i < 2; i += 1) {
    const z = iz0 + 3.6 + i * 4.2;
    b.box('fabric', 0.9, 0.55, 2.4, iu0 + 1.4, 0.28, z);
    b.box('fabric', 0.2, 1.1, 2.4, iu0 + 1.0, 0.55, z);
    b.box('wood', 1.0, 0.06, 1.1, iu0 + 2.3, 0.72, z);
    b.box('wood', 0.1, 0.7, 0.1, iu0 + 2.3, 0.35, z);
    seats.push({ id: `nightclub_booth_${i}`, label: 'Club Booth', ...venueToWorld(iu0 + 1.4, z), facingYaw: -Math.PI / 2 });
    obstacles.push({ type: 'box', ...venueToWorld(iu0 + 1.4, z), hw: 0.55, hd: 1.3 });
  }
  // Speaker stacks and ceiling wash.
  for (const u of [iu0 + 1.6, iu1 - 1.6]) {
    b.box('trim', 0.6, 2.4, 0.6, u, 1.2, iz0 + 1.2);
    b.box('accent', 0.42, 0.42, 0.2, u, 1.9, iz0 + 1.55);
  }
  b.box('emissive', (iu1 - iu0) - 4.0, 0.08, 0.5, midU, v.ceiling - 0.3, iz1 - 2.0);
}

function buildBarInterior(b: VenueMeshBuilder, v: CityVenue, seats: VenueSeat[], interactions: VenueInteractionPoint[], obstacles: VenueObstacle[]) {
  const { iu0, iu1, iz0, iz1 } = v;
  const midU = (iu0 + iu1) / 2;
  // Back bar with taps and a mirror.
  const barZ = iz0 + 2.2;
  b.box('wood', (iu1 - iu0) - 3.2, 1.1, 0.9, midU, 0.55, barZ);
  b.box('trim', (iu1 - iu0) - 3.0, 0.1, 1.0, midU, 1.12, barZ);
  for (let i = 0; i < 6; i += 1) {
    b.cylinder('metal', 0.05, 0.3, midU - 3.0 + i * 1.2, 1.2, barZ - 0.25, 6);
    b.box('glass', 0.22, 0.38, 0.22, midU - 3.0 + i * 1.2, 1.5, barZ - 0.2);
  }
  b.box('glass', (iu1 - iu0) - 3.6, 1.3, 0.08, midU, 2.1, barZ - 0.52);
  obstacles.push({ type: 'box', ...venueToWorld(midU, barZ), hw: (iu1 - iu0) / 2 - 1.6, hd: 0.7 });
  interactions.push({
    id: 'bar_counter',
    venueId: 'bar',
    ...venueToWorld(midU, barZ + 1.6),
    radius: 2.8,
    label: 'Order a drink',
    kind: 'inspect',
    hint: 'Six taps, a corner stage and booths along the wall. Grab a stool at the bar.',
  });
  // Stools.
  const stoolCount = Math.max(3, Math.min(6, Math.floor((iu1 - iu0) / 2.2)));
  for (let i = 0; i < stoolCount; i += 1) {
    const u = midU - ((stoolCount - 1) * 1.5) / 2 + i * 1.5;
    b.cylinder('metal', 0.05, 0.72, u, 0.36, barZ + 0.9, 6);
    b.cylinder('fabric', 0.23, 0.08, u, 0.74, barZ + 0.9, 10);
    seats.push({ id: `bar_stool_${i}`, label: 'Bar Stool', ...venueToWorld(u, barZ + 0.9), facingYaw: 0 });
  }
  // Wooden booths down the long walls.
  for (let i = 0; i < 2; i += 1) {
    const z = iz0 + 5.2 + i * 3.4;
    b.box('wood', 0.8, 0.5, 2.2, iu0 + 1.1, 0.25, z);
    b.box('wood', 0.16, 1.0, 2.2, iu0 + 0.8, 0.5, z);
    b.box('wood', 1.8, 0.06, 1.2, iu0 + 2.2, 0.72, z);
    b.box('wood', 0.1, 0.7, 0.1, iu0 + 2.2, 0.35, z);
    seats.push({ id: `bar_booth_${i}`, label: 'Bar Booth', ...venueToWorld(iu0 + 1.1, z), facingYaw: -Math.PI / 2 });
    obstacles.push({ type: 'box', ...venueToWorld(iu0 + 1.1, z), hw: 0.5, hd: 1.2 });
  }
  // Corner stage.
  b.box('wood', 3.0, 0.35, 1.8, iu1 - 2.6, 0.17, iz1 - 1.6);
  b.box('trim', 0.6, 1.4, 0.6, iu1 - 2.6, 1.05, iz1 - 2.2);
  obstacles.push({ type: 'box', ...venueToWorld(iu1 - 2.6, iz1 - 1.6), hw: 1.6, hd: 1.0 });
  b.box('emissive', 2.0, 0.1, 0.16, iu1 - 2.6, 2.5, iz1 - 0.4);
  b.blob('leaf', 0.38, iu0 + 1.0, 0.82, iz1 - 1.0, 1.1);
}

function buildTokeLoungeInterior(b: VenueMeshBuilder, v: CityVenue, seats: VenueSeat[], interactions: VenueInteractionPoint[], obstacles: VenueObstacle[]) {
  const { iu0, iu1, iz0, iz1 } = v;
  const midU = (iu0 + iu1) / 2;
  // Lounge pit: sofas around low tables.
  const ring = [
    { u: midU - 3.4, z: iz0 + 4.2, yaw: Math.PI / 2 },
    { u: midU + 3.4, z: iz0 + 4.2, yaw: -Math.PI / 2 },
    { u: midU - 3.4, z: iz0 + 7.4, yaw: Math.PI / 2 },
    { u: midU + 3.4, z: iz0 + 7.4, yaw: -Math.PI / 2 },
  ];
  for (let i = 0; i < ring.length; i += 1) {
    const spot = ring[i];
    b.box('fabric', 1.1, 0.58, 2.2, spot.u, 0.29, spot.z);
    b.box('fabric', 0.22, 1.0, 2.2, spot.u + (spot.yaw > 0 ? 0.44 : -0.44), 0.5, spot.z);
    seats.push({ id: `toke_sofa_${i}`, label: 'Lounge Sofa', ...venueToWorld(spot.u, spot.z), facingYaw: spot.yaw });
    obstacles.push({ type: 'box', ...venueToWorld(spot.u, spot.z), hw: 0.65, hd: 1.15 });
  }
  for (const z of [iz0 + 4.2, iz0 + 7.4]) {
    b.box('wood', 1.5, 0.36, 0.9, midU, 0.18, z);
    b.box('trim', 0.5, 0.12, 0.5, midU, 0.42, z);
    obstacles.push({ type: 'box', ...venueToWorld(midU, z), hw: 0.85, hd: 0.55 });
  }
  // Herb bar along the back wall.
  const barZ = iz1 - 2.0;
  b.box('wood', (iu1 - iu0) - 4.0, 1.0, 0.8, midU, 0.5, barZ);
  b.box('trim', (iu1 - iu0) - 3.8, 0.08, 0.92, midU, 1.04, barZ);
  for (let i = 0; i < 4; i += 1) {
    b.box('glass', 0.3, 0.5, 0.3, midU - 2.2 + i * 1.45, 1.3, barZ - 0.2);
    b.blob('leaf', 0.18, midU - 2.2 + i * 1.45, 1.62, barZ - 0.2, 0.8);
  }
  obstacles.push({ type: 'box', ...venueToWorld(midU, barZ), hw: (iu1 - iu0) / 2 - 2.0, hd: 0.6 });
  interactions.push({
    id: 'toke_counter',
    venueId: 'toke_lounge',
    ...venueToWorld(midU, barZ - 1.5),
    radius: 2.8,
    label: 'Visit the herb bar',
    kind: 'inspect',
    hint: 'The lounge is 21+ after 9pm. Sofas, low tables and the patio planters are all yours.',
  });
  // Planters and warm floor lamps make it feel lived in.
  for (const [u, z] of [
    [iu0 + 1.4, iz0 + 1.4],
    [iu1 - 1.4, iz0 + 1.4],
    [iu0 + 1.4, iz1 - 1.2],
    [iu1 - 1.4, iz1 - 1.2],
  ]) {
    b.box('trim', 0.55, 0.5, 0.55, u, 0.25, z);
    b.blob('leaf', 0.55, u, 0.95, z, 1.15);
    obstacles.push({ type: 'circle', ...venueToWorld(u, z), r: 0.45 });
  }
  b.box('fabric', 5.2, 0.02, 5.0, midU, 0.16, iz0 + 5.8);
  b.box('emissive', 3.0, 0.06, 0.16, midU, v.ceiling - 0.4, iz0 + 5.8);
}

function buildRestaurantInterior(b: VenueMeshBuilder, v: CityVenue, seats: VenueSeat[], interactions: VenueInteractionPoint[], obstacles: VenueObstacle[]) {
  const { iu0, iu1, iz0, iz1 } = v;
  const midU = (iu0 + iu1) / 2;
  // Service counter with a pass to the kitchen.
  const counterZ = iz0 + 2.2;
  b.box('wood', 5.0, 1.05, 1.0, midU, 0.52, counterZ);
  b.box('trim', 5.2, 0.1, 1.1, midU, 1.1, counterZ);
  b.box('metal', 1.2, 0.5, 0.6, midU - 1.2, 1.35, counterZ);
  b.box('emissive', 2.2, 0.16, 0.08, midU, 2.6, counterZ - 0.5);
  obstacles.push({ type: 'box', ...venueToWorld(midU, counterZ), hw: 2.6, hd: 0.65 });
  interactions.push({
    id: 'restaurant_host',
    venueId: 'restaurant',
    ...venueToWorld(midU, counterZ + 1.6),
    radius: 2.8,
    label: 'Ask for a table',
    kind: 'inspect',
    hint: 'The Copper Fork serves all day. Window tables and the back banquette are open.',
  });
  // Banquette seating down the east wall.
  for (let i = 0; i < 3; i += 1) {
    const z = iz0 + 4.4 + i * 3.2;
    b.box('fabric', 0.85, 0.55, 2.4, iu1 - 1.2, 0.28, z);
    b.box('fabric', 0.2, 1.15, 2.4, iu1 - 0.85, 0.58, z);
    b.box('wood', 1.2, 0.06, 1.3, iu1 - 2.1, 0.74, z);
    b.box('wood', 0.1, 0.72, 0.1, iu1 - 2.1, 0.36, z);
    seats.push({ id: `restaurant_banquette_${i}`, label: 'Banquette', ...venueToWorld(iu1 - 1.2, z), facingYaw: -Math.PI / 2 });
    b.box('wood', 0.48, 0.06, 0.48, iu1 - 2.9, 0.45, z);
    b.box('wood', 0.48, 0.5, 0.08, iu1 - 2.9, 0.7, z + 0.2);
    seats.push({ id: `restaurant_chair_${i}`, label: 'Dining Chair', ...venueToWorld(iu1 - 2.9, z), facingYaw: Math.PI / 2 });
    obstacles.push({ type: 'box', ...venueToWorld(iu1 - 1.4, z), hw: 0.7, hd: 1.2 });
  }
  // Window two-tops.
  for (let i = 0; i < 3; i += 1) {
    const z = iz0 + 4.0 + i * 3.4;
    const u = iu0 + 2.8;
    b.cylinder('metal', 0.06, 0.72, u, 0.36, z, 8);
    b.cylinder('wood', 0.52, 0.06, u, 0.74, z, 16);
    for (const side of [-0.8, 0.8]) {
      b.box('wood', 0.44, 0.06, 0.44, u + side, 0.45, z);
      b.box('wood', 0.44, 0.5, 0.08, u + side, 0.7, z + 0.2);
      seats.push({ id: `restaurant_table_${i}_${side > 0 ? 'e' : 'w'}`, label: 'Dining Chair', ...venueToWorld(u + side, z), facingYaw: 0 });
    }
    obstacles.push({ type: 'circle', ...venueToWorld(u, z), r: 0.7 });
  }
  // Planter divider and pendant lights.
  for (let i = 0; i < 4; i += 1) {
    b.box('trim', 0.5, 0.46, 0.5, midU + 2.0, 0.23, iz0 + 4.0 + i * 2.6);
    b.blob('leaf', 0.42, midU + 2.0, 0.85, iz0 + 4.0 + i * 2.6, 1.1);
  }
  for (const u of [midU - 2.6, midU, midU + 2.6]) {
    b.box('emissive', 0.35, 0.2, 0.35, u, v.ceiling - 0.5, iz0 + 5.4);
  }
}

function buildEventHallInterior(b: VenueMeshBuilder, v: CityVenue, seats: VenueSeat[], interactions: VenueInteractionPoint[], obstacles: VenueObstacle[]) {
  const { iu0, iu1, iz0, iz1 } = v;
  const midU = (iu0 + iu1) / 2;
  // Stage at the far end with a screen and lectern.
  b.box('wood', (iu1 - iu0) - 4.0, 0.6, 3.0, midU, 0.3, iz1 - 2.2);
  b.box('trim', 0.9, 1.2, 0.6, midU + 2.2, 1.2, iz1 - 2.2);
  b.box('emissive', 5.4, 2.4, 0.14, midU - 1.0, 2.2, iz1 - 0.6);
  obstacles.push({ type: 'box', ...venueToWorld(midU, iz1 - 2.2), hw: (iu1 - iu0) / 2 - 2.0, hd: 1.6 });
  interactions.push({
    id: 'event_hall_stage',
    venueId: 'event_hall',
    ...venueToWorld(midU, iz1 - 4.2),
    radius: 2.8,
    label: 'Check the event programme',
    kind: 'inspect',
    hint: 'Tonight: a live set at 8, the neighbourhood assembly at 6. Every chair in the hall is free.',
  });
  // Rows of stackable chairs facing the stage.
  for (let row = 0; row < 4; row += 1) {
    const z = iz0 + 3.2 + row * 2.2;
    const count = Math.max(3, Math.min(6, Math.floor((iu1 - iu0 - 2.0) / 1.9)));
    for (let i = 0; i < count; i += 1) {
      const u = midU - ((count - 1) * 1.7) / 2 + i * 1.7;
      b.box('fabric', 0.46, 0.08, 0.46, u, 0.46, z);
      b.box('fabric', 0.46, 0.5, 0.08, u, 0.72, z + 0.21);
      seats.push({ id: `hall_chair_${row}_${i}`, label: 'Hall Chair', ...venueToWorld(u, z), facingYaw: Math.PI });
      obstacles.push({ type: 'box', ...venueToWorld(u, z), hw: 0.3, hd: 0.3 });
    }
  }
  // Ticket / welcome desk by the doors.
  const deskZ = iz0 + 1.6;
  b.box('wood', 3.4, 1.0, 0.85, iu0 + 2.4, 0.5, deskZ);
  b.box('trim', 3.6, 0.08, 0.95, iu0 + 2.4, 1.04, deskZ);
  obstacles.push({ type: 'box', ...venueToWorld(iu0 + 2.4, deskZ), hw: 1.8, hd: 0.55 });
  b.box('wood', 0.5, 0.44, 0.5, iu0 + 3.8, 0.22, deskZ + 1.0);
  // Coat rail and pendant wash.
  for (let i = 0; i < 3; i += 1) {
    b.box('emissive', 0.3, 0.14, 0.9, midU - 3.0 + i * 3.0, v.ceiling - 0.4, iz0 + 4.4);
  }
  b.box('trim', 0.12, 1.8, 2.2, iu1 - 0.5, 1.0, iz0 + 3.0);
  b.blob('leaf', 0.44, iu1 - 1.0, 0.86, iz1 - 3.4, 1.1);
}

function buildVenueInterior(b: VenueMeshBuilder, v: CityVenue, seats: VenueSeat[], interactions: VenueInteractionPoint[], obstacles: VenueObstacle[]) {
  switch (v.id) {
    case 'library':
      buildLibraryInterior(b, v, seats, interactions, obstacles);
      break;
    case 'med_deck':
      buildMedDeckInterior(b, v, seats, interactions, obstacles);
      break;
    case 'community_center':
      buildCommunityInterior(b, v, seats, interactions, obstacles);
      break;
    case 'cafe':
      buildCafeInterior(b, v, seats, interactions, obstacles);
      break;
    case 'market':
      buildMarketInterior(b, v, seats, interactions, obstacles);
      break;
    case 'cinema':
      buildCinemaInterior(b, v, seats, interactions, obstacles);
      break;
    case 'event_hall':
      buildEventHallInterior(b, v, seats, interactions, obstacles);
      break;
    case 'nightclub':
      buildNightclubInterior(b, v, seats, interactions, obstacles);
      break;
    case 'bar':
      buildBarInterior(b, v, seats, interactions, obstacles);
      break;
    case 'toke_lounge':
      buildTokeLoungeInterior(b, v, seats, interactions, obstacles);
      break;
    case 'restaurant':
      buildRestaurantInterior(b, v, seats, interactions, obstacles);
      break;
    default:
      break;
  }
}

function buildStreetLandscaping(b: VenueMeshBuilder, v: CityVenue) {
  // Street trees and planters along the venue frontage.
  const { u0, u1, z0, z1, doorSide, doorU, doorZ } = v;
  const along: Array<[number, number]> = [];
  if (doorSide === 'north' || doorSide === 'south') {
    const z = doorSide === 'north' ? z0 - 1.3 : z1 + 1.3;
    for (let u = u0 + 1.6; u <= u1 - 1.4; u += 4.4) {
      if (Math.abs(u - doorU) < 2.6) continue;
      along.push([u, z]);
    }
  } else {
    const u = doorSide === 'west' ? u0 - 1.3 : u1 + 1.3;
    for (let z = z0 + 1.6; z <= z1 - 1.4; z += 4.4) {
      if (Math.abs(z - doorZ) < 2.6) continue;
      along.push([u, z]);
    }
  }
  for (const [u, z] of along) {
    b.cylinder('wood', 0.16, 3.0, u, 1.5, z, 8);
    b.blob('leaf', 1.35, u, 3.6, z, 0.85);
    b.blob('leaf', 0.95, u + 0.5, 2.9, z - 0.3, 0.85);
    b.box('trim', 1.2, 0.28, 1.2, u, 0.14, z);
  }
}

export function buildCityVenues(maxAnisotropy: number): VenueBuildResult {
  const root = new THREE.Group();
  root.name = 'city-venues';
  const seats: VenueSeat[] = [];
  const interactions: VenueInteractionPoint[] = [];
  const obstacles: VenueObstacle[] = [];
  const occluders: VenueOccluder[] = [];
  const roofs = new Map<VenueId, THREE.Object3D[]>();

  const glassTexture = null;
  for (const venue of CITY_VENUES) {
    const materials: Partial<Record<MaterialKey, THREE.Material>> = {
      body: new THREE.MeshStandardMaterial({ color: venue.palette.body, roughness: 0.82, metalness: 0.04 }),
      trim: new THREE.MeshStandardMaterial({ color: venue.palette.trim, roughness: 0.62, metalness: 0.12 }),
      glass: new THREE.MeshStandardMaterial({
        color: venue.palette.glass,
        roughness: 0.12,
        metalness: 0.72,
        transparent: true,
        opacity: 0.72,
      }),
      accent: new THREE.MeshStandardMaterial({ color: venue.palette.accent, roughness: 0.55, metalness: 0.1 }),
      floor: new THREE.MeshStandardMaterial({ color: venue.palette.floor, roughness: 0.9 }),
      wood: new THREE.MeshStandardMaterial({
        color: '#8a6440',
        roughness: 0.72,
        emissive: new THREE.Color('#2a1c10'),
        emissiveIntensity: 0.55,
      }),
      metal: new THREE.MeshStandardMaterial({ color: '#3c4249', roughness: 0.42, metalness: 0.65 }),
      fabric: new THREE.MeshStandardMaterial({
        color: '#6e7f8c',
        roughness: 0.95,
        emissive: new THREE.Color('#20262b'),
        emissiveIntensity: 0.6,
      }),
      leaf: new THREE.MeshStandardMaterial({ color: '#3f6b3a', roughness: 0.95 }),
      line: new THREE.MeshStandardMaterial({
        color: '#e7e2d6',
        roughness: 0.96,
        emissive: new THREE.Color('#4a453c'),
        emissiveIntensity: 0.45,
      }),
      emissive: new THREE.MeshStandardMaterial({
        color: '#fff3cf',
        emissive: new THREE.Color('#ffe4a3'),
        emissiveIntensity: 1.1,
        roughness: 0.4,
      }),
    };
    const builder = new VenueMeshBuilder();
    const roofGroup = new THREE.Group();
    const frontGroup = new THREE.Group();
    buildShell(builder, venue, roofGroup, frontGroup, materials);
    buildFacade(builder, venue, frontGroup, materials);
    buildStreetLandscaping(builder, venue);
    buildVenueInterior(builder, venue, seats, interactions, obstacles);



    const venueGroup = builder.finish(materials);
    venueGroup.name = `venue-${venue.id}`;

    // Interior floor plate (slightly above the city sidewalk).
    const floor = new THREE.Mesh(
      new THREE.BoxGeometry(venue.iu1 - venue.iu0, 0.03, venue.iz1 - venue.iz0),
      new THREE.MeshStandardMaterial({ color: venue.palette.floor, roughness: 0.88 })
    );
    floor.position.set((venue.iu0 + venue.iu1) / 2, 0.135, (venue.iz0 + venue.iz1) / 2);
    floor.receiveShadow = true;
    venueGroup.add(floor);

    // Sign above the doors.
    const signTexture = createSignTexture(venue.sign, '#111418', '#f4f7f2', venue.palette.accent);
    const signWidth = Math.min(9.5, venue.doorWidth + 5.4);
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(signWidth, signWidth * (192 / 1024)),
      new THREE.MeshBasicMaterial({ map: signTexture, toneMapped: false })
    );
    const signY = Math.min(venue.height - 1.1, 4.35);
    if (venue.doorSide === 'north') {
      sign.position.set(venue.doorU, signY, venue.z0 - 0.08);
      sign.rotation.y = Math.PI;
    } else if (venue.doorSide === 'south') {
      sign.position.set(venue.doorU, signY, venue.z1 + 0.08);
    } else if (venue.doorSide === 'west') {
      sign.position.set(venue.u0 - 0.08, signY, venue.doorZ);
      sign.rotation.y = -Math.PI / 2;
    } else {
      sign.position.set(venue.u1 + 0.08, signY, venue.doorZ);
      sign.rotation.y = Math.PI / 2;
    }
    venueGroup.add(sign);

    // Entrance marker so the doors read from a distance.
    const marker = new THREE.Mesh(
      new THREE.CircleGeometry(0.55, 24),
      new THREE.MeshBasicMaterial({ color: venue.palette.accent, transparent: true, opacity: 0.22 })
    );
    marker.rotation.x = -Math.PI / 2;
    marker.position.set(venue.doorU, 0.2, venue.doorZ + (venue.doorSide === 'north' ? 1.1 : venue.doorSide === 'south' ? -1.1 : 0));
    if (venue.doorSide === 'west') marker.position.set(venue.u0 + 1.1, 0.2, venue.doorZ);
    if (venue.doorSide === 'east') marker.position.set(venue.u1 - 1.1, 0.2, venue.doorZ);
    venueGroup.add(marker);

    venueGroup.add(roofGroup);
    venueGroup.add(frontGroup);
    roofs.set(venue.id, [roofGroup, frontGroup]);
    root.add(venueGroup);

    occluders.push({ u0: venue.u0, u1: venue.u1, z0: venue.z0, z1: venue.z1, y0: 0, y1: venue.height });
  }

  // One shear matrix aligns every venue with the diagonal letter streets.
  root.matrixAutoUpdate = false;
  root.matrix.set(1, 0, SLOPE, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);
  root.matrixWorldNeedsUpdate = true;

  void maxAnisotropy;
  void glassTexture;

  const update = (x: number, z: number) => {
    const u = x - SLOPE * z;
    for (const venue of CITY_VENUES) {
      const inside = u > venue.u0 - 0.6 && u < venue.u1 + 0.6 && z > venue.z0 - 0.6 && z < venue.z1 + 0.6;
      for (const group of roofs.get(venue.id) ?? []) group.visible = !inside;
    }
  };

  return { group: root, seats, interactions, obstacles, occluders, update };
}
