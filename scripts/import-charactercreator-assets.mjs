#!/usr/bin/env node
/**
 * Import the CC0 character, visible clothing and hair GLBs from CharacterCreator.
 *
 * This downloads exported data only. It does not copy the GPL-3.0 generator code.
 * Source revision is pinned so asset changes are reviewable and reproducible.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public', 'models', 'charactercreator');
const SOURCE = 'https://raw.githubusercontent.com/kblood/CharacterCreator/852e48f316b90a0937234886630e4fb4cdfd1f78';
const OUTPUT = `${SOURCE}/output`;
const dryRun = process.argv.includes('--dry-run');

async function getJson(url) {
  const response = await fetch(url, { headers: { 'User-Agent': 'LoftLife-Asset-Importer' } });
  if (!response.ok) throw new Error(`HTTP ${response.status} fetching ${url}`);
  return response.json();
}

async function download(file) {
  const url = `${OUTPUT}/${file}`;
  const response = await fetch(url, { headers: { 'User-Agent': 'LoftLife-Asset-Importer' } });
  if (!response.ok) throw new Error(`HTTP ${response.status} fetching ${url}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length < 16) throw new Error(`Downloaded file is unexpectedly small: ${file}`);
  const destination = path.join(OUT, file);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.writeFile(destination, bytes);
  console.log(`Downloaded ${file} (${(bytes.length / 1024 / 1024).toFixed(2)} MB)`);
  return { file, bytes: bytes.length, url };
}

const clothing = await getJson(`${OUTPUT}/clothing.json`);
const hair = await getJson(`${OUTPUT}/hair.json`);
const visibleClothing = clothing.items.filter((item) => !['underwear', 'bra'].includes(item.slot));
const assets = [
  {
    id: 'charactercreator-base-body',
    name: 'CharacterCreator Base Character',
    type: 'character-body',
    file: 'base_body.glb',
    license: 'CC0-1.0',
    source: 'CharacterCreator / MakeHuman system assets',
    sourceUrl: `${OUTPUT}/base_body.glb`,
    bytes: null,
  },
  ...visibleClothing.map((item) => ({
    id: `cc-${item.id}`,
    name: item.label?.en ?? item.id,
    type: 'clothing',
    slot: item.slot,
    file: item.file,
    mesh: item.mesh,
    colors: item.colors,
    conflicts: item.conflicts ?? [],
    license: 'CC0-1.0',
    source: item.source,
    sourceUrl: `${OUTPUT}/${item.file}`,
    bytes: item.bytes ?? null,
  })),
  ...hair.styles.map((item) => ({
    id: `cc-hair-${item.id}`,
    name: item.label?.en ?? item.id,
    type: 'hair',
    file: item.file,
    mesh: item.mesh,
    license: 'CC0-1.0',
    source: item.source,
    sourceUrl: `${OUTPUT}/${item.file}`,
    bytes: item.bytes ?? null,
  })),
];

if (dryRun) {
  console.log(`Dry run: ${assets.length} assets would be downloaded to public/models/charactercreator`);
  for (const asset of assets) console.log(`  ${asset.type}: ${asset.file}`);
  process.exit(0);
}

await fs.mkdir(OUT, { recursive: true });
const downloaded = [];
for (const asset of assets) downloaded.push(await download(asset.file));

// Keep source catalogs and license evidence beside the GLBs for provenance.
for (const file of ['clothing.json', 'hair.json', 'asset_licenses.json']) {
  const response = await fetch(`${OUTPUT}/${file}`);
  if (!response.ok) throw new Error(`HTTP ${response.status} fetching ${file}`);
  await fs.writeFile(path.join(OUT, file), Buffer.from(await response.arrayBuffer()));
}
const notesResponse = await fetch(`${SOURCE}/LICENSE-NOTES.md`);
if (!notesResponse.ok) throw new Error(`HTTP ${notesResponse.status} fetching LICENSE-NOTES.md`);
await fs.writeFile(path.join(OUT, 'LICENSE-NOTES.md'), await notesResponse.text());

const manifest = {
  version: 1,
  sourceRepository: 'https://github.com/kblood/CharacterCreator',
  sourceRevision: '852e48f316b90a0937234886630e4fb4cdfd1f78',
  importedAt: new Date().toISOString(),
  creator: 'Kasper Olesen / CharacterCreator; underlying MakeHuman system assets credited in asset_licenses.json',
  license: 'CC0-1.0',
  licenseEvidence: ['LICENSE-NOTES.md', 'asset_licenses.json'],
  compatibility: {
    format: 'glTF 2.0 binary (.glb)',
    characterRig: 'MakeHuman game_engine rig, 53 bones',
    morphTargets: 92,
    note: 'Clothing and hair are skinned to the included base_body.glb rig. LoftLife runtime integration requires a compatible avatar rig adapter.',
  },
  assets: assets.map((asset) => {
    const result = downloaded.find((entry) => entry.file === asset.file);
    return { ...asset, bytes: result?.bytes ?? asset.bytes };
  }),
};
await fs.writeFile(path.join(OUT, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Imported ${downloaded.length} GLB assets and provenance files.`);
