-- Platform shell: account preferences and per-conversation read markers.
CREATE TABLE IF NOT EXISTS ll_account_settings (
  user_id TEXT PRIMARY KEY REFERENCES ll_accounts(id) ON DELETE CASCADE,
  data_json TEXT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS ll_dm_reads (
  user_id TEXT NOT NULL REFERENCES ll_accounts(id) ON DELETE CASCADE,
  peer_id TEXT NOT NULL REFERENCES ll_accounts(id) ON DELETE CASCADE,
  last_read_at BIGINT NOT NULL,
  PRIMARY KEY (user_id, peer_id)
);

INSERT INTO ll_schema_migrations(version) VALUES ('0004_platform') ON CONFLICT (version) DO NOTHING;
