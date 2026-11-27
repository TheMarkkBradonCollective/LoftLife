/**
 * Entry point bundled by scripts/render-catalog-previews.mjs.
 *
 * It exposes the game's own catalog and the game's own model builders to the
 * Node renderer, which is what guarantees a preview image is produced from the
 * exact object the player places.
 */
export { FURNITURE_CATALOG, getCatalogItem } from './catalog';
export { buildFurnitureGroup } from './furniture';
export {
  MODEL_BUILDERS,
  MODEL_KIT_VERSION,
  buildCatalogModel,
  hasModelKind,
  previewAngleFor,
} from './models';
export { EXPANSION_CATALOG, getExpansionCatalogItem } from './catalogExpansion';
