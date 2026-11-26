import { getCatalogItem, GRID_SIZE } from './catalog';
import type { PlacedItem } from './types';
import {
  normalizeWallSide,
  wallAllowsPlacement,
  wallAxis,
  wallItemTransform,
} from '../../shared/room-walls.mjs';
import type { WallSide } from './types';

export const SNAP_STEP = 0.5;

export function snapGrid(val: number): number {
  return Math.round(val / SNAP_STEP) * SNAP_STEP;
}

export function getEffectiveSize(
  catalogId: string,
  rot: 0 | 1 | 2 | 3
): [number, number] {
  const item = getCatalogItem(catalogId);
  if (!item) return [1, 1];
  return rot % 2 === 0 ? [item.size[0], item.size[1]] : [item.size[1], item.size[0]];
}

export function gridToWorldCenter(
  gx: number,
  gz: number,
  ew: number,
  ed: number
): { x: number; z: number } {
  return {
    x: -GRID_SIZE / 2 + gx + ew / 2,
    z: -GRID_SIZE / 2 + gz + ed / 2,
  };
}

export function getItemWorldTransform(placed: PlacedItem): {
  x: number;
  y: number;
  z: number;
  rotY: number;
} {
  const cat = getCatalogItem(placed.catalogId);
  if (!cat) return { x: 0, y: 0, z: 0, rotY: 0 };

  if (cat.layer === 'wall') {
    const wall = normalizeWallSide(placed.wall) as WallSide;
    const along = wallAxis(wall) === 'x' ? placed.gx : placed.gz;
    return wallItemTransform({
      wall,
      start: along,
      span: cat.size[0],
      height: cat.wallHeight ?? 1.85,
      gridSize: GRID_SIZE,
    });
  }

  const [ew, ed] = getEffectiveSize(placed.catalogId, placed.rot);
  const { x, z } = gridToWorldCenter(placed.gx, placed.gz, ew, ed);
  return {
    x,
    y: cat.layer === 'rug' ? 0.02 : 0,
    z,
    rotY: (placed.rot * Math.PI) / 2,
  };
}

export function isValidPlacement(
  candidate: Omit<PlacedItem, 'uid'> & { uid?: string },
  existingItems: PlacedItem[]
): boolean {
  const cat = getCatalogItem(candidate.catalogId);
  if (!cat) return false;

  if (cat.layer === 'wall') {
    const span = cat.size[0];
    const wall = normalizeWallSide(candidate.wall) as WallSide;
    const onX = wallAxis(wall) === 'x';
    const start = onX ? candidate.gx : candidate.gz;
    // Window openings (west + south) and the west suite door reject overlap.
    if (!wallAllowsPlacement(wall, start, span, GRID_SIZE)) return false;
    return !existingItems.some((other) => {
      if (other.uid === candidate.uid) return false;
      const otherCat = getCatalogItem(other.catalogId);
      if (!otherCat || otherCat.layer !== 'wall') return false;
      if (normalizeWallSide(other.wall) !== wall) return false;
      const otherStart = onX ? other.gx : other.gz;
      return start < otherStart + otherCat.size[0] - 0.01 && start + span > otherStart + 0.01;
    });
  }

  const [ew, ed] = getEffectiveSize(candidate.catalogId, candidate.rot);
  if (
    candidate.gx < -0.001 ||
    candidate.gz < -0.001 ||
    candidate.gx + ew > GRID_SIZE + 0.001 ||
    candidate.gz + ed > GRID_SIZE + 0.001
  ) {
    return false;
  }

  // Rugs only collide with other rugs; floor items only collide with other floor items
  const eps = 0.02;
  return !existingItems.some((other) => {
    if (other.uid === candidate.uid) return false;
    const otherCat = getCatalogItem(other.catalogId);
    if (!otherCat || otherCat.layer !== cat.layer) return false;
    const [ow, od] = getEffectiveSize(other.catalogId, other.rot);
    return (
      candidate.gx < other.gx + ow - eps &&
      candidate.gx + ew > other.gx + eps &&
      candidate.gz < other.gz + od - eps &&
      candidate.gz + ed > other.gz + eps
    );
  });
}

