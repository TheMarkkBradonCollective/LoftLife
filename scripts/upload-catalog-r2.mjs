#!/usr/bin/env node
/**
 * Upload the rendered catalog previews to Cloudflare R2 with versioned keys.
 *
 * Usage:
 *   CATALOG_R2_BUCKET=loftlife-assets node scripts/upload-catalog-r2.mjs [--dry-run] [--limit=N]
 *
 * Key layout (stable and content-addressable by kit version):
 *   catalog/v1/<category>/<id>[ -variant].png
 *   catalog/v1/manifest/preview-manifest.json
 *
 * Auth is Wrangler's: CLOUDFLARE_API_TOKEN with R2 write access (and
 * CLOUDFLARE_ACCOUNT_ID when the token can see several accounts).
 */
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const manifest = JSON.parse(
  fs.readFileSync(path.join(root, 'shared', 'catalog', 'preview-manifest.json'), 'utf8')
);
const dryRun = process.argv.includes('--dry-run');
const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
const limit = limitArg ? Number(limitArg.split('=')[1]) : Infinity;
const bucket = process.env.CATALOG_R2_BUCKET;

if (!bucket) {
  console.error(
    'BLOCKED: CATALOG_R2_BUCKET is not set (for example loftlife-assets).\n' +
      'Also required: CLOUDFLARE_API_TOKEN with R2 write access, and CLOUDFLARE_ACCOUNT_ID if the token spans accounts.\n' +
      'Nothing was uploaded.'
  );
  process.exit(2);
}

const files = [];
for (const [id, record] of Object.entries(manifest.items)) {
  const category = record.category ?? 'misc';
  for (const preview of record.previews) {
    files.push({
      local: path.join(root, 'public', preview.path.replace(/^\//, '')),
      key: `catalog/v1/${category}/${path.basename(preview.path)}`,
      hash: preview.sha256,
    });
  }
}
files.push({
  local: path.join(root, 'shared', 'catalog', 'preview-manifest.json'),
  key: 'catalog/v1/manifest/preview-manifest.json',
});

const todo = files.slice(0, Number.isFinite(limit) ? limit : files.length);
console.log(
  `${dryRun ? 'Dry run' : 'Upload'}: ${todo.length}/${files.length} objects to r2://${bucket}/catalog/v1/`
);
if (dryRun) {
  for (const file of todo.slice(0, 5)) console.log(`  ${file.key}  (${path.basename(file.local)})`);
  console.log('Re-run without --dry-run (and with credentials) to upload.');
  process.exit(0);
}
if (!process.env.CLOUDFLARE_API_TOKEN) {
  console.error('BLOCKED: CLOUDFLARE_API_TOKEN is not set. Nothing was uploaded.');
  process.exit(2);
}

let uploaded = 0;
for (const file of todo) {
  if (!fs.existsSync(file.local)) {
    console.error(`MISSING local preview: ${file.local}`);
    process.exitCode = 1;
    continue;
  }
  try {
    await run(
      'npx',
      [
        'wrangler',
        'r2',
        'object',
        'put',
        `${bucket}/${file.key}`,
        '--file',
        file.local,
        '--content-type',
        file.key.endsWith('.json') ? 'application/json' : 'image/png',
        '--cache-control',
        'public, max-age=31536000, immutable',
      ],
      { cwd: root, maxBuffer: 8 * 1024 * 1024 }
    );
    uploaded += 1;
    if (uploaded % 50 === 0) console.log(`  uploaded ${uploaded}/${todo.length}`);
  } catch (error) {
    console.error(`FAILED ${file.key}: ${String(error.stderr ?? error.message).slice(0, 400)}`);
    process.exitCode = 1;
  }
}
console.log(`Uploaded ${uploaded}/${todo.length} objects to r2://${bucket}/catalog/v1/`);
