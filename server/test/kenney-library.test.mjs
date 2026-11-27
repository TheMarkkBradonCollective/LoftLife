/**
 * LoftLife × Kenney asset library acceptance checks.
 *
 * These prove that the imported library is real and internally consistent:
 * every catalog record points at a shipped GLB, every GLB parses and has
 * measurable geometry, every preview is the 512px transparent render of that
 * GLB (matching its recorded hash), prices and shop records agree, replacements
 * are complete and withheld from the additive catalog, and no weapon or
 * gambling content slipped through.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { inspectPreview } from '../../scripts/lib/png.mjs';
import { parseGlbFile, boundsSize } from '../../shared/kenney/glb.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const sha256 = (data) => createHash('sha256').update(data).digest('hex');

const lib = await import('../../shared/catalog/kenney-library.mjs');
const replacements = await import('../../shared/catalog/kenney-replacements.mjs');
const expansion = await import('../../shared/catalog/expansion.mjs');
const economy = await import('../economy.mjs');

const manifest = JSON.parse(
  fs.readFileSync(path.join(root, 'shared/catalog/kenney-preview-manifest.json'), 'utf8')
);
const ITEMS = lib.KENNEY_ITEMS;
const ids = new Set(ITEMS.map((item) => item.id));

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

test('the imported library is broad, unique and documented', () => {
  assert.ok(ITEMS.length >= 1600, `expected the full relevant library, got ${ITEMS.length}`);
  assert.equal(ids.size, ITEMS.length, 'duplicate catalog ids');
  const kits = new Set(ITEMS.map((item) => item.asset.kit));
  assert.equal(kits.size, 21, `expected 21 kits, got ${kits.size}`);
  assert.equal(lib.KENNEY_SUMMARY.importedModels, ITEMS.length);
  assert.ok(lib.KENNEY_SUMMARY.kitsProcessed >= 21);
  assert.ok(lib.KENNEY_SUMMARY.excludedKits.length >= 20, 'excluded kits must be recorded');
  assert.equal(lib.KENNEY_SOURCE.license, 'CC0-1.0');
  for (const item of ITEMS) {
    assert.equal(item.asset.license, 'CC0-1.0', `${item.id} license`);
    assert.equal(item.asset.source, 'Kenney', `${item.id} source`);
    assert.ok(item.asset.sourceUrl.startsWith('https://github.com/shorepine/kenney'), `${item.id} provenance`);
    assert.ok(item.tags.includes('kenney'), `${item.id} search tags`);
    assert.ok(item.price > 0, `${item.id} price`);
    assert.ok(item.colors.length > 0 && item.defaultColor, `${item.id} colours`);
  }
});

test('weapons and gambling are excluded from every imported model', () => {
  const forbidden = /(^|[-_])(weapon|gun|rifle|pistol|sword|gambling|casino|slot|poker|roulette)([-_]|$)/i;
  for (const item of ITEMS) {
    assert.ok(!forbidden.test(item.asset.originalName), `${item.id} is weapon/gambling content`);
    assert.ok(!forbidden.test(item.id), `${item.id} id is weapon/gambling content`);
  }
  const summary = JSON.stringify(lib.KENNEY_SUMMARY.excludedModelDetails);
  assert.match(summary, /gambling-machine/);
  assert.match(summary, /weapon-arrow/);
});

test('every catalog entry points at a real, parseable GLB with real dimensions', () => {
  let triangles = 0;
  for (const item of ITEMS) {
    const file = path.join(root, 'public', item.asset.path.replace(/^\//, ''));
    assert.ok(fs.existsSync(file), `${item.id} missing GLB ${item.asset.path}`);
    const parsed = parseGlbFile(file, fs);
    const size = boundsSize(parsed.bounds);
    assert.ok(size.every((value) => Number.isFinite(value) && value >= 0), `${item.id} invalid bounds`);
    assert.ok(Math.max(...size) > 0, `${item.id} has no measurable extent`);
    assert.ok(parsed.triangles > 0, `${item.id} has no triangles`);
    assert.equal(item.asset.triangles, parsed.triangles, `${item.id} triangle count drifted`);
    assert.ok(item.size[0] >= 1 && item.size[1] >= 1, `${item.id} footprint`);
    triangles += parsed.triangles;
  }
  assert.ok(triangles > 100000, 'library should contain substantial geometry');
});

test('textures referenced by models are shipped beside them', () => {
  const checked = new Set();
  let referenced = 0;
  for (const item of ITEMS) {
    for (const texture of item.asset.textures) {
      referenced += 1;
      const key = `${item.asset.kit}/${texture}`;
      if (checked.has(key)) continue;
      checked.add(key);
      const file = path.join(root, 'public/models/kenney', key);
      assert.ok(fs.existsSync(file), `${item.id} texture missing: ${key}`);
      const header = readPngHeader(fs.readFileSync(file));
      assert.ok(header && header.width > 0, `${item.id} texture is not a PNG: ${key}`);
    }
  }
  assert.ok(referenced > 0, 'expected textured kits to reference textures');
  assert.ok(checked.size >= 15, `expected shipped textures, got ${checked.size}`);
});

test('every catalog model has a preview rendered from that exact GLB', () => {
  assert.deepEqual(
    Object.keys(manifest.items).sort(),
    [...ids].sort(),
    'manifest and catalog describe different model sets'
  );
  const byCategory = new Map();
  for (const item of ITEMS) {
    const record = manifest.items[item.id];
    assert.ok(record, `${item.id} missing from preview manifest`);
    assert.equal(record.status, 'rendered', `${item.id} not rendered`);
    assert.equal(record.glb, item.asset.path, `${item.id} preview points at another GLB`);
    assert.equal(record.preview.path, item.asset.preview, `${item.id} preview path drifted`);
    const glb = fs.readFileSync(path.join(root, 'public', item.asset.path.replace(/^\//, '')));
    assert.equal(record.glbHash, sha256(glb), `${item.id} GLB hash drifted`);
    const png = fs.readFileSync(path.join(root, 'public', record.preview.path.replace(/^\//, '')));
    assert.equal(record.preview.sha256, sha256(png), `${item.id} preview hash drifted`);
    const header = readPngHeader(png);
    assert.ok(header, `${item.id} preview is not a PNG`);
    assert.equal(header.width, 512);
    assert.equal(header.height, 512);
    assert.equal(header.bitDepth, 8);
    assert.equal(header.colourType, 6, `${item.id} preview has no alpha`);
    assert.equal(header.interlace, 0);
    const list = byCategory.get(item.category) ?? [];
    if (list.length < 2) list.push(item);
    byCategory.set(item.category, list);
  }
  assert.ok(byCategory.size >= 12, `expected broad category coverage, got ${byCategory.size}`);
});

test('sampled previews decode with real transparency and object coverage', () => {
  const samples = [];
  for (const item of new Map(ITEMS.map((entry) => [entry.category, entry])).values()) {
    samples.push(item);
  }
  const seen = new Set();
  for (const item of ITEMS) {
    if (samples.length >= 48) break;
    const kit = item.asset.kit;
    if (seen.has(kit)) continue;
    seen.add(kit);
    samples.push(item);
  }
  for (const item of samples) {
    const record = manifest.items[item.id];
    const buffer = fs.readFileSync(
      path.join(root, 'public', record.preview.path.replace(/^\//, ''))
    );
    const inspection = inspectPreview(buffer, { size: 512 });
    assert.ok(inspection.ok, `${item.id}: ${inspection.reason}`);
    assert.ok(inspection.coverage > 0.01, `${item.id}: barely any visible pixels`);
  }
});

test('replacements preserve existing ids and withhold duplicate library rows', () => {
  const sourceIds = Object.values(replacements.KENNEY_REPLACEMENTS);
  assert.ok(sourceIds.length >= 40, 'expected a substantial replacement set');
  assert.equal(new Set(sourceIds).size, sourceIds.length, 'two catalog items share one imported model');
  for (const sourceId of sourceIds) {
    assert.ok(lib.KENNEY_BY_ID[sourceId], `${sourceId} replacement target does not exist`);
  }
  for (const catalogId of Object.keys(replacements.KENNEY_REPLACEMENTS)) {
    const isExpansion = Boolean(expansion.EXPANSION_BY_ID[catalogId]);
    const isLegacy = [
      'plush_sofa', 'lounge_chair', 'bar_stool', 'cozy_bed', 'coffee_table', 'side_desk',
      'bookshelf', 'arc_lamp', 'table_lamp', 'monstera_plant', 'woven_rug', 'sectional_sofa',
      'dining_set', 'olive_tree',
    ].includes(catalogId);
    assert.ok(isExpansion || isLegacy, `${catalogId} is not an existing catalog id`);
  }
  for (const sourceId of sourceIds) {
    assert.ok(!economy.isKnownFurniture(sourceId), `${sourceId} must not be sold twice`);
  }
});

test('server prices and shop expose the imported library exactly once', () => {
  for (const item of ITEMS) {
    if (replacements.REPLACED_KENNEY_IDS.has(item.id)) continue;
    assert.equal(economy.FURNITURE_PRICES[item.id], item.price, `${item.id} price drift`);
    assert.ok(economy.isKnownFurniture(item.id), `${item.id} not placeable server-side`);
    const shop = economy.FURNITURE_SHOP.filter((entry) => entry.id === item.id);
    assert.equal(shop.length, 1, `${item.id} shop duplication`);
    assert.equal(shop[0].label, item.name);
    assert.equal(shop[0].category, item.category);
    assert.equal(shop[0].preview, item.asset.preview);
  }
  const allShopIds = economy.FURNITURE_SHOP.map((entry) => entry.id);
  assert.equal(new Set(allShopIds).size, allShopIds.length, 'shop contains duplicate ids');
});

test('R2 keys mirror the local asset layout for development and production', () => {
  for (const item of ITEMS) {
    assert.equal(item.asset.r2Key, `catalog/v1${item.asset.path}`);
    assert.equal(item.asset.previewR2Key, `catalog/v1${item.asset.preview}`);
  }
});
