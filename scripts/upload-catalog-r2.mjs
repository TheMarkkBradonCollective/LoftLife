#!/usr/bin/env node
/**
 * Upload the complete LoftLife asset set to Cloudflare R2.
 *
 * Versioned layout:
 *   catalog/v1/catalog-previews/<file>.png
 *   catalog/v1/models/kenney/<kit>/<file>.glb
 *   catalog/v1/models/charactercreator/<file>.glb
 *   catalog/v1/manifest/<manifest>.json
 *
 * Set VITE_ASSET_BASE_URL to the public R2/CDN root ending in /catalog/v1.
 */
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const dryRun = process.argv.includes('--dry-run');
const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
const limit = limitArg ? Number(limitArg.split('=')[1]) : Infinity;
const bucket = process.env.CATALOG_R2_BUCKET;

if (!bucket) {
  console.error(
    'BLOCKED: CATALOG_R2_BUCKET is not set (for example loftlife-assets).\\n' +
      'Also required: CLOUDFLARE_API_TOKEN with R2 write access, and CLOUDFLARE_ACCOUNT_ID if the token spans accounts.\\n' +
      'Nothing was uploaded.'
  );
  process.exit(2);
}

const contentType = (file) => {
  if (file.endsWith('.glb')) return 'model/gltf-binary';
  if (file.endsWith('.png')) return 'image/png';
  if (file.endsWith('.json')) return 'application/json';
  if (file.endsWith('.md')) return 'text/markdown; charset=utf-8';
  if (file.endsWith('.txt')) return 'text/plain; charset=utf-8';
  return 'application/octet-stream';
};

const files = [];
const addTree = (directory, keyPrefix) => {
  if (!fs.existsSync(directory)) return;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) addTree(absolute, `${keyPrefix}/${entry.name}`);
    else if (entry.isFile()) {
      files.push({
        local: absolute,
        key: `${keyPrefix}/${entry.name}`,
        type: contentType(entry.name),
      });
    }
  }
};

addTree(path.join(root, 'public', 'catalog-previews'), 'catalog/v1/catalog-previews');
addTree(path.join(root, 'public', 'models', 'kenney'), 'catalog/v1/models/kenney');
addTree(path.join(root, 'public', 'models', 'charactercreator'), 'catalog/v1/models/charactercreator');
for (const manifest of ['preview-manifest.json', 'kenney-preview-manifest.json']) {
  const local = path.join(root, 'shared', 'catalog', manifest);
  if (fs.existsSync(local)) {
    files.push({ local, key: `catalog/v1/manifest/${manifest}`, type: 'application/json' });
  }
}

const todo = files.slice(0, Number.isFinite(limit) ? limit : files.length);
const models = todo.filter((file) => file.key.endsWith('.glb')).length;
console.log(
  `${dryRun ? 'Dry run' : 'Upload'}: ${todo.length}/${files.length} objects ` +
    `(${models} GLB models) to r2://${bucket}/catalog/v1/`
);
if (dryRun) {
  for (const file of todo.slice(0, 12)) console.log(`  ${file.key}  (${path.basename(file.local)})`);
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
    console.error(`MISSING local asset: ${file.local}`);
    process.exitCode = 1;
    continue;
  }
  try {
    await run(
      'npx',
      [
        'wrangler', 'r2', 'object', 'put', `${bucket}/${file.key}`,
        '--file', file.local,
        '--content-type', file.type,
        '--cache-control', 'public, max-age=31536000, immutable',
      ],
      { cwd: root, maxBuffer: 8 * 1024 * 1024 }
    );
    uploaded += 1;
    if (uploaded % 100 === 0) console.log(`  uploaded ${uploaded}/${todo.length}`);
  } catch (error) {
    console.error(`FAILED ${file.key}: ${String(error.stderr ?? error.message).slice(0, 400)}`);
    process.exitCode = 1;
  }
}
console.log(`Uploaded ${uploaded}/${todo.length} objects to r2://${bucket}/catalog/v1/`);
