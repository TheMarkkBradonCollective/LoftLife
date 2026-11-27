import * as THREE from 'three';
import { FLOOR_HEIGHT } from '../../shared/building.mjs';
import { GRID_SIZE, WALL_STYLES } from './catalog';
import { createFloorTexture } from './textures';
import type { FloorStyleId, RoomSurfaceConfig, WallSide, WallStyleId } from './types';

export interface FloorShell {
  level: number;
  group: THREE.Group;
  /** Invisible plane at this storey's floor height, used for placement rays. */
  floorPlane: THREE.Mesh;
  wallPlanes: Record<WallSide, THREE.Mesh>;
  dispose: () => void;
}

interface ShellOptions {
  maxAnisotropy: number;
  /** Top storey of the stack: open to the sky with railings instead of walls. */
  rooftop?: boolean;
}

/**
 * Real geometry for a storey above the ground floor: slab, perimeter walls with
 * a glazed band, and a ceiling slab for the storey below. Everything is built
 * once and reused while the level exists.
 */
export function buildFloorShell(
  level: number,
  surfaces: { floor: FloorStyleId; wall: WallStyleId },
  { maxAnisotropy, rooftop = false }: ShellOptions
): FloorShell {
  const group = new THREE.Group();
  group.name = `floor-shell-${level}`;
  const elevation = level * FLOOR_HEIGHT;
  group.position.y = elevation;

  const disposables: { dispose: () => void }[] = [];
  const track = <T extends { dispose: () => void }>(value: T): T => {
    disposables.push(value);
    return value;
  };

  const wallColor = WALL_STYLES.find((entry) => entry.id === surfaces.wall)?.color ?? '#f1ece2';
  const wallMat = track(
    new THREE.MeshStandardMaterial({ color: wallColor, roughness: 0.88, metalness: 0.02 })
  );
  const slabMat = track(
    new THREE.MeshStandardMaterial({ color: 0x22252e, roughness: 0.72, metalness: 0.08 })
  );
  const glassMat = track(
    new THREE.MeshPhysicalMaterial({
      color: 0xbfd8e6,
      roughness: 0.12,
      metalness: 0.05,
      transparent: true,
      opacity: 0.28,
      side: THREE.DoubleSide,
    })
  );
  const frameMat = track(
    new THREE.MeshStandardMaterial({ color: 0x23262e, roughness: 0.35, metalness: 0.65 })
  );
  const ceilingMat = track(
    new THREE.MeshStandardMaterial({ color: 0xe8e3d9, roughness: 0.92, metalness: 0.01 })
  );

  // Structural slab. Level 0's slab belongs to the ground architecture.
  const slab = new THREE.Mesh(
    track(new THREE.BoxGeometry(GRID_SIZE + 0.54, 0.4, GRID_SIZE + 0.54)),
    slabMat
  );
  slab.position.y = -0.205;
  slab.receiveShadow = true;
  group.add(slab);

  const floorMat = track(
    new THREE.MeshStandardMaterial({
      map: track(createFloorTexture(surfaces.floor, maxAnisotropy)),
      roughness: surfaces.floor === 'boucle_carpet' ? 0.92 : 0.48,
      metalness: 0.04,
    })
  );
  const floorMesh = new THREE.Mesh(track(new THREE.PlaneGeometry(GRID_SIZE, GRID_SIZE)), floorMat);
  floorMesh.rotation.x = -Math.PI / 2;
  floorMesh.position.y = 0.002;
  floorMesh.receiveShadow = true;
  group.add(floorMesh);

  const floorPlane = new THREE.Mesh(
    track(new THREE.PlaneGeometry(GRID_SIZE, GRID_SIZE)),
    track(new THREE.MeshBasicMaterial({ visible: false }))
  );
  floorPlane.rotation.x = -Math.PI / 2;
  floorPlane.position.y = 0.006;
  group.add(floorPlane);

  const half = GRID_SIZE / 2;
  const wallHeight = FLOOR_HEIGHT;
  const wallThick = 0.22;
  const wallPlanes = {} as Record<WallSide, THREE.Mesh>;
  const makeWallPlane = (side: WallSide) => {
    const plane = new THREE.Mesh(
      track(new THREE.PlaneGeometry(GRID_SIZE, wallHeight)),
      track(new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide }))
    );
    const inward = half - wallThick - 0.01;
    if (side === 'north') {
      plane.position.set(0, wallHeight / 2, -inward);
    } else if (side === 'south') {
      plane.position.set(0, wallHeight / 2, inward);
      plane.rotation.y = Math.PI;
    } else if (side === 'east') {
      plane.position.set(inward, wallHeight / 2, 0);
      plane.rotation.y = -Math.PI / 2;
    } else {
      plane.position.set(-inward, wallHeight / 2, 0);
      plane.rotation.y = Math.PI / 2;
    }
    group.add(plane);
    wallPlanes[side] = plane;
  };
  (['north', 'south', 'east', 'west'] as WallSide[]).forEach(makeWallPlane);

  if (rooftop) {
    // Parapet + railing posts instead of full walls.
    const parapetMat = track(
      new THREE.MeshStandardMaterial({ color: 0xd8d3c8, roughness: 0.8, metalness: 0.05 })
    );
    for (const side of ['north', 'south', 'east', 'west'] as WallSide[]) {
      const along = side === 'north' || side === 'south' ? GRID_SIZE : 0.12;
      const across = side === 'north' || side === 'south' ? 0.12 : GRID_SIZE;
      const parapet = new THREE.Mesh(track(new THREE.BoxGeometry(along, 0.22, across)), parapetMat);
      const off = half - 0.06;
      parapet.position.set(
        side === 'east' ? off : side === 'west' ? -off : 0,
        0.11,
        side === 'south' ? off : side === 'north' ? -off : 0
      );
      group.add(parapet);
      const rail = new THREE.Mesh(track(new THREE.BoxGeometry(along, 0.06, across)), frameMat);
      rail.position.set(parapet.position.x, 1.02, parapet.position.z);
      group.add(rail);
      const postCount = 9;
      for (let i = 0; i < postCount; i += 1) {
        const t = -half + 0.4 + (i * (GRID_SIZE - 0.8)) / (postCount - 1);
        const post = new THREE.Mesh(track(new THREE.BoxGeometry(0.05, 1.0, 0.05)), frameMat);
        post.position.set(
          side === 'north' || side === 'south' ? t : parapet.position.x,
          0.5,
          side === 'east' || side === 'west' ? t : parapet.position.z
        );
        group.add(post);
      }
    }
  } else {
    // Perimeter walls with a continuous glazed band, so upper storeys read as
    // real rooms and not as solid blocks from the outside.
    for (const side of ['north', 'south', 'east', 'west'] as WallSide[]) {
      const horizontal = side === 'north' || side === 'south';
      const length = GRID_SIZE;
      const x = side === 'east' ? half - wallThick / 2 : side === 'west' ? -half + wallThick / 2 : 0;
      const z = side === 'south' ? half - wallThick / 2 : side === 'north' ? -half + wallThick / 2 : 0;

      const lower = new THREE.Mesh(
        track(new THREE.BoxGeometry(horizontal ? length : wallThick, 0.95, horizontal ? wallThick : length)),
        wallMat
      );
      lower.position.set(x, 0.475, z);
      lower.castShadow = true;
      lower.receiveShadow = true;
      group.add(lower);

      const upper = new THREE.Mesh(
        track(
          new THREE.BoxGeometry(
            horizontal ? length : wallThick,
            wallHeight - 2.35,
            horizontal ? wallThick : length
          )
        ),
        wallMat
      );
      upper.position.set(x, wallHeight - (wallHeight - 2.35) / 2, z);
      upper.castShadow = true;
      group.add(upper);

      const glass = new THREE.Mesh(
        track(new THREE.BoxGeometry(horizontal ? length : 0.05, 1.4, horizontal ? 0.05 : length)),
        glassMat
      );
      glass.position.set(x, 1.65, z);
      group.add(glass);

      const mullions = 5;
      for (let i = 0; i < mullions; i += 1) {
        const t = -half + 0.7 + (i * (GRID_SIZE - 1.4)) / (mullions - 1);
        const mullion = new THREE.Mesh(track(new THREE.BoxGeometry(0.06, 1.4, 0.06)), frameMat);
        mullion.position.set(horizontal ? t : x, 1.65, horizontal ? z : t);
        group.add(mullion);
      }
    }

    // Ceiling for this storey. The next slab would hide it from above anyway.
    const ceiling = new THREE.Mesh(
      track(new THREE.PlaneGeometry(GRID_SIZE, GRID_SIZE)),
      ceilingMat
    );
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = FLOOR_HEIGHT - 0.02;
    ceiling.receiveShadow = true;
    group.add(ceiling);
  }

  return {
    level,
    group,
    floorPlane,
    wallPlanes,
    dispose: () => {
      for (const entry of disposables) entry.dispose();
      group.removeFromParent();
      group.clear();
    },
  };
}

/** Convenience for callers that hold a full surface config. */
export function shellSurfaceFor(
  surfaces: RoomSurfaceConfig,
  level: number
): { floor: FloorStyleId; wall: WallStyleId } {
  const entry = surfaces.floors?.[level];
  return {
    floor: entry?.floor ?? surfaces.floor,
    wall: entry?.wall ?? surfaces.wall,
  };
}
