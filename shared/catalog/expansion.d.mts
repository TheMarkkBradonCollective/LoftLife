/** Types for the shared catalog data module (plain ESM, consumed by browser and Node). */

export type CatalogCurrency = 'yuanzi' | 'tongbao';
export type CatalogLayer = 'floor' | 'rug' | 'wall';

export interface ExpansionItem {
  id: string;
  slug: string;
  name: string;
  category: string;
  subcategory: string;
  description: string;
  layer: CatalogLayer;
  size: [number, number];
  model: { kind: string; params?: Record<string, unknown> };
  colors: { label: string; hex: string }[];
  defaultColor: string;
  price: number;
  currency: CatalogCurrency;
  availability: 'available' | 'incomplete' | 'retired';
  ownership: string;
  version: number;
  placement: 'indoor' | 'outdoor' | 'both';
  previewBase: string;
  sizes: { label: string; size: [number, number]; scale: number }[] | null;
  themes?: string[];
  styles?: string[];
  wallHeight?: number;
  walkable?: boolean;
  sittable?: boolean;
  seatOffset?: [number, number, number];
  seatApproach?: [number, number];
  interactive?: boolean;
  mount?: 'ceiling';
  order: number;
}

export interface CatalogCategory {
  id: string;
  label: string;
  subcategories: { id: string; label: string }[];
}

export const PREVIEW_SIZE: number;
export const PREVIEW_DIR: string;
export const CATALOG_CATEGORIES: CatalogCategory[];
export const CATALOG_CATEGORY_IDS: string[];
export const COLLECTIONS: { id: string; label: string }[];
export const EXPANSION_ITEMS: ExpansionItem[];
export const EXPANSION_PRICES: Record<string, { price: number; currency: CatalogCurrency }>;
export const EXPANSION_BY_ID: Record<string, ExpansionItem>;
export function getExpansionItem(id: string): ExpansionItem | null;
export function itemsInCategory(categoryId: string): ExpansionItem[];
export function itemsInCollection(collectionId: string): ExpansionItem[];
export function validateCatalogEntries(): string[];
