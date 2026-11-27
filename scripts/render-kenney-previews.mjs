#!/usr/bin/env node
/**
 * Render transparent catalog previews for every imported Kenney model.
 *
 * Each PNG is produced from the exact GLB the game loads, with the same
 * LoftLife material-role styling applied at runtime. The manifest binds
 * item id → GLB hash → image hash so a preview can never drift from its asset.
 *
 * Usage:
 *   node scripts/render-kenney-previews.mjs [--force] [--only=prefix]
 *        [--category=living] [--kit=furniture] [--limit=20] [--validate-only]
 */
import { build as esbuild } from 'esbuild';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodePng, inspectPreview } from './lib/png.mjs';
import { renderObjectToRgba } from './lib/raster.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const cacheDir = path.join(root, '.cache');
const outDir = path.join(root, 'public', 'catalog-previews');
const manifestPath = path.join(root, 'shared', 'catalog', 'kenney-preview-manifest.json');
const SIZE = 512;
const KIT_VERSION = 1;

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name, fallback = null) => {
  const hit = args.find((arg) => arg.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const force = flag('force');
const validateOnly = flag('validate-only');
const only = option('only');
const category = option('category');
const kit = option('kit');
const limit = option('limit') ? Number(option('limit')) : Infinity;

const sha256 = (data) => createHash('sha256').update(data).digest('hex');

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

function angleFor(item) {
  const name = item.asset.originalName ?? '';
  // Flat architectural pieces (roofs, ceilings, ground, decals) read best from
  // a high angle; a low 3/4 view can make an asymmetric piece look off-centre.
  if (/roof|ceiling|floor|ground|patch|rug|slanted|decal/i.test(name)) {
    return { yaw: -18, pitch: 58 };
  }
  if (item.layer === 'rug') return { yaw: -18, pitch: 58 };
  if (item.layer === 'wall') return { yaw: -24, pitch: 12 };
  if (item.category === 'vehicles' || item.category === 'roads') return { yaw: -122, pitch: 22 };
  if (item.category === 'buildings') return { yaw: -38, pitch: 20 };
  return { yaw: -32, pitch: 18 };
}

async function loadBuilder() {
  fs.mkdirSync(cacheDir, { recursive: true });
  const outfile = path.join(cacheDir, 'kenney-preview.mjs');
  await esbuild({
    entryPoints: [path.join(root, 'src/game/assets/kenneyPreview.ts')],
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node20',
    outfile,
    external: ['three'],
    logLevel: 'warning',
  });
  return import(`${outfile}?v=${Date.now()}`);
}

function validate(manifest) {
  const problems = [];
  for (const [id, entry] of Object.entries(manifest.items)) {
    if (entry.status !== 'rendered') {
      problems.push(`${id}: status ${entry.status}`);
      continue;
    }
    const file = path.join(root, 'public', entry.preview.path.replace(/^\//, ''));
    if (!fs.existsSync(file)) {
      problems.push(`${id}: missing ${entry.preview.path}`);
      continue;
    }
    const buffer = fs.readFileSync(file);
    if (sha256(buffer) !== entry.preview.sha256) problems.push(`${id}: image hash mismatch`);
    const inspection = inspectPreview(buffer, { size: SIZE });
    if (!inspection.ok) problems.push(`${id}: ${inspection.reason}`);
  }
  return problems;
}

async function main() {
  const manifest = loadManifest();
  manifest.version = 1;
  manifest.size = SIZE;
  manifest.kitVersion = KIT_VERSION;
  manifest.generatedBy = 'scripts/render-kenney-previews.mjs';

  if (validateOnly) {
    const problems = validate(manifest);
    if (problems.length) {
      console.error(`Kenney preview validation failed with ${problems.length} problem(s):`);
      for (const problem of problems.slice(0, 40)) console.error(`  - ${problem}`);
      process.exit(1);
    }
    console.log(`Kenney preview validation passed for ${Object.keys(manifest.items).length} models.`);
    return;
  }

  const { KENNEY_ITEMS } = await import(
    `${path.join(root, 'shared/catalog/kenney-library.mjs')}?v=${Date.now()}`
  );
  const builder = await loadBuilder();
  fs.mkdirSync(outDir, { recursive: true });
  // Drop manifest records for models removed from the catalog (for example a
  // source model later excluded as unrenderable) so the manifest and catalog
  // always describe the same set.
  const currentIds = new Set(KENNEY_ITEMS.map((item) => item.id));
  for (const id of Object.keys(manifest.items)) {
    if (!currentIds.has(id)) delete manifest.items[id];
  }

  const targets = KENNEY_ITEMS.filter((item) => {
    if (only && !item.id.startsWith(only) && !item.asset.originalName.startsWith(only)) return false;
    if (category && item.category !== category) return false;
    if (kit && item.asset.kit !== kit) return false;
    return true;
  });
  console.log(
    `Rendering ${Math.min(targets.length, limit)} of ${KENNEY_ITEMS.length} Kenney previews ` +
      `(${new Set(KENNEY_ITEMS.map((item) => item.asset.kit)).size} kits).`
  );

  const started = Date.now();
  const failures = [];
  let rendered = 0;
  let skipped = 0;
  let done = 0;

  for (const item of targets.slice(0, Number.isFinite(limit) ? limit : undefined)) {
    const glbPath = path.join(root, 'public', item.asset.path.replace(/^\//, ''));
    if (!fs.existsSync(glbPath)) {
      failures.push(`${item.id}: missing GLB ${item.asset.path}`);
      continue;
    }
    const glbHash = sha256(fs.readFileSync(glbPath));
    const signature = sha256(
      JSON.stringify({
        glbHash,
        scale: item.asset.scale,
        styleGroup: item.asset.styleGroup,
        tintRoles: item.asset.tintRoles,
        kitVersion: KIT_VERSION,
      })
    ).slice(0, 20);
    const file = path.join(outDir, `${item.id}.png`);
    const existing = manifest.items[item.id];
    if (
      !force &&
      existing?.status === 'rendered' &&
      existing.signature === signature &&
      fs.existsSync(file)
    ) {
      skipped += 1;
      continue;
    }

    let group;
    try {
      group = builder.buildKenneyPreviewGroup(item);
    } catch (error) {
      failures.push(`${item.id}: builder threw (${error instanceof Error ? error.message : error})`);
      continue;
    }
    if (!group || !group.children.length) {
      failures.push(`${item.id}: builder produced an empty model`);
      continue;
    }

    let renderedImage;
    try {
      renderedImage = renderObjectToRgba(group, { size: SIZE, supersample: 2, ...angleFor(item) });
    } catch (error) {
      failures.push(`${item.id}: render failed (${error instanceof Error ? error.message : error})`);
      continue;
    }
    const png = encodePng(SIZE, SIZE, renderedImage.rgba);
    let inspection = inspectPreview(png, { size: SIZE });
    if (!inspection.ok) {
      // Retry slightly wider for very tall buildings or long vehicles before
      // reporting the asset as unusable.
      try {
        const wider = renderObjectToRgba(group, {
          size: SIZE,
          supersample: 2,
          padding: 1.32,
          ...angleFor(item),
        });
        const retry = encodePng(SIZE, SIZE, wider.rgba);
        const retryInspection = inspectPreview(retry, { size: SIZE });
        if (retryInspection.ok) {
          fs.writeFileSync(file, retry);
          inspection = retryInspection;
          renderedImage = wider;
        }
      } catch {
        // Keep the original inspection failure below.
      }
    }
    if (!inspection.ok) {
      failures.push(`${item.id}: preview rejected (${inspection.reason})`);
      continue;
    }
    fs.writeFileSync(file, encodePng(SIZE, SIZE, renderedImage.rgba));
    manifest.items[item.id] = {
      itemId: item.id,
      name: item.name,
      category: item.category,
      kit: item.asset.kit,
      styleGroup: item.asset.styleGroup,
      glb: item.asset.path,
      glbHash,
      signature,
      kitVersion: KIT_VERSION,
      triangles: item.asset.triangles,
      status: 'rendered',
      preview: {
        path: `/catalog-previews/${item.id}.png`,
        sha256: sha256(fs.readFileSync(file)),
        coverage: inspection.coverage,
        bounds: inspection.bounds,
      },
    };
    rendered += 1;
    done += 1;
    if (done % 40 === 0) {
      fs.writeFileSync(manifestPath, `${JSON.stringify(manifest)}\n`);
      const rate = done / ((Date.now() - started) / 1000);
      console.log(`  … ${rendered} rendered, ${skipped} current, ${failures.length} failure(s), ${rate.toFixed(1)}/s`);
    }
  }

  manifest.updatedAt = new Date().toISOString();
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest)}\n`);
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  console.log(
    `Done in ${seconds}s: ${rendered} rendered, ${skipped} already current, ${failures.length} failure(s).`
  );
  if (failures.length) {
    for (const failure of failures.slice(0, 40)) console.error(`  - ${failure}`);
    process.exit(1);
  }
  if (!only && !category && !kit && Number.isFinite(limit) === false) {
    const problems = validate(manifest);
    if (problems.length) {
      console.error(`Post-render validation found ${problems.length} problem(s):`);
      for (const problem of problems.slice(0, 40)) console.error(`  - ${problem}`);
      process.exit(1);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
