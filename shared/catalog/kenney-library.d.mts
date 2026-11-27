/** Types for the generated Kenney catalog (plain ESM read by browser and Node). */

export interface KenneyAsset {
  path: string;
  r2Key: string;
  preview: string;
  previewR2Key: string;
  kit: string;
  kitLabel: string;
  styleGroup: string;
  styleLabel: string;
  originalName: string;
  scale: number;
  bounds: [number, number, number];
  rawBounds: [number, number, number];
  triangles: number;
  materials: string[];
  textures: string[];
  tintRoles: string[];
  license: string;
  source: string;
  sourceUrl: string;
  licenseUrl: string;
}

export interface KenneyItem {
  id: string;
  name: string;
  category: string;
  subcategory: string;
  layer: 'floor' | 'rug' | 'wall';
  size: [number, number];
  description: string;
  colors: { label: string; hex: string }[];
  defaultColor: string;
  price: number;
  currency: 'yuanzi' | 'tongbao';
  themes: string[];
  styles: string[];
  tags: string[];
  availability: 'available' | 'incomplete' | 'retired';
  version: number;
  asset: KenneyAsset;
  wallHeight?: number;
  walkable?: boolean;
  sittable?: boolean;
  seatOffset?: [number, number, number];
  seatApproach?: [number, number];
  interactive?: boolean;
  order: number;
}

export const KENNEY_SOURCE: Record<string, string>;
export const KENNEY_SUMMARY: Record<string, unknown>;
export const KENNEY_ITEMS: KenneyItem[];
export const KENNEY_BY_ID: Record<string, KenneyItem>;
export const KENNEY_PRICES: Record<string, { price: number; currency: 'yuanzi' | 'tongbao' }>;
export const KENNEY_STYLE_GROUPS: { id: string; label: string }[];
export function getKenneyItem(id: string): KenneyItem | null;
