import { EXPANSION_ITEMS, type ExpansionItem } from '../../shared/catalog/expansion.mjs';
import type { FurnitureCatalogItem, FurnitureCategory } from './types';

/**
 * Bridges the shared catalog records into the game's furniture catalog.
 *
 * The shared module is the canonical record (also read by the Node server for
 * prices and validation); this file only maps it into the typed client shape
 * and derives preview URLs. Keeping the mapping one-way means a price or an id
 * cannot drift between shop, inventory and build mode.
 */

export const EXPANSION_CATALOG: FurnitureCatalogItem[] = EXPANSION_ITEMS.map((entry) => {
  const item: FurnitureCatalogItem & { sourceEntry: ExpansionItem } = {
    id: entry.id,
    name: entry.name,
    category: entry.category as FurnitureCategory,
    subcategory: entry.subcategory,
    description: entry.description,
    layer: entry.layer,
    size: entry.size,
    colors: entry.colors,
    defaultColor: entry.defaultColor,
    price: entry.price,
    currency: entry.currency,
    themes: entry.themes ?? [],
    styleTags: entry.styles ?? [],
    model: entry.model,
    previewBase: `/${entry.previewBase}`,
    availability: entry.availability,
    assetVersion: entry.version,
    placement: entry.placement,
    mount: entry.mount,
    sizes: entry.sizes,
    wallHeight: entry.wallHeight,
    walkable: entry.walkable,
    sittable: entry.sittable,
    seatOffset: entry.seatOffset,
    seatApproach: entry.seatApproach,
    interactive: entry.interactive,
    sourceEntry: entry,
  };
  return item;
});

const BY_ID = new Map(EXPANSION_CATALOG.map((item) => [item.id, item]));

export function getExpansionCatalogItem(id: string): FurnitureCatalogItem | undefined {
  return BY_ID.get(id);
}

export function isExpansionItem(id: string): boolean {
  return BY_ID.has(id);
}

/**
 * Preview image for an item, optionally for a specific colour variant.
 * Variant 0 is the item's base image; other variants use `-<index>`.
 */
export function catalogPreviewUrl(
  item: Pick<FurnitureCatalogItem, 'id' | 'previewBase' | 'colors'>,
  colour?: string
): string {
  const base = item.previewBase ?? `/catalog-previews/${item.id}`;
  if (!colour) return `${base}.png`;
  const index = item.colors.findIndex((swatch) => swatch.hex.toLowerCase() === colour.toLowerCase());
  if (index <= 0) return `${base}.png`;
  return `${base}-${index}.png`;
}
