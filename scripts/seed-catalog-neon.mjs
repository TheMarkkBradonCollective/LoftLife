#!/usr/bin/env node
/**
 * Apply the catalog schema and generated seed to the Neon database.
 *
 * Usage:
 *   DATABASE_URL=postgres://... node scripts/seed-catalog-neon.mjs --apply
 *
 * Without `--apply` this is a dry run that reports exactly what it would do.
 * The seed uses `on conflict (id) do update`, so running it repeatedly never
 * duplicates catalog rows and never touches wallets, inventory or purchases.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const migration = path.join(root, 'migrations', '0009_catalog_expansion.sql');
const seed = path.join(root, 'migrations', 'catalog-seed.generated.sql');
const apply = process.argv.includes('--apply');

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error(
    'BLOCKED: DATABASE_URL is not set.\n' +
      'Set it to the Neon pooled connection string for the target database, then re-run.\n' +
      'Nothing was written. Catalog schema: migrations/0009_catalog_expansion.sql; seed: migrations/catalog-seed.generated.sql.'
  );
  process.exit(2);
}

const schemaSql = fs.readFileSync(migration, 'utf8');
const seedSql = fs.readFileSync(seed, 'utf8');
const rows = (seedSql.match(/^  \(/gm) ?? []).length;

if (!apply) {
  console.log(`Dry run: would apply 1 migration and ${rows} catalog rows.`);
  console.log('Re-run with --apply to write to Neon.');
  process.exit(0);
}

const { neon } = await import('@neondatabase/serverless').catch(() => ({ neon: null }));
const sql = typeof neon === 'function' ? neon(databaseUrl) : null;

if (!sql) {
  console.error('BLOCKED: @neondatabase/serverless is not installed. Run npm ci first.');
  process.exit(2);
}

// The HTTP driver runs one statement per call. Both files are written to be
// idempotent (CREATE ... IF NOT EXISTS, upsert on the catalog primary key), so
// a retry after a mid-way failure is safe.
const statements = (text) =>
  text
    .split(/;\s*\n/)
    .map((part) => part.trim())
    .filter((part) => part && !/^(begin|commit)$/i.test(part));

try {
  for (const statement of statements(schemaSql)) await sql(statement);
  console.log('Schema applied.');
  let applied = 0;
  for (const statement of statements(seedSql)) {
    await sql(statement);
    applied += 1;
  }
  console.log(`Applied ${applied} seed statement(s) covering ${rows} catalog rows.`);
} catch (error) {
  console.error(`FAILED: ${error.message}`);
  console.error('Re-run once the error is fixed; upserts make a retry idempotent.');
  process.exit(1);
}
