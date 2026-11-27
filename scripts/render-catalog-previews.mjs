#!/usr/bin/env node
/**
 * Catalog preview pipeline.
 *
 * For every catalog item — the original collection and the expanded one — this
 * script:
 *   1. reads the item's catalog record and model reference,
 *   2. builds the exact model the game builds (bundled from src/game),
 *   3. applies each colour variant's real materials,
 *   4. frames it in the same product-shot camera and lighting,
 *   5. renders at 512×512 with a transparent background,
 *   6. writes the PNG under public/catalog-previews/,
 *   7. records a manifest entry linking item id → model signature → image hash,
 *   8. re-reads every PNG to verify alpha, centring and coverage.
 *
 * Usage:
 *   node scripts/render-catalog-previews.mjs                 # all items, incremental
 *   node scripts/render-catalog-previews.mjs --force         # re-render everything
 *   node scripts/render-catalog-previews.mjs --category=structure
 *   node scripts/render-catalog-previews.mjs --only=wall_
 *   node scripts/render-catalog-previews.mjs --no-variants
 *   node scripts/render-catalog-previews.mjs --validate-only
 */
import { build as esbuild } from 'esbuild';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { installCanvasStub } from './lib/dom-stub.mjs';
import { encodePng, inspectPreview } from './lib/png.mjs';
import { renderObjectToRgba } from './lib/raster.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const cacheDir = path.join(root, '.cache');
const outDir = path.join(root, 'public', 'catalog-previews');
const manifestPath = path.join(root, 'shared', 'catalog', 'preview-manifest.json');

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name, fallback = null) => {
  const hit = args.find((arg) => arg.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const force = flag('force');
const validateOnly = flag('validate-only');
const skipVariants = flag('no-variants');
const categoryFilter = option('category');
const idPrefix = option('only');
const limit = option('limit') ? Number(option('limit')) : Infinity;

const sha256 = (data) => createHash('sha256').update(data).digest('hex');

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

function modelSignature(entry) {
  return sha256(
    stableStringify({
      kind: entry.kind,
      params: entry.params ?? {},
      kitVersion: entry.kitVersion,
    })
  ).slice(0, 20);
}

function geometryStats(object) {
  let triangles = 0;
  let meshes = 0;
  const box = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
  object.updateMatrixWorld(true);
  object.traverse((node) => {
    if (!node.isMesh || !node.geometry) return;
    const geometry = node.geometry;
    const position = geometry.attributes?.position;
    if (position) {
      triangles += (geometry.index ? geometry.index.count : position.count) / 3;
      meshes += 1;
      const p = { x: 0, y: 0, z: 0 };
      for (let i = 0; i < position.count; i += Math.max(1, Math.floor(position.count / 24))) {
        p.x = position.getX(i);
        p.y = position.getY(i);
        p.z = position.getZ(i);
        // Approximate world bounds from the local position and the node matrix.
        const world = node.matrixWorld.elements;
        const wx = world[0] * p.x + world[4] * p.y + world[8] * p.z + world[12];
        const wy = world[1] * p.x + world[5] * p.y + world[9] * p.z + world[13];
        const wz = world[2] * p.x + world[6] * p.y + world[10] * p.z + world[14];
        box.min[0] = Math.min(box.min[0], wx);
        box.min[1] = Math.min(box.min[1], wy);
        box.min[2] = Math.min(box.min[2], wz);
        box.max[0] = Math.max(box.max[0], wx);
        box.max[1] = Math.max(box.max[1], wy);
        box.max[2] = Math.max(box.max[2], wz);
      }
    }
  });
  const round = (n) => (Number.isFinite(n) ? Number(n.toFixed(3)) : null);
  return {
    triangles: Math.round(triangles),
    meshes,
    bounds: {
      min: box.min.map(round),
      max: box.max.map(round),
    },
  };
}

function angleForLegacy(item) {
  const kind = item.model?.kind;
  if (kind === 'rug' || item.layer === 'rug' || item.walkable) return { yaw: -18, pitch: 58 };
  if (item.layer === 'wall') return { yaw: -24, pitch: 12 };
  return { yaw: -32, pitch: 18 };
}

async function loadPreviewBundle() {
  fs.mkdirSync(cacheDir, { recursive: true });
  const outfile = path.join(cacheDir, 'preview-entry.mjs');
  await esbuild({
    entryPoints: [path.join(root, 'src/game/previewEntry.ts')],
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node20',
    outfile,
    external: ['three'],
    logLevel: 'warning',
  });
  installCanvasStub();
  const mod = await import(`${outfile}?v=${Date.now()}`);
  return mod;
}

function loadManifest() {
  if (!fs.existsSync(manifestPath)) return { version: 1, items: {} };
  try {
    const parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (!parsed.items) parsed.items = {};
    return parsed;
  } catch {
    return { version: 1, items: {} };
  }
}

function validateManifest(manifest) {
  const problems = [];
  for (const [id, entry] of Object.entries(manifest.items)) {
    if (entry.status !== 'rendered') {
      problems.push(`${id}: status ${entry.status}`);
      continue;
    }
    if (!entry.previews?.length) problems.push(`${id}: no previews recorded`);
    for (const preview of entry.previews ?? []) {
      const file = path.join(root, 'public', preview.path.replace(/^\//, ''));
      if (!fs.existsSync(file)) {
        problems.push(`${id}: missing file ${preview.path}`);
        continue;
      }
      const buffer = fs.readFileSync(file);
      if (sha256(buffer) !== preview.sha256) {
        problems.push(`${id}: ${preview.path} hash does not match manifest`);
      }
      const inspection = inspectPreview(buffer, { size: 512 });
      if (!inspection.ok) problems.push(`${id}: ${preview.path} invalid (${inspection.reason})`);
    }
  }
  return problems;
}

async function main() {
  const manifest = loadManifest();
  manifest.version = 1;
  manifest.size = 512;
  manifest.generatedBy = 'scripts/render-catalog-previews.mjs';

  if (validateOnly) {
    const problems = validateManifest(manifest);
    if (problems.length) {
      console.error(`Preview validation failed with ${problems.length} problem(s):`);
      for (const problem of problems.slice(0, 40)) console.error(`  - ${problem}`);
      process.exit(1);
    }
    console.log(`Preview validation passed for ${Object.keys(manifest.items).length} items.`);
    return;
  }

  const mod = await loadPreviewBundle();
  const kitVersion = mod.MODEL_KIT_VERSION;
  manifest.kitVersion = kitVersion;
  fs.mkdirSync(outDir, { recursive: true });

  const catalog = mod.FURNITURE_CATALOG;
  const targets = catalog.filter((item) => {
    if (categoryFilter && item.category !== categoryFilter) return false;
    if (idPrefix && !item.id.startsWith(idPrefix)) return false;
    return true;
  });
  console.log(
    `Rendering previews for ${Math.min(targets.length, limit)} of ${catalog.length} catalog items ` +
      `(${catalog.length - mod.EXPANSION_CATALOG.length} original, ${mod.EXPANSION_CATALOG.length} expanded).`
  );

  const failures = [];
  let rendered = 0;
  let skipped = 0;
  let images = 0;
  const started = Date.now();

  for (const item of targets.slice(0, Number.isFinite(limit) ? limit : undefined)) {
    const isExpansion = Boolean(item.model?.kind);
    const kind = item.model?.kind ?? `legacy:${item.id}`;
    const params = item.model?.params ?? {};
    const baseEntry = {
      kind,
      params,
      kitVersion,
    };
    const signature = modelSignature(baseEntry);

    if (!force) {
      const existing = manifest.items[item.id];
      if (
        existing?.status === 'rendered' &&
        existing.signature === signature &&
        (existing.previews ?? []).every((preview) =>
          fs.existsSync(path.join(root, 'public', preview.path.replace(/^\//, '')))
        )
      ) {
        skipped += 1;
        continue;
      }
    }

    if (isExpansion && !mod.hasModelKind(kind)) {
      manifest.items[item.id] = {
        itemId: item.id,
        modelKind: kind,
        status: 'missing-model',
        signature,
      };
      failures.push(`${item.id}: model kind "${kind}" is not registered`);
      continue;
    }

    const variants = skipVariants ? [0] : item.colors.map((_colour, index) => index);
    const previews = [];
    let triangles = 0;
    let bounds = null;

    for (const index of variants) {
      const colour = item.colors[index]?.hex ?? item.defaultColor;
      let group;
      try {
        if (isExpansion) {
          group = mod.buildCatalogModel(item, { color: colour, active: true });
        } else {
          group = mod.buildFurnitureGroup(
            { uid: 'preview', catalogId: item.id, gx: 0, gz: 0, rot: 0, color: colour, active: true },
            { maxAnisotropy: 4 }
          );
        }
      } catch (error) {
        failures.push(`${item.id}: builder threw (${error instanceof Error ? error.message : error})`);
        break;
      }
      if (!group || group.children.length === 0) {
        failures.push(`${item.id}: builder produced an empty model`);
        break;
      }

      const stats = geometryStats(group);
      triangles = stats.triangles;
      bounds = stats.bounds;
      const angle = isExpansion ? mod.previewAngleFor(item) : angleForLegacy(item);
      const renderedImage = renderObjectToRgba(group, { size: 512, supersample: 2, ...angle });
      if (!renderedImage.triangles) {
        failures.push(`${item.id}: rendered no triangles`);
        break;
      }
      const png = encodePng(renderedImage.width, renderedImage.height, renderedImage.rgba);
      const inspection = inspectPreview(png, { size: 512 });
      if (!inspection.ok) {
        failures.push(`${item.id}: preview rejected (${inspection.reason})`);
        break;
      }
      const filename = index === 0 ? `${item.id}.png` : `${item.id}-${index}.png`;
      const relative = `/catalog-previews/${filename}`;
      fs.writeFileSync(path.join(outDir, filename), png);
      images += 1;
      previews.push({
        colorIndex: index,
        color: colour,
        path: relative,
        sha256: sha256(png),
        coverage: inspection.coverage,
        bounds: inspection.bounds,
      });
    }

    if (previews.length === variants.length) {
      manifest.items[item.id] = {
        itemId: item.id,
        name: item.name,
        category: item.category,
        modelKind: kind,
        modelParams: params,
        signature,
        kitVersion,
        triangles,
        bounds,
        renderedAt: new Date().toISOString(),
        status: 'rendered',
        previews,
      };
      rendered += 1;
    } else {
      manifest.items[item.id] = {
        itemId: item.id,
        modelKind: kind,
        signature,
        status: 'incomplete',
        previews,
      };
    }

    if ((rendered + failures.length) % 25 === 0) {
      fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
      console.log(`  … ${rendered} items rendered, ${images} images, ${failures.length} failure(s)`);
    }
  }

  manifest.updatedAt = new Date().toISOString();
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  console.log(
    `Done in ${seconds}s: ${rendered} items rendered (${images} images), ${skipped} already current.`
  );
  if (failures.length) {
    console.error(`${failures.length} item(s) could not be completed:`);
    for (const failure of failures.slice(0, 50)) console.error(`  - ${failure}`);
    process.exit(1);
  }
  const problems = validateManifest(manifest);
  if (problems.length) {
    console.error(`Post-render validation found ${problems.length} problem(s):`);
    for (const problem of problems.slice(0, 40)) console.error(`  - ${problem}`);
    process.exit(1);
  }
  console.log(`Validated ${images} transparent previews against their models.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