function rotateLocalXZ(lx: number, lz: number, rot: 0 | 1 | 2 | 3): [number, number] {
  const a = (rot * Math.PI) / 2;
  const c = Math.round(Math.cos(a));
  const s = Math.round(Math.sin(a));
  return [lx * c + lz * s, -lx * s + lz * c];
}

export function getSeatWorldInfo(placed: PlacedItem): {
  seatPos: { x: number; y: number; z: number };
  approachPos: { x: number; z: number };
  facingYaw: number;
} | null {
  const cat = getCatalogItem(placed.catalogId);
  if (!cat || !cat.sittable || !cat.seatOffset || !cat.seatApproach) return null;

  const t = getItemWorldTransform(placed);
  const [sx, sz] = rotateLocalXZ(cat.seatOffset[0], cat.seatOffset[2], placed.rot);
  const [ax, az] = rotateLocalXZ(cat.seatApproach[0], cat.seatApproach[1], placed.rot);

  return {
    seatPos: {
      x: t.x + sx,
      y: cat.seatOffset[1],
      z: t.z + sz,
    },
    approachPos: {
      x: Math.max(-GRID_SIZE / 2 + 0.4, Math.min(GRID_SIZE / 2 - 0.4, t.x + ax)),
      z: Math.max(-GRID_SIZE / 2 + 0.4, Math.min(GRID_SIZE / 2 - 0.4, t.z + az)),
    },
    facingYaw: t.rotY,
  };
}

// ---------------------------------------------------------------------------
// 0.5m Sub-Grid Collision & A* Pathfinding
// ---------------------------------------------------------------------------
const SUB = 2; // 2 cells per meter => 28 x 28 nav grid
const NAV_SIZE = GRID_SIZE * SUB;

export function buildNavGrid(items: PlacedItem[]): Uint8Array {
  const grid = new Uint8Array(NAV_SIZE * NAV_SIZE); // 0 = walkable, 1 = blocked
  for (const item of items) {
    const cat = getCatalogItem(item.catalogId);
    if (!cat || cat.layer !== 'floor' || cat.walkable) continue;
    const [ew, ed] = getEffectiveSize(item.catalogId, item.rot);
    const minX = Math.max(0, Math.round(item.gx * SUB));
    const maxX = Math.min(NAV_SIZE - 1, Math.round((item.gx + ew) * SUB) - 1);
    const minZ = Math.max(0, Math.round(item.gz * SUB));
    const maxZ = Math.min(NAV_SIZE - 1, Math.round((item.gz + ed) * SUB) - 1);
    for (let z = minZ; z <= maxZ; z++) {
      for (let x = minX; x <= maxX; x++) {
        grid[z * NAV_SIZE + x] = 1;
      }
    }
  }
  return grid;
}

export function worldToNavCell(x: number, z: number): [number, number] {
  const nx = Math.max(0, Math.min(NAV_SIZE - 1, Math.floor((x + GRID_SIZE / 2) * SUB)));
  const nz = Math.max(0, Math.min(NAV_SIZE - 1, Math.floor((z + GRID_SIZE / 2) * SUB)));
  return [nx, nz];
}

export function navCellToWorld(nx: number, nz: number): { x: number; z: number } {
  return {
    x: -GRID_SIZE / 2 + (nx + 0.5) / SUB,
    z: -GRID_SIZE / 2 + (nz + 0.5) / SUB,
  };
}

export function isWorldPosWalkable(
  x: number,
  z: number,
  items: PlacedItem[],
  radius = 0.25,
  doorUnlocked = false
): boolean {
  const half = GRID_SIZE / 2 - radius;
  const inDoorwayCorridor =
    doorUnlocked && z >= 4.64 && z <= 5.36 && x >= -7.3 && x <= -6.5;
  if (!inDoorwayCorridor && (x < -half || x > half || z < -half || z > half)) {
    return false;
  }

  for (const item of items) {
    const cat = getCatalogItem(item.catalogId);
    if (!cat || cat.layer !== 'floor' || cat.walkable) continue;
    const [ew, ed] = getEffectiveSize(item.catalogId, item.rot);
    const minX = -GRID_SIZE / 2 + item.gx - radius * 0.65;
    const maxX = -GRID_SIZE / 2 + item.gx + ew + radius * 0.65;
    const minZ = -GRID_SIZE / 2 + item.gz - radius * 0.65;
    const maxZ = -GRID_SIZE / 2 + item.gz + ed + radius * 0.65;
    if (x > minX && x < maxX && z > minZ && z < maxZ) {
      return false;
    }
  }
  return true;
}

