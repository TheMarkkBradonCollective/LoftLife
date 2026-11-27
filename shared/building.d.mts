export const FLOOR_HEIGHT: number;
export const MAX_LEVELS: number;
export const LEVEL_KINDS: readonly string[];

export interface LeveledItem {
  uid?: string;
  level?: number;
  gx?: number;
  gz?: number;
  rot?: number;
  size?: [number, number];
}

export interface LevelSurface {
  floor: string;
  wall: string;
}

export function clampLevel(value: unknown): number;
export function levelElevation(level: number): number;
export function levelKind(level: number, levelCount?: number): 'ground' | 'upper' | 'rooftop';
export function levelLabel(level: number, levelCount?: number): string;
export function levelCount(items?: { level?: number }[], floors?: unknown[]): number;
export function normalizeFloors(
  surfaces?: { floor?: string; wall?: string; floors?: LevelSurface[] },
  items?: { level?: number }[]
): LevelSurface[];
export function stairTargetLevel(level: number, levelCount?: number): number | null;
export function isStairKind(modelKind: string | undefined): boolean;
export function stairTransitionFor(
  item: { level?: number } | null | undefined,
  playerLevel: number,
  modelKind: string | undefined,
  levelTotal?: number
): number | null;
export function joinWallRun<T extends LeveledItem>(
  candidate: T,
  existing: LeveledItem[],
  options?: { tolerance?: number; maxLevels?: number }
): T & { level: number };
export function itemsOnLevel<T extends { level?: number }>(items: T[], level?: number): T[];
export function splitByLevel<T extends { level?: number }>(items: T[]): [number, (T & { level: number })[]][];
