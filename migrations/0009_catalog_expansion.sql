-- Expanded asset catalog metadata.
--
-- The runtime catalog itself is shared/catalog/expansion.mjs so the browser,
-- the game API, the preview renderer and the tests read one record. This table
-- mirrors those records in Postgres for edge deployments, admin tooling and
-- reporting; it is populated from the generated seed
-- (migrations/catalog-seed.generated.sql, produced by
-- `node scripts/export-catalog-sql.mjs`), never hand-edited.

create table if not exists catalog_items (
  id text primary key,
  name text not null,
  category text not null,
  subcategory text not null,
  description text not null,
  model_kind text not null,
  model_params jsonb not null default '{}'::jsonb,
  preview_path text not null,
  preview_r2_key text,
  price integer not null check (price > 0),
  currency text not null default 'yuanzi' check (currency in ('yuanzi', 'tongbao')),
  layer text not null check (layer in ('floor', 'rug', 'wall')),
  footprint_width numeric(6, 2) not null,
  footprint_depth numeric(6, 2) not null,
  color_variants jsonb not null default '[]'::jsonb,
  themes jsonb not null default '[]'::jsonb,
  placement text not null default 'both' check (placement in ('indoor', 'outdoor', 'both')),
  availability text not null default 'available' check (availability in ('available', 'incomplete', 'retired')),
  asset_version integer not null default 1,
  updated_at timestamptz not null default now()
);

create index if not exists catalog_items_category_idx on catalog_items (category, subcategory);
create index if not exists catalog_items_availability_idx on catalog_items (availability);

-- Preview render bookkeeping: proves which model signature produced which file.
create table if not exists catalog_preview_renders (
  item_id text not null references catalog_items (id) on delete cascade,
  color_index integer not null,
  colour text not null,
  preview_path text not null,
  model_signature text not null,
  kit_version integer not null,
  image_sha256 text not null,
  triangles integer not null,
  rendered_at timestamptz not null default now(),
  primary key (item_id, color_index)
);
