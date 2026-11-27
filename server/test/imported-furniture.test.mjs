import test from 'node:test';
import assert from 'node:assert/strict';
import {
  IMPORTED_FURNITURE_ASSETS,
  IMPORTED_FURNITURE_LIBRARY,
} from '../../shared/catalog/imported-furniture.mjs';

test('imported furniture is a small, curated CC0 Poly Haven set', () => {
  assert.equal(IMPORTED_FURNITURE_LIBRARY.source, 'polyhaven');
  assert.equal(IMPORTED_FURNITURE_LIBRARY.license, 'CC0');
  assert.match(IMPORTED_FURNITURE_LIBRARY.repository, /^nirholas\//);
  assert.ok(IMPORTED_FURNITURE_ASSETS.length >= 6);

  const ids = new Set();
  const slugs = new Set();
  for (const asset of IMPORTED_FURNITURE_ASSETS) {
    assert.ok(asset.catalogId);
    assert.ok(asset.slug);
    assert.ok(asset.label);
    assert.ok(Array.isArray(asset.targetDimensions));
    assert.equal(asset.targetDimensions.length, 3);
    assert.ok(asset.targetDimensions.every((value) => Number.isFinite(value) && value > 0));
    assert.ok(asset.tintStrength >= 0 && asset.tintStrength <= 0.3);
    assert.equal(ids.has(asset.catalogId), false, `duplicate catalog id: ${asset.catalogId}`);
    assert.equal(slugs.has(asset.slug), false, `duplicate source model: ${asset.slug}`);
    ids.add(asset.catalogId);
    slugs.add(asset.slug);
  }
});
