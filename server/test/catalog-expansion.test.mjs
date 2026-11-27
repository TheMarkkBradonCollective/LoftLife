/**
 * Catalog / asset pipeline acceptance checks.
 *
 * These prove the relationship the expansion depends on: every catalog record
 * names a registered model, the preview manifest was produced from that model,
 * every preview file is a 512×512 RGBA PNG with real transparency, and the
 * server prices/shop expose exactly the same catalog the client renders.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { inspectPreview } from '../../scripts/lib/png.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const manifestPath = path.join(root, 'shared', 'catalog', 'preview-manifest.json');

const sha256 = (data) => createHash('sha256').update(data).digest('hex');

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
    .join(',')}}`;
}

/** Read width, height, bit depth and colour type without decoding pixels. */
function readPngHeader(buffer) {
  if (!buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return null;
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
    bitDepth: buffer[24],
    colourType: buffer[25],
    interlace: buffer[28],
  };
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const catalog = await import('../../shared/catalog/expansion.mjs');
const economy = await import('../economy.mjs');

test('catalog records are internally valid and ids are unique', () => {
  assert.deepEqual(catalog.validateCatalogEntries(), []);
  const ids = catalog.EXPANSION_ITEMS.map((item) => item.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.length >= 250, `expected a substantial expansion, got ${ids.length} items`);
});

test('every expanded item has a registered model kind', async () => {
  // The TypeScript registry cannot be imported by node:test directly, so the
  // manifest (written by the renderer from that registry) is the bridge.
  for (const item of catalog.EXPANSION_ITEMS) {
    const record = manifest.items[item.id];
    assert.ok(record, `${item.id} is missing from the preview manifest`);
    assert.equal(record.modelKind, item.model.kind, `${item.id} model kind drifted`);
    assert.equal(record.status, 'rendered', `${item.id} has no rendered preview`);
    assert.ok(record.triangles > 0, `${item.id} rendered an empty model`);
  }
});

test('manifest signatures match the catalog record (image ↔ model linkage)', () => {
  for (const item of catalog.EXPANSION_ITEMS) {
    const record = manifest.items[item.id];
    const expected = sha256(
      stableStringify({
        kind: item.model.kind,
        params: item.model.params ?? {},
        kitVersion: manifest.kitVersion,
      })
    ).slice(0, 20);
    assert.equal(record.signature, expected, `${item.id} preview signature does not match its model`);
  }
});

test('every catalog item (legacy and expanded) has a 512px transparent RGBA preview', () => {
  const ids = Object.keys(manifest.items);
  assert.ok(ids.length >= 344, `manifest covers ${ids.length} items`);
  let checked = 0;
  for (const [id, record] of Object.entries(manifest.items)) {
    assert.equal(record.status, 'rendered', `${id}: ${record.status}`);
    assert.ok(record.previews?.length >= 1, `${id} has no preview files`);
    for (const preview of record.previews) {
      const file = path.join(root, 'public', preview.path.replace(/^\//, ''));
      assert.ok(fs.existsSync(file), `${id}: missing ${preview.path}`);
      const buffer = fs.readFileSync(file);
      const header = readPngHeader(buffer);
      assert.ok(header, `${id}: ${preview.path} is not a PNG`);
      assert.equal(header.width, 512);
      assert.equal(header.height, 512);
      assert.equal(header.bitDepth, 8);
      assert.equal(header.colourType, 6, `${id}: preview has no alpha channel`);
      assert.equal(header.interlace, 0);
      assert.equal(sha256(buffer), preview.sha256, `${id}: preview hash mismatch`);
      checked += 1;
    }
  }
  assert.ok(checked >= 344);
});

test('sampled previews decode with real alpha, centring and object coverage', () => {
  const byCategory = new Map();
  for (const [id, record] of Object.entries(manifest.items)) {
    const list = byCategory.get(record.category) ?? [];
    if (list.length < 4) list.push(id);
    byCategory.set(record.category, list);
  }
  const sample = [...byCategory.values()].flat();
  assert.ok(sample.length >= 30, `expected a broad sample, got ${sample.length}`);
  for (const id of sample) {
    const preview = manifest.items[id].previews[0];
    const buffer = fs.readFileSync(path.join(root, 'public', preview.path.replace(/^\//, '')));
    const inspection = inspectPreview(buffer, { size: 512 });
    assert.ok(inspection.ok, `${id}: ${inspection.reason}`);
    assert.ok(inspection.coverage > 0.01, `${id}: barely any object pixels`);
    assert.ok(inspection.antialiasedPixels > 0, `${id}: not antialiased`);
  }
});

test('every colour variant has its own render from the same model', () => {
  let variants = 0;
  for (const item of catalog.EXPANSION_ITEMS) {
    const record = manifest.items[item.id];
    assert.equal(
      record.previews.length,
      item.colors.length,
      `${item.id} should render one image per colour variant`
    );
    const paths = new Set(record.previews.map((preview) => preview.path));
    assert.equal(paths.size, record.previews.length, `${item.id} reuses a variant image`);
    record.previews.forEach((preview, index) => {
      assert.equal(preview.color, item.colors[index].hex, `${item.id} variant ${index} colour mismatch`);
      variants += 1;
    });
  }
  assert.ok(variants >= 1000, `expected per-variant renders, got ${variants}`);
});

test('server prices and shop mirror the shared catalog exactly', () => {
  for (const item of catalog.EXPANSION_ITEMS) {
    assert.equal(
      economy.FURNITURE_PRICES[item.id],
      item.price,
      `${item.id} price differs between catalog and server`
    );
    assert.ok(economy.isKnownFurniture(item.id), `${item.id} is not placeable server-side`);
    const shop = economy.FURNITURE_SHOP.find((entry) => entry.id === item.id);
    assert.ok(shop, `${item.id} missing from the shop`);
    assert.equal(shop.currency, item.currency);
    assert.equal(shop.preview, `/${item.previewBase}.png`);
    assert.equal(shop.label, item.name);
  }
});

test('categories and themed collections cover the requested expansion', () => {
  const counts = new Map();
  for (const item of catalog.EXPANSION_ITEMS) {
    counts.set(item.category, (counts.get(item.category) ?? 0) + 1);
  }
  for (const category of ['structure', 'living', 'commercial', 'nightlife', 'specialty', 'events', 'outdoor', 'vehicles', 'decor']) {
    assert.ok((counts.get(category) ?? 0) >= 6, `category ${category} is too thin (${counts.get(category) ?? 0})`);
  }
  const requiredCollections = [
    'modern_home',
    'luxury_home',
    'industrial_loft',
    'contemporary_apartment',
    'traditional_home',
    'restaurant',
    'coffee_shop',
    'sports_bar',
    'nightclub',
    'hookah_lounge',
    'cannabis_lounge',
    'concert_venue',
    'wedding_venue',
    'corporate_office',
    'retail_store',
    'hotel',
    'outdoor_entertainment',
    'garden_patio',
  ];
  for (const id of requiredCollections) {
    const items = catalog.itemsInCollection(id);
    assert.ok(items.length >= 2, `collection ${id} has only ${items.length} pieces`);
  }
});

test('no catalog record falls back to a missing or invented preview', () => {
  for (const item of catalog.EXPANSION_ITEMS) {
    assert.equal(item.availability, 'available');
    assert.ok(item.previewBase.startsWith('catalog-previews/'));
    const record = manifest.items[item.id];
    assert.ok(record.previews.every((preview) => preview.path.startsWith(`/${item.previewBase}`)));
  }
});
