-- Player-created city building: foundations, plots, saved revisions and the
-- staff-only official Main City workspace.
ALTER TABLE ll_worlds ADD COLUMN IF NOT EXISTS foundation TEXT NOT NULL DEFAULT 'TG-MapDefault';
ALTER TABLE ll_worlds ADD COLUMN IF NOT EXISTS layout_json TEXT;
ALTER TABLE ll_worlds ADD COLUMN IF NOT EXISTS published_layout_json TEXT;
ALTER TABLE ll_worlds ADD COLUMN IF NOT EXISTS settings_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE ll_worlds ADD COLUMN IF NOT EXISTS layout_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ll_worlds ADD COLUMN IF NOT EXISTS published_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ll_worlds ADD COLUMN IF NOT EXISTS undo_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE ll_worlds ADD COLUMN IF NOT EXISTS redo_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE ll_worlds ADD COLUMN IF NOT EXISTS is_official BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS ll_world_plots (
  id           TEXT PRIMARY KEY,
  world_id     TEXT NOT NULL REFERENCES ll_worlds(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  x            INTEGER NOT NULL,
  z            INTEGER NOT NULL,
  w            INTEGER NOT NULL,
  d            INTEGER NOT NULL,
  status       TEXT NOT NULL DEFAULT 'available'
               CHECK (status IN ('available','requested','approved','denied')),
  requested_by TEXT,
  assigned_to  TEXT,
  created_at   BIGINT NOT NULL,
  updated_at   BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS ll_world_plots_world ON ll_world_plots(world_id);

CREATE TABLE IF NOT EXISTS ll_world_snapshots (
  id          TEXT PRIMARY KEY,
  world_id    TEXT NOT NULL REFERENCES ll_worlds(id) ON DELETE CASCADE,
  revision    INTEGER NOT NULL,
  actor_id    TEXT,
  action      TEXT NOT NULL,
  detail      TEXT NOT NULL DEFAULT '',
  layout_json TEXT NOT NULL,
  created_at  BIGINT NOT NULL,
  UNIQUE (world_id, revision)
);

CREATE INDEX IF NOT EXISTS ll_world_snapshots_world ON ll_world_snapshots(world_id, revision DESC);

INSERT INTO ll_schema_migrations(version) VALUES ('0008_world_building') ON CONFLICT (version) DO NOTHING;