export function findPath(
  startX: number,
  startZ: number,
  goalX: number,
  goalZ: number,
  items: PlacedItem[]
): { x: number; z: number }[] {
  const nav = buildNavGrid(items);
  const [sx, sz] = worldToNavCell(startX, startZ);
  let [gx, gz] = worldToNavCell(goalX, goalZ);

  if (nav[gz * NAV_SIZE + gx] === 1) {
    let bestDist = Infinity;
    let best: [number, number] | null = null;
    for (let dz = -3; dz <= 3; dz++) {
      for (let dx = -3; dx <= 3; dx++) {
        const cx = gx + dx;
        const cz = gz + dz;
        if (cx >= 0 && cx < NAV_SIZE && cz >= 0 && cz < NAV_SIZE && nav[cz * NAV_SIZE + cx] === 0) {
          const d = dx * dx + dz * dz;
          if (d < bestDist) {
            bestDist = d;
            best = [cx, cz];
          }
        }
      }
    }
    if (!best) return [];
    gx = best[0];
    gz = best[1];
  }

  nav[sz * NAV_SIZE + sx] = 0;

  const total = NAV_SIZE * NAV_SIZE;
  const gScore = new Float32Array(total).fill(Infinity);
  const fScore = new Float32Array(total).fill(Infinity);
  const cameFrom = new Int16Array(total).fill(-1);
  const closed = new Uint8Array(total);
  const open: number[] = [];

  const startIdx = sz * NAV_SIZE + sx;
  const goalIdx = gz * NAV_SIZE + gx;
  gScore[startIdx] = 0;
  fScore[startIdx] = Math.hypot(gx - sx, gz - sz);
  open.push(startIdx);

  const dirs = [
    [1, 0, 1],
    [-1, 0, 1],
    [0, 1, 1],
    [0, -1, 1],
    [1, 1, 1.414],
    [-1, 1, 1.414],
    [1, -1, 1.414],
    [-1, -1, 1.414],
  ];

  while (open.length > 0) {
    let bestOpenIdx = 0;
    for (let i = 1; i < open.length; i++) {
      if (fScore[open[i]] < fScore[open[bestOpenIdx]]) bestOpenIdx = i;
    }
    const curr = open.splice(bestOpenIdx, 1)[0];
    if (curr === goalIdx) {
      const cells: [number, number][] = [];
      let p = curr;
      while (p !== -1 && p !== startIdx) {
        cells.push([p % NAV_SIZE, Math.floor(p / NAV_SIZE)]);
        p = cameFrom[p];
      }
      cells.reverse();
      const waypoints = cells.map(([cx, cz]) => navCellToWorld(cx, cz));
      if (waypoints.length > 0 && isWorldPosWalkable(goalX, goalZ, items, 0.22)) {
        waypoints[waypoints.length - 1] = { x: goalX, z: goalZ };
      }
      return waypoints;
    }

    closed[curr] = 1;
    const cx = curr % NAV_SIZE;
    const cz = Math.floor(curr / NAV_SIZE);

    for (const [dx, dz, cost] of dirs) {
      const nx = cx + dx;
      const nz = cz + dz;
      if (nx < 0 || nx >= NAV_SIZE || nz < 0 || nz >= NAV_SIZE) continue;
      const nIdx = nz * NAV_SIZE + nx;
      if (closed[nIdx] || nav[nIdx] === 1) continue;
      if (dx !== 0 && dz !== 0) {
        if (nav[cz * NAV_SIZE + nx] === 1 || nav[nz * NAV_SIZE + cx] === 1) continue;
      }
      const tentative = gScore[curr] + cost;
      if (tentative < gScore[nIdx]) {
        cameFrom[nIdx] = curr;
        gScore[nIdx] = tentative;
        fScore[nIdx] = tentative + Math.hypot(gx - nx, gz - nz);
        if (!open.includes(nIdx)) open.push(nIdx);
      }
    }
  }

  return [];
}
