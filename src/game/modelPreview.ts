import * as THREE from 'three';
import { getCatalogItem } from './catalog';
import { getExpansionCatalogItem } from './catalogExpansion';
import { buildFurnitureGroup } from './furniture';
import { buildCatalogModel } from './models';

/**
 * Build the actual game model for a catalog id, for live 3D inspection in the
 * shop and build panels. Uses the same builders as placement, so what the
 * player inspects is what they get.
 */
export function buildPreviewModel(catalogId: string, color?: string, active = true): THREE.Group | null {
  const item = getCatalogItem(catalogId);
  if (!item) return null;
  const colour = color ?? item.defaultColor;
  const expansion = getExpansionCatalogItem(catalogId);
  if (expansion) {
    const group = buildCatalogModel(expansion, { color: colour, active });
    return group && group.children.length ? group : null;
  }
  const group = buildFurnitureGroup(
    { uid: 'preview', catalogId, gx: 0, gz: 0, rot: 0, color: colour, active },
    { maxAnisotropy: 4 }
  );
  return group.children.length ? group : null;
}
