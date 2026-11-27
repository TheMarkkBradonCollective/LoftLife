import { KENNEY_ITEMS, KENNEY_BY_ID } from '../../shared/catalog/kenney-library.mjs';
import {
  KENNEY_REPLACEMENTS,
  REPLACED_KENNEY_IDS,
} from '../../shared/catalog/kenney-replacements.mjs';
import { VEHICLE_LIBRARY } from '../../shared/catalog/vehicle-library.mjs';
import type { FurnitureCatalogItem, FurnitureCategory } from './types';

const VEHICLE_BY_ID = new Map(
  (VEHICLE_LIBRARY.items as { id: string; group: string; groupLabel: string; trafficEligible: boolean }[]).map(
    (item) => [item.id, item]
  )
);

/**
 * Bridges the generated Kenney catalog into the game's typed catalog.
 *
 * The library is additive by default. A curated set of existing items instead
 * swaps its visual for a named Kenney model via `applyKenneyReplacements`, and
 * the matching library record is withheld so the same asset never appears
 * twice in the shop or build panel.
 */
const REPLACED = REPLACED_KENNEY_IDS as Set<string>;

export const KENNEY_CATALOG: FurnitureCatalogItem[] = KENNEY_ITEMS.filter(
  (entry) => !REPLACED.has(entry.id)
).map((entry) => ({
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
  themes: entry.themes,
  styleTags: entry.styles,
  tags: entry.tags,
  previewBase: entry.asset.preview.replace(/\.png$/, ''),
  availability: entry.availability,
  assetVersion: entry.version,
  placement: entry.category === 'outdoor' || entry.category === 'roads' ? 'outdoor' : 'both',
  wallHeight: entry.wallHeight,
  walkable: entry.walkable,
  sittable: entry.sittable,
  seatOffset: entry.seatOffset,
  seatApproach: entry.seatApproach,
  interactive: entry.interactive,
  asset: entry.asset,
  vehicleGroup: VEHICLE_BY_ID.get(entry.id)?.group,
  vehicleGroupLabel: VEHICLE_BY_ID.get(entry.id)?.groupLabel,
  trafficEligible: VEHICLE_BY_ID.get(entry.id)?.trafficEligible,
}));

/**
 * Attach a Kenney visual to an existing catalog item without changing its id,
 * price, footprint, sitting behaviour, layer or saved-room compatibility.
 */
export function applyKenneyReplacements(items: FurnitureCatalogItem[]) {
  const byId = new Map(items.map((item) => [item.id, item]));
  let applied = 0;
  for (const [catalogId, kenneyId] of Object.entries(KENNEY_REPLACEMENTS)) {
    const item = byId.get(catalogId);
    const source = KENNEY_BY_ID[kenneyId];
    if (!item || !source) continue;
    item.asset = source.asset;
    item.assetFit = true;
    item.styleTags = [...new Set([...(item.styleTags ?? []), ...source.styles, 'imported'])];
    item.tags = [...new Set([...(item.tags ?? []), ...source.tags, 'replacement'])];
    applied += 1;
  }
  return applied;
}
