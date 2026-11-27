-- Account-synced saved outfits. Foundational makeovers are recorded in the
-- existing ledger under reason 'character_makeover', so no extra table is
-- required for them.
CREATE TABLE IF NOT EXISTS ll_outfits (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES ll_accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  config_json TEXT NOT NULL,
  created_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS ll_outfits_user ON ll_outfits(user_id, created_at DESC);
INSERT INTO ll_schema_migrations(version) VALUES ('0009_character_customization')
  ON CONFLICT (version) DO NOTHING;
