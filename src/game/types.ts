export type WorldLocation = 'room' | 'resident_room' | 'hallway' | 'lobby' | 'world';

export type ViewMode = 'isometric' | 'play';

export type GameMode = 'walk' | 'edit';

export type LightingMood = 'morning' | 'golden' | 'night';

export type EmoteType = 'idle' | 'walk' | 'sit' | 'wave' | 'dance' | 'cheer' | 'jump';

export type FurnitureCategory =
  | 'seating'
  | 'tables'
  | 'living'
  | 'lighting'
  | 'plants_rugs'
  | 'wall';

export type PlacementLayer = 'floor' | 'rug' | 'wall';

export interface FurnitureCatalogItem {
  id: string;
  name: string;
  category: FurnitureCategory;
  layer: PlacementLayer;
  /** Footprint [width, depth] in grid tiles (1 tile = 1m) */
  size: [number, number];
  /** Whether avatar can walk over this item (e.g. rugs) */
  walkable?: boolean;
  /** Whether avatar can sit on this item */
  sittable?: boolean;
  /** Seat height and local offset [x, y, z] relative to item center at rot=0 */
  seatOffset?: [number, number, number];
  /** Approach offset [x, z] in front of seat at rot=0 */
  seatApproach?: [number, number];
  /** Interactive toggle (lamps, tv, turntable, fireplace) */
  interactive?: boolean;
  /** Height from floor for wall items */
  wallHeight?: number;
  /** Available color palette swatches (primary fabric/wood/paint) */
  colors: { label: string; hex: string }[];
  defaultColor: string;
}

export type WallSide = 'north' | 'east' | 'south' | 'west';

export interface PlacedItem {
  uid: string;
  catalogId: string;
  /** Grid X (0..GRID_SIZE-1) */
  gx: number;
  /** Grid Z (0..GRID_SIZE-1) */
  gz: number;
  /** Rotation steps (0, 1, 2, 3) * 90 deg */
  rot: 0 | 1 | 2 | 3;
  /** For wall items: which of the four suite walls it hangs on. */
  wall?: WallSide;
  color: string;
  /** Interactive state (e.g., lamp on/off, tv on/off) */
  active?: boolean;
}

export type FloorStyleId = 'oak_parquet' | 'walnut_herringbone' | 'terrazzo' | 'concrete' | 'boucle_carpet';
export type WallStyleId = 'warm_chalk' | 'sage_plaster' | 'terracotta' | 'slate_blue' | 'charcoal_loft' | 'soft_blush';

export interface RoomSurfaceConfig {
  floor: FloorStyleId;
  wall: WallStyleId;
}

export type HairStyleId = 'bob' | 'afro' | 'ponytail' | 'sidepart' | 'buns' | 'spiky';
export type TopStyleId = 'hoodie' | 'blazer' | 'tee' | 'turtleneck';
export type AccessoryId = 'none' | 'glasses' | 'headphones' | 'beanie';

export type MakeupStyleId = 'natural' | 'soft' | 'bold';

export interface AvatarConfig {
  name: string;
  makeupStyle?: MakeupStyleId;
  skinTone: string;
  hairStyle: HairStyleId;
  hairColor: string;
  topStyle: TopStyleId;
  topColor: string;
  bottomColor: string;
  shoeColor: string;
  accessory: AccessoryId;
}

export interface RoomPreset {
  id: string;
  name: string;
  surfaces: RoomSurfaceConfig;
  mood: LightingMood;
  items: PlacedItem[];
}

export interface ActiveResident {
  id: string;
  name: string;
  roomNumber: string;
  floor: number;
  status: string;
  greeting: string;
  avatar: AvatarConfig;
  surfaces: RoomSurfaceConfig;
  mood: LightingMood;
  items: PlacedItem[];
}
